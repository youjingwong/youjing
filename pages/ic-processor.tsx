import dynamic from 'next/dynamic';
import Head from 'next/head';

// Import heic2any dynamically to prevent server-side loading
const heic2anyPromise = () => import('heic2any').then((mod) => mod.default);

// Create a client-side only component
const ICProcessorClient = dynamic(() => import('../components/ICProcessorClient'), {
  ssr: false,
});

export default function ICProcessor() {
  return (
    <div className="min-h-screen bg-gray-100 my-8">
      <Head>
        <title>IC Image Processor</title>
      </Head>
      <ICProcessorClient />
    </div>
  );
} 