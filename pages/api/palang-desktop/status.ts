import type { NextApiRequest, NextApiResponse } from "next";
import {
  OrderAccessTokenError,
  hashPortalRateLimitKey,
  listArtifactDescriptors,
  verifyOrderAccessToken,
  type ArtifactDescriptor,
  type OrderStatus,
} from "../../../lib/palangDesktop/core";
import {
  ServerConfigurationError,
  getOrderTokenSecret,
  getSiteUrl,
} from "../../../lib/palangDesktop/config";
import {
  RequestBodyError,
  parseStrictJsonObject,
  requireJsonContentType,
  requirePost,
  requireSameOrigin,
  sendApiError,
  setPrivateResponseHeaders,
} from "../../../lib/palangDesktop/http";
import {
  PortalRateLimitError,
  enforcePortalRateLimit,
  getOrder,
} from "../../../lib/palangDesktop/orders";

type StatusResponse = {
  status: OrderStatus;
  artifacts?: ArtifactDescriptor[];
};

export const config = {
  api: {
    bodyParser: { sizeLimit: "8kb" },
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<StatusResponse | { error: unknown }>,
): Promise<void> {
  setPrivateResponseHeaders(res);
  if (!requirePost(req, res) || !requireJsonContentType(req, res)) return;

  try {
    const siteUrl = getSiteUrl();
    if (!requireSameOrigin(req, res, siteUrl)) return;

    const body = parseStrictJsonObject(req.body, ["token"]);
    const tokenSecret = getOrderTokenSecret();
    const payload = verifyOrderAccessToken(body.token, tokenSecret);
    await enforcePortalRateLimit(
      "status",
      hashPortalRateLimitKey(payload.orderId, "status", tokenSecret),
    );
    const order = await getOrder(payload.orderId);
    if (!order) {
      sendApiError(res, 404, "order_not_found", "Purchase was not found");
      return;
    }

    res.status(200).json({
      status: order.status,
      ...(order.status === "paid"
        ? { artifacts: listArtifactDescriptors() }
        : {}),
    });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      sendApiError(res, 400, "invalid_request", error.message);
      return;
    }
    if (error instanceof OrderAccessTokenError) {
      sendApiError(
        res,
        401,
        "invalid_token",
        "Access link is invalid or expired",
      );
      return;
    }
    if (error instanceof PortalRateLimitError) {
      res.setHeader("Retry-After", String(error.retryAfterSeconds));
      sendApiError(res, 429, "rate_limited", "Too many status requests");
      return;
    }
    if (error instanceof ServerConfigurationError) {
      sendApiError(res, 503, "not_configured", "Purchasing is not configured");
      return;
    }
    sendApiError(
      res,
      503,
      "status_unavailable",
      "Purchase status is temporarily unavailable",
    );
  }
}
