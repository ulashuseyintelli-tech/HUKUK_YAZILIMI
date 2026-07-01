import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { AuthService } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { CaseFeeAgreementController } from '../case-fee-agreement.controller';
import { CaseFeeAgreementService } from '../case-fee-agreement.service';

jest.mock('../../auth/auth.service', () => ({
  AuthService: class AuthService {},
}));

const JWT_SECRET = 'faz2-case-fee-agreement-http-smoke-secret';

interface TestUser {
  id: string;
  tenantId: string;
  email: string;
  role: 'ADMIN' | 'USER';
  isActive: true;
}

const users: Record<string, TestUser> = {
  admin: { id: 'admin', tenantId: 'tenant-admin', email: 'admin@example.test', role: 'ADMIN', isActive: true },
};

function signToken(user: TestUser): string {
  return jwt.sign({ sub: user.id, tenantId: user.tenantId, email: user.email, role: user.role }, JWT_SECRET, {
    expiresIn: '1h',
  });
}

describe('CaseFeeAgreementController HTTP smoke (S8-B FAZ-2)', () => {
  let app: INestApplication;
  let service: {
    create: jest.Mock;
    update: jest.Mock;
    terminate: jest.Mock;
    getById: jest.Mock;
    getActiveForCaseClient: jest.Mock;
    listForCaseClient: jest.Mock;
  };

  const adminToken = signToken(users.admin);

  beforeAll(async () => {
    service = {
      create: jest.fn(),
      update: jest.fn(),
      terminate: jest.fn(),
      getById: jest.fn(),
      getActiveForCaseClient: jest.fn(),
      listForCaseClient: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [CaseFeeAgreementController],
      providers: [
        JwtAuthGuard,
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => (key === 'JWT_SECRET' ? JWT_SECRET : undefined)) },
        },
        {
          provide: AuthService,
          useValue: {
            validateUser: jest.fn(async (userId: string) => Object.values(users).find((u) => u.id === userId) ?? null),
          },
        },
        { provide: CaseFeeAgreementService, useValue: service },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service.create.mockResolvedValue({ id: 'cfa-new', status: 'ACTIVE' });
    service.getActiveForCaseClient.mockResolvedValue({ id: 'cfa-1', status: 'ACTIVE' });
    service.listForCaseClient.mockResolvedValue([{ id: 'cfa-1' }]);
    service.getById.mockResolvedValue({ id: 'cfa-1' });
    service.terminate.mockResolvedValue({ id: 'cfa-1', status: 'TERMINATED' });
  });

  it('JWT yoksa POST create 401 döner ve service create çağrılmaz', async () => {
    await request(app.getHttpServer())
      .post('/case-fee-agreements')
      .send({ caseClientId: 'cc-1', feeType: 'FLAT_AMOUNT', flatAmount: '2000.00' })
      .expect(401);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('JWT ile create 201 döner; service.create auth tenant + actor ile çağrılır', async () => {
    const body = { caseClientId: 'cc-1', feeType: 'FLAT_AMOUNT', flatAmount: '2000.00' };
    await request(app.getHttpServer())
      .post('/case-fee-agreements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body)
      .expect(201);
    expect(service.create).toHaveBeenCalledWith('tenant-admin', expect.objectContaining(body), { userId: 'admin' });
  });

  it('body/param tenantId/userId spoof edilirse auth tenant + actor kazanır', async () => {
    await request(app.getHttpServer())
      .post('/case-fee-agreements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ caseClientId: 'cc-1', feeType: 'FLAT_AMOUNT', flatAmount: '2000.00', tenantId: 'tenant-SPOOF', userId: 'user-SPOOF' })
      .expect(201);
    const [tenantArg, , actorArg] = service.create.mock.calls[0];
    expect(tenantArg).toBe('tenant-admin');
    expect(actorArg).toEqual({ userId: 'admin' });
  });

  it('GET active read JWT ile 200 döner; auth tenant + path caseClientId ile çağrılır', async () => {
    await request(app.getHttpServer())
      .get('/case-fee-agreements/case-client/cc-1/active')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(service.getActiveForCaseClient).toHaveBeenCalledWith('tenant-admin', 'cc-1');
  });

  it('GET list read JWT ile 200 döner (case-client rotası :agreementId ile çakışmaz)', async () => {
    await request(app.getHttpServer())
      .get('/case-fee-agreements/case-client/cc-1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(service.listForCaseClient).toHaveBeenCalledWith('tenant-admin', 'cc-1');
    // Kritik: /case-client/cc-1 isteği getById(:agreementId)'ye YANLIŞLIKLA düşmemeli.
    expect(service.getById).not.toHaveBeenCalled();
  });

  it('GET :agreementId read JWT ile 200 döner', async () => {
    await request(app.getHttpServer())
      .get('/case-fee-agreements/cfa-1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(service.getById).toHaveBeenCalledWith('tenant-admin', 'cfa-1');
  });

  it('POST terminate JWT ile 201 döner; auth tenant + actor ile çağrılır', async () => {
    await request(app.getHttpServer())
      .post('/case-fee-agreements/cfa-1/terminate')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(service.terminate).toHaveBeenCalledWith('tenant-admin', 'cfa-1', { userId: 'admin' });
  });
});
