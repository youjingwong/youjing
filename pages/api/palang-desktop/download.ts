import type { NextApiRequest, NextApiResponse } from "next";
import {
  OrderAccessTokenError,
  getArtifactDefinition,
  hashPortalRateLimitKey,
  verifyOrderAccessToken,
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
import { createArtifactDownloadUrl } from "../../../lib/palangDesktop/storage";

type DownloadResponse = { url: string };

export const config = {
  api: {
    bodyParser: { sizeLimit: "8kb" },
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DownloadResponse | { error: unknown }>,
): Promise<void> {
  setPrivateResponseHeaders(res);
  if (!requirePost(req, res) || !requireJsonContentType(req, res)) return;

  try {
    const siteUrl = getSiteUrl();
    if (!requireSameOrigin(req, res, siteUrl)) return;

    const body = parseStrictJsonObject(req.body, ["token", "artifactId"]);
    const artifact = getArtifactDefinition(body.artifactId);
    if (!artifact) {
      sendApiError(res, 400, "invalid_artifact", "Unknown installer");
      return;
    }
    const tokenSecret = getOrderTokenSecret();
    const payload = verifyOrderAccessToken(body.token, tokenSecret);
    await enforcePortalRateLimit(
      "download",
      hashPortalRateLimitKey(payload.orderId, "download", tokenSecret),
    );
    const order = await getOrder(payload.orderId);
    if (!order) {
      sendApiError(res, 404, "order_not_found", "Purchase was not found");
      return;
    }
    if (order.status !== "paid") {
      sendApiError(res, 409, "payment_required", "Payment has not completed");
      return;
    }

    const url = await createArtifactDownloadUrl(artifact.id);
    res.status(200).json({ url });
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
      sendApiError(res, 429, "rate_limited", "Too many download requests");
      return;
    }
    if (error instanceof ServerConfigurationError) {
      sendApiError(res, 503, "not_configured", "Downloads are not configured");
      return;
    }
    sendApiError(
      res,
      503,
      "download_unavailable",
      "Download is temporarily unavailable",
    );
  }
}
