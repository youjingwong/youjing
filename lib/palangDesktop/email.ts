import {
  addOrderTokenToPortalUrl,
  buildPurchasePortalUrl,
  type PalangDesktopOrder,
  type PurchaseLocale,
} from "./core";
import { getEmailConfig, getSiteUrl } from "./config";

export type PurchaseEmailResult = { sent: true };

export class PurchaseEmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseEmailError";
  }
}

const COPY: Record<
  PurchaseLocale,
  {
    subject: string;
    heading: string;
    body: string;
    action: string;
    expiry: string;
  }
> = {
  en: {
    subject: "Your Palang IC Desktop download",
    heading: "Your download is ready",
    body: "Thank you for purchasing Palang IC Desktop. Open your private download page to choose the installer for your computer.",
    action: "Open download page",
    expiry: "This private access link expires in 30 days.",
  },
  ms: {
    subject: "Muat turun Palang IC Desktop anda",
    heading: "Muat turun anda sudah tersedia",
    body: "Terima kasih kerana membeli Palang IC Desktop. Buka halaman muat turun peribadi anda untuk memilih pemasang bagi komputer anda.",
    action: "Buka halaman muat turun",
    expiry: "Pautan akses peribadi ini tamat tempoh dalam 30 hari.",
  },
  zh: {
    subject: "下载 Palang IC Desktop",
    heading: "您的下载已准备好",
    body: "感谢您购买 Palang IC Desktop。请打开私人下载页面，选择适合您电脑的安装程序。",
    action: "打开下载页面",
    expiry: "此私人访问链接将在 30 天后过期。",
  },
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

export async function sendPurchaseEmail(
  order: PalangDesktopOrder,
  orderAccessToken: string,
): Promise<PurchaseEmailResult> {
  const emailConfig = getEmailConfig();

  const portalUrl = buildPurchasePortalUrl(getSiteUrl(), order.locale);
  const downloadUrl = addOrderTokenToPortalUrl(portalUrl, orderAccessToken);
  const copy = COPY[order.locale];
  const safeDownloadUrl = escapeHtml(downloadUrl);

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${emailConfig.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `purchase/${order.id}`,
      },
      body: JSON.stringify({
        from: emailConfig.from,
        to: [order.email],
        subject: copy.subject,
        text: `${copy.heading}\n\n${copy.body}\n\n${copy.action}: ${downloadUrl}\n\n${copy.expiry}`,
        html: [
          '<div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.6;color:#14211b">',
          `<h1 style="font-size:24px">${escapeHtml(copy.heading)}</h1>`,
          `<p>${escapeHtml(copy.body)}</p>`,
          `<p><a href="${safeDownloadUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#147d54;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(copy.action)}</a></p>`,
          `<p style="font-size:13px;color:#52625a">${escapeHtml(copy.expiry)}</p>`,
          "</div>",
        ].join(""),
      }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new PurchaseEmailError("Could not reach the email service");
  }

  if (!response.ok) {
    throw new PurchaseEmailError(
      `Email service rejected the request (${response.status})`,
    );
  }
  return { sent: true };
}
