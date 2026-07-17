import type { GetStaticProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next/pages";
import { serverSideTranslations } from "next-i18next/pages/serverSideTranslations";
import PalangDesktopSales from "../../../components/PalangDesktopSales";

const SITE_URL = "https://www.youjing.dev";
const PRODUCT_PATH = "/palang-ic/desktop";

type PalangDesktopPageProps = {
  salesEnabled: boolean;
};

export const getStaticProps: GetStaticProps<PalangDesktopPageProps> = async ({
  locale,
}) => ({
  props: {
    ...(await serverSideTranslations(locale || "en", ["common"])),
    salesEnabled:
      process.env.PALANG_DESKTOP_SALES_ENABLED?.trim().toLowerCase() === "true",
  },
});

export default function PalangDesktopPage({
  salesEnabled,
}: PalangDesktopPageProps) {
  const { t } = useTranslation("common");
  const { locale, defaultLocale } = useRouter();
  const localePrefix = locale && locale !== defaultLocale ? `/${locale}` : "";
  const canonicalUrl = `${SITE_URL}${localePrefix}${PRODUCT_PATH}`;
  const openGraphLocale =
    locale === "ms" ? "ms_MY" : locale === "zh" ? "zh_CN" : "en_MY";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Palang IC Desktop",
    description: t("desktop.sales.seoDescription"),
    applicationCategory: "SecurityApplication",
    operatingSystem: ["macOS", "Windows"],
    inLanguage: ["en", "ms", "zh"],
    image: `${SITE_URL}/og/id-marking.png`,
    url: canonicalUrl,
    offers: {
      "@type": "Offer",
      price: "29.90",
      priceCurrency: "MYR",
      ...(salesEnabled ? { availability: "https://schema.org/InStock" } : {}),
      url: canonicalUrl,
      seller: {
        "@type": "Organization",
        name: "CRUD LABS SDN BHD",
      },
    },
    featureList: [
      t("desktop.sales.benefits.vault.title"),
      t("desktop.sales.benefits.persistence.title"),
      t("desktop.sales.benefits.offline.title"),
    ],
  };

  return (
    <>
      <Head>
        <title>{t("desktop.sales.seoTitle")}</title>
        <meta name="description" content={t("desktop.sales.seoDescription")} />
        <meta name="robots" content="index,follow" />
        <link rel="canonical" href={canonicalUrl} />
        <link
          rel="alternate"
          hrefLang="en"
          href={`${SITE_URL}${PRODUCT_PATH}`}
        />
        <link
          rel="alternate"
          hrefLang="ms"
          href={`${SITE_URL}/ms${PRODUCT_PATH}`}
        />
        <link
          rel="alternate"
          hrefLang="zh"
          href={`${SITE_URL}/zh${PRODUCT_PATH}`}
        />
        <link
          rel="alternate"
          hrefLang="x-default"
          href={`${SITE_URL}${PRODUCT_PATH}`}
        />
        <meta property="og:type" content="product" />
        <meta property="og:title" content={t("desktop.sales.seoTitle")} />
        <meta
          property="og:description"
          content={t("desktop.sales.seoDescription")}
        />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:site_name" content="Palang IC" />
        <meta property="og:locale" content={openGraphLocale} />
        <meta property="og:image" content={`${SITE_URL}/og/id-marking.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="product:price:amount" content="29.90" />
        <meta property="product:price:currency" content="MYR" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={t("desktop.sales.seoTitle")} />
        <meta
          name="twitter:description"
          content={t("desktop.sales.seoDescription")}
        />
        <meta name="twitter:image" content={`${SITE_URL}/og/id-marking.png`} />
      </Head>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PalangDesktopSales salesEnabled={salesEnabled} />
    </>
  );
}
