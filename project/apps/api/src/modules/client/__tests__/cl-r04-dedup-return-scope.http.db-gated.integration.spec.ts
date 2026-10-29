/**
 * CL-R04 (owner kararı 2026-10-29/30) — `POST /clients` mükerrer kimlik (dedup) dönüşü K16 okuma kapsamına tabidir;
 * create üzerinden reaktivasyon YOKTUR. Gerçek HTTP + disposable PostgreSQL (K16 `client-internal-read` düzeneğiyle aynı:
 * JWT yerine x-test-user-id, rol DB satırından; gerçek ClientController + ClientService + OfficeApprovalService).
 *
 * ÖLÇÜLEN KUSUR (öncesi, main dd42c179 — CL-R04-HTTP-MEASURE günlükleri): kapsam dışı USER GET'te 404 alırken aynı TCKN ile
 * POST 201 + HAM profil (tckn/e-posta/telefon/notlar/IBAN/adres) döndürüyordu; eligible aktör pasif kaydı create ile
 * REAKTİVE ediyordu; kapsam içi aktör bile GET'in maskelediğini POST'ta ham alıyordu.
 *
 * Kabul (owner): kapsam DIŞI aktif/pasif → AYNI genel 409 DUPLICATE_IDENTITY (profil, id, aktiflik bilgisi YOK, yazma YOK);
 * kapsam İÇİ pasif → 409 DUPLICATE_IDENTITY_INACTIVE; kapsam İÇİ aktif → GET detayı ile aynı maskeli sözleşme +
 * `_existingReturned`; reaktivasyon yalnız mevcut yetkili lifecycle ucu (PUT /clients/:id). Bağlama = işlem yetkisi ∧ kapsam.
 */
jest.mock('pdf-poppler', () => ({ convert: async () => { throw new Error('No external renderer in CL-R04 acceptance'); } }));
import { randomUUID } from 'node:crypto';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as http from 'supertest';
import { PrismaService } from '../../../prisma/prisma.service';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ClientController } from '../client.controller';
import { ClientService } from '../client.service';
import { AuditService } from '../../audit/audit.service';
import { ClientIntakeLinkService } from '../../client-intake-link/client-intake-link.service';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';

const url = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !url) throw new Error('CL-R04 acceptance requires disposable TEST_DATABASE_URL');
const dbDescribe = url ? describe : describe.skip;

/** TEST-ONLY sentetik değerler (geçerli mod-10/11 TCKN'ler; gerçek kişi DEĞİL). */
const RAW = {
  tckn: '10000000146',
  inactiveTckn: '20000000046',
  email: 'cl-r04-raw@example.test',
  phone: '+905551112233',
  notes: 'CL-R04 gizli not',
  inactiveNotes: 'pasif gizli not',
  iban: 'TR120001000000000000001234',
  address: 'CL-R04 gizli sokak',
};
const RAW_VALUES = [RAW.email, RAW.phone, RAW.notes, RAW.inactiveNotes, RAW.iban, RAW.address];

