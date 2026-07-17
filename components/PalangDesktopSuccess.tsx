import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "next-i18next/pages";
import { useRouter } from "next/router";

const ORDER_TOKEN_STORAGE_KEY = "palang-ic-desktop-order-token";
const STATUS_POLL_INITIAL_INTERVAL_MS = 2_500;
const STATUS_POLL_MAX_INTERVAL_MS = 10_000;
const STATUS_POLL_MAX_DURATION_MS = 5 * 60 * 1_000;

type DownloadArtifactId = "mac-arm64" | "mac-x64" | "windows-x64";

interface DownloadArtifact {
  id: DownloadArtifactId;
}

const ARTIFACT_COPY_KEYS: Record<
  DownloadArtifactId,
  "macArm" | "macIntel" | "windows"
> = {
  "mac-arm64": "macArm",
  "mac-x64": "macIntel",
  "windows-x64": "windows",
};

type PurchasePhase = "resolving" | "pending" | "paid" | "error";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null;

const readArtifact = (value: unknown): DownloadArtifact | null => {
  if (!isRecord(value)) return null;
  const { id } = value;

  return typeof id === "string" && Object.hasOwn(ARTIFACT_COPY_KEYS, id)
    ? { id: id as DownloadArtifactId }
    : null;
};

const getTokenAndCleanUrl = () => {
  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const urlToken = hashParams.get("token");
  const hasRejectedQueryToken = url.searchParams.has("token");
  let storedToken: string | null = null;

  try {
    storedToken = window.sessionStorage.getItem(ORDER_TOKEN_STORAGE_KEY);
  } catch {
    // The URL token remains available if storage is disabled.
  }

  const token = urlToken || storedToken;

  if (token) {
    try {
      window.sessionStorage.setItem(ORDER_TOKEN_STORAGE_KEY, token);
    } catch {
      // Session storage is only a same-tab fallback.
    }
  }

  if (hashParams.has("token") || hasRejectedQueryToken) {
    url.searchParams.delete("token");
    hashParams.delete("token");
    const search = url.searchParams.toString();
    const hash = hashParams.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`,
    );
  }

  return token;
};

export default function PalangDesktopSuccess() {
  const { t } = useTranslation("common");
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<PurchasePhase>("resolving");
  const [artifacts, setArtifacts] = useState<DownloadArtifact[]>([]);
  const [retryKey, setRetryKey] = useState(0);
  const [downloadingArtifact, setDownloadingArtifact] = useState<string | null>(
    null,
  );
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;

    let updateTimer: number | null = null;
    const resolvePurchaseToken = () => {
      const purchaseToken = getTokenAndCleanUrl();

      if (updateTimer !== null) window.clearTimeout(updateTimer);
      updateTimer = window.setTimeout(() => {
        if (!purchaseToken) {
          setPhase("error");
          return;
        }

        setPhase("resolving");
        setToken(purchaseToken);
      }, 0);
    };

    resolvePurchaseToken();
    window.addEventListener("hashchange", resolvePurchaseToken);
    window.addEventListener("popstate", resolvePurchaseToken);

    return () => {
      if (updateTimer !== null) window.clearTimeout(updateTimer);
      window.removeEventListener("hashchange", resolvePurchaseToken);
      window.removeEventListener("popstate", resolvePurchaseToken);
    };
  }, [router.isReady]);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const pollingStartedAt = Date.now();
    let pollInterval = STATUS_POLL_INITIAL_INTERVAL_MS;

    const checkPurchase = async () => {
      try {
        const response = await fetch("/api/palang-desktop/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (!response.ok) throw new Error("status-request-failed");

        const body: unknown = await response.json();
        if (!isRecord(body) || typeof body.status !== "string") {
          throw new Error("invalid-status-response");
        }

        if (cancelled) return;

        if (body.status === "pending") {
          if (Date.now() - pollingStartedAt >= STATUS_POLL_MAX_DURATION_MS) {
            setPhase("error");
            return;
          }
          setPhase("pending");
          pollTimer = setTimeout(checkPurchase, pollInterval);
          pollInterval = Math.min(
            STATUS_POLL_MAX_INTERVAL_MS,
            Math.ceil(pollInterval * 1.5),
          );
          return;
        }

        if (body.status === "paid" && Array.isArray(body.artifacts)) {
          const availableArtifacts = body.artifacts
            .map(readArtifact)
            .filter((artifact): artifact is DownloadArtifact =>
              Boolean(artifact),
            );

          if (availableArtifacts.length === 0) {
            throw new Error("missing-downloads");
          }

          setArtifacts(availableArtifacts);
          setPhase("paid");
          return;
        }

        setPhase("error");
      } catch {
        if (!cancelled) setPhase("error");
      }
    };

    void checkPurchase();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [retryKey, token]);

  const handleDownload = async (artifactId: string) => {
    if (!token || downloadingArtifact) return;

    setDownloadingArtifact(artifactId);
    setDownloadError(null);

    try {
      const response = await fetch("/api/palang-desktop/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, artifactId }),
      });

      if (!response.ok) throw new Error("download-request-failed");

      const body: unknown = await response.json();
      if (!isRecord(body) || typeof body.url !== "string") {
        throw new Error("invalid-download-response");
      }

      const downloadUrl = new URL(body.url, window.location.origin);
      if (downloadUrl.protocol !== "https:") {
        throw new Error("invalid-download-url");
      }

      window.location.assign(downloadUrl.toString());
    } catch {
      setDownloadError(t("desktop.success.downloadError"));
    } finally {
      setDownloadingArtifact(null);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-gray-800 bg-gray-950/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
          <Link
            href="/palang-ic/desktop"
            className="inline-flex items-center gap-3 rounded-md text-sm font-semibold text-gray-200 hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400"
          >
            <span
              aria-hidden="true"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-950 text-lg text-emerald-300"
            >
              ←
            </span>
            {t("desktop.success.backToProduct")}
          </Link>
          <span className="text-sm font-semibold text-gray-400">
            Palang IC Desktop
          </span>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-156px)] max-w-5xl items-start justify-center px-4 py-12 sm:items-center sm:py-16">
        <section
          aria-labelledby="purchase-status-title"
          className="w-full overflow-hidden rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl shadow-emerald-950/20"
        >
          {(phase === "resolving" || phase === "pending") && (
            <div
              className="px-6 py-14 text-center sm:px-12 sm:py-18"
              role="status"
              aria-live="polite"
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-950">
                <span
                  aria-hidden="true"
                  className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-300/25 border-t-emerald-300"
                />
              </div>
              <h1
                id="purchase-status-title"
                className="mt-6 text-3xl text-white"
              >
                {phase === "pending"
                  ? t("desktop.success.pendingTitle")
                  : t("desktop.success.checkingTitle")}
              </h1>
              <p className="mx-auto mt-3 max-w-xl text-gray-400">
                {phase === "pending"
                  ? t("desktop.success.pendingBody")
                  : t("desktop.success.checkingBody")}
              </p>
              <p className="mx-auto mt-6 max-w-xl rounded-lg border border-gray-800 bg-black/40 p-4 text-sm leading-6 text-gray-500">
                {t("desktop.success.safeToWait")}
              </p>
            </div>
          )}

          {phase === "paid" && (
            <div>
              <div className="border-b border-emerald-800/70 bg-emerald-950/40 px-6 py-8 text-center sm:px-12">
                <div
                  className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400 text-2xl font-bold text-emerald-950"
                  aria-hidden="true"
                >
                  ✓
                </div>
                <h1
                  id="purchase-status-title"
                  className="mt-5 text-3xl text-emerald-100"
                >
                  {t("desktop.success.paidTitle")}
                </h1>
                <p className="mx-auto mt-3 max-w-2xl text-emerald-100/75">
                  {t("desktop.success.paidBody")}
                </p>
              </div>

              <div className="px-6 py-8 sm:px-10 sm:py-10">
                <h2 className="text-xl text-white">
                  {t("desktop.success.chooseInstaller")}
                </h2>
                <p className="mt-2 text-sm text-gray-400">
                  {t("desktop.success.allIncluded")}
                </p>
                <div className="mt-6 grid gap-3 md:grid-cols-3">
                  {artifacts.map((artifact) => (
                    <article
                      key={artifact.id}
                      className="flex flex-col rounded-xl border border-gray-700 bg-gray-950 p-5"
                    >
                      <h3 className="text-lg font-semibold text-white">
                        {t(
                          `desktop.sales.installers.${ARTIFACT_COPY_KEYS[artifact.id]}.label`,
                        )}
                      </h3>
                      <p className="mb-5 mt-2 flex-1 text-sm leading-6 text-gray-400">
                        {t(
                          `desktop.sales.installers.${ARTIFACT_COPY_KEYS[artifact.id]}.detail`,
                        )}
                      </p>
                      <button
                        type="button"
                        disabled={Boolean(downloadingArtifact)}
                        onClick={() => handleDownload(artifact.id)}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-400 px-4 py-2.5 text-sm font-bold text-emerald-950 transition-colors hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-wait disabled:bg-emerald-800 disabled:text-emerald-200"
                      >
                        {downloadingArtifact === artifact.id && (
                          <span
                            aria-hidden="true"
                            className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-950/30 border-t-emerald-950"
                          />
                        )}
                        {downloadingArtifact === artifact.id
                          ? t("desktop.success.preparingDownload")
                          : t("desktop.success.download")}
                      </button>
                    </article>
                  ))}
                </div>

                {downloadError && (
                  <p
                    role="alert"
                    className="mb-0 mt-5 rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-200"
                  >
                    {downloadError}
                  </p>
                )}

                <div className="mt-8 rounded-lg border border-gray-800 bg-black/40 p-5 text-sm leading-6 text-gray-400">
                  <strong className="text-gray-200">
                    {t("desktop.success.emailTitle")}
                  </strong>{" "}
                  {t("desktop.success.emailBody")}
                </div>
              </div>
            </div>
          )}

          {phase === "error" && (
            <div
              className="px-6 py-14 text-center sm:px-12 sm:py-18"
              role="alert"
            >
              <div
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-950 text-2xl font-bold text-amber-300"
                aria-hidden="true"
              >
                !
              </div>
              <h1
                id="purchase-status-title"
                className="mt-6 text-3xl text-white"
              >
                {token
                  ? t("desktop.success.errorTitle")
                  : t("desktop.success.missingTitle")}
              </h1>
              <p className="mx-auto mt-3 max-w-xl text-gray-400">
                {token
                  ? t("desktop.success.errorBody")
                  : t("desktop.success.missingBody")}
              </p>
              <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
                {token && (
                  <button
                    type="button"
                    onClick={() => {
                      setPhase("resolving");
                      setRetryKey((current) => current + 1);
                    }}
                    className="inline-flex min-h-11 items-center justify-center rounded-md bg-emerald-400 px-5 py-2.5 text-sm font-bold text-emerald-950 hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
                  >
                    {t("desktop.success.tryAgain")}
                  </button>
                )}
                <a
                  href="mailto:g@youjing.dev"
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-gray-600 px-5 py-2.5 text-sm font-semibold text-gray-200 hover:border-gray-500 hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400"
                >
                  {t("desktop.success.contactSupport")}
                </a>
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-gray-800 bg-gray-950 px-4 py-6 text-center text-xs text-gray-600">
        {t("desktop.success.footer")}
      </footer>
    </div>
  );
}
