import { GetStaticProps } from 'next';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { NextSeo } from 'next-seo';
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

  const SEO = {
    title: `${t('title')} | Palang IC`,
    description: locale === 'ms'
      ? 'Palang dan tambah tanda air pada imej MyKad Malaysia. Alat mudah untuk MyKad, IC, dan dokumen pengenalan. Palang IC dengan mudah.'
      : 'Cross out and watermark Malaysian IC/MyKad images. Easy to use tool for MyKad, IC, and identification documents. Palang IC dengan mudah.',
    openGraph: {
      title: `${t('title')} | Palang IC`,
      description: locale === 'ms'
        ? 'Palang dan tambah tanda air pada imej MyKad Malaysia. Mudah, selamat, tiada pendaftaran diperlukan. Palang IC dengan mudah dan selamat.'
        : 'Cross out and watermark Malaysian IC/MyKad images. Simple, secure, no registration required. Palang IC dengan mudah dan selamat.',
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
      },
      {
        name: 'description',
        content: locale === 'ms'
          ? 'Palang dan tambah tanda air pada imej MyKad Malaysia. Mudah, selamat, dan senang digunakan. Tiada pendaftaran diperlukan.'
          : 'Cross out and watermark Malaysian IC/MyKad images. Simple, secure, and easy to use. No registration required.'
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
      ? "Alat dalam talian untuk memalangi dan menambah tanda air pada imej MyKad Malaysia"
      : "Online tool for crossing out and watermarking Malaysian IC/MyKad images",
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
      <NextSeo {...SEO} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <IDMarkingClient />
    </>
  );
};

export default IDMarking; 