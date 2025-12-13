/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@hukuk/ui", "@hukuk/types"],
  
  // Performans optimizasyonları
  poweredByHeader: false,
  compress: true,
  
  // Image optimizasyonu
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60,
  },
  
  // Bundle optimizasyonu
  experimental: {
    optimizePackageImports: ['lucide-react', '@hukuk/ui'],
  },
};

module.exports = nextConfig;
