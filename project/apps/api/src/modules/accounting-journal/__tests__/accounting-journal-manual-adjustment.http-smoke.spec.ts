import 'reflect-metadata';
import { ConflictException, ForbiddenException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { AuthService } from '../../auth/auth.service';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { CPE_ACTION_CODE_KEY } from '../../policy-engine/decorators/cpe-required.decorator';
import { ActionCode } from '../../policy-engine/types/action-code.enum';
import { AccountingJournalManualAdjustmentController } from '../accounting-journal-manual-adjustment.controller';
import { AccountingJournalManualAdjustmentService } from '../accounting-journal-manual-adjustment.service';

jest.mock('../../auth/auth.service', () => ({
  AuthService: class AuthService {},
}));

const JWT_SECRET = 'acct-1m-2-manual-adjustment-http-smoke-secret';

interface TestUser {
  id: string;
  tenantId: string;
  email: string;
  role: 'ADMIN' | 'USER';
  isActive: true;
}

const users: Record<string, TestUser> = {
  partner: {
    id: 'partner-user',
    tenantId: 'tenant-auth',
    email: 'partner@example.test',
    role: 'ADMIN',
    isActive: true,
  },
  plainUser: {
    id: 'plain-user',
    tenantId: 'tenant-auth',
    email: 'plain@example.test',
    role: 'USER',
    isActive: true,
  },
};

function signToken(user: TestUser): string {
  return jwt.sign(
    {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: 'manual-adjustment-1',
    sourceName: 'ops-correction',
    reason: 'Correct opening client balance error',
    evidenceRef: 'EV-1',
    amount: '10.00',
    currency: 'TRY',
    lines: [
      { accountCode: 'CASH_CLEARING', direction: 'DEBIT', amount: '10.00', caseId: 'case-1', clientId: 'client-1', caseClientId: 'cc-1' },
      { accountCode: 'CLIENT_PAYABLE', direction: 'CREDIT', amount: '10.00', caseId: 'case-1', clientId: 'client-1', caseClientId: 'cc-1' },
    ],
    ...overrides,
  };
}

function successResult(status: 'CREATED' | 'REPLAYED' = 'CREATED') {
  return {
    status,
    journalEntryId: 'journal-manual-1',
    idempotencyKey: 'acct-journal:v1:tenant-auth:ACCOUNTING_JOURNAL_ENTRY:manual-adjustment-1:manual-adjustment:v1',
    sourceVersion: 'manual-adjustment:v1',
    lineCount: 2,
  };
}

function classGuards(): any[] {
  return Reflect.getMetadata(GUARDS_METADATA, AccountingJournalManualAdjustmentController) || [];
}

function methodGuards(): any[] {
  return Reflect.getMetadata(GUARDS_METADATA, AccountingJournalManualAdjustmentController.prototype.createManualAdjustment) || [];
}

function cpeActionCode(): ActionCode | undefined {
  return Reflect.getMetadata(CPE_ACTION_CODE_KEY, AccountingJournalManualAdjustmentController.prototype.createManualAdjustment);
}

describe('AccountingJournalManualAdjustmentController HTTP smoke', () => {
  let app: INestApplication;
  let service: { createManualAdjustment: jest.Mock };
  const partnerToken = signToken(users.partner);
  const plainUserToken = signToken(users.plainUser);

  beforeAll(async () => {
    service = {
      createManualAdjustment: jest.fn(async () => successResult()),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [AccountingJournalManualAdjustmentController],
      providers: [
        JwtAuthGuard,
        AdminGuard,
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => (key === 'JWT_SECRET' ? JWT_SECRET : undefined)) },
        },
        {
          provide: AuthService,
          useValue: {
            validateUser: jest.fn(async (userId: string) =>
              Object.values(users).find((user) => user.id === userId) ?? null,
            ),
          },
        },
        { provide: AccountingJournalManualAdjustmentService, useValue: service },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    service.createManualAdjustment.mockReset();
    service.createManualAdjustment.mockResolvedValue(successResult());
  });

  it('guard metadata: class uses JwtAuthGuard, endpoint has no AdminGuard, and CPE action metadata is present', () => {
    expect(classGuards()).toContain(JwtAuthGuard);
    expect(methodGuards()).not.toContain(AdminGuard);
    expect(cpeActionCode()).toBe(ActionCode.ACCOUNTING_JOURNAL_MANUAL_ADJUSTMENT);
  });

  it('JWT yoksa 401 doner ve manual adjustment service cagrilmaz', async () => {
    await request(app.getHttpServer())
      .post('/accounting-journal/entries/manual-adjustments')
      .send(validBody())
      .expect(401);

    expect(service.createManualAdjustment).not.toHaveBeenCalled();
  });

  it('service-level office-admin gate 403 dondurdugunde controller bunu boundary olarak tasir', async () => {
    service.createManualAdjustment.mockRejectedValueOnce(
      new ForbiddenException({ code: 'ACCOUNTING_JOURNAL_MANUAL_ADJUSTMENT_FORBIDDEN' }),
    );

    await request(app.getHttpServer())
      .post('/accounting-journal/entries/manual-adjustments')
      .set('Authorization', `Bearer ${plainUserToken}`)
      .send(validBody())
      .expect(403);

    expect(service.createManualAdjustment).toHaveBeenCalledWith(
      'tenant-auth',
      'plain-user',
      expect.objectContaining({ idempotencyKey: 'manual-adjustment-1', reason: 'Correct opening client balance error' }),
    );
  });

  it('auth context kazanir: tenantId ve actorUserId body spoof alanlarindan alinmaz', async () => {
    await request(app.getHttpServer())
      .post('/accounting-journal/entries/manual-adjustments')
      .set('Authorization', `Bearer ${partnerToken}`)
      .send(validBody({ tenantId: 'tenant-spoof', actorUserId: 'actor-spoof' }))
      .expect(201);

    expect(service.createManualAdjustment).toHaveBeenCalledWith(
      'tenant-auth',
      'partner-user',
      expect.objectContaining({ idempotencyKey: 'manual-adjustment-1' }),
    );
    expect(JSON.stringify(service.createManualAdjustment.mock.calls[0])).not.toContain('tenant-spoof');
    expect(JSON.stringify(service.createManualAdjustment.mock.calls[0])).not.toContain('actor-spoof');
  });

  it('success response service contract temel alanlarini tasir', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounting-journal/entries/manual-adjustments')
      .set('Authorization', `Bearer ${partnerToken}`)
      .send(validBody())
      .expect(201);

    expect(response.body).toEqual(successResult('CREATED'));
  });

  it('replay response service contract temel alanlarini tasir', async () => {
    service.createManualAdjustment.mockResolvedValueOnce(successResult('REPLAYED'));

    const response = await request(app.getHttpServer())
      .post('/accounting-journal/entries/manual-adjustments')
      .set('Authorization', `Bearer ${partnerToken}`)
      .send(validBody())
      .expect(201);

    expect(response.body).toEqual(successResult('REPLAYED'));
  });

  it('missing required reason 400 doner ve manual adjustment service cagrilmaz', async () => {
    const withoutReason: Record<string, unknown> = validBody();
    delete withoutReason.reason;

    await request(app.getHttpServer())
      .post('/accounting-journal/entries/manual-adjustments')
      .set('Authorization', `Bearer ${partnerToken}`)
      .send(withoutReason)
      .expect(400);

    expect(service.createManualAdjustment).not.toHaveBeenCalled();
  });

  it('domain draft conflict service path 409 olarak doner', async () => {
    service.createManualAdjustment.mockRejectedValueOnce(
      new ConflictException({ code: 'ACCOUNTING_JOURNAL_MANUAL_ADJUSTMENT_DRAFT_INVALID' }),
    );

    await request(app.getHttpServer())
      .post('/accounting-journal/entries/manual-adjustments')
      .set('Authorization', `Bearer ${partnerToken}`)
      .send(validBody())
      .expect(409);
  });
});
