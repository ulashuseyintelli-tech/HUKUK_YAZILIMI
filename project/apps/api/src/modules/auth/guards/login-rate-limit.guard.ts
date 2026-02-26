import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';

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

// Periyodik temizlik (memory leak önleme)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 60_000);

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip || request.connection?.remoteAddress || 'unknown';
    const now = Date.now();

    const entry = store.get(ip);

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
      store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    } else {
      entry.count++;
      // Limit aşıldıysa blok süresini uzat
      if (entry.count >= MAX_ATTEMPTS) {
        entry.resetAt = now + BLOCK_DURATION_MS;
      }
    }

    return true;
  }
}
