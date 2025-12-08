/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@hukuk/ui", "@hukuk/types"],
  experimental: {
    serverActions: true,
  },
};

module.exports = nextConfig;
