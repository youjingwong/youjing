import type { VaultData } from "../shared/types";
import { defaultWatermark } from "../shared/defaults";
import { validateVaultData } from "../shared/validation";

export const CURRENT_VAULT_VERSION = 2;

export function migrateVault(input: unknown): {
  vault: VaultData;
  migrated: boolean;
} {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Vault metadata is damaged");
  const candidate = structuredClone(input) as Record<string, any>;
  let migrated = false;
  if (candidate.version === 1) {
    candidate.settings = {
      ...candidate.settings,
      defaultWatermark: structuredClone(defaultWatermark),
    };
    candidate.version = 2;
    migrated = true;
  }
  if (candidate.version !== CURRENT_VAULT_VERSION) {
    if (
      typeof candidate.version === "number" &&
      candidate.version > CURRENT_VAULT_VERSION
    )
      throw new Error("This vault was created by a newer version of Palang IC");
    throw new Error("Unsupported vault version");
  }
  if (
    !Array.isArray(candidate.profiles) ||
    !Array.isArray(candidate.images) ||
    !Array.isArray(candidate.presets) ||
    !Array.isArray(candidate.recentRecipients) ||
    !Array.isArray(candidate.recentPurposes) ||
    !candidate.settings
  )
    throw new Error("Vault metadata is damaged");
  return { vault: validateVaultData(candidate), migrated };
}
