import { PALANG_DESKTOP_PRODUCT_ID, type PalangDesktopOrder } from "./core";
import { getAirwallexConfig, type AirwallexConfig } from "./config";

type CachedAccessToken = {
  cacheKey: string;
  token: string;
  expiresAtMilliseconds: number;
};

export type CreatedPaymentIntent = {
  id: string;
  clientSecret: string;
};

export class AirwallexIntegrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AirwallexIntegrationError";
  }
}

let cachedAccessToken: CachedAccessToken | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tokenCacheKey(config: AirwallexConfig): string {
  return `${config.environment}:${config.clientId}`;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AirwallexIntegrationError("Airwallex returned invalid JSON");
  }
  if (!isRecord(payload)) {
    throw new AirwallexIntegrationError(
      "Airwallex returned an invalid response",
    );
  }
  return payload;
}

async function obtainAccessToken(config: AirwallexConfig): Promise<string> {
  const cacheKey = tokenCacheKey(config);
  if (
    cachedAccessToken?.cacheKey === cacheKey &&
    cachedAccessToken.expiresAtMilliseconds > Date.now() + 60_000
  ) {
    return cachedAccessToken.token;
  }

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/api/v1/authentication/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-client-id": config.clientId,
        "x-api-key": config.apiKey,
      },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new AirwallexIntegrationError("Could not connect to Airwallex");
  }

  const payload = await readJson(response);
  if (!response.ok) {
    throw new AirwallexIntegrationError(
      `Airwallex authentication failed (${response.status})`,
    );
  }
  if (typeof payload.token !== "string" || payload.token.length === 0) {
    throw new AirwallexIntegrationError("Airwallex did not return a token");
  }

  const expiresAtMilliseconds =
    typeof payload.expires_at === "string"
      ? Date.parse(payload.expires_at)
      : Number.NaN;
  if (!Number.isFinite(expiresAtMilliseconds)) {
    throw new AirwallexIntegrationError(
      "Airwallex returned an invalid token expiry",
    );
  }
  cachedAccessToken = {
    cacheKey,
    token: payload.token,
    expiresAtMilliseconds,
  };
  return payload.token;
}

export async function createHostedPaymentIntent(
  order: PalangDesktopOrder,
  successUrl: string,
): Promise<CreatedPaymentIntent> {
  const config = getAirwallexConfig();
  const accessToken = await obtainAccessToken(config);

  let response: Response;
  try {
    response = await fetch(
      `${config.baseUrl}/api/v1/pa/payment_intents/create`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          request_id: order.requestId,
          merchant_order_id: order.id,
          amount: order.amount,
          currency: order.currency,
          return_url: successUrl,
          customer: {
            email: order.email,
          },
          metadata: {
            product: PALANG_DESKTOP_PRODUCT_ID,
            order_id: order.id,
          },
        }),
        signal: AbortSignal.timeout(12_000),
      },
    );
  } catch {
    throw new AirwallexIntegrationError("Could not create the payment");
  }

  const payload = await readJson(response);
  if (!response.ok) {
    throw new AirwallexIntegrationError(
      `Airwallex payment creation failed (${response.status})`,
    );
  }
  if (
    typeof payload.id !== "string" ||
    payload.id.length === 0 ||
    typeof payload.client_secret !== "string" ||
    payload.client_secret.length === 0
  ) {
    throw new AirwallexIntegrationError(
      "Airwallex returned an incomplete PaymentIntent",
    );
  }
  return { id: payload.id, clientSecret: payload.client_secret };
}
