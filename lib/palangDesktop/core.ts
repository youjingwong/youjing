import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

export const PALANG_DESKTOP_PRODUCT_ID = "palang-ic-desktop" as const;
export const PALANG_DESKTOP_PRICE = 29.9 as const;
export const PALANG_DESKTOP_CURRENCY = "MYR" as const;
export const PALANG_DESKTOP_COUNTRY_CODE = "MY" as const;
export const ORDER_ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
export const AIRWALLEX_WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;
export const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;
export const CHECKOUT_RATE_LIMIT_ATTEMPTS = 5;
export const CHECKOUT_RATE_LIMIT_WINDOW_SECONDS = 10 * 60;

export const PURCHASE_LOCALES = ["en", "ms", "zh"] as const;
export type PurchaseLocale = (typeof PURCHASE_LOCALES)[number];
export type OrderStatus = "pending" | "paid" | "failed";

export type PalangDesktopOrder = {
  id: string;
  email: string;
  locale: PurchaseLocale;
  productId: typeof PALANG_DESKTOP_PRODUCT_ID;
  amount: typeof PALANG_DESKTOP_PRICE;
  currency: typeof PALANG_DESKTOP_CURRENCY;
  requestId: string;
  paymentIntentId: string | null;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  emailSentAt: string | null;
};

export type OrderAccessTokenPayload = {
  orderId: string;
  iat: number;
  exp: number;
};

export type ArtifactId = "mac-arm64" | "mac-x64" | "windows-x64";

export type ArtifactDescriptor = {
  id: ArtifactId;
  label: string;
  detail: string;
};

type ArtifactDefinition = ArtifactDescriptor & {
  filename: string;
  contentType: string;
  keyEnvName:
    | "PALANG_DESKTOP_ARTIFACT_MAC_ARM64_KEY"
    | "PALANG_DESKTOP_ARTIFACT_MAC_X64_KEY"
    | "PALANG_DESKTOP_ARTIFACT_WINDOWS_X64_KEY";
};

