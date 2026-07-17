import type { NextApiRequest, NextApiResponse } from "next";
import { isPlainRecord, normalizeCheckoutClientAddress } from "./core";

export class RequestBodyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestBodyError";
  }
}

export function setPrivateResponseHeaders(res: NextApiResponse): void {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

export function sendApiError(
  res: NextApiResponse,
  status: number,
  code: string,
  message: string,
): void {
  setPrivateResponseHeaders(res);
  res.status(status).json({ error: { code, message } });
}

export function requirePost(
  req: NextApiRequest,
  res: NextApiResponse,
): boolean {
  if (req.method === "POST") return true;
  res.setHeader("Allow", "POST");
  sendApiError(res, 405, "method_not_allowed", "Only POST is supported");
  return false;
}

export function requireJsonContentType(
  req: NextApiRequest,
  res: NextApiResponse,
): boolean {
  const contentType = req.headers["content-type"];
  const mediaType =
    typeof contentType === "string"
      ? contentType.split(";", 1)[0].trim().toLowerCase()
      : "";
  if (mediaType === "application/json") return true;
  sendApiError(
    res,
    415,
    "unsupported_media_type",
    "Content-Type must be application/json",
  );
  return false;
}

export function requireSameOrigin(
  req: NextApiRequest,
  res: NextApiResponse,
  siteUrl: string,
): boolean {
  const origin = req.headers.origin;
  const expectedOrigin = new URL(siteUrl).origin;
  if (typeof origin === "string" && origin === expectedOrigin) return true;
  sendApiError(res, 403, "invalid_origin", "Request origin is not allowed");
  return false;
}

export function parseStrictJsonObject(
  body: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[] = allowedKeys,
): Record<string, unknown> {
  if (!isPlainRecord(body))
    throw new RequestBodyError("Expected a JSON object");
  const keys = Object.keys(body);
  if (keys.some((key) => !allowedKeys.includes(key))) {
    throw new RequestBodyError("Request contains unsupported fields");
  }
  if (requiredKeys.some((key) => !Object.hasOwn(body, key))) {
    throw new RequestBodyError("Request is missing required fields");
  }
  return body;
}

export function getSingleHeader(
  req: NextApiRequest,
  name: string,
): string | null {
  const value = req.headers[name.toLowerCase()];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function getCheckoutClientAddress(req: NextApiRequest): string | null {
  const forwardedFor = getSingleHeader(req, "x-forwarded-for")
    ?.split(",", 1)[0]
    .trim();
  const candidates = [
    forwardedFor,
    getSingleHeader(req, "x-real-ip"),
    req.socket.remoteAddress,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeCheckoutClientAddress(candidate);
    if (normalized) return normalized;
  }
  return null;
}

export async function readRawRequestBody(
  req: NextApiRequest,
  maximumBytes = 1_000_000,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let byteLength = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteLength += buffer.length;
    if (byteLength > maximumBytes) {
      throw new RequestBodyError("Request body is too large");
    }
    chunks.push(buffer);
  }
  if (byteLength === 0) throw new RequestBodyError("Request body is empty");
  return Buffer.concat(chunks);
}
