import 'reflect-metadata';
import { ConflictException, ForbiddenException, INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
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
import { AccountingJournalReversalController } from '../accounting-journal-reversal.controller';
import { AccountingJournalReversalService } from '../accounting-journal-reversal.service';

jest.mock('../../auth/auth.service', () => ({
  AuthService: class AuthService {},
}));

const JWT_SECRET = 'acct-1r-2b-reversal-http-smoke-secret';

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
    reason: 'Yanlis muhasebe kaydini ters cevirme',
    evidenceRef: 'EV-1',
    ...overrides,
  };
}

function successResult(status: 'CREATED' | 'REPLAYED' = 'CREATED') {
  return {
    status,
    originalJournalEntryId: 'journal-original-1',
    reversalJournalEntryId: 'journal-reversal-1',
    idempotencyKey: 'journal-reversal-key',
    sourceVersion: '2026-06-30T08:00:00.000Z:journal-original-1:reversal',
    lineCount: 2,
  };
}

function classGuards(): any[] {
  return Reflect.getMetadata(GUARDS_METADATA, AccountingJournalReversalController) || [];
}

function methodGuards(): any[] {
  return Reflect.getMetadata(GUARDS_METADATA, AccountingJournalReversalController.prototype.reverseEntry) || [];
}

function cpeActionCode(): ActionCode | undefined {
  return Reflect.getMetadata(CPE_ACTION_CODE_KEY, AccountingJournalReversalController.prototype.reverseEntry);
}

describe('AccountingJournalReversalController HTTP smoke', () => {
  let app: INestApplication;
  let service: { reverseEntry: jest.Mock };
  const partnerToken = signToken(users.partner);
  const plainUserToken = signToken(users.plainUser);

  beforeAll(async () => {
    service = {
      reverseEntry: jest.fn(async () => successResult()),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [AccountingJournalReversalController],
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
        { provide: AccountingJournalReversalService, useValue: service },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    service.reverseEntry.mockReset();
    service.reverseEntry.mockResolvedValue(successResult());
  });

  it('guard metadata: class uses JwtAuthGuard, endpoint has no AdminGuard, and CPE action metadata is present', () => {
    expect(classGuards()).toContain(JwtAuthGuard);
    expect(methodGuards()).not.toContain(AdminGuard);
    expect(cpeActionCode()).toBe(ActionCode.ACCOUNTING_JOURNAL_REVERSE);
  });

  it('JWT yoksa 401 doner ve reversal service cagrilmaz', async () => {
    await request(app.getHttpServer())
      .post('/accounting-journal/entries/journal-original-1/reverse')
      .send(validBody())
      .expect(401);

    expect(service.reverseEntry).not.toHaveBeenCalled();
  });

  it('service-level office-admin gate 403 dondurdugunde controller bunu boundary olarak tasir', async () => {
    service.reverseEntry.mockRejectedValueOnce(
      new ForbiddenException({ code: 'ACCOUNTING_JOURNAL_REVERSAL_FORBIDDEN' }),
    );

    await request(app.getHttpServer())
      .post('/accounting-journal/entries/journal-original-1/reverse')
      .set('Authorization', `Bearer ${plainUserToken}`)
      .send(validBody())
      .expect(403);

    expect(service.reverseEntry).toHaveBeenCalledWith('tenant-auth', 'plain-user', 'journal-original-1', {
      reason: 'Yanlis muhasebe kaydini ters cevirme',
      evidenceRef: 'EV-1',
    });
  });

  it('auth context kazanir: tenantId ve actorUserId body spoof alanlarindan alinmaz', async () => {
    await request(app.getHttpServer())
      .post('/accounting-journal/entries/journal-original-1/reverse')
      .set('Authorization', `Bearer ${partnerToken}`)
      .send(validBody({ tenantId: 'tenant-spoof', actorUserId: 'actor-spoof' }))
      .expect(201);

    expect(service.reverseEntry).toHaveBeenCalledWith('tenant-auth', 'partner-user', 'journal-original-1', {
      reason: 'Yanlis muhasebe kaydini ters cevirme',
      evidenceRef: 'EV-1',
    });
    expect(JSON.stringify(service.reverseEntry.mock.calls[0])).not.toContain('tenant-spoof');
    expect(JSON.stringify(service.reverseEntry.mock.calls[0])).not.toContain('actor-spoof');
  });

  it('success response service contract temel alanlarini tasir', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounting-journal/entries/journal-original-1/reverse')
      .set('Authorization', `Bearer ${partnerToken}`)
      .send(validBody())
      .expect(201);

    expect(response.body).toEqual(successResult('CREATED'));
  });

  it('replay response service contract temel alanlarini tasir', async () => {
    service.reverseEntry.mockResolvedValueOnce(successResult('REPLAYED'));

    const response = await request(app.getHttpServer())
      .post('/accounting-journal/entries/journal-original-1/reverse')
      .set('Authorization', `Bearer ${partnerToken}`)
      .send(validBody())
      .expect(201);

    expect(response.body).toEqual(successResult('REPLAYED'));
  });

  it('original not found service path 404 olarak doner', async () => {
    service.reverseEntry.mockRejectedValueOnce(
      new NotFoundException({ code: 'ACCOUNTING_JOURNAL_REVERSAL_ORIGINAL_NOT_FOUND' }),
    );

    await request(app.getHttpServer())
      .post('/accounting-journal/entries/missing-entry/reverse')
      .set('Authorization', `Bearer ${partnerToken}`)
      .send(validBody())
      .expect(404);
  });

  it('writer/business conflict service path 409 olarak doner', async () => {
    service.reverseEntry.mockRejectedValueOnce(
      new ConflictException({ code: 'REVERSAL_ALREADY_EXISTS' }),
    );

    await request(app.getHttpServer())
      .post('/accounting-journal/entries/journal-original-1/reverse')
      .set('Authorization', `Bearer ${partnerToken}`)
      .send(validBody())
      .expect(409);
  });

  it('missing required reason 400 doner ve reversal service cagrilmaz', async () => {
    await request(app.getHttpServer())
      .post('/accounting-journal/entries/journal-original-1/reverse')
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ evidenceRef: 'EV-1' })
      .expect(400);

    expect(service.reverseEntry).not.toHaveBeenCalled();
  });
});