import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaService } from '../../../prisma/prisma.service';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { PortalService } from '../portal.service';
import { PortalController } from '../portal.controller';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as http from 'supertest';
import { PortalAuthGuard } from '../portal-auth.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PortalLoginRateLimitGuard } from '../../auth/guards/login-rate-limit.guard';
import { CredentialRecoveryRateLimitGuard } from '../../auth/guards/credential-recovery-rate-limit.guard';
import { ClientFinancialDisclosurePortalService } from '../client-financial-disclosure-portal.service';

const url = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !url) throw new Error('Portal document acceptance requires disposable TEST_DATABASE_URL');
const dbDescribe = url ? describe : describe.skip;

dbDescribe('Portal document review/delete — single winner and normal-error compensation', () => {
  let a: PrismaService;
  let b: PrismaService;
  let root: string;
  let bucket: string;
  let tenantId: string;
  let clientId: string;
  let documentId: string;
  let target: string;
  let app: INestApplication;
  const originalRoot = process.env.HUKUK_DATA_ROOT;
  const bytes = Buffer.from('synthetic portal document, no production data');
  const service = (db = a) => new PortalService(db, {} as any, {} as any, {} as any, {} as any, {} as any);

  beforeAll(async () => {
    a = new PrismaService({ datasources: { db: { url } } }); b = new PrismaService({ datasources: { db: { url } } });
    await Promise.all([a.$connect(), b.$connect()]);
    // Identity fixtures replace crypto/login transports only. Existing controller route guards remain declared.
    const identity = { canActivate(context: any) {
      const req = context.switchToHttp().getRequest(); const principal = req.headers['x-test-principal'];
      if (principal === 'portal' || principal === 'foreign') req.portalUser = { clientId, tenantId: principal === 'portal' ? tenantId : 'foreign-tenant' };
      else if (principal === 'staff') req.user = { tenantId, id: 'synthetic-reviewer' };
      else throw new UnauthorizedException(); return true;
    } };
    const commands = {
      deleteDocument: (...args: Parameters<PortalService['deleteDocument']>) => service().deleteDocument(...args),
      reviewDocument: (...args: Parameters<PortalService['reviewDocument']>) => service().reviewDocument(...args),
    };
    const module = await Test.createTestingModule({ controllers: [PortalController], providers: [
      { provide: PortalService, useValue: commands }, { provide: ClientFinancialDisclosurePortalService, useValue: {} },
    ] }).overrideGuard(PortalAuthGuard).useValue(identity).overrideGuard(JwtAuthGuard).useValue(identity)
      .overrideGuard(PortalLoginRateLimitGuard).useValue({ canActivate: () => true })
      .overrideGuard(CredentialRecoveryRateLimitGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication(); await app.init(); await app.listen(0, '127.0.0.1');
  });
  beforeEach(async () => {
    tenantId = `portal-doc-test-${randomUUID()}`; clientId = `client-${randomUUID()}`;
    await a.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Synthetic portal document' } });
    await a.client.create({ data: { id: clientId, tenantId, type: 'INDIVIDUAL', firstName: 'Synthetic', lastName: 'Document' } });
    root = fs.realpathSync.native(fs.mkdtempSync(join(tmpdir(), 'codex-portal-doc-')));
    process.env.HUKUK_DATA_ROOT = root;
    bucket = join(root, 'portal-documents', tenantId); fs.mkdirSync(bucket, { recursive: true });
    target = join(bucket, 'synthetic.pdf'); fs.writeFileSync(target, bytes);
    documentId = (await a.portalDocument.create({ data: { tenantId, clientId, type: 'DIGER', title: 'Synthetic', fileName: 'synthetic.pdf', filePath: target, fileSize: bytes.length, mimeType: 'application/pdf' } })).id;
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await a.portalNotification.deleteMany({ where: { clientId } }); await a.portalDocument.deleteMany({ where: { tenantId } });
    await a.client.deleteMany({ where: { tenantId } }); await a.tenant.delete({ where: { id: tenantId } });
    // Exact own files and now-empty directories only; no recursive physical deletion.
    for (const name of fs.readdirSync(bucket)) { const p = join(bucket, name); if (fs.lstatSync(p).isFile()) fs.unlinkSync(p); else if (fs.lstatSync(p).isDirectory()) fs.rmdirSync(p); }
    fs.rmdirSync(bucket); fs.rmdirSync(join(root, 'portal-documents')); fs.rmdirSync(root);
    if (originalRoot === undefined) delete process.env.HUKUK_DATA_ROOT; else process.env.HUKUK_DATA_ROOT = originalRoot;
  });
  afterAll(async () => { await app?.close(); await Promise.all([a.$disconnect(), b.$disconnect()]); });
  async function snapshot() {
    return {
      documents: await a.portalDocument.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
      notifications: await a.portalNotification.findMany({ where: { clientId }, orderBy: { id: 'asc' } }),
      files: fs.readdirSync(bucket).sort().map(name => ({ name, bytes: fs.lstatSync(join(bucket, name)).isFile() ? fs.readFileSync(join(bucket, name)).toString('hex') : 'directory' })),
    };
  }
  function failAfterWrite(model: 'portalDocument' | 'portalNotification', action: 'delete' | 'create') {
    return new Proxy(a, { get(target, key) {
      if (key === '$transaction') return (fn: any, options: any) => target.$transaction(tx => fn(new Proxy(tx, { get(inner, name) {
        const delegate = (inner as any)[name];
        if (name !== model) return typeof delegate === 'function' ? delegate.bind(inner) : delegate;
        return new Proxy(delegate, { get(obj, op) {
          const method = obj[op]; if (op !== action) return typeof method === 'function' ? method.bind(obj) : method;
          return async (...args: any[]) => { await method.apply(obj, args); throw new Error('injected-db-failure'); };
        } });
      } })), options);
      const value = (target as any)[key]; return typeof value === 'function' ? value.bind(target) : value;
    } }) as PrismaService;
  }

  it('review/review has exactly one winner and one matching notification', async () => {
    const r = await Promise.allSettled([service(a).reviewDocument(documentId, tenantId, 'reviewer-a', true), service(b).reviewDocument(documentId, tenantId, 'reviewer-b', false)]);
    expect(r.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect((r.find(x => x.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ status: 409 });
    const s = await snapshot(); expect(s.documents).toHaveLength(1); expect(s.notifications).toHaveLength(1);
    expect(s.notifications[0].title).toBe(s.documents[0].status === 'APPROVED' ? 'Belgeniz Onaylandı' : 'Belgeniz Reddedildi');
    expect(fs.readFileSync(target)).toEqual(bytes);
  });

  it.each(['review', 'delete'] as const)('%s wins its lock first; the waiting opposing command cannot overwrite it', async first => {
    const winning = service(a); const waiting = service(b);
    let held!: () => void; let release!: () => void;
    const locked = new Promise<void>(r => { held = r; }); const proceed = new Promise<void>(r => { release = r; });
    const lock = (winning as any).lockDocument.bind(winning);
    jest.spyOn(winning as any, 'lockDocument').mockImplementation(async (...args) => { await lock(...args); held(); await proceed; });
    const one = first === 'review' ? winning.reviewDocument(documentId, tenantId, 'reviewer', true) : winning.deleteDocument(documentId, clientId, tenantId);
    await locked;
    const two = first === 'review' ? waiting.deleteDocument(documentId, clientId, tenantId) : waiting.reviewDocument(documentId, tenantId, 'reviewer', true);
    const denied = expect(two).rejects.toMatchObject({ status: first === 'review' ? 409 : 404 }); release(); await one; await denied;
    const s = await snapshot(); expect(s.documents).toHaveLength(first === 'review' ? 1 : 0); expect(s.notifications).toHaveLength(first === 'review' ? 1 : 0);
    expect(fs.existsSync(target)).toBe(first === 'review');
  });

  it('a failure after the real notification insert rolls back the review and notification together', async () => {
    const before = await snapshot();
    const s = service(); const create = s.createNotification.bind(s);
    jest.spyOn(s, 'createNotification').mockImplementation(async (...args) => { await create(...args); throw new Error('injected-db-failure'); });
    await expect(s.reviewDocument(documentId, tenantId, 'reviewer', true)).rejects.toThrow('injected-db-failure');
    expect(await snapshot()).toEqual(before);
  });

  it('a failure after the real DB delete restores the staged original file and leaves all rows unchanged', async () => {
    const before = await snapshot();
    await expect(service(failAfterWrite('portalDocument', 'delete')).deleteDocument(documentId, clientId, tenantId)).rejects.toThrow('injected-db-failure');
    expect(await snapshot()).toEqual(before);
  });

  it('final unlink failure restores the exact DB row and original file without a false success', async () => {
    const before = await snapshot(); const unlink = fs.unlinkSync;
    jest.spyOn(require('node:fs'), 'unlinkSync').mockImplementation((p: any) => { if (String(p).includes('.pending-delete-')) throw new Error('injected-unlink'); return unlink(p); });
    await expect(service().deleteDocument(documentId, clientId, tenantId)).rejects.toThrow('injected-unlink');
    expect(await snapshot()).toEqual(before);
  });

  it('rename failure leaves the row and original file unchanged', async () => {
    const before = await snapshot();
    jest.spyOn(require('node:fs'), 'renameSync').mockImplementation(() => { throw new Error('injected-rename'); });
    await expect(service().deleteDocument(documentId, clientId, tenantId)).rejects.toThrow('injected-rename');
    expect(await snapshot()).toEqual(before);
  });

  it('out-of-bucket path rejects before DB deletion or file mutation', async () => {
    await a.portalDocument.update({ where: { id: documentId }, data: { filePath: join(root, 'outside.pdf') } });
    const before = await snapshot(); await expect(service().deleteDocument(documentId, clientId, tenantId)).rejects.toThrow(); expect(await snapshot()).toEqual(before);
  });

  it.each(['tenant', 'client'])('wrong %s cannot delete or inspect the stored path', async scope => {
    const before = await snapshot();
    await expect(service().deleteDocument(documentId, scope === 'client' ? 'other-client' : clientId, scope === 'tenant' ? 'other-tenant' : tenantId)).rejects.toMatchObject({ status: 404 });
    expect(await snapshot()).toEqual(before);
  });

  it('already reviewed document remains undeletable and cannot receive a second review/notification', async () => {
    await service().reviewDocument(documentId, tenantId, 'reviewer', false); const before = await snapshot();
    await expect(service().deleteDocument(documentId, clientId, tenantId)).rejects.toMatchObject({ status: 409 });
    await expect(service().reviewDocument(documentId, tenantId, 'other', true)).rejects.toMatchObject({ status: 409 });
    expect(await snapshot()).toEqual(before);
  });

  it('a corrupted document recipient cannot create a notification outside the authenticated tenant', async () => {
    await a.portalDocument.update({ where: { id: documentId }, data: { clientId: 'not-a-client-in-this-tenant' } });
    const before = await snapshot();
    await expect(service().reviewDocument(documentId, tenantId, 'reviewer', true)).rejects.toMatchObject({ status: 404 });
    expect(await snapshot()).toEqual(before);
    expect(await a.portalNotification.count({ where: { clientId: 'not-a-client-in-this-tenant' } })).toBe(0);
  });

  it('controller delegates tenant-scoped compensated deletion and never exposes the internal file path', async () => {
    const controller = new PortalController(service(), {} as any);
    expect(await controller.deleteDocument(documentId, { portalUser: { clientId, tenantId } })).toEqual({ success: true });
    expect((await snapshot()).documents).toHaveLength(0); expect(fs.existsSync(target)).toBe(false);
  });

  it('HTTP delete rejects missing/foreign identity, then returns only success after real file and DB removal', async () => {
    const before = await snapshot();
    await http(app.getHttpServer()).delete(`/portal/documents/${documentId}`).expect(401);
    await http(app.getHttpServer()).delete(`/portal/documents/${documentId}`).set('x-test-principal', 'foreign').expect(404);
    expect(await snapshot()).toEqual(before);
    const response = await http(app.getHttpServer()).delete(`/portal/documents/${documentId}`).set('x-test-principal', 'portal').expect(200);
    expect(response.body).toEqual({ success: true }); expect((await snapshot()).documents).toHaveLength(0); expect(fs.existsSync(target)).toBe(false);
  });

  it('HTTP review has one terminal decision and notification; delete cannot remove the reviewed document', async () => {
    const route = `/portal/admin/documents/${documentId}`;
    await http(app.getHttpServer()).post(`${route}/approve`).set('x-test-principal', 'staff').send({ note: 'synthetic' }).expect(201);
    const before = await snapshot();
    await http(app.getHttpServer()).post(`${route}/reject`).set('x-test-principal', 'staff').send({}).expect(409);
    await http(app.getHttpServer()).delete(`/portal/documents/${documentId}`).set('x-test-principal', 'portal').expect(409);
    expect(await snapshot()).toEqual(before); expect(before.notifications).toHaveLength(1);
  });
});
