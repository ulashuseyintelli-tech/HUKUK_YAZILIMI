import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaClient } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';

import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { AuditService } from '../../audit/audit.service';
import { AuthController } from '../../auth/auth.controller';
import { AuthService } from '../../auth/auth.service';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { LoginRateLimitGuard } from '../../auth/guards/login-rate-limit.guard';
import { OfficeForgotPasswordRateLimitGuard } from '../../auth/guards/office-forgot-password-rate-limit.guard';
import { OfficeResetPasswordRateLimitGuard } from '../../auth/guards/office-reset-password-rate-limit.guard';
import { PasswordResetController } from '../../auth/password-reset/password-reset.controller';
import { PasswordResetService } from '../../auth/password-reset/password-reset.service';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { LawyerController } from '../../lawyer/lawyer.controller';
import { LawyerService } from '../../lawyer/lawyer.service';
import { OfficeApprovalController } from '../../office-approval/office-approval.controller';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { OfficeApprovalShadowService } from '../../office-approval/office-approval-shadow.service';
import { OfficeF01AuthorizationGuard } from '../../office-approval/office-f01-authorization.guard';
import { GuidedOpenObserveService } from '../../permission-diagnostics/guided-open-observe.service';
import { ActionCode } from '../../policy-engine/types/action-code.enum';
import { ReportingLineController } from '../../reporting-line/reporting-line.controller';
import { ReportingLineService } from '../../reporting-line/reporting-line.service';
import { StaffController } from '../../staff/staff.controller';
import { StaffService } from '../../staff/staff.service';
import {
  dryRunIdentityBinding,
  type BindingInputRecord,
  type RepositorySnapshot,
} from '../../../scripts/office-cap02-identity-binding-dry-run.core';
import { OfficeController } from '../office.controller';
import { OfficeService } from '../office.service';

const TEST_DATABASE_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DATABASE_URL) {
  throw new Error('OFFICE_E2E_DATABASE_REQUIRED: CI requires TEST_DATABASE_URL');
}
const describeWithDisposableDatabase = TEST_DATABASE_URL ? describe : describe.skip;
const JWT_SECRET = 'office-e2e-controlled-secret-at-least-32-bytes';
const PASSWORD = 'OfficeE2e!12345';
const NEW_PASSWORD = 'OfficeE2e!67890';

interface Fixture {
  tenantAId: string;
  tenantASlug: string;
  tenantBId: string;
  tenantBSlug: string;
  adminAId: string;
  adminBId: string;
  adminAToken: string;
  adminBToken: string;
  partnerUserId: string;
  partnerToken: string;
  partnerLawyerId: string;
  plainUserId: string;
  plainToken: string;
  plainLawyerId: string;
  staffUserId: string;
  staffMemberId: string;
  recoveryUserId: string;
  unboundLawyerId: string;
  unboundStaffId: string;
  inactiveLawyerUserId: string;
  inactiveLawyerId: string;
  inactiveStaffUserId: string;
  inactiveStaffId: string;
  officeAId: string;
  sharedEmail: string;
}

