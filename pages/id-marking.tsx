import dynamic from 'next/dynamic';
import Head from 'next/head';

// Dynamically import the client component to avoid SSR issues with canvas
const IDMarkingClient = dynamic(() => import('../components/IDMarkingClient'), {
  ssr: false,
});

export default function IDMarking() {
  return (
    <>
      <Head>
        <title>ID Marking</title>
        <meta name="description" content="ID Marking Tool" />
      </Head>

      <IDMarkingClient />
    </>
  );
} 