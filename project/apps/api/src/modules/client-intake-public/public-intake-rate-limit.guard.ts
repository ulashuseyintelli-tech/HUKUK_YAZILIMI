import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { resolvePublicIntakeClientIp } from './public-intake-client-ip';
import { PublicIntakeRateLimitStore } from './public-intake-rate-limit.store';

/**
 * X3-B03 — Redis-backed multi-instance public intake limiter.
 * IP + tokenHash sabit pencereleri aynı Lua komutunda atomik tüketilir. Ham IP/token
 * store'a yazılmaz; Redis arızası fail-open değildir.
 */
@Injectable()
export class PublicIntakeRateLimitGuard implements CanActivate {
  constructor(private readonly store: PublicIntakeRateLimitStore) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const ip = resolvePublicIntakeClientIp(req);
    const token = String(req.params?.token ?? '');

    let result;
    try {
      result = await this.store.consume({
        ipHash: createHash('sha256').update(ip).digest('hex'),
        tokenHash: createHash('sha256').update(token).digest('hex'),
        windowMs: this.positiveEnv('PUBLIC_INTAKE_RATE_LIMIT_WINDOW_MS', 60_000),
        ipMax: this.positiveEnv('PUBLIC_INTAKE_IP_RATE_LIMIT_MAX', 20),
        tokenMax: this.positiveEnv('PUBLIC_INTAKE_TOKEN_RATE_LIMIT_MAX', 20),
      });
    } catch {
      throw new ServiceUnavailableException('Form geçici olarak kullanılamıyor.');
    }

    if (!result.allowed) {
      if (res?.setHeader) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil(result.retryAfterMs / 1_000))));
      }
      throw new HttpException('Çok fazla istek. Lütfen sonra tekrar deneyin.', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }

  private positiveEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw == null || raw.trim() === '') return fallback;
    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error(`Invalid ${name}`);
    }
    return parsed;
  }
}
