import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { AuthService } from '../../auth/auth.service';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { AccountingJournalTrialBalanceController } from '../accounting-journal-trial-balance.controller';
import { AccountingJournalTrialBalanceService } from '../accounting-journal-trial-balance.service';
import type {
  AccountingJournalTrialBalanceFilters,
  AccountingJournalTrialBalanceReport,
} from '../accounting-journal-trial-balance.types';

jest.mock('../../auth/auth.service', () => ({
  AuthService: class AuthService {},
}));

const JWT_SECRET = 'acct-2a-7-trial-balance-http-smoke-secret';

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

function trialBalanceReport(filters: AccountingJournalTrialBalanceFilters): AccountingJournalTrialBalanceReport {
  return {
    tenantId: filters.tenantId,
    filters,
    rows: [],
    totals: [],
    sourceBreakdown: [],
    diagnostics: {
      balanced: true,
      dimensionScoped: false,
      partialEntryScope: false,
      dateBasis: 'postedAt',
      generatedAt: '2026-06-30T00:00:00.000Z',
      lineCount: 0,
      entryCount: 0,
      currencyCount: 0,
      evidenceStatus: 'NO_LINES',
      unbalancedCurrencies: [],
      missingEffectiveDateColumn: true,
      missingSourceVersionColumn: true,
      warningCodes: ['NO_JOURNAL_LINES'],
    },
  };
}

describe('AccountingJournalTrialBalanceController HTTP smoke', () => {
  let app: INestApplication;
  let service: { getTrialBalance: jest.Mock<Promise<AccountingJournalTrialBalanceReport>, [AccountingJournalTrialBalanceFilters]> };
  const adminToken = signToken(users.admin);
  const nonAdminToken = signToken(users.nonAdmin);

  beforeAll(async () => {
    service = {
      getTrialBalance: jest.fn(async (filters: AccountingJournalTrialBalanceFilters) =>
        trialBalanceReport(filters),
      ),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [AccountingJournalTrialBalanceController],
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
        { provide: AccountingJournalTrialBalanceService, useValue: service },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    service.getTrialBalance.mockClear();
  });

  it('JWT yoksa 401 doner ve read service cagrilmaz', async () => {
    await request(app.getHttpServer()).get('/accounting-journal/trial-balance').expect(401);

    expect(service.getTrialBalance).not.toHaveBeenCalled();
  });

  it('non-admin JWT ile 403 doner ve read service cagrilmaz', async () => {
    await request(app.getHttpServer())
      .get('/accounting-journal/trial-balance')
      .set('Authorization', `Bearer ${nonAdminToken}`)
      .expect(403);

    expect(service.getTrialBalance).not.toHaveBeenCalled();
  });

  it('admin JWT ile 200 doner ve diagnostics contract temel alanlarini tasir', async () => {
    const response = await request(app.getHttpServer())
      .get('/accounting-journal/trial-balance')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(service.getTrialBalance).toHaveBeenCalledWith({ tenantId: 'tenant-auth' });
    expect(response.body).toMatchObject({
      tenantId: 'tenant-auth',
      diagnostics: {
        generatedAt: '2026-06-30T00:00:00.000Z',
        lineCount: 0,
        entryCount: 0,
        currencyCount: 0,
        evidenceStatus: 'NO_LINES',
      },
    });
  });

  it('query tenantId spoof edilirse auth tenant kazanir', async () => {
    const response = await request(app.getHttpServer())
      .get('/accounting-journal/trial-balance')
      .query({ tenantId: 'tenant-spoof', currency: 'TRY' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(service.getTrialBalance).toHaveBeenCalledWith({
      tenantId: 'tenant-auth',
      currency: 'TRY',
    });
    expect(response.body.tenantId).toBe('tenant-auth');
    expect(response.body.filters.tenantId).toBe('tenant-auth');
    expect(JSON.stringify(service.getTrialBalance.mock.calls[0][0])).not.toContain('tenant-spoof');
  });

  it.each([
    ['accountCode', 'NOT_AN_ACCOUNT'],
    ['sourceType', 'NOT_A_SOURCE'],
    ['entryType', 'NOT_AN_ENTRY'],
  ])('invalid enum query %s icin 400 doner ve read service cagrilmaz', async (field, value) => {
    await request(app.getHttpServer())
      .get('/accounting-journal/trial-balance')
      .query({ [field]: value })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    expect(service.getTrialBalance).not.toHaveBeenCalled();
  });

  it.each(['postedFrom', 'postedTo'])(
    'invalid date query %s icin 400 doner ve read service cagrilmaz',
    async (field) => {
      await request(app.getHttpServer())
        .get('/accounting-journal/trial-balance')
        .query({ [field]: 'not-a-date' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(service.getTrialBalance).not.toHaveBeenCalled();
    },
  );
});
