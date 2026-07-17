import { createHash } from "node:crypto";
import { Client, Receiver } from "@upstash/qstash";
import { getQstashConfig, getSiteUrl } from "./config";
import { FulfillmentQueueError, type FulfillmentQueueMessage } from "./core";

const FULFILLMENT_PATH = "/api/palang-desktop/fulfill";
const FULFILLMENT_FAILURE_PATH = "/api/palang-desktop/fulfillment-failed";

function endpointUrl(path: string): string {
  return new URL(path, getSiteUrl()).toString();
}

export async function enqueuePaymentFulfillment(
  message: FulfillmentQueueMessage,
): Promise<void> {
  const qstash = getQstashConfig();
  const client = new Client({
    token: qstash.token,
    enableTelemetry: false,
    retry: false,
  });
  const deduplicationId = createHash("sha256")
    .update(message.eventId)
    .digest("hex");

  try {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([
        client.publishJSON({
          url: endpointUrl(FULFILLMENT_PATH),
          body: message,
          deduplicationId,
          retries: 3,
          failureCallback: endpointUrl(FULFILLMENT_FAILURE_PATH),
          label: ["palang-desktop", "payment-fulfillment"],
          redact: { body: true },
        }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("QStash publication timed out")),
            4_000,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  } catch {
    throw new FulfillmentQueueError("Could not enqueue payment fulfillment");
  }
}

async function verifyQstashRequest(
  body: string,
  signature: string,
  path: string,
  upstashRegion?: string,
): Promise<boolean> {
  const qstash = getQstashConfig();
  const receiver = new Receiver({
    currentSigningKey: qstash.currentSigningKey,
    nextSigningKey: qstash.nextSigningKey,
    devMode: false,
  });
  const url = endpointUrl(path);

  try {
    return await receiver.verify({
      body,
      signature,
      url,
      ...(upstashRegion ? { upstashRegion } : {}),
      clockTolerance: 5,
    });
  } catch {
    return false;
  }
}

export function verifyFulfillmentQueueRequest(
  body: string,
  signature: string,
  upstashRegion?: string,
): Promise<boolean> {
  return verifyQstashRequest(body, signature, FULFILLMENT_PATH, upstashRegion);
}

export function verifyFulfillmentFailureRequest(
  body: string,
  signature: string,
  upstashRegion?: string,
): Promise<boolean> {
  return verifyQstashRequest(
    body,
    signature,
    FULFILLMENT_FAILURE_PATH,
    upstashRegion,
  );
}
