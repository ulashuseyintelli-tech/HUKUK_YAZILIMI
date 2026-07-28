import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as request from 'supertest';

import { AuditController } from '../../audit/audit.controller';
import { AuditService } from '../../audit/audit.service';
import { PermissionDiagnosticsController } from '../../permission-diagnostics/permission-diagnostics.controller';
import { PermissionDiagnosticsService } from '../../permission-diagnostics/permission-diagnostics.service';
import { TenantService } from '../../tenant/tenant.service';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { AdminGuard } from '../guards/admin.guard';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { LoginRateLimitGuard } from '../guards/login-rate-limit.guard';
import { OfficeForgotPasswordRateLimitGuard } from '../guards/office-forgot-password-rate-limit.guard';
import { OfficeResetPasswordRateLimitGuard } from '../guards/office-reset-password-rate-limit.guard';
import { PasswordResetController } from '../password-reset/password-reset.controller';
import { PasswordResetService } from '../password-reset/password-reset.service';
import { JwtStrategy } from '../strategies/jwt.strategy';
import { UserInviteController } from '../invite/user-invite.controller';
import { UserInviteService } from '../invite/user-invite.service';

const TEST_SECRET = 'w1-controlled-runtime-test-secret-at-least-32-bytes';

const projectRoot = path.resolve(__dirname, '../../../../../..');
const repositoryRoot = path.resolve(projectRoot, '..');
const certificationDirectory = path.join(
  projectRoot,
  'docs',
  'audit',
  'runtime-operability-certification-r01',
  'w1-security-tenant-certification',
);
const certificationPath = path.join(certificationDirectory, 'security-tenant-certification.json');
const manifestPath = path.join(
  projectRoot,
  'apps',
  'api',
  'ci-manifests',
  'pure',
  'office-auth-user.txt',
);
const runtimeSpecPath =
  'src/modules/auth/__tests__/security-tenant-runtime-certification.spec.ts';

function git(...args: string[]): string {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  expect(result.status).toBe(0);
  return result.stdout.trim();
}

