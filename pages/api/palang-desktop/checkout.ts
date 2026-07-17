import type { NextApiRequest, NextApiResponse } from "next";
import {
  PALANG_DESKTOP_COUNTRY_CODE,
  PALANG_DESKTOP_CURRENCY,
  buildPurchasePortalUrl,
  createOrderAccessTokenForOrder,
  hashCheckoutClientAddress,
  isPurchaseLocale,
  normalizePurchaseEmail,
} from "../../../lib/palangDesktop/core";
import {
  ServerConfigurationError,
  assertSafeSalesEnvironment,
  getAirwallexConfig,
  getEmailConfig,
  getAirwallexWebhookSecret,
  getOrderTokenSecret,
  getQstashConfig,
  getSiteUrl,
  requireSalesEnabled,
} from "../../../lib/palangDesktop/config";
import { createHostedPaymentIntent } from "../../../lib/palangDesktop/airwallex";
import { verifyArtifactReadiness } from "../../../lib/palangDesktop/storage";
import {
  RequestBodyError,
  getCheckoutClientAddress,
  parseStrictJsonObject,
  requireJsonContentType,
  requirePost,
  requireSameOrigin,
  sendApiError,
  setPrivateResponseHeaders,
} from "../../../lib/palangDesktop/http";
import {
  CheckoutRateLimitError,
  attachPaymentIntent,
  createOrder,
  enforceCheckoutRateLimit,
  makePendingOrder,
  markOrderFailed,
} from "../../../lib/palangDesktop/orders";

type CheckoutResponse = {
  orderToken: string;
  checkout: {
    intentId: string;
    clientSecret: string;
    currency: typeof PALANG_DESKTOP_CURRENCY;
    countryCode: typeof PALANG_DESKTOP_COUNTRY_CODE;
    environment: "demo" | "prod";
    successUrl: string;
  };
};

export const config = {
  api: {
    bodyParser: { sizeLimit: "8kb" },
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CheckoutResponse | { error: unknown }>,
): Promise<void> {
  setPrivateResponseHeaders(res);
  if (!requirePost(req, res) || !requireJsonContentType(req, res)) return;

  let siteUrl: string;
  let airwallex: ReturnType<typeof getAirwallexConfig>;
  try {
    requireSalesEnabled();
    siteUrl = getSiteUrl();
    airwallex = getAirwallexConfig();
    assertSafeSalesEnvironment(siteUrl, airwallex.environment);
  } catch (error) {
    if (error instanceof ServerConfigurationError) {
      sendApiError(res, 503, "not_configured", "Purchasing is not configured");
      return;
    }
    throw error;
  }
  if (!requireSameOrigin(req, res, siteUrl)) return;

  let body: Record<string, unknown>;
  try {
    body = parseStrictJsonObject(req.body, ["email", "locale"]);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      sendApiError(res, 400, "invalid_request", error.message);
      return;
    }
    throw error;
  }
  const email = normalizePurchaseEmail(body.email);
  if (!email) {
    sendApiError(res, 400, "invalid_email", "Enter a valid email address");
    return;
  }
  if (!isPurchaseLocale(body.locale)) {
    sendApiError(res, 400, "invalid_locale", "Unsupported locale");
    return;
  }

  const clientAddress = getCheckoutClientAddress(req);
  if (!clientAddress) {
    sendApiError(
      res,
      403,
      "client_address_unavailable",
      "Checkout could not verify this request",
    );
    return;
  }

  const order = makePendingOrder(email, body.locale);
  let orderWasStored = false;
  try {
    const tokenSecret = getOrderTokenSecret();
    await enforceCheckoutRateLimit(
      hashCheckoutClientAddress(clientAddress, tokenSecret),
    );
    getEmailConfig();
    getAirwallexWebhookSecret();
    getQstashConfig();
    await verifyArtifactReadiness();
    const token = createOrderAccessTokenForOrder(order, tokenSecret);
    const successUrl = buildPurchasePortalUrl(siteUrl, order.locale);
    await createOrder(order);
    orderWasStored = true;
    const intent = await createHostedPaymentIntent(order, successUrl);
    await attachPaymentIntent(order.id, intent.id);

    res.status(200).json({
      orderToken: token,
      checkout: {
        intentId: intent.id,
        clientSecret: intent.clientSecret,
        currency: PALANG_DESKTOP_CURRENCY,
        countryCode: PALANG_DESKTOP_COUNTRY_CODE,
        environment: airwallex.environment,
        successUrl,
      },
    });
  } catch (error) {
    if (orderWasStored) {
      try {
        await markOrderFailed(order.id);
      } catch {
        // The original error is more useful, and no checkout details were returned.
      }
    }
    if (error instanceof ServerConfigurationError) {
      sendApiError(res, 503, "not_configured", "Purchasing is not configured");
      return;
    }
    if (error instanceof CheckoutRateLimitError) {
      res.setHeader("Retry-After", String(error.retryAfterSeconds));
      sendApiError(
        res,
        429,
        "rate_limited",
        "Too many checkout attempts. Please try again later",
      );
      return;
    }
    sendApiError(
      res,
      502,
      "checkout_unavailable",
      "Checkout is temporarily unavailable",
    );
  }
}
