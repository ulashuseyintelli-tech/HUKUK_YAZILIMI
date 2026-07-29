import 'reflect-metadata';
import {
  ConflictException,
  ForbiddenException,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { BankSettlementEvidenceOutcome, BankSettlementEvidenceSource } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import { PassportModule } from '@nestjs/passport';
import * as request from 'supertest';
import { AuthService } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { BankCandidateSettlementTransitionService } from '../bank-candidate-settlement-transition.service';
import { BankLifecycleController } from '../bank-lifecycle.controller';
import { BankModule } from '../bank.module';
import { BankSettlementEvidenceWriterService } from '../bank-settlement-evidence-writer.service';

jest.mock('../../auth/auth.service', () => ({
  AuthService: class AuthService {},
}));

const JWT_SECRET = 'bank-lifecycle-http-smoke-secret';
const user = {
  id: 'verifier-user-1',
  tenantId: 'tenant-auth-1',
  email: 'verifier@example.test',
  role: 'USER',
  isActive: true,
};

function token(): string {
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

function evidenceBody(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: 'settlement-command-1',
    outcome: BankSettlementEvidenceOutcome.SETTLED,
    evidenceReference: 'evidence://bank/settlement/1',
    evidenceHash: 'a'.repeat(64),
    observedAt: '2026-07-30T09:00:00.000Z',
    ...overrides,
  };
}

function finalityBody(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: 'settlement-command-1',
    settlementEvidenceId: 'evidence-1',
    ...overrides,
  };
}

