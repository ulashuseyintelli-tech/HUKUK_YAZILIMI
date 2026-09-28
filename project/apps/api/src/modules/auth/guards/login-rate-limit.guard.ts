import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { resolvePublicIntakeClientIp } from '../../client-intake-public/public-intake-client-ip';

/**
 * Login Rate Limit Guard
 * 
 * IP bazlı basit rate limiting — brute force koruması.
 * Üretim ortamında Redis-backed store'a taşınmalı.
 * 
 * PF-002: /auth/login ve /portal/login endpoint'leri için.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;       // 1 dakika pencere
const MAX_ATTEMPTS = 10;        // Pencere başına maks deneme
const BLOCK_DURATION_MS = 300_000; // 5 dakika blok süresi

// In-memory store — tek instance için yeterli.
// Multi-instance'ta Redis'e taşınmalı.
const store = new Map<string, RateLimitEntry>();
// D5-SEC-R03: portal girişi sayacı personel sayacından AYRI — aynı anahtara düşen personel istekleri portal kullanıcısını
// (ve tersi) 429'a düşüremez. Limitler aynı sabitlerdir; yalnız kova ayrıdır.
const portalStore = new Map<string, RateLimitEntry>();

// Periyodik temizlik (memory leak önleme)
setInterval(() => {
  const now = Date.now();
  for (const s of [store, portalStore]) {
    for (const [key, entry] of s) {
      if (now > entry.resetAt) s.delete(key);
    }
  }
}, 60_000);

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const ip = this.clientKey(request);
    const now = Date.now();
    const bucket = this.bucket();

    const entry = bucket.get(ip);

    if (entry && now < entry.resetAt && entry.count >= MAX_ATTEMPTS) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Çok fazla başarısız giriş denemesi. ${retryAfterSec} saniye sonra tekrar deneyin.`,
          retryAfter: retryAfterSec,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (!entry || now >= entry.resetAt) {
      bucket.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    } else {
      entry.count++;
      // Limit aşıldıysa blok süresini uzat
      if (entry.count >= MAX_ATTEMPTS) {
        entry.resetAt = now + BLOCK_DURATION_MS;
      }
    }

    return true;
  }

  /** Varsayılan istemci anahtarı (`request.ip`). */
  protected clientKey(request: any): string {
    return request.ip || request.connection?.remoteAddress || 'unknown';
  }

  /** Bu yüzeyin sayaç kovası (personel: modül düzeyi `store`). */
  protected bucket(): Map<string, RateLimitEntry> {
    return store;
  }
}

/**
 * D5-SEC-R01 — YALNIZ `POST /api/portal/login`. Anahtar, public intake ile AYNI güven sınırıyla çözülür
 * (X3-B03, `public-intake-client-ip.ts`): istemci IP'si socket peer'idir; `X-Forwarded-For`'dan türeyen `req.ip`
 * yalnız peer `PUBLIC_INTAKE_TRUSTED_PROXY_IPS` tam eşleşme listesindeyse (kenar vekili) kabul edilir. Global
 * `trust proxy` ayarı DEĞİŞMEZ. Sayaç kovası personelden AYRIDIR (D5-SEC-R03); limit aynı.
 */
@Injectable()
export class PortalLoginRateLimitGuard extends LoginRateLimitGuard {
  protected override clientKey(request: any): string {
    return resolvePublicIntakeClientIp(request);
  }

  protected override bucket(): Map<string, RateLimitEntry> {
    return portalStore;
  }
}
