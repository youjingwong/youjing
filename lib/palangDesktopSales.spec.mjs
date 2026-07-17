import assert from "node:assert/strict";
import test from "node:test";
import {
  AIRWALLEX_WEBHOOK_TOLERANCE_MS,
  PALANG_DESKTOP_CURRENCY,
  PALANG_DESKTOP_PRICE,
  PALANG_DESKTOP_PRODUCT_ID,
  OrderAccessTokenError,
  FulfillmentQueueError,
  addOrderTokenToPortalUrl,
  buildPurchasePortalUrl,
  createAirwallexWebhookSignature,
  createFulfillmentQueueMessage,
  createOrderAccessToken,
  createOrderAccessTokenForOrder,
  getArtifactDefinition,
  getCheckoutRateLimitDecision,
  hashCheckoutClientAddress,
  hashPortalRateLimitKey,
  listArtifactDescriptors,
  normalizePurchaseEmail,
  normalizeCheckoutClientAddress,
  parseFulfillmentFailureCallback,
  parseFulfillmentQueueMessage,
  validateSucceededPaymentIntent,
  verifyAirwallexWebhookSignature,
  verifyOrderAccessToken,
} from "./palangDesktop/core.ts";
import { isPrivateToolPath } from "./privacy.ts";
import {
  ServerConfigurationError,
  assertSafeSalesEnvironment,
} from "./palangDesktop/config.ts";

const ORDER_ID = "123e4567-e89b-42d3-a456-426614174000";
const REQUEST_ID = "123e4567-e89b-42d3-b456-426614174001";
const TOKEN_SECRET = "this-is-a-test-secret-with-32-bytes-minimum";
const WEBHOOK_SECRET = "airwallex-webhook-secret";

const order = {
  id: ORDER_ID,
  email: "buyer@example.com",
  locale: "en",
  productId: PALANG_DESKTOP_PRODUCT_ID,
  amount: PALANG_DESKTOP_PRICE,
  currency: PALANG_DESKTOP_CURRENCY,
  requestId: REQUEST_ID,
  paymentIntentId: "int_test",
  status: "pending",
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z",
  paidAt: null,
  emailSentAt: null,
};

const succeededIntent = {
  id: "int_test",
  request_id: REQUEST_ID,
  merchant_order_id: ORDER_ID,
  amount: 29.9,
  currency: "MYR",
  status: "SUCCEEDED",
  metadata: { product: "palang-ic-desktop", order_id: ORDER_ID },
};

test("order access tokens contain only orderId, iat, and exp", () => {
  const token = createOrderAccessToken(
    ORDER_ID,
    TOKEN_SECRET,
    1_700_000_000,
    60,
  );
  const [payloadPart] = token.split(".");
  const decoded = JSON.parse(Buffer.from(payloadPart, "base64url").toString());

  assert.deepEqual(Object.keys(decoded).sort(), ["exp", "iat", "orderId"]);
  assert.equal(decoded.email, undefined);
  assert.deepEqual(verifyOrderAccessToken(token, TOKEN_SECRET, 1_700_000_059), {
    orderId: ORDER_ID,
    iat: 1_700_000_000,
    exp: 1_700_000_060,
  });
});

test("order access tokens reject tampering and expiry", () => {
  const token = createOrderAccessToken(
    ORDER_ID,
    TOKEN_SECRET,
    1_700_000_000,
    60,
  );
  const [payload, signature] = token.split(".");
  const alteredPayload = `${payload.slice(0, -1)}${payload.endsWith("a") ? "b" : "a"}`;
  const alteredSignature = `${signature.slice(0, -1)}${signature.endsWith("a") ? "b" : "a"}`;

  assert.throws(
    () =>
      verifyOrderAccessToken(`${alteredPayload}.${signature}`, TOKEN_SECRET),
    OrderAccessTokenError,
  );
  assert.throws(
    () =>
      verifyOrderAccessToken(`${payload}.${alteredSignature}`, TOKEN_SECRET),
    OrderAccessTokenError,
  );
  assert.throws(
    () => verifyOrderAccessToken(token, TOKEN_SECRET, 1_700_000_060),
    OrderAccessTokenError,
  );
});

test("order delivery tokens are stable across webhook retries", () => {
  const first = createOrderAccessTokenForOrder(order, TOKEN_SECRET);
  const retry = createOrderAccessTokenForOrder(order, TOKEN_SECRET);

  assert.equal(first, retry);
  assert.deepEqual(verifyOrderAccessToken(first, TOKEN_SECRET, 1_784_246_401), {
    orderId: ORDER_ID,
    iat: 1_784_246_400,
    exp: 1_786_838_400,
  });
});

