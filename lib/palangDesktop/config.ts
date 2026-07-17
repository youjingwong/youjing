import type { ArtifactId } from "./core";

export type AirwallexEnvironment = "demo" | "prod";

export type AirwallexConfig = {
  environment: AirwallexEnvironment;
  baseUrl: string;
  clientId: string;
  apiKey: string;
};

export type RedisConfig = {
  url: string;
  token: string;
};

export type EmailConfig = {
  apiKey: string;
  from: string;
};

export type QstashConfig = {
  token: string;
  currentSigningKey: string;
  nextSigningKey: string;
};

export type StorageConfig = {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  artifactKeys: {
    "mac-arm64": string;
    "mac-x64": string;
    "windows-x64": string;
  };
  artifactSizes: Record<ArtifactId, number>;
  artifactSha256: Record<ArtifactId, string>;
};

export class ServerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerConfigurationError";
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new ServerConfigurationError(`Missing ${name}`);
  return value;
}

function parseServiceUrl(name: string, value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ServerConfigurationError(`${name} must be a valid URL`);
  }

  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new ServerConfigurationError(`${name} must use HTTPS`);
  }
  if (url.username || url.password || url.hash) {
    throw new ServerConfigurationError(
      `${name} contains unsupported URL parts`,
    );
  }
  return url.toString().replace(/\/$/, "");
}

function parseSiteUrl(value: string): string {
  const siteUrl = parseServiceUrl("PALANG_SITE_URL", value);
  const url = new URL(siteUrl);
  if (url.pathname !== "/" || url.search) {
    throw new ServerConfigurationError(
      "PALANG_SITE_URL must contain only the site origin",
    );
  }
  return url.origin;
}

function parseArtifactKey(name: string): string {
  const key = requiredEnv(name);
  if (
    key.length > 1024 ||
    key.startsWith("/") ||
    /[\u0000-\u001f\u007f]/.test(key)
  ) {
    throw new ServerConfigurationError(`${name} is not a valid object key`);
  }
  return key;
}

function parseArtifactSize(name: string): number {
  const value = requiredEnv(name);
  if (!/^\d+$/.test(value)) {
    throw new ServerConfigurationError(`${name} must be a byte count`);
  }
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new ServerConfigurationError(`${name} must be a positive byte count`);
  }
  return size;
}

function parseArtifactSha256(name: string): string {
  const value = requiredEnv(name).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new ServerConfigurationError(`${name} must be a SHA-256 hex digest`);
  }
  return value;
}

function parseBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new ServerConfigurationError(`${name} must be true or false`);
}

export function getAirwallexConfig(): AirwallexConfig {
  const environment = requiredEnv("AIRWALLEX_ENV");
  if (environment !== "demo" && environment !== "prod") {
    throw new ServerConfigurationError("AIRWALLEX_ENV must be demo or prod");
  }

  return {
    environment,
    baseUrl:
      environment === "demo"
        ? "https://api-demo.airwallex.com"
        : "https://api.airwallex.com",
    clientId: requiredEnv("AIRWALLEX_CLIENT_ID"),
    apiKey: requiredEnv("AIRWALLEX_API_KEY"),
  };
}

export function requireSalesEnabled(): void {
  if (
    process.env.PALANG_DESKTOP_SALES_ENABLED?.trim().toLowerCase() !== "true"
  ) {
    throw new ServerConfigurationError("Palang Desktop sales are disabled");
  }
}

export function assertSafeSalesEnvironment(
  siteUrl: string,
  environment: AirwallexEnvironment,
): void {
  const hostname = new URL(siteUrl).hostname.toLowerCase();
  const isProductionSite =
    hostname === "youjing.dev" || hostname === "www.youjing.dev";
  if (
    (isProductionSite && environment !== "prod") ||
    (!isProductionSite && environment === "prod")
  ) {
    throw new ServerConfigurationError(
      "Airwallex environment does not match the site origin",
    );
  }
}

