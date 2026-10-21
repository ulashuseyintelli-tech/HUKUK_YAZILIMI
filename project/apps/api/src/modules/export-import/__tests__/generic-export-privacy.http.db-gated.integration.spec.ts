jest.mock('pdf-poppler', () => ({ convert: async () => { throw new Error('No external renderer in generic export acceptance'); } }));
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as http from 'supertest';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../../prisma/prisma.service';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ExportImportController } from '../export-import.controller';
import { ExportImportService } from '../export-import.service';
import { ReportController } from '../../report/report.controller';
import { ReportService } from '../../report/report.service';
import { WarnOnlyAuditService } from '../../permission-diagnostics/warn-only-audit.service';

const url = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !url) throw new Error('K16 generic export requires disposable TEST_DATABASE_URL');
const dbDescribe = url ? describe : describe.skip;
const routes = ['/export-import/clients/excel', '/export-import/clients/pdf', '/export-import/cases/excel', '/export-import/cases/pdf', '/reports/export/cases'];

dbDescribe('K16 generic export — real HTTP/PostgreSQL and decoded artifacts', () => {
  let db: PrismaService, app: INestApplication, service: ExportImportService;
  let tenant: string, foreign: string, clientId: string, caseId: string, unassignedCase: string;
  const identity = '10000000146', iban = 'TR120001000000000000001234';
  const phone = '+905551112233', email = 'synthetic@example.test';
  const denied = 'UNAUTHORIZED PRIVATE ROW', allowed = 'Allowed canonical client', file = 'ALLOWED-FILE';
  beforeAll(async () => {
    db = new PrismaService({ datasources: { db: { url } } }); await db.$connect();
    const module = await Test.createTestingModule({ controllers: [ExportImportController, ReportController], providers: [
      { provide: ExportImportService, useFactory: () => new ExportImportService(db, {} as any) },
      { provide: ReportService, useFactory: () => new ReportService(db, {} as any, {} as any) },
      { provide: WarnOnlyAuditService, useValue: { recordWouldDeny: async () => undefined } },
    ] }).overrideGuard(JwtAuthGuard).useValue({ async canActivate(context: any) {
      const req = context.switchToHttp().getRequest();
      const user = await db.user.findUnique({ where: { id: String(req.headers['x-test-user-id']) } });
      if (!user) throw new UnauthorizedException();
      req.user = { ...user, role: 'ADMIN' }; return true; // Forged/stale role cannot authorize export.
    } }).compile();
    service = module.get(ExportImportService); app = module.createNestApplication();
    await app.init(); await app.listen(0, '127.0.0.1');
  });
  beforeEach(async () => {
    tenant = 'k16-export-test-' + randomUUID(); foreign = 'k16-foreign-test-' + randomUUID();
    for (const id of [tenant, foreign]) await db.tenant.create({ data: { id, slug: id, name: 'Synthetic export tenant' } });
    clientId = (await db.client.create({ data: { tenantId: tenant, type: 'PERSON', name: allowed, displayName: allowed,
      tckn: identity, identityNo: identity, phone, email, address: 'PRIVATE STREET', notes: 'PRIVATE NOTE',
      bankAccounts: { create: { bankName: 'Synthetic', iban } },
      addresses: { create: { street: 'PRIVATE CANONICAL STREET', city: 'Izmir', district: 'Konak', isPrimary: true } },
    } })).id;
    const other = await db.client.create({ data: { tenantId: tenant, type: 'PERSON', name: denied, displayName: denied } });
    for (const [id, name] of [[clientId, file], [other.id, denied]]) {
      const c = await db.case.create({ data: { tenantId: tenant, clientId: id, type: 'GENERAL_EXECUTION', fileNumber: name } });
      await db.caseClient.create({ data: { caseId: c.id, clientId: id } });
      if (id === clientId) caseId = c.id; else unassignedCase = c.id;
    }
  });
  afterEach(async () => { jest.restoreAllMocks(); for (const id of [tenant, foreign]) await db.tenant.delete({ where: { id } }); });
  afterAll(async () => { await app?.close(); await db?.$disconnect(); });
  async function actor(kind: 'lawyer' | 'staff' | 'none', role: 'USER' | 'ADMIN' | 'VIEWER' = 'USER', t = tenant) {
    const user = await db.user.create({ data: { tenantId: t, role, email: randomUUID() + '@example.test', name: 'Synthetic', surname: 'Actor' } });
    const lawyer = kind === 'lawyer' ? await db.lawyer.create({ data: { tenantId: t, userId: user.id, name: 'Synthetic', surname: 'Lawyer' } }) : null;
    const staff = kind === 'staff' ? await db.staffMember.create({ data: { tenantId: t, userId: user.id, firstName: 'Synthetic', lastName: 'Staff', staffType: 'MUHASEBE' } }) : null;
    return { user, lawyer, staff };
  }
  async function assign(a: Awaited<ReturnType<typeof actor>>, target = caseId, canView = true) {
    if (a.lawyer) await db.caseLawyer.create({ data: { caseId: target, lawyerId: a.lawyer.id } });
    if (a.staff) await db.caseStaff.create({ data: { caseId: target, staffMemberId: a.staff.id, canView, roleOnCase: 'MUHASEBE' } });
  }
  async function read(userId: string, route: string, status = 200) {
    let req = http(app.getHttpServer()).get(route).set('x-test-user-id', userId);
    const binary = !route.startsWith('/reports/');
    if (binary) req = req.buffer(true).parse((res, done) => {
      const chunks: Buffer[] = []; res.on('data', chunk => chunks.push(Buffer.from(chunk)));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });
    const response = await req.expect(status);
    if (status !== 200) return '';
    if (!binary) { expect(response.body.contentType).toBe('text/csv'); return response.body.data as string; }
    if (route.includes('/excel')) {
      expect(response.headers['content-type']).toContain('spreadsheetml');
      const book = new ExcelJS.Workbook(); await book.xlsx.load(response.body);
      return JSON.stringify(book.worksheets[0].getSheetValues());
    }
    expect(response.headers['content-type']).toContain('application/pdf');
    const reader = spawnSync(process.execPath, ['-e',
      "require(process.argv[1])(require('fs').readFileSync(0),{version:'v2.0.550'}).then(r=>process.stdout.write(JSON.stringify({text:r.text}))).catch(e=>{console.error(e.message);process.exitCode=1;})",
      require.resolve('pdf-parse/lib/pdf-parse.js')], { input: response.body, encoding: 'utf8', timeout: 10000, maxBuffer: 256 * 1024, env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=256' } });
    expect(reader.error).toBeUndefined(); expect(reader.status).toBe(0); return JSON.parse(reader.stdout).text as string;
  }
  async function noRows(a: Awaited<ReturnType<typeof actor>>, status = 200) {
    for (const route of routes) {
      const content = await read(a.user.id, route, status);
      expect(content).not.toContain(allowed); expect(content).not.toContain(file); expect(content).not.toContain(denied);
    }
  }
  it.each(['lawyer', 'staff'] as const)('%s canonical assignment yields masked files/CSV and excludes all other rows', async kind => {
    const a = await actor(kind); await assign(a);
    await db.case.update({ where: { id: caseId }, data: { principalAmount: 123.45 } });
    const before = await db.client.findUniqueOrThrow({ where: { id: clientId }, include: { bankAccounts: true, addresses: true } });
    for (const route of routes) {
      const content = await read(a.user.id, route);
      expect(content).toContain(allowed); expect(content).not.toContain(denied);
      if (route.includes('/clients/')) {
        expect(content).toContain('100****46'); expect(content).toContain('+905****33'); expect(content).toContain('sy****@example.test');
      } else expect(content).toContain(file);
      if (route.startsWith('/reports')) expect(content).toContain('123.45');
      for (const raw of [identity, iban, phone, email, 'PRIVATE']) expect(content).not.toContain(raw);
    }
    expect(await db.client.findUniqueOrThrow({ where: { id: clientId }, include: { bankAccounts: true, addresses: true } })).toEqual(before);
  });
  it.each(['USER', 'ADMIN'] as const)('%s without object relationship cannot export rows', async role => noRows(await actor('none', role)));
  it('VIEWER with assignment is denied despite elevated HTTP claim', async () => { const a = await actor('lawyer', 'VIEWER'); await assign(a); await noRows(a, 403); });
  it.each(['PARTNER', 'MANAGER'] as const)('%s title alone does not authorize export', async rank => {
    const a = await actor('lawyer'); await db.lawyer.update({ where: { id: a.lawyer!.id }, data: { lawyerRank: rank } }); await noRows(a);
  });
  it.each(['lawyer', 'staff'] as const)('inactive %s profile cannot export', async kind => {
    const a = await actor(kind); await assign(a);
    if (a.lawyer) await db.lawyer.update({ where: { id: a.lawyer.id }, data: { isActive: false } });
    if (a.staff) await db.staffMember.update({ where: { id: a.staff.id }, data: { isActive: false } });
    await noRows(a);
  });
  it('inactive account is denied', async () => { const a = await actor('lawyer'); await assign(a); await db.user.update({ where: { id: a.user.id }, data: { isActive: false } }); await noRows(a, 403); });
  it('canView false is not replaced by canEdit/canApprove', async () => { const a = await actor('staff'); await assign(a, caseId, false); await db.caseStaff.updateMany({ where: { staffMemberId: a.staff!.id }, data: { canEdit: true, canApprove: true } }); await noRows(a); });
  it('legacy clientId alone cannot authorize export', async () => { const a = await actor('lawyer'); await assign(a); await db.caseClient.deleteMany({ where: { caseId } }); await noRows(a); });
  it('canonical party names never fall back to an unrelated legacy client', async () => {
    const a = await actor('lawyer'); await assign(a);
    const other = await db.client.create({ data: { tenantId: tenant, name: denied, type: 'PERSON' } });
    await db.case.update({ where: { id: caseId }, data: { clientId: other.id } });
    for (const route of routes) { const content = await read(a.user.id, route); expect(content).toContain(allowed); expect(content).not.toContain(denied); }
  });
  it('selected IDs, raw search and client filters cannot escape object scope', async () => {
    const a = await actor('lawyer'); await assign(a);
    for (const route of routes.filter(r => r.includes('/cases/') && !r.startsWith('/reports'))) {
      expect(await read(a.user.id, route + '?ids=' + unassignedCase)).not.toContain(denied);
      expect(await read(a.user.id, route + '?ids=' + caseId + ',' + unassignedCase)).toContain(allowed);
      expect(await read(a.user.id, route + '?clientId=unknown')).not.toContain(allowed);
    }
    const pdf = await read(a.user.id, '/export-import/clients/pdf?search=' + identity);
    expect(pdf).toContain('100****46'); expect(pdf).not.toContain(identity);
    expect(await read(a.user.id, '/export-import/clients/excel?search=UNAUTHORIZED')).not.toContain(denied);
    expect(await read(a.user.id, '/reports/export/cases?responsibleLawyerId=unknown')).not.toContain(allowed);
  });
  it('cross-tenant actor/profile/case and client links cannot authorize rows', async () => {
    const a = await actor('lawyer', 'USER', foreign); await assign(a); await noRows(a);
    const local = await actor('lawyer');
    const fc = await db.case.create({ data: { tenantId: foreign, clientId, type: 'GENERAL_EXECUTION', fileNumber: denied } });
    await db.caseClient.create({ data: { caseId: fc.id, clientId } }); await assign(local, fc.id); await noRows(local);
  });
  it('mixed-tenant canonical parties are not included in any exported client label', async () => {
    const a = await actor('lawyer'); await assign(a);
    const foreignClient = await db.client.create({ data: { tenantId: foreign, name: denied, type: 'PERSON' } });
    await db.caseClient.create({ data: { caseId, clientId: foreignClient.id } });
    for (const route of routes) { const content = await read(a.user.id, route); expect(content).toContain(allowed); expect(content).not.toContain(denied); }
  });
  it('revocation and inactive target take effect on the next export', async () => {
    const a = await actor('lawyer'); await assign(a);
    expect(await read(a.user.id, routes[0])).toContain(allowed);
    await db.caseLawyer.deleteMany({ where: { caseId } }); await noRows(a);
    await assign(a); await db.client.update({ where: { id: clientId }, data: { isActive: false } }); await noRows(a);
  });
  it('missing actor fails before any export data query', async () => {
    const spy = jest.spyOn(db.client, 'findMany');
    await expect(service.exportClientsToExcel(tenant)).rejects.toMatchObject({ status: 403 }); expect(spy).not.toHaveBeenCalled();
  });
});