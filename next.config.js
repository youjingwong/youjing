/** @type {import('next').NextConfig} */
const { i18n } = require('./next-i18next.config');

module.exports = {
  reactStrictMode: true,
  i18n,
  turbopack: {
    root: __dirname,
  },
  async redirects() {
    return [
      {
        source: '/id-marking',
        destination: '/palang-ic',
        permanent: true,
      },
    ];
  },
  // Configure headers to ensure sitemap is accessible
  async headers() {
    return [
      {
        source: '/sitemap.xml',
        headers: [
          {
            key: 'Content-Type',
            value: 'text/xml',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, must-revalidate',
          },
        ],
      },
    ];
  },
}
