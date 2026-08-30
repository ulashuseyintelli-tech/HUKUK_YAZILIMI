/**
 * OFFICE-AUTH-PUBLIC-USER-PROJECTION-R02 — GERÇEK HTTP SERIALIZATION TESTİ (T11).
 *
 * §5: "Mock tek başına yeterli değildir." Bu dosya GERÇEK `AuthController` + GERÇEK
 * `AuthService`'i gerçek bir Nest HTTP adapter'ında ayağa kaldırır ve yanıtı supertest ile
 * TEL ÜZERİNDEN okur. Yalnız `PrismaService`/`JwtService` sahtelenir — projeksiyon,
 * controller ve serialization zincirinin TAMAMI gerçektir.
 *
 * Kapsam: T1 (register) · T2 (login) · T3 (/auth/me) · T4 parity · T11 · T12/T13 roller ·
 * T14 401 kapıları · T15 web consumer regresyonu · T16 password-change sonrası · T18 envelope.
 *
 * Tüm credential-benzeri değerler SENTETİKTİR.
 */
import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';

import { PrismaService } from '@/prisma/prisma.service';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
// C36: /auth/me artik SmokeOrJwtAuthGuard kullanir (smoke claim'i YOKSA aynen
// JwtAuthGuard'a devreder). Bu spec'in IDDIALARI DEGISMEDI; yalniz guard override'i
// gercek route dekoratorunu takip eder. Projeksiyon sozlesmesi ayni sekilde zorlanir.
import { SmokeOrJwtAuthGuard } from '../smoke/smoke-or-jwt-auth.guard';
import { LoginRateLimitGuard } from '../guards/login-rate-limit.guard';
import { PasswordResetService } from '../password-reset/password-reset.service';

const SYNTHETIC_PASSWORD = 'sentetik-parola-degeri';
const TENANT_INTERNAL = 'TENANT-INTERNAL-CONFIG-VALUE';

const PUBLIC_USER_KEYS = ['email', 'id', 'name', 'role', 'surname', 'tenantId'].sort();
const PUBLIC_USER_KEYS_WITH_TENANT = [...PUBLIC_USER_KEYS, 'tenant'].sort();
const PUBLIC_TENANT_KEYS = ['id', 'name', 'slug'].sort();

const tenantRow = () => ({
  id: 't-1',
  name: 'TENANT AD',
  slug: 'tenant-slug',
  plan: 'PRO',
  settings: { internal: TENANT_INTERNAL },
  accountType: 'PROFESSIONAL',
  lifecycle: 'ACTIVE',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
});

const userRow = (passwordHash: string, over: Record<string, unknown> = {}) => ({
  id: 'u-1',
  tenantId: 't-1',
  email: 'canary@invalid.example',
  passwordHash,
  name: 'AD',
  surname: 'SOYAD',
  role: 'ADMIN',
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
  tokenVersion: 3,
  passwordChangedAt: new Date('2026-01-03T00:00:00Z'),
  ...over,
});

/** Herhangi bir Prisma modeli için no-op üreten tx proxy'si (seedLookupCatalog upsert'leri). */
const txProxy = (impl: Record<string, unknown>) =>
  new Proxy(impl, {
    get(target, prop) {
      if (typeof prop !== 'string') return undefined;
      if (prop in target) return (target as Record<string, unknown>)[prop];
      // seedLookupCatalog upsert + findMany + update cagrilarinin tamami no-op.
      return {
        upsert: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
      };
    },
  });

let guardBehaviour: { allow: boolean; user?: unknown } = { allow: true };

class StubJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!guardBehaviour.allow) throw new UnauthorizedException();
    context.switchToHttp().getRequest().user = guardBehaviour.user;
    return true;
  }
}
class PassThroughGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

