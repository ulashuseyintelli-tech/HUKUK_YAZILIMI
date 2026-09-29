import type { INestApplication } from "@nestjs/common";

/**
 * PF-005: Reverse proxy arkasında gerçek client IP'si için Express `trust proxy` ayarı.
 * Değer 1 = tek hop (uygulama → nginx/ALB → client). Hop sayısı değişirse bu değer
 * güncellenmelidir.
 *
 * Tek yapılandırma noktası: `main.ts` bootstrap'ı ve `src/tests/trust-proxy.spec.ts`
 * AYNI fonksiyonu çağırır. Yalnız verilen uygulamanın HTTP adaptörünü ayarlar; başka
 * yan etkisi yoktur (env okumaz, dinleme başlatmaz).
 */
export const TRUST_PROXY_HOPS = 1;

export function applyTrustProxy(app: INestApplication): void {
  app.getHttpAdapter().getInstance().set("trust proxy", TRUST_PROXY_HOPS);
}
