import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
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
import { AccountingJournalFinancialStatementController } from '../accounting-journal-financial-statement.controller';
import { AccountingJournalFinancialStatementProjectionService } from '../accounting-journal-financial-statement.projection.service';
import type {
  FinancialStatementReadReport,
  FinancialStatementReadRequest,
} from '../accounting-journal-financial-statement.types';

jest.mock('../../auth/auth.service', () => ({
  AuthService: class AuthService {},
}));

const JWT_SECRET = 'acct-5c-financial-statement-http-smoke-secret';

interface TestUser {
  id: string;
  tenantId: string;
  email: string;
  role: 'ADMIN' | 'USER';
  isActive: true;
}

const users: Record<string, TestUser> = {
  admin: {
    id: 'admin',
    tenantId: 'tenant-auth',
    email: 'admin@example.test',
    role: 'ADMIN',
    isActive: true,
  },
  nonAdmin: {
    id: 'non-admin',
    tenantId: 'tenant-user',
    email: 'user@example.test',
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

function financialStatementReport(input: FinancialStatementReadRequest): FinancialStatementReadReport {
  return {
    tenantId: input.tenantId,
    statementType: input.statementType,
    surface: 'FINANCIAL_STATEMENT',
    sourceBasis: 'JOURNAL_DERIVED_PROJECTION',
    period: input.period,
    currency: input.currency,
    scope: input.scope,
    opening: { amount: '0.00', currency: input.currency },
    movements: [
      {
        lineNo: 1,
        statementDate: '2026-06-15T10:30:00.000Z',
        accountCode: 'CLIENT_PAYABLE',
        direction: 'CREDIT',
        amount: '100.00',
        currency: input.currency,
        caseId: input.scope.caseId,
        clientId: input.scope.clientId,
        caseClientId: input.scope.caseClientId,
        source: {
          sourceType: 'COLLECTION_DISPOSITION_LINE',
          sourceAction: 'posted',
          displayRef: 'COLLECTION_DISPOSITION_LINE:posted',
        },
        note: 'Journal-derived client payable movement',
      },
    ],
    closing: { amount: '100.00', currency: input.currency },
    reconciliation: {
      status: 'READY',
      trialBalanceEvidenceStatus: 'BALANCED',
      legalLedgerComparisonStatus: 'PENDING',
      warnings: [
        {
          code: 'LEGAL_LEDGER_COMPARISON_NOT_AUTHORITATIVE',
          message: 'Legal ledger comparison is reconciliation evidence, not a legal authority switch.',
        },
      ],
    },
  };
}

function validQuery() {
  return {
    tenantId: 'tenant-spoof',
    statementType: 'CLIENT_CASE_STATEMENT',
    from: '2026-06-01',
    to: '2026-06-30T23:59:59.999Z',
    dateBasis: 'postedAt',
    currency: 'TRY',
    caseId: 'case-1',
    clientId: 'client-1',
    caseClientId: 'case-client-1',
  };
}

function classGuards(): any[] {
  return Reflect.getMetadata(GUARDS_METADATA, AccountingJournalFinancialStatementController) || [];
}

function methodGuards(): any[] {
  return Reflect.getMetadata(
    GUARDS_METADATA,
    AccountingJournalFinancialStatementController.prototype.getFinancialStatement,
  ) || [];
}

describe('AccountingJournalFinancialStatementController HTTP smoke', () => {
  let app: INestApplication;
  let service: {
    getClientCaseStatement: jest.Mock<Promise<FinancialStatementReadReport>, [FinancialStatementReadRequest]>;
  };
  const adminToken = signToken(users.admin);
  const nonAdminToken = signToken(users.nonAdmin);

  beforeAll(async () => {
    service = {
      getClientCaseStatement: jest.fn(async (input: FinancialStatementReadRequest) =>
        financialStatementReport(input),
      ),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [AccountingJournalFinancialStatementController],
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
        { provide: AccountingJournalFinancialStatementProjectionService, useValue: service },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    service.getClientCaseStatement.mockClear();
  });

  it('guard metadata: class uses JwtAuthGuard and endpoint uses AdminGuard', () => {
    expect(classGuards()).toContain(JwtAuthGuard);
    expect(methodGuards()).toContain(AdminGuard);
  });

  it('JWT yoksa 401 doner ve projection service cagrilmaz', async () => {
    await request(app.getHttpServer()).get('/accounting-journal/financial-statements').query(validQuery()).expect(401);

    expect(service.getClientCaseStatement).not.toHaveBeenCalled();
  });

  it('non-admin JWT ile 403 doner ve projection service cagrilmaz', async () => {
    await request(app.getHttpServer())
      .get('/accounting-journal/financial-statements')
      .query(validQuery())
      .set('Authorization', `Bearer ${nonAdminToken}`)
      .expect(403);

    expect(service.getClientCaseStatement).not.toHaveBeenCalled();
  });

  it('admin JWT ile 200 doner ve Financial Statement projection contract temel alanlarini tasir', async () => {
    const response = await request(app.getHttpServer())
      .get('/accounting-journal/financial-statements')
      .query(validQuery())
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(service.getClientCaseStatement).toHaveBeenCalledWith({
      tenantId: 'tenant-auth',
      statementType: 'CLIENT_CASE_STATEMENT',
      period: {
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-06-30T23:59:59.999Z',
        dateBasis: 'postedAt',
      },
      currency: 'TRY',
      scope: {
        caseId: 'case-1',
        clientId: 'client-1',
        caseClientId: 'case-client-1',
      },
    });
    expect(response.body).toMatchObject({
      tenantId: 'tenant-auth',
      statementType: 'CLIENT_CASE_STATEMENT',
      surface: 'FINANCIAL_STATEMENT',
      sourceBasis: 'JOURNAL_DERIVED_PROJECTION',
      period: {
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-06-30T23:59:59.999Z',
        dateBasis: 'postedAt',
      },
      currency: 'TRY',
      scope: {
        caseId: 'case-1',
        clientId: 'client-1',
        caseClientId: 'case-client-1',
      },
      opening: { amount: '0.00', currency: 'TRY' },
      closing: { amount: '100.00', currency: 'TRY' },
      reconciliation: {
        status: 'READY',
        trialBalanceEvidenceStatus: 'BALANCED',
        legalLedgerComparisonStatus: 'PENDING',
        warnings: [expect.objectContaining({ code: 'LEGAL_LEDGER_COMPARISON_NOT_AUTHORITATIVE' })],
      },
    });
    expect(response.body.movements).toEqual([
      expect.objectContaining({
        lineNo: 1,
        statementDate: '2026-06-15T10:30:00.000Z',
        accountCode: 'CLIENT_PAYABLE',
        direction: 'CREDIT',
        amount: '100.00',
        currency: 'TRY',
      }),
    ]);
  });

  it('query tenantId spoof edilirse auth tenant kazanir', async () => {
    const response = await request(app.getHttpServer())
      .get('/accounting-journal/financial-statements')
      .query(validQuery())
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(service.getClientCaseStatement.mock.calls[0][0].tenantId).toBe('tenant-auth');
    expect(response.body.tenantId).toBe('tenant-auth');
    expect(JSON.stringify(service.getClientCaseStatement.mock.calls[0][0])).not.toContain('tenant-spoof');
  });

  it.each([
    ['statementType', 'TRIAL_BALANCE'],
    ['dateBasis', 'sourceOccurredAt'],
  ])('invalid enum query %s icin 400 doner ve projection service cagrilmaz', async (field, value) => {
    await request(app.getHttpServer())
      .get('/accounting-journal/financial-statements')
      .query({ ...validQuery(), [field]: value })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    expect(service.getClientCaseStatement).not.toHaveBeenCalled();
  });

  it.each(['from', 'to'])('invalid date query %s icin 400 doner ve projection service cagrilmaz', async (field) => {
    await request(app.getHttpServer())
      .get('/accounting-journal/financial-statements')
      .query({ ...validQuery(), [field]: 'not-a-date' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    expect(service.getClientCaseStatement).not.toHaveBeenCalled();
  });

  it.each(['statementType', 'from', 'to', 'dateBasis', 'currency', 'caseId', 'clientId'])(
    'missing required query %s icin 400 doner ve projection service cagrilmaz',
    async (field) => {
      const query = validQuery() as Record<string, string>;
      delete query[field];

      await request(app.getHttpServer())
        .get('/accounting-journal/financial-statements')
        .query(query)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(service.getClientCaseStatement).not.toHaveBeenCalled();
    },
  );
});