describe('R01 W1 security/tenant controlled runtime certification', () => {
  let app: INestApplication;
  let jwt: JwtService;

  const auth = {
    register: jest.fn().mockResolvedValue({ probe: 'auth-register' }),
    login: jest.fn().mockResolvedValue({ probe: 'auth-login' }),
    findTenantsForEmail: jest.fn().mockResolvedValue({ status: 'NONE' }),
    validateUser: jest.fn(),
  };
  const passwordReset = {
    isPasswordRecoveryEnabled: jest.fn().mockReturnValue(false),
    forgotPassword: jest.fn().mockResolvedValue({ success: true }),
    resetPassword: jest.fn().mockResolvedValue({ success: true }),
  };
  const invites = {
    issue: jest.fn().mockResolvedValue({ probe: 'invite-create' }),
    list: jest.fn().mockResolvedValue({ probe: 'invite-list' }),
    resend: jest.fn().mockResolvedValue({ probe: 'invite-resend' }),
    revoke: jest.fn().mockResolvedValue({ probe: 'invite-revoke' }),
    accept: jest.fn().mockResolvedValue({ probe: 'invite-accept' }),
  };
  const audit = {
    getLogs: jest.fn().mockResolvedValue({ probe: 'audit-logs' }),
    getEntityHistory: jest.fn().mockResolvedValue({ probe: 'audit-entity-history' }),
    getUserActivity: jest.fn().mockResolvedValue({ probe: 'audit-user-activity' }),
  };
  const permissionDiagnostics = {
    diagnose: jest.fn().mockReturnValue({ probe: 'permission-diagnostics-one' }),
    diagnoseAll: jest.fn().mockReturnValue({ probe: 'permission-diagnostics-all' }),
  };
  const adminUser = {
    id: 'user-w1-admin',
    tenantId: 'tenant-w1',
    email: 'admin@example.test',
    role: 'ADMIN',
    tokenVersion: 0,
  };

  beforeAll(async () => {
    auth.validateUser.mockResolvedValue(adminUser);
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: TEST_SECRET, signOptions: { expiresIn: '5m' } }),
      ],
      controllers: [
        AuthController,
        UserInviteController,
        PasswordResetController,
        AuditController,
        PermissionDiagnosticsController,
      ],
      providers: [
        JwtStrategy,
        JwtAuthGuard,
        AdminGuard,
        LoginRateLimitGuard,
        OfficeForgotPasswordRateLimitGuard,
        OfficeResetPasswordRateLimitGuard,
        { provide: AuthService, useValue: auth },
        { provide: PasswordResetService, useValue: passwordReset },
        { provide: UserInviteService, useValue: invites },
        { provide: AuditService, useValue: audit },
        { provide: PermissionDiagnosticsService, useValue: permissionDiagnostics },
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
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    await app.init();
    jwt = module.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  function bearer(role = 'ADMIN'): string {
    auth.validateUser.mockResolvedValueOnce({ ...adminUser, role });
    return `Bearer ${jwt.sign({
      sub: adminUser.id,
      tenantId: adminUser.tenantId,
      email: adminUser.email,
      role,
      tokenVersion: 0,
    })}`;
  }

  const routes = [
    {
      name: 'AuthController.capabilities', method: 'get', url: '/api/auth/capabilities',
      expectedStatus: 200, expectedProbe: undefined,
    },
    {
      name: 'AuthController.register', method: 'post', url: '/api/auth/register',
      body: { firmName: 'W1 Firm', name: 'W1', email: 'w1@example.test', password: 'password-123' },
      expectedStatus: 201, expectedProbe: 'auth-register',
    },
    {
      name: 'AuthController.login', method: 'post', url: '/api/auth/login',
      body: { email: 'w1@example.test', password: 'password-123', tenantSlug: 'w1-firm' },
      expectedStatus: 201, expectedProbe: 'auth-login',
    },
    {
      name: 'AuthController.findTenantsForEmail', method: 'post',
      url: '/api/auth/account-recovery/find-tenants', body: { email: 'w1@example.test' },
      expectedStatus: 201, expectedProbe: undefined,
    },
    {
      name: 'AuthController.me', method: 'get', url: '/api/auth/me', auth: true,
      expectedStatus: 200, expectedProbe: undefined,
    },
    {
      name: 'UserInviteController.create', method: 'post', url: '/api/auth/invites', auth: true,
      body: { email: 'invite@example.test', name: 'Invite' },
      expectedStatus: 201, expectedProbe: 'invite-create',
    },
    {
      name: 'UserInviteController.list', method: 'get', url: '/api/auth/invites', auth: true,
      expectedStatus: 200, expectedProbe: 'invite-list',
    },
    {
      name: 'UserInviteController.resend', method: 'post', url: '/api/auth/invites/invite-1/resend', auth: true,
      expectedStatus: 201, expectedProbe: 'invite-resend',
    },
    {
      name: 'UserInviteController.revoke', method: 'post', url: '/api/auth/invites/invite-1/revoke', auth: true,
      expectedStatus: 201, expectedProbe: 'invite-revoke',
    },
    {
      name: 'UserInviteController.accept', method: 'post', url: '/api/auth/accept-invite',
      body: { token: 'invite-token', password: 'password-123' },
      expectedStatus: 201, expectedProbe: 'invite-accept',
    },
    {
      name: 'PasswordResetController.forgotPassword', method: 'post', url: '/api/auth/forgot-password',
      body: { email: 'w1@example.test', tenantSlug: 'w1-firm' },
      expectedStatus: 201, expectedProbe: undefined,
    },
    {
      name: 'PasswordResetController.resetPassword', method: 'post', url: '/api/auth/reset-password',
      body: { token: 'reset-token', password: 'new-password-123', passwordConfirmation: 'new-password-123' },
      expectedStatus: 201, expectedProbe: undefined,
    },
    {
      name: 'AuditController.getLogs', method: 'get', url: '/api/audit/logs', auth: true,
      expectedStatus: 200, expectedProbe: 'audit-logs',
    },
    {
      name: 'AuditController.getEntityHistory', method: 'get',
      url: '/api/audit/entity-history?entityType=Case&entityId=case-1', auth: true,
      expectedStatus: 200, expectedProbe: 'audit-entity-history',
    },
    {
      name: 'AuditController.getUserActivity', method: 'get',
      url: '/api/audit/user-activity?userId=user-1', auth: true,
      expectedStatus: 200, expectedProbe: 'audit-user-activity',
    },
    {
      name: 'PermissionDiagnosticsController.getDiagnostics', method: 'get',
      url: '/api/permission-diagnostics', auth: true,
      expectedStatus: 200, expectedProbe: 'permission-diagnostics-all',
    },
  ] as const;

  it.each(routes)('$name dispatches through the controlled Nest runtime', async (route) => {
    let call = (request(app.getHttpServer()) as any)[route.method](route.url);
    if ('auth' in route && route.auth) call = call.set('Authorization', bearer());
    if ('body' in route && route.body) call = call.send(route.body);
    const response = await call.expect(route.expectedStatus);
    if (route.expectedProbe) expect(response.body.probe).toBe(route.expectedProbe);
  });

  it('JwtAuthGuard rejects a protected route without a bearer token', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('AdminGuard rejects a non-admin actor after successful JWT authentication', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/invites')
      .set('Authorization', bearer('USER'))
      .send({ email: 'invite-user@example.test', name: 'Invite User' })
      .expect(403);
  });

  it('propagates the trusted JWT tenant and actor to protected consumers', () => {
    expect(invites.issue).toHaveBeenCalledWith(
      { id: adminUser.id, tenantId: adminUser.tenantId, role: 'ADMIN' },
      expect.objectContaining({ email: 'invite@example.test' }),
    );
    expect(audit.getLogs).toHaveBeenCalledWith(
      adminUser.tenantId,
      expect.any(Object),
      1,
      50,
    );
  });

  it('executes TenantService methods but does not invent a production consumer', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tenant-w1', slug: 'w1' }),
      },
    };
    const service = new TenantService(prisma as any);
    await expect(service.findById('tenant-w1')).resolves.toEqual({ id: 'tenant-w1', slug: 'w1' });
    await expect(service.findBySlug('w1')).resolves.toEqual({ id: 'tenant-w1', slug: 'w1' });
    expect(prisma.tenant.findUnique).toHaveBeenNthCalledWith(1, { where: { id: 'tenant-w1' } });
    expect(prisma.tenant.findUnique).toHaveBeenNthCalledWith(2, { where: { slug: 'w1' } });
  });
});