dbDescribe('CL-R04 — POST /clients dedup dönüşü: K16 kapsamı, genel 409, reaktivasyon yok (gerçek HTTP + PostgreSQL)', () => {
  jest.setTimeout(90_000);
  let db: PrismaService;
  let app: INestApplication;
  let tenant: string;
  let activeClient: string;
  let inactiveClient: string;
  let caseId: string;

  beforeAll(async () => {
    db = new PrismaService({ datasources: { db: { url } } });
    await db.$connect();
    const module = await Test.createTestingModule({
      controllers: [ClientController],
      providers: [
        { provide: ClientService, useFactory: () => new ClientService(db, new AuditService(db), new OfficeApprovalService(db as any, { log: jest.fn() } as any)) },
        { provide: ClientIntakeLinkService, useValue: {} },
      ],
    }).overrideGuard(JwtAuthGuard).useValue({
      async canActivate(context: any) {
        const req = context.switchToHttp().getRequest();
        const user = await db.user.findUnique({ where: { id: String(req.headers['x-test-user-id']) } });
        if (!user) throw new UnauthorizedException();
        req.user = user; // rol DB satırından
        return true;
      },
    }).compile();
    app = module.createNestApplication();
    await app.init();
    await app.listen(0, '127.0.0.1');
  });

  beforeEach(async () => {
    tenant = `cl-r04-test-${randomUUID()}`;
    await db.tenant.create({ data: { id: tenant, slug: tenant, name: 'CL-R04 kabul kiracısı' } });
    activeClient = (await db.client.create({ data: {
      tenantId: tenant, type: 'INDIVIDUAL', name: 'CL-R04 Aktif', firstName: 'Aktif', lastName: 'Müvekkil',
      tckn: RAW.tckn, identityNo: RAW.tckn, email: RAW.email, phone: RAW.phone, address: RAW.address, notes: RAW.notes,
      bankAccounts: { create: { bankName: 'Sentetik banka', iban: RAW.iban } },
    } })).id;
    caseId = (await db.case.create({ data: { tenantId: tenant, clientId: activeClient, type: 'GENERAL_EXECUTION', fileNumber: randomUUID() } })).id;
    await db.caseClient.create({ data: { caseId, clientId: activeClient } });
    inactiveClient = (await db.client.create({ data: {
      tenantId: tenant, type: 'INDIVIDUAL', name: 'CL-R04 Pasif', firstName: 'Pasif', lastName: 'Müvekkil',
      tckn: RAW.inactiveTckn, identityNo: RAW.inactiveTckn, notes: RAW.inactiveNotes, isActive: false,
    } })).id;
  });

  afterEach(async () => { await db.tenant.delete({ where: { id: tenant } }); });
  afterAll(async () => { await app?.close(); await db?.$disconnect(); });

  /** Aktör: rol + isteğe bağlı avukat kartı (rütbe). Dosyaya ATANMAZ → K16 okuma kapsamı BOŞ. */
  async function actor(role: 'USER' | 'ADMIN', rank: 'LAWYER' | 'PARTNER' | null) {
    const user = await db.user.create({ data: { tenantId: tenant, role, email: `${randomUUID()}@example.test`, name: 'Sentetik', surname: role } });
    const lawyer = rank ? await db.lawyer.create({ data: { tenantId: tenant, userId: user.id, name: 'Sentetik', surname: rank, lawyerRank: rank } }) : null;
    return { id: user.id, lawyerId: lawyer?.id };
  }
  /** Aktörü aktif müvekkilin dosyasına atar → K16 kapsamı İÇİNE girer. */
  async function assignToCase(a: { lawyerId?: string }, target = caseId) {
    await db.caseLawyer.create({ data: { caseId: target, lawyerId: a.lawyerId! } });
  }
  const get = (uid: string, path: string) => http(app.getHttpServer()).get(path).set('x-test-user-id', uid);
  const post = (uid: string, body: Record<string, unknown>) => http(app.getHttpServer()).post('/clients').set('x-test-user-id', uid).send(body);
  const put = (uid: string, id: string, body: Record<string, unknown>) => http(app.getHttpServer()).put('/clients/' + id).set('x-test-user-id', uid).send(body);
  const payload = (tckn: string) => ({ type: 'PERSON', firstName: 'Yeni', lastName: 'Kayıt', tckn, phone: '+905551110000', email: 'yeni-kayit@example.test' });

  const snapshot = async () => JSON.parse(JSON.stringify({
    clients: await db.client.findMany({ where: { tenantId: tenant }, orderBy: { id: 'asc' } }),
    audits: await db.auditLog.findMany({ where: { tenantId: tenant }, orderBy: { id: 'asc' } }),
  }));
  function expectGenericConflict(res: http.Response) {
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_IDENTITY');
    const text = JSON.stringify(res.body);
    for (const raw of [RAW.tckn, RAW.inactiveTckn, activeClient, inactiveClient, ...RAW_VALUES]) expect(text).not.toContain(raw);
    expect(res.body).not.toHaveProperty('id');
    expect(res.body).not.toHaveProperty('isActive');
    expect(res.body).not.toHaveProperty('data');
  }

  it('KABUL-1: kapsam DIŞI USER — GET 404; aynı TCKN ile POST → genel 409, profil/id yok, yazma ve audit yok', async () => {
    const u = await actor('USER', 'LAWYER');
    await get(u.id, '/clients/' + activeClient).expect(404);
    const before = await snapshot();
    const res = await post(u.id, payload(RAW.tckn));
    expectGenericConflict(res);
    expect(await snapshot()).toEqual(before);
  });

  it('KABUL-2: kapsam DIŞI aktif ve pasif kayıt AYNI 409 gövdesini verir (aktiflik bilgisi sızmaz)', async () => {
    const u = await actor('USER', 'LAWYER');
    const a = await post(u.id, payload(RAW.tckn));
    const b = await post(u.id, payload(RAW.inactiveTckn));
    expectGenericConflict(a);
    expectGenericConflict(b);
    expect(a.body).toEqual(b.body);
  });

  it('KABUL-3: eligible (PARTNER kartlı) ama kapsam DIŞI aktör pasif kaydı create ile REAKTİVE EDEMEZ; 409, kayıt pasif, audit yok, GET hâlâ 404', async () => {
    const a = await actor('ADMIN', 'PARTNER');
    const before = await snapshot();
    const res = await post(a.id, payload(RAW.inactiveTckn));
    expectGenericConflict(res);
    expect((await db.client.findUniqueOrThrow({ where: { id: inactiveClient } })).isActive).toBe(false);
    expect(await db.auditLog.count({ where: { tenantId: tenant, action: 'CLIENT_REACTIVATE' } })).toBe(0);
    expect(await snapshot()).toEqual(before);
    await get(a.id, '/clients/' + inactiveClient).expect(404);
  });

  it('KABUL-4: kartsız ADMIN, kapsam DIŞI → aynı genel 409 (ADMIN rolü kapsam üretmez)', async () => {
    const a = await actor('ADMIN', null);
    expectGenericConflict(await post(a.id, payload(RAW.inactiveTckn)));
    expectGenericConflict(await post(a.id, payload(RAW.tckn)));
  });

  it('KABUL-5: kapsam İÇİ USER (dosyaya atanmış) — aktif mükerrer → 201 + _existingReturned, GET detayı ile AYNI maskeli sözleşme (tckn maskeli, notes/ham IBAN yok)', async () => {
    const u = await actor('USER', 'LAWYER');
    await assignToCase(u);
    const detail = (await get(u.id, '/clients/' + activeClient).expect(200)).body.data;
    const before = await snapshot();
    const res = await post(u.id, payload(RAW.tckn)).expect(201);
    const body = res.body.data;
    expect(body._existingReturned).toBe(true);
    expect(body._reactivated).toBe(false);
    expect(body.id).toBe(activeClient);
    expect(body.tckn).toBe(detail.tckn); // '100****46'
    expect(body.tckn).toBe('100****46');
    expect(body).not.toHaveProperty('notes');
    expect(body.bankAccounts[0].iban).toBe(detail.bankAccounts[0].iban);
    const text = JSON.stringify(res.body);
    for (const raw of [RAW.tckn, RAW.notes, RAW.iban]) expect(text).not.toContain(raw);
    expect(await snapshot()).toEqual(before); // yazma yok
  });

  it('KABUL-6: kapsam İÇİ pasif mükerrer → 409 DUPLICATE_IDENTITY_INACTIVE; profil/id yok; create reaktive etmez', async () => {
    const u = await actor('USER', 'LAWYER');
    // pasif müvekkili aktörün dosyasına bağla → kapsam İÇİ
    await db.caseClient.create({ data: { caseId, clientId: inactiveClient } });
    await assignToCase(u);
    const before = await snapshot();
    const res = await post(u.id, payload(RAW.inactiveTckn));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_IDENTITY_INACTIVE');
    expect(res.body).not.toHaveProperty('id');
    expect(JSON.stringify(res.body)).not.toContain(inactiveClient);
    expect(JSON.stringify(res.body)).not.toContain(RAW.inactiveNotes);
    expect(await snapshot()).toEqual(before);
  });

  it('KABUL-7: yeni TCKN → 201 yeni kayıt (dedup dışı yol değişmez)', async () => {
    const u = await actor('USER', 'LAWYER');
    const res = await post(u.id, payload('10000000214')).expect(201);
    expect(res.body.data._existingReturned).toBeUndefined();
    expect(await db.client.count({ where: { tenantId: tenant, tckn: '10000000214' } })).toBe(1);
  });

  it('KABUL-8: reaktivasyon yalnız mevcut yetkili lifecycle ucu — eligible PARTNER PUT /clients/:id isActive:true ile aktifleştirir; USER (kart LAWYER) 403', async () => {
    const partner = await actor('ADMIN', 'PARTNER');
    const plain = await actor('USER', 'LAWYER');
    const denied = await put(plain.id, inactiveClient, { isActive: true });
    expect(denied.status).toBe(403);
    expect((await db.client.findUniqueOrThrow({ where: { id: inactiveClient } })).isActive).toBe(false);
    const ok = await put(partner.id, inactiveClient, { isActive: true });
    expect(ok.status).toBe(200);
    expect((await db.client.findUniqueOrThrow({ where: { id: inactiveClient } })).isActive).toBe(true);
  });
});