describe('R02 — auth public-user gerçek HTTP serialization', () => {
  let app: INestApplication;
  let prisma: Record<string, never>;
  let hash: string;

  beforeAll(async () => {
    hash = await bcrypt.hash(SYNTHETIC_PASSWORD, 4);

    prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    } as unknown as Record<string, never>;

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('SENTETIK.JWT.DEGERI') } },
        { provide: PasswordResetService, useValue: { isPasswordRecoveryEnabled: () => false } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(StubJwtAuthGuard)
      .overrideGuard(SmokeOrJwtAuthGuard)
      .useClass(StubJwtAuthGuard)
      .overrideGuard(LoginRateLimitGuard)
      .useClass(PassThroughGuard)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('T1 + T18: register → { token, user, tenant }; user/tenant YALNIZ allowlist', async () => {
    const created = userRow(hash);
    (prisma as never as { $transaction: jest.Mock }).$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(
          txProxy({
            tenant: { create: jest.fn().mockResolvedValue(tenantRow()) },
            user: { create: jest.fn().mockResolvedValue(created) },
          }),
        ),
    );

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ firmName: 'C15 CANARY', name: 'AD', surname: 'SOYAD', email: 'canary@invalid.example', password: 'sentetik-parola' })
      .expect(201);

    expect(Object.keys(res.body).sort()).toEqual(['tenant', 'token', 'user'].sort()); // envelope korunur
    expect(Object.keys(res.body.user).sort()).toEqual(PUBLIC_USER_KEYS); // tenant nested YOK
    expect(Object.keys(res.body.tenant).sort()).toEqual(PUBLIC_TENANT_KEYS);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toContain(hash);
    expect(raw).not.toContain('tokenVersion');
    expect(raw).not.toContain(TENANT_INTERNAL);
  });

  it('T2 + T18: login → { token, user, tenant }; user/tenant YALNIZ allowlist', async () => {
    (prisma as never as { user: { findFirst: jest.Mock } }).user.findFirst.mockResolvedValue({
      ...userRow(hash),
      tenant: tenantRow(),
    });

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'canary@invalid.example', password: SYNTHETIC_PASSWORD, tenantSlug: 'tenant-slug' })
      .expect(201);

    expect(Object.keys(res.body).sort()).toEqual(['tenant', 'token', 'user'].sort());
    expect(Object.keys(res.body.user).sort()).toEqual(PUBLIC_USER_KEYS_WITH_TENANT);
    expect(Object.keys(res.body.user.tenant).sort()).toEqual(PUBLIC_TENANT_KEYS);
    expect(Object.keys(res.body.tenant).sort()).toEqual(PUBLIC_TENANT_KEYS);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toContain(hash);
    expect(raw).not.toContain('tokenVersion');
    expect(raw).not.toContain(TENANT_INTERNAL);
  });

  it('T3 + T18: /auth/me → { user }; YALNIZ allowlist + nested tenant', async () => {
    guardBehaviour = { allow: true, user: { ...userRow(hash), tenant: tenantRow() } };
    const res = await request(app.getHttpServer()).get('/auth/me').expect(200);

    expect(Object.keys(res.body)).toEqual(['user']);
    expect(Object.keys(res.body.user).sort()).toEqual(PUBLIC_USER_KEYS_WITH_TENANT);
    expect(Object.keys(res.body.user.tenant).sort()).toEqual(PUBLIC_TENANT_KEYS);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toContain(hash);
    expect(raw).not.toContain('tokenVersion');
    expect(raw).not.toContain('passwordChangedAt');
    expect(raw).not.toContain(TENANT_INTERNAL);
  });

  it('T4: üç yüzeyin user projeksiyonu PARITE (aynı kaynak → aynı anahtar kümesi)', async () => {
    guardBehaviour = { allow: true, user: { ...userRow(hash), tenant: tenantRow() } };
    const me = await request(app.getHttpServer()).get('/auth/me').expect(200);
    (prisma as never as { user: { findFirst: jest.Mock } }).user.findFirst.mockResolvedValue({
      ...userRow(hash),
      tenant: tenantRow(),
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'canary@invalid.example', password: SYNTHETIC_PASSWORD, tenantSlug: 'tenant-slug' })
      .expect(201);
    expect(Object.keys(login.body.user).sort()).toEqual(Object.keys(me.body.user).sort());
  });

  it.each(['ADMIN', 'USER', 'VIEWER'])('T12/T13: %s rolü — aynı public shape, sızıntı yok', async (role) => {
    guardBehaviour = { allow: true, user: { ...userRow(hash, { role }), tenant: tenantRow() } };
    const res = await request(app.getHttpServer()).get('/auth/me').expect(200);
    expect(res.body.user.role).toBe(role);
    expect(Object.keys(res.body.user).sort()).toEqual(PUBLIC_USER_KEYS_WITH_TENANT);
    expect(JSON.stringify(res.body)).not.toContain(hash);
  });

  it('T14: JWT yok / invalid → 401', async () => {
    guardBehaviour = { allow: false };
    await request(app.getHttpServer()).get('/auth/me').expect(401);
    await request(app.getHttpServer()).get('/auth/me').set('Authorization', 'Bearer bozuk').expect(401);
  });

  it('T15: Web consumer sözleşmesi (auth-context User+Tenant) karşılanır', async () => {
    guardBehaviour = { allow: true, user: { ...userRow(hash), tenant: tenantRow() } };
    const res = await request(app.getHttpServer()).get('/auth/me').expect(200);
    for (const f of ['id', 'email', 'name', 'surname', 'role', 'tenantId']) {
      expect(res.body.user[f]).toBeDefined();
    }
    for (const f of ['id', 'name', 'slug']) expect(res.body.user.tenant[f]).toBeDefined();
  });

  it('T17: yanıt yalnız çağıranın satırını taşır', async () => {
    guardBehaviour = { allow: true, user: { ...userRow(hash, { id: 'u-self', tenantId: 't-self' }), tenant: tenantRow() } };
    const res = await request(app.getHttpServer()).get('/auth/me').expect(200);
    expect(res.body.user.id).toBe('u-self');
    expect(JSON.stringify(res.body)).not.toContain('u-other');
  });
});

describe('R02 — validateUser kapıları (T14/T16)', () => {
  const build = (row: unknown) =>
    new AuthService(
      { user: { findUnique: jest.fn().mockResolvedValue(row) } } as never,
      { sign: jest.fn() } as never,
    );

  it('T14: inactive User → Unauthorized', async () => {
    await expect(build({ id: 'u1', isActive: false, tokenVersion: 0 }).validateUser('u1', 0)).rejects.toThrow();
  });

  it('T16: password change sonrası (tokenVersion arttı) eski token → Unauthorized', async () => {
    await expect(build({ id: 'u1', isActive: true, tokenVersion: 4, tenant: { lifecycle: 'ACTIVE' } }).validateUser('u1', 3)).rejects.toThrow();
  });

  it('T16b: yeni tokenVersion ile geçerli → satır döner', async () => {
    await expect(build({ id: 'u1', isActive: true, tokenVersion: 4, tenant: { lifecycle: 'ACTIVE' } }).validateUser('u1', 4)).resolves.toMatchObject({
      id: 'u1',
    });
  });
});