const ARTIFACTS: ReadonlyArray<Readonly<ArtifactDefinition>> = Object.freeze([
  Object.freeze({
    id: "mac-arm64",
    label: "Download for Mac",
    detail: "Apple silicon (M1 or newer)",
    filename: "Palang-IC-macOS-Apple-Silicon.dmg",
    contentType: "application/x-apple-diskimage",
    keyEnvName: "PALANG_DESKTOP_ARTIFACT_MAC_ARM64_KEY",
  }),
  Object.freeze({
    id: "mac-x64",
    label: "Download for Mac",
    detail: "Intel processor",
    filename: "Palang-IC-macOS-Intel.dmg",
    contentType: "application/x-apple-diskimage",
    keyEnvName: "PALANG_DESKTOP_ARTIFACT_MAC_X64_KEY",
  }),
  Object.freeze({
    id: "windows-x64",
    label: "Download for Windows",
    detail: "64-bit PC",
    filename: "Palang-IC-Windows-x64.exe",
    contentType: "application/vnd.microsoft.portable-executable",
    keyEnvName: "PALANG_DESKTOP_ARTIFACT_WINDOWS_X64_KEY",
  }),
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_PART_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/i;
const DOMAIN_LABEL_PATTERN = /^[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?$/i;

export class OrderAccessTokenError extends Error {
  constructor(message = "Invalid or expired order access token") {
    super(message);
    this.name = "OrderAccessTokenError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireTokenSecret(secret: string): void {
  if (secret.length < 32) {
    throw new Error(
      "PALANG_DESKTOP_TOKEN_SECRET must be at least 32 characters",
    );
  }
}

function signValue(value: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(value).digest();
}

export function isOrderId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isPurchaseLocale(value: unknown): value is PurchaseLocale {
  return (
    typeof value === "string" &&
    (PURCHASE_LOCALES as readonly string[]).includes(value)
  );
}

export function normalizePurchaseEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const email = value.trim().toLowerCase();
  if (
    email.length === 0 ||
    email.length > 254 ||
    /[\u0000-\u0020\u007f]/.test(email)
  ) {
    return null;
  }

  const atIndex = email.indexOf("@");
  if (atIndex <= 0 || atIndex !== email.lastIndexOf("@")) return null;

  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  if (
    localPart.length > 64 ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..") ||
    !LOCAL_PART_PATTERN.test(localPart)
  ) {
    return null;
  }

  const labels = domain.split(".");
  if (
    domain.length > 253 ||
    labels.length < 2 ||
    labels.at(-1)!.length < 2 ||
    labels.some(
      (label) => label.length === 0 || !DOMAIN_LABEL_PATTERN.test(label),
    )
  ) {
    return null;
  }

  return email;
}

export function normalizeCheckoutClientAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const address = value.trim().toLowerCase();
  return address.length <= 64 && isIP(address) !== 0 ? address : null;
}

export function hashCheckoutClientAddress(
  clientAddress: string,
  secret: string,
): string {
  requireTokenSecret(secret);
  const normalized = normalizeCheckoutClientAddress(clientAddress);
  if (!normalized) throw new Error("Invalid client address");
  return createHmac("sha256", secret)
    .update("palang-desktop-checkout:")
    .update(normalized)
    .digest("hex");
}

export type PortalRateLimitOperation = "status" | "download";

export function hashPortalRateLimitKey(
  orderId: string,
  operation: PortalRateLimitOperation,
  secret: string,
): string {
  requireTokenSecret(secret);
  if (!isOrderId(orderId)) throw new Error("Invalid order ID");
  if (operation !== "status" && operation !== "download") {
    throw new Error("Invalid portal operation");
  }
  return createHmac("sha256", secret)
    .update("palang-desktop-portal:")
    .update(operation)
    .update(":")
    .update(orderId)
    .digest("hex");
}

export function getCheckoutRateLimitDecision(
  attemptCount: number,
  ttlSeconds: number,
): { allowed: boolean; retryAfterSeconds: number } {
  if (
    !Number.isSafeInteger(attemptCount) ||
    attemptCount < 1 ||
    !Number.isFinite(ttlSeconds)
  ) {
    throw new Error("Invalid checkout rate-limit state");
  }
  return {
    allowed: attemptCount <= CHECKOUT_RATE_LIMIT_ATTEMPTS,
    retryAfterSeconds: Math.max(
      1,
      Math.min(CHECKOUT_RATE_LIMIT_WINDOW_SECONDS, Math.ceil(ttlSeconds)),
    ),
  };
}

export function createOrderAccessToken(
  orderId: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  ttlSeconds = ORDER_ACCESS_TOKEN_TTL_SECONDS,
): string {
  requireTokenSecret(secret);
  if (!isOrderId(orderId)) throw new Error("Invalid order ID");
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) {
    throw new Error("Invalid token issue time");
  }
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error("Invalid token lifetime");
  }

  const payload: OrderAccessTokenPayload = {
    orderId,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = signValue(encodedPayload, secret).toString("base64url");
  return `${encodedPayload}.${signature}`;
}

export function createOrderAccessTokenForOrder(
  order: PalangDesktopOrder,
  secret: string,
): string {
  const issuedAtMilliseconds = Date.parse(order.paidAt ?? order.createdAt);
  if (!Number.isFinite(issuedAtMilliseconds)) {
    throw new Error("Order creation time is invalid");
  }
  return createOrderAccessToken(
    order.id,
    secret,
    Math.floor(issuedAtMilliseconds / 1000),
  );
}

export function verifyOrderAccessToken(
  token: unknown,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): OrderAccessTokenPayload {
  requireTokenSecret(secret);
  if (typeof token !== "string" || token.length > 2048) {
    throw new OrderAccessTokenError();
  }

  const parts = token.split(".");
  if (parts.length !== 2 || parts.some((part) => part.length === 0)) {
    throw new OrderAccessTokenError();
  }

  const [encodedPayload, encodedSignature] = parts;
  let suppliedSignature: Buffer;
  try {
    suppliedSignature = Buffer.from(encodedSignature, "base64url");
  } catch {
    throw new OrderAccessTokenError();
  }
  const expectedSignature = signValue(encodedPayload, secret);
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    throw new OrderAccessTokenError();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString());
  } catch {
    throw new OrderAccessTokenError();
  }

  if (!isRecord(payload)) throw new OrderAccessTokenError();
  const keys = Object.keys(payload).sort();
  if (keys.join(",") !== "exp,iat,orderId") {
    throw new OrderAccessTokenError();
  }
  if (
    !isOrderId(payload.orderId) ||
    !Number.isSafeInteger(payload.iat) ||
    !Number.isSafeInteger(payload.exp) ||
    (payload.iat as number) < 0 ||
    (payload.exp as number) <= (payload.iat as number) ||
    !Number.isSafeInteger(nowSeconds) ||
    nowSeconds < (payload.iat as number) - 60 ||
    nowSeconds >= (payload.exp as number)
  ) {
    throw new OrderAccessTokenError();
  }

  return payload as OrderAccessTokenPayload;
}

