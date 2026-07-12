import { appWithTranslation } from "next-i18next/pages";
import type { AppProps } from "next/app";
import { Outfit } from "next/font/google";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect } from "react";
import * as gtag from "../lib/gtag";
import { isPrivateToolPath } from "../lib/privacy";
import "../styles/globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-outfit",
});

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();

  useEffect(() => {
    // Track page views when the route changes
    const handleRouteChange = (url: string) => {
      if (!isPrivateToolPath(url)) {
        gtag.pageview(url);
      }
    };

    router.events.on("routeChangeComplete", handleRouteChange);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router.events]);

  return (
    <>
      <Head>
        <title>You Jing Wong</title>
      </Head>
      <div className={outfit.variable}>
        <Component {...pageProps} />
      </div>
    </>
  );
}

export default appWithTranslation(MyApp);
