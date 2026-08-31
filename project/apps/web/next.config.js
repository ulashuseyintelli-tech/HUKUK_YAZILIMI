/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@hukuk/ui", "@hukuk/types"],
  
  // Performans optimizasyonları
  poweredByHeader: false,
  compress: true,
  
  // C37 — release koku runtime icin SALT-OKUNURDUR.
  // `next start` image optimizer'i optimize edilmis goruntuleri
  // `<distDir>/cache/images` altina, yani release kokunun ICINE yazar.
  // `unoptimized: true` bu yuzeyi yapisal olarak kapatir (endpoint donusum
  // yapmaz, cache dizini hic olusmaz). Islevsel kayip yok: uygulama kodunda
  // `next/image` kullanimi olculdu = 0.
  images: {
    unoptimized: true,
  },
  
  // Bundle optimizasyonu
  experimental: {
    optimizePackageImports: ['lucide-react', '@hukuk/ui'],
  },
};

module.exports = nextConfig;