export function createAirwallexWebhookSignature(
  rawBody: string | Buffer,
  timestamp: string,
  secret: string,
): string {
  return createHmac("sha256", secret)
    .update(timestamp)
    .update(rawBody)
    .digest("hex");
}

export function verifyAirwallexWebhookSignature({
  rawBody,
  timestamp,
  signature,
  secret,
  nowMilliseconds = Date.now(),
  toleranceMilliseconds = AIRWALLEX_WEBHOOK_TOLERANCE_MS,
}: {
  rawBody: string | Buffer;
  timestamp: unknown;
  signature: unknown;
  secret: string;
  nowMilliseconds?: number;
  toleranceMilliseconds?: number;
}): boolean {
  if (
    typeof timestamp !== "string" ||
    !/^\d{10,16}$/.test(timestamp) ||
    typeof signature !== "string" ||
    !/^[0-9a-f]{64}$/i.test(signature) ||
    secret.length === 0 ||
    !Number.isSafeInteger(nowMilliseconds) ||
    !Number.isSafeInteger(toleranceMilliseconds) ||
    toleranceMilliseconds < 0
  ) {
    return false;
  }

  const timestampMilliseconds = Number(timestamp);
  if (
    !Number.isSafeInteger(timestampMilliseconds) ||
    Math.abs(nowMilliseconds - timestampMilliseconds) > toleranceMilliseconds
  ) {
    return false;
  }

  const expected = Buffer.from(
    createAirwallexWebhookSignature(rawBody, timestamp, secret),
    "hex",
  );
  const supplied = Buffer.from(signature, "hex");
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

export type PaymentValidationResult =
  | { valid: true }
  | {
      valid: false;
      reason:
        | "order_product"
        | "intent_id"
        | "order_id"
        | "product"
        | "metadata_order_id"
        | "amount"
        | "currency"
        | "status";
    };

export type QueuedPaymentIntent = {
  id: unknown;
  merchant_order_id: unknown;
  metadata: {
    product: unknown;
    order_id: unknown;
  } | null;
  amount: unknown;
  currency: unknown;
  status: unknown;
};

export type FulfillmentQueueMessage = {
  version: 1;
  eventId: string;
  paymentIntent: QueuedPaymentIntent;
};

export class FulfillmentQueueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FulfillmentQueueError";
  }
}

function minimizePaymentIntent(value: unknown): QueuedPaymentIntent {
  if (!isPlainRecord(value)) {
    throw new FulfillmentQueueError("PaymentIntent payload is malformed");
  }
  const metadata = isPlainRecord(value.metadata) ? value.metadata : null;
  return {
    id: value.id,
    merchant_order_id: value.merchant_order_id,
    metadata: metadata
      ? { product: metadata.product, order_id: metadata.order_id }
      : null,
    amount: value.amount,
    currency: value.currency,
    status: value.status,
  };
}

