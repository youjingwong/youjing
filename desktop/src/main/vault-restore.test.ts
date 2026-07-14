import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electronState = vi.hoisted(() => ({ userData: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => electronState.userData },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, "utf8"),
    decryptString: (value: Buffer) => Buffer.from(value).toString("utf8"),
  },
}));

import { encodeBackup } from "./backup-format";
import { VaultService } from "./vault";

describe("vault restore safety", () => {
  let userData: string;
  let vault: VaultService;
  let validImage: Buffer;

  beforeEach(async () => {
    userData = await mkdtemp(path.join(tmpdir(), "palang-restore-test-"));
    electronState.userData = userData;
    vault = new VaultService();
    await vault.initialize();
    validImage = await sharp({
      create: {
        width: 400,
        height: 240,
        channels: 3,
        background: "#cbd5e1",
      },
    })
      .png()
      .toBuffer();
  });

  afterEach(async () => {
    vault.lock();
    await rm(userData, { recursive: true, force: true });
  });

  it("rejects replace when an incoming id and name match different profiles", async () => {
    const original = await vault.createProfile("Bob");
    await vault.importImageBytes(original.id, "front", validImage);
    const backupPath = path.join(userData, "before-rename.palangvault");
    await vault.createBackup(backupPath, "backup-pass", false);

    await vault.updateProfile(original.id, { name: "Alice" });
    const newBob = await vault.createProfile("Bob");
    await vault.importImageBytes(newBob.id, "front", validImage);
    const before = await vault.list();
    const beforeFiles = await encryptedImageSnapshot(userData);

    await expect(
      vault.restoreBackup(backupPath, "backup-pass", "replace"),
    ).rejects.toThrow(/conflicting identifier and name/i);

    expect(await vault.list()).toEqual(before);
    expect(await encryptedImageSnapshot(userData)).toEqual(beforeFiles);
    expect(await restoreDirectories(userData)).toEqual([]);
  }, 15_000);

  it("fully decodes selected image bytes before replacing current data", async () => {
    const currentProfile = await vault.createProfile("Bob");
    await vault.importImageBytes(currentProfile.id, "front", validImage);
    const before = await vault.list();
    const beforeFiles = await encryptedImageSnapshot(userData);
    const storedProfile = before.profiles.find(
      (profile) => profile.id === currentProfile.id,
    )!;
    const currentImage = before.images.find(
      (image) => image.id === storedProfile.frontImageId,
    )!;
    const incomingImageId = randomUUID();
    const incomingProfileId = randomUUID();
    const incomingProfile = {
      ...structuredClone(storedProfile),
      id: incomingProfileId,
      frontImageId: incomingImageId,
    };
    const incomingImage = {
      ...structuredClone(currentImage),
      id: incomingImageId,
    };
    const truncatedImage = validImage.subarray(0, validImage.length - 20);
    await expect(sharp(truncatedImage).metadata()).resolves.toMatchObject({
      format: "png",
      width: currentImage.width,
      height: currentImage.height,
    });
    const backup = await encodeBackup(
      {
        vault: {
          ...structuredClone(before),
          profiles: [incomingProfile],
          images: [incomingImage],
        },
        images: {
          [incomingImageId]: truncatedImage.toString("base64"),
        },
      },
      "backup-pass",
    );
    const backupPath = path.join(userData, "malformed.palangvault");
    await writeFile(backupPath, JSON.stringify(backup));

    await expect(
      vault.restoreBackup(backupPath, "backup-pass", "replace"),
    ).rejects.toThrow(/invalid image/i);

    expect(await vault.list()).toEqual(before);
    expect(await encryptedImageSnapshot(userData)).toEqual(beforeFiles);
    expect(await restoreDirectories(userData)).toEqual([]);
  }, 15_000);
});

async function encryptedImageSnapshot(
  userData: string,
): Promise<Record<string, Buffer>> {
  const directory = path.join(userData, "vault", "images");
  const entries = (await readdir(directory)).sort();
  return Object.fromEntries(
    await Promise.all(
      entries.map(async (entry) => [
        entry,
        await readFile(path.join(directory, entry)),
      ]),
    ),
  );
}

async function restoreDirectories(userData: string): Promise<string[]> {
  return (await readdir(path.join(userData, "vault"))).filter((entry) =>
    entry.startsWith(".restore-"),
  );
}
