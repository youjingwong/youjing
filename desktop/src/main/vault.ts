import { app, safeStorage } from "electron";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  defaultPresets,
  defaultSettings,
  defaultWatermark,
} from "../shared/defaults";
import type {
  ImageInfo,
  ImageSide,
  Profile,
  ProfileEditorStateUpdate,
  ProfileWithImages,
  RestoreConflict,
  VaultData,
} from "../shared/types";
import {
  assertId,
  assertString,
  validateVaultData,
} from "../shared/validation";
import { decryptBytes, deriveKey, encryptBytes, type Envelope } from "./crypto";
import { migrateVault } from "./migrations";
import {
  decodeBackup,
  encodeBackup,
  type BackupFile,
  type BackupPayload,
} from "./backup-format";

interface LockFile {
  salt: string;
  wrappedKey: Envelope;
}

export class VaultService {
  private readonly root: string;
  private readonly imagesDir: string;
  private readonly metadataPath: string;
  private readonly keyPath: string;
  private readonly lockPath: string;
  private key: Buffer | null = null;
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(root = path.join(app.getPath("userData"), "vault")) {
    this.root = path.resolve(root);
    this.imagesDir = path.join(this.root, "images");
    this.metadataPath = path.join(this.root, "vault.json");
    this.keyPath = path.join(this.root, "master.key");
    this.lockPath = path.join(this.root, "lock.json");
  }

  /**
   * Runs a complete vault operation after all previously scheduled operations.
   *
   * Most writes use a read-modify-write cycle, so allowing two IPC handlers to
   * overlap can make the later write silently discard the earlier one. Keep the
   * queue at the service boundary so compound operations such as duplication and
   * restore can remain atomic without deadlocking their internal method calls.
   */
  runExclusive<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async initialize(): Promise<void> {
    await mkdir(this.imagesDir, { recursive: true, mode: 0o700 });
    let vault: VaultData;
    if (!(await this.exists(this.metadataPath))) {
      const existingImages = (await readdir(this.imagesDir)).some((entry) =>
        entry.endsWith(".enc"),
      );
      if (
        existingImages ||
        (await this.exists(this.keyPath)) ||
        (await this.exists(this.lockPath))
      )
        throw new Error(
          "Vault metadata is missing; existing data was preserved",
        );
      vault = this.freshVault();
      await this.atomicJson(this.metadataPath, vault);
    } else {
      const raw = await this.readJson<unknown>(this.metadataPath);
      const migration = migrateVault(raw);
      vault = migration.vault;
      if (migration.migrated) {
        await this.atomicJson(`${this.metadataPath}.pre-migration`, raw);
        await this.atomicJson(this.metadataPath, migration.vault);
      }
    }
    await this.cleanupOrphanedImages(vault);
    if (
      vault.images.length > 0 &&
      !(await this.exists(this.lockPath)) &&
      !(await this.exists(this.keyPath))
    )
      throw new Error(
        "The vault encryption key is missing; data was preserved",
      );
    if (!(await this.exists(this.lockPath))) await this.loadOrCreateOsKey();
  }

  isLocked(): boolean {
    return this.key === null;
  }
  async hasPassword(): Promise<boolean> {
    return this.exists(this.lockPath);
  }

  async unlock(password: string): Promise<void> {
    if (!(await this.hasPassword())) {
      await this.loadOrCreateOsKey();
      return;
    }
    const lock = await this.readJson<LockFile>(this.lockPath);
    const derived = await deriveKey(password, Buffer.from(lock.salt, "base64"));
    this.key = decryptBytes(lock.wrappedKey, derived);
  }

  lock(): void {
    this.key?.fill(0);
    this.key = null;
  }

  async enablePassword(password: string): Promise<void> {
    assertString(password, "password", 200);
    if (password.length < 8)
      throw new Error("Password must contain at least 8 characters");
    const key = this.requireKey();
    const salt = randomBytes(16);
    const derived = await deriveKey(password, salt);
    await this.atomicJson(this.lockPath, {
      salt: salt.toString("base64"),
      wrappedKey: encryptBytes(key, derived),
    });
    await rm(this.keyPath, { force: true });
  }

  async changePassword(current: string, next: string): Promise<void> {
    await this.unlock(current);
    await this.enablePassword(next);
  }

