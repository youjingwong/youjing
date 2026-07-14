import { describe, expect, it } from "vitest";
import { defaultPresets, defaultSettings } from "../shared/defaults";
import {
  decodeBackup,
  encodeBackup,
  type BackupPayload,
} from "./backup-format";

const payload: BackupPayload = {
  vault: {
    version: 2,
    profiles: [],
    images: [],
    presets: defaultPresets,
    recentRecipients: [],
    recentPurposes: [],
    settings: defaultSettings,
  },
  images: {},
};

describe("encrypted backup format", () => {
  it("serializes and restores a complete authenticated payload", async () =>
    expect(
      await decodeBackup(
        await encodeBackup(payload, "correct horse battery staple"),
        "correct horse battery staple",
      ),
    ).toEqual(payload));
  it("rejects an incorrect password", async () =>
    expect(
      decodeBackup(
        await encodeBackup(payload, "correct horse battery staple"),
        "wrong password",
      ),
    ).rejects.toThrow());
  it("rejects an unsupported version before restore", async () => {
    const file = await encodeBackup(payload, "password");
    await expect(
      decodeBackup({ ...file, version: 2 as 1 }, "password"),
    ).rejects.toThrow(/version/i);
  });
  it("rejects path-traversal image identifiers before restore", async () => {
    const malicious = structuredClone(payload);
    malicious.vault.images.push({
      id: "../images/00000000-0000-4000-8000-000000000000",
      mimeType: "image/png",
      width: 1200,
      height: 800,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    malicious.images[malicious.vault.images[0].id] =
      Buffer.from("image").toString("base64");
    await expect(
      decodeBackup(await encodeBackup(malicious, "password"), "password"),
    ).rejects.toThrow(/identifier/i);
  });
  it("rejects missing or unexpected image payloads", async () => {
    const unexpected = structuredClone(payload);
    unexpected.images["00000000-0000-4000-8000-000000000000"] =
      Buffer.from("image").toString("base64");
    await expect(
      decodeBackup(await encodeBackup(unexpected, "password"), "password"),
    ).rejects.toThrow(/does not match/i);
  });
});
