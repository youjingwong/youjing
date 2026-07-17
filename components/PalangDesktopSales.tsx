import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { ComponentType, FormEvent, useState } from "react";
import { useTranslation } from "next-i18next/pages";
import LanguageSwitcher from "./LanguageSwitcher";

const ORDER_TOKEN_STORAGE_KEY = "palang-ic-desktop-order-token";

type CheckoutEnvironment = "demo" | "prod";

interface CheckoutFields {
  intentId: string;
  clientSecret: string;
  currency: string;
  countryCode: string;
  environment: CheckoutEnvironment;
  successUrl: string;
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null;

const readString = (source: UnknownRecord, key: string) => {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : null;
};

const readCheckoutResponse = (value: unknown) => {
  if (!isRecord(value)) return null;

  const source = isRecord(value.checkout) ? value.checkout : value;
  const intentId = readString(source, "intentId");
  const clientSecret = readString(source, "clientSecret");
  const currency = readString(source, "currency");
  const countryCode = readString(source, "countryCode");
  const environment = readString(source, "environment");
  const successUrl = readString(source, "successUrl");
  const allowedEnvironments = new Set<CheckoutEnvironment>(["demo", "prod"]);

  if (
    !intentId ||
    !clientSecret ||
    !currency ||
    !countryCode ||
    !environment ||
    !allowedEnvironments.has(environment as CheckoutEnvironment) ||
    !successUrl
  ) {
    return null;
  }

  const token = readString(value, "token") || readString(value, "orderToken");

  return {
    checkout: {
      intentId,
      clientSecret,
      currency,
      countryCode,
      environment: environment as CheckoutEnvironment,
      successUrl,
    } satisfies CheckoutFields,
    token,
  };
};

const isLikelyEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

type IconProps = { className?: string };

const ShieldCheckIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M12 3l7 2.6v5.2c0 4.6-3 8.4-7 10.2-4-1.8-7-5.6-7-10.2V5.6L12 3z" />
    <path d="M9.2 12l2 2 3.6-3.8" />
  </svg>
);

const ShieldIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M12 3l7 2.6v5.2c0 4.6-3 8.4-7 10.2-4-1.8-7-5.6-7-10.2V5.6L12 3z" />
  </svg>
);

const LockIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <rect x="4.5" y="10" width="15" height="10" rx="2.5" />
    <path d="M8 10V7.5a4 4 0 018 0V10" />
    <path d="M12 14v2.5" />
  </svg>
);

const ArrowPathIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
  </svg>
);

const CloudOffIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M6.5 19h11a4 4 0 00.9-7.9A5.5 5.5 0 007.2 9.1 4.75 4.75 0 006.5 19z" />
    <path d="M4 4l16 16" />
  </svg>
);

const AppleIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 384 512" fill="currentColor" aria-hidden="true" className={className}>
    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
  </svg>
);

const WindowsIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 448 512" fill="currentColor" aria-hidden="true" className={className}>
    <path d="M0 93.7l183.6-25.3v177.4H0V93.7zm0 324.6l183.6 25.3V268.4H0v149.9zm203.8 28L448 480V268.4H203.8v177.9zm0-380.6v180.1H448V0L203.8 65.7z" />
  </svg>
);

const ArrowDownTrayIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);

const GlobeIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.5 2.3 3.9 5.3 3.9 8.5s-1.4 6.2-3.9 8.5c-2.5-2.3-3.9-5.3-3.9-8.5S9.5 5.8 12 3.5z" />
  </svg>
);

const EnvelopeIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="M4 7.5l8 5.5 8-5.5" />
  </svg>
);

const ArrowUturnLeftIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
  </svg>
);

const EyeSlashIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
  </svg>
);

const ClockIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

const ArrowRightIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
  </svg>
);

const ChevronLeftIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M15.75 19.5L8.25 12l7.5-7.5" />
  </svg>
);

const TagIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
    <path d="M6 6h.008v.008H6V6z" />
  </svg>
);

const WarningIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
  </svg>
);

const BENEFITS = [
  { key: "vault", Icon: LockIcon },
  { key: "persistence", Icon: ArrowPathIcon },
  { key: "offline", Icon: CloudOffIcon },
] as const;

