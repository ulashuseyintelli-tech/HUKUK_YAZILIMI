import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';

/**
 * Credential Recovery Rate Limit Guard
 *
 * IP bazlı basit rate limiting — forgot-password/reset-password enumeration ve
 * brute-force koruması. Üretim ortamında Redis-backed store'a taşınmalı.
 *
 * CLIENT-P2-CREDENTIAL-RECOVERY-P01: LoginRateLimitGuard'dan KASITLI OLARAK AYRI —
 * login ve credential-recovery bucket'ları paylaşılmaz (bkz. login-rate-limit.guard.ts,
 * PF-002; o guard /auth/login + /portal/login için module-scope ortak store kullanır).
 *
 * /portal/forgot-password ve /portal/reset-password endpoint'leri için.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;       // 1 dakika pencere
const MAX_ATTEMPTS = 10;        // Pencere başına maks deneme
const BLOCK_DURATION_MS = 300_000; // 5 dakika blok süresi

// Bu guard'a özel, LoginRateLimitGuard'ın store'undan bağımsız in-memory store.
const store = new Map<string, RateLimitEntry>();

// Periyodik temizlik (memory leak önleme)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 60_000);

@Injectable()
export class CredentialRecoveryRateLimitGuard implements CanActivate {
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
          message: `Çok fazla deneme. ${retryAfterSec} saniye sonra tekrar deneyin.`,
          retryAfter: retryAfterSec,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (!entry || now >= entry.resetAt) {
      store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    } else {
      entry.count++;
      if (entry.count >= MAX_ATTEMPTS) {
        entry.resetAt = now + BLOCK_DURATION_MS;
      }
    }

    return true;
  }
}
