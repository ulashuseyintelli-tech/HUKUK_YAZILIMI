jest.mock('pdf-poppler', () => ({ convert: async () => { throw new Error('Renderer not used in H13 acceptance'); } }));
import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { AuthService } from '../../auth/auth.service';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { OfficeApprovalModule } from '../../office-approval/office-approval.module';
import { BankController } from '../../bank/bank.controller';
import { BankService } from '../../bank/bank.service';
import { GuidedOpenObserveService } from '../../permission-diagnostics/guided-open-observe.service';
import { ClientBankAccountController } from '../client-bank-account.controller';
import { ClientBankAccountService } from '../client-bank-account.service';

const URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !URL) throw new Error('H13 requires disposable TEST_DATABASE_URL; SKIP is not acceptance.');
const dbDescribe = URL ? describe : describe.skip;
const SECRET = 'h13-synthetic-' + randomUUID();
const IBAN = 'TR330006100519786457841326';
const SECOND = 'GB82WEST12345698765432';
const THIRD = 'DE89370400440532013000';

dbDescribe('H13/A — real JWT/HTTP and ClientBankAccount on disposable PostgreSQL', () => {
  jest.setTimeout(30_000);
  let db: PrismaClient, app: INestApplication, jwt: JwtService, service: ClientBankAccountService;
  let tenant: string, foreignTenant: string, officeId: string, client: string, otherClient: string, caseId: string;
  let admin: string, partner: string, partnerLawyer: string, ordinary: string, staff: string, staffId: string, outsider: string, viewer: string;
  const actor = (userId = admin) => ({ userId, tenantId: tenant });
  const root = (id = client) => '/clients/' + id + '/bank-accounts';
  const body = (iban = IBAN, extra = {}) => ({ bankName: 'Synthetic bank', iban, ...extra });
  const payload = (res: any) => res.body.data ?? res.body;
  const user = async (role: 'ADMIN' | 'USER' | 'VIEWER', t = tenant) => db.user.create({ data: {
    tenantId: t, role, name: 'Synthetic', surname: 'H13', email: randomUUID() + '@example.test', passwordHash: 'unused-no-login',
  } });
  const lawyer = async (userId: string, rank: 'PARTNER' | 'LAWYER' = 'PARTNER', linked = true) => {
    const row = await db.lawyer.create({ data: { tenantId: tenant, officeId, userId, name: 'Synthetic', surname: 'H13', lawyerRank: rank } });
    if (linked) await db.caseLawyer.create({ data: { caseId, lawyerId: row.id } });
    return row.id;
  };
  const headers = async (id = admin) => {
    const u = await db.user.findUniqueOrThrow({ where: { id } });
    return { Authorization: 'Bearer ' + jwt.sign({ sub: id, tenantId: u.tenantId, role: u.role, email: u.email, tokenVersion: u.tokenVersion }) };
  };
  const post = async (input = body(), id = admin, parent = client) => request(app.getHttpServer()).post(root(parent)).set(await headers(id)).send(input);
  const get = async (id = admin, parent = client) => request(app.getHttpServer()).get(root(parent)).set(await headers(id));
  const put = async (accountId: string, input: any, id = admin, parent = client) => request(app.getHttpServer()).put(root(parent) + '/' + accountId).set(await headers(id)).send(input);
  const snapshot = async () => ({
    profiles: await db.clientBankAccount.findMany({ where: { client: { tenantId: { in: [tenant, foreignTenant] } } }, orderBy: { id: 'asc' } }),
    ledgerAccounts: await db.bankAccount.findMany({ where: { tenantId: { in: [tenant, foreignTenant] } }, orderBy: { id: 'asc' } }),
    audits: await db.auditLog.findMany({ where: { tenantId: { in: [tenant, foreignTenant] } }, orderBy: { id: 'asc' } }),
  });
  const unchanged = async (run: () => Promise<any>, status: number | number[]) => {
    const before = await snapshot(); const res = await run();
    expect(Array.isArray(status) ? status : [status]).toContain(res.status);
    expect(await snapshot()).toEqual(before); return res;
  };
  const waitForLock = async () => {
    const end = Date.now() + 5000;
    while (Date.now() < end) {
      const rows = await db.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'`;
      if (rows[0].count) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('Request did not reach actual PostgreSQL lock gate');
  };
  const failAudit = async (enable: boolean) => {
    if (enable) {
      await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION h13_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'CLIENT_BANK_ACCOUNT_%' THEN RAISE EXCEPTION 'H13 synthetic audit failure'; END IF; RETURN NEW; END $$`);
      await db.$executeRawUnsafe('CREATE TRIGGER h13_fail_audit_trigger BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION h13_fail_audit()');
    } else {
      await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS h13_fail_audit_trigger ON "AuditLog"');
      await db.$executeRawUnsafe('DROP FUNCTION IF EXISTS h13_fail_audit()');
    }
  };
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: URL } } }); await db.$connect();
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ JWT_SECRET: SECRET })] }),
        PrismaModule, ErrorLogModule, OfficeApprovalModule, PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({ secret: SECRET })],
      controllers: [ClientBankAccountController, BankController],
      providers: [AuthService, JwtStrategy, ClientBankAccountService,
        { provide: GuidedOpenObserveService, useValue: {} }, // Not consumed by either account-registration route.
        { provide: BankService, useFactory: (config: ConfigService, prisma: PrismaService, audit: AuditService) => new BankService(config, prisma, {} as any, audit), inject: [ConfigService, PrismaService, AuditService] }],
    }).overrideProvider(PrismaService).useValue(db).compile();
    app = module.createNestApplication(); app.useLogger(false);
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init(); await app.listen(0, '127.0.0.1');
    jwt = module.get(JwtService); service = module.get(ClientBankAccountService);
  });
  beforeEach(async () => {
    tenant = 'h13-test-' + randomUUID(); foreignTenant = 'h13-foreign-test-' + randomUUID();
    for (const id of [tenant, foreignTenant]) await db.tenant.create({ data: { id, slug: id, name: 'Synthetic H13' } });
    officeId = (await db.office.create({ data: { tenantId: tenant, name: 'Synthetic H13 office' } })).id;
    client = (await db.client.create({ data: { tenantId: tenant, type: 'PERSON', name: 'Synthetic H13 client' } })).id;
    otherClient = (await db.client.create({ data: { tenantId: tenant, type: 'PERSON', name: 'Other H13 client' } })).id;
    caseId = (await db.case.create({ data: { tenantId: tenant, fileNumber: randomUUID(), type: 'GENERAL_EXECUTION', clientId: client } })).id;
    await db.caseClient.create({ data: { caseId, clientId: client } });
    admin = (await user('ADMIN')).id; await lawyer(admin);
    partner = (await user('USER')).id; partnerLawyer = await lawyer(partner);
    ordinary = (await user('USER')).id; await lawyer(ordinary, 'LAWYER');
    staff = (await user('USER')).id;
    staffId = (await db.staffMember.create({ data: { tenantId: tenant, officeId, userId: staff, firstName: 'Staff', lastName: 'H13', staffType: 'SEKRETER' } })).id;
    await db.caseStaff.create({ data: { caseId, staffMemberId: staffId, roleOnCase: 'SEKRETER', canView: true } });
    outsider = (await user('ADMIN')).id; await lawyer(outsider, 'PARTNER', false);
    viewer = (await user('VIEWER')).id; await lawyer(viewer);
  });
  afterEach(async () => { jest.restoreAllMocks(); await failAudit(false); });
  afterAll(async () => { await app?.close(); await db?.$disconnect(); });

  it('requires real JWT; missing authentication performs no account/audit write', async () => {
    await unchanged(async () => request(app.getHttpServer()).post(root()).send(body()), 401);
  });
  it('ADMIN plus canonical scope creates only profile data and minimized audit', async () => {
    const res = await post(body('tr33 0006 1005 1978 6457 8413 26', { branchName: 'Branch', accountHolder: 'Synthetic holder' }));
    expect(res.status).toBe(201); expect(payload(res)).toMatchObject({ bankName: 'Synthetic bank', ibanMasked: 'TR33****1326', isPrimary: false });
    expect(JSON.stringify(res.body)).not.toContain(IBAN);
    expect(await db.clientBankAccount.findUniqueOrThrow({ where: { id: payload(res).id } })).toMatchObject({ clientId: client, iban: IBAN, showInDocuments: false });
    expect(await db.bankAccount.count({ where: { tenantId: tenant } })).toBe(0);
    const audit = await db.auditLog.findFirstOrThrow({ where: { tenantId: tenant, action: 'CLIENT_BANK_ACCOUNT_CREATE' } });
    expect(audit.entityId).toBe(client); expect(JSON.stringify(audit)).not.toMatch(/Synthetic holder|TR330006100519786457841326/);
  });
  it('existing eligible USER can write; related ordinary lawyer and staff can only read', async () => {
    expect((await post(body(), partner)).status).toBe(201);
    for (const id of [ordinary, staff]) {
      const res = await get(id); expect(res.status).toBe(200); expect(payload(res).capabilities.canCreate).toBe(false);
      expect(payload(res).items).toHaveLength(1); await unchanged(() => post(body(SECOND), id), 403);
    }
  });
  it('delegated office approver reuses existing authority; grant/flag-free ordinary actor stays denied', async () => {
    await db.lawyer.updateMany({ where: { userId: ordinary }, data: { canApproveOfficeActions: true } });
    expect((await post(body(), ordinary)).status).toBe(201);
    await db.lawyer.updateMany({ where: { userId: ordinary }, data: { canApproveOfficeActions: false } });
    await unchanged(() => post(body(SECOND), ordinary), 403);
  });
  it('ADMIN/title alone, VIEWER and wrong tenant cannot read or write the parent', async () => {
    await unchanged(() => post(body(), outsider), 404); await unchanged(() => get(outsider), 404);
    await unchanged(() => post(body(), viewer), 403); await unchanged(() => get(viewer), 403);
    const foreign = (await user('ADMIN', foreignTenant)).id;
    await unchanged(() => post(body(), foreign), 404); await unchanged(() => get(foreign), 404);
  });
  it('passive lawyer/staff and lost canView reject without writes', async () => {
    await db.lawyer.update({ where: { id: partnerLawyer }, data: { isActive: false } });
    await unchanged(() => post(body(), partner), 404); await unchanged(() => get(partner), 404);
    await db.staffMember.update({ where: { id: staffId }, data: { isActive: false } });
    await unchanged(() => get(staff), 404);
    await db.staffMember.update({ where: { id: staffId }, data: { isActive: true } });
    await db.caseStaff.updateMany({ where: { staffMemberId: staffId }, data: { canView: false } });
    await unchanged(() => get(staff), 404);
  });
  it('old JWT loses access after User deactivation, with no bank/audit write', async () => {
    const token = await headers(); await db.user.update({ where: { id: admin }, data: { isActive: false } });
    await unchanged(async () => request(app.getHttpServer()).post(root()).set(token).send(body()), 401);
  });
  it('legacy Case.clientId without canonical CaseClient is insufficient', async () => {
    await db.caseClient.deleteMany({ where: { caseId, clientId: client } });
    await unchanged(() => post(), 404); await unchanged(() => get(), 404);
  });
  it('inactive Client is not writable or listable', async () => {
    await db.client.update({ where: { id: client }, data: { isActive: false } });
    await unchanged(() => post(), 404); await unchanged(() => get(), 404);
  });
  it.each(['clientId', 'tenantId', 'id', 'user', 'role', 'showInDocuments', 'bankAccounts', 'isActive'])('rejects forbidden/ORM field %s without writes', async key => {
    await unchanged(() => post(body(IBAN, { [key]: key === 'user' ? { update: { role: 'ADMIN' } } : 'injected' })), 400);
  });
  it('rejects invalid/null/masked IBAN; does not overwrite stored value', async () => {
    const row = payload(await post());
    for (const iban of [null, '', 'TR33****1326', 'TR000000000000000000000000']) await unchanged(() => put(row.id, { iban }), 400);
    expect((await db.clientBankAccount.findUniqueOrThrow({ where: { id: row.id } })).iban).toBe(IBAN);
  });
  it('partial update preserves omitted IBAN and document flag; exact no-op emits no success audit', async () => {
    const row = payload(await post());
    const changed = await put(row.id, { branchName: 'New branch' }); expect(changed.status).toBe(200);
    const stored = await db.clientBankAccount.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored).toMatchObject({ iban: IBAN, branchName: 'New branch', showInDocuments: false });
    await unchanged(() => put(row.id, { branchName: 'New branch' }), 200);
    await unchanged(() => put(row.id, {}), 200);
  });
  it('resolves actual child parent and never updates a sibling/foreign account by id', async () => {
    const other = await db.clientBankAccount.create({ data: { clientId: otherClient, bankName: 'Other', iban: IBAN } });
    await unchanged(() => put(other.id, { bankName: 'Hijacked' }), 404);
    const own = payload(await post()); await unchanged(() => put(own.id, { clientId: otherClient }), 400);
    await unchanged(() => put(own.id, { bankName: 'Hijacked' }, admin, otherClient), 404);
  });
  it('normalized duplicate is 409 only within parent; no other Client identity leaks', async () => {
    await db.clientBankAccount.create({ data: { clientId: otherClient, bankName: 'Secret other bank', iban: IBAN } });
    expect((await post()).status).toBe(201);
    const denied = await unchanged(() => post(body('tr33 0006 1005 1978 6457 8413 26')), 409);
    expect(JSON.stringify(denied.body)).not.toMatch(new RegExp(otherClient + '|Secret other bank'));
  });
  it('real concurrent same-parent duplicates produce exactly one account and one audit', async () => {
    const responses = await Promise.all([post(), post()]); expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    expect(await db.clientBankAccount.count({ where: { clientId: client } })).toBe(1);
    expect(await db.auditLog.count({ where: { tenantId: tenant, action: 'CLIENT_BANK_ACCOUNT_CREATE' } })).toBe(1);
  });
  it('primary changes serialize atomically; explicit false selects no replacement', async () => {
    await post(body(IBAN, { isPrimary: true }));
    const results = await Promise.all([post(body(SECOND, { isPrimary: true })), post(body(THIRD, { isPrimary: true }))]);
    expect(results.map(r => r.status)).toEqual([201, 201]);
    const primaries = await db.clientBankAccount.findMany({ where: { clientId: client, isPrimary: true } }); expect(primaries).toHaveLength(1);
    expect((await put(primaries[0].id, { isPrimary: false })).status).toBe(200);
    expect(await db.clientBankAccount.count({ where: { clientId: client, isPrimary: true } })).toBe(0);
  });
  it('database audit failure rolls back create, update and sibling primary changes together', async () => {
    const first = payload(await post(body(IBAN, { isPrimary: true })));
    const second = payload(await post(body(SECOND)));
    await failAudit(true);
    await unchanged(() => post(body(THIRD, { isPrimary: true })), 500);
    await unchanged(() => put(second.id, { bankName: 'Must roll back', isPrimary: true }), 500);
    expect((await db.clientBankAccount.findUniqueOrThrow({ where: { id: first.id } })).isPrimary).toBe(true);
  });
  it('missing actor and filter-shaped direct service arguments fail closed', async () => {
    const before = await snapshot();
    await expect(service.create(client, body(), undefined as any)).rejects.toThrow();
    await expect(service.create({ not: undefined } as any, body(), actor())).rejects.toThrow();
    await expect(service.update(client, { not: undefined } as any, {}, actor())).rejects.toThrow();
    await expect(service.create(client, body(IBAN, { user: { update: { role: 'ADMIN' } } }), actor())).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });
  it('fresh authority is rechecked after actual Client lock wait', async () => {
    let release!: () => void, locked!: () => void;
    const held = new Promise<void>(r => { locked = r; }); const resume = new Promise<void>(r => { release = r; });
    const blocker = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Client" WHERE "id"=${client} FOR UPDATE`; locked(); await resume;
      await tx.lawyer.update({ where: { id: partnerLawyer }, data: { canApproveOfficeActions: false, lawyerRank: 'LAWYER' } });
    }, { timeout: 15_000 });
    await held; const before = await snapshot(); const pending = post(body(), partner);
    try { await waitForLock(); } finally { release(); }
    await blocker; expect((await pending).status).toBe(403); expect(await snapshot()).toEqual(before);
  });
  it('lost canonical relation during Client lock wait rejects rather than writing', async () => {
    let release!: () => void, locked!: () => void;
    const held = new Promise<void>(r => { locked = r; }); const resume = new Promise<void>(r => { release = r; });
    const blocker = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Client" WHERE "id"=${client} FOR UPDATE`; locked(); await resume;
      await tx.caseLawyer.deleteMany({ where: { caseId, lawyerId: partnerLawyer } });
    }, { timeout: 15_000 });
    await held; const before = await snapshot(); const pending = post(body(), partner);
    try { await waitForLock(); } finally { release(); }
    await blocker; expect((await pending).status).toBe(404); expect(await snapshot()).toEqual(before);
  });
  it('generic bank route rejects new CLIENT accounts, preserves TENANT and existing legacy history', async () => {
    const legacy = await db.bankAccount.create({ data: { tenantId: tenant, bankCode: '062', bankName: 'Legacy', iban: IBAN, ownerType: 'CLIENT', ownerId: client, ownerName: 'Historical' } });
    const input = { bankCode: '062', bankName: 'Synthetic bank', iban: IBAN, ownerType: 'CLIENT', ownerId: client, ownerName: 'Synthetic' };
    await unchanged(async () => request(app.getHttpServer()).post('/bank/accounts').set(await headers()).send(input), 400);
    const tenantAccount = await request(app.getHttpServer()).post('/bank/accounts').set(await headers()).send({ ...input, iban: 'TR680006200065118000000001', ownerType: 'TENANT', ownerId: undefined });
    expect(tenantAccount.status).toBe(201);
    expect(await db.bankAccount.findUniqueOrThrow({ where: { id: legacy.id } })).toEqual(legacy);
  });
});
