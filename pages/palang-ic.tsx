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

const PalangIC = () => {
  const { t } = useTranslation('common');
  const { locale } = useRouter();

  const getDescription = () => {
    switch (locale) {
      case 'ms':
        return 'Palang dan tambah tanda air pada imej MyKad Malaysia. Alat mudah untuk MyKad, IC, dan dokumen pengenalan. Palang IC dengan mudah.';
      case 'zh':
        return '在马来西亚MyKad图像上划线和添加水印。适用于MyKad、IC和身份证件的简易工具。轻松划线IC。';
      default:
        return 'Cross out and watermark Malaysian IC/MyKad images. Easy to use tool for MyKad, IC, and identification documents. Palang IC dengan mudah.';
    }
  };

  const getOgDescription = () => {
    switch (locale) {
      case 'ms':
        return 'Palang dan tambah tanda air pada imej MyKad Malaysia. Mudah, selamat, tiada pendaftaran diperlukan. Palang IC dengan mudah dan selamat.';
      case 'zh':
        return '在马来西亚MyKad图像上划线和添加水印。简单、安全，无需注册。轻松安全地划线IC。';
      default:
        return 'Cross out and watermark Malaysian IC/MyKad images. Simple, secure, no registration required. Palang IC dengan mudah dan selamat.';
    }
  };

  const getMetaDescription = () => {
    switch (locale) {
      case 'ms':
        return 'Palang dan tambah tanda air pada imej MyKad Malaysia. Mudah, selamat, dan senang digunakan. Tiada pendaftaran diperlukan.';
      case 'zh':
        return '在马来西亚MyKad图像上划线和添加水印。简单、安全且易于使用。无需注册。';
      default:
        return 'Cross out and watermark Malaysian IC/MyKad images. Simple, secure, and easy to use. No registration required.';
    }
  };

  const getJsonLdDescription = () => {
    switch (locale) {
      case 'ms':
        return "Alat dalam talian untuk memalangi dan menambah tanda air pada imej MyKad Malaysia";
      case 'zh':
        return "用于在马来西亚MyKad图像上划线和添加水印的在线工具";
      default:
        return "Online tool for crossing out and watermarking Malaysian IC/MyKad images";
    }
  };

  const getLocale = () => {
    switch (locale) {
      case 'ms':
        return 'ms_MY';
      case 'zh':
        return 'zh_CN';
      default:
        return 'en_MY';
    }
  };

  const getLanguage = () => {
    switch (locale) {
      case 'ms':
        return 'Malay';
      case 'zh':
        return 'Chinese';
      default:
        return 'English';
    }
  };

  const SEO = {
    title: `${t('title')} | Palang IC`,
    description: getDescription(),
    openGraph: {
      title: `${t('title')} | Palang IC`,
      description: getOgDescription(),
      url: 'https://www.youjing.dev/palang-ic',
      type: 'website',
      images: [
        {
          url: '/og/id-marking.png',
          width: 1200,
          height: 630,
          alt: 'Palang IC - MyKad Cross Out & Watermark',
        },
      ],
      locale: getLocale(),
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
        content: getLanguage()
      },
      {
        name: 'application-name',
        content: `${t('title')}`
      },
      {
        name: 'description',
        content: getMetaDescription()
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
    "description": getJsonLdDescription(),
    "applicationCategory": "Utility",
    "operatingSystem": "Any",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "MYR"
    },
    "inLanguage": ["en", "ms", "zh"],
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

export default PalangIC; 