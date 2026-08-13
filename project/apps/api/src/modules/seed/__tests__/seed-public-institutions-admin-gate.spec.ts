/**
 * OFFICE-P5-B02R1 (owner-ratified bounded successor) — POST /seed/public-institutions
 * ADMIN rol kapısı.
 *
 * GEREKÇE (P5 evidence F-B02-01): bu uç /seed/* içindeki TEK global (tenant'sız) tablo
 * mutasyonudur; OWN-13 D03 yalnız JwtAuthGuard eklemişti → herhangi bir tenant'ın herhangi
 * bir authenticated kullanıcısı TÜM tenant'ların ortak referans verisine yazabiliyordu.
 * Owner B02R1 ile bu uca (ve YALNIZ bu uca) ADMIN kapısını ratifiye etti.
 *
 * Bu spec GERÇEK guard zincirini (JwtStrategy + JwtAuthGuard + AdminGuard) kontrollü test
 * app'inde koşturur (security-tenant-runtime-certification harness emsali) ve şunları kilitler:
 *   kimliksiz → 401 · USER → 403 · ADMIN → başarı · kapı ROUTE-SCOPED (blanket değil) ·
 *   servis global semantiği (tenantId YOK) · duplicate/idempotency.
 */
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';

import { SeedController } from '../seed.controller';
import { SeedService } from '../seed.service';
import { AuthService } from '../../auth/auth.service';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';

const TEST_SECRET = 'p5-b02r1-public-institutions-gate-test-secret-32b';

const ADMIN_USER = {
  id: 'u-admin',
  tenantId: 't1',
  email: 'admin@example.test',
  role: 'ADMIN',
  tokenVersion: 0,
  isActive: true,
};
const PLAIN_USER = {
  id: 'u-user',
  tenantId: 't1',
  email: 'user@example.test',
  role: 'USER',
  tokenVersion: 0,
  isActive: true,
};

describe('P5-B02R1 — POST /seed/public-institutions gerçek guard zinciri', () => {
  let app: INestApplication;
  let jwt: JwtService;

  const auth = {
    validateUser: jest.fn(),
  };
  const seedService = {
    seedPublicInstitutions: jest.fn().mockResolvedValue({ created: 0, skipped: 0 }),
    seedStaff: jest.fn().mockResolvedValue({ created: 0, existing: 0, skippedForReview: 0 }),
  };

  const tokenFor = (user: { id: string; tenantId: string; email: string; role: string; tokenVersion: number }) =>
    jwt.sign({
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });

  beforeAll(async () => {
    auth.validateUser.mockImplementation((sub: string) =>
      Promise.resolve(sub === 'u-admin' ? ADMIN_USER : PLAIN_USER),
    );
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: TEST_SECRET, signOptions: { expiresIn: '5m' } }),
      ],
      controllers: [SeedController],
      providers: [
        JwtStrategy,
        JwtAuthGuard,
        AdminGuard,
        { provide: AuthService, useValue: auth },
        { provide: SeedService, useValue: seedService },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: unknown) =>
              key === 'JWT_SECRET' ? TEST_SECRET : defaultValue,
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
    jwt = module.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    seedService.seedPublicInstitutions.mockClear();
    seedService.seedStaff.mockClear();
  });

  it('kimliksiz istek → 401; servis HİÇ çağrılmaz', async () => {
    await request(app.getHttpServer()).post('/seed/public-institutions').expect(401);
    expect(seedService.seedPublicInstitutions).not.toHaveBeenCalled();
  });

  it('authenticated USER → 403 (ADMIN kapısı); servis HİÇ çağrılmaz', async () => {
    const res = await request(app.getHttpServer())
      .post('/seed/public-institutions')
      .set('Authorization', `Bearer ${tokenFor(PLAIN_USER)}`)
      .expect(403);
    expect(res.body.message).toContain('ADMIN');
    expect(seedService.seedPublicInstitutions).not.toHaveBeenCalled();
  });

  it('ADMIN → başarı; servis argümansız (GLOBAL — tenant parametresi YOK) çağrılır', async () => {
    await request(app.getHttpServer())
      .post('/seed/public-institutions')
      .set('Authorization', `Bearer ${tokenFor(ADMIN_USER)}`)
      .expect(201);
    expect(seedService.seedPublicInstitutions).toHaveBeenCalledTimes(1);
    expect(seedService.seedPublicInstitutions).toHaveBeenCalledWith();
  });

  it('kapı ROUTE-SCOPED: USER, tenant-scoped POST /seed/staff ucunu KULLANABİLİR (blanket dönüşüm yok)', async () => {
    await request(app.getHttpServer())
      .post('/seed/staff')
      .set('Authorization', `Bearer ${tokenFor(PLAIN_USER)}`)
      .expect(201);
    expect(seedService.seedStaff).toHaveBeenCalledWith('t1');
  });
});

describe('P5-B02R1 — seedPublicInstitutions servis semantiği (global + idempotent)', () => {
  const buildSvc = (existing: boolean) => {
    const prisma: any = {
      publicInstitution: {
        findUnique: jest.fn().mockResolvedValue(existing ? { id: 'pi1' } : null),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    // Diğer bağımlılıklar bu yolda kullanılmaz (audit/client/staff/lawyer).
    const svc = new SeedService(prisma, { log: jest.fn() } as any, {} as any, undefined, undefined);
    return { svc, prisma };
  };

  it('boş tabloda yazar; her create verisi GLOBAL şekildedir (tenantId anahtarı YOK)', async () => {
    const { svc, prisma } = buildSvc(false);
    const res: any = await svc.seedPublicInstitutions();
    expect(res.created).toBeGreaterThan(900); // kurumlar + 852 icra dairesi
    expect(res.skipped).toBe(0);
    for (const call of prisma.publicInstitution.create.mock.calls) {
      expect('tenantId' in call[0].data).toBe(false);
      expect(typeof call[0].data.detsisNo).toBe('string');
    }
  });

  it('ikinci koşu idempotent: mevcut detsisNo satırları atlanır, HİÇ create çağrılmaz', async () => {
    const { svc, prisma } = buildSvc(true);
    const res: any = await svc.seedPublicInstitutions();
    expect(res.created).toBe(0);
    expect(res.skipped).toBeGreaterThan(900);
    expect(prisma.publicInstitution.create).not.toHaveBeenCalled();
  });
});
