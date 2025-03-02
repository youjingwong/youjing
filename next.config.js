/** @type {import('next').NextConfig} */
const { i18n } = require('./next-i18next.config');

module.exports = {
  reactStrictMode: true,
  i18n,
  async redirects() {
    return [
      {
        source: '/id-marking',
        destination: '/palang-ic',
        permanent: true,
      },
    ];
  },
}