  async disablePassword(password: string): Promise<void> {
    await this.unlock(password);
    await this.persistOsKey(this.requireKey());
    await rm(this.lockPath, { force: true });
  }

  async list(): Promise<VaultData> {
    if (this.isLocked()) throw new Error("Vault is locked");
    return this.readVault();
  }

  async createProfile(name: string, documentLabel?: string): Promise<Profile> {
    assertString(name, "profile name", 100);
    if (
      documentLabel !== undefined &&
      (typeof documentLabel !== "string" || documentLabel.length > 100)
    )
      throw new Error("Invalid document label");
    const vault = await this.readVault();
    const now = new Date().toISOString();
    const profile: Profile = {
      id: randomUUID(),
      name: name.trim(),
      documentLabel: documentLabel?.trim() || undefined,
      frontImageId: "",
      order:
        vault.profiles.reduce(
          (highest, item) => Math.max(highest, item.order),
          -1,
        ) + 1,
      createdAt: now,
      updatedAt: now,
    };
    vault.profiles.push(profile);
    await this.writeVault(vault);
    return profile;
  }

  async updateProfile(
    id: string,
    changes: { name?: string; documentLabel?: string; order?: number },
  ): Promise<Profile> {
    assertId(id);
    const vault = await this.readVault();
    const profile = vault.profiles.find((item) => item.id === id);
    if (!profile) throw new Error("Profile not found");
    if (changes.name !== undefined) {
      assertString(changes.name, "profile name", 100);
      profile.name = changes.name.trim();
    }
    if (changes.documentLabel !== undefined) {
      if (
        typeof changes.documentLabel !== "string" ||
        changes.documentLabel.length > 100
      )
        throw new Error("Invalid document label");
      profile.documentLabel = changes.documentLabel.trim() || undefined;
    }
    if (changes.order !== undefined) {
      if (
        !Number.isSafeInteger(changes.order) ||
        changes.order < 0 ||
        changes.order > 10_000
      )
        throw new Error("Invalid profile order");
      profile.order = changes.order;
    }
    profile.updatedAt = new Date().toISOString();
    await this.writeVault(vault);
    return profile;
  }

  async saveEditorState(
    id: string,
    state: ProfileEditorStateUpdate,
  ): Promise<Profile> {
    assertId(id);
    const vault = await this.readVault();
    const profile = vault.profiles.find((item) => item.id === id);
    if (!profile) throw new Error("Profile not found");
    profile.frontEditorState = structuredClone(state.front);
    if (profile.backImageId && state.back)
      profile.backEditorState = structuredClone(state.back);
    else delete profile.backEditorState;
    profile.updatedAt = new Date().toISOString();
    await this.writeVault(vault);
    return profile;
  }

  async importImage(
    profileId: string,
    side: ImageSide,
    sourcePath: string,
  ): Promise<ImageInfo> {
    assertId(profileId);
    const resolved = path.resolve(sourcePath);
    const input = await readFile(resolved);
    return this.importImageBytes(profileId, side, input);
  }

