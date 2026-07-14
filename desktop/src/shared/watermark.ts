export function clampNormalized(value: number, margin = 0.04): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1 - margin, Math.max(margin, value));
}

export function normalizeLegacyWatermarkText(text: string): string {
  if (text.includes("{PURPOSE}")) return "FOR PRIVATE USE ONLY";
  return text
    .replace(/^FOR\s+\{RECIPIENT\}\s*/i, "FOR ")
    .replaceAll("{RECIPIENT}", "PRIVATE")
    .trim();
}