describe('W2.2C-6 BankLifecycleController production command boundary', () => {
  let app: INestApplication;
  let evidenceWriter: { appendHumanEvidence: jest.Mock };
  let transitionService: { transition: jest.Mock };

  beforeAll(async () => {
    evidenceWriter = {
      appendHumanEvidence: jest.fn(),
    };
    transitionService = {
      transition: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [BankLifecycleController],
      providers: [
        JwtAuthGuard,
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => (key === 'JWT_SECRET' ? JWT_SECRET : undefined)),
          },
        },
        {
          provide: AuthService,
          useValue: {
            validateUser: jest.fn(async (userId: string) =>
              userId === user.id ? user : null,
            ),
          },
        },
        { provide: BankSettlementEvidenceWriterService, useValue: evidenceWriter },
        { provide: BankCandidateSettlementTransitionService, useValue: transitionService },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    evidenceWriter.appendHumanEvidence.mockReset();
    evidenceWriter.appendHumanEvidence.mockResolvedValue({
      status: 'CREATED',
      evidence: { id: 'evidence-1' },
    });
    transitionService.transition.mockReset();
    transitionService.transition.mockResolvedValue({
      status: 'TRANSITIONED',
      candidate: {
        id: 'transaction-1',
        candidateStatus: 'SETTLED',
        settlementEvidenceId: 'evidence-1',
        externalSettledAt: '2026-07-30T09:00:00.000Z',
      },
    });
  });

  it('registers the lifecycle controller in the production BankModule', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, BankModule) ?? [];
    expect(controllers).toContain(BankLifecycleController);
  });

  it.each([
    ['/api/bank/settlement-evidence', evidenceBody()],
    ['/api/bank/transactions/transaction-1/finality', finalityBody()],
  ])('requires JWT authentication for %s', async (path, body) => {
    await request(app.getHttpServer()).post(path).send(body).expect(401);
    expect(evidenceWriter.appendHumanEvidence).not.toHaveBeenCalled();
    expect(transitionService.transition).not.toHaveBeenCalled();
  });

  it('takes tenant and actor from JWT and keeps evidence source server-owned', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/bank/settlement-evidence')
      .set('Authorization', `Bearer ${token()}`)
      .send(evidenceBody())
      .expect(201);

    expect(evidenceWriter.appendHumanEvidence).toHaveBeenCalledWith({
      trustedTenantId: user.tenantId,
      actorUserId: user.id,
      idempotencyKey: 'settlement-command-1',
      source: BankSettlementEvidenceSource.SETTLEMENT_VERIFIER,
      outcome: BankSettlementEvidenceOutcome.SETTLED,
      evidenceReference: 'evidence://bank/settlement/1',
      evidenceHash: 'a'.repeat(64),
      observedAt: new Date('2026-07-30T09:00:00.000Z'),
    });
    expect(response.body).toMatchObject({ status: 'CREATED', evidence: { id: 'evidence-1' } });
  });

  it.each(['tenantId', 'actorUserId', 'source', 'rawPayload', 'description'])(
    'rejects body-controlled or sensitive field %s before evidence service invocation',
    async (field) => {
      await request(app.getHttpServer())
        .post('/api/bank/settlement-evidence')
        .set('Authorization', `Bearer ${token()}`)
        .send(evidenceBody({ [field]: 'spoofed-or-sensitive' }))
        .expect(400);

      expect(evidenceWriter.appendHumanEvidence).not.toHaveBeenCalled();
    },
  );

  it.each([
    evidenceBody({ outcome: 'UNKNOWN' }),
    evidenceBody({ observedAt: 'not-a-date' }),
    evidenceBody({ evidenceReference: 'x'.repeat(513) }),
    evidenceBody({ evidenceHash: 'x'.repeat(129) }),
    evidenceBody({ idempotencyKey: 'x'.repeat(201) }),
  ])('rejects malformed or oversized evidence before service invocation', async (body) => {
    await request(app.getHttpServer())
      .post('/api/bank/settlement-evidence')
      .set('Authorization', `Bearer ${token()}`)
      .send(body)
      .expect(400);

    expect(evidenceWriter.appendHumanEvidence).not.toHaveBeenCalled();
  });

  it('maps authenticated finality intent without accepting status, tenant, or actor authority', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/bank/transactions/transaction-1/finality')
      .set('Authorization', `Bearer ${token()}`)
      .send(finalityBody())
      .expect(201);

    expect(transitionService.transition).toHaveBeenCalledWith({
      trustedTenantId: user.tenantId,
      actorUserId: user.id,
      transactionId: 'transaction-1',
      settlementEvidenceId: 'evidence-1',
      idempotencyKey: 'settlement-command-1',
    });
    expect(response.body).toMatchObject({
      status: 'TRANSITIONED',
      candidate: { candidateStatus: 'SETTLED' },
    });
  });

  it.each(['tenantId', 'actorUserId', 'currentStatus', 'outcome'])(
    'rejects finality mass-assignment field %s',
    async (field) => {
      await request(app.getHttpServer())
        .post('/api/bank/transactions/transaction-1/finality')
        .set('Authorization', `Bearer ${token()}`)
        .send(finalityBody({ [field]: 'spoofed' }))
        .expect(400);

      expect(transitionService.transition).not.toHaveBeenCalled();
    },
  );

  it('preserves deterministic authorization, not-found, and conflict HTTP mappings', async () => {
    evidenceWriter.appendHumanEvidence.mockRejectedValueOnce(
      new ForbiddenException({ code: 'SETTLEMENT_VERIFIER_PERMISSION_REQUIRED' }),
    );
    await request(app.getHttpServer())
      .post('/api/bank/settlement-evidence')
      .set('Authorization', `Bearer ${token()}`)
      .send(evidenceBody())
      .expect(403);

    transitionService.transition.mockRejectedValueOnce(
      new NotFoundException({ code: 'BANK_SETTLEMENT_CANDIDATE_NOT_FOUND' }),
    );
    await request(app.getHttpServer())
      .post('/api/bank/transactions/missing/finality')
      .set('Authorization', `Bearer ${token()}`)
      .send(finalityBody())
      .expect(404);

    transitionService.transition.mockRejectedValueOnce(
      new ConflictException({ code: 'BANK_SETTLEMENT_CANDIDATE_TRANSITION_CONFLICT' }),
    );
    await request(app.getHttpServer())
      .post('/api/bank/transactions/transaction-1/finality')
      .set('Authorization', `Bearer ${token()}`)
      .send(finalityBody())
      .expect(409);
  });
});
