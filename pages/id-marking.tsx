import { NextSeo } from 'next-seo';
import dynamic from 'next/dynamic';

// Dynamically import the client component to avoid SSR issues with canvas
const IDMarkingClient = dynamic(() => import('../components/IDMarkingClient'), {
  ssr: false,
});

const SEO = {
  title: 'ID Marking - MyKad Cross Out & Watermark Tool | Palang IC',
  description: 'Cross out and watermark Malaysian IC/MyKad images. Easy to use tool for MyKad, IC, and identification documents. Palang IC dengan mudah.',
  openGraph: {
    title: 'ID Marking - MyKad Cross Out & Watermark Tool | Palang IC',
    description: 'Cross out and watermark Malaysian IC/MyKad images. Simple, secure, no registration required. Palang IC dengan mudah dan selamat.',
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
    locale: 'en_MY',
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
      content: 'English'
    },
    {
      name: 'application-name',
      content: 'ID Marking - MyKad Cross Out Tool'
    },
    {
      name: 'description',
      content: 'Cross out and watermark Malaysian IC/MyKad images. Simple, secure, and easy to use. No registration required.'
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
  "name": "ID Marking Tool",
  "description": "Online tool for crossing out and watermarking Malaysian IC/MyKad images",
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

export default function IDMarking() {
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
} 