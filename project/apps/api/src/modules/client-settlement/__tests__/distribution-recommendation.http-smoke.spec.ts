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
import { PrismaService } from '../../../prisma/prisma.service';
import { ClientOffsetService } from '../client-offset.service';
import { ClientSettlementReadService } from '../client-settlement-read.service';
import { DispositionController } from '../disposition.controller';
import { DispositionPostingService } from '../disposition-posting.service';
import { DistributionRecommendationService } from '../distribution-recommendation.service';

jest.mock('../../auth/auth.service', () => ({
  AuthService: class AuthService {},
}));

const JWT_SECRET = 'acct-3c-distribution-recommendation-http-smoke-secret';

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
    tenantId: 'tenant-admin',
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

function defaultDisposition(extra: Record<string, unknown> = {}) {
  return {
    id: 'disp-1',
    status: 'HELD_PENDING_DISTRIBUTION',
    currency: 'TRY',
    totalAmount: '100000',
    beneficiaryScope: 'SINGLE_CASE_CLIENT',
    caseClientId: 'cc-1',
    caseId: 'case-1',
    ...extra,
  };
}

describe('DistributionRecommendationController HTTP smoke', () => {
  let app: INestApplication;
  let prisma: {
    $transaction: jest.Mock;
    collectionDisposition: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    collectionDispositionLine: {
      create: jest.Mock;
      deleteMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    accountingJournalEntry: { create: jest.Mock };
    accountingJournalLine: { create: jest.Mock };
    officeApprovalRequest: {
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    caseClient: { findFirst: jest.Mock };
  };
  let offset: { getEligibility: jest.Mock };
  let posting: { recommend: jest.Mock; approve: jest.Mock; post: jest.Mock };

  const adminToken = signToken(users.admin);
  const nonAdminToken = signToken(users.nonAdmin);

  beforeAll(async () => {
    prisma = {
      $transaction: jest.fn(),
      collectionDisposition: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      collectionDispositionLine: {
        create: jest.fn(),
        deleteMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      accountingJournalEntry: { create: jest.fn() },
      accountingJournalLine: { create: jest.fn() },
      officeApprovalRequest: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      caseClient: { findFirst: jest.fn() },
    };
    offset = {
      getEligibility: jest.fn(),
    };
    posting = {
      recommend: jest.fn(),
      approve: jest.fn(),
      post: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [DispositionController],
      providers: [
        JwtAuthGuard,
        JwtStrategy,
        DistributionRecommendationService,
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
        { provide: PrismaService, useValue: prisma },
        { provide: ClientOffsetService, useValue: offset },
        { provide: DispositionPostingService, useValue: posting },
        { provide: ClientSettlementReadService, useValue: { getOutstanding: jest.fn() } },
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
    prisma.collectionDisposition.findFirst.mockResolvedValue(defaultDisposition());
    prisma.caseClient.findFirst.mockResolvedValue({ client: { id: 'client-1' } });
    offset.getEligibility.mockResolvedValue({ eligibleExpenseRequests: [] });
  });

  function expectNoWriteOrPostingDelegation() {
    expect(posting.recommend).not.toHaveBeenCalled();
    expect(posting.approve).not.toHaveBeenCalled();
    expect(posting.post).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.collectionDisposition.create).not.toHaveBeenCalled();
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expect(prisma.collectionDisposition.updateMany).not.toHaveBeenCalled();
    expect(prisma.collectionDispositionLine.create).not.toHaveBeenCalled();
    expect(prisma.collectionDispositionLine.deleteMany).not.toHaveBeenCalled();
    expect(prisma.collectionDispositionLine.update).not.toHaveBeenCalled();
    expect(prisma.collectionDispositionLine.updateMany).not.toHaveBeenCalled();
    expect(prisma.accountingJournalEntry.create).not.toHaveBeenCalled();
    expect(prisma.accountingJournalLine.create).not.toHaveBeenCalled();
    expect(prisma.officeApprovalRequest.create).not.toHaveBeenCalled();
    expect(prisma.officeApprovalRequest.update).not.toHaveBeenCalled();
    expect(prisma.officeApprovalRequest.updateMany).not.toHaveBeenCalled();
  }

  it('JWT yoksa 401 doner ve advisory service path calismaz', async () => {
    await request(app.getHttpServer())
      .post('/collection-dispositions/disp-1/distribution-recommendation')
      .send({})
      .expect(401);

    expect(prisma.collectionDisposition.findFirst).not.toHaveBeenCalled();
    expectNoWriteOrPostingDelegation();
  });

  it('non-admin JWT ile mevcut JWT-only route 201 doner ve auth tenant ile delegation yapar', async () => {
    const response = await request(app.getHttpServer())
      .post('/collection-dispositions/disp-1/distribution-recommendation')
      .set('Authorization', `Bearer ${nonAdminToken}`)
      .send({})
      .expect(201);

    expect(response.body.data.recommendOnly).toBe(true);
    expect(response.body.data.financialEffect).toBe(false);
    expect(prisma.collectionDisposition.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'disp-1', tenantId: 'tenant-user' },
    }));
    expectNoWriteOrPostingDelegation();
  });

  it('admin JWT ile advisory response contract temel alanlarini tasir', async () => {
    const response = await request(app.getHttpServer())
      .post('/collection-dispositions/disp-1/distribution-recommendation')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ attorneyFee: { mode: 'AMOUNT', amount: '33333.33', note: 'manual fee' } })
      .expect(201);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      data: {
        dispositionId: 'disp-1',
        status: 'HELD_PENDING_DISTRIBUTION',
        currency: 'TRY',
        gross: '100000',
        beneficiaryScope: 'SINGLE_CASE_CLIENT',
        recommendOnly: true,
        financialEffect: false,
        suggestedLines: [
          {
            type: 'CONTRACTUAL_FEE_WITHHELD',
            amount: '33333.33',
            caseClientId: null,
            origin: 'FEE_MANUAL',
            editable: true,
            note: 'manual fee',
          },
          {
            type: 'CLIENT_PAYABLE',
            amount: '66666.67',
            caseClientId: 'cc-1',
            origin: 'CLIENT_PAYABLE_RESIDUAL',
            editable: true,
          },
        ],
        sumCheck: { sum: '100000', equalsGross: true },
        expenseModule: {
          autoApplyEnabled: false,
          disabledReason: 'EXPENSE_APPROVAL_FIELD_MISSING',
          candidates: [],
        },
        warnings: [],
      },
    });
    expect(prisma.collectionDisposition.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'disp-1', tenantId: 'tenant-admin' },
    }));
    expect(offset.getEligibility).toHaveBeenCalledWith('tenant-admin', 'admin', 'client-1', 'TRY');
    expectNoWriteOrPostingDelegation();
  });

  it('tenantId query/body spoof edilirse auth tenant kazanir', async () => {
    const response = await request(app.getHttpServer())
      .post('/collection-dispositions/disp-1/distribution-recommendation')
      .query({ tenantId: 'tenant-query-spoof' })
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tenantId: 'tenant-body-spoof', attorneyFee: { mode: 'AMOUNT', amount: '10' } })
      .expect(201);

    const dispositionReadArgs = prisma.collectionDisposition.findFirst.mock.calls[0][0];
    expect(dispositionReadArgs.where).toEqual({ id: 'disp-1', tenantId: 'tenant-admin' });
    expect(JSON.stringify(dispositionReadArgs)).not.toContain('tenant-query-spoof');
    expect(JSON.stringify(dispositionReadArgs)).not.toContain('tenant-body-spoof');
    expect(response.body.data.recommendOnly).toBe(true);
    expect(response.body.data.financialEffect).toBe(false);
    expectNoWriteOrPostingDelegation();
  });

  it('invalid advisory body icin 400 doner ve write/posting delegation yapmaz', async () => {
    await request(app.getHttpServer())
      .post('/collection-dispositions/disp-1/distribution-recommendation')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ attorneyFee: { mode: 'RATE', amount: '10' } })
      .expect(400);

    expect(prisma.collectionDisposition.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'disp-1', tenantId: 'tenant-admin' },
    }));
    expectNoWriteOrPostingDelegation();
  });
});