test("Airwallex webhook verification binds timestamp and exact raw body", () => {
  const now = 1_700_000_000_000;
  const timestamp = String(now);
  const rawBody = '{"name":"payment_intent.succeeded","data":{"a":1}}';
  const signature = createAirwallexWebhookSignature(
    rawBody,
    timestamp,
    WEBHOOK_SECRET,
  );

  assert.equal(
    verifyAirwallexWebhookSignature({
      rawBody,
      timestamp,
      signature,
      secret: WEBHOOK_SECRET,
      nowMilliseconds: now,
    }),
    true,
  );
  assert.equal(
    verifyAirwallexWebhookSignature({
      rawBody: `${rawBody} `,
      timestamp,
      signature,
      secret: WEBHOOK_SECRET,
      nowMilliseconds: now,
    }),
    false,
  );
  assert.equal(
    verifyAirwallexWebhookSignature({
      rawBody,
      timestamp,
      signature: `0${signature.slice(1)}`,
      secret: WEBHOOK_SECRET,
      nowMilliseconds: now,
    }),
    false,
  );
});

test("Airwallex webhook verification enforces the five-minute timestamp window", () => {
  const now = 1_700_000_000_000;
  const boundary = String(now - AIRWALLEX_WEBHOOK_TOLERANCE_MS);
  const stale = String(now - AIRWALLEX_WEBHOOK_TOLERANCE_MS - 1);

  assert.equal(
    verifyAirwallexWebhookSignature({
      rawBody: "{}",
      timestamp: boundary,
      signature: createAirwallexWebhookSignature(
        "{}",
        boundary,
        WEBHOOK_SECRET,
      ),
      secret: WEBHOOK_SECRET,
      nowMilliseconds: now,
    }),
    true,
  );
  assert.equal(
    verifyAirwallexWebhookSignature({
      rawBody: "{}",
      timestamp: stale,
      signature: createAirwallexWebhookSignature("{}", stale, WEBHOOK_SECRET),
      secret: WEBHOOK_SECRET,
      nowMilliseconds: now,
    }),
    false,
  );
  assert.equal(
    verifyAirwallexWebhookSignature({
      rawBody: "{}",
      timestamp: "not-a-timestamp",
      signature: "0".repeat(64),
      secret: WEBHOOK_SECRET,
      nowMilliseconds: now,
    }),
    false,
  );
});

test("purchase email validation normalizes safe addresses and rejects unsafe input", () => {
  assert.equal(
    normalizePurchaseEmail("  Buyer.Name+desktop@Example.COM  "),
    "buyer.name+desktop@example.com",
  );
  for (const value of [
    "buyer@example",
    "buyer@@example.com",
    ".buyer@example.com",
    "buyer..name@example.com",
    "buyer@example..com",
    "buyer@example.com\r\nBcc:attacker@example.com",
    123,
    null,
  ]) {
    assert.equal(normalizePurchaseEmail(value), null);
  }
});

test("checkout rate limiting stores only a keyed hash and allows five attempts", () => {
  const address = normalizeCheckoutClientAddress(" 203.0.113.42 ");
  assert.equal(address, "203.0.113.42");
  const hash = hashCheckoutClientAddress(address, TOKEN_SECRET);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash.includes(address), false);
  assert.notEqual(
    hash,
    hashCheckoutClientAddress("203.0.113.43", TOKEN_SECRET),
  );
  assert.equal(normalizeCheckoutClientAddress("not-an-ip"), null);

  assert.deepEqual(getCheckoutRateLimitDecision(5, 421.2), {
    allowed: true,
    retryAfterSeconds: 422,
  });
  assert.deepEqual(getCheckoutRateLimitDecision(6, 421.2), {
    allowed: false,
    retryAfterSeconds: 422,
  });
});

test("portal endpoint budgets use operation-specific keyed hashes", () => {
  const statusHash = hashPortalRateLimitKey(ORDER_ID, "status", TOKEN_SECRET);
  const downloadHash = hashPortalRateLimitKey(
    ORDER_ID,
    "download",
    TOKEN_SECRET,
  );
  assert.match(statusHash, /^[0-9a-f]{64}$/);
  assert.match(downloadHash, /^[0-9a-f]{64}$/);
  assert.notEqual(statusHash, downloadHash);
  assert.equal(statusHash.includes(ORDER_ID), false);
});

