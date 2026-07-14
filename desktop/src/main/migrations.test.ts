import { describe, expect, it } from "vitest";
import { defaultPresets, defaultSettings } from "../shared/defaults";
import { migrateVault } from "./migrations";

const valid = {
  version: 2 as const,
  profiles: [],
  images: [],
  presets: defaultPresets,
  recentRecipients: [],
  recentPurposes: [],
  settings: defaultSettings,
};

describe("vault migrations", () => {
  it("accepts the current schema", () =>
    expect(migrateVault(valid).vault.version).toBe(2));
  it("migrates version 1 settings with recommended watermark defaults", () => {
    const legacy = {
      ...valid,
      version: 1,
      settings: { ...defaultSettings, defaultWatermark: undefined },
    };
    const result = migrateVault(legacy);
    expect(result.migrated).toBe(true);
    expect(result.vault.settings.defaultWatermark.x).toBeCloseTo(4 / 15);
  });
  it("rejects future schemas without modifying them", () =>
    expect(() => migrateVault({ ...valid, version: 3 })).toThrow(
      /newer version/i,
    ));
  it("rejects incomplete metadata", () =>
    expect(() => migrateVault({ version: 2 })).toThrow(/damaged/i));
});
