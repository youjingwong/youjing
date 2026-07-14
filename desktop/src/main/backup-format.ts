import { randomBytes } from "node:crypto";
import type { VaultData } from "../shared/types";
import { decryptBytes, deriveKey, encryptBytes, type Envelope } from "./crypto";
import { migrateVault } from "./migrations";
import { assertId } from "../shared/validation";

export interface BackupPayload {
  vault: VaultData;
  images: Record<string, string>;
}
export interface BackupFile {
  format: "palang-vault";
  version: 1;
  salt: string;
  payload: Envelope;
}

export async function encodeBackup(
  payload: BackupPayload,
  password: string,
): Promise<BackupFile> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return {
    format: "palang-vault",
    version: 1,
    salt: salt.toString("base64"),
    payload: encryptBytes(Buffer.from(JSON.stringify(payload)), key),
  };
}

export async function decodeBackup(
  file: BackupFile,
  password: string,
): Promise<BackupPayload> {
  if (file.format !== "palang-vault" || file.version !== 1)
    throw new Error("Unsupported backup version");
  const key = await deriveKey(password, Buffer.from(file.salt, "base64"));
  const payload = JSON.parse(
    decryptBytes(file.payload, key).toString("utf8"),
  ) as BackupPayload;
  if (!payload?.vault || !payload.images || typeof payload.images !== "object")
    throw new Error("Invalid backup");
  payload.vault = migrateVault(payload.vault).vault;
  validateBackupImages(payload);
  return payload;
}

function validateBackupImages(payload: BackupPayload): void {
  if (Array.isArray(payload.images)) throw new Error("Invalid backup images");
  const metadataIds = new Set(payload.vault.images.map((image) => image.id));
  const payloadIds = Object.keys(payload.images);
  if (
    payloadIds.length !== metadataIds.size ||
    payloadIds.some((id) => !metadataIds.has(id))
  )
    throw new Error("Backup image data does not match its metadata");
  for (const id of payloadIds) {
    assertId(id);
    const encoded = payload.images[id];
    if (
      typeof encoded !== "string" ||
      encoded.length === 0 ||
      encoded.length > 140_000_000 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        encoded,
      )
    )
      throw new Error("Invalid backup image data");
  }
}