const PLATFORMS: ReadonlyArray<{
  key: "macArm" | "macIntel" | "windows";
  Icon: ComponentType<IconProps>;
}> = [
  { key: "macArm", Icon: AppleIcon },
  { key: "macIntel", Icon: AppleIcon },
  { key: "windows", Icon: WindowsIcon },
];

const DELIVERY_STEPS = ["pay", "confirm", "download"] as const;

const POLICIES = [
  { key: "support", Icon: EnvelopeIcon },
  { key: "refund", Icon: ArrowUturnLeftIcon },
  { key: "privacy", Icon: EyeSlashIcon },
] as const;

export default function PalangDesktopSales({
  salesEnabled,
}: {
  salesEnabled: boolean;
}) {
  const { t } = useTranslation("common");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const handleCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isStartingCheckout || !salesEnabled) return;

    const normalizedEmail = email.trim();
    if (!isLikelyEmail(normalizedEmail)) {
      setCheckoutError(t("desktop.sales.checkout.emailError"));
      return;
    }

    setCheckoutError(null);
    setIsStartingCheckout(true);

    try {
      const response = await fetch("/api/palang-desktop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          locale: router.locale || "en",
        }),
      });

      if (!response.ok) {
        throw new Error(
          response.status === 429 ? "rate-limited" : "checkout-request-failed",
        );
      }

      const checkoutResponse = readCheckoutResponse(await response.json());
      if (!checkoutResponse) throw new Error("invalid-checkout-response");

      if (checkoutResponse.token) {
        try {
          window.sessionStorage.setItem(
            ORDER_TOKEN_STORAGE_KEY,
            checkoutResponse.token,
          );
        } catch {
          // The delivery email remains the recovery path if storage is disabled.
        }
      }

      const { init } = await import("@airwallex/components-sdk");
      const sdkLocale =
        router.locale === "zh" ? "zh" : router.locale === "ms" ? "ms" : "en";
      const { payments } = await init({
        env: checkoutResponse.checkout.environment,
        enabledElements: ["payments"],
        locale: sdkLocale,
      });

      if (!payments) throw new Error("payments-sdk-unavailable");

      await payments.redirectToCheckout({
        mode: "payment",
        env: checkoutResponse.checkout.environment,
        intent_id: checkoutResponse.checkout.intentId,
        client_secret: checkoutResponse.checkout.clientSecret,
        currency: checkoutResponse.checkout.currency,
        country_code: checkoutResponse.checkout.countryCode,
        successUrl: checkoutResponse.checkout.successUrl,
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message === "rate-limited"
          ? t("desktop.sales.checkout.rateLimitError")
          : t("desktop.sales.checkout.genericError");
      setCheckoutError(message);
      setIsStartingCheckout(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#060908] text-white antialiased selection:bg-emerald-300 selection:text-emerald-950">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(60rem_42rem_at_75%_-10%,rgba(16,185,129,0.16),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(48rem_36rem_at_-5%_35%,rgba(16,185,129,0.09),transparent_55%)]" />
        <div className="absolute inset-0 opacity-[0.13] [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_80%_55%_at_50%_0%,black_25%,transparent_75%)]" />
      </div>

      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#060908]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            href="/palang-ic"
            className="inline-flex items-center gap-2.5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-300 to-emerald-600 text-emerald-950 shadow-lg shadow-emerald-500/25">
              <ShieldCheckIcon className="h-5 w-5" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-sm font-extrabold tracking-tight text-white">
                Palang IC
              </span>
              <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-400">
                Desktop
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-3">
            <Link
              href="/palang-ic"
              className="hidden items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-gray-400 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:inline-flex"
            >
              <ChevronLeftIcon className="h-4 w-4" />
              {t("desktop.sales.backToTool")}
            </Link>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="relative">
        <section className="relative">
          <div className="mx-auto grid max-w-6xl gap-14 px-4 pb-24 pt-14 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:pb-32 lg:pt-24">
            <div>
              <div className="inline-flex items-center gap-2.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 py-1.5 pl-3 pr-4 text-xs font-semibold text-emerald-300">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                {t("desktop.sales.badge")}
              </div>
              <h1 className="mt-6 max-w-2xl bg-gradient-to-br from-white via-white to-emerald-300/80 bg-clip-text text-4xl font-extrabold leading-[1.08] tracking-tight text-transparent sm:text-5xl lg:text-[3.4rem]">
                {t("desktop.sales.title")}
              </h1>
              <p className="mb-0 mt-6 max-w-xl text-base leading-8 text-gray-400 sm:text-lg">
                {t("desktop.sales.intro")}
              </p>
              <div className="mt-9 flex flex-col gap-5 sm:flex-row sm:items-center">
                <a
                  href="#checkout"
                  className="group inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-xl bg-emerald-400 px-7 text-base font-bold text-emerald-950 shadow-[0_10px_44px_-10px_rgba(52,211,153,0.75)] transition-all duration-200 hover:bg-emerald-300 hover:shadow-[0_12px_52px_-8px_rgba(52,211,153,0.9)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
                >
                  {t("desktop.sales.buyFor")} RM29.90
                  <ArrowRightIcon className="h-4.5 w-4.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </a>
                <div>
                  <div className="text-sm font-semibold text-white">
                    {t("desktop.sales.oneTime")}
                  </div>
                  <div className="mt-0.5 text-sm text-gray-500">
                    {t("desktop.sales.noSubscription")}
                  </div>
                </div>
              </div>
              <div className="mt-12 flex items-center gap-6 border-t border-white/5 pt-6 text-gray-500">
                <span className="flex items-center gap-2">
                  <AppleIcon className="h-4 w-4" />
                  <span className="text-xs font-medium">macOS</span>
                </span>
                <span className="flex items-center gap-2">
                  <WindowsIcon className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">Windows</span>
                </span>
                <span className="flex items-center gap-2">
                  <LockIcon className="h-4 w-4 text-emerald-400/80" />
                  <span className="text-xs font-medium">Airwallex</span>
                </span>
              </div>
            </div>

            <div className="relative mb-8 lg:mb-0 lg:pl-6">
              <div
                aria-hidden="true"
                className="absolute -inset-10 rounded-[3rem] bg-[radial-gradient(closest-side,rgba(52,211,153,0.22),transparent)] blur-2xl"
              />
              <div className="relative transition-transform duration-700 ease-out [transform-style:preserve-3d] lg:[transform:perspective(1400px)_rotateY(-9deg)_rotateX(4deg)] lg:hover:[transform:perspective(1400px)_rotateY(-2deg)_rotateX(1deg)]">
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gray-900/90 shadow-[0_48px_90px_-24px_rgba(0,0,0,0.85)] ring-1 ring-emerald-400/10">
                  <div
                    className="flex items-center gap-1.5 border-b border-white/5 px-4 py-3"
                    aria-hidden="true"
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                    <span className="ml-3 flex items-center gap-1.5 rounded-md bg-white/5 px-2.5 py-1 text-[10px] font-medium text-gray-400">
                      <ShieldIcon className="h-3 w-3 text-emerald-400" />
                      Palang IC
                    </span>
                  </div>
                  <Image
                    src="/og/id-marking.png"
                    width={1200}
                    height={630}
                    priority
                    alt={t("desktop.sales.productImageAlt")}
                    className="h-auto w-full"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.02] to-white/[0.07]"
                  />
                </div>
                <div className="absolute -bottom-6 left-6 flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0b110e]/90 px-4 py-3 shadow-2xl shadow-black/60 backdrop-blur-md">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/15 text-emerald-300">
                    <TagIcon className="h-4.5 w-4.5" />
                  </span>
                  <span>
                    <span className="block text-base font-extrabold leading-tight text-white">
                      RM29.90
                    </span>
                    <span className="block text-xs text-gray-400">
                      {t("desktop.sales.oneTime")}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="desktop-benefits-title"
          className="relative border-t border-white/5"
        >
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
            <div className="max-w-2xl">
              <h2
                id="desktop-benefits-title"
                className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl"
              >
                {t("desktop.sales.benefitsTitle")}
              </h2>
              <p className="mb-0 mt-4 text-base leading-7 text-gray-400">
                {t("desktop.sales.benefitsIntro")}
              </p>
            </div>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {BENEFITS.map(({ key, Icon }) => (
                <article
                  key={key}
                  className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/30 hover:bg-white/[0.05] hover:shadow-[0_24px_60px_-24px_rgba(16,185,129,0.4)]"
                >
                  <div
                    aria-hidden="true"
                    className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-400/0 blur-2xl transition-colors duration-300 group-hover:bg-emerald-400/10"
                  />
                  <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
                    <Icon className="h-5.5 w-5.5" />
                  </span>
                  <h3 className="mt-5 text-lg font-bold text-white">
                    {t(`desktop.sales.benefits.${key}.title`)}
                  </h3>
                  <p className="mb-0 mt-2 text-sm leading-6 text-gray-400">
                    {t(`desktop.sales.benefits.${key}.body`)}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="relative border-t border-white/5">
          <div className="mx-auto grid max-w-6xl gap-16 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-24">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                {t("desktop.sales.installersTitle")}
              </h2>
              <p className="mb-0 mt-4 text-base leading-7 text-gray-400">
                {t("desktop.sales.installersIntro")}
              </p>
              <ul className="mt-8 space-y-3">
                {PLATFORMS.map(({ key, Icon }) => (
                  <li
                    key={key}
                    className="flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 transition-colors duration-200 hover:border-emerald-400/25 hover:bg-white/[0.05] sm:p-5"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-gray-200">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-sm font-bold text-white">
                        {t(`desktop.sales.installers.${key}.label`)}
                      </strong>
                      <span className="mt-0.5 block text-sm text-gray-500">
                        {t(`desktop.sales.installers.${key}.detail`)}
                      </span>
                    </span>
                    <ArrowDownTrayIcon className="h-5 w-5 shrink-0 text-emerald-400/70" />
                  </li>
                ))}
              </ul>
              <p className="mb-0 mt-5 flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4 text-sm leading-6 text-gray-400">
                <GlobeIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400/80" />
                {t("desktop.sales.appLanguages")}
              </p>
            </div>
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                {t("desktop.sales.deliveryTitle")}
              </h2>
              <ol className="relative mt-9 space-y-9">
                <div
                  aria-hidden="true"
                  className="absolute bottom-5 left-[1.15rem] top-5 w-px bg-gradient-to-b from-emerald-400/50 via-white/10 to-transparent"
                />
                {DELIVERY_STEPS.map((step, index) => (
                  <li key={step} className="relative flex gap-5">
                    <span className="relative z-10 flex h-[2.3rem] w-[2.3rem] shrink-0 items-center justify-center rounded-full border border-emerald-400/30 bg-[#0a120e] text-sm font-bold text-emerald-300 shadow-[0_0_24px_rgba(16,185,129,0.2)]">
                      {index + 1}
                    </span>
                    <span className="pt-1.5">
                      <strong className="block text-base font-bold text-white">
                        {t(`desktop.sales.delivery.${step}.title`)}
                      </strong>
                      <span className="mt-1.5 block text-sm leading-6 text-gray-400">
                        {t(`desktop.sales.delivery.${step}.body`)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section
          id="checkout"
          aria-labelledby="checkout-title"
          className="relative scroll-mt-24 border-t border-white/5"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_30rem_at_30%_50%,rgba(16,185,129,0.1),transparent_65%)]"
          />
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
            <div className="relative">
              <div
                aria-hidden="true"
                className="absolute -inset-6 rounded-[2.5rem] bg-emerald-500/10 blur-3xl"
              />
              <div className="relative rounded-3xl bg-gradient-to-br from-emerald-400/40 via-white/10 to-white/5 p-px shadow-[0_40px_90px_-30px_rgba(16,185,129,0.35)]">
                <div className="rounded-[calc(1.5rem-1px)] bg-[#080d0b] p-6 sm:p-9">
                  <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-7 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-400">
                        {t("desktop.sales.checkout.product")}
                      </div>
                      <h2
                        id="checkout-title"
                        className="mt-2 text-2xl font-extrabold tracking-tight text-white sm:text-3xl"
                      >
                        {t("desktop.sales.checkout.title")}
                      </h2>
                    </div>
                    <div className="sm:text-right">
                      <div className="text-4xl font-extrabold tracking-tight text-white">
                        RM29.90
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {t("desktop.sales.oneTime")}
                      </div>
                    </div>
                  </div>

                  <form className="mt-7" onSubmit={handleCheckout} noValidate>
                    {!salesEnabled && (
                      <p
                        role="status"
                        className="mb-6 mt-0 flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-200"
                      >
                        <WarningIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                        {t("desktop.sales.checkout.releaseGate")}
                      </p>
                    )}
                    <label
                      htmlFor="desktop-checkout-email"
                      className="block text-sm font-bold text-gray-200"
                    >
                      {t("desktop.sales.checkout.emailLabel")}
                    </label>
                    <p
                      id="desktop-checkout-email-help"
                      className="mb-4 mt-1.5 text-sm leading-6 text-gray-500"
                    >
                      {t("desktop.sales.checkout.emailHelp")}
                    </p>
                    <div className="relative">
                      <EnvelopeIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-600" />
                      <input
                        id="desktop-checkout-email"
                        name="email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(event) => {
                          setEmail(event.target.value);
                          if (checkoutError) setCheckoutError(null);
                        }}
                        aria-describedby={`desktop-checkout-email-help${checkoutError ? " desktop-checkout-error" : ""}`}
                        aria-invalid={Boolean(checkoutError)}
                        disabled={isStartingCheckout || !salesEnabled}
                        placeholder={t("desktop.sales.checkout.emailPlaceholder")}
                        className="h-14 w-full rounded-xl border border-white/10 bg-black/50 pl-12 pr-4 text-base text-white outline-none transition-all placeholder:text-gray-600 focus:border-emerald-400/60 focus:ring-4 focus:ring-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>

                    {checkoutError && (
                      <p
                        id="desktop-checkout-error"
                        role="alert"
                        className="mb-0 mt-3 text-sm text-red-300"
                      >
                        {checkoutError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={isStartingCheckout || !salesEnabled}
                      className="group relative mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2.5 overflow-hidden rounded-xl bg-emerald-400 px-6 text-base font-bold text-emerald-950 shadow-[0_12px_44px_-12px_rgba(52,211,153,0.85)] transition-all duration-200 hover:bg-emerald-300 hover:shadow-[0_14px_52px_-10px_rgba(52,211,153,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-gray-400 disabled:shadow-none"
                    >
                      {!isStartingCheckout && salesEnabled && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
                        />
                      )}
                      {isStartingCheckout ? (
                        <span
                          aria-hidden="true"
                          className="h-4.5 w-4.5 animate-spin rounded-full border-2 border-emerald-950/30 border-t-emerald-950"
                        />
                      ) : (
                        <ArrowRightIcon className="h-4.5 w-4.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                      )}
                      <span className="relative">
                        {!salesEnabled
                          ? t("desktop.sales.checkout.unavailableAction")
                          : isStartingCheckout
                            ? t("desktop.sales.checkout.loading")
                            : `${t("desktop.sales.buyFor")} RM29.90`}
                      </span>
                    </button>
                  </form>

                  <div className="mt-6 flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-sm leading-6 text-gray-400">
                    <ShieldCheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                    <span>
                      <strong className="font-bold text-gray-200">
                        {t("desktop.sales.checkout.hostedTitle")}
                      </strong>{" "}
                      {t("desktop.sales.checkout.hostedBody")}
                    </span>
                  </div>
                  <p className="mb-0 mt-4 flex items-center gap-2 text-xs leading-5 text-gray-500">
                    <ClockIcon className="h-4 w-4 shrink-0 text-gray-600" />
                    {t("desktop.sales.checkout.accessWindow")}
                  </p>
                </div>
              </div>
            </div>

            <aside
              className="space-y-4 self-start lg:sticky lg:top-24"
              aria-label={t("desktop.sales.policiesTitle")}
            >
              {POLICIES.map(({ key, Icon }) => (
                <section
                  key={key}
                  className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 transition-colors duration-200 hover:border-white/[0.14]"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-emerald-300">
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <h2 className="text-base font-bold text-white">
                      {t(`desktop.sales.${key}Title`)}
                    </h2>
                  </div>
                  <p className="mb-0 mt-3 text-sm leading-6 text-gray-400">
                    {t(`desktop.sales.${key}Body`)}{" "}
                    {key === "support" && (
                      <a
                        href="mailto:g@youjing.dev"
                        className="font-semibold text-emerald-300 underline decoration-emerald-700 underline-offset-4 transition-colors hover:text-emerald-200"
                      >
                        g@youjing.dev
                      </a>
                    )}
                  </p>
                </section>
              ))}
            </aside>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-10 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} CRUD LABS SDN BHD</span>
          <Link
            href="/palang-ic"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-emerald-300"
          >
            {t("desktop.sales.useWebTool")}
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
        </div>
      </footer>
    </div>
  );
}