describeWithDisposableDatabase('OFFICE E2E A-J - controlled Nest HTTP and disposable PostgreSQL', () => {
  jest.setTimeout(120_000);

  let app: INestApplication;
  let prisma: PrismaClient;
  let jwt: JwtService;
  let audit: AuditService;
  let authService: AuthService;
  let officeApproval: OfficeApprovalService;
  let officeApprovalShadow: OfficeApprovalShadowService;
  let fixture: Fixture;
  let passwordRecoveryEnabled = false;
  let approvalGate = '';
  let lastEmailText = '';
  let lifecycleLawyerId = '';
  let lifecycleStaffId = '';
  let enforcedRequestId = '';

  const config = {
    get: (key: string, defaultValue?: unknown) => {
      if (key === 'JWT_SECRET') return JWT_SECRET;
      if (key === 'OFFICE_PASSWORD_RECOVERY_ENABLED') {
        return passwordRecoveryEnabled ? 'true' : 'false';
      }
      if (key === 'OFFICE_APPROVAL_CHANGE_STATUS_GATE') return approvalGate;
      if (key === 'WEB_BASE_URL') return 'https://office-e2e.invalid';
      return defaultValue;
    },
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
    await prisma.$connect();
    audit = new AuditService(prisma as never);
    authService = new AuthService(prisma as never, new JwtService({ secret: JWT_SECRET }));
    officeApproval = new OfficeApprovalService(prisma as never, audit);
    const officeService = new OfficeService(prisma as never, audit, officeApproval);
    const lawyerService = new LawyerService(prisma as never, audit, officeApproval);
    const staffService = new StaffService(prisma as never, audit);
    const reportingLineService = new ReportingLineService(prisma as never, audit);
    const emailProvider = {
      send: jest.fn(async (options: { text?: string }) => {
        lastEmailText = options.text ?? '';
        return { success: true, provider: 'office-e2e' };
      }),
    };
    const passwordReset = new PasswordResetService(
      prisma as never,
      audit,
      emailProvider as never,
      config as ConfigService,
    );
    officeApprovalShadow = new OfficeApprovalShadowService(
      config as ConfigService,
      prisma as never,
      audit,
      officeApproval,
    );

    const allowGuard = { canActivate: () => true };
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '10m' } }),
      ],
      controllers: [
        AuthController,
        PasswordResetController,
        LawyerController,
        StaffController,
        ReportingLineController,
        OfficeApprovalController,
        OfficeController,
      ],
      providers: [
        JwtStrategy,
        JwtAuthGuard,
        AdminGuard,
        OfficeF01AuthorizationGuard,
        { provide: ConfigService, useValue: config },
        { provide: AuthService, useValue: authService },
        { provide: PasswordResetService, useValue: passwordReset },
        { provide: LawyerService, useValue: lawyerService },
        { provide: StaffService, useValue: staffService },
        { provide: ReportingLineService, useValue: reportingLineService },
        { provide: OfficeApprovalService, useValue: officeApproval },
        { provide: OfficeService, useValue: officeService },
        { provide: GuidedOpenObserveService, useValue: {} },
        { provide: LoginRateLimitGuard, useValue: allowGuard },
        { provide: OfficeForgotPasswordRateLimitGuard, useValue: allowGuard },
        { provide: OfficeResetPasswordRateLimitGuard, useValue: allowGuard },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useLogger(false);
    app.setGlobalPrefix('api');
    await app.init();
    jwt = module.get(JwtService);
    fixture = await createFixture();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
  });

  async function createFixture(): Promise<Fixture> {
    const suffix = randomUUID();
    const sharedEmail = `office-e2e-${suffix}@example.test`;
    const registeredA = await authService.register({
      firmName: `Office E2E A ${suffix}`,
      name: 'Office',
      surname: 'Admin A',
      email: sharedEmail,
      password: PASSWORD,
    });
    const registeredB = await authService.register({
      firmName: `Office E2E B ${suffix}`,
      name: 'Office',
      surname: 'Admin B',
      email: sharedEmail,
      password: PASSWORD,
    });
    const officeA = await prisma.office.create({
      data: { tenantId: registeredA.tenant.id, name: 'Synthetic Office A' },
    });
    const passwordHash = await bcrypt.hash(PASSWORD, 4);

    const partnerUser = await prisma.user.create({
      data: {
        tenantId: registeredA.tenant.id,
        email: `partner-${suffix}@example.test`,
        passwordHash,
        name: 'Ada',
        surname: 'Partner',
        role: 'USER',
      },
    });
    const partnerLawyer = await prisma.lawyer.create({
      data: {
        tenantId: registeredA.tenant.id,
        officeId: officeA.id,
        userId: partnerUser.id,
        name: 'Ada',
        surname: 'Partner',
        lawyerRank: 'PARTNER',
        uyapUsername: 'partner-uyap-user',
        uyapToken: 'must-never-leave-the-api',
        eSignatureSerial: 'must-never-leave-the-api-e-sign',
      },
    });
    const plainUser = await prisma.user.create({
      data: {
        tenantId: registeredA.tenant.id,
        email: `lawyer-${suffix}@example.test`,
        passwordHash,
        name: 'Grace',
        surname: 'Lawyer',
        role: 'USER',
      },
    });
    const plainLawyer = await prisma.lawyer.create({
      data: {
        tenantId: registeredA.tenant.id,
        officeId: officeA.id,
        userId: plainUser.id,
        name: 'Grace',
        surname: 'Lawyer',
        lawyerRank: 'LAWYER',
      },
    });
    const staffUser = await prisma.user.create({
      data: {
        tenantId: registeredA.tenant.id,
        email: `staff-${suffix}@example.test`,
        passwordHash,
        name: 'Linus',
        surname: 'Staff',
        role: 'USER',
      },
    });
    const staffMember = await prisma.staffMember.create({
      data: {
        tenantId: registeredA.tenant.id,
        officeId: officeA.id,
        userId: staffUser.id,
        firstName: 'Linus',
        lastName: 'Staff',
        staffType: 'DIGER',
      },
    });
    const recoveryUser = await prisma.user.create({
      data: {
        tenantId: registeredA.tenant.id,
        email: `recovery-${suffix}@example.test`,
        passwordHash,
        name: 'Recovery',
        surname: 'User',
        role: 'USER',
      },
    });
    const unboundLawyer = await prisma.lawyer.create({
      data: {
        tenantId: registeredA.tenant.id,
        officeId: officeA.id,
        name: 'Unbound',
        surname: 'Lawyer',
      },
    });
    const unboundStaff = await prisma.staffMember.create({
      data: {
        tenantId: registeredA.tenant.id,
        officeId: officeA.id,
        firstName: 'Unbound',
        lastName: 'Staff',
        staffType: 'DIGER',
      },
    });
    const inactiveLawyerUser = await prisma.user.create({
      data: {
        tenantId: registeredA.tenant.id,
        email: `inactive-lawyer-${suffix}@example.test`,
        passwordHash,
        name: 'Inactive',
        surname: 'Lawyer',
        role: 'USER',
      },
    });
    const inactiveLawyer = await prisma.lawyer.create({
      data: {
        tenantId: registeredA.tenant.id,
        officeId: officeA.id,
        userId: inactiveLawyerUser.id,
        name: 'Inactive',
        surname: 'Lawyer',
      },
    });
    const inactiveStaffUser = await prisma.user.create({
      data: {
        tenantId: registeredA.tenant.id,
        email: `inactive-staff-${suffix}@example.test`,
        passwordHash,
        name: 'Inactive',
        surname: 'Staff',
        role: 'USER',
      },
    });
    const inactiveStaff = await prisma.staffMember.create({
      data: {
        tenantId: registeredA.tenant.id,
        officeId: officeA.id,
        userId: inactiveStaffUser.id,
        firstName: 'Inactive',
        lastName: 'Staff',
        staffType: 'DIGER',
      },
    });

    const adminLogin = await authService.login({
      email: sharedEmail,
      password: PASSWORD,
      tenantSlug: registeredA.tenant.slug,
    });
    const adminBLogin = await authService.login({
      email: sharedEmail,
      password: PASSWORD,
      tenantSlug: registeredB.tenant.slug,
    });
    const partnerLogin = await authService.login({
      email: partnerUser.email,
      password: PASSWORD,
      tenantSlug: registeredA.tenant.slug,
    });
    const plainLogin = await authService.login({
      email: plainUser.email,
      password: PASSWORD,
      tenantSlug: registeredA.tenant.slug,
    });

    return {
      tenantAId: registeredA.tenant.id,
      tenantASlug: registeredA.tenant.slug,
      tenantBId: registeredB.tenant.id,
      tenantBSlug: registeredB.tenant.slug,
      adminAId: registeredA.user.id,
      adminBId: registeredB.user.id,
      adminAToken: adminLogin.token,
      adminBToken: adminBLogin.token,
      partnerUserId: partnerUser.id,
      partnerToken: partnerLogin.token,
      partnerLawyerId: partnerLawyer.id,
      plainUserId: plainUser.id,
      plainToken: plainLogin.token,
      plainLawyerId: plainLawyer.id,
      staffUserId: staffUser.id,
      staffMemberId: staffMember.id,
      recoveryUserId: recoveryUser.id,
      unboundLawyerId: unboundLawyer.id,
      unboundStaffId: unboundStaff.id,
      inactiveLawyerUserId: inactiveLawyerUser.id,
      inactiveLawyerId: inactiveLawyer.id,
      inactiveStaffUserId: inactiveStaffUser.id,
      inactiveStaffId: inactiveStaff.id,
      officeAId: officeA.id,
      sharedEmail,
    };
  }

  const authorization = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('A - tenant-aware login authenticates the selected tenant and rejects tenant substitution', async () => {
    const loginA = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: fixture.sharedEmail, password: PASSWORD, tenantSlug: fixture.tenantASlug })
      .expect(201);
    expect(loginA.body.user).toMatchObject({ id: fixture.adminAId, tenantId: fixture.tenantAId });

    const loginB = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: fixture.sharedEmail, password: PASSWORD, tenantSlug: fixture.tenantBSlug })
      .expect(201);
    expect(loginB.body.user).toMatchObject({ id: fixture.adminBId, tenantId: fixture.tenantBId });

    const forgedTenantClaim = jwt.sign({
      sub: fixture.adminAId,
      tenantId: fixture.tenantBId,
      email: fixture.sharedEmail,
      role: 'ADMIN',
      tokenVersion: 0,
    });
    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set(authorization(forgedTenantClaim))
      .expect(200);
    expect(me.body.user.tenantId).toBe(fixture.tenantAId);
  });

  it('B - Lawyer and Staff HTTP lifecycles create, list, and soft-deactivate records', async () => {
    const lawyer = await request(app.getHttpServer())
      .post('/api/lawyers')
      .set(authorization(fixture.adminAToken))
      .send({ name: 'Lifecycle', surname: 'Lawyer', barNumber: randomUUID() })
      .expect(201);
    lifecycleLawyerId = lawyer.body.id;
    expect(lifecycleLawyerId).toBeTruthy();

    const staff = await request(app.getHttpServer())
      .post('/api/staff')
      .set(authorization(fixture.adminAToken))
      .send({ firstName: 'Lifecycle', lastName: 'Staff', staffType: 'DIGER' })
      .expect(201);
    lifecycleStaffId = staff.body.data.id;

    const lawyerList = await request(app.getHttpServer())
      .get('/api/lawyers')
      .set(authorization(fixture.adminAToken))
      .expect(200);
    expect(lawyerList.body.some((row: { id: string }) => row.id === lifecycleLawyerId)).toBe(true);

    const staffList = await request(app.getHttpServer())
      .get('/api/staff')
      .set(authorization(fixture.adminAToken))
      .expect(200);
    expect(staffList.body.data.some((row: { id: string }) => row.id === lifecycleStaffId)).toBe(true);

    await request(app.getHttpServer())
      .delete(`/api/lawyers/${lifecycleLawyerId}`)
      .set(authorization(fixture.partnerToken))
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/staff/${lifecycleStaffId}`)
      .set(authorization(fixture.adminAToken))
      .expect(200);

    expect(await prisma.lawyer.findUnique({ where: { id: lifecycleLawyerId } })).toMatchObject({ isActive: false });
    expect(await prisma.staffMember.findUnique({ where: { id: lifecycleStaffId } })).toMatchObject({ isActive: false });
  });

  it('C - personnel to User binding dry-run uses a real repository snapshot and performs no write', async () => {
    const [tenants, profilesLawyer, profilesStaff, users] = await Promise.all([
      prisma.tenant.findMany({ where: { id: { in: [fixture.tenantAId, fixture.tenantBId] } } }),
      prisma.lawyer.findMany({ where: { id: fixture.unboundLawyerId } }),
      prisma.staffMember.findMany({ where: { id: fixture.unboundStaffId } }),
      prisma.user.findMany({ where: { id: { in: [fixture.plainUserId, fixture.adminBId] } } }),
    ]);
    const snapshot: RepositorySnapshot = {
      tenantIdBySlug: Object.fromEntries(tenants.map((tenant) => [tenant.slug, tenant.id])),
      profiles: [
        ...profilesLawyer.map((profile) => ({
          profileType: 'LAWYER' as const,
          profileId: profile.id,
          tenantId: profile.tenantId,
          isActive: profile.isActive,
          boundUserId: profile.userId,
        })),
        ...profilesStaff.map((profile) => ({
          profileType: 'STAFF_MEMBER' as const,
          profileId: profile.id,
          tenantId: profile.tenantId,
          isActive: profile.isActive,
          boundUserId: profile.userId,
        })),
      ],
      users: users.map((user) => ({
        userId: user.id,
        tenantId: user.tenantId,
        isActive: user.isActive,
        email: user.email,
      })),
    };
    const input: BindingInputRecord[] = [{
      tenantSlug: fixture.tenantASlug,
      profileType: 'LAWYER',
      profileId: fixture.unboundLawyerId,
      disposition: 'BIND_EXISTING_USER',
      existingUserId: fixture.plainUserId,
      systemAccessRequired: true,
      authorizationGraphRequired: true,
    }];
    const before = await prisma.lawyer.findUnique({ where: { id: fixture.unboundLawyerId } });
    const report = dryRunIdentityBinding(input, snapshot);
    const after = await prisma.lawyer.findUnique({ where: { id: fixture.unboundLawyerId } });
    expect(report).toMatchObject({ total: 1, pass: 1, fail: 0, plannedMutations: 1, eligibleForOperate: true });
    expect(report.records[0].plannedMutation).toBe('BIND_EXISTING_USER');
    expect(before?.userId).toBeNull();
    expect(after?.userId).toBeNull();
  });

  it('D - ReportingLine persists TOP_LEVEL and MANAGED dispositions and rejects cross-tenant managers', async () => {
    const topLevel = await request(app.getHttpServer())
      .post('/api/reporting-lines/top-level')
      .set(authorization(fixture.adminAToken))
      .send({ actorUserId: fixture.partnerUserId })
      .expect(201);
    expect(topLevel.body).toMatchObject({ actorUserId: fixture.partnerUserId, disposition: 'TOP_LEVEL' });

    const managed = await request(app.getHttpServer())
      .post('/api/reporting-lines/assign')
      .set(authorization(fixture.adminAToken))
      .send({ actorUserId: fixture.staffUserId, managerUserId: fixture.partnerUserId })
      .expect(201);
    expect(managed.body).toMatchObject({
      actorUserId: fixture.staffUserId,
      managerUserId: fixture.partnerUserId,
      disposition: 'MANAGED',
    });

    await request(app.getHttpServer())
      .post('/api/reporting-lines/assign')
      .set(authorization(fixture.adminAToken))
      .send({ actorUserId: fixture.staffUserId, managerUserId: fixture.adminBId })
      .expect(400);
    const active = await prisma.reportingLine.findFirst({
      where: { tenantId: fixture.tenantAId, actorUserId: fixture.staffUserId, validUntil: null },
    });
    expect(active).toMatchObject({ managerUserId: fixture.partnerUserId, disposition: 'MANAGED' });
  });

  it('F03-01 - authorized same-tenant approval succeeds', async () => {
    const pending = await officeApproval.createPendingRequest({
      tenantId: fixture.tenantAId,
      actionCode: ActionCode.CHANGE_STATUS,
      targetType: 'CASE',
      targetRef: `f03-authorized-${randomUUID()}`,
      requesterUserId: fixture.plainUserId,
      savedIntent: { status: 'CLOSED' },
      idempotencyKey: `f03-authorized-${randomUUID()}`,
    });

    const approved = await request(app.getHttpServer())
      .post(`/api/office-approvals/${pending.id}/approve`)
      .set(authorization(fixture.partnerToken))
      .send({ note: 'F03 same-tenant approval' })
      .expect(201);

    expect(approved.body.data).toMatchObject({
      id: pending.id,
      status: 'APPROVED',
      executionStatus: 'NOT_RUN',
    });
    expect(await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({
      tenantId: fixture.tenantAId,
      requesterUserId: fixture.plainUserId,
      approverUserId: fixture.partnerUserId,
      status: 'APPROVED',
      executionStatus: 'NOT_RUN',
    });
  });

  it('F03-02 - unauthorized actor receives 403', async () => {
    const pending = await officeApproval.createPendingRequest({
      tenantId: fixture.tenantAId,
      actionCode: ActionCode.CHANGE_STATUS,
      targetType: 'CASE',
      targetRef: `f03-unauthorized-${randomUUID()}`,
      requesterUserId: fixture.partnerUserId,
      savedIntent: { status: 'CLOSED' },
      idempotencyKey: `f03-unauthorized-${randomUUID()}`,
    });

    await request(app.getHttpServer())
      .post(`/api/office-approvals/${pending.id}/approve`)
      .set(authorization(fixture.plainToken))
      .send({ note: 'Must remain unauthorized' })
      .expect(403);

    expect(await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({
      status: 'PENDING_APPROVAL',
      approverUserId: null,
    });
  });

  it('F03-03 - cross-tenant approval remains invisible', async () => {
    const pending = await officeApproval.createPendingRequest({
      tenantId: fixture.tenantAId,
      actionCode: ActionCode.CHANGE_STATUS,
      targetType: 'CASE',
      targetRef: `f03-cross-tenant-${randomUUID()}`,
      requesterUserId: fixture.plainUserId,
      savedIntent: { status: 'CLOSED' },
      idempotencyKey: `f03-cross-tenant-${randomUUID()}`,
    });

    await request(app.getHttpServer())
      .get(`/api/office-approvals/${pending.id}`)
      .set(authorization(fixture.adminBToken))
      .expect(404);

    expect(await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({
      tenantId: fixture.tenantAId,
      status: 'PENDING_APPROVAL',
    });
  });

  it('F03-04 - generic CHANGE_STATUS self-approval is forbidden', async () => {
    const pending = await officeApproval.createPendingRequest({
      tenantId: fixture.tenantAId,
      actionCode: ActionCode.CHANGE_STATUS,
      targetType: 'CASE',
      targetRef: `f03-self-approval-${randomUUID()}`,
      requesterUserId: fixture.partnerUserId,
      savedIntent: { status: 'CLOSED' },
      idempotencyKey: `f03-self-approval-${randomUUID()}`,
    });

    const denied = await request(app.getHttpServer())
      .post(`/api/office-approvals/${pending.id}/approve`)
      .set(authorization(fixture.partnerToken))
      .send({ note: 'Must not approve own request' })
      .expect(400);
    expect(JSON.stringify(denied.body)).toContain('SELF_APPROVAL_FORBIDDEN');
    expect(await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({
      status: 'PENDING_APPROVAL',
      approverUserId: null,
    });
  });

  it('F03-05 - staff deactivation writes CAP-09A AuditLog read-back', async () => {
    const suffix = randomUUID();
    const linkedUser = await prisma.user.create({
      data: {
        tenantId: fixture.tenantAId,
        email: `f03-audit-${suffix}@example.test`,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
        name: 'F03',
        surname: 'Audit',
        role: 'USER',
      },
    });
    const staff = await prisma.staffMember.create({
      data: {
        tenantId: fixture.tenantAId,
        officeId: fixture.officeAId,
        userId: linkedUser.id,
        firstName: 'F03',
        lastName: 'Audit',
        staffType: 'DIGER',
      },
    });

    await request(app.getHttpServer())
      .delete(`/api/staff/${staff.id}`)
      .set(authorization(fixture.adminAToken))
      .expect(200, { success: true });

    const [staffReadBack, userReadBack, auditReadBack] = await Promise.all([
      prisma.staffMember.findUniqueOrThrow({ where: { id: staff.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: linkedUser.id } }),
      prisma.auditLog.findFirstOrThrow({
        where: { tenantId: fixture.tenantAId, action: 'STAFF_DEACTIVATE', entityId: staff.id },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    expect(staffReadBack.isActive).toBe(false);
    expect(userReadBack.isActive).toBe(false);
    expect(auditReadBack).toMatchObject({
      tenantId: fixture.tenantAId,
      action: 'STAFF_DEACTIVATE',
      entityType: 'STAFF',
      entityId: staff.id,
      userId: fixture.adminAId,
      actorType: 'USER',
      decisionResult: 'SUCCESS',
      reasonCode: 'OFFICE_F01_AUTHORIZED',
      policyRef: 'OFFICE-GOVERNANCE:OFF-INV-08',
      policyVersion: '2026-08-13',
      oldValues: { isActive: true },
      newValues: { isActive: false },
      metadata: {
        actorRole: 'ADMIN',
        authoritySource: 'OFFICE_F01_AUTHORIZATION_GUARD',
        linkedUserAccountDeactivated: true,
        softDelete: true,
      },
    });
    expect(auditReadBack.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(auditReadBack.correlationId).toBe(auditReadBack.requestId);
  });

  it('F03-06 - audit failure rolls back Staff and linked User', async () => {
    const suffix = randomUUID();
    const linkedUser = await prisma.user.create({
      data: {
        tenantId: fixture.tenantAId,
        email: `f03-rollback-${suffix}@example.test`,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
        name: 'F03',
        surname: 'Rollback',
        role: 'USER',
      },
    });
    const staff = await prisma.staffMember.create({
      data: {
        tenantId: fixture.tenantAId,
        officeId: fixture.officeAId,
        userId: linkedUser.id,
        firstName: 'F03',
        lastName: 'Rollback',
        staffType: 'DIGER',
      },
    });
    const auditFailure = jest
      .spyOn(audit, 'logInTransaction')
      .mockRejectedValueOnce(new Error('F03_SYNTHETIC_AUDIT_FAILURE'));

    const failed = await request(app.getHttpServer())
      .delete(`/api/staff/${staff.id}`)
      .set(authorization(fixture.adminAToken))
      .expect(200);
    auditFailure.mockRestore();

    expect(failed.body).toEqual({ error: 'F03_SYNTHETIC_AUDIT_FAILURE' });
    const [staffReadBack, userReadBack, auditCount] = await Promise.all([
      prisma.staffMember.findUniqueOrThrow({ where: { id: staff.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: linkedUser.id } }),
      prisma.auditLog.count({ where: { entityId: staff.id, action: 'STAFF_DEACTIVATE' } }),
    ]);
    expect(staffReadBack.isActive).toBe(true);
    expect(userReadBack.isActive).toBe(true);
    expect(auditCount).toBe(0);
  });

  it('F03-07 - office approval differential regression remains intact', async () => {
    const pending = await officeApproval.createPendingRequest({
      tenantId: fixture.tenantAId,
      actionCode: ActionCode.CHANGE_STATUS,
      targetType: 'CASE',
      targetRef: `synthetic-case-${randomUUID()}`,
      requesterUserId: fixture.plainUserId,
      savedIntent: { status: 'CLOSED' },
      idempotencyKey: `office-e2e-approval-${randomUUID()}`,
    });

    const inbox = await request(app.getHttpServer())
      .get('/api/office-approvals/inbox')
      .set(authorization(fixture.partnerToken))
      .expect(200);
    expect(inbox.body.data.some((row: { id: string }) => row.id === pending.id)).toBe(true);

    const approved = await request(app.getHttpServer())
      .post(`/api/office-approvals/${pending.id}/approve`)
      .set(authorization(fixture.partnerToken))
      .send({ note: 'Synthetic E2E approval' })
      .expect(201);
    expect(approved.body.data).toMatchObject({ status: 'APPROVED', executionStatus: 'NOT_RUN' });

    await request(app.getHttpServer())
      .post(`/api/office-approvals/${pending.id}/approve`)
      .set(authorization(fixture.partnerToken))
      .send({ note: 'Duplicate decision' })
      .expect(409);
  });

  it('F - authorization gate is default-OFF and enforce blocks a non-PARTNER with a typed request', async () => {
    const targetRef = `synthetic-case-${randomUUID()}`;
    const input = {
      actorUserId: fixture.plainUserId,
      tenantId: fixture.tenantAId,
      actionCode: ActionCode.CHANGE_STATUS,
      targetType: 'CASE',
      targetRef,
      payload: { status: 'CLOSED' },
    };
    approvalGate = '';
    const countBefore = await prisma.officeApprovalRequest.count({ where: { tenantId: fixture.tenantAId } });
    await expect(officeApprovalShadow.evaluate(input)).resolves.toEqual({ flagMode: 'off', evaluated: false });
    expect(await prisma.officeApprovalRequest.count({ where: { tenantId: fixture.tenantAId } })).toBe(countBefore);

    approvalGate = 'enforce';
    const enforced = await officeApprovalShadow.evaluate(input);
    expect(enforced).toMatchObject({
      flagMode: 'enforce',
      evaluated: true,
      decision: 'WOULD_REQUIRE_APPROVAL',
      block: true,
    });
    expect(enforced.envelope).toMatchObject({ outcome: 'APPROVAL_REQUIRED' });
    enforcedRequestId = enforced.requestId ?? '';
    expect(enforcedRequestId).toBeTruthy();
  });

  it('G - public Lawyer and Office responses omit credential fields instead of returning nulls', async () => {
    const lawyer = await request(app.getHttpServer())
      .get(`/api/lawyers/${fixture.partnerLawyerId}`)
      .set(authorization(fixture.adminAToken))
      .expect(200);
    expect(lawyer.body).not.toHaveProperty('uyapToken');
    expect(lawyer.body).not.toHaveProperty('eSignatureSerial');

    const office = await request(app.getHttpServer())
      .get('/api/office')
      .set(authorization(fixture.adminAToken))
      .expect(200);
    const nestedPartner = office.body.lawyers.find((row: { id: string }) => row.id === fixture.partnerLawyerId);
    expect(nestedPartner).toBeDefined();
    expect(nestedPartner).not.toHaveProperty('uyapToken');
    expect(nestedPartner).not.toHaveProperty('eSignatureSerial');
    expect(JSON.stringify(office.body)).not.toContain('must-never-leave-the-api');
  });

  it('H - password recovery is default-off, then completes once when explicitly enabled', async () => {
    const recoveryUser = await prisma.user.findUniqueOrThrow({ where: { id: fixture.recoveryUserId } });
    const tokenCountBefore = await prisma.passwordResetToken.count({ where: { userId: fixture.recoveryUserId } });
    passwordRecoveryEnabled = false;
    await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: recoveryUser.email, tenantSlug: fixture.tenantASlug })
      .expect(201, { success: true });
    expect(await prisma.passwordResetToken.count({ where: { userId: fixture.recoveryUserId } })).toBe(tokenCountBefore);

    passwordRecoveryEnabled = true;
    lastEmailText = '';
    await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: recoveryUser.email, tenantSlug: fixture.tenantASlug })
      .expect(201, { success: true });
    const match = lastEmailText.match(/#token=([^\s]+)/);
    expect(match).not.toBeNull();
    const rawToken = decodeURIComponent(match![1]);

    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: NEW_PASSWORD, passwordConfirmation: NEW_PASSWORD })
      .expect(201, { ok: true });
    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: NEW_PASSWORD, passwordConfirmation: NEW_PASSWORD })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: recoveryUser.email, password: PASSWORD, tenantSlug: fixture.tenantASlug })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: recoveryUser.email, password: NEW_PASSWORD, tenantSlug: fixture.tenantASlug })
      .expect(201);
    passwordRecoveryEnabled = false;
  });

  it('I - deactivating linked Lawyer and Staff rejects both profiles and their User sessions', async () => {
    const inactiveLawyerUser = await prisma.user.findUniqueOrThrow({ where: { id: fixture.inactiveLawyerUserId } });
    const inactiveStaffUser = await prisma.user.findUniqueOrThrow({ where: { id: fixture.inactiveStaffUserId } });

    await request(app.getHttpServer())
      .delete(`/api/lawyers/${fixture.inactiveLawyerId}`)
      .set(authorization(fixture.partnerToken))
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/staff/${fixture.inactiveStaffId}`)
      .set(authorization(fixture.adminAToken))
      .expect(200);

    expect(await prisma.lawyer.findUniqueOrThrow({ where: { id: fixture.inactiveLawyerId } })).toMatchObject({ isActive: false });
    expect(await prisma.staffMember.findUniqueOrThrow({ where: { id: fixture.inactiveStaffId } })).toMatchObject({ isActive: false });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: fixture.inactiveLawyerUserId } })).toMatchObject({ isActive: false });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: fixture.inactiveStaffUserId } })).toMatchObject({ isActive: false });

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: inactiveLawyerUser.email, password: PASSWORD, tenantSlug: fixture.tenantASlug })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: inactiveStaffUser.email, password: PASSWORD, tenantSlug: fixture.tenantASlug })
      .expect(401);

    const [lawyers, staff] = await Promise.all([
      request(app.getHttpServer()).get('/api/lawyers').set(authorization(fixture.adminAToken)).expect(200),
      request(app.getHttpServer()).get('/api/staff').set(authorization(fixture.adminAToken)).expect(200),
    ]);
    expect(lawyers.body.some((row: { id: string }) => row.id === fixture.inactiveLawyerId)).toBe(false);
    expect(staff.body.data.some((row: { id: string }) => row.id === fixture.inactiveStaffId)).toBe(false);
  });

  it('J - corrupt cross-tenant linkage rolls back deactivation and enforce request creation is idempotent', async () => {
    const corrupt = await prisma.lawyer.create({
      data: {
        tenantId: fixture.tenantAId,
        officeId: fixture.officeAId,
        userId: fixture.adminBId,
        name: 'Rollback',
        surname: 'Probe',
      },
    });
    await request(app.getHttpServer())
      .delete(`/api/lawyers/${corrupt.id}`)
      .set(authorization(fixture.partnerToken))
      .expect(409);
    expect(await prisma.lawyer.findUniqueOrThrow({ where: { id: corrupt.id } })).toMatchObject({ isActive: true });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: fixture.adminBId } })).toMatchObject({ isActive: true });

    approvalGate = 'enforce';
    const existing = await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: enforcedRequestId } });
    const repeated = await officeApprovalShadow.evaluate({
      actorUserId: fixture.plainUserId,
      tenantId: fixture.tenantAId,
      actionCode: ActionCode.CHANGE_STATUS,
      targetType: existing.targetType,
      targetRef: existing.targetRef,
      payload: existing.savedIntent,
    });
    expect(repeated.requestId).toBe(enforcedRequestId);
    expect(await prisma.officeApprovalRequest.count({
      where: { tenantId: fixture.tenantAId, idempotencyKey: existing.idempotencyKey },
    })).toBe(1);
    approvalGate = '';
  });
});