describe('R01 W1 certification artifact integrity', () => {
  const readModel = () => JSON.parse(fs.readFileSync(certificationPath, 'utf8'));

  it('has one closed-shape certification for each exact selected capability', () => {
    const model = readModel();
    expect(model.schemaVersion).toBe(1);
    expect(model.program).toBe('RUNTIME-OPERABILITY-CERTIFICATION-R01');
    expect(model.task).toBe('W1-SECURITY-TENANT-CERTIFICATION');
    expect(model.ownerDecision).toBe('RATIFIED');
    expect(model.executionGrant).toBe('GO-COMPLETE');
    expect(model.certifications).toHaveLength(33);
    expect(new Set(model.certifications.map((item: any) => item.capabilityId)).size).toBe(33);
    expect(model.certifications.filter((item: any) => item.entryPointType === 'HTTP')).toHaveLength(16);
  });

  it('preserves the required partial/deployed-unverified disposition without overclaim', () => {
    const model = readModel();
    expect(model.overallDisposition.taskStatus).toBe('CLOSED');
    expect(model.overallDisposition.securityTenantSlice).toBe('PARTIAL / DEPLOYED RUNTIME UNCERTIFIED');
    expect(model.overallDisposition.repositoryWide).toBe('PARTIAL / OPERATIONALLY UNCERTIFIED');
    expect(model.metrics).toMatchObject({
      selectedCapabilityCount: 33,
      controlledRuntimeCertifiedCount: 20,
      dormantPreservedCount: 10,
      inertConfigGatedCount: 2,
      noRuntimeConsumerCount: 1,
      deployedRuntimeCertifiedCount: 0,
      productionRuntimeCertifiedCount: 0,
      provenBindingDefectCount: 0,
      remediationAppliedCount: 0,
    });
    expect(model.certifications.every((item: any) => item.deployedRuntimeStatus === 'UNVERIFIED')).toBe(true);
    expect(model.certifications.every((item: any) => item.productionRuntimeStatus === 'NOT_CERTIFIED')).toBe(true);
  });

  it('keeps activation, break-glass, policy, schema and migration prohibitions closed', () => {
    const model = readModel();
    expect(Object.values(model.prohibitedActions).every((value) => value === false)).toBe(true);
    expect(model.remediation.applied).toEqual([]);
    expect(model.remediation.provenBindingDefects).toEqual([]);
    expect(model.remediation.reviewedNoRemediation).toHaveLength(1);
  });

  it('binds all HTTP certifications to the controlled Nest runtime probe', () => {
    const model = readModel();
    const http = model.certifications.filter((item: any) => item.entryPointType === 'HTTP');
    expect(http.every((item: any) => item.probeProfiles.includes('W1-PROBE-HTTP-DISPATCH'))).toBe(true);
    const lines = fs.readFileSync(manifestPath, 'utf8').split(/\r?\n/);
    expect(lines.filter((line) => line.trim() === runtimeSpecPath)).toHaveLength(1);
  });

  it('pins all ratified W0 blobs and the PR #1795 sealed artifact tree', () => {
    const model = readModel();
    for (const [file, expectedBlob] of Object.entries(model.metadata.w0ArtifactBlobs)) {
      expect(git('hash-object', file)).toBe(expectedBlob);
    }
    expect(git('rev-parse', 'HEAD:project/docs/audit/runtime-binding-reconciliation-r01'))
      .toBe(model.metadata.sealedPr1795ArtifactTreeSha);
  });
});
