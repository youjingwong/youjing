import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptBytes, deriveKey, encryptBytes } from "./crypto";

describe("vault encryption", () => {
  it("round trips authenticated bytes with a fresh nonce", () => {
    const key = randomBytes(32);
    const first = encryptBytes(Buffer.from("private identity image"), key);
    const second = encryptBytes(Buffer.from("private identity image"), key);
    expect(first.iv).not.toBe(second.iv);
    expect(decryptBytes(first, key).toString()).toBe("private identity image");
  });

  it("rejects a modified authentication tag", () => {
    const key = randomBytes(32);
    const encrypted = encryptBytes(Buffer.from("secret"), key);
    encrypted.tag = Buffer.alloc(16).toString("base64");
    expect(() => decryptBytes(encrypted, key)).toThrow();
  });

  it("rejects malformed envelope fields before decryption", () => {
    const key = randomBytes(32);
    const encrypted = encryptBytes(Buffer.from("secret"), key);
    expect(() => decryptBytes({ ...encrypted, iv: "not base64" }, key)).toThrow(
      /initialization vector/i,
    );
    expect(() =>
      decryptBytes(
        { ...encrypted, tag: Buffer.alloc(8).toString("base64") },
        key,
      ),
    ).toThrow(/authentication tag/i);
    expect(() => decryptBytes(encrypted, randomBytes(16))).toThrow(
      /encryption key/i,
    );
  });

  it("derives stable, salt-specific password keys", async () => {
    const salt = randomBytes(16);
    expect(await deriveKey("a useful password", salt)).toEqual(
      await deriveKey("a useful password", salt),
    );
    expect(await deriveKey("a useful password", randomBytes(16))).not.toEqual(
      await deriveKey("a useful password", salt),
    );
  });
});
