import { GetStaticProps } from 'next';
import Head from 'next/head';
import { useTranslation } from 'next-i18next/pages';
import { serverSideTranslations } from 'next-i18next/pages/serverSideTranslations';
import { generateNextSeo, type NextSeoProps } from 'next-seo/pages';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';

// Dynamically import the client component to avoid SSR issues with canvas
const IDMarkingClient = dynamic(() => import('../components/IDMarkingClient'), {
  ssr: false,
});

export const getStaticProps: GetStaticProps = async ({ locale }) => {
  return {
    props: {
      ...(await serverSideTranslations(locale || 'en', ['common'])),
    },
  };
};

const IDMarking = () => {
  const { t } = useTranslation('common');
  const { locale } = useRouter();

  const SEO: NextSeoProps = {
    title: `${t('title')} | Palang IC`,
    description: locale === 'ms'
      ? 'Palang dan tambah tanda air pada imej IC/MyKad secara peribadi dalam pelayar anda. Imej kekal pada peranti anda dan tidak pernah dimuat naik.'
      : 'Cross out and watermark Malaysian IC/MyKad images privately in your browser. Images stay on your device and are never uploaded.',
    openGraph: {
      title: `${t('title')} | Palang IC`,
      description: locale === 'ms'
        ? 'Privasi terbina dalam: palang dan tambah tanda air pada IC/MyKad terus dalam pelayar. Tiada muat naik atau simpanan imej pada pelayan.'
        : 'Private by design: cross out and watermark IC/MyKad images in your browser with no image uploads or server-side image storage.',
      url: 'https://www.youjing.dev/id-marking',
      type: 'website',
      images: [
        {
          url: '/og/id-marking.png',
          width: 1200,
          height: 630,
          alt: 'ID Marking Tool - MyKad Cross Out & Watermark',
        },
      ],
      locale: locale === 'ms' ? 'ms_MY' : 'en_MY',
      siteName: 'You Jing',
    },
    twitter: {
      handle: '@youjing',
      site: '@youjing',
      cardType: 'summary_large_image',
    },
    additionalMetaTags: [
      {
        name: 'keywords',
        content: 'palang ic, cross ic, mykad cross out, ic cross out, potong ic, watermark ic, malaysian ic tool, palang mykad, cross mykad, watermark mykad, ic malaysia, watermark tool, ic tool'
      },
      {
        name: 'author',
        content: 'You Jing'
      },
      {
        name: 'language',
        content: locale === 'ms' ? 'Malay' : 'English'
      },
      {
        name: 'application-name',
        content: `${t('title')}`
      }
    ],
    additionalLinkTags: [
      {
        rel: 'icon',
        href: '/favicon.ico'
      }
    ]
  };

  // JSON-LD data
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": t('title'),
    "description": locale === 'ms'
      ? "Alat privasi untuk memalangi dan menambah tanda air pada imej IC/MyKad secara setempat dalam pelayar"
      : "Privacy-first browser tool for crossing out and watermarking Malaysian IC/MyKad images locally",
    "applicationCategory": "Utility",
    "operatingSystem": "Any",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "MYR"
    },
    "inLanguage": ["en", "ms"],
    "author": {
      "@type": "Person",
      "name": "You Jing",
      "url": "https://www.youjing.dev"
    }
  };

  return (
    <>
      <Head>{generateNextSeo(SEO)}</Head>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <IDMarkingClient />
    </>
  );
};

export default IDMarking;