export function createFulfillmentQueueMessage(
  eventId: unknown,
  paymentIntent: unknown,
): FulfillmentQueueMessage {
  if (
    typeof eventId !== "string" ||
    eventId.length === 0 ||
    eventId.length > 512
  ) {
    throw new FulfillmentQueueError("Payment event has no valid ID");
  }
  return {
    version: 1,
    eventId,
    paymentIntent: minimizePaymentIntent(paymentIntent),
  };
}

export function parseFulfillmentQueueMessage(
  value: unknown,
): FulfillmentQueueMessage {
  if (
    !isPlainRecord(value) ||
    value.version !== 1 ||
    typeof value.eventId !== "string" ||
    value.eventId.length === 0 ||
    value.eventId.length > 512 ||
    !isPlainRecord(value.paymentIntent)
  ) {
    throw new FulfillmentQueueError("Fulfillment message is malformed");
  }
  return createFulfillmentQueueMessage(value.eventId, value.paymentIntent);
}

export function parseFulfillmentFailureCallback(
  value: unknown,
): FulfillmentQueueMessage {
  if (
    !isPlainRecord(value) ||
    typeof value.sourceBody !== "string" ||
    value.sourceBody.length === 0 ||
    value.sourceBody.length > 128_000 ||
    value.sourceBody.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value.sourceBody)
  ) {
    throw new FulfillmentQueueError("Failure callback is malformed");
  }

  try {
    const decoded = Buffer.from(value.sourceBody, "base64").toString("utf8");
    return parseFulfillmentQueueMessage(JSON.parse(decoded));
  } catch (error) {
    if (error instanceof FulfillmentQueueError) throw error;
    throw new FulfillmentQueueError("Failure callback is malformed");
  }
}

export function validateSucceededPaymentIntent(
  order: PalangDesktopOrder,
  paymentIntent: unknown,
): PaymentValidationResult {
  if (order.productId !== PALANG_DESKTOP_PRODUCT_ID) {
    return { valid: false, reason: "order_product" };
  }
  if (!isRecord(paymentIntent)) return { valid: false, reason: "intent_id" };
  if (
    order.paymentIntentId === null ||
    paymentIntent.id !== order.paymentIntentId
  ) {
    return { valid: false, reason: "intent_id" };
  }
  if (paymentIntent.merchant_order_id !== order.id) {
    return { valid: false, reason: "order_id" };
  }
  if (
    !isRecord(paymentIntent.metadata) ||
    paymentIntent.metadata.product !== PALANG_DESKTOP_PRODUCT_ID
  ) {
    return { valid: false, reason: "product" };
  }
  if (paymentIntent.metadata.order_id !== order.id) {
    return { valid: false, reason: "metadata_order_id" };
  }
  if (
    paymentIntent.amount !== PALANG_DESKTOP_PRICE ||
    order.amount !== PALANG_DESKTOP_PRICE
  ) {
    return { valid: false, reason: "amount" };
  }
  if (
    paymentIntent.currency !== PALANG_DESKTOP_CURRENCY ||
    order.currency !== PALANG_DESKTOP_CURRENCY
  ) {
    return { valid: false, reason: "currency" };
  }
  if (paymentIntent.status !== "SUCCEEDED") {
    return { valid: false, reason: "status" };
  }
  return { valid: true };
}

export function getArtifactDefinition(
  value: unknown,
): Readonly<ArtifactDefinition> | null {
  if (typeof value !== "string") return null;
  return ARTIFACTS.find((artifact) => artifact.id === value) ?? null;
}

export function listArtifactDescriptors(): ArtifactDescriptor[] {
  return ARTIFACTS.map(({ id, label, detail }) => ({ id, label, detail }));
}

export function buildPurchasePortalUrl(
  siteUrl: string,
  locale: PurchaseLocale,
): string {
  const localePrefix = locale === "en" ? "" : `/${locale}`;
  return new URL(
    `${localePrefix}/palang-ic/desktop/success`,
    siteUrl,
  ).toString();
}

export function addOrderTokenToPortalUrl(
  portalUrl: string,
  token: string,
): string {
  const url = new URL(portalUrl);
  url.hash = `token=${token}`;
  return url.toString();
}

export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return isRecord(value);
}