  async importImageBytes(
    profileId: string,
    side: ImageSide,
    input: Buffer,
  ): Promise<ImageInfo> {
    assertId(profileId);
    if (
      !Buffer.isBuffer(input) ||
      input.length === 0 ||
      input.length > 50 * 1024 * 1024
    )
      throw new Error("The selected image is empty or too large");
    const image = sharp(input, { failOn: "error" }).rotate();
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp", "heif"].includes(metadata.format || ""))
      throw new Error("Supported formats: JPEG, PNG, WebP and HEIC");
    if ((metadata.width || 0) < 300 || (metadata.height || 0) < 180)
      throw new Error("This image is too small. Choose a clearer image.");
    const stats = await image.clone().greyscale().stats();
    const prepared = await image
      .resize({
        width: 5000,
        height: 5000,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png({ compressionLevel: 3 })
      .toBuffer({ resolveWithObject: true });
    const id = randomUUID();
    const now = new Date().toISOString();
    const info: ImageInfo = {
      id,
      mimeType: "image/png",
      width: prepared.info.width,
      height: prepared.info.height,
      createdAt: now,
      updatedAt: now,
      qualityWarning:
        (metadata.width || 0) < 1000 || (metadata.height || 0) < 600
          ? "low-resolution"
          : stats.sharpness < 1
            ? "possibly-blurry"
            : undefined,
    };
    const imagePath = this.imagePath(id);
    await this.atomicJson(
      imagePath,
      encryptBytes(prepared.data, this.requireKey()),
    );
    let oldId: string | undefined;
    try {
      const vault = await this.readVault();
      const profile = vault.profiles.find((item) => item.id === profileId);
      if (!profile) throw new Error("Profile not found");
      if (side === "back" && !profile.frontImageId)
        throw new Error("Add a front image before adding a back image");
      oldId = side === "front" ? profile.frontImageId : profile.backImageId;
      if (side === "front") profile.frontImageId = id;
      else profile.backImageId = id;
      vault.images = vault.images.filter((item) => item.id !== oldId);
      vault.images.push(info);
      profile.updatedAt = now;
      await this.writeVault(vault);
    } catch (error) {
      await rm(imagePath, { force: true });
      throw error;
    }
    if (oldId)
      await rm(this.imagePath(oldId), { force: true }).catch(() => undefined);
    return info;
  }

  async removeBack(profileId: string): Promise<void> {
    assertId(profileId);
    const vault = await this.readVault();
    const profile = vault.profiles.find((item) => item.id === profileId);
    if (!profile?.backImageId) return;
    const old = profile.backImageId;
    delete profile.backImageId;
    delete profile.backEditorState;
    vault.images = vault.images.filter((item) => item.id !== old);
    profile.updatedAt = new Date().toISOString();
    await this.writeVault(vault);
    await rm(this.imagePath(old), { force: true }).catch(() => undefined);
  }

  async openProfile(id: string): Promise<ProfileWithImages> {
    assertId(id);
    const vault = await this.readVault();
    const profile = vault.profiles.find((item) => item.id === id);
    if (!profile) throw new Error("Profile not found");
    let frontDataUrl = "",
      backDataUrl: string | undefined,
      frontError = false,
      backError = false;
    if (profile.frontImageId) {
      try {
        frontDataUrl = await this.imageDataUrl(profile.frontImageId);
      } catch {
        frontError = true;
      }
    }
    if (profile.backImageId) {
      try {
        backDataUrl = await this.imageDataUrl(profile.backImageId);
      } catch {
        backError = true;
      }
    }
    return { ...profile, frontDataUrl, backDataUrl, frontError, backError };
  }

  async deleteProfile(id: string): Promise<void> {
    assertId(id);
    const vault = await this.readVault();
    const profile = vault.profiles.find((item) => item.id === id);
    if (!profile) return;
    const imageIds = [profile.frontImageId, profile.backImageId].filter(
      Boolean,
    ) as string[];
    vault.profiles = vault.profiles.filter((item) => item.id !== id);
    vault.images = vault.images.filter((item) => !imageIds.includes(item.id));
    await this.writeVault(vault);
    await Promise.allSettled(
      imageIds.map((imageId) => rm(this.imagePath(imageId), { force: true })),
    );
  }

  async duplicateProfile(id: string): Promise<Profile> {
    assertId(id);
    const vault = await this.readVault();
    const source = vault.profiles.find((item) => item.id === id);
    if (!source) throw new Error("Profile not found");
    const duplicate = await this.createProfile(
      withSuffix(source.name, " (copy)", 100),
      source.documentLabel,
    );
    try {
      if (source.frontImageId)
        await this.importImageBytes(
          duplicate.id,
          "front",
          await this.decryptImage(source.frontImageId),
        );
      if (source.backImageId)
        await this.importImageBytes(
          duplicate.id,
          "back",
          await this.decryptImage(source.backImageId),
        );
      await this.saveEditorState(duplicate.id, {
        front: structuredClone(
          source.frontEditorState || {
            watermark: defaultWatermark,
            imageScale: 1,
            imageRotation: 0,
          },
        ),
        back:
          source.backImageId && source.backEditorState
            ? structuredClone(source.backEditorState)
            : undefined,
      });
      const refreshed = await this.readVault();
      return refreshed.profiles.find((item) => item.id === duplicate.id)!;
    } catch (error) {
      await this.deleteProfile(duplicate.id);
      throw error;
    }
  }

  async reorderProfiles(ids: string[]): Promise<VaultData> {
    const vault = await this.readVault();
    if (
      ids.length !== vault.profiles.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !vault.profiles.some((profile) => profile.id === id))
    )
      throw new Error("Invalid profile order");
    const order = new Map(ids.map((id, index) => [id, index]));
    vault.profiles.forEach((profile) => {
      profile.order = order.get(profile.id)!;
    });
    await this.writeVault(vault);
    return vault;
  }

  async saveVaultData(
    data: Partial<
      Pick<
        VaultData,
        "settings" | "presets" | "recentRecipients" | "recentPurposes"
      >
    >,
  ): Promise<VaultData> {
    const vault = await this.readVault();
    Object.assign(vault, data);
    await this.writeVault(vault);
    return vault;
  }

  async createBackup(
    destination: string,
    password: string,
    includeRecent: boolean,
  ): Promise<void> {
    assertString(password, "backup password", 200);
    if (password.length < 8)
      throw new Error("Backup password must contain at least 8 characters");
    const vault = structuredClone(await this.readVault());
    if (!includeRecent) {
      vault.recentRecipients = [];
      vault.recentPurposes = [];
    }
    const images: Record<string, string> = {};
    for (const image of vault.images)
      images[image.id] = (await this.decryptImage(image.id)).toString("base64");
    const file = await encodeBackup({ vault, images }, password);
    await this.atomicJson(path.resolve(destination), file);
  }

  async previewBackup(
    source: string,
    password: string,
  ): Promise<{
    payload: BackupPayload;
    preview: { version: number; profiles: Profile[] };
  }> {
    const file = await this.readJson<BackupFile>(path.resolve(source));
    const payload = await decodeBackup(file, password);
    return {
      payload,
      preview: { version: file.version, profiles: payload.vault.profiles },
    };
  }

  async restoreBackup(
    source: string,
    password: string,
    conflict: RestoreConflict,
    selectedProfileIds?: string[],
  ): Promise<void> {
    const { payload } = await this.previewBackup(source, password);
    const selectedProfiles = payload.vault.profiles.filter(
      (profile) =>
        !selectedProfileIds || selectedProfileIds.includes(profile.id),
    );
    await this.preflightRestoreImages(payload, selectedProfiles);
    const current = structuredClone(await this.readVault());
    const staged = path.join(this.root, `.restore-${randomUUID()}`);
    const stagedFiles: Array<{ stagedPath: string; destination: string }> = [];
    const installedFiles: string[] = [];
    const imagesToDelete = new Set<string>();
    let committed = false;
    await mkdir(staged, { recursive: true });
    try {
      for (const incoming of selectedProfiles) {
        const idCollision = current.profiles.find(
          (item) => item.id === incoming.id,
        );
        const nameCollision = current.profiles.find(
          (item) =>
            item.name.toLocaleLowerCase() === incoming.name.toLocaleLowerCase(),
        );
        const collisions = [...new Set([idCollision, nameCollision])].filter(
          (item): item is Profile => Boolean(item),
        );
        if (conflict === "replace" && collisions.length > 1)
          throw new Error(
            "Backup profile has conflicting identifier and name matches",
          );
        if (collisions.length && conflict === "keep") continue;
        if (collisions.length && conflict === "replace") {
          const collisionIds = new Set(collisions.map((item) => item.id));
          current.profiles = current.profiles.filter(
            (item) => !collisionIds.has(item.id),
          );
          for (const existing of collisions)
            for (const oldId of [
              existing.frontImageId,
              existing.backImageId,
            ].filter(Boolean) as string[])
              imagesToDelete.add(oldId);
          current.images = current.images.filter(
            (item) => !imagesToDelete.has(item.id),
          );
        }
        const copy = structuredClone(incoming);
        copy.id = randomUUID();
        if (nameCollision && conflict === "copy") {
          copy.name = withSuffix(copy.name, " (restored)", 100);
        }
        copy.order =
          collisions.length && conflict === "replace"
            ? Math.min(...collisions.map((item) => item.order))
            : current.profiles.reduce(
                (highest, item) => Math.max(highest, item.order),
                -1,
              ) + 1;
        const idMap = new Map<string, string>();
        for (const originalId of [copy.frontImageId, copy.backImageId].filter(
          Boolean,
        ) as string[]) {
          idMap.set(originalId, randomUUID());
        }
        copy.frontImageId = idMap.get(copy.frontImageId) || copy.frontImageId;
        if (copy.backImageId)
          copy.backImageId = idMap.get(copy.backImageId) || copy.backImageId;
        current.profiles.push(copy);
        for (const [originalId, targetId] of idMap) {
          const info = payload.vault.images.find(
            (item) => item.id === originalId,
          );
          const bytes = Buffer.from(payload.images[originalId] || "", "base64");
          if (!info || !bytes.length)
            throw new Error("Backup contains a missing image");
          current.images.push({ ...info, id: targetId });
          const stagedPath = this.containedImagePath(staged, targetId);
          await this.atomicJson(
            stagedPath,
            encryptBytes(bytes, this.requireKey()),
          );
          stagedFiles.push({
            stagedPath,
            destination: this.imagePath(targetId),
          });
        }
      }
      for (const file of stagedFiles) {
        await rename(file.stagedPath, file.destination);
        installedFiles.push(file.destination);
      }
      const incomingPresetIds = new Set(
        payload.vault.presets.map((preset) => preset.id),
      );
      current.presets = [
        ...current.presets.filter(
          (preset) => !incomingPresetIds.has(preset.id),
        ),
        ...payload.vault.presets,
      ].slice(0, 100);
      current.recentRecipients = [
        ...new Set([
          ...payload.vault.recentRecipients,
          ...current.recentRecipients,
        ]),
      ].slice(0, 20);
      current.recentPurposes = [
        ...new Set([
          ...payload.vault.recentPurposes,
          ...current.recentPurposes,
        ]),
      ].slice(0, 20);
      current.settings = {
        ...current.settings,
        language: payload.vault.settings.language,
        defaultExportFormat: payload.vault.settings.defaultExportFormat,
        defaultExportQuality: payload.vault.settings.defaultExportQuality,
        rememberRecentText: payload.vault.settings.rememberRecentText,
        defaultWatermark: payload.vault.settings.defaultWatermark,
      };
      await this.writeVault(current);
      committed = true;
      await Promise.allSettled(
        [...imagesToDelete]
          .filter(
            (imageId) => !current.images.some((item) => item.id === imageId),
          )
          .map((imageId) => rm(this.imagePath(imageId), { force: true })),
      );
    } catch (error) {
      if (!committed)
        await Promise.allSettled(
          installedFiles.map((file) => rm(file, { force: true })),
        );
      throw error;
    } finally {
      await rm(staged, { recursive: true, force: true });
    }
  }

  private async preflightRestoreImages(
    payload: BackupPayload,
    profiles: Profile[],
  ): Promise<void> {
    const imageInfo = new Map(
      payload.vault.images.map((image) => [image.id, image]),
    );
    const imageIds = new Set(
      profiles.flatMap((profile) =>
        [profile.frontImageId, profile.backImageId].filter(Boolean),
      ) as string[],
    );
    for (const id of imageIds) {
      const info = imageInfo.get(id);
      const encoded = payload.images[id];
      const bytes = Buffer.from(encoded || "", "base64");
      if (!info || !bytes.length || bytes.length > MAX_RESTORE_IMAGE_BYTES)
        throw new Error("Backup contains an invalid image");
      try {
        const image = sharp(bytes, {
          failOn: "error",
          limitInputPixels: MAX_RESTORE_IMAGE_PIXELS,
        });
        const metadata = await image.metadata();
        const expectedFormat = RESTORE_FORMAT_BY_MIME[info.mimeType];
        if (
          !expectedFormat ||
          metadata.format !== expectedFormat ||
          metadata.width !== info.width ||
          metadata.height !== info.height ||
          metadata.width > MAX_RESTORE_IMAGE_DIMENSION ||
          metadata.height > MAX_RESTORE_IMAGE_DIMENSION ||
          (metadata.pages || 1) !== 1
        )
          throw new Error("Image metadata does not match the backup");
        // Metadata parsing alone can accept a truncated image. Stats forces Sharp
        // to decode all pixels before any current profile or file is touched.
        await image.stats();
      } catch {
        throw new Error("Backup contains an invalid image");
      }
    }
  }

  async deleteAll(password?: string): Promise<void> {
    if (await this.hasPassword()) {
      if (!password) throw new Error("Password is required");
      await this.unlock(password);
    }
    this.lock();
    await rm(this.root, { recursive: true, force: true });
    await this.initialize();
  }

  async resetInaccessibleVault(): Promise<void> {
    if (!(await this.hasPassword()) || !this.isLocked())
      throw new Error("Vault reset is not available");
    await rm(this.root, { recursive: true, force: true });
    await this.initialize();
  }

  private freshVault(): VaultData {
    return {
      version: 2,
      profiles: [],
      images: [],
      presets: structuredClone(defaultPresets),
      recentRecipients: [],
      recentPurposes: [],
      settings: structuredClone(defaultSettings),
    };
  }
  private async readVault(): Promise<VaultData> {
    this.requireKey();
    const raw = await this.readJson<unknown>(this.metadataPath);
    return migrateVault(raw).vault;
  }
  private async writeVault(vault: VaultData): Promise<void> {
    await this.atomicJson(this.metadataPath, validateVaultData(vault));
  }
  private async cleanupOrphanedImages(vault: VaultData): Promise<void> {
    const referenced = new Set(vault.images.map((image) => `${image.id}.enc`));
    const entries = await readdir(this.imagesDir, { withFileTypes: true });
    await Promise.allSettled(
      entries
        .filter(
          (entry) =>
            entry.isFile() &&
            entry.name.endsWith(".enc") &&
            !referenced.has(entry.name),
        )
        .map((entry) =>
          rm(path.join(this.imagesDir, entry.name), { force: true }),
        ),
    );
  }
  private requireKey(): Buffer {
    if (!this.key) throw new Error("Vault is locked");
    return this.key;
  }
  private async decryptImage(id: string): Promise<Buffer> {
    return decryptBytes(
      await this.readJson<Envelope>(this.imagePath(id)),
      this.requireKey(),
    );
  }
  private async imageDataUrl(id: string): Promise<string> {
    return `data:image/png;base64,${(await this.decryptImage(id)).toString("base64")}`;
  }
  private imagePath(id: string): string {
    return this.containedImagePath(this.imagesDir, id);
  }
  private containedImagePath(directory: string, id: string): string {
    assertId(id);
    const root = path.resolve(directory);
    const candidate = path.resolve(root, `${id}.enc`);
    const relative = path.relative(root, candidate);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
      throw new Error("Invalid image path");
    return candidate;
  }
  private async exists(file: string): Promise<boolean> {
    try {
      await readFile(file);
      return true;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw cause;
    }
  }
  private async readJson<T>(file: string): Promise<T> {
    return JSON.parse(await readFile(file, "utf8")) as T;
  }
  private async atomicJson(file: string, data: unknown): Promise<void> {
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify(data), { mode: 0o600 });
      await rename(temp, file);
    } finally {
      await rm(temp, { force: true }).catch(() => undefined);
    }
  }
  private async loadOrCreateOsKey(): Promise<void> {
    if (!safeStorage.isEncryptionAvailable())
      throw new Error("Secure operating-system key storage is unavailable");
    if (await this.exists(this.keyPath)) {
      const binary = safeStorage.decryptString(await readFile(this.keyPath));
      if (
        binary.length !== 32 ||
        Array.from(binary).some((character) => character.charCodeAt(0) > 255)
      )
        throw new Error(
          "The vault encryption key is invalid; data was preserved",
        );
      this.key = Buffer.from(
        Array.from(binary, (character) => character.charCodeAt(0)),
      );
    } else {
      this.key = randomBytes(32);
      await this.persistOsKey(this.key);
    }
  }
  private async persistOsKey(key: Buffer): Promise<void> {
    const binary = Array.from(key)
      .map((n) => String.fromCharCode(n))
      .join("");
    await writeFile(this.keyPath, safeStorage.encryptString(binary), {
      mode: 0o600,
    });
  }
}

const MAX_RESTORE_IMAGE_BYTES = 105_000_000;
const MAX_RESTORE_IMAGE_DIMENSION = 5_000;
const MAX_RESTORE_IMAGE_PIXELS =
  MAX_RESTORE_IMAGE_DIMENSION * MAX_RESTORE_IMAGE_DIMENSION;
const RESTORE_FORMAT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/webp": "webp",
  "image/heic": "heif",
  "image/heif": "heif",
};

function withSuffix(value: string, suffix: string, maxLength: number): string {
  return `${value.slice(0, Math.max(0, maxLength - suffix.length)).trimEnd()}${suffix}`;
}
