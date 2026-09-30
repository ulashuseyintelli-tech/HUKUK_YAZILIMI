// CaseModule grafiği `pdf-poppler`'ı yükler; paket Linux'ta yükleme anında process.exit(1) verir
// (CI emsali: case-create-instrument-admission.http.db-gated.integration.spec.ts).
jest.mock('pdf-poppler', () => ({
  convert: async () => {
    throw new Error('pdf-poppler is stubbed in unit tests');
  },
}));

import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { OfficeApprovalStatus, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { StorageModule } from '../../../common/storage/storage.module';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CEK_AUTO_GENERATE_FORMATION_OPTIONS } from '../../claim-item/formation-cek/cek-auto-generate-formation.service';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { LawyerModule } from '../../lawyer/lawyer.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { CaseModule } from '../case.module';

/**
 * K3 kararı A (owner GO 2026-09-30) — dosya açılışında avukat atamasına YÖNETİMCE açıkça belirlenmiş varsayılan
 * yetkinin anlık kopyası. GERÇEK HTTP + disposable PostgreSQL; yetki verme YALNIZ gerçek yönetim yoluyla
 * (PUT /lawyers/:id, ADMIN/PARTNER kapısı + LAWYER_PRIVILEGE_CHANGED denetimi) yapılır — DB tetikleyicisi YOK.
 *
 * Ölçülen: yönetimce yetkilendirilmiş avukatın açılış K3 talebi mevcut ikinci avukat onayı akışına girer (kesin
 * tazminat kalemi YOK); varsayılanı olmayan / mali izni açıkça false / kaynağı yönetimce doğrulanmamış (yalnız
 * oluşturmada doldurulmuş) avukat reddedilir; avukat kendi varsayılanını değiştiremez; VIEWER ve başka büro reddedilir,
 * başka büro avukatıyla açılış tx öncesi 400 ve kısmi yazım YOK; anlık kopya sonraki varsayılan değişikliğinden
 * etkilenmez; dosya bazlı geri alma (PATCH /cases/:id/lawyers/:caseLawyerId) sonraki K3 talebini engeller; her karar
 * CASE_OPEN_LAWYER_DEFAULT_PERMISSIONS denetiminde izlenir.
 *
 * KANIT BAĞI (owner GO 2026-09-30): dayanak, AYNI tenant + AYNI avukat için EN SON yönetim kaydının parmak izinin GÜNCEL
 * değerle eşleşmesidir. Aşağıdaki doğrudan DB yazmaları yetki VERMEK için değil, denetimsiz/uygulama dışı bir yazmanın
 * (veri düzeltmesi, geri yükleme, eski B11 kaydı) yetki KAZANDIRAMADIĞINI göstermek içindir (negatif senaryo).
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('CASE-OPEN-DEFAULT-PERMISSIONS DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;

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

const FINANCE_GRANT = { canEditCase: true, canGenerateDocs: true, canViewFinance: true, canEditFinance: true };

describeWithDisposableDb('K3-A dosya açılışında yönetim varsayılan yetkisi (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(180_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  const tenantIds = new Set<string>();
  const savedManualFlag = process.env.MANUAL_CASE_INSTRUMENTS;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        StorageModule,
        ErrorLogModule,
        MetricsRegistryModule,
        CaseModule,
        LawyerModule,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new DbUserIdentityGuard(() => prisma))
      .overrideProvider(CEK_AUTO_GENERATE_FORMATION_OPTIONS)
      .useValue({ enabled: true, allowDraftLegalContent: true })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();
  });

  beforeEach(() => {
    process.env.MANUAL_CASE_INSTRUMENTS = 'true';
  });

  afterAll(async () => {
    await app?.close();
    if (savedManualFlag === undefined) delete process.env.MANUAL_CASE_INSTRUMENTS;
    else process.env.MANUAL_CASE_INSTRUMENTS = savedManualFlag;
    // K3 REQUESTED testleri ClaimItemFormationIntent yazar (DELETE tetikleyiciyle yasak, değiştirilemez hukuki kayıt) →
    // o tenant'lar disposable DB'de KALIR (emsal: case-open-check-penalty-formation db spec'i). Diğerleri silinir.
    for (const tenantId of tenantIds) {
      await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());
  const as = (userId: string) => ({
    post: (path: string, body: object) => http().post(path).set('x-test-user-id', userId).send(body),
    put: (path: string, body: object) => http().put(path).set('x-test-user-id', userId).send(body),
    patch: (path: string, body: object) => http().patch(path).set('x-test-user-id', userId).send(body),
  });

  /** Büro: ADMIN, bağlı PARTNER (yönetim), açan avukat (LAWYER), ikinci onaycı PARTNER, VIEWER; keşideci + ciranta. */
  async function office(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-ci-k3a-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `CI K3A ${label}`, slug: tenantId } });
    const off = await prisma.office.create({ data: { tenantId, name: `CI K3A ofis ${label}` } });
    const person = async (key: string, role: 'ADMIN' | 'USER' | 'VIEWER', rank: 'LAWYER' | 'PARTNER' | null) => {
      const user = await prisma.user.create({
        data: { tenantId, email: `${key}-${suffix}@example.test`, name: key, surname: 'K3A', role },
      });
      const lawyer = rank
        ? await prisma.lawyer.create({
            data: { tenantId, officeId: off.id, userId: user.id, name: key, surname: 'K3A', lawyerRank: rank },
          })
        : null;
      return { userId: user.id, lawyerId: lawyer?.id as string };
    };
    const admin = await person('admin', 'ADMIN', null);
    const partner = await person('partner', 'USER', 'PARTNER');
    const opener = await person('opener', 'USER', 'LAWYER');
    await person('approver', 'USER', 'PARTNER');
    const viewer = await person('viewer', 'VIEWER', 'LAWYER');
    const kesideci = await prisma.debtor.create({ data: { tenantId, type: 'COMPANY', name: `K3A kesideci ${label}` } as never });
    const ciranta = await prisma.debtor.create({ data: { tenantId, type: 'COMPANY', name: `K3A ciranta ${label}` } as never });
    return { tenantId, suffix, admin, partner, opener, viewer, kesideciId: kesideci.id, cirantaId: ciranta.id };
  }
  type Office = Awaited<ReturnType<typeof office>>;

  /** Yönetim yolu: PARTNER, PUT /lawyers/:id ile varsayılanı AÇIKÇA değiştirir (gerçek kapı + denetim). */
  async function managementSetsDefaults(o: Office, lawyerId: string, defaults: Record<string, boolean> | null) {
    const res = await as(o.partner.userId).put(`/lawyers/${lawyerId}`, { defaultPermissions: defaults });
    expect(res.status).toBe(200);
  }

  const amount = 12_345.67;
  async function caseOpenPayload(o: Office, openerLawyerId: string, label: string) {
    const caseDebtors = [
      { debtorId: o.kesideciId, role: 'KESIDECI' },
      { debtorId: o.cirantaId, role: 'CIRANTA' },
    ];
    // Sihirbazın gösterdiği sunucu hesaplı taslak önizleme (yazma yok) → previewHash
    const preview = await as(o.opener.userId).post('/claim-items/cek-formation/preview', {
      instruments: [{ amount, currency: 'TRY', isBounced: true, bounceDate: '2026-09-01' }],
      debtors: caseDebtors.map((d) => ({ tempId: d.debtorId, role: d.role })),
    });
    expect(preview.status).toBe(201);
    return {
      fileNumber: `CI-K3A-${label}-${o.suffix}`,
      type: 'CHECK',
      lawyers: [{ id: openerLawyerId, name: 'opener', surname: 'K3A' }],
      caseDebtors,
      instruments: [
        {
          type: 'CEK',
          amount,
          issueDate: '2026-08-01',
          documentNo: `K3A-${label}-${o.suffix}`,
          currency: 'TRY',
          source: 'MANUAL',
          dueDate: '2026-08-31',
          isBounced: true,
          bounceDate: '2026-09-01',
        },
      ],
      checkPenaltyFormation: { requested: true, idempotencyKey: `wizard-${label}-${o.suffix}`, previewHash: preview.body.data.previewHash },
    };
  }

  const openingAudit = async (tenantId: string, caseId: string) =>
    prisma.auditLog.findFirst({ where: { tenantId, entityType: 'CASE', entityId: caseId, action: 'CASE_OPEN_LAWYER_DEFAULT_PERMISSIONS' } });

  async function tenantCounts(tenantId: string) {
    const [cases, caseLawyers, approvals, claimItems, instruments, intents] = await Promise.all([
      prisma.case.count({ where: { tenantId } }),
      prisma.caseLawyer.count({ where: { case: { tenantId } } }),
      prisma.officeApprovalRequest.count({ where: { tenantId } }),
      prisma.claimItem.count({ where: { tenantId } }),
      prisma.caseInstrument.count({ where: { tenantId } }),
      prisma.claimItemFormationIntent.count({ where: { tenantId } }),
    ]);
    return { cases, caseLawyers, approvals, claimItems, instruments, intents };
  }

  it('YÖNETİMCE YETKİLENDİRİLMİŞ: anlık kopya + DEFAULT kaynak; açılış K3 talebi ikinci avukat onayına girer (kesin tazminat YOK); sonraki varsayılan değişikliği dosyayı değiştirmez; geri alma sonraki talebi engeller', async () => {
    const o = await office('granted');
    await managementSetsDefaults(o, o.opener.lawyerId, FINANCE_GRANT);
    const basis = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId: o.tenantId, action: 'LAWYER_PRIVILEGE_CHANGED', entityId: o.opener.lawyerId },
    });
    expect(basis.userId).toBe(o.partner.userId);
    expect(basis.metadata).toEqual({
      changedFields: ['defaultPermissions'],
      defaultPermissionsFingerprint: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });

    const res = await as(o.opener.userId).post('/cases', await caseOpenPayload(o, o.opener.lawyerId, 'granted'));
    expect(res.status).toBe(201);
    const caseId = res.body.id as string;
    const assignment = await prisma.caseLawyer.findFirstOrThrow({ where: { caseId, lawyerId: o.opener.lawyerId } });
    expect(assignment.casePermissions).toEqual(FINANCE_GRANT);
    expect(assignment.permissionSource).toBe('DEFAULT');

    // Mevcut K3 akışı: ikinci avukat onayı bekleyen TEK talep; kesin tazminat kalemi onaydan önce YOK
    const results = res.body.checkPenaltyFormation?.results;
    expect(results).toEqual([expect.objectContaining({ status: 'REQUESTED' })]);
    const approvals = await prisma.officeApprovalRequest.findMany({ where: { tenantId: o.tenantId } });
    expect(approvals.map((a) => [a.id, a.status])).toEqual([[results[0].approvalRequestId, OfficeApprovalStatus.PENDING_APPROVAL]]);
    expect(await prisma.claimItem.count({ where: { tenantId: o.tenantId, itemType: 'CHECK_PENALTY' } })).toBe(0);

    // Denetim: uygulanan izinler + dayanak kayıt
    const audit = await openingAudit(o.tenantId, caseId);
    expect(audit?.userId).toBe(o.opener.userId);
    expect((audit?.metadata as any).assignments).toEqual([
      expect.objectContaining({
        caseLawyerId: assignment.id,
        lawyerId: o.opener.lawyerId,
        outcome: 'APPLIED',
        permissions: FINANCE_GRANT,
        basisAuditLogId: basis.id,
      }),
    ]);

    // Anlık kopya: sonraki varsayılan değişikliği mevcut dosyayı DEĞİŞTİRMEZ
    await managementSetsDefaults(o, o.opener.lawyerId, { ...FINANCE_GRANT, canEditFinance: false });
    expect((await prisma.caseLawyer.findUniqueOrThrow({ where: { id: assignment.id } })).casePermissions).toEqual(FINANCE_GRANT);

    // Dosya bazlı geri alma (mevcut K2 kapısı, yönetim) → sonraki K3 talebi reddedilir, yeni onay talebi YOK
    const revoke = await as(o.partner.userId).patch(`/cases/${caseId}/lawyers/${assignment.id}`, {
      casePermissions: { ...FINANCE_GRANT, canEditFinance: false },
    });
    expect(revoke.status).toBe(200);
    expect((await prisma.caseLawyer.findUniqueOrThrow({ where: { id: assignment.id } })).permissionSource).toBe('CUSTOM');
    const instrument = await prisma.caseInstrument.findFirstOrThrow({ where: { tenantId: o.tenantId, caseId } });
    const next = await as(o.opener.userId).post('/claim-items/auto-generate', {
      caseId,
      documentId: instrument.id,
      documentType: 'CEK',
      idempotencyKey: `after-revoke-${randomUUID()}`,
      liableDebtorIds: [o.kesideciId, o.cirantaId],
      totalAmount: amount,
      currency: 'TRY',
      checkPenaltyRate: 10,
    });
    expect(next.status).toBe(403);
    expect(await prisma.officeApprovalRequest.count({ where: { tenantId: o.tenantId } })).toBe(1);
  });

  it('VARSAYILANI OLMAYAN avukat: yetki yazılmaz ("tümü açık" YOK); K3 talebi CASE_FINANCE_PERMISSION_REQUIRED ile reddedilir; denetimde NO_DEFAULTS', async () => {
    const o = await office('nodefault');
    const res = await as(o.opener.userId).post('/cases', await caseOpenPayload(o, o.opener.lawyerId, 'nodefault'));
    expect(res.status).toBe(201);
    const assignment = await prisma.caseLawyer.findFirstOrThrow({ where: { caseId: res.body.id, lawyerId: o.opener.lawyerId } });
    expect(assignment.casePermissions).toBeNull();
    expect(res.body.checkPenaltyFormation?.results).toEqual([
      expect.objectContaining({ status: 'REJECTED', errorCode: 'CASE_FINANCE_PERMISSION_REQUIRED' }),
    ]);
    expect(await prisma.officeApprovalRequest.count({ where: { tenantId: o.tenantId } })).toBe(0);
    expect(((await openingAudit(o.tenantId, res.body.id))?.metadata as any).assignments).toEqual([
      expect.objectContaining({ outcome: 'NOT_APPLIED', reason: 'NO_DEFAULTS' }),
    ]);
  });

  it('MALİ İZNİ AÇIKÇA FALSE: false değerler KORUNUR; K3 talebi reddedilir', async () => {
    const o = await office('false');
    const defaults = { canEditCase: true, canViewFinance: true, canEditFinance: false };
    await managementSetsDefaults(o, o.opener.lawyerId, defaults);
    const res = await as(o.opener.userId).post('/cases', await caseOpenPayload(o, o.opener.lawyerId, 'false'));
    expect(res.status).toBe(201);
    const assignment = await prisma.caseLawyer.findFirstOrThrow({ where: { caseId: res.body.id, lawyerId: o.opener.lawyerId } });
    expect(assignment.casePermissions).toEqual(defaults);
    expect(res.body.checkPenaltyFormation?.results).toEqual([
      expect.objectContaining({ status: 'REJECTED', errorCode: 'CASE_FINANCE_PERMISSION_REQUIRED' }),
    ]);
    expect(await prisma.officeApprovalRequest.count({ where: { tenantId: o.tenantId } })).toBe(0);
  });

  it('KAYNAĞI YÖNETİMCE DOĞRULANMAMIŞ: yalnız OLUŞTURMADA doldurulmuş varsayılan (denetimsiz yol) dayanak SAYILMAZ', async () => {
    const o = await office('createonly');
    // Oluşturma yolu (web formu rütbeye göre önceden doldurur; bu yolda yetki kapısı/denetim yok)
    const created = await as(o.partner.userId).post('/lawyers', {
      name: 'Yeni',
      surname: 'Avukat',
      barNumber: `BR-${o.suffix}`,
      barCity: 'İstanbul',
      lawyerRank: 'LAWYER',
      defaultPermissions: FINANCE_GRANT,
    });
    expect(created.status).toBe(201);
    const newLawyerId = created.body.id as string;
    expect((await prisma.lawyer.findUniqueOrThrow({ where: { id: newLawyerId } })).defaultPermissions).toEqual(FINANCE_GRANT);

    const payload = await caseOpenPayload(o, o.opener.lawyerId, 'createonly');
    const res = await as(o.opener.userId).post('/cases', {
      ...payload,
      lawyers: [...payload.lawyers, { id: newLawyerId, name: 'Yeni', surname: 'Avukat' }],
    });
    expect(res.status).toBe(201);
    const assignment = await prisma.caseLawyer.findFirstOrThrow({ where: { caseId: res.body.id, lawyerId: newLawyerId } });
    expect(assignment.casePermissions).toBeNull();
    expect(((await openingAudit(o.tenantId, res.body.id))?.metadata as any).assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lawyerId: newLawyerId, outcome: 'NOT_APPLIED', reason: 'SOURCE_NOT_MANAGEMENT_VERIFIED' }),
      ]),
    );
  });

  it('AVUKAT KENDİ VARSAYILANINI DEĞİŞTİREMEZ (PUT ve PATCH): 403, satır ve denetim değişmez; açılışta mali yetki YOK', async () => {
    const o = await office('self');
    for (const method of ['put', 'patch'] as const) {
      const res = await as(o.opener.userId)[method](`/lawyers/${o.opener.lawyerId}`, { defaultPermissions: FINANCE_GRANT });
      expect({ method, status: res.status }).toEqual({ method, status: 403 });
    }
    expect((await prisma.lawyer.findUniqueOrThrow({ where: { id: o.opener.lawyerId } })).defaultPermissions).toBeNull();
    expect(await prisma.auditLog.count({ where: { tenantId: o.tenantId, action: 'LAWYER_PRIVILEGE_CHANGED' } })).toBe(0);

    const res = await as(o.opener.userId).post('/cases', await caseOpenPayload(o, o.opener.lawyerId, 'self'));
    expect(res.status).toBe(201);
    expect((await prisma.caseLawyer.findFirstOrThrow({ where: { caseId: res.body.id } })).casePermissions).toBeNull();
    expect(res.body.checkPenaltyFormation?.results).toEqual([
      expect.objectContaining({ status: 'REJECTED', errorCode: 'CASE_FINANCE_PERMISSION_REQUIRED' }),
    ]);
  });

  it('VIEWER: varsayılan değiştiremez ve dosya açamaz; hiçbir satır yazılmaz', async () => {
    const o = await office('viewer');
    const put = await as(o.viewer.userId).put(`/lawyers/${o.viewer.lawyerId}`, { defaultPermissions: FINANCE_GRANT });
    expect(put.status).toBe(403);
    const before = await tenantCounts(o.tenantId);
    const res = await as(o.viewer.userId).post('/cases', await caseOpenPayload(o, o.viewer.lawyerId, 'viewer'));
    expect(res.status).toBe(403);
    expect(await tenantCounts(o.tenantId)).toEqual(before);
    expect(before.cases).toBe(0);
  });

  it('BAŞKA BÜRO: yabancı avukatla açılış tx öncesi 400 (kısmi dosya/talep/alacak YOK); yabancı yönetim bu büronun varsayılanını değiştiremez', async () => {
    const a = await office('tenant-a');
    const b = await office('tenant-b');
    await managementSetsDefaults(b, b.opener.lawyerId, FINANCE_GRANT); // B'de yönetimce yetkili avukat
    const before = await tenantCounts(a.tenantId);
    const payload = await caseOpenPayload(a, a.opener.lawyerId, 'foreign');
    const res = await as(a.opener.userId).post('/cases', {
      ...payload,
      lawyers: [{ id: b.opener.lawyerId, name: 'opener', surname: 'K3A' }],
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CASE_LAWYER_NOT_IN_TENANT');
    expect(await tenantCounts(a.tenantId)).toEqual(before);
    expect(await prisma.case.count({ where: { fileNumber: payload.fileNumber } })).toBe(0);
    expect(await prisma.caseLawyer.count({ where: { lawyerId: b.opener.lawyerId } })).toBe(0);

    const foreignPut = await as(b.partner.userId).put(`/lawyers/${a.opener.lawyerId}`, { defaultPermissions: FINANCE_GRANT });
    expect([403, 404]).toContain(foreignPut.status);
    expect((await prisma.lawyer.findUniqueOrThrow({ where: { id: a.opener.lawyerId } })).defaultPermissions).toBeNull();
  });

  it('PASİF avukat: yönetimce yetkilendirilmiş olsa da varsayılan UYGULANMAZ (LAWYER_INACTIVE)', async () => {
    const o = await office('inactive');
    const intern = await prisma.lawyer.create({
      data: { tenantId: o.tenantId, officeId: (await prisma.office.findFirstOrThrow({ where: { tenantId: o.tenantId } })).id, name: 'Pasif', surname: 'Avukat', lawyerRank: 'LAWYER' },
    });
    await managementSetsDefaults(o, intern.id, FINANCE_GRANT);
    await prisma.lawyer.update({ where: { id: intern.id }, data: { isActive: false } });
    const payload = await caseOpenPayload(o, o.opener.lawyerId, 'inactive');
    const res = await as(o.admin.userId).post('/cases', {
      ...payload,
      checkPenaltyFormation: undefined,
      lawyers: [{ id: intern.id, name: 'Pasif', surname: 'Avukat' }],
    });
    expect(res.status).toBe(201);
    expect((await prisma.caseLawyer.findFirstOrThrow({ where: { caseId: res.body.id, lawyerId: intern.id } })).casePermissions).toBeNull();
    expect(((await openingAudit(o.tenantId, res.body.id))?.metadata as any).assignments).toEqual([
      expect.objectContaining({ lawyerId: intern.id, outcome: 'NOT_APPLIED', reason: 'LAWYER_INACTIVE' }),
    ]);
  });
  it('KANIT BAĞI: yönetim bir küme kaydettikten SONRA denetimsiz yoldan yazılmış değer yönetim onaylı SAYILMAZ (SOURCE_VALUE_MISMATCH); aynı değeri no-op kaydetmek onay üretmez', async () => {
    const o = await office('drift');
    const managed = { canEditCase: true, canViewFinance: true, canEditFinance: false };
    await managementSetsDefaults(o, o.opener.lawyerId, managed);
    // Uygulama dışı / denetimsiz yazma (ör. veri düzeltmesi): mali izni açar — denetim kaydı YOK
    await prisma.lawyer.update({ where: { id: o.opener.lawyerId }, data: { defaultPermissions: FINANCE_GRANT } });

    const res = await as(o.opener.userId).post('/cases', await caseOpenPayload(o, o.opener.lawyerId, 'drift'));
    expect(res.status).toBe(201);
    expect((await prisma.caseLawyer.findFirstOrThrow({ where: { caseId: res.body.id } })).casePermissions).toBeNull();
    expect(res.body.checkPenaltyFormation?.results).toEqual([
      expect.objectContaining({ status: 'REJECTED', errorCode: 'CASE_FINANCE_PERMISSION_REQUIRED' }),
    ]);
    expect(await prisma.officeApprovalRequest.count({ where: { tenantId: o.tenantId } })).toBe(0);
    expect(await prisma.claimItem.count({ where: { tenantId: o.tenantId, itemType: 'CHECK_PENALTY' } })).toBe(0);
    expect(((await openingAudit(o.tenantId, res.body.id))?.metadata as any).assignments).toEqual([
      expect.objectContaining({ outcome: 'NOT_APPLIED', reason: 'SOURCE_VALUE_MISMATCH' }),
    ]);

    // Yönetim güncel (denetimsiz yazılmış) değeri AYNEN gönderirse B11 no-op → yeni kayıt YOK → yine uygulanmaz
    const auditsBefore = await prisma.auditLog.count({ where: { tenantId: o.tenantId, action: 'LAWYER_PRIVILEGE_CHANGED' } });
    await managementSetsDefaults(o, o.opener.lawyerId, FINANCE_GRANT);
    expect(await prisma.auditLog.count({ where: { tenantId: o.tenantId, action: 'LAWYER_PRIVILEGE_CHANGED' } })).toBe(auditsBefore);
    const again = await as(o.opener.userId).post('/cases', await caseOpenPayload(o, o.opener.lawyerId, 'drift2'));
    expect(again.status).toBe(201);
    expect((await prisma.caseLawyer.findFirstOrThrow({ where: { caseId: again.body.id } })).casePermissions).toBeNull();
  });

  it('KANIT BAĞI: ESKİ yönetim kararı (sonradan yönetimce değiştirilmiş) ve İLGİSİZ alan kaydı, sonradan geri yazılmış değere dayanak OLMAZ', async () => {
    const o = await office('stale');
    await managementSetsDefaults(o, o.opener.lawyerId, FINANCE_GRANT); // eski karar (bu değerle eşleşen iz)
    await managementSetsDefaults(o, o.opener.lawyerId, { ...FINANCE_GRANT, canEditFinance: false }); // güncel karar
    const rank = await as(o.partner.userId).put(`/lawyers/${o.opener.lawyerId}`, { lawyerRank: 'AUTHORIZED' }); // ilgisiz alan
    expect(rank.status).toBe(200);
    // Denetimsiz yoldan eski kararın değeri geri yazılır
    await prisma.lawyer.update({ where: { id: o.opener.lawyerId }, data: { defaultPermissions: FINANCE_GRANT } });

    const res = await as(o.opener.userId).post('/cases', await caseOpenPayload(o, o.opener.lawyerId, 'stale'));
    expect(res.status).toBe(201);
    expect((await prisma.caseLawyer.findFirstOrThrow({ where: { caseId: res.body.id } })).casePermissions).toBeNull();
    expect(res.body.checkPenaltyFormation?.results).toEqual([
      expect.objectContaining({ status: 'REJECTED', errorCode: 'CASE_FINANCE_PERMISSION_REQUIRED' }),
    ]);
    expect(((await openingAudit(o.tenantId, res.body.id))?.metadata as any).assignments).toEqual([
      expect.objectContaining({ outcome: 'NOT_APPLIED', reason: 'SOURCE_VALUE_MISMATCH' }),
    ]);
  });

  it('KANIT BAĞI: parmak izi taşımayan ESKİ (B11 biçimli) yönetim kaydı doğrulanamaz → yetki KAPALI', async () => {
    const o = await office('legacy');
    // Bu değişiklikten önceki B11 kaydı biçimi: yalnız alan adı (geçmiş veri benzetimi; yetki vermek için DEĞİL)
    await prisma.lawyer.update({ where: { id: o.opener.lawyerId }, data: { defaultPermissions: FINANCE_GRANT } });
    await prisma.auditLog.create({
      data: {
        tenantId: o.tenantId,
        action: 'LAWYER_PRIVILEGE_CHANGED',
        entityType: 'LAWYER',
        entityId: o.opener.lawyerId,
        userId: o.partner.userId,
        actorType: 'USER',
        metadata: { changedFields: ['defaultPermissions'] },
      },
    });
    const res = await as(o.opener.userId).post('/cases', await caseOpenPayload(o, o.opener.lawyerId, 'legacy'));
    expect(res.status).toBe(201);
    expect((await prisma.caseLawyer.findFirstOrThrow({ where: { caseId: res.body.id } })).casePermissions).toBeNull();
    expect(res.body.checkPenaltyFormation?.results).toEqual([
      expect.objectContaining({ status: 'REJECTED', errorCode: 'CASE_FINANCE_PERMISSION_REQUIRED' }),
    ]);
    expect(((await openingAudit(o.tenantId, res.body.id))?.metadata as any).assignments).toEqual([
      expect.objectContaining({ outcome: 'NOT_APPLIED', reason: 'SOURCE_VALUE_MISMATCH' }),
    ]);
  });
});
