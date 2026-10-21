import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';

import { PrismaService } from '@/prisma/prisma.service';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { LoginRateLimitGuard } from '../guards/login-rate-limit.guard';
import { OFFICE_PUBLIC_REGISTRATION_FLAG } from '../guards/public-registration-enabled.guard';
import { PasswordResetService } from '../password-reset/password-reset.service';

/**
 * OK-02 (owner kararı Ek 108, 22.10.2026) — anonim büro kaydı ucu varsayılan KAPALI.
 * GERÇEK HTTP + GERÇEK ConfigService (process.env) + GERÇEK AuthService + tek kullanımlık PostgreSQL.
 *
 * - Bayrak tanımsız / "false" → 403; kiracı ve kullanıcı tablolarında satır OLUŞMAZ (toplam sayılar sabit).
 * - Bayrak "true" → mevcut davranış: 201, yeni kiracı + ADMIN kullanıcı + kanonik lookup kataloğu.
 *
 * Kapı: TEST_DATABASE_URL yoksa SKIP; CI'da DB yoksa yüksek sesle düşer (sessiz yeşil yok).
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('OK-02 REGISTER-CLOSED DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb('OK-02 — POST /api/auth/register varsayılan KAPALI (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(120_000);

  let app: INestApplication;
  let prisma: PrismaService;
  const savedFlag = process.env[OFFICE_PUBLIC_REGISTRATION_FLAG];
  const suffix = randomUUID().slice(0, 8);
  const createdTenantIds: string[] = [];

  const body = (tag: string) => ({
    firmName: `OK02 Sentetik ${tag} ${suffix}`,
    name: 'Sentetik',
    surname: 'Yonetici',
    email: `ok02-${tag}-${suffix}@example.test`,
    password: 'sentetik-parola-1',
  });

  async function totals() {
    const [tenants, users] = await Promise.all([prisma.tenant.count(), prisma.user.count()]);
    return { tenants, users };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        JwtModule.register({ secret: 'ok02-db-gated-test-secret-at-least-32-bytes' }),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        PrismaService,
        { provide: PasswordResetService, useValue: { isPasswordRecoveryEnabled: () => false } },
      ],
    })
      .overrideGuard(LoginRateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterEach(() => {
    if (savedFlag === undefined) delete process.env[OFFICE_PUBLIC_REGISTRATION_FLAG];
    else process.env[OFFICE_PUBLIC_REGISTRATION_FLAG] = savedFlag;
  });

  afterAll(async () => {
    // Kapalı durum testi kırılırsa (ör. kapı kaldırılırsa) yaratılan satırlar da temizlenir.
    const leaked = await prisma.tenant.findMany({
      where: { name: { startsWith: 'OK02 Sentetik', endsWith: suffix } },
      select: { id: true },
    });
    for (const { id } of leaked) if (!createdTenantIds.includes(id)) createdTenantIds.push(id);
    for (const tid of createdTenantIds) {
      await prisma.lookupTakipTuru.deleteMany({ where: { tenantId: tid } });
      await prisma.lookupMahiyetTipi.deleteMany({ where: { tenantId: tid } });
      await prisma.lookupAsama.deleteMany({ where: { tenantId: tid } });
      await prisma.lookupRisk.deleteMany({ where: { tenantId: tid } });
      await prisma.lookupDurumEtiketi.deleteMany({ where: { tenantId: tid } });
      await prisma.user.deleteMany({ where: { tenantId: tid } });
      await prisma.tenant.deleteMany({ where: { id: tid } });
    }
    await app.close();
  });

  it.each([
    ['tanımsız (varsayılan)', undefined],
    ['"false"', 'false'],
  ])('bayrak %s → 403; kiracı / kullanıcı satırı OLUŞMAZ', async (_label, value) => {
    if (value === undefined) delete process.env[OFFICE_PUBLIC_REGISTRATION_FLAG];
    else process.env[OFFICE_PUBLIC_REGISTRATION_FLAG] = value;

    const dto = body(`kapali-${value ?? 'yok'}`);
    const before = await totals();
    const res = await request(app.getHttpServer()).post('/api/auth/register').send(dto).expect(403);

    expect(JSON.stringify(res.body)).not.toContain('token');
    expect(await totals()).toEqual(before);
    expect(await prisma.tenant.count({ where: { name: dto.firmName } })).toBe(0);
    expect(await prisma.user.count({ where: { email: dto.email } })).toBe(0);
  });

  it('bayrak "true" → mevcut davranış: 201, yeni kiracı + ADMIN + kanonik lookup', async () => {
    process.env[OFFICE_PUBLIC_REGISTRATION_FLAG] = 'true';
    const dto = body('acik');
    const before = await totals();

    const res = await request(app.getHttpServer()).post('/api/auth/register').send(dto).expect(201);
    const tenantId = res.body.tenant.id as string;
    createdTenantIds.push(tenantId);

    expect(await totals()).toEqual({ tenants: before.tenants + 1, users: before.users + 1 });
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    expect(tenant.name).toBe(dto.firmName);
    const users = await prisma.user.findMany({ where: { tenantId } });
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: dto.email, role: 'ADMIN' });
    expect(await prisma.lookupTakipTuru.count({ where: { tenantId, isActive: true } })).toBe(11);
  });
});