test("succeeded payments must exactly match the stored product and order", () => {
  assert.deepEqual(validateSucceededPaymentIntent(order, succeededIntent), {
    valid: true,
  });

  const changes = [
    ["intent_id", { id: "int_other" }],
    ["order_id", { merchant_order_id: "123e4567-e89b-42d3-a456-426614174999" }],
    [
      "product",
      { metadata: { product: "another-product", order_id: ORDER_ID } },
    ],
    [
      "metadata_order_id",
      {
        metadata: {
          product: "palang-ic-desktop",
          order_id: "123e4567-e89b-42d3-a456-426614174999",
        },
      },
    ],
    ["amount", { amount: 29.89 }],
    ["currency", { currency: "USD" }],
    ["status", { status: "PENDING" }],
  ];
  for (const [reason, change] of changes) {
    assert.deepEqual(
      validateSucceededPaymentIntent(order, {
        ...succeededIntent,
        ...change,
      }),
      { valid: false, reason },
    );
  }

  assert.deepEqual(
    validateSucceededPaymentIntent(order, {
      ...succeededIntent,
      request_id: "request-id-from-a-later-payment-operation",
    }),
    { valid: true },
  );
});

test("fulfillment queue messages retain only payment matching fields", () => {
  const message = createFulfillmentQueueMessage("evt_test", {
    ...succeededIntent,
    request_id: REQUEST_ID,
    customer: { email: "buyer@example.com" },
    latest_payment_attempt: { card: { number: "should-not-be-queued" } },
  });

  assert.deepEqual(message, {
    version: 1,
    eventId: "evt_test",
    paymentIntent: {
      id: "int_test",
      merchant_order_id: ORDER_ID,
      metadata: { product: PALANG_DESKTOP_PRODUCT_ID, order_id: ORDER_ID },
      amount: PALANG_DESKTOP_PRICE,
      currency: PALANG_DESKTOP_CURRENCY,
      status: "SUCCEEDED",
    },
  });
  assert.deepEqual(parseFulfillmentQueueMessage(message), message);
  assert.deepEqual(
    parseFulfillmentFailureCallback({
      sourceBody: Buffer.from(JSON.stringify(message)).toString("base64"),
    }),
    message,
  );
  assert.throws(
    () => createFulfillmentQueueMessage("", succeededIntent),
    FulfillmentQueueError,
  );
  assert.throws(
    () => parseFulfillmentFailureCallback({ sourceBody: "not base64" }),
    FulfillmentQueueError,
  );
});

test("artifact downloads use a closed allowlist without exposing object keys", () => {
  assert.equal(getArtifactDefinition("mac-arm64")?.id, "mac-arm64");
  assert.equal(getArtifactDefinition("mac-x64")?.id, "mac-x64");
  assert.equal(getArtifactDefinition("windows-x64")?.id, "windows-x64");
  assert.equal(getArtifactDefinition("../../private/object"), null);
  assert.equal(getArtifactDefinition("windows"), null);

  const publicDescriptors = listArtifactDescriptors();
  assert.deepEqual(
    publicDescriptors.map(({ id }) => id),
    ["mac-arm64", "mac-x64", "windows-x64"],
  );
  assert.equal("keyEnvName" in publicDescriptors[0], false);
  assert.equal("filename" in publicDescriptors[0], false);
});

test("success and email portal URLs are locale-aware and keep tokens out of requests", () => {
  assert.equal(
    buildPurchasePortalUrl("https://palang.example", "en"),
    "https://palang.example/palang-ic/desktop/success",
  );
  assert.equal(
    buildPurchasePortalUrl("https://palang.example", "ms"),
    "https://palang.example/ms/palang-ic/desktop/success",
  );
  const fragmentUrl = addOrderTokenToPortalUrl(
    "https://palang.example/palang-ic/desktop/success",
    "signed.token",
  );
  assert.equal(new URL(fragmentUrl).search, "");
  assert.equal(new URL(fragmentUrl).hash, "#token=signed.token");
});

test("purchase success pages suppress analytics while the sales page remains measurable", () => {
  assert.equal(isPrivateToolPath("/palang-ic/desktop"), false);
  assert.equal(
    isPrivateToolPath("/palang-ic/desktop/success#token=signed"),
    true,
  );
  assert.equal(
    isPrivateToolPath("/ms/palang-ic/desktop/success?payment=returned"),
    true,
  );
});

test("production payments and sandbox origins cannot be mixed", () => {
  assert.doesNotThrow(() =>
    assertSafeSalesEnvironment("https://www.youjing.dev", "prod"),
  );
  assert.doesNotThrow(() =>
    assertSafeSalesEnvironment("https://preview.example", "demo"),
  );
  assert.throws(
    () => assertSafeSalesEnvironment("https://www.youjing.dev", "demo"),
    ServerConfigurationError,
  );
  assert.throws(
    () => assertSafeSalesEnvironment("http://localhost:3000", "prod"),
    ServerConfigurationError,
  );
});
