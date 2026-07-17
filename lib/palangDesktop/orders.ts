import { randomUUID } from "node:crypto";
import {
  CHECKOUT_RATE_LIMIT_WINDOW_SECONDS,
  PALANG_DESKTOP_CURRENCY,
  PALANG_DESKTOP_PRICE,
  PALANG_DESKTOP_PRODUCT_ID,
  getCheckoutRateLimitDecision,
  isOrderId,
  isPurchaseLocale,
  type PalangDesktopOrder,
  type PortalRateLimitOperation,
  type PurchaseLocale,
} from "./core";
import { getRedisConfig } from "./config";

const ORDER_KEY_PREFIX = "palang:desktop:order:";
const CHECKOUT_LIMIT_KEY_PREFIX = "palang:desktop:checkout-limit:";
const PORTAL_LIMIT_KEY_PREFIX = "palang:desktop:portal-limit:";
const PENDING_ORDER_RETENTION_SECONDS = 30 * 24 * 60 * 60;
const PAID_ORDER_RETENTION_SECONDS = 400 * 24 * 60 * 60;
const PORTAL_RATE_LIMITS: Record<
  PortalRateLimitOperation,
  { attempts: number; windowSeconds: number }
> = {
  status: { attempts: 60, windowSeconds: 60 },
  download: { attempts: 12, windowSeconds: 60 * 60 },
};

export class OrderStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderStoreError";
  }
}

export class CheckoutRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Too many checkout attempts");
    this.name = "CheckoutRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class PortalRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Too many portal requests");
    this.name = "PortalRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function orderKey(orderId: string): string {
  if (!isOrderId(orderId)) throw new OrderStoreError("Invalid order ID");
  return `${ORDER_KEY_PREFIX}${orderId}`;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function parseOrderObject(value: unknown): PalangDesktopOrder {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new OrderStoreError("Stored order is malformed");
  }
  const order = value as Record<string, unknown>;
  if (
    !isOrderId(order.id) ||
    typeof order.email !== "string" ||
    !isPurchaseLocale(order.locale) ||
    order.productId !== PALANG_DESKTOP_PRODUCT_ID ||
    order.amount !== PALANG_DESKTOP_PRICE ||
    order.currency !== PALANG_DESKTOP_CURRENCY ||
    !isOrderId(order.requestId) ||
    !isNullableString(order.paymentIntentId) ||
    (order.status !== "pending" &&
      order.status !== "paid" &&
      order.status !== "failed") ||
    typeof order.createdAt !== "string" ||
    typeof order.updatedAt !== "string" ||
    !isNullableString(order.paidAt) ||
    !isNullableString(order.emailSentAt)
  ) {
    throw new OrderStoreError("Stored order is malformed");
  }
  return order as PalangDesktopOrder;
}

function parseStoredOrder(value: unknown): PalangDesktopOrder | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new OrderStoreError("Unexpected Redis response");
  }
  try {
    return parseOrderObject(JSON.parse(value));
  } catch (error) {
    if (error instanceof OrderStoreError) throw error;
    throw new OrderStoreError("Stored order is not valid JSON");
  }
}

async function redisCommand<T>(command: Array<string | number>): Promise<T> {
  const config = getRedisConfig();
  let response: Response;
  try {
    response = await fetch(config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new OrderStoreError("Order storage is unavailable");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new OrderStoreError("Order storage returned an invalid response");
  }
  if (
    !response.ok ||
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload) ||
    "error" in payload
  ) {
    throw new OrderStoreError("Order storage command failed");
  }
  return (payload as { result: T }).result;
}

