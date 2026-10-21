/**
 * OK-02 (owner kararı Ek 108, 22.10.2026) — anonim büro kaydı ucu varsayılan KAPALI.
 *
 * GERÇEK `AuthController` + GERÇEK `AuthService` + GERÇEK `PublicRegistrationEnabledGuard`,
 * üretimdeki global ValidationPipe ve `api` öneki ile gerçek bir Nest HTTP adaptöründe;
 * yalnız `PrismaService` / `JwtService` sahtelenir. Kapalıyken her Prisma çağrısı sayılır ve
 * SIFIR olmalıdır (ret veri erişiminden ve gövde doğrulamasından ÖNCE). Bayrak açıkken bugünkü
 * davranış (201 + kiracı / ADMIN yaratma işlemi) değişmez.
 *
 * Gerçek Postgres karşılığı: auth-register-closed.http.db-gated.integration.spec.ts.
 * Tüm değerler SENTETİKTİR.
 */
import { ForbiddenException, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { PrismaService } from '@/prisma/prisma.service';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { LoginRateLimitGuard } from '../guards/login-rate-limit.guard';
import {
  OFFICE_PUBLIC_REGISTRATION_FLAG,
  PublicRegistrationEnabledGuard,
  isOfficePublicRegistrationEnabled,
} from '../guards/public-registration-enabled.guard';
import { PasswordResetService } from '../password-reset/password-reset.service';
import { seedLookupCatalog } from '../../lookup/lookup-seed';

// Lookup tohumu ayrı ölçülür (auth-register-seed.spec.ts / .integration.spec.ts); burada yalnız
// kapı + kiracı / ADMIN yaratma zinciri ölçülür.
jest.mock('../../lookup/lookup-seed');

const VALID_BODY = {
  firmName: 'OK02 SENTETIK BURO',
  name: 'AD',
  surname: 'SOYAD',
  email: 'ok02@invalid.example',
  password: 'sentetik-parola-1',
};

describe('OK-02 — POST /api/auth/register varsayılan KAPALI (gerçek HTTP)', () => {
  let app: INestApplication;
  let flag: string | undefined;
  const prismaCalls: string[] = [];
  const tx = {
    tenant: { create: jest.fn() },
    user: { create: jest.fn() },
  };

  // Her model / yöntem erişimini kaydeden sahte Prisma: kapalı durumda hiçbir erişim olmamalı.
  const prisma = new Proxy(
    {},
    {
      get: (_t, model: string | symbol) => {
        if (typeof model !== 'string' || model === 'then') return undefined;
        if (model === '$transaction') {
          return async (fn: (t: unknown) => Promise<unknown>) => {
            prismaCalls.push('$transaction');
            return fn(tx);
          };
        }
        return new Proxy(
          {},
          {
            get: (_m, method: string | symbol) => {
              if (typeof method !== 'string' || method === 'then') return undefined;
              return async () => {
                prismaCalls.push(`${model}.${method}`);
                return null;
              };
            },
          },
        );
      },
    },
  );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('SENTETIK.JWT') } },
        { provide: PasswordResetService, useValue: { isPasswordRecoveryEnabled: () => false } },
        { provide: ConfigService, useValue: { get: (k: string) => (k === OFFICE_PUBLIC_REGISTRATION_FLAG ? flag : undefined) } },
      ],
    })
      .overrideGuard(LoginRateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prismaCalls.length = 0;
    tx.tenant.create.mockReset();
    tx.user.create.mockReset();
    (seedLookupCatalog as jest.Mock).mockReset();
  });

  it('bayrak TANIMSIZ (varsayılan) → 403; hiçbir Prisma çağrısı yok', async () => {
    flag = undefined;
    const res = await request(app.getHttpServer()).post('/api/auth/register').send(VALID_BODY).expect(403);
    expect(prismaCalls).toEqual([]);
    expect(tx.tenant.create).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain('token');
  });

  it.each(['', 'false', '0', '1', 'yes', 'on', ' true', 'true '])(
    'bayrak "%s" → 403 (yalnız tam "true" açık sayılır); Prisma çağrısı yok',
    async (value) => {
      flag = value;
      await request(app.getHttpServer()).post('/api/auth/register').send(VALID_BODY).expect(403);
      expect(prismaCalls).toEqual([]);
    },
  );

  it('kapalıyken boş / geçersiz gövde de 403 (kapı gövde doğrulamasından ÖNCE çalışır)', async () => {
    flag = undefined;
    await request(app.getHttpServer()).post('/api/auth/register').send({}).expect(403);
    await request(app.getHttpServer()).post('/api/auth/register').send({ beklenmeyen: 'alan' }).expect(403);
    expect(prismaCalls).toEqual([]);
  });

  it.each(['true', 'TRUE', 'True'])('bayrak "%s" → mevcut davranış: 201 + kiracı ve ADMIN yaratma işlemi', async (value) => {
    flag = value;
    tx.tenant.create.mockResolvedValue({ id: 't-ok02', name: VALID_BODY.firmName, slug: 'ok02-sentetik-buro' });
    tx.user.create.mockResolvedValue({
      id: 'u-ok02', tenantId: 't-ok02', email: VALID_BODY.email, name: 'AD', surname: 'SOYAD',
      role: 'ADMIN', isActive: true, passwordHash: 'x',
    });
    const res = await request(app.getHttpServer()).post('/api/auth/register').send(VALID_BODY).expect(201);
    expect(Object.keys(res.body).sort()).toEqual(['tenant', 'token', 'user']);
    expect(prismaCalls).toEqual(['tenant.findUnique', '$transaction']);
    expect(tx.tenant.create).toHaveBeenCalledTimes(1);
    expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: 'ADMIN' }) }));
    expect(seedLookupCatalog).toHaveBeenCalledWith(tx, 't-ok02');
  });

  it('kapı yalnız register ucundadır: kapalıyken login ucu etkilenmez (403 DEĞİL)', async () => {
    flag = undefined;
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: VALID_BODY.email, password: VALID_BODY.password, tenantSlug: 'yok' });
    expect(res.status).toBe(401);
  });

  it('isOfficePublicRegistrationEnabled: yalnız harf duyarsız tam "true"', () => {
    const cfg = (v: unknown) => ({ get: () => v });
    expect(isOfficePublicRegistrationEnabled(cfg(undefined))).toBe(false);
    expect(isOfficePublicRegistrationEnabled(cfg(null))).toBe(false);
    expect(isOfficePublicRegistrationEnabled(cfg(''))).toBe(false);
    expect(isOfficePublicRegistrationEnabled(cfg('false'))).toBe(false);
    expect(isOfficePublicRegistrationEnabled(cfg(true))).toBe(true);
    expect(isOfficePublicRegistrationEnabled(cfg('true'))).toBe(true);
    expect(isOfficePublicRegistrationEnabled(cfg('TRUE'))).toBe(true);
    expect(OFFICE_PUBLIC_REGISTRATION_FLAG).toBe('OFFICE_PUBLIC_REGISTRATION_ENABLED');
    const closed = new PublicRegistrationEnabledGuard({ get: () => undefined } as never);
    expect(() => closed.canActivate()).toThrow(ForbiddenException);
    expect(new PublicRegistrationEnabledGuard({ get: () => 'true' } as never).canActivate()).toBe(true);
  });
});
