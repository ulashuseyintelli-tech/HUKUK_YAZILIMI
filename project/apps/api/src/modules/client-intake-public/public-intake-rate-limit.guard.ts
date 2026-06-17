import { CanActivate, ExecutionContext, Injectable, HttpException, HttpStatus } from '@nestjs/common';

/**
 * Minimal in-memory rate-limit (Faz 4.4) — public intake uçları için.
 * IP bazlı sabit pencere. @nestjs/throttler kurulu olmadığından custom.
 *
 * OPS NOTU: in-memory + tek-instance. Çok-instance/prod için Redis tabanlı
 * limiter'a taşınmalı. Brute-force/enumerasyon savunmasının İLK katmanı;
 * asıl güvenlik tokenHash entropisi + atomik limit'tir.
 */
@Injectable()
export class PublicIntakeRateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  private readonly windowMs = 60_000;
  private readonly max = 20; // 60sn'de IP başına 20 istek

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const ip: string = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();

    const entry = this.hits.get(ip);
    if (!entry || now >= entry.resetAt) {
      this.hits.set(ip, { count: 1, resetAt: now + this.windowMs });
      this.prune(now);
      return true;
    }
    entry.count += 1;
    if (entry.count > this.max) {
      throw new HttpException('Çok fazla istek. Lütfen sonra tekrar deneyin.', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }

  private prune(now: number): void {
    if (this.hits.size < 5000) return;
    for (const [k, v] of this.hits) if (now >= v.resetAt) this.hits.delete(k);
  }
}