async function incrementFixedWindowRateLimit(
  key: string,
  windowSeconds: number,
): Promise<{ count: number; ttl: number }> {
  const script = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if count == 1 or ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return cjson.encode({count = count, ttl = ttl})
`;
  const result = await redisCommand<string>([
    "EVAL",
    script,
    1,
    key,
    windowSeconds,
  ]);

  let rate: unknown;
  try {
    rate = JSON.parse(result);
  } catch {
    throw new OrderStoreError("Rate limiter returned invalid data");
  }
  if (
    typeof rate !== "object" ||
    rate === null ||
    Array.isArray(rate) ||
    typeof (rate as Record<string, unknown>).count !== "number" ||
    typeof (rate as Record<string, unknown>).ttl !== "number"
  ) {
    throw new OrderStoreError("Rate limiter returned invalid data");
  }
  return rate as { count: number; ttl: number };
}

export async function enforceCheckoutRateLimit(
  hashedClientAddress: string,
): Promise<void> {
  if (!/^[0-9a-f]{64}$/.test(hashedClientAddress)) {
    throw new OrderStoreError("Invalid checkout rate-limit key");
  }
  const { count, ttl } = await incrementFixedWindowRateLimit(
    `${CHECKOUT_LIMIT_KEY_PREFIX}${hashedClientAddress}`,
    CHECKOUT_RATE_LIMIT_WINDOW_SECONDS,
  );
  const decision = getCheckoutRateLimitDecision(count, ttl);
  if (!decision.allowed) {
    throw new CheckoutRateLimitError(decision.retryAfterSeconds);
  }
}

export async function enforcePortalRateLimit(
  operation: PortalRateLimitOperation,
  hashedOrderKey: string,
): Promise<void> {
  if (!/^[0-9a-f]{64}$/.test(hashedOrderKey)) {
    throw new OrderStoreError("Invalid portal rate-limit key");
  }
  const policy = PORTAL_RATE_LIMITS[operation];
  const { count, ttl } = await incrementFixedWindowRateLimit(
    `${PORTAL_LIMIT_KEY_PREFIX}${operation}:${hashedOrderKey}`,
    policy.windowSeconds,
  );
  if (count > policy.attempts) {
    throw new PortalRateLimitError(
      Math.max(1, Math.min(policy.windowSeconds, Math.ceil(ttl))),
    );
  }
}

async function evalOrderScript(
  script: string,
  orderId: string,
  ...args: string[]
): Promise<PalangDesktopOrder | null> {
  const result = await redisCommand<string | null>([
    "EVAL",
    script,
    1,
    orderKey(orderId),
    ...args,
  ]);
  return parseStoredOrder(result);
}

export function makePendingOrder(
  email: string,
  locale: PurchaseLocale,
  now = new Date(),
): PalangDesktopOrder {
  const timestamp = now.toISOString();
  return {
    id: randomUUID(),
    email,
    locale,
    productId: PALANG_DESKTOP_PRODUCT_ID,
    amount: PALANG_DESKTOP_PRICE,
    currency: PALANG_DESKTOP_CURRENCY,
    requestId: randomUUID(),
    paymentIntentId: null,
    status: "pending",
    createdAt: timestamp,
    updatedAt: timestamp,
    paidAt: null,
    emailSentAt: null,
  };
}

export async function createOrder(order: PalangDesktopOrder): Promise<void> {
  const result = await redisCommand<string | null>([
    "SET",
    orderKey(order.id),
    JSON.stringify(order),
    "NX",
    "EX",
    PENDING_ORDER_RETENTION_SECONDS,
  ]);
  if (result !== "OK") throw new OrderStoreError("Order ID already exists");
}

export async function getOrder(
  orderId: string,
): Promise<PalangDesktopOrder | null> {
  const result = await redisCommand<string | null>(["GET", orderKey(orderId)]);
  return parseStoredOrder(result);
}

export async function attachPaymentIntent(
  orderId: string,
  paymentIntentId: string,
  now = new Date(),
): Promise<PalangDesktopOrder> {
  if (!paymentIntentId) throw new OrderStoreError("Missing PaymentIntent ID");
  const script = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local order = cjson.decode(raw)
if type(order.paymentIntentId) == 'string' and order.paymentIntentId ~= ARGV[1] then
  return '__conflict__'
end
order.paymentIntentId = ARGV[1]
order.updatedAt = ARGV[2]
local encoded = cjson.encode(order)
redis.call('SET', KEYS[1], encoded, 'KEEPTTL')
return encoded
`;
  const result = await redisCommand<string | null>([
    "EVAL",
    script,
    1,
    orderKey(orderId),
    paymentIntentId,
    now.toISOString(),
  ]);
  if (result === "__conflict__") {
    throw new OrderStoreError("Order already has a different PaymentIntent");
  }
  const order = parseStoredOrder(result);
  if (!order) throw new OrderStoreError("Order not found");
  return order;
}

export async function markOrderPaid(
  orderId: string,
  now = new Date(),
): Promise<PalangDesktopOrder> {
  const script = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local order = cjson.decode(raw)
if order.status ~= 'paid' then
  order.status = 'paid'
  order.paidAt = ARGV[1]
  order.updatedAt = ARGV[1]
  local encoded = cjson.encode(order)
  redis.call('SET', KEYS[1], encoded, 'EX', ARGV[2])
  return encoded
end
local encoded = cjson.encode(order)
redis.call('SET', KEYS[1], encoded, 'KEEPTTL')
return encoded
`;
  const order = await evalOrderScript(
    script,
    orderId,
    now.toISOString(),
    String(PAID_ORDER_RETENTION_SECONDS),
  );
  if (!order) throw new OrderStoreError("Order not found");
  return order;
}

export async function markOrderFailed(
  orderId: string,
  now = new Date(),
): Promise<PalangDesktopOrder> {
  const script = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local order = cjson.decode(raw)
if order.status == 'pending' then
  order.status = 'failed'
  order.updatedAt = ARGV[1]
end
local encoded = cjson.encode(order)
redis.call('SET', KEYS[1], encoded, 'KEEPTTL')
return encoded
`;
  const order = await evalOrderScript(script, orderId, now.toISOString());
  if (!order) throw new OrderStoreError("Order not found");
  return order;
}

export async function markOrderEmailSent(
  orderId: string,
  now = new Date(),
): Promise<PalangDesktopOrder> {
  const script = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local order = cjson.decode(raw)
if order.status ~= 'paid' then return '__not_paid__' end
if order.emailSentAt == cjson.null then
  order.emailSentAt = ARGV[1]
  order.updatedAt = ARGV[1]
end
local encoded = cjson.encode(order)
redis.call('SET', KEYS[1], encoded, 'KEEPTTL')
return encoded
`;
  const result = await redisCommand<string | null>([
    "EVAL",
    script,
    1,
    orderKey(orderId),
    now.toISOString(),
  ]);
  if (result === "__not_paid__") {
    throw new OrderStoreError("Cannot record email for an unpaid order");
  }
  const order = parseStoredOrder(result);
  if (!order) throw new OrderStoreError("Order not found");
  return order;
}
