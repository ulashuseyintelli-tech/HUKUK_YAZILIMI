import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';

/**
 * Office Forgot-Password Rate Limit Guard
 *
 * IP bazlı basit rate limiting — OFFICE-AUTH-P02 credential-recovery request ucu.
 * LoginRateLimitGuard ve CredentialRecoveryRateLimitGuard'dan (portal) KASITLI OLARAK AYRI
 * bucket — request (forgot) ve consume (reset) endpoint'leri birbirinin limitini tüketmesin diye
 * OfficeResetPasswordRateLimitGuard'dan da ayrı store kullanır.
 * Üretim ortamında Redis-backed store'a taşınmalı; tek instance için yeterli.
 *
 * POST /auth/forgot-password için.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;       // 1 dakika pencere
const MAX_ATTEMPTS = 5;         // Pencere başına maks deneme
const BLOCK_DURATION_MS = 300_000; // 5 dakika blok süresi

const store = new Map<string, RateLimitEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 60_000);

@Injectable()
export class OfficeForgotPasswordRateLimitGuard implements CanActivate {
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
          message: `Çok fazla parola sıfırlama isteği. ${retryAfterSec} saniye sonra tekrar deneyin.`,
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
