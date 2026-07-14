import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp/palang-ic-vault-test" },
  safeStorage: {},
}));

import { VaultService } from "./vault";

describe("vault operation serialization", () => {
  it("runs scheduled operations one at a time and in order", async () => {
    const vault = new VaultService();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = vault.runExclusive(async () => {
      events.push("first:start");
      await firstCanFinish;
      events.push("first:end");
      return "first";
    });
    const second = vault.runExclusive(async () => {
      events.push("second:start");
      await Promise.resolve();
      events.push("second:end");
      return "second";
    });

    await vi.waitFor(() => expect(events).toEqual(["first:start"]));
    releaseFirst();

    await expect(Promise.all([first, second])).resolves.toEqual([
      "first",
      "second",
    ]);
    expect(events).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end",
    ]);
  });

  it("keeps processing after a scheduled operation rejects", async () => {
    const vault = new VaultService();

    await expect(
      vault.runExclusive(() => Promise.reject(new Error("write failed"))),
    ).rejects.toThrow("write failed");
    await expect(vault.runExclusive(() => 42)).resolves.toBe(42);
  });
});
