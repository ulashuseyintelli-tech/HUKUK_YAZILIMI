// Güvenlik ağı: modül grafiği dolaylı olarak `pdf-poppler` yüklerse Linux'ta yükleme anında process.exit(1) verir
// (CI emsali: case-create-due-currency.http.db-gated.integration.spec.ts). Bu test CaseModule'ü BİLEREK yüklemez.
jest.mock('pdf-poppler', () => ({
  convert: async () => {
    throw new Error('pdf-poppler is stubbed in unit tests');
  },
}));

import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { StorageModule } from '../../../common/storage/storage.module';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { UyapModule } from '../uyap.module';

/**
 * UYAP gönderim uçlarında ÇALIŞMA ZAMANI yetkisi — güvenlik paketi 01 P1 (DV-198 / GR-8; owner Ek 90 / Ek 91).
 * GERÇEK HTTP + tek kullanımlık PostgreSQL. Gerçek UYAP taşıması YOK: izin = yerel simülasyon (dispatched:false).
 *
 * Ölçülen kusur (main 4deb4d20, kod okuması + 02.10 / 05.10 ölçümleri): POST /uyap/document/submit, /uyap/lawsuit/{criminal,civil}
 * politika motorunu çağırmıyordu; `@CpeRequired(UYAP_SEND)` yalnız işaret olduğundan POST /uyap/xml/submit/:caseId de çağırmıyordu.
 * Dosya düzeyi vekalet denetimi (validateCasePoaForUyap) müvekkil ya da avukat BOŞKEN geçerli sayıyordu; UyapController yalnız
 * JwtAuthGuard taşıdığı için salt okur (VIEWER) ve avukat olmayan personel taslak gönderim yapabiliyordu.
 *
 * Owner kararı (Ek 90 + Ek 91): yeni kodlar (UYAP_DOCUMENT_SUBMIT, UYAP_LAWSUIT_FILE) YALNIZ aşama bağını ayırır, öteki kapılar
 * korunur · personelin avukat adına gönderimi AÇILMAZ · salt okur yazma reddi · xml/submit UYAP_SEND kapısından BİR kez geçer
 * (aşama kısıtı korunur) · HACIZ_TALEBI evrak ucunda 400 · can-perform-action istemci `context`'i 400 · gerçek taşıma kapalı.
 *
 * Güvenlik paketi 01 P5 (owner Ek 94): (a2) UYAP gönderim ailesinde aktör vekalete EK olarak dosyaya ATANMIŞ olmalı — kapı
 * ACTING_LAWYER_NOT_ASSIGNED_TO_CASE; atanmamış aktör ve avukatsız dosya RET, personel açılmadı, okuma uçları aynı.
 * Owner Ek 95: (K1) kapı yalnız onaylanan gönderim ailesinde (document/submit, xml/submit, lawsuit/*); ödeme emri test ucu
 * ve hazırlık main davranışında · (K3) geçerli atama = rol RESPONSIBLE / ASSIGNED, stajyer kaydı değil.
 * Değişiklikten ÖNCE main 6c12f009'da ölçüldü: başka (vekaletli) avukatın atandığı dosyada atanmamış vekaletli avukat ve
 * avukatsız dosyada vekaletli avukat dört uçta da 201 İZİN alıyordu. (b2) TAKIP_TALEBI evrak ucunda 400
 * UYAP_TAKIP_TALEBI_XML_SUBMIT_REQUIRED (main'de 201 izinliydi); xml/submit yolu etkilenmez. Bu ret dosya başına tek
 * gönderim garantisi DEĞİLDİR.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('UYAP-SUBMIT-RUNTIME-AUTHZ DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;

const DB_STAGES = [
  'INITIAL', 'PAYMENT_ORDER', 'WAITING_RESPONSE', 'OBJECTION', 'ENFORCEMENT', 'SEIZURE', 'SALE_REQUEST',
  'AUCTION', 'COLLECTION', 'PARTIAL_PAYMENT', 'FULL_PAYMENT', 'CLOSED', 'SUSPENDED',
] as const;

/** JwtStrategy → validateUser sözleşmesi: req.user DB'den okunan tam User satırı; pasif kullanıcı reddedilir. */
class DbUserIdentityGuard implements CanActivate {
  constructor(private readonly db: () => PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = await this.db().user.findUnique({
      where: { id: String(req.headers['x-test-user-id']) },
      include: { tenant: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

describeWithDisposableDb('UYAP gönderim uçları — çalışma zamanı yetkisi (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(600_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let tenantId: string;
  let otherTenantId: string;
  let adminId: string;
  let staffId: string;
  let viewerId: string;
  let otherAdminId: string;
  let lawyerUserId: string;
  let lawyerId: string;
  let noPoaLawyerUserId: string;
  let poaClientId: string;
  let noPoaClientId: string;
  let noPoaLawyerId: string;
  let otherLawyerId: string; // P5: dosyaya atanan BAŞKA vekaletli avukat
  let otherLawyerUserId: string;
  // P5 Ek 95 K3: stajyer kayıtları (vekaletli; dosyaya ASSIGNED rolüyle atanır)
  const interns: Record<'rank' | 'legacy', { userId: string; lawyerId: string }> = {} as never;
  const suffix = randomUUID().slice(0, 8);
  const previousUyapAvailable = process.env.UYAP_AVAILABLE;

  beforeAll(async () => {
    process.env.UYAP_AVAILABLE = 'true';
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const identity = new DbUserIdentityGuard(() => prisma);
    // BELLEK: db/domain-integration tek Jest sürecidir (runInBand). CaseModule grafiği yüklenmez; dosyalar doğrudan DB ile kurulur.
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), StorageModule, ErrorLogModule, MetricsRegistryModule, UyapModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(identity)
      .overrideGuard(AuthGuard('jwt'))
      .useValue(identity)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();
    // Uygulama kendi portunda dinler (supertest sunucuyu sahiplenmez): Linux ECONNRESET önlemi.
    await app.listen(0, '127.0.0.1');
    const scheduler = app.get(SchedulerRegistry, { strict: false });
    if (scheduler) for (const job of scheduler.getCronJobs().values()) job.stop();

    tenantId = `test-ci-usra-${suffix}`;
    otherTenantId = `test-ci-usra-b-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: 'CI USRA', slug: tenantId } });
    await prisma.tenant.create({ data: { id: otherTenantId, name: 'CI USRA B', slug: otherTenantId } });
    const user = async (tid: string, label: string, role: string) =>
      (await prisma.user.create({ data: { tenantId: tid, email: `${label}-${suffix}@example.test`, name: label, surname: 'USRA', role: role as never } })).id;
    adminId = await user(tenantId, 'admin', 'ADMIN');
    staffId = await user(tenantId, 'personel', 'USER'); // avukat kaydı YOK: büro personeli
    viewerId = await user(tenantId, 'viewer', 'VIEWER');
    otherAdminId = await user(otherTenantId, 'admin-b', 'ADMIN');
    const office = await prisma.office.create({ data: { tenantId, name: 'USRA Bürosu' } });
    lawyerUserId = await user(tenantId, 'av', 'USER');
    lawyerId = (await prisma.lawyer.create({ data: { tenantId, officeId: office.id, userId: lawyerUserId, name: 'av', surname: 'USRA', lawyerRank: 'LAWYER' } })).id;
    noPoaLawyerUserId = await user(tenantId, 'av2', 'USER');
    noPoaLawyerId = (await prisma.lawyer.create({ data: { tenantId, officeId: office.id, userId: noPoaLawyerUserId, name: 'av2', surname: 'USRA', lawyerRank: 'LAWYER' } })).id;
    otherLawyerUserId = await user(tenantId, 'av3', 'USER');
    otherLawyerId = (await prisma.lawyer.create({ data: { tenantId, officeId: office.id, userId: otherLawyerUserId, name: 'av3', surname: 'USRA', lawyerRank: 'LAWYER' } })).id;
    poaClientId = (await prisma.client.create({ data: { tenantId, type: 'COMPANY', companyName: 'USRA vekaletli', displayName: 'USRA vekaletli' } })).id;
    noPoaClientId = (await prisma.client.create({ data: { tenantId, type: 'COMPANY', companyName: 'USRA vekaletsiz', displayName: 'USRA vekaletsiz' } })).id;
    // Yalnız avukat 1'in, yalnız vekaletli müvekkil için yürürlükte GENEL vekaleti var
    const poa = await prisma.clientPowerOfAttorney.create({ data: { tenantId, clientId: poaClientId, dateIssued: new Date('2026-01-10'), status: 'ACTIVE', isActive: true, isLimited: false, scopeType: 'GENEL' } });
    await prisma.poaLawyer.create({ data: { tenantId, poaId: poa.id, lawyerId, isPrimary: true } });
    // P5: aynı vekalette BAŞKA bir avukat da vekil (o avukat dosyaya atanınca dosya düzeyi vekalet kapısı da geçer)
    await prisma.poaLawyer.create({ data: { tenantId, poaId: poa.id, lawyerId: otherLawyerId, isPrimary: false } });
    // P5 Ek 95 K3: rütbesi INTERN (Stajyer Avukat) ve eski alanı role = INTERN (Stajyer) olan iki vekaletli kayıt
    for (const [key, data] of [['rank', { lawyerRank: 'INTERN' }], ['legacy', { lawyerRank: 'LAWYER', role: 'INTERN' }]] as const) {
      const userId = await user(tenantId, `stj-${key}`, 'USER');
      const id = (await prisma.lawyer.create({ data: { tenantId, officeId: office.id, userId, name: `stj-${key}`, surname: 'USRA', ...data } as never })).id;
      await prisma.poaLawyer.create({ data: { tenantId, poaId: poa.id, lawyerId: id, isPrimary: false } });
      interns[key] = { userId, lawyerId: id };
    }
  });

  afterAll(async () => {
    if (previousUyapAvailable === undefined) delete process.env.UYAP_AVAILABLE;
    else process.env.UYAP_AVAILABLE = previousUyapAvailable;
    await app?.close();
    for (const id of [tenantId, otherTenantId]) {
      await prisma.expenseBlockReason.deleteMany({ where: { tenantId: id } });
      await prisma.uyapRequestLog.deleteMany({ where: { tenantId: id } });
      await prisma.auditLog.deleteMany({ where: { tenantId: id } });
      await prisma.tenant.delete({ where: { id } }); // hata YUTULMAZ: temizlik gerçekten silmiyorsa test kırılır
    }
    expect(await prisma.tenant.count({ where: { id: { in: [tenantId, otherTenantId] } } })).toBe(0); // temizlik kanıtı
    await prisma.$disconnect();
  });

  const as = (userId: string) => ({
    post: (path: string, body: object = {}) => request(app.getHttpServer()).post(path).set('x-test-user-id', userId).send(body),
    get: (path: string) => request(app.getHttpServer()).get(path).set('x-test-user-id', userId),
  });

  /**
   * Dosya kurulumu doğrudan DB ile (HTTP dosya açılışı bu testin konusu değil). Varsayılan: vekaletli müvekkil + avukat 1 dosyaya
   * atanmış; masraf engeli yok (EXPENSE_BLOCKING yalnız UYAP_SEND sınıflandırmalı AÇIK ExpenseBlockReason ile oluşur).
   */
  const openCase = async (label: string, opts: { clientId?: string; assignLawyer?: boolean; withDebtor?: boolean } = {}) => {
    const created = await prisma.case.create({
      data: { tenantId, fileNumber: `CI-USRA-${label}-${suffix}`, type: 'GENERAL_EXECUTION', workflowStage: 'INITIAL' } as never,
    });
    const caseId = created.id;
    await prisma.caseClient.create({ data: { caseId, clientId: opts.clientId ?? poaClientId } });
    if (opts.assignLawyer !== false) await prisma.caseLawyer.create({ data: { caseId, lawyerId } as never });
    // xml/submit XML üretimi aktif borçlu ister ("Operasyonel çıktı için aktif borçlu bulunmuyor" → kapıdan ÖNCE 400).
    if (opts.withDebtor) {
      const debtor = await prisma.debtor.create({ data: { tenantId, type: 'COMPANY', name: `USRA borçlu ${label}` } as never });
      await prisma.caseDebtor.create({ data: { caseId, debtorId: debtor.id, role: 'ASIL_BORCLU' } as never });
      // XML doğrulaması en az bir alacak kalemi ister; faizsiz kalem (faiz izdüşümü kapıdan ÖNCE reddetmesin)
      await prisma.claimItem.create({
        data: { tenantId, caseId, itemType: 'PRINCIPAL', originalAmount: 10_000, demandedAmount: 10_000, amount: 10_000, currency: 'TRY', interestAccrualStatus: 'NO_INTEREST' } as never,
      });
    }
    return caseId;
  };

  const docBody = (caseId: string, over: Record<string, unknown> = {}) => ({ caseId, documentType: 'DILEKCE', documentContent: 'ZG9j', documentName: 'dilekce.pdf', ...over });
  const lawsuitBody = (caseId: string) => ({
    caseId,
    lawsuitType: 'KARSILIKSIZ_CEK',
    uyapDavaTuru: 'X',
    courtType: 'ASLIYE',
    documentContent: 'ZG9j',
    documentName: 'dava.pdf',
    complainant: { name: 'A' },
    suspect: { name: 'B' },
    plaintiff: { name: 'A' },
    defendant: { name: 'B' },
  });
  const ENDPOINTS = [
    { name: 'document/submit', action: 'UYAP_DOCUMENT_SUBMIT', send: (userId: string, caseId: string) => as(userId).post('/uyap/document/submit', docBody(caseId)) },
    { name: 'lawsuit/criminal', action: 'UYAP_LAWSUIT_FILE', send: (userId: string, caseId: string) => as(userId).post('/uyap/lawsuit/criminal', lawsuitBody(caseId)) },
    { name: 'lawsuit/civil', action: 'UYAP_LAWSUIT_FILE', send: (userId: string, caseId: string) => as(userId).post('/uyap/lawsuit/civil', lawsuitBody(caseId)) },
  ] as const;

  const cpeRows = (caseId: string) => prisma.cpeDecisionLog.findMany({ where: { caseId }, orderBy: { createdAt: 'asc' } });
  const requestLogs = (caseId: string) => prisma.uyapRequestLog.count({ where: { caseId } });
  const setStage = (caseId: string, stage: string) => prisma.case.update({ where: { id: caseId }, data: { workflowStage: stage as never } });

  /** Ret ölçümü: 400 CPE_GATE_BLOCKED + beklenen kapı; TEK karar satırı (ret); UYAP istek kaydı YOK. */
  const expectPolicyDenied = async (label: string, res: request.Response, caseId: string, gate: string, action: string) => {
    const rows = await cpeRows(caseId);
    expect({ label, status: res.status, code: res.body?.code, gate: res.body?.cpeGateCode }).toEqual({ label, status: 400, code: 'CPE_GATE_BLOCKED', gate });
    expect({ label, rows: rows.map((r) => ({ action: r.actionCode, allowed: r.allowed, gate: r.gateCode })) }).toEqual({ label, rows: [{ action, allowed: false, gate }] });
    expect({ label, logs: await requestLogs(caseId) }).toEqual({ label, logs: 0 });
  };

  describe('İZİN: vekaletli + dosyaya atanmış avukat — aşamadan bağımsız (taslak; gerçek iletim YOK)', () => {
    it.each(DB_STAGES)('aşama %s: üç uç 201 yerel simülasyon; uç başına TEK izinli karar; dosyanın aşaması DEĞİŞMEZ', async (stage) => {
      for (const ep of ENDPOINTS) {
        const caseId = await openCase(`izin-${stage}-${ep.name.replace('/', '-')}`);
        await setStage(caseId, stage);
        const res = await ep.send(lawyerUserId, caseId);
        expect({ stage, ep: ep.name, status: res.status, success: res.body?.success }).toEqual({ stage, ep: ep.name, status: 201, success: true });
        expect(res.body.data).toMatchObject({ simulated: true, dispatched: false, providerAccepted: false, legalEffectConfirmed: false });
        expect(res.body.evkNo).toBeUndefined();
        const rows = await cpeRows(caseId);
        expect({ stage, ep: ep.name, rows: rows.map((r) => ({ action: r.actionCode, allowed: r.allowed })) }).toEqual({ stage, ep: ep.name, rows: [{ action: ep.action, allowed: true }] });
        expect(rows[0].reason).toBe('OK (aşamadan bağımsız eylem)');
        expect((await prisma.case.findUniqueOrThrow({ where: { id: caseId } })).workflowStage).toBe(stage); // aşama geçişi yok
      }
    });
  });

  describe('RED: personel / avukat olmayan aktör (personelin avukat adına gönderimi AÇILMADI)', () => {
    it.each([
      ['personel (USER, avukat kaydı yok)', () => staffId],
      ['yönetici (ADMIN, avukat kaydı yok)', () => adminId],
      ['vekaleti olmayan avukat', () => noPoaLawyerUserId],
    ])('%s → üç uçta 400 POWER_OF_ATTORNEY_MISSING; istek kaydı yok', async (label, actor) => {
      for (const ep of ENDPOINTS) {
        const caseId = await openCase(`aktor-${label.slice(0, 6)}-${ep.name.replace('/', '-')}`.replace(/[^A-Za-z0-9-]/g, ''));
        await setStage(caseId, 'SEIZURE');
        await expectPolicyDenied(`${label} ${ep.name}`, await ep.send(actor(), caseId), caseId, 'POWER_OF_ATTORNEY_MISSING', ep.action);
      }
    });
  });

  describe('RED: boş küme / vekaletsiz dosya (K2-c: karar politika motorunun aktör eşlemesinde)', () => {
    it('müvekkilsiz dosya → üç uçta red (vekaletli avukat aktörle bile); okuma ucu bugünkü yanıtı AYNEN verir', async () => {
      for (const ep of ENDPOINTS) {
        const caseId = await openCase(`muvekkilsiz-${ep.name.replace('/', '-')}`);
        await prisma.caseClient.deleteMany({ where: { caseId } });
        const read = await as(lawyerUserId).get(`/uyap/poa/validate/case/${caseId}`);
        expect({ status: read.status, body: read.body }).toEqual({ status: 200, body: { isValid: true, errors: [], canProceedToUyap: true, errorCount: 0 } });
        await expectPolicyDenied(`müvekkilsiz ${ep.name}`, await ep.send(lawyerUserId, caseId), caseId, 'POWER_OF_ATTORNEY_MISSING', ep.action);
      }
    });

    it('vekaletsiz müvekkil + atanmış avukat → üç uçta red: dosya düzeyi vekalet kapısı (assertUyapLegalAuthority) motordan ÖNCE reddeder', async () => {
      for (const ep of ENDPOINTS) {
        const caseId = await openCase(`vekaletsiz-${ep.name.replace('/', '-')}`, { clientId: noPoaClientId });
        const res = await ep.send(lawyerUserId, caseId);
        expect({ ep: ep.name, status: res.status, code: res.body?.code }).toEqual({ ep: ep.name, status: 400, code: 'UYAP_LEGAL_AUTHORITY_DENIED' });
        expect(await cpeRows(caseId)).toEqual([]);
        expect(await requestLogs(caseId)).toBe(0);
      }
    });

    it('vekaletsiz müvekkil + avukatsız dosya (dosya düzeyi kapı boş kümede GEÇER) → üç uçta politika motoru reddeder', async () => {
      for (const ep of ENDPOINTS) {
        const caseId = await openCase(`vekaletsiz-avsiz-${ep.name.replace('/', '-')}`, { clientId: noPoaClientId, assignLawyer: false });
        await expectPolicyDenied(`vekaletsiz avukatsız ${ep.name}`, await ep.send(lawyerUserId, caseId), caseId, 'POWER_OF_ATTORNEY_MISSING', ep.action);
      }
    });

    it('avukatsız dosya (dosyaya atanmış avukat YOK) + vekaleti olmayan avukat → üç uçta red; okuma ucu bugünkü yanıtı AYNEN verir', async () => {
      for (const ep of ENDPOINTS) {
        const caseId = await openCase(`avukatsiz-${ep.name.replace('/', '-')}`, { assignLawyer: false });
        const read = await as(adminId).get(`/uyap/poa/validate/case/${caseId}`);
        expect({ status: read.status, body: read.body }).toEqual({ status: 200, body: { isValid: true, errors: [], canProceedToUyap: true, errorCount: 0 } });
        await expectPolicyDenied(`avukatsız ${ep.name}`, await ep.send(noPoaLawyerUserId, caseId), caseId, 'POWER_OF_ATTORNEY_MISSING', ep.action);
      }
    });

    // P5 (owner Ek 94, karar a2): P1'deki "BİLİNEN SINIR — avukatsız dosyada müvekkilin vekaletli avukatı izin alır" testi
    // artık RET bekler (main 6c12f009'da 201 izin ölçülmüştü). Vekalet geçerli; ret dosya ataması kapısından gelir.
    it('avukatsız dosyada müvekkilin vekaletli avukatı → üç uçta 400 ACTING_LAWYER_NOT_ASSIGNED_TO_CASE (P5; P1 bilinen sınırı KAPANDI)', async () => {
      for (const ep of ENDPOINTS) {
        const caseId = await openCase(`avukatsiz-vekaletli-${ep.name.replace('/', '-')}`, { assignLawyer: false });
        await expectPolicyDenied(`avukatsız vekaletli ${ep.name}`, await ep.send(lawyerUserId, caseId), caseId, 'ACTING_LAWYER_NOT_ASSIGNED_TO_CASE', ep.action);
      }
    });
  });

  describe('P5 (owner Ek 94, karar a2) — vekalet + dosya ataması matrisi × dört gönderim ucu (xml/submit INITIAL)', () => {
    const ALL4 = [
      ...ENDPOINTS.map((e) => ({ name: e.name as string, action: e.action as string, xml: false, send: e.send })),
      { name: 'xml/submit', action: 'UYAP_SEND', xml: true, send: (userId: string, caseId: string) => as(userId).post(`/uyap/xml/submit/${caseId}`) },
    ];
    const OK_READ = { status: 200, body: { isValid: true, errors: [], canProceedToUyap: true, errorCount: 0 } };
    const label = (prefix: string, ep: { name: string }) => `${prefix}-${ep.name.replace('/', '-')}`;

    it('atanmış + vekaletli avukat → dört uçta 201 yerel simülasyon; uç başına TEK izinli karar', async () => {
      for (const ep of ALL4) {
        const caseId = await openCase(label('p5-izin', ep), { withDebtor: ep.xml });
        const res = await ep.send(lawyerUserId, caseId);
        const rows = await cpeRows(caseId);
        expect({ ep: ep.name, status: res.status, success: res.body?.success }).toEqual({ ep: ep.name, status: 201, success: true });
        expect({ ep: ep.name, rows: rows.map((r) => ({ action: r.actionCode, allowed: r.allowed })) }).toEqual({ ep: ep.name, rows: [{ action: ep.action, allowed: true }] });
        if (ep.xml) expect({ mode: res.body?.mode, transmitted: res.body?.transmitted }).toEqual({ mode: 'STUB', transmitted: false });
        else expect(res.body?.data).toMatchObject({ simulated: true, dispatched: false });
      }
    });

    it('ÖNCE ÖLÇÜLMEMİŞ DURUM: başka (vekaletli) avukatın atandığı dosyada ATANMAMIŞ vekaletli avukat → dört uçta 400 ACTING_LAWYER_NOT_ASSIGNED_TO_CASE; okuma ucu aynı', async () => {
      for (const ep of ALL4) {
        const caseId = await openCase(label('p5-baska', ep), { assignLawyer: false, withDebtor: ep.xml });
        await prisma.caseLawyer.create({ data: { caseId, lawyerId: otherLawyerId } as never });
        const read = await as(lawyerUserId).get(`/uyap/poa/validate/case/${caseId}`);
        expect({ ep: ep.name, status: read.status, body: read.body }).toEqual({ ep: ep.name, ...OK_READ });
        await expectPolicyDenied(`başka avukat atanmış ${ep.name}`, await ep.send(lawyerUserId, caseId), caseId, 'ACTING_LAWYER_NOT_ASSIGNED_TO_CASE', ep.action);
      }
    });

    it('aynı dosyaya atanmış öteki vekaletli avukat → izin (kapı aktöre özgüdür, dosyayı kilitlemez)', async () => {
      const caseId = await openCase('p5-baska-kendisi', { assignLawyer: false });
      await prisma.caseLawyer.create({ data: { caseId, lawyerId: otherLawyerId } as never });
      const res = await as(otherLawyerUserId).post('/uyap/document/submit', docBody(caseId));
      expect({ status: res.status, dispatched: res.body?.data?.dispatched }).toEqual({ status: 201, dispatched: false });
    });

    it('avukatsız dosya + vekaletli avukat → dört uçta 400 ACTING_LAWYER_NOT_ASSIGNED_TO_CASE; okuma ucu aynı', async () => {
      for (const ep of ALL4) {
        const caseId = await openCase(label('p5-avsiz', ep), { assignLawyer: false, withDebtor: ep.xml });
        const read = await as(lawyerUserId).get(`/uyap/poa/validate/case/${caseId}`);
        expect({ ep: ep.name, status: read.status, body: read.body }).toEqual({ ep: ep.name, ...OK_READ });
        await expectPolicyDenied(`avukatsız vekaletli ${ep.name}`, await ep.send(lawyerUserId, caseId), caseId, 'ACTING_LAWYER_NOT_ASSIGNED_TO_CASE', ep.action);
      }
    });

    it('atanmış + vekaletsiz avukat → dört uçta red (dosya düzeyi vekalet kapısı motordan ÖNCE); karar / istek kaydı YOK', async () => {
      for (const ep of ALL4) {
        const caseId = await openCase(label('p5-vekaletsiz', ep), { assignLawyer: false, withDebtor: ep.xml });
        await prisma.caseLawyer.create({ data: { caseId, lawyerId: noPoaLawyerId } as never });
        const res = await ep.send(noPoaLawyerUserId, caseId);
        if (ep.xml) {
          // xml/submit denetleyicisi dosya düzeyi vekalet reddini bugün gövdede döndürür (bu PR değiştirmedi).
          expect({ status: res.status, success: res.body?.success, error: res.body?.error }).toEqual({ status: 201, success: false, error: 'POA_VALIDATION_FAILED' });
        } else {
          expect({ ep: ep.name, status: res.status, code: res.body?.code }).toEqual({ ep: ep.name, status: 400, code: 'UYAP_LEGAL_AUTHORITY_DENIED' });
        }
        expect({ ep: ep.name, rows: await cpeRows(caseId), logs: await requestLogs(caseId) }).toEqual({ ep: ep.name, rows: [], logs: 0 });
      }
    });

    it.each([
      ['personel (USER, avukat kaydı yok)', () => staffId],
      ['yönetici (ADMIN, avukat kaydı yok)', () => adminId],
    ])('%s → dört uçta 400 POWER_OF_ATTORNEY_MISSING (personelin avukat adına gönderimi AÇILMADI)', async (who, actor) => {
      for (const ep of ALL4) {
        const caseId = await openCase(label(`p5-${who.slice(0, 5)}`.replace(/[^A-Za-z0-9-]/g, ''), ep), { withDebtor: ep.xml });
        await expectPolicyDenied(`${who} ${ep.name}`, await ep.send(actor(), caseId), caseId, 'POWER_OF_ATTORNEY_MISSING', ep.action);
      }
    });
  });

  describe('P5 (owner Ek 95 K3) — geçerli avukat ataması: rol ve stajyer kaydı × dört gönderim ucu', () => {
    const ALL4 = [
      ...ENDPOINTS.map((e) => ({ name: e.name as string, action: e.action as string, xml: false, send: e.send })),
      { name: 'xml/submit', action: 'UYAP_SEND', xml: true, send: (userId: string, caseId: string) => as(userId).post(`/uyap/xml/submit/${caseId}`) },
    ];

    it.each([
      ['RESPONSIBLE', true],
      ['ASSIGNED', true],
      ['ASSISTANT', false],
      ['INTERN', false],
    ] as const)('dosya rolü %s (rütbe LAWYER, vekaletli) → izin: %s', async (role, allowed) => {
      for (const ep of ALL4) {
        const caseId = await openCase(`k3-rol-${role}-${ep.name.replace('/', '-')}`, { withDebtor: ep.xml });
        await prisma.caseLawyer.updateMany({ where: { caseId, lawyerId }, data: { role, isResponsible: role === 'RESPONSIBLE' } as never });
        const res = await ep.send(lawyerUserId, caseId);
        if (allowed) {
          expect({ role, ep: ep.name, status: res.status, success: res.body?.success }).toEqual({ role, ep: ep.name, status: 201, success: true });
          expect((await cpeRows(caseId)).map((r) => ({ action: r.actionCode, allowed: r.allowed }))).toEqual([{ action: ep.action, allowed: true }]);
        } else {
          await expectPolicyDenied(`rol ${role} ${ep.name}`, res, caseId, 'ACTING_LAWYER_NOT_ASSIGNED_TO_CASE', ep.action);
        }
      }
    });

    it.each([
      ['rütbe INTERN (Stajyer Avukat)', 'rank'],
      ['eski alan Lawyer.role INTERN (Stajyer)', 'legacy'],
    ] as const)('stajyer kaydı: %s, dosya rolü ASSIGNED, vekaletli → dört uçta 400 ACTING_LAWYER_NOT_ASSIGNED_TO_CASE', async (_label, key) => {
      for (const ep of ALL4) {
        const caseId = await openCase(`k3-stj-${key}-${ep.name.replace('/', '-')}`, { assignLawyer: false, withDebtor: ep.xml });
        await prisma.caseLawyer.create({ data: { caseId, lawyerId: interns[key].lawyerId, role: 'ASSIGNED' } as never });
        await expectPolicyDenied(`stajyer ${key} ${ep.name}`, await ep.send(interns[key].userId, caseId), caseId, 'ACTING_LAWYER_NOT_ASSIGNED_TO_CASE', ep.action);
      }
    });
  });

  describe('P5 (owner Ek 95 K1) — ödeme emri test ucu main 6c12f009 ile EŞDEĞER (dosya ataması aranmaz)', () => {
    // Beklenen değerler main 6c12f009'da değişiklikten ÖNCE aynı kurulumla ölçüldü (kanıt: kap dizini kanit/k1-taban-main.*).
    const pay = async (label: string, userId: string, caseId: string) => {
      const res = await as(userId).post('/uyap/test/payment-order', { caseId });
      const rows = await cpeRows(caseId);
      return {
        label, status: res.status, success: res.body?.success ?? null, code: res.body?.code ?? null,
        simulated: res.body?.data?.simulated ?? null, dispatched: res.body?.data?.dispatched ?? null,
        rows: rows.map((r) => ({ action: r.actionCode, allowed: r.allowed, gate: r.gateCode })), logs: await requestLogs(caseId),
      };
    };
    const ALLOWED = { status: 201, success: true, code: null, simulated: true, dispatched: false, rows: [{ action: 'UYAP_SEND', allowed: true, gate: null }], logs: 1 };

    it('atanmış / atanmamış (başka avukat) / avukatsız vekaletli avukat → 201 tek UYAP_SEND izni; personel → 400 POWER_OF_ATTORNEY_MISSING', async () => {
      const baska = await openCase('k1-baska', { assignLawyer: false });
      await prisma.caseLawyer.create({ data: { caseId: baska, lawyerId: otherLawyerId } as never });
      const yardimci = await openCase('k1-yardimci');
      await prisma.caseLawyer.updateMany({ where: { caseId: yardimci, lawyerId }, data: { role: 'ASSISTANT' } as never });
      expect([
        await pay('atanmis', lawyerUserId, await openCase('k1-atanmis')),
        await pay('atanmamis-baska', lawyerUserId, baska),
        await pay('avukatsiz', lawyerUserId, await openCase('k1-avsiz', { assignLawyer: false })),
        await pay('yardimci-rol', lawyerUserId, yardimci),
        await pay('personel', staffId, await openCase('k1-personel')),
      ]).toEqual([
        { label: 'atanmis', ...ALLOWED },
        { label: 'atanmamis-baska', ...ALLOWED },
        { label: 'avukatsiz', ...ALLOWED },
        { label: 'yardimci-rol', ...ALLOWED },
        { label: 'personel', status: 400, success: null, code: 'CPE_GATE_BLOCKED', simulated: null, dispatched: null, rows: [{ action: 'UYAP_SEND', allowed: false, gate: 'POWER_OF_ATTORNEY_MISSING' }], logs: 0 },
      ]);
    });
  });

  describe('P5 (owner Ek 94, karar b2) — TAKIP_TALEBI yalnız xml/submit yolundan', () => {
    it('document/submit TAKIP_TALEBI (atanmış vekaletli avukat) → 400 UYAP_TAKIP_TALEBI_XML_SUBMIT_REQUIRED + açık ileti; karar / istek kaydı YOK', async () => {
      for (const stage of ['INITIAL', 'SEIZURE']) {
        const caseId = await openCase(`p5-takip-${stage}`);
        await setStage(caseId, stage);
        const res = await as(lawyerUserId).post('/uyap/document/submit', docBody(caseId, { documentType: 'TAKIP_TALEBI' }));
        expect({ stage, status: res.status, code: res.body?.code, message: res.body?.message }).toEqual({
          stage,
          status: 400,
          code: 'UYAP_TAKIP_TALEBI_XML_SUBMIT_REQUIRED',
          message: 'Takip talebi yalnız XML gönderim yolundan (xml/submit) gönderilebilir.',
        });
        expect({ stage, rows: await cpeRows(caseId), logs: await requestLogs(caseId) }).toEqual({ stage, rows: [], logs: 0 });
      }
    });

    it('xml/submit INITIAL hâlâ izinli: iç çağrı TAKIP_TALEBI ile tek UYAP_SEND kararı + istek kaydı TAKIP_TALEBI', async () => {
      const caseId = await openCase('p5-xml-takip', { withDebtor: true });
      const res = await as(lawyerUserId).post(`/uyap/xml/submit/${caseId}`);
      expect({ status: res.status, success: res.body?.success, transmitted: res.body?.transmitted }).toEqual({ status: 201, success: true, transmitted: false });
      const rows = await cpeRows(caseId);
      expect(rows.map((r) => ({ action: r.actionCode, allowed: r.allowed }))).toEqual([{ action: 'UYAP_SEND', allowed: true }]);
      const logs = await prisma.uyapRequestLog.findMany({ where: { caseId } });
      expect(logs.map((l) => ({ type: l.requestType, documentType: (l.requestData as any)?.documentType }))).toEqual([{ type: 'submitDocument', documentType: 'TAKIP_TALEBI' }]);
    });
  });

  describe('RED: korunan kapılar (kapalı / arşiv / masraf / UYAP kapalı) — aşama SEIZURE', () => {
    it.each([
      ['kapalı dosya (HITAM)', 'CASE_CLOSED', (caseId: string) => prisma.case.update({ where: { id: caseId }, data: { caseStatus: 'HITAM' as never } })],
      ['arşivdeki dosya', 'CASE_ARCHIVED', (caseId: string) => prisma.case.update({ where: { id: caseId }, data: { isArchived: true } })],
      ['dosyada UYAP kapalı', 'UYAP_DISABLED', (caseId: string) => prisma.case.update({ where: { id: caseId }, data: { allowUyapActions: false } })],
      // Kanonik masraf engeli: UYAP_SEND sınıflandırmalı AÇIK ExpenseBlockReason (sıradan ödenmemiş talep tek başına bloklamaz;
      // uyap-expense-blocking-fact.provider.ts). Olgu dosya düzeyindedir → yeni kodlar UYAP_SEND ile AYNI olguyu okur.
      [
        'açık UYAP masraf engeli',
        'EXPENSE_BLOCKING',
        (caseId: string) =>
          prisma.expenseBlockReason.create({ data: { tenantId, caseId, blockedActionCode: 'UYAP_SEND', reasonCode: 'PAYMENT_NOT_RECEIVED', createdById: adminId } as never }),
      ],
    ])('%s → üç uçta red (%s)', async (label, gate, mutate) => {
      for (const ep of ENDPOINTS) {
        const caseId = await openCase(`kapi-${gate}-${ep.name.replace('/', '-')}`);
        await setStage(caseId, 'SEIZURE');
        await (mutate as (id: string) => Promise<unknown>)(caseId);
        await expectPolicyDenied(`${label} ${ep.name}`, await ep.send(lawyerUserId, caseId), caseId, gate as string, ep.action);
      }
    });

    it('başka büronun dosyası → 400 UYAP_LEGAL_AUTHORITY_DENIED; politika kararı / istek kaydı YOK', async () => {
      for (const ep of ENDPOINTS) {
        const caseId = await openCase(`buro-${ep.name.replace('/', '-')}`);
        const res = await ep.send(otherAdminId, caseId);
        expect({ ep: ep.name, status: res.status, code: res.body?.code }).toEqual({ ep: ep.name, status: 400, code: 'UYAP_LEGAL_AUTHORITY_DENIED' });
        expect(await cpeRows(caseId)).toEqual([]);
        expect(await requestLogs(caseId)).toBe(0);
      }
    });
  });

  describe('HACIZ_TALEBI evrak ucunda reddedilir (owner Ek 91 B3-iii)', () => {
    it('vekaletli avukat bile → 400 UYAP_HACIZ_TALEBI_ENDPOINT_REQUIRED + açık ileti; karar / istek kaydı YOK', async () => {
      const caseId = await openCase('haciz-talebi');
      const res = await as(lawyerUserId).post('/uyap/document/submit', docBody(caseId, { documentType: 'HACIZ_TALEBI' }));
      expect({ status: res.status, code: res.body?.code, message: res.body?.message }).toEqual({
        status: 400,
        code: 'UYAP_HACIZ_TALEBI_ENDPOINT_REQUIRED',
        message: 'Haciz talebi yalnız /uyap/haciz ucundan gönderilebilir.',
      });
      expect(await cpeRows(caseId)).toEqual([]);
      expect(await requestLogs(caseId)).toBe(0);
    });
  });

  describe('xml/submit: UYAP_SEND kapısından BİR kez geçer (owner Ek 91 B2-a; aşama kısıtı KORUNDU)', () => {
    it('vekaletli avukat, INITIAL: tek UYAP_SEND kararı (UYAP_DOCUMENT_SUBMIT satırı YOK); yanıt yerel simülasyon', async () => {
      const caseId = await openCase('xml-initial', { withDebtor: true });
      const res = await as(lawyerUserId).post(`/uyap/xml/submit/${caseId}`);
      const rows = await cpeRows(caseId);
      expect({ body: rows.length === 1 ? 'ok' : res.body, rows: rows.map((r) => ({ action: r.actionCode, allowed: r.allowed })) }).toEqual({ body: 'ok', rows: [{ action: 'UYAP_SEND', allowed: true }] });
      expect({ status: res.status, success: res.body?.success, mode: res.body?.mode, transmitted: res.body?.transmitted, evkNo: res.body?.evkNo }).toEqual({
        status: 201,
        success: true,
        mode: 'STUB',
        transmitted: false,
        evkNo: null,
      });
    });

    it('vekaletli avukat, SEIZURE: aşama reddi (INVALID_TRANSITION) — tek UYAP_SEND kararı; istek kaydı YOK', async () => {
      const caseId = await openCase('xml-seizure', { withDebtor: true });
      await setStage(caseId, 'SEIZURE');
      const res = await as(lawyerUserId).post(`/uyap/xml/submit/${caseId}`);
      const rows = await cpeRows(caseId);
      expect({ status: res.status, code: res.body?.code, cpeCode: res.body?.cpeCode }).toEqual({ status: 400, code: 'CPE_GATE_BLOCKED', cpeCode: 'INVALID_TRANSITION' });
      expect(rows.map((r) => ({ action: r.actionCode, allowed: r.allowed, code: r.code }))).toEqual([{ action: 'UYAP_SEND', allowed: false, code: 'INVALID_TRANSITION' }]);
      expect(await requestLogs(caseId)).toBe(0);
    });

    it('personel, INITIAL → 400 POWER_OF_ATTORNEY_MISSING (bugün kapısızdı); tek UYAP_SEND kararı', async () => {
      const caseId = await openCase('xml-personel', { withDebtor: true });
      await expectPolicyDenied('xml personel', await as(staffId).post(`/uyap/xml/submit/${caseId}`), caseId, 'POWER_OF_ATTORNEY_MISSING', 'UYAP_SEND');
    });
  });

  describe('salt okur (VIEWER): yazma / yürütme POST\'ları 403; okuma nitelikli POST\'lar açık', () => {
    it('gönderim / dava / xml-submit / haciz / test ödeme emri / xml-import / retry → 403 VIEWER_WRITE_DENIED; karar / istek kaydı YOK', async () => {
      const caseId = await openCase('viewer');
      const calls: Array<[string, object]> = [
        ['/uyap/document/submit', docBody(caseId)],
        ['/uyap/lawsuit/criminal', lawsuitBody(caseId)],
        ['/uyap/lawsuit/civil', lawsuitBody(caseId)],
        [`/uyap/xml/submit/${caseId}`, {}],
        ['/uyap/haciz', { caseId, caseDebtorId: 'x', targetType: 'BANK', targetDetails: {}, amount: 1 }],
        ['/uyap/test/payment-order', { caseId }],
        ['/uyap/xml/import', { xml: '<x/>' }],
        ['/uyap/retry-failed', {}],
      ];
      for (const [path, body] of calls) {
        const res = await as(viewerId).post(path, body);
        expect({ path, status: res.status, code: res.body?.code }).toEqual({ path, status: 403, code: 'VIEWER_WRITE_DENIED' });
      }
      expect(await cpeRows(caseId)).toEqual([]);
      expect(await requestLogs(caseId)).toBe(0);
    });

    it('xml/validate ve debtor/assets (okuma nitelikli) salt okura açık kalır', async () => {
      const caseId = await openCase('viewer-okuma');
      const validate = await as(viewerId).post('/uyap/xml/validate', { xml: '<x/>' });
      expect(validate.status).toBe(201);
      expect(typeof validate.body?.isValid).toBe('boolean');
      const assets = await as(viewerId).post('/uyap/debtor/assets', { debtorIdentityNo: '11111111110', caseId });
      expect({ status: assets.status, success: assets.body?.success }).toEqual({ status: 201, success: true });
    });
  });

  describe('can-perform-action (K3): uç korunur, istemci bağlamı 400 — UYUMLULUK DEĞİŞİKLİĞİ', () => {
    it('gövdede `context` (aktör sahteciliği) → 400; karar satırı YAZILMAZ', async () => {
      const caseId = await openCase('k3-context');
      const res = await as(staffId).post(`/policy-engine/cases/${caseId}/can-perform-action`, {
        context: { authenticatedUserId: lawyerUserId, tenantId, actingLawyerId: lawyerId },
      });
      expect(res.status).toBe(400);
      expect(await cpeRows(caseId)).toEqual([]);
    });

    it('bağlamsız gövde → 200 ve eski yanıt biçimi { success, data }', async () => {
      const caseId = await openCase('k3-bos');
      const res = await as(staffId).post(`/policy-engine/cases/${caseId}/can-perform-action`, {});
      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(['data', 'success']);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data?.allowed).toBe('boolean');
    });

    it('BİLİNEN SINIR (ölçüm, bu PR değiştirmedi): üretim doğrulama hattında `actionCode` içeren her gövde de 400 (DTO süslemesiz → forbidNonWhitelisted)', async () => {
      const caseId = await openCase('k3-actioncode');
      const res = await as(staffId).post(`/policy-engine/cases/${caseId}/can-perform-action`, { actionCode: 'UYAP_SEND' });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('property actionCode should not exist');
    });
  });
});
