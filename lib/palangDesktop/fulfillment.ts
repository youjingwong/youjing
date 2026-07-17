import {
  PALANG_DESKTOP_PRODUCT_ID,
  createOrderAccessTokenForOrder,
  isOrderId,
  isPlainRecord,
  validateSucceededPaymentIntent,
} from "./core";
import { getOrderTokenSecret } from "./config";
import { sendPurchaseEmail } from "./email";
import { getOrder, markOrderEmailSent, markOrderPaid } from "./orders";

export type FulfillmentResult =
  | { handled: false; reason: "different_product" }
  | {
      handled: true;
      email: "sent" | "already_sent";
    };

export class FulfillmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FulfillmentValidationError";
  }
}

export async function fulfillSucceededPaymentIntent(
  paymentIntent: unknown,
): Promise<FulfillmentResult> {
  if (!isPlainRecord(paymentIntent)) {
    throw new FulfillmentValidationError("PaymentIntent payload is malformed");
  }

  const metadata = paymentIntent.metadata;
  if (
    !isPlainRecord(metadata) ||
    metadata.product !== PALANG_DESKTOP_PRODUCT_ID
  ) {
    return { handled: false, reason: "different_product" };
  }

  if (!isOrderId(paymentIntent.merchant_order_id)) {
    throw new FulfillmentValidationError("PaymentIntent has no valid order ID");
  }
  const order = await getOrder(paymentIntent.merchant_order_id);
  if (!order) throw new FulfillmentValidationError("Order was not found");

  const validation = validateSucceededPaymentIntent(order, paymentIntent);
  if (!validation.valid) {
    throw new FulfillmentValidationError(
      `PaymentIntent did not match the order (${validation.reason})`,
    );
  }

  const paidOrder = await markOrderPaid(order.id);
  if (paidOrder.emailSentAt) {
    return { handled: true, email: "already_sent" };
  }

  const orderAccessToken = createOrderAccessTokenForOrder(
    paidOrder,
    getOrderTokenSecret(),
  );
  await sendPurchaseEmail(paidOrder, orderAccessToken);

  await markOrderEmailSent(paidOrder.id);
  return { handled: true, email: "sent" };
}
