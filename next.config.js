/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "@x402/evm/upto/client": false,
      "@coinbase/cdp-sdk": false,
    };
    return config;
  },
};

module.exports = nextConfig;