export function getAirwallexWebhookSecret(): string {
  return requiredEnv("AIRWALLEX_WEBHOOK_SECRET");
}

export function getOrderTokenSecret(): string {
  const secret = requiredEnv("PALANG_DESKTOP_TOKEN_SECRET");
  if (secret.length < 32) {
    throw new ServerConfigurationError(
      "PALANG_DESKTOP_TOKEN_SECRET must be at least 32 characters",
    );
  }
  return secret;
}

export function getSiteUrl(): string {
  return parseSiteUrl(requiredEnv("PALANG_SITE_URL"));
}

export function getRedisConfig(): RedisConfig {
  return {
    url: parseServiceUrl(
      "UPSTASH_REDIS_REST_URL",
      requiredEnv("UPSTASH_REDIS_REST_URL"),
    ),
    token: requiredEnv("UPSTASH_REDIS_REST_TOKEN"),
  };
}

export function getEmailConfig(): EmailConfig {
  const apiKey = requiredEnv("RESEND_API_KEY");
  const from = requiredEnv("PALANG_DESKTOP_FROM_EMAIL");
  if (from.length > 320 || /[\r\n]/.test(from)) {
    throw new ServerConfigurationError(
      "PALANG_DESKTOP_FROM_EMAIL is not a valid sender",
    );
  }
  return { apiKey, from };
}

export function getQstashConfig(): QstashConfig {
  return {
    token: requiredEnv("QSTASH_TOKEN"),
    currentSigningKey: requiredEnv("QSTASH_CURRENT_SIGNING_KEY"),
    nextSigningKey: requiredEnv("QSTASH_NEXT_SIGNING_KEY"),
  };
}

export function getStorageConfig(): StorageConfig {
  const endpoint = process.env.PALANG_DESKTOP_STORAGE_ENDPOINT?.trim();
  return {
    ...(endpoint
      ? {
          endpoint: parseServiceUrl(
            "PALANG_DESKTOP_STORAGE_ENDPOINT",
            endpoint,
          ),
        }
      : {}),
    region: requiredEnv("PALANG_DESKTOP_STORAGE_REGION"),
    bucket: requiredEnv("PALANG_DESKTOP_STORAGE_BUCKET"),
    accessKeyId: requiredEnv("PALANG_DESKTOP_STORAGE_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("PALANG_DESKTOP_STORAGE_SECRET_ACCESS_KEY"),
    forcePathStyle: parseBoolean(
      "PALANG_DESKTOP_STORAGE_FORCE_PATH_STYLE",
      false,
    ),
    artifactKeys: {
      "mac-arm64": parseArtifactKey("PALANG_DESKTOP_ARTIFACT_MAC_ARM64_KEY"),
      "mac-x64": parseArtifactKey("PALANG_DESKTOP_ARTIFACT_MAC_X64_KEY"),
      "windows-x64": parseArtifactKey(
        "PALANG_DESKTOP_ARTIFACT_WINDOWS_X64_KEY",
      ),
    },
    artifactSizes: {
      "mac-arm64": parseArtifactSize(
        "PALANG_DESKTOP_ARTIFACT_MAC_ARM64_SIZE_BYTES",
      ),
      "mac-x64": parseArtifactSize(
        "PALANG_DESKTOP_ARTIFACT_MAC_X64_SIZE_BYTES",
      ),
      "windows-x64": parseArtifactSize(
        "PALANG_DESKTOP_ARTIFACT_WINDOWS_X64_SIZE_BYTES",
      ),
    },
    artifactSha256: {
      "mac-arm64": parseArtifactSha256(
        "PALANG_DESKTOP_ARTIFACT_MAC_ARM64_SHA256",
      ),
      "mac-x64": parseArtifactSha256("PALANG_DESKTOP_ARTIFACT_MAC_X64_SHA256"),
      "windows-x64": parseArtifactSha256(
        "PALANG_DESKTOP_ARTIFACT_WINDOWS_X64_SHA256",
      ),
    },
  };
}
