import {
  randomBytes,
  scrypt as scryptCallback,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";

export interface Envelope {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
}

export function encryptBytes(data: Buffer, key: Buffer): Envelope {
  if (!Buffer.isBuffer(data) || !Buffer.isBuffer(key) || key.length !== 32)
    throw new Error("Invalid encryption input");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  return {
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptBytes(envelope: Envelope, key: Buffer): Buffer {
  if (!envelope || typeof envelope !== "object" || envelope.version !== 1)
    throw new Error("Unsupported encrypted item version");
  if (!Buffer.isBuffer(key) || key.length !== 32)
    throw new Error("Invalid encryption key");
  const iv = decodeBase64(envelope.iv, "initialization vector", 12);
  const tag = decodeBase64(envelope.tag, "authentication tag", 16);
  const ciphertext = decodeBase64(envelope.ciphertext, "ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export async function deriveKey(
  password: string,
  salt: Buffer,
): Promise<Buffer> {
  if (
    typeof password !== "string" ||
    password.length > 1000 ||
    !Buffer.isBuffer(salt) ||
    salt.length !== 16
  )
    throw new Error("Invalid password derivation input");
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      32,
      { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => {
        if (error) reject(error);
        else resolve(Buffer.from(key));
      },
    );
  });
}

function decodeBase64(
  value: unknown,
  field: string,
  expectedLength?: number,
): Buffer {
  if (
    typeof value !== "string" ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  )
    throw new Error(`Invalid encrypted ${field}`);
  const decoded = Buffer.from(value, "base64");
  if (expectedLength !== undefined && decoded.length !== expectedLength)
    throw new Error(`Invalid encrypted ${field}`);
  return decoded;
}
