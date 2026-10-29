/**
 * K-A1 a′ (owner kararı 2026-10-29/30; OFP-07 / J-37) — kayıt yolu ilk hesabı KİŞİ KARTINA bağlı yaratır.
 *
 * ÖLÇÜLEN KUSUR (F02A-RUN1): `POST /auth/register` ilk ADMIN'i kartsız yaratıyordu → kişi kimliği kanıtı yoktu; aynı kişinin
 * kartlı ikinci hesabı öz-onay yasağını aşabiliyordu (kartsız hesabın kimlik aday kümesi BOŞ).
 *
 * Kabul (owner a′): "avukat / avukat değil" seçimi + geçerli TCKN ZORUNLU; avukat ise Lawyer, değilse StaffMember kartı AYNI
 * transaction'da, kullanıcıya bağlı (userId) açılır. Avukat olmayana avukat kartı AÇILMAZ. ADMIN rolü kanıt DEĞİLDİR.
 * Yeni rol / rütbe YOK (Lawyer rütbesi şema varsayılanı). Geçersiz girdi → 400, hiçbir Prisma çağrısı YOK (fail-closed, sorgu
 * öncesi). Yanıt zarfı { token, user, tenant } DEĞİŞMEZ.
 *
 * Gerçek AuthController + AuthService + PublicRegistrationEnabledGuard (bayrak AÇIK) + üretim ValidationPipe; PrismaService /
 * JwtService sahte. Gerçek Postgres karşılığı: auth-register-closed.http.db-gated (STAFF yolu). Tüm değerler SENTETİKTİR.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { PrismaService } from '@/prisma/prisma.service';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { LoginRateLimitGuard } from '../guards/login-rate-limit.guard';
import { OFFICE_PUBLIC_REGISTRATION_FLAG } from '../guards/public-registration-enabled.guard';
import { PasswordResetService } from '../password-reset/password-reset.service';
import { seedLookupCatalog } from '../../lookup/lookup-seed';

jest.mock('../../lookup/lookup-seed');

const BASE = {
  firmName: 'K-A1 SENTETIK BURO',
  name: 'AD',
  surname: 'SOYAD',
  email: 'ka1@invalid.example',
  password: 'sentetik-parola-1',
};
const VALID_TCKN = '10000000146'; // sentetik, mod-10/11 geçerli
const INVALID_TCKN = '11111111111'; // 11 hane ama checksum geçersiz

describe('K-A1 a′ — POST /api/auth/register kişi kartıyla doğar (gerçek HTTP, bayrak AÇIK)', () => {
  let app: INestApplication;
  const prismaCalls: string[] = [];
  const tx = {
    tenant: { create: jest.fn() },
    user: { create: jest.fn() },
    lawyer: { create: jest.fn().mockResolvedValue({ id: 'l-ka1' }) },
    staffMember: { create: jest.fn().mockResolvedValue({ id: 's-ka1' }) },
  };
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
        { provide: ConfigService, useValue: { get: (k: string) => (k === OFFICE_PUBLIC_REGISTRATION_FLAG ? 'true' : undefined) } },
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

  afterAll(async () => { await app.close(); });

  beforeEach(() => {
    prismaCalls.length = 0;
    tx.tenant.create.mockReset().mockResolvedValue({ id: 't-ka1', name: BASE.firmName, slug: 'k-a1-sentetik-buro' });
    tx.user.create.mockReset().mockResolvedValue({
      id: 'u-ka1', tenantId: 't-ka1', email: BASE.email, name: 'AD', surname: 'SOYAD', role: 'ADMIN', isActive: true, passwordHash: 'x',
    });
    tx.lawyer.create.mockClear();
    tx.staffMember.create.mockClear();
    (seedLookupCatalog as jest.Mock).mockReset();
  });

  const post = (body: Record<string, unknown>) => request(app.getHttpServer()).post('/api/auth/register').send(body);

  it('LAWYER + geçerli TCKN → 201; Lawyer kartı AYNI tx\'te, userId + tckn ile; personel kartı AÇILMAZ; zarf değişmez', async () => {
    const res = await post({ ...BASE, personType: 'LAWYER', tckn: VALID_TCKN }).expect(201);
    expect(Object.keys(res.body).sort()).toEqual(['tenant', 'token', 'user']);
    expect(prismaCalls).toEqual(['tenant.findUnique', '$transaction']);
    expect(tx.lawyer.create).toHaveBeenCalledTimes(1);
    expect(tx.lawyer.create.mock.calls[0][0].data).toMatchObject({ tenantId: 't-ka1', userId: 'u-ka1', tckn: VALID_TCKN, name: 'AD', surname: 'SOYAD' });
    expect(tx.lawyer.create.mock.calls[0][0].data).not.toHaveProperty('lawyerRank'); // rütbe şema varsayılanı; yükseltme YOK
    expect(tx.staffMember.create).not.toHaveBeenCalled();
    // sıra: kart, kullanıcıdan SONRA ve lookup tohumundan ÖNCE (aynı transaction)
    expect(tx.user.create.mock.invocationCallOrder[0]).toBeLessThan(tx.lawyer.create.mock.invocationCallOrder[0]);
    expect(tx.lawyer.create.mock.invocationCallOrder[0]).toBeLessThan((seedLookupCatalog as jest.Mock).mock.invocationCallOrder[0]);
    expect(JSON.stringify(res.body)).not.toContain(VALID_TCKN); // TCKN yanıtta sızmaz
  });

  it('STAFF + staffType + geçerli TCKN → 201; StaffMember kartı userId + tckn + staffType ile; AVUKAT KARTI AÇILMAZ', async () => {
    const res = await post({ ...BASE, personType: 'STAFF', staffType: 'SEKRETER', tckn: '20000000046' }).expect(201);
    expect(Object.keys(res.body).sort()).toEqual(['tenant', 'token', 'user']);
    expect(tx.staffMember.create).toHaveBeenCalledTimes(1);
    expect(tx.staffMember.create.mock.calls[0][0].data).toMatchObject({ tenantId: 't-ka1', userId: 'u-ka1', tckn: '20000000046', staffType: 'SEKRETER', firstName: 'AD', lastName: 'SOYAD' });
    expect(tx.lawyer.create).not.toHaveBeenCalled();
  });

  it.each([
    ['personType yok', { ...BASE, tckn: VALID_TCKN }],
    ['personType geçersiz', { ...BASE, personType: 'ADMIN', tckn: VALID_TCKN }],
    ['tckn yok', { ...BASE, personType: 'LAWYER' }],
    ['tckn 11 hane değil', { ...BASE, personType: 'LAWYER', tckn: '1234' }],
    ['STAFF ama staffType yok', { ...BASE, personType: 'STAFF', tckn: VALID_TCKN }],
    ['STAFF staffType geçersiz', { ...BASE, personType: 'STAFF', staffType: 'YOK', tckn: VALID_TCKN }],
    ['LAWYER ile beklenmeyen alan', { ...BASE, personType: 'LAWYER', tckn: VALID_TCKN, lawyerRank: 'PARTNER' }],
  ])('%s → 400 (DTO); hiçbir Prisma çağrısı YOK', async (_n, body) => {
    await post(body as Record<string, unknown>).expect(400);
    expect(prismaCalls).toEqual([]);
    expect(tx.tenant.create).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('geçersiz checksum TCKN → 400 REGISTER_PERSON_TCKN_INVALID; sorgu/yazma öncesi (Prisma çağrısı YOK)', async () => {
    const res = await post({ ...BASE, personType: 'LAWYER', tckn: INVALID_TCKN }).expect(400);
    expect(res.body.reasonCode).toBe('REGISTER_PERSON_TCKN_INVALID');
    expect(prismaCalls).toEqual([]);
    expect(tx.lawyer.create).not.toHaveBeenCalled();
  });

  it('kart yazımı başarısız olursa kayıt REDDEDİLİR (token yok) — transaction geri alınır, kartsız ADMIN kalmaz', async () => {
    tx.lawyer.create.mockRejectedValueOnce(new Error('kart yazılamadı'));
    const res = await post({ ...BASE, personType: 'LAWYER', tckn: VALID_TCKN });
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(JSON.stringify(res.body)).not.toContain('token');
    expect(seedLookupCatalog).not.toHaveBeenCalled(); // kart adımında durdu
  });
});
