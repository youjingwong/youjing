import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { FormEvent, useState } from "react";
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
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-gray-800 bg-gray-950/90">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/palang-ic"
            className="inline-flex items-center gap-3 self-start rounded-md text-sm font-semibold text-gray-200 hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400"
          >
            <span
              aria-hidden="true"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-950 text-lg text-emerald-300"
            >
              ←
            </span>
            {t("desktop.sales.backToTool")}
          </Link>
          <LanguageSwitcher />
        </div>
      </header>

      <main>
        <section className="border-b border-gray-800 bg-[radial-gradient(circle_at_top_left,_rgba(6,78,59,0.45),_transparent_48%)]">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(380px,0.88fr)] lg:items-center lg:py-20">
            <div>
              <div className="inline-flex rounded-full border border-emerald-700 bg-emerald-950/80 px-3 py-1 text-xs font-semibold text-emerald-300">
                {t("desktop.sales.badge")}
              </div>
              <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-tight text-white sm:text-5xl">
                {t("desktop.sales.title")}
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-gray-300">
                {t("desktop.sales.intro")}
              </p>
              <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center">
                <a
                  href="#checkout"
                  className="inline-flex min-h-12 items-center justify-center rounded-md bg-emerald-400 px-6 py-3 text-base font-bold text-emerald-950 transition-colors hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
                >
                  {t("desktop.sales.buyFor")} RM29.90
                </a>
                <div>
                  <div className="font-semibold text-white">
                    {t("desktop.sales.oneTime")}
                  </div>
                  <div className="text-sm text-gray-400">
                    {t("desktop.sales.noSubscription")}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-700 bg-gray-900 p-2 shadow-2xl shadow-emerald-950/30">
              <div
                className="flex items-center gap-1.5 px-3 py-2"
                aria-hidden="true"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
              </div>
              <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-950">
                <Image
                  src="/og/id-marking.png"
                  width={1200}
                  height={630}
                  priority
                  alt={t("desktop.sales.productImageAlt")}
                  className="h-auto w-full"
                />
              </div>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="desktop-benefits-title"
          className="mx-auto max-w-7xl px-4 py-14 lg:py-18"
        >
          <div className="max-w-3xl">
            <h2 id="desktop-benefits-title" className="text-3xl text-white">
              {t("desktop.sales.benefitsTitle")}
            </h2>
            <p className="mt-3 text-gray-400">
              {t("desktop.sales.benefitsIntro")}
            </p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {(["vault", "persistence", "offline"] as const).map((benefit) => (
              <article
                key={benefit}
                className="rounded-xl border border-gray-800 bg-gray-900 p-6"
              >
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-950 text-emerald-300">
                  <span aria-hidden="true">✓</span>
                </div>
                <h3 className="mt-4 text-xl font-semibold text-white">
                  {t(`desktop.sales.benefits.${benefit}.title`)}
                </h3>
                <p className="mb-0 mt-2 text-sm leading-6 text-gray-400">
                  {t(`desktop.sales.benefits.${benefit}.body`)}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-gray-800 bg-gray-950">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 lg:grid-cols-2 lg:items-start">
            <div>
              <h2 className="text-3xl text-white">
                {t("desktop.sales.installersTitle")}
              </h2>
              <p className="mt-3 text-gray-400">
                {t("desktop.sales.installersIntro")}
              </p>
              <ul className="mt-6 space-y-3">
                {(["macArm", "macIntel", "windows"] as const).map(
                  (platform) => (
                    <li
                      key={platform}
                      className="flex items-start gap-3 rounded-lg border border-gray-800 bg-black/50 p-4"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-0.5 text-emerald-400"
                      >
                        ↓
                      </span>
                      <span>
                        <strong className="block text-white">
                          {t(`desktop.sales.installers.${platform}.label`)}
                        </strong>
                        <span className="text-sm text-gray-400">
                          {t(`desktop.sales.installers.${platform}.detail`)}
                        </span>
                      </span>
                    </li>
                  ),
                )}
              </ul>
              <p className="mb-0 mt-5 rounded-lg border border-gray-800 bg-black/50 p-4 text-sm leading-6 text-gray-400">
                {t("desktop.sales.appLanguages")}
              </p>
            </div>
            <div>
              <h2 className="text-3xl text-white">
                {t("desktop.sales.deliveryTitle")}
              </h2>
              <ol className="mt-6 space-y-5">
                {(["pay", "confirm", "download"] as const).map(
                  (step, index) => (
                    <li key={step} className="flex gap-4">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-950 text-sm font-bold text-emerald-300">
                        {index + 1}
                      </span>
                      <span>
                        <strong className="block text-white">
                          {t(`desktop.sales.delivery.${step}.title`)}
                        </strong>
                        <span className="mt-1 block text-sm leading-6 text-gray-400">
                          {t(`desktop.sales.delivery.${step}.body`)}
                        </span>
                      </span>
                    </li>
                  ),
                )}
              </ol>
            </div>
          </div>
        </section>

        <section
          id="checkout"
          aria-labelledby="checkout-title"
          className="scroll-mt-6"
        >
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:py-20">
            <div className="rounded-2xl border border-emerald-700/60 bg-gray-900 p-6 shadow-xl shadow-emerald-950/20 sm:p-8">
              <div className="flex flex-col gap-4 border-b border-gray-800 pb-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-emerald-300">
                    {t("desktop.sales.checkout.product")}
                  </div>
                  <h2 id="checkout-title" className="mt-1 text-3xl text-white">
                    {t("desktop.sales.checkout.title")}
                  </h2>
                </div>
                <div className="sm:text-right">
                  <div className="text-3xl font-bold text-white">RM29.90</div>
                  <div className="text-xs text-gray-400">
                    {t("desktop.sales.oneTime")}
                  </div>
                </div>
              </div>

              <form className="mt-6" onSubmit={handleCheckout} noValidate>
                {!salesEnabled && (
                  <p
                    role="status"
                    className="mb-5 rounded-lg border border-amber-800/70 bg-amber-950/35 p-4 text-sm leading-6 text-amber-100"
                  >
                    {t("desktop.sales.checkout.releaseGate")}
                  </p>
                )}
                <label
                  htmlFor="desktop-checkout-email"
                  className="block text-sm font-semibold text-gray-200"
                >
                  {t("desktop.sales.checkout.emailLabel")}
                </label>
                <p
                  id="desktop-checkout-email-help"
                  className="mb-3 mt-1 text-sm text-gray-400"
                >
                  {t("desktop.sales.checkout.emailHelp")}
                </p>
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
                  className="h-12 w-full rounded-md border border-gray-600 bg-gray-950 px-4 text-base text-white outline-none transition-colors placeholder:text-gray-600 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30 disabled:cursor-wait disabled:opacity-70"
                />

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
                  className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-emerald-400 px-6 py-3 text-base font-bold text-emerald-950 transition-colors hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-wait disabled:bg-emerald-700 disabled:text-emerald-100"
                >
                  {isStartingCheckout && (
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-950/30 border-t-emerald-950"
                    />
                  )}
                  {!salesEnabled
                    ? t("desktop.sales.checkout.unavailableAction")
                    : isStartingCheckout
                      ? t("desktop.sales.checkout.loading")
                      : `${t("desktop.sales.buyFor")} RM29.90`}
                </button>
              </form>

              <div className="mt-5 rounded-lg border border-gray-800 bg-black/40 p-4 text-sm leading-6 text-gray-400">
                <strong className="text-gray-200">
                  {t("desktop.sales.checkout.hostedTitle")}
                </strong>{" "}
                {t("desktop.sales.checkout.hostedBody")}
              </div>
              <p className="mb-0 mt-4 text-xs leading-5 text-gray-500">
                {t("desktop.sales.checkout.accessWindow")}
              </p>
            </div>

            <aside
              className="space-y-4"
              aria-label={t("desktop.sales.policiesTitle")}
            >
              <section className="rounded-xl border border-gray-800 bg-gray-900 p-6">
                <h2 className="text-xl text-white">
                  {t("desktop.sales.supportTitle")}
                </h2>
                <p className="mb-0 mt-2 text-sm leading-6 text-gray-400">
                  {t("desktop.sales.supportBody")}{" "}
                  <a
                    href="mailto:g@youjing.dev"
                    className="font-semibold text-emerald-300 underline decoration-emerald-700 underline-offset-4 hover:text-emerald-200"
                  >
                    g@youjing.dev
                  </a>
                </p>
              </section>
              <section className="rounded-xl border border-gray-800 bg-gray-900 p-6">
                <h2 className="text-xl text-white">
                  {t("desktop.sales.refundTitle")}
                </h2>
                <p className="mb-0 mt-2 text-sm leading-6 text-gray-400">
                  {t("desktop.sales.refundBody")}
                </p>
              </section>
              <section className="rounded-xl border border-gray-800 bg-gray-900 p-6">
                <h2 className="text-xl text-white">
                  {t("desktop.sales.privacyTitle")}
                </h2>
                <p className="mb-0 mt-2 text-sm leading-6 text-gray-400">
                  {t("desktop.sales.privacyBody")}
                </p>
              </section>
            </aside>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-800 bg-gray-950">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} CRUD LABS SDN BHD</span>
          <Link href="/palang-ic" className="hover:text-emerald-300">
            {t("desktop.sales.useWebTool")}
          </Link>
        </div>
      </footer>
    </div>
  );
}
