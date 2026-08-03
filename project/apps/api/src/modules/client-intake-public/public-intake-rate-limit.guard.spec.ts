import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'crypto';
import { ClientIntakePublicController } from './client-intake-public.controller';
import { resolvePublicIntakeClientIp } from './public-intake-client-ip';
import { PublicIntakeRateLimitGuard } from './public-intake-rate-limit.guard';
import {
  PublicIntakeRateLimitStore,
  resolvePublicIntakeRedisUrl,
} from './public-intake-rate-limit.store';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const RedisMock = jest.requireActual('ioredis-mock') as new () => any;

const contextOf = (request: any, response: any = { setHeader: jest.fn() }) =>
  ({
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  }) as ExecutionContext;

describe('Public intake CIP-1 hardening', () => {
  const envNames = [
    'PUBLIC_INTAKE_TRUSTED_PROXY_IPS',
    'PUBLIC_INTAKE_RATE_LIMIT_WINDOW_MS',
    'PUBLIC_INTAKE_IP_RATE_LIMIT_MAX',
    'PUBLIC_INTAKE_TOKEN_RATE_LIMIT_MAX',
  ] as const;
  const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));

  afterEach(() => {
    for (const name of envNames) {
      const value = originalEnv[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    jest.restoreAllMocks();
  });

  describe('XFF güven sınırı', () => {
    it('doğrudan peer allowlist dışındaysa spoof edilmiş req.ip değerini yok sayar', () => {
      expect(
        resolvePublicIntakeClientIp({
          ip: '203.0.113.50',
          socket: { remoteAddress: '198.51.100.20' },
        }),
      ).toBe('198.51.100.20');
    });

    it('yalnız exact trusted proxy peer için framework-resolved req.ip değerini kabul eder', () => {
      expect(
        resolvePublicIntakeClientIp(
          {
            ip: '203.0.113.50',
            socket: { remoteAddress: '::ffff:10.0.0.5' },
          },
          '10.0.0.5',
        ),
      ).toBe('203.0.113.50');
    });

    it('controller sourceMeta girdisine de güvenli peer IP taşır', async () => {
      const service = { submit: jest.fn().mockResolvedValue({ ok: true }) };
      const controller = new ClientIntakePublicController(service as any);
      const dto = { fields: [] } as any;

      await controller.submit('raw-token', dto, {
        ip: '203.0.113.50',
        socket: { remoteAddress: '198.51.100.20' },
        headers: { 'user-agent': 'ua' },
      } as any);

      expect(service.submit).toHaveBeenCalledWith(
        'raw-token',
        dto,
        '198.51.100.20',
        'ua',
      );
    });
  });

  describe('guard', () => {
    it('store anahtarlarına ham IP/token değil yalnız sha256 taşır', async () => {
      const store = {
        consume: jest.fn().mockResolvedValue({
          allowed: true,
          ipCount: 1,
          tokenCount: 1,
          retryAfterMs: 60_000,
        }),
      };
      const guard = new PublicIntakeRateLimitGuard(store as any);

      await expect(
        guard.canActivate(
          contextOf({
            ip: '203.0.113.50',
            socket: { remoteAddress: '198.51.100.20' },
            params: { token: 'raw-secret-token' },
          }),
        ),
      ).resolves.toBe(true);

      expect(store.consume).toHaveBeenCalledWith({
        ipHash: sha256('198.51.100.20'),
        tokenHash: sha256('raw-secret-token'),
        windowMs: 60_000,
        ipMax: 20,
        tokenMax: 20,
      });
      expect(JSON.stringify(store.consume.mock.calls)).not.toContain('raw-secret-token');
      expect(JSON.stringify(store.consume.mock.calls)).not.toContain('198.51.100.20');
    });

    it('Redis/store arızasında fail-closed 503 döner', async () => {
      const guard = new PublicIntakeRateLimitGuard({
        consume: jest.fn().mockRejectedValue(new Error('redis unavailable')),
      } as any);

      await expect(
        guard.canActivate(
          contextOf({ socket: { remoteAddress: '198.51.100.20' }, params: { token: 't' } }),
        ),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('limit aşımında 429 + Retry-After üretir', async () => {
      const response = { setHeader: jest.fn() };
      const guard = new PublicIntakeRateLimitGuard({
        consume: jest.fn().mockResolvedValue({
          allowed: false,
          ipCount: 21,
          tokenCount: 21,
          retryAfterMs: 12_100,
        }),
      } as any);

      await expect(
        guard.canActivate(
          contextOf(
            { socket: { remoteAddress: '198.51.100.20' }, params: { token: 't' } },
            response,
          ),
        ),
      ).rejects.toMatchObject({ status: 429 });
      expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '13');
    });
  });

  describe('Redis multi-instance store', () => {
    it('iki API instance aynı token penceresini atomik paylaşır; 21. toplam istek reddedilir', async () => {
      const redis = new RedisMock();
      const storeA = new PublicIntakeRateLimitStore(redis as any);
      const storeB = new PublicIntakeRateLimitStore(redis as any);
      const tokenHash = sha256('same-token');

      const results = await Promise.all(
        Array.from({ length: 25 }, (_, index) =>
          (index % 2 === 0 ? storeA : storeB).consume({
            ipHash: sha256(`peer-${index}`),
            tokenHash,
            windowMs: 60_000,
            ipMax: 100,
            tokenMax: 20,
          }),
        ),
      );

      expect(results.filter((result) => result.allowed)).toHaveLength(20);
      expect(Math.max(...results.map((result) => result.tokenCount))).toBe(25);
      const keys = await redis.keys('*');
      expect(keys).toHaveLength(26); // 25 IP hash + 1 ortak token hash
      expect(keys.join('|')).not.toContain('same-token');
      expect(keys.join('|')).not.toContain('peer-');
      redis.disconnect();
    });

    it('deployment-aware Redis URL seçimi explicit env > verified compose fallback sırasındadır', () => {
      expect(
        resolvePublicIntakeRedisUrl({
          NODE_ENV: 'production',
          PUBLIC_INTAKE_REDIS_URL: 'rediss://cache.example.test:6380',
          REDIS_URL: 'redis://ignored:6379',
        }),
      ).toBe('rediss://cache.example.test:6380');
      expect(resolvePublicIntakeRedisUrl({ NODE_ENV: 'production' })).toBe('redis://redis:6379');
      expect(resolvePublicIntakeRedisUrl({ NODE_ENV: 'development' })).toBe(
        'redis://127.0.0.1:6379',
      );
    });
  });
});
