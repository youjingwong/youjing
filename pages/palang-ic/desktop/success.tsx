import type { GetStaticProps } from "next";
import Head from "next/head";
import { useTranslation } from "next-i18next/pages";
import { serverSideTranslations } from "next-i18next/pages/serverSideTranslations";
import PalangDesktopSuccess from "../../../components/PalangDesktopSuccess";

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale || "en", ["common"])),
  },
});

export default function PalangDesktopSuccessPage() {
  const { t } = useTranslation("common");

  return (
    <>
      <Head>
        <title>{t("desktop.success.seoTitle")}</title>
        <meta
          name="description"
          content={t("desktop.success.seoDescription")}
        />
        <meta name="robots" content="noindex,nofollow,noarchive" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <PalangDesktopSuccess />
    </>
  );
}
