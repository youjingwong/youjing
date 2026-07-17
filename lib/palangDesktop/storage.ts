import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  DOWNLOAD_URL_TTL_SECONDS,
  getArtifactDefinition,
  type ArtifactId,
} from "./core";
import { getStorageConfig, type StorageConfig } from "./config";

type CachedClient = {
  cacheKey: string;
  client: S3Client;
};

let cachedClient: CachedClient | null = null;
let cachedReadiness: { cacheKey: string; expiresAt: number } | null = null;
const READINESS_CACHE_MILLISECONDS = 5 * 60 * 1000;

function storageCacheKey(config: StorageConfig): string {
  return [
    config.endpoint ?? "aws",
    config.region,
    config.bucket,
    config.accessKeyId,
    config.secretAccessKey,
    String(config.forcePathStyle),
  ].join(":");
}

function readinessCacheKey(config: StorageConfig): string {
  return [
    storageCacheKey(config),
    ...Object.entries(config.artifactKeys).flat(),
    ...Object.entries(config.artifactSizes).flat(),
    ...Object.entries(config.artifactSha256).flat(),
  ].join(":");
}

export async function verifyArtifactReadiness(): Promise<void> {
  const config = getStorageConfig();
  const cacheKey = readinessCacheKey(config);
  if (
    cachedReadiness?.cacheKey === cacheKey &&
    cachedReadiness.expiresAt > Date.now()
  ) {
    return;
  }

  const client = getStorageClient(config);
  const artifactIds: ArtifactId[] = ["mac-arm64", "mac-x64", "windows-x64"];
  try {
    await Promise.all(
      artifactIds.map(async (artifactId) => {
        const response = await client.send(
          new HeadObjectCommand({
            Bucket: config.bucket,
            Key: config.artifactKeys[artifactId],
          }),
        );
        const sha256 = response.Metadata?.sha256?.toLowerCase();
        if (
          response.ContentLength !== config.artifactSizes[artifactId] ||
          sha256 !== config.artifactSha256[artifactId]
        ) {
          throw new Error("Installer metadata does not match the release gate");
        }
      }),
    );
  } catch {
    throw new Error("Signed installer artifacts are not ready");
  }

  cachedReadiness = {
    cacheKey,
    expiresAt: Date.now() + READINESS_CACHE_MILLISECONDS,
  };
}

function getStorageClient(config: StorageConfig): S3Client {
  const cacheKey = storageCacheKey(config);
  if (cachedClient?.cacheKey === cacheKey) return cachedClient.client;

  const client = new S3Client({
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  cachedClient = { cacheKey, client };
  return client;
}

export async function createArtifactDownloadUrl(
  artifactId: ArtifactId,
): Promise<string> {
  const artifact = getArtifactDefinition(artifactId);
  if (!artifact) throw new Error("Unknown artifact");

  const config = getStorageConfig();
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: config.artifactKeys[artifact.id],
    ResponseContentType: artifact.contentType,
    ResponseContentDisposition: `attachment; filename="${artifact.filename}"`,
  });
  return getSignedUrl(getStorageClient(config), command, {
    expiresIn: DOWNLOAD_URL_TTL_SECONDS,
  });
}
