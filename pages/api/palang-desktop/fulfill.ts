import type { NextApiRequest, NextApiResponse } from "next";
import { ServerConfigurationError } from "../../../lib/palangDesktop/config";
import {
  FulfillmentQueueError,
  parseFulfillmentQueueMessage,
} from "../../../lib/palangDesktop/core";
import {
  FulfillmentValidationError,
  fulfillSucceededPaymentIntent,
} from "../../../lib/palangDesktop/fulfillment";
import {
  RequestBodyError,
  getSingleHeader,
  readRawRequestBody,
  requireJsonContentType,
  requirePost,
  sendApiError,
  setPrivateResponseHeaders,
} from "../../../lib/palangDesktop/http";
import { verifyFulfillmentQueueRequest } from "../../../lib/palangDesktop/queue";

type FulfillmentResponse = {
  fulfilled: true;
  email: "sent" | "already_sent";
};

export const config = {
  api: {
    bodyParser: false,
  },
};

function sendNonRetryableError(
  res: NextApiResponse,
  code: string,
  message: string,
): void {
  res.setHeader("Upstash-NonRetryable-Error", "true");
  sendApiError(res, 489, code, message);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FulfillmentResponse | { error: unknown }>,
): Promise<void> {
  setPrivateResponseHeaders(res);
  if (!requirePost(req, res) || !requireJsonContentType(req, res)) return;

  try {
    const rawBody = await readRawRequestBody(req, 64_000);
    const signature = getSingleHeader(req, "upstash-signature");
    if (!signature) {
      sendApiError(res, 401, "invalid_signature", "Signature is missing");
      return;
    }
    const verified = await verifyFulfillmentQueueRequest(
      rawBody.toString("utf8"),
      signature,
      getSingleHeader(req, "upstash-region") ?? undefined,
    );
    if (!verified) {
      sendApiError(res, 401, "invalid_signature", "Signature is invalid");
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      sendNonRetryableError(res, "invalid_payload", "Payload is invalid");
      return;
    }
    const message = parseFulfillmentQueueMessage(payload);
    const result = await fulfillSucceededPaymentIntent(message.paymentIntent);
    if (!result.handled) {
      sendNonRetryableError(
        res,
        "wrong_product",
        "Payment belongs to a different product",
      );
      return;
    }
    res.status(200).json({ fulfilled: true, email: result.email });
  } catch (error) {
    if (
      error instanceof RequestBodyError ||
      error instanceof FulfillmentQueueError ||
      error instanceof FulfillmentValidationError
    ) {
      sendNonRetryableError(
        res,
        "payment_mismatch",
        "Payment did not match an order",
      );
      return;
    }
    if (error instanceof ServerConfigurationError) {
      sendApiError(res, 503, "not_configured", "Fulfillment is not configured");
      return;
    }
    sendApiError(
      res,
      503,
      "fulfillment_unavailable",
      "Fulfillment is temporarily unavailable",
    );
  }
}
