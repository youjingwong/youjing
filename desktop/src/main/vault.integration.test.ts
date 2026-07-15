import { access, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => path.join(tmpdir(), "unused-palang-user-data") },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, "utf16le"),
    decryptString: (value: Buffer) => value.toString("utf16le"),
  },
}));

import { VaultService } from "./vault";
import { defaultWatermark } from "../shared/defaults";

describe("VaultService integration", () => {
  let testRoot: string;

  beforeEach(async () => {
    testRoot = await mkdtemp(path.join(tmpdir(), "palang-vault-integration-"));
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it("persists profiles, editor state and settings across a fresh service instance", async () => {
    const first = await initializeVault(testRoot);
    const profile = await first.createProfile("MyKad", "Primary identity card");
    await first.saveEditorState(profile.id, {
      front: {
        imageScale: 1.35,
        imageRotation: 90,
        watermark: {
          text: "FOR BANK VERIFICATION ONLY",
          color: "#123456",
          opacity: 0.72,
          fontSize: 52,
          rotation: -17,
          x: 0.25,
          y: 0.4,
          align: "left",
          lineHeight: 1.3,
          uppercase: true,
          dateEnabled: false,
          crossingLines: {
            enabled: true,
            color: "#654321",
            opacity: 0.8,
            thickness: 5,
            scale: 1.1,
          },
        },
      },
    });
    await first.saveVaultData({
      settings: {
        ...(await first.list()).settings,
        theme: "dark",
        defaultExportFormat: "png",
        defaultExportQuality: "maximum",
      },
    });

    first.lock();
    const reopened = await initializeVault(testRoot);
    const persisted = await reopened.list();

    expect(persisted.profiles).toHaveLength(1);
    expect(persisted.profiles[0]).toMatchObject({
      id: profile.id,
      name: "MyKad",
      documentLabel: "Primary identity card",
      frontEditorState: {
        imageScale: 1.35,
        imageRotation: 90,
        watermark: {
          text: "FOR BANK VERIFICATION ONLY",
          rotation: -17,
          x: 0.25,
          y: 0.4,
        },
      },
    });
    expect(persisted.settings).toMatchObject({
      theme: "dark",
      defaultExportFormat: "png",
      defaultExportQuality: "maximum",
    });
  });

  it("encrypts front and back images at rest, opens them, and removes their files", async () => {
    const vault = await initializeVault(testRoot);
    const profile = await vault.createProfile("Passport");
    const backBytes = await solidPng(420, 260, { r: 15, g: 35, b: 220 });

    await expect(
      vault.importImageBytes(profile.id, "back", backBytes),
    ).rejects.toThrow("Add a front image");
    expect((await vault.list()).images).toEqual([]);
    expect(await readdir(path.join(testRoot, "images"))).toEqual([]);

    const front = await vault.importImageBytes(
      profile.id,
      "front",
      await solidPng(640, 400, { r: 220, g: 30, b: 10 }),
      {
        front: {
          watermark: structuredClone(defaultWatermark),
          imageScale: 1,
          imageRotation: 0,
        },
      },
    );
    const back = await vault.importImageBytes(profile.id, "back", backBytes);
    expect((await vault.list()).profiles[0].frontEditorState).toMatchObject({
      imageScale: 1,
      imageRotation: 0,
      watermark: defaultWatermark,
    });
    const frontPath = path.join(testRoot, "images", `${front.id}.enc`);
    const backPath = path.join(testRoot, "images", `${back.id}.enc`);

    for (const encryptedPath of [frontPath, backPath]) {
      const encrypted = await readFile(encryptedPath);
      expect(encrypted.subarray(0, 8)).not.toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      expect(JSON.parse(encrypted.toString("utf8"))).toMatchObject({
        version: 1,
        iv: expect.any(String),
        tag: expect.any(String),
        ciphertext: expect.any(String),
      });
    }

    const opened = await vault.openProfile(profile.id);
    expect(await dataUrlMetadata(opened.frontDataUrl)).toMatchObject({
      format: "png",
      width: 640,
      height: 400,
    });
    expect(await dataUrlMetadata(opened.backDataUrl!)).toMatchObject({
      format: "png",
      width: 420,
      height: 260,
    });

    await vault.removeBack(profile.id);
    expect(await fileExists(frontPath)).toBe(true);
    expect(await fileExists(backPath)).toBe(false);
    expect((await vault.openProfile(profile.id)).backDataUrl).toBeUndefined();

    await vault.deleteProfile(profile.id);
    expect(await fileExists(frontPath)).toBe(false);
    expect((await vault.list()).profiles).toEqual([]);
    expect((await vault.list()).images).toEqual([]);
  });

  it("supports password enable, lock, unlock, change and disable without losing data", async () => {
    const vault = await initializeVault(testRoot);
    const profile = await vault.createProfile("Driver licence");
    await vault.importImageBytes(
      profile.id,
      "front",
      await solidPng(400, 240, { r: 40, g: 180, b: 80 }),
    );

    await vault.enablePassword("correct horse battery");
    expect(await vault.hasPassword()).toBe(true);
    expect(await fileExists(path.join(testRoot, "lock.json"))).toBe(true);
    expect(await fileExists(path.join(testRoot, "master.key"))).toBe(false);

    vault.lock();
    const lockedReopened = await initializeVault(testRoot);
    expect(lockedReopened.isLocked()).toBe(true);
    await expect(lockedReopened.list()).rejects.toThrow("Vault is locked");
    await expect(
      lockedReopened.unlock("definitely incorrect"),
    ).rejects.toThrow();
    expect(lockedReopened.isLocked()).toBe(true);
    await lockedReopened.unlock("correct horse battery");
    expect((await lockedReopened.list()).profiles[0].id).toBe(profile.id);

    await lockedReopened.changePassword(
      "correct horse battery",
      "replacement password",
    );
    lockedReopened.lock();
    await expect(
      lockedReopened.unlock("correct horse battery"),
    ).rejects.toThrow();
    await lockedReopened.unlock("replacement password");
    expect((await lockedReopened.openProfile(profile.id)).frontDataUrl).toMatch(
      /^data:image\/png;base64,/,
    );

    await lockedReopened.disablePassword("replacement password");
    expect(await lockedReopened.hasPassword()).toBe(false);
    expect(await fileExists(path.join(testRoot, "lock.json"))).toBe(false);
    expect(await fileExists(path.join(testRoot, "master.key"))).toBe(true);

    lockedReopened.lock();
    await lockedReopened.unlock("ignored when OS key storage is enabled");
    expect((await lockedReopened.list()).profiles[0].id).toBe(profile.id);
  });

  it("keeps restore unchanged on a wrong password and applies keep, copy and replace conflicts", async () => {
    const sourceRoot = path.join(testRoot, "source");
    const targetRoot = path.join(testRoot, "target");
    const backupPath = path.join(testRoot, "encrypted.palang-backup");
    const source = await initializeVault(sourceRoot);
    const sourceProfile = await source.createProfile("Shared ID");
    await source.importImageBytes(
      sourceProfile.id,
      "front",
      await solidPng(480, 300, { r: 230, g: 15, b: 30 }),
    );
    await source.createBackup(backupPath, "backup password", false);

    const backupText = await readFile(backupPath, "utf8");
    expect(backupText).not.toContain("Shared ID");

    const target = await initializeVault(targetRoot);
    const existing = await target.createProfile("Shared ID");
    await target.importImageBytes(
      existing.id,
      "front",
      await solidPng(480, 300, { r: 10, g: 25, b: 220 }),
    );
    const beforeWrongPassword = await target.list();
    const filesBeforeWrongPassword = await sortedImageFiles(targetRoot);

    await expect(
      target.restoreBackup(backupPath, "not the backup password", "replace"),
    ).rejects.toThrow();
    expect(await target.list()).toEqual(beforeWrongPassword);
    expect(await sortedImageFiles(targetRoot)).toEqual(
      filesBeforeWrongPassword,
    );

    await target.restoreBackup(backupPath, "backup password", "keep");
    expect((await target.list()).profiles).toHaveLength(1);
    expect((await target.list()).profiles[0].id).toBe(existing.id);

    await target.restoreBackup(backupPath, "backup password", "copy");
    const afterCopy = await target.list();
    expect(afterCopy.profiles).toHaveLength(2);
    expect(afterCopy.profiles.map((item) => item.name).sort()).toEqual([
      "Shared ID",
      "Shared ID (restored)",
    ]);

    await target.restoreBackup(backupPath, "backup password", "replace");
    const afterReplace = await target.list();
    expect(afterReplace.profiles).toHaveLength(2);
    expect(afterReplace.profiles.some((item) => item.id === existing.id)).toBe(
      false,
    );
    const replaced = afterReplace.profiles.find(
      (item) => item.name === "Shared ID",
    )!;
    expect(replaced.id).not.toBe(sourceProfile.id);
    expect(
      await dataUrlAverageRed(
        (await target.openProfile(replaced.id)).frontDataUrl,
      ),
    ).toBeGreaterThan(200);
    expect(await sortedImageFiles(targetRoot)).toHaveLength(2);
  }, 30_000);

  it("rejects malformed persisted OS key material instead of zero-padding it", async () => {
    const vault = await initializeVault(testRoot);
    await vault.createProfile("Preserved profile");
    vault.lock();
    await writeFile(
      path.join(testRoot, "master.key"),
      Buffer.from("too short", "utf16le"),
    );

    const reopened = new VaultService(testRoot);
    await expect(reopened.initialize()).rejects.toThrow(
      "vault encryption key is invalid; data was preserved",
    );
    expect(
      JSON.parse(await readFile(path.join(testRoot, "vault.json"), "utf8"))
        .profiles,
    ).toHaveLength(1);
  });
});

async function initializeVault(root: string): Promise<VaultService> {
  const vault = new VaultService(root);
  await vault.initialize();
  return vault;
}

async function solidPng(
  width: number,
  height: number,
  background: { r: number; g: number; b: number },
): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background },
  })
    .png()
    .toBuffer();
}

async function dataUrlMetadata(dataUrl: string) {
  return sharp(dataUrlBytes(dataUrl)).metadata();
}

async function dataUrlAverageRed(dataUrl: string): Promise<number> {
  const stats = await sharp(dataUrlBytes(dataUrl)).stats();
  return stats.channels[0].mean;
}

function dataUrlBytes(dataUrl: string): Buffer {
  const separator = dataUrl.indexOf(",");
  if (separator < 0) throw new Error("Invalid data URL");
  return Buffer.from(dataUrl.slice(separator + 1), "base64");
}

async function fileExists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  );
}

async function sortedImageFiles(root: string): Promise<string[]> {
  return (await readdir(path.join(root, "images"))).sort();
}
