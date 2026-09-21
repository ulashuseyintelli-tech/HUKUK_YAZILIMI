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

  // AYNI ORIGIN /api (2026-09-21, lib/api-base-url.ts): tarayıcı yerel olmayan bir host'tan açıldığında
  // istekleri sayfanın kendi origin'ine `/api/...` olarak yollar. Dış erişimde kenar katmanı `/api`'yi
  // DOĞRUDAN API'ye yönlendirir; bu kural yalnız kenarsız erişimde (ör. personelin sunucuyu makine adıyla
  // açması) aynı yolu iç API'ye taşır. `fallback`: yalnız eşleşen sayfa/dosya YOKSA devreye girer
  // (web'de `app/api` rotası yok). Hedef derleme anında sabitlenir; alan adı İÇERMEZ.
  async rewrites() {
    const apiInternal = (process.env.API_INTERNAL_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '');
    return {
      fallback: [{ source: '/api/:path*', destination: `${apiInternal}/api/:path*` }],
    };
  },
};

module.exports = nextConfig;
