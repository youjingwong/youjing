import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';

export const config = {
  runtime: 'edge',
};

export default function handler(req: NextRequest) {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#111827',
          background: 'linear-gradient(to bottom right, #111827, #1f2937)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
          }}
        >
          <h1
            style={{
              fontSize: 72,
              fontWeight: 'bold',
              color: 'white',
              textAlign: 'center',
              marginBottom: '0.5rem',
            }}
          >
            ID Marking Tool
          </h1>
          <h2
            style={{
              fontSize: 36,
              color: 'white',
              textAlign: 'center',
              marginBottom: '1rem',
              opacity: 0.9,
            }}
          >
            MyKad Cross Out & Watermark
          </h2>
          <p
            style={{
              fontSize: 28,
              color: 'white',
              textAlign: 'center',
              opacity: 0.8,
            }}
          >
            Simple • Secure • No Registration Required
          </p>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
} 