import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

export const PUBLIC_INTAKE_REDIS_CLIENT = Symbol('PUBLIC_INTAKE_REDIS_CLIENT');

const KEY_PREFIX = 'hukuk:client-intake:rate-limit:v1';
const HASH_KEY = /^[a-f0-9]{64}$/;

const CONSUME_SCRIPT = `
local function hit(key, windowMs)
  local count = redis.call('INCR', key)
  if count == 1 then
    redis.call('PEXPIRE', key, windowMs)
  end
  return count, redis.call('PTTL', key)
end

local ipCount, ipTtl = hit(KEYS[1], ARGV[1])
local tokenCount, tokenTtl = hit(KEYS[2], ARGV[1])
local allowed = 0
if ipCount <= tonumber(ARGV[2]) and tokenCount <= tonumber(ARGV[3]) then
  allowed = 1
end
return { allowed, ipCount, tokenCount, math.max(ipTtl, tokenTtl) }
`;

export interface PublicIntakeRateLimitResult {
  allowed: boolean;
  ipCount: number;
  tokenCount: number;
  retryAfterMs: number;
}

export interface PublicIntakeRateLimitInput {
  ipHash: string;
  tokenHash: string;
  windowMs: number;
  ipMax: number;
  tokenMax: number;
}

/**
 * Repo topolojisi: staging REDIS_URL verir; production compose aynı ağdaki `redis`
 * servisini zorunlu dependency yapar; local compose Redis'i localhost:6379'da yayımlar.
 */
export function resolvePublicIntakeRedisUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.PUBLIC_INTAKE_REDIS_URL || env.REDIS_URL;
  const url = explicit || (env.NODE_ENV === 'production' ? 'redis://redis:6379' : 'redis://127.0.0.1:6379');
  if (!/^rediss?:\/\//.test(url)) {
    throw new Error('PUBLIC_INTAKE_REDIS_URL must use redis:// or rediss://');
  }
  return url;
}

export function createPublicIntakeRedisClient(): Redis {
  const client = new Redis(resolvePublicIntakeRedisUrl(), {
    lazyConnect: true,
    connectTimeout: 1_000,
    maxRetriesPerRequest: 1,
    retryStrategy: (attempt) => Math.min(attempt * 100, 1_000),
  });
  // Komut hatası guard tarafından fail-closed HTTP sonucuna çevrilir; EventEmitter
  // `error` event'inin process'i düşürmesi engellenir, credential/URL loglanmaz.
  client.on('error', () => undefined);
  return client;
}

/** Redis Lua ile IP + token penceresini tek atomik adımda tüketir. */
@Injectable()
export class PublicIntakeRateLimitStore implements OnModuleDestroy {
  constructor(@Inject(PUBLIC_INTAKE_REDIS_CLIENT) private readonly redis: Redis) {}

  async consume(input: PublicIntakeRateLimitInput): Promise<PublicIntakeRateLimitResult> {
    this.assertInput(input);
    const raw = (await this.redis.eval(
      CONSUME_SCRIPT,
      2,
      `${KEY_PREFIX}:ip:${input.ipHash}`,
      `${KEY_PREFIX}:token:${input.tokenHash}`,
      input.windowMs,
      input.ipMax,
      input.tokenMax,
    )) as unknown;

    if (!Array.isArray(raw) || raw.length !== 4) {
      throw new Error('PUBLIC_INTAKE_RATE_LIMIT_INVALID_REDIS_RESULT');
    }
    const [allowed, ipCount, tokenCount, retryAfterMs] = raw.map(Number);
    if (![allowed, ipCount, tokenCount, retryAfterMs].every(Number.isFinite)) {
      throw new Error('PUBLIC_INTAKE_RATE_LIMIT_INVALID_REDIS_RESULT');
    }
    return {
      allowed: allowed === 1,
      ipCount,
      tokenCount,
      retryAfterMs: Math.max(0, retryAfterMs),
    };
  }

  onModuleDestroy(): void {
    this.redis.disconnect(false);
  }

  private assertInput(input: PublicIntakeRateLimitInput): void {
    if (!HASH_KEY.test(input.ipHash) || !HASH_KEY.test(input.tokenHash)) {
      throw new Error('PUBLIC_INTAKE_RATE_LIMIT_KEY_MUST_BE_SHA256');
    }
    for (const value of [input.windowMs, input.ipMax, input.tokenMax]) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error('PUBLIC_INTAKE_RATE_LIMIT_CONFIG_INVALID');
      }
    }
  }
}
