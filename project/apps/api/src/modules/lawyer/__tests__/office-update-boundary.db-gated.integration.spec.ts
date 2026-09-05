import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { LawyerRank, Prisma, PrismaClient, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';

import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AuthService } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { OfficeF01AuthorizationGuard } from '../../office-approval/office-f01-authorization.guard';
import { StaffController } from '../../staff/staff.controller';
import { StaffService } from '../../staff/staff.service';
import { LawyerController } from '../lawyer.controller';
import { LawyerService } from '../lawyer.service';

// Only the repository's explicit test URL is considered. Never fall back to DATABASE_URL.
const TEST_DATABASE_URL = resolveTestDatabaseUrl(process.env);
if (TEST_DATABASE_URL) {
  const target = new URL(TEST_DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(target.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
    throw new Error('OFFICE_UPDATE_TEST_DATABASE_MUST_BE_LOCAL_POSTGRESQL');
  }
}
if (process.env.CI && !TEST_DATABASE_URL) {
  throw new Error('OFFICE_UPDATE_TEST_DATABASE_REQUIRED: CI requires TEST_DATABASE_URL');
}
const describeWithDatabase = TEST_DATABASE_URL ? describe : describe.skip;
const SECRET = 'office-update-boundary-local-test-secret-at-least-32-bytes';
const PASSWORD = 'OfficeBoundaryTest123!';
type ActorName = 'manager' | 'delegate' | 'partner' | 'admin' | 'staff';
type HttpMethod = 'put' | 'patch';
type ProfileKind = 'lawyers' | 'staff';

describeWithDatabase('Office update boundary: real HTTP, JWT, policy and PostgreSQL', () => {
  jest.setTimeout(60_000);
  let app: INestApplication;
  let prisma: PrismaClient;
  let jwt: JwtService;
  let auth: AuthService;
  let approval: OfficeApprovalService;
  let passwordHash: string;
  let tenantIds: string[] = [];
  let tenantSlug: string;
  let officeIds: string[];
  let actors: Record<ActorName, User>;
  let targetUser: User;
  let staffUser: User;
  let freeUser: User;
  let lawyerId: string;
  let staffId: string;
  let heldRead: {
    model: 'Lawyer' | 'StaffMember'; id: string; arrived: () => void; release: Promise<void>;
  } | undefined;
  let heldReplacementRead: { lawyerId: string; arrived: () => void; release: Promise<void> } | undefined;
  let transferTrace: {
    oldAssignmentId: string; replacementAssignmentId: string;
    demotionCompletedInTransaction: boolean; failureInTransaction: boolean; failureCode?: string;
  } | undefined;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
    // The race probe delays the result of a REAL database read. It never replaces rows,
    // transactions, writes, JWT authentication or policy decisions with mock outcomes.
    prisma.$use(async (params, next) => {
      const barrier = heldRead;
      const intercept = barrier && params.model === barrier.model && params.action === 'findFirst'
        && params.args?.where?.id === barrier.id;
      if (intercept) heldRead = undefined;
      const replacementBarrier = heldReplacementRead;
      const interceptReplacement = replacementBarrier && params.model === 'CaseLawyer'
        && params.action === 'findMany' && params.args?.where?.lawyerId === replacementBarrier.lawyerId;
      if (interceptReplacement) heldReplacementRead = undefined;
      const trace = transferTrace;
      try {
        const result = await next(params);
        if (trace && params.model === 'CaseLawyer' && params.action === 'update'
          && params.args?.where?.id === trace.oldAssignmentId && result.isResponsible === false) {
          trace.demotionCompletedInTransaction = params.runInTransaction;
        }
        if (intercept) {
          barrier.arrived();
          await barrier.release;
        }
        if (interceptReplacement) {
          replacementBarrier.arrived();
          await replacementBarrier.release;
        }
        return result;
      } catch (error) {
        if (trace && params.model === 'CaseLawyer' && params.action === 'update'
          && params.args?.where?.id === trace.replacementAssignmentId
          && error instanceof Prisma.PrismaClientKnownRequestError) {
          trace.failureCode = error.code;
          trace.failureInTransaction = params.runInTransaction;
        }
        throw error;
      }
    });
    await prisma.$connect();
    passwordHash = await bcrypt.hash(PASSWORD, 4);
    const audit = new AuditService(prisma as unknown as PrismaService);
    approval = new OfficeApprovalService(prisma as unknown as PrismaService, audit);
    const module = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: SECRET, signOptions: { expiresIn: '5m' } }),
      ],
      controllers: [LawyerController, StaffController],
      providers: [
        AuthService, JwtStrategy, JwtAuthGuard, OfficeF01AuthorizationGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: OfficeApprovalService, useValue: approval },
        { provide: LawyerService, useValue: new LawyerService(prisma as unknown as PrismaService, audit, approval) },
        { provide: StaffService, useValue: new StaffService(prisma as unknown as PrismaService, audit) },
        { provide: ConfigService, useValue: { get: (key: string, fallback?: unknown) => key === 'JWT_SECRET' ? SECRET : fallback } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
    jwt = module.get(JwtService);
    auth = module.get(AuthService);
  });

  beforeEach(async () => {
    const suffix = randomUUID();
    tenantIds = [];
    for (const side of ['a', 'b']) {
      const tenant = await prisma.tenant.create({ data: { name: `Office boundary ${side}`, slug: `office-boundary-${side}-${suffix}` } });
      tenantIds.push(tenant.id);
      if (side === 'a') tenantSlug = tenant.slug;
    }
    officeIds = [];
    for (const tenantId of tenantIds) {
      const office = await prisma.office.create({ data: { tenantId, name: 'Fixture office' } });
      officeIds.push(office.id);
    }
    const createUser = (name: string, role: UserRole = 'USER') => prisma.user.create({
      data: { tenantId: tenantIds[0], email: `${name}@example.test`, name, surname: suffix, role, passwordHash },
    });
    actors = {
      manager: await createUser('manager'), delegate: await createUser('delegate'),
      partner: await createUser('partner'), admin: await createUser('admin', 'ADMIN'), staff: await createUser('staff-actor'),
    };
    for (const [name, rank] of [['manager', 'MANAGER'], ['delegate', 'LAWYER'], ['partner', 'PARTNER']] as const) {
      await prisma.lawyer.create({ data: {
        tenantId: tenantIds[0], officeId: officeIds[0], userId: actors[name].id,
        name, surname: suffix, lawyerRank: rank as LawyerRank, canApproveOfficeActions: name === 'delegate',
      } });
    }
    await prisma.staffMember.create({ data: {
      tenantId: tenantIds[0], officeId: officeIds[0], userId: actors.staff.id,
      firstName: 'Staff actor', lastName: suffix, staffType: 'SEKRETER',
    } });
    targetUser = await createUser('target-lawyer');
    staffUser = await createUser('target-staff');
    freeUser = await createUser('unlinked-user');
    const target = await prisma.lawyer.create({ data: {
      tenantId: tenantIds[0], officeId: officeIds[0], userId: targetUser.id,
      name: 'Target', surname: 'Lawyer', phone: 'original-phone', tckn: '12345678901',
      canApproveOfficeActions: true, defaultPermissions: { canEditCase: true },
    } });
    lawyerId = target.id;
    const staff = await prisma.staffMember.create({ data: {
      tenantId: tenantIds[0], officeId: officeIds[0], userId: staffUser.id,
      firstName: 'Target', lastName: 'Staff', staffType: 'SEKRETER', phone: 'original-phone', tckn: '10987654321',
    } });
    staffId = staff.id;
  });

  afterEach(async () => {
    heldRead = undefined;
    heldReplacementRead = undefined;
    transferTrace = undefined;
    if (!prisma || tenantIds.length === 0) return;
    const where = { tenantId: { in: tenantIds } };
    // Only this test's generated fixture tenants are removed, including red-baseline
    // rows whose tenant/office link was changed by an otherwise valid ORM write.
    await prisma.auditLog.deleteMany({ where });
    await prisma.caseLawyer.deleteMany({ where: { case: where } });
    await prisma.case.deleteMany({ where });
    await prisma.lawyer.deleteMany({ where });
    await prisma.staffMember.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.office.deleteMany({ where });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    tenantIds = [];
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
  });

  function token(user: User): string {
    return jwt.sign({ sub: user.id, tenantId: user.tenantId, email: user.email, role: user.role, tokenVersion: user.tokenVersion });
  }

  function update(method: HttpMethod, kind: ProfileKind, actor: ActorName, body: Record<string, unknown>) {
    return request(app.getHttpServer())[method](`/api/${kind}/${kind === 'lawyers' ? lawyerId : staffId}`)
      .set('Authorization', `Bearer ${token(actors[actor])}`).send(body);
  }

  async function businessSnapshot() {
    const where = { tenantId: { in: tenantIds } };
    const orderBy = { id: 'asc' as const };
    return Promise.all([
      prisma.tenant.findMany({ where: { id: { in: tenantIds } }, orderBy }),
      prisma.office.findMany({ where, orderBy }), prisma.user.findMany({ where, orderBy }),
      prisma.lawyer.findMany({ where, orderBy }), prisma.staffMember.findMany({ where, orderBy }),
      prisma.case.findMany({ where, orderBy }), prisma.caseLawyer.findMany({ where: { case: where }, orderBy }),
    ]);
  }

  async function successfulMutationAudits() {
    return prisma.auditLog.findMany({ where: { tenantId: { in: tenantIds }, action: {
      in: ['LAWYER_OFFICE_APPROVAL_DELEGATION_CHANGED', 'LAWYER_DEACTIVATE', 'STAFF_DEACTIVATE'],
    } }, orderBy: { id: 'asc' } });
  }

  async function expectWholeRequestRejected(call: PromiseLike<request.Response>, status = 400) {
    const before = await businessSnapshot();
    const auditBefore = await successfulMutationAudits();
    const response = await call;
    const after = await businessSnapshot();
    const auditAfter = await successfulMutationAudits();
    // Business-row assertions are independent of security-denial audit entries.
    expect({ status: response.status, business: after, mutationAudits: auditAfter })
      .toEqual({ status, business: before, mutationAudits: auditBefore });
  }

  const limitedActors = ['manager', 'delegate'] as const;
  const methods = ['put', 'patch'] as const;
  const forbiddenWrites: { name: string; payload: () => Prisma.LawyerUpdateInput | Prisma.LawyerUncheckedUpdateInput }[] = [
    { name: 'nested User.role update', payload: () => ({ user: { update: { role: 'ADMIN' } } }) },
    { name: 'nested tenant connect', payload: () => ({ tenant: { connect: { id: tenantIds[1] } } }) },
    { name: 'nested office connect', payload: () => ({ office: { connect: { id: officeIds[1] } } }) },
    { name: 'nested User connect', payload: () => ({ user: { connect: { id: freeUser.id } } }) },
    { name: 'scalar tenantId', payload: () => ({ tenantId: tenantIds[1] }) },
    { name: 'scalar officeId', payload: () => ({ officeId: officeIds[1] }) },
    { name: 'scalar userId', payload: () => ({ userId: freeUser.id }) },
  ];
  for (const actor of limitedActors) {
    for (const method of methods) {
      for (const attempt of forbiddenWrites) {
        it(`${actor} ${method}: rejects ${attempt.name} with an allowed profile field atomically`, async () => {
          // The actor passes the REAL F01 policy and every FK target exists. These
          // are separately well-formed checked/unchecked Prisma inputs, not shapes
          // designed to fail ORM validation or non-existent-FK constraints.
          expect(await approval.isF01ActorAuthorized(actors[actor].id, tenantIds[0])).toBe(true);
          await expectWholeRequestRejected(update(method, 'lawyers', actor, { phone: 'must-not-write', ...attempt.payload() }));
        });
      }
    }
  }

  it.each(['id', 'tenantId', 'officeId', 'userId'] as const)('rejects even unchanged Lawyer %s metadata', async (key) => {
    const row = await prisma.lawyer.findUniqueOrThrow({ where: { id: lawyerId } });
    await expectWholeRequestRejected(update('put', 'lawyers', 'partner', { phone: 'must-not-write', [key]: row[key] }));
  });

  it('rejects an unknown field instead of partially applying a valid change', async () => {
    await expectWholeRequestRejected(update('put', 'lawyers', 'manager', { phone: 'must-not-write', unknownProfileField: 'no' }));
  });

  it('rejects a raw JSON root constructor key without partially updating the profile', async () => {
    // A raw JSON body keeps constructor as an own input key. Class transformation
    // must not silently remove it before the request-boundary rejection check.
    const raw = '{"phone":"must-not-write","constructor":{"prototype":{"unexpected":true}}}';
    expect(Object.prototype.hasOwnProperty.call(JSON.parse(raw), 'constructor')).toBe(true);
    await expectWholeRequestRejected(request(app.getHttpServer()).put(`/api/lawyers/${lawyerId}`)
      .set('Authorization', `Bearer ${token(actors.manager)}`).type('json').send(raw));
  });

  it('rejects a raw JSON root __proto__ key without partially updating the profile', async () => {
    // Object-literal __proto__ syntax changes the prototype instead of creating
    // the own JSON property this test needs; send the original JSON text.
    const raw = '{"phone":"must-not-write","__proto__":{"unexpected":true}}';
    expect(Object.prototype.hasOwnProperty.call(JSON.parse(raw), '__proto__')).toBe(true);
    await expectWholeRequestRejected(request(app.getHttpServer()).put(`/api/lawyers/${lawyerId}`)
      .set('Authorization', `Bearer ${token(actors.manager)}`).type('json').send(raw));
  });

  it('preserves the existing Prisma storage semantics for nested defaultPermissions JSON keys', async () => {
    const raw = '{"defaultPermissions":{"canEditCase":true,"constructor":{"label":"constructor-value"},"__proto__":{"label":"proto-value"}}}';
    const permissions = JSON.parse(raw).defaultPermissions as Prisma.InputJsonObject;
    // The existing service forwards this JSON to Prisma unchanged. Prisma 5.22
    // already drops the own __proto__ key during ORM serialization but retains
    // constructor. Characterize actual storage through SQL, not client decoding;
    // this boundary fix must not introduce a new ORM JSON-storage policy.
    const readStoredJson = () => prisma.$queryRaw<Array<{ permissionsText: string | null }>>`
      SELECT "defaultPermissions"::text AS "permissionsText" FROM "Lawyer" WHERE "id" = ${lawyerId}
    `;
    await prisma.lawyer.update({ where: { id: lawyerId }, data: { defaultPermissions: permissions } });
    const baselineStorage = await readStoredJson();
    expect(baselineStorage).toHaveLength(1);
    expect(baselineStorage[0].permissionsText).not.toBeNull();
    // Replace the baseline value so equality also proves the HTTP write happened.
    await prisma.lawyer.update({ where: { id: lawyerId }, data: { defaultPermissions: { canEditCase: false } } });
    await request(app.getHttpServer()).put(`/api/lawyers/${lawyerId}`)
      .set('Authorization', `Bearer ${token(actors.partner)}`).type('json').send(raw).expect(200);
    const actualStorage = await readStoredJson();
    expect(actualStorage).toEqual(baselineStorage);
    const storedPermissions: unknown = JSON.parse(actualStorage[0].permissionsText!);
    expect(Object.prototype.hasOwnProperty.call(storedPermissions, 'constructor')).toBe(true);
  });

  it('preserves the current Lawyer changed-field form and its transient confirmation field', async () => {
    await update('put', 'lawyers', 'manager', { phone: 'new-phone', email: '', address: null, confirmSimilarNameUpdate: false }).expect(200);
    const row = await prisma.lawyer.findUniqueOrThrow({ where: { id: lawyerId } });
    expect(row).toMatchObject({ phone: 'new-phone', email: '', address: null, isActive: true, userId: targetUser.id });
    expect(row.tckn).toBe('12345678901');
  });

  it('preserves the case-detail narrow PATCH including empty strings and a new IBAN', async () => {
    await update('patch', 'lawyers', 'delegate', {
      phone: 'patch-phone', email: '', address: '', bankName: '', branchName: '', iban: 'TR330006100519786457841326',
    }).expect(200);
    expect(await prisma.lawyer.findUniqueOrThrow({ where: { id: lawyerId } }))
      .toMatchObject({ phone: 'patch-phone', email: '', bankName: '', iban: 'TR330006100519786457841326' });
  });

  it('keeps PATCH narrower than PUT', async () => {
    await expectWholeRequestRejected(update('patch', 'lawyers', 'partner', { name: 'not-a-patch-field' }));
  });

  it('preserves Staff full-form echoes, masked TCKN and inert metadata passthrough', async () => {
    const before = await prisma.staffMember.findUniqueOrThrow({ where: { id: staffId } });
    await update('put', 'staff', 'manager', {
      firstName: 'Target', lastName: 'Staff', tckn: '109*****321', email: '', phone: 'staff-new-phone',
      mobilePhone: '', whatsappPhone: '', staffType: 'SEKRETER', canCreateCase: false, canEditCase: false,
      canGenerateDocuments: false, canApproveDocuments: false, canSeeFinance: false, canApproveFinance: false,
      canPrepareCollectionDisposition: false, isDefaultForNewCases: false, confirmSimilarNameUpdate: false,
      id: 'ignored-id', tenantId: tenantIds[1], officeId: officeIds[1], userId: freeUser.id,
      user: { update: { role: 'ADMIN' } }, createdAt: 'ignored', updatedAt: 'ignored', caseAssignments: [],
    }).expect(200);
    const after = await prisma.staffMember.findUniqueOrThrow({ where: { id: staffId } });
    expect(after).toMatchObject({ id: before.id, tenantId: before.tenantId, officeId: before.officeId,
      userId: before.userId, createdAt: before.createdAt, phone: 'staff-new-phone', tckn: before.tckn });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: staffUser.id } })).toEqual(staffUser);
  });

  it.each(['lawyers', 'staff'] as const)('preserves the default-selection update for %s', async (kind) => {
    await update('put', kind, 'manager', { isDefaultForNewCases: true }).expect(200);
    const row = kind === 'lawyers'
      ? await prisma.lawyer.findUniqueOrThrow({ where: { id: lawyerId } })
      : await prisma.staffMember.findUniqueOrThrow({ where: { id: staffId } });
    expect(row.isDefaultForNewCases).toBe(true);
  });

  it.each(['lawyerRank', 'defaultPermissions', 'permissionsLocked', 'canModifyOtherPermissions'] as const)
  ('keeps the privileged presence guard even for unchanged %s', async (field) => {
    const existing = await prisma.lawyer.findUniqueOrThrow({ where: { id: lawyerId } });
    await expectWholeRequestRejected(update('put', 'lawyers', 'manager', { phone: 'must-not-write', [field]: existing[field] }), 403);
    await expectWholeRequestRejected(update('put', 'lawyers', 'delegate', { phone: 'must-not-write', [field]: existing[field] }), 403);
  });

  it.each(['admin', 'partner'] as const)('preserves %s privileged writes and structured permission JSON', async (actor) => {
    await update('put', 'lawyers', actor, { defaultPermissions: { canEditCase: false, canGenerateDocs: true }, lawyerRank: 'MANAGER' }).expect(200);
    expect(await prisma.lawyer.findUniqueOrThrow({ where: { id: lawyerId } }))
      .toMatchObject({ lawyerRank: 'MANAGER', defaultPermissions: { canEditCase: false, canGenerateDocs: true } });
  });

  it('preserves nullable defaultPermissions for an authorized profile editor', async () => {
    await update('put', 'lawyers', 'admin', { defaultPermissions: null }).expect(200);
    expect((await prisma.lawyer.findUniqueOrThrow({ where: { id: lawyerId } })).defaultPermissions).toBeNull();
    const stored = await prisma.$queryRaw<{ sqlNull: boolean; jsonText: string }[]>(Prisma.sql`
      SELECT "defaultPermissions" IS NULL AS "sqlNull", "defaultPermissions"::text AS "jsonText"
      FROM "Lawyer" WHERE id = ${lawyerId}
    `);
    expect(stored).toEqual([{ sqlNull: false, jsonText: 'null' }]);
  });

  it('accepts unchanged delegation but preserves change authority and successful audit', async () => {
    await update('patch', 'lawyers', 'manager', { phone: 'delegation-echo', canApproveOfficeActions: true }).expect(200);
    expect(await successfulMutationAudits()).toEqual([]);
    await expectWholeRequestRejected(update('patch', 'lawyers', 'manager', { canApproveOfficeActions: false }), 403);
    await update('patch', 'lawyers', 'partner', { canApproveOfficeActions: false }).expect(200);
    expect(await successfulMutationAudits()).toEqual([expect.objectContaining({ action: 'LAWYER_OFFICE_APPROVAL_DELEGATION_CHANGED' })]);
  });

  it('keeps Staff actors outside F01 profile mutation authority', async () => {
    await expectWholeRequestRejected(update('put', 'lawyers', 'staff', { phone: 'must-not-write' }), 403);
    await expectWholeRequestRejected(update('put', 'staff', 'staff', { phone: 'must-not-write' }), 403);
  });

  for (const [kind, method] of [['lawyers', 'put'], ['lawyers', 'patch'], ['staff', 'put']] as const) {
    it(`${kind} ${method}: accepts omitted and identical true/false isActive without account writes`, async () => {
      await update(method, kind, 'manager', { phone: 'omitted' }).expect(200);
      await update(method, kind, 'manager', { phone: 'same-true', isActive: true }).expect(200);
      if (kind === 'lawyers') await prisma.lawyer.update({ where: { id: lawyerId }, data: { isActive: false } });
      else await prisma.staffMember.update({ where: { id: staffId }, data: { isActive: false } });
      // Profile and account states are intentionally distinct; generic updates may
      // edit an inactive profile and must not mirror that flag into UserAccount.
      await update(method, kind, 'manager', { phone: 'same-false', isActive: false }).expect(200);
      const user = kind === 'lawyers' ? targetUser : staffUser;
      expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(user);
    });

    for (const value of [null, 'false', 0, 1, { set: true }, { set: false }]) {
      it(`${kind} ${method}: rejects non-boolean isActive ${JSON.stringify(value)} atomically`, async () => {
        await expectWholeRequestRejected(update(method, kind, 'manager', { phone: 'must-not-write', isActive: value }));
      });
    }

    it(`${kind} ${method}: rejects both genuine transitions before profile writes`, async () => {
      await expectWholeRequestRejected(update(method, kind, 'partner', { phone: 'must-not-write', isActive: false }));
      if (kind === 'lawyers') await prisma.lawyer.update({ where: { id: lawyerId }, data: { isActive: false } });
      else await prisma.staffMember.update({ where: { id: staffId }, data: { isActive: false } });
      await expectWholeRequestRejected(update(method, kind, 'partner', { phone: 'must-not-write', isActive: true }));
    });
  }

  it('rejects a lifecycle transition before an otherwise authorized delegation write or success audit', async () => {
    await expectWholeRequestRejected(update('put', 'lawyers', 'partner', {
      phone: 'must-not-write', canApproveOfficeActions: false, isActive: false,
    }));
  });

  it.each(['lawyers', 'staff'] as const)('%s: a held stale true echo cannot reactivate after real DELETE', async (kind) => {
    const user = kind === 'lawyers' ? targetUser : staffUser;
    const loginBefore = await auth.login({ tenantSlug, email: user.email, password: PASSWORD });
    await request(app.getHttpServer()).get('/api/staff').set('Authorization', `Bearer ${loginBefore.token}`).expect(200);
    expect(await approval.isApproverEligible(user.id, tenantIds[0])).toBe(kind === 'lawyers');
    let announceRead!: () => void;
    let releaseRead!: () => void;
    const readArrived = new Promise<void>((resolve) => { announceRead = resolve; });
    const release = new Promise<void>((resolve) => { releaseRead = resolve; });
    heldRead = { model: kind === 'lawyers' ? 'Lawyer' : 'StaffMember', id: kind === 'lawyers' ? lawyerId : staffId, arrived: announceRead, release };
    const pendingUpdate = update('put', kind, 'manager', { phone: 'concurrent-profile-edit', isActive: true }).then((response) => response);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([readArrived, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Real profile-read barrier was not reached')), 10_000);
      })]);
      if (timer) clearTimeout(timer);
      await request(app.getHttpServer()).delete(`/api/${kind}/${kind === 'lawyers' ? lawyerId : staffId}`)
        .set('Authorization', `Bearer ${token(actors.partner)}`).expect(200);
    } finally {
      if (timer) clearTimeout(timer);
      heldRead = undefined;
      releaseRead();
      // Even a failed DELETE assertion must not leave a request writing while
      // afterEach removes this test's fixture rows.
      await pendingUpdate;
    }
    const response = await pendingUpdate;
    expect(response.status).toBe(200);
    const profile = kind === 'lawyers'
      ? await prisma.lawyer.findUniqueOrThrow({ where: { id: lawyerId } })
      : await prisma.staffMember.findUniqueOrThrow({ where: { id: staffId } });
    expect(profile).toMatchObject({ phone: 'concurrent-profile-edit', isActive: false });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ isActive: false, tokenVersion: user.tokenVersion });
    await request(app.getHttpServer()).get('/api/staff').set('Authorization', `Bearer ${loginBefore.token}`).expect(401);
    await expect(auth.login({ tenantSlug, email: user.email, password: PASSWORD })).rejects.toMatchObject({ status: 401 });
    expect(await approval.isApproverEligible(user.id, tenantIds[0])).toBe(false);
    expect((await successfulMutationAudits()).map((entry) => entry.action))
      .toEqual([kind === 'lawyers' ? 'LAWYER_DEACTIVATE' : 'STAFF_DEACTIVATE']);
  });

  async function createResponsibilityFixture() {
    const legalCase = await prisma.case.create({ data: {
      tenantId: tenantIds[0], fileNumber: `office-transfer-${randomUUID()}`, type: 'GENERAL_EXECUTION',
    } });
    const replacement = await prisma.lawyer.findUniqueOrThrow({ where: { userId: actors.delegate.id } });
    const oldAssignment = await prisma.caseLawyer.create({ data: {
      caseId: legalCase.id, lawyerId, role: 'RESPONSIBLE', isResponsible: true,
    } });
    const replacementAssignment = await prisma.caseLawyer.create({ data: {
      caseId: legalCase.id, lawyerId: replacement.id, role: 'ASSIGNED', isResponsible: false,
    } });
    return { legalCase, replacement, oldAssignment, replacementAssignment };
  }

  function deactivateLawyer(actor: ActorName, replacementLawyerId?: string) {
    return request(app.getHttpServer()).delete(`/api/lawyers/${lawyerId}`)
      .set('Authorization', `Bearer ${token(actors[actor])}`)
      .send(replacementLawyerId ? { replacementLawyerId } : {});
  }

  it('preserves real DELETE authority and the required responsibility replacement', async () => {
    const fixture = await createResponsibilityFixture();
    await expectWholeRequestRejected(deactivateLawyer('admin', fixture.replacement.id), 403);
    await expectWholeRequestRejected(deactivateLawyer('manager', fixture.replacement.id), 403);
    await expectWholeRequestRejected(deactivateLawyer('partner'), 400);
  });

  it('commits an authorized responsibility transfer with linked-account deactivation and both audits', async () => {
    const fixture = await createResponsibilityFixture();
    await deactivateLawyer('partner', fixture.replacement.id).expect(200);
    expect(await prisma.lawyer.findUniqueOrThrow({ where: { id: lawyerId } })).toMatchObject({ isActive: false });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: targetUser.id } })).toMatchObject({ isActive: false });
    expect(await prisma.lawyer.findUniqueOrThrow({ where: { id: fixture.replacement.id } })).toEqual(fixture.replacement);
    expect(await prisma.caseLawyer.findUniqueOrThrow({ where: { id: fixture.oldAssignment.id } }))
      .toMatchObject({ role: 'ASSIGNED', isResponsible: false });
    expect(await prisma.caseLawyer.findUniqueOrThrow({ where: { id: fixture.replacementAssignment.id } }))
      .toMatchObject({ role: 'RESPONSIBLE', isResponsible: true });
    expect(await prisma.caseLawyer.count({ where: { caseId: fixture.legalCase.id, isResponsible: true } })).toBe(1);
    expect(await prisma.case.findUniqueOrThrow({ where: { id: fixture.legalCase.id } })).toEqual(fixture.legalCase);
    const audits = await prisma.auditLog.findMany({ where: { tenantId: tenantIds[0] } });
    expect(audits).toHaveLength(2);
    expect(audits).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'UPDATE', entityType: 'CASE_LAWYER', entityId: fixture.replacementAssignment.id,
        metadata: expect.objectContaining({ source: 'LAWYER_DEACTIVATE_TRANSFER', previousLawyerId: lawyerId, newLawyerId: fixture.replacement.id }) }),
      expect.objectContaining({ action: 'LAWYER_DEACTIVATE', entityType: 'LAWYER', entityId: lawyerId }),
    ]));
  });

  it('rolls back real transaction writes when a validated replacement assignment disappears before transfer', async () => {
    const fixture = await createResponsibilityFixture();
    let announceRead!: () => void;
    let releaseRead!: () => void;
    const readArrived = new Promise<void>((resolve) => { announceRead = resolve; });
    const release = new Promise<void>((resolve) => { releaseRead = resolve; });
    heldReplacementRead = { lawyerId: fixture.replacement.id, arrived: announceRead, release };
    transferTrace = {
      oldAssignmentId: fixture.oldAssignment.id, replacementAssignmentId: fixture.replacementAssignment.id,
      demotionCompletedInTransaction: false, failureInTransaction: false,
    };
    const pendingDelete = deactivateLawyer('partner', fixture.replacement.id).then((response) => response);
    let before: Awaited<ReturnType<typeof businessSnapshot>> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([readArrived, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Real replacement-assignment read barrier was not reached')), 10_000);
      })]);
      if (timer) clearTimeout(timer);
      // A separate, committed DB operation removes the assignment AFTER its
      // existence was actually read. No query/transaction outcome is mocked.
      // The subsequent real tx demotes the old assignment, then PostgreSQL-backed
      // Prisma update raises P2025 for the disappeared replacement assignment.
      await prisma.caseLawyer.delete({ where: { id: fixture.replacementAssignment.id } });
      before = await businessSnapshot();
    } finally {
      if (timer) clearTimeout(timer);
      heldReplacementRead = undefined;
      releaseRead();
      await pendingDelete;
    }
    expect((await pendingDelete).status).toBe(500);
    expect(transferTrace).toMatchObject({ demotionCompletedInTransaction: true, failureInTransaction: true, failureCode: 'P2025' });
    // Baseline is AFTER the deliberate competing write. Everything attempted by
    // DELETE (profile, account, old responsibility and audit) must be rolled back.
    expect(await businessSnapshot()).toEqual(before);
    expect(await prisma.auditLog.findMany({ where: { tenantId: tenantIds[0] } })).toEqual([]);
    expect(await prisma.caseLawyer.findUniqueOrThrow({ where: { id: fixture.oldAssignment.id } }))
      .toEqual(fixture.oldAssignment);
  });
});
