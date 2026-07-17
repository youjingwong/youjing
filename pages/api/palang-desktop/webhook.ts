import type { NextApiRequest, NextApiResponse } from "next";
import {
  PALANG_DESKTOP_PRODUCT_ID,
  FulfillmentQueueError,
  createFulfillmentQueueMessage,
  isPlainRecord,
  verifyAirwallexWebhookSignature,
} from "../../../lib/palangDesktop/core";
import {
  ServerConfigurationError,
  getAirwallexWebhookSecret,
} from "../../../lib/palangDesktop/config";
import {
  RequestBodyError,
  getSingleHeader,
  readRawRequestBody,
  requireJsonContentType,
  requirePost,
  sendApiError,
  setPrivateResponseHeaders,
} from "../../../lib/palangDesktop/http";
import { enqueuePaymentFulfillment } from "../../../lib/palangDesktop/queue";

type WebhookResponse = {
  received: true;
  handled: boolean;
};

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WebhookResponse | { error: unknown }>,
): Promise<void> {
  setPrivateResponseHeaders(res);
  if (!requirePost(req, res) || !requireJsonContentType(req, res)) return;

  try {
    const rawBody = await readRawRequestBody(req);
    const timestamp = getSingleHeader(req, "x-timestamp");
    const signature = getSingleHeader(req, "x-signature");
    const verified = verifyAirwallexWebhookSignature({
      rawBody,
      timestamp,
      signature,
      secret: getAirwallexWebhookSecret(),
    });
    if (!verified) {
      sendApiError(
        res,
        400,
        "invalid_signature",
        "Webhook signature is invalid",
      );
      return;
    }

    let event: unknown;
    try {
      event = JSON.parse(rawBody.toString("utf8"));
    } catch {
      sendApiError(res, 400, "invalid_payload", "Webhook payload is invalid");
      return;
    }
    if (
      !isPlainRecord(event) ||
      typeof event.id !== "string" ||
      typeof event.name !== "string" ||
      !isPlainRecord(event.data) ||
      !Object.hasOwn(event.data, "object")
    ) {
      sendApiError(res, 400, "invalid_payload", "Webhook payload is invalid");
      return;
    }

    if (event.name !== "payment_intent.succeeded") {
      res.status(200).json({ received: true, handled: false });
      return;
    }

    const paymentIntent = event.data.object;
    if (
      !isPlainRecord(paymentIntent) ||
      !isPlainRecord(paymentIntent.metadata) ||
      paymentIntent.metadata.product !== PALANG_DESKTOP_PRODUCT_ID
    ) {
      res.status(200).json({ received: true, handled: false });
      return;
    }

    const message = createFulfillmentQueueMessage(event.id, paymentIntent);
    await enqueuePaymentFulfillment(message);
    res.status(200).json({ received: true, handled: true });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      sendApiError(res, 400, "invalid_payload", error.message);
      return;
    }
    if (error instanceof FulfillmentQueueError) {
      sendApiError(
        res,
        503,
        "queue_unavailable",
        "Payment confirmation is temporarily unavailable",
      );
      return;
    }
    if (error instanceof ServerConfigurationError) {
      sendApiError(res, 503, "not_configured", "Webhook is not configured");
      return;
    }
    // Queue publication is the only durable handoff. Airwallex retries on failure.
    sendApiError(
      res,
      503,
      "fulfillment_unavailable",
      "Fulfillment is temporarily unavailable",
    );
  }
}
