import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { describeDb } from '../../../../test/describe-db';
import { EmailProviderService } from '../../notification/email-provider.service';
import { ClientFinancialDisclosureApprovalService } from '../client-financial-disclosure-approval.service';
import { ClientFinancialDisclosurePublicationService } from '../client-financial-disclosure-publication.service';
import { ClientFinancialDisclosureProjectionService } from '../client-financial-disclosure-projection.service';
import { ClientFinancialDisclosureWriterService } from '../client-financial-disclosure-writer.service';
import { ClientFinancialDisclosureModule } from '../client-financial-disclosure.module';
import {
  CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG,
} from '../client-financial-disclosure-activation';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * CLIENT-FD-ACT-R01-I06 — END-TO-END ACCEPTANCE / RESTART PROOF / CONCURRENCY PROOF.
 *
 * GERÇEK Nest composition (`ClientFinancialDisclosureModule`) + GERÇEK Prisma + GERÇEK writer,
 * approval, publication ve dispatcher zinciri, GERÇEK PostgreSQL 16 üzerinde.
 * Sahte olan TEK şey provider'ın ağ çağrısıdır. GERÇEK E-POSTA GÖNDERİLMEZ; canlı `hukuk_db`
 * KULLANILMAZ; production secret OKUNMAZ.
 *
 * KAPSAM NOTU — bu suite YENİ kanıtlara odaklanır: gerçek DI grafiği üzerinden uçtan uca akış,
 * İKİ AYRI application instance ile restart proof ve gerçek composition ile eşzamanlılık.
 * Güvenlik/bütünlük matrisinin tekil maddeleri (four-eyes, stale onay, hash uyuşmazlığı,
 * cross-tenant okuma, published-only filtre, reversal gizleme) daha önce merge edilmiş
 * suite'lerde yük taşımaktadır ve BURADA TEKRARLANMAZ.
 */
describeDb('CLIENT-FD-ACT-R01-I06 — uçtan uca kabul (gerçek Nest composition)', () => {
  const prisma = new PrismaClient();
  const sql = (q: string) => prisma.$executeRawUnsafe(q);

  const S = Math.random().toString(36).slice(2, 10);
  const tA = `e2e-t-${S}`;
  const clA = `e2e-cl-${S}`;
  const caseA = `e2e-case-${S}`;
  const ccA = `e2e-cc-${S}`;
  const puA = `e2e-pu-${S}`;
  const uReq = `e2e-req-${S}`;
  const uP1 = `e2e-p1-${S}`;
  const uP2 = `e2e-p2-${S}`;

  /** Provider çağrılarını instance'lar ARASINDA sayan paylaşımlı sayaç. */
  const providerCalls: Array<{ instance: string; to: string }> = [];

  /**
   * GERÇEK bir Nest application instance'ı kurar. Her çağrı AYRI bir DI grafiği ve AYRI bir
   * PrismaClient üretir — "aynı servis örneğinde ikinci metod çağrısı" DEĞİLDİR.
   */
  const bootInstance = async (
    name: string,
    reply: (n: number) => unknown,
  ): Promise<{ app: TestingModule; client: PrismaClient; close: () => Promise<void> }> => {
    const client = new PrismaClient();
    const email = new EmailProviderService({
      get: (k: string) => (k === 'EMAIL_PROVIDER' ? 'smtp' : undefined),
    } as unknown as ConfigService);
    jest.spyOn(email, 'send').mockImplementation(async (o) => {
      providerCalls.push({ instance: name, to: o.to });
      return reply(providerCalls.length) as never;
    });
    const app = await Test.createTestingModule({ imports: [ClientFinancialDisclosureModule] })
      .overrideProvider(PrismaService)
      .useValue(client)
      .overrideProvider(EmailProviderService)
      .useValue(email)
      .compile();
    return {
      app,
      client,
      close: async () => {
        await app.close();
        await client.$disconnect();
      },
    };
  };

  const seedSource = async (key: string) => {
    await sql(`INSERT INTO "Collection"("id","tenantId","caseId","amount","currency","type","date","status","idempotencyKey","updatedAt")
      VALUES ('e2e-col-${key}','${tA}','${caseA}',2500.75,'TRY','TAHSILAT'::"CollectionType",'2026-07-01T09:30:00Z','CONFIRMED'::"CollectionStatus",'e2e-idem-${key}',now())`);
    await sql(`INSERT INTO "CollectionDisposition"("id","tenantId","caseId","collectionId","beneficiaryScope","caseClientId","status","totalAmount","currency","postedAt","createdAt","updatedAt")
      VALUES ('e2e-disp-${key}','${tA}','${caseA}','e2e-col-${key}','SINGLE_CASE_CLIENT'::"CollectionDispositionBeneficiaryScope",
        '${ccA}','POSTED'::"CollectionDispositionStatus",2500.75,'TRY','2026-07-02T10:00:00Z',now(),now())`);
    await sql(`INSERT INTO "CollectionDispositionLine"("id","dispositionId","type","amount","createdAt") VALUES
      ('e2e-dl-${key}-a','e2e-disp-${key}','CLIENT_PAYABLE'::"CollectionDispositionLineType",1750.50,now()),
      ('e2e-dl-${key}-b','e2e-disp-${key}','CONTRACTUAL_FEE_WITHHELD'::"CollectionDispositionLineType",750.25,now())`);
    return `e2e-disp-${key}`;
  };

  /** DRAFT → SEND_PENDING: gerçek DI grafiğinden çözülen servislerle. */
  const upToSendPending = async (app: TestingModule, key: string): Promise<string> => {
    const writer = app.get(ClientFinancialDisclosureWriterService);
    const approval = app.get(ClientFinancialDisclosureApprovalService);
    const publication = app.get(ClientFinancialDisclosurePublicationService);
    const dispId = await seedSource(key);
    const created = await writer.createDisclosureVersion({
      tenantId: tA, caseId: caseA, caseClientId: ccA,
      collectionDispositionId: dispId, sendIdempotencyKey: `e2e-send-${key}`,
    });
    const v = created.versionId;
    const req = await approval.requestOfficeApproval({ tenantId: tA, disclosureVersionId: v, requesterUserId: uReq });
    await approval.completeOfficeApproval({
      tenantId: tA, disclosureVersionId: v,
      approvalRequestId: req.approvalRequestId as string, approverUserId: uP1,
    });
    await approval.requestContentApproval({
      tenantId: tA, disclosureVersionId: v, requesterUserId: uReq,
      notificationContent: `Tahsilat bildirimi ${key}`,
      approvedRecipientEmail: `client-${key}@example.test`,
    });
    await approval.completeContentApproval({ tenantId: tA, disclosureVersionId: v, contentApproverUserId: uP2 });
    await publication.beginSend({ tenantId: tA, disclosureVersionId: v, actorUserId: uP1 });
    return v;
  };

  const read = (id: string) =>
    prisma.clientFinancialDisclosureVersion.findUniqueOrThrow({
      where: { id },
      select: {
        status: true, snapshotHash: true, officeApprovedById: true, contentApprovedById: true,
        providerMessageId: true, providerAcceptedAt: true, publishedAt: true,
        sendRequestedAt: true, sendFailureCode: true,
      },
    });

  const OK = (n: number) => ({ success: true, messageId: `smtp-e2e-${n}`, provider: 'smtp' });

  beforeAll(async () => {
    process.env[CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG] = 'true';
    await sql(`INSERT INTO "Tenant"("id","name","slug","createdAt","updatedAt") VALUES ('${tA}','T-${S}','e2e-t-${S}',now(),now())`);
    await sql(`INSERT INTO "Client"("id","tenantId","type","updatedAt") VALUES ('${clA}','${tA}','PERSON'::"ClientType",now())`);
    await sql(`INSERT INTO "Case"("id","tenantId","fileNumber","type","updatedAt") VALUES ('${caseA}','${tA}','2026/E2E-${S}','GENERAL_EXECUTION'::"CaseType",now())`);
    await sql(`INSERT INTO "CaseClient"("id","caseId","clientId","updatedAt") VALUES ('${ccA}','${caseA}','${clA}',now())`);
    await sql(`INSERT INTO "ClientPortalUser"("id","clientId","email","passwordHash","isActive","updatedAt") VALUES ('${puA}','${clA}','pu-${S}@example.test','x',true,now())`);
    const u = (id: string) => `('${id}','${tA}','${id}@example.test','U','${id}',true,now())`;
    await sql(`INSERT INTO "User"("id","tenantId","email","name","surname","isActive","updatedAt") VALUES ${u(uReq)}, ${u(uP1)}, ${u(uP2)}`);
    await sql(`INSERT INTO "Lawyer"("id","tenantId","userId","name","surname","lawyerRank","canApproveOfficeActions","updatedAt") VALUES
      ('lw-${uP1}','${tA}','${uP1}','L','A','PARTNER'::"LawyerRank",false,now()),
      ('lw-${uP2}','${tA}','${uP2}','L','B','PARTNER'::"LawyerRank",false,now())`);
  });

  afterAll(async () => {
    delete process.env[CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG];
    await sql(`DELETE FROM "AuditLog" WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "OfficeApprovalRequest" WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "ClientFinancialDisclosureLine" WHERE "tenantId" = '${tA}'`);
    await sql(`UPDATE "ClientFinancialDisclosure" SET "currentVersionId" = NULL WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "ClientFinancialDisclosureVersion" WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "ClientFinancialDisclosure" WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "CollectionDispositionLine" WHERE id LIKE 'e2e-dl-%${S}%'`);
    await sql(`DELETE FROM "CollectionDisposition" WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "Collection" WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "ClientPortalUser" WHERE id = '${puA}'`);
    await sql(`DELETE FROM "Lawyer" WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "User" WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "CaseClient" WHERE id = '${ccA}'`);
    await sql(`DELETE FROM "Case" WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "Client" WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "Tenant" WHERE id = '${tA}'`);
    await prisma.$disconnect();
  });

  beforeEach(() => {
    providerCalls.length = 0;
  });

  // ── HAPPY PATH — her asama DB'den dogrulanir ─────────────────────────────────
  it('[1] uçtan uca: oluştur → onayla → yayınla → müvekkil portalda görür', async () => {
    const inst = await bootInstance('A', OK);
    try {
      const writer = inst.app.get(ClientFinancialDisclosureWriterService);
      const approval = inst.app.get(ClientFinancialDisclosureApprovalService);
      const publication = inst.app.get(ClientFinancialDisclosurePublicationService);
      const dispId = await seedSource(`hp-${S}`);

      const created = await writer.createDisclosureVersion({
        tenantId: tA, caseId: caseA, caseClientId: ccA,
        collectionDispositionId: dispId, sendIdempotencyKey: `e2e-send-hp-${S}`,
      });
      const v = created.versionId;
      expect((await read(v)).status).toBe('DRAFT');
      expect((await read(v)).snapshotHash).toMatch(/^[0-9a-f]{64}$/);

      const req = await approval.requestOfficeApproval({ tenantId: tA, disclosureVersionId: v, requesterUserId: uReq });
      expect((await read(v)).status).toBe('OFFICE_APPROVAL_PENDING');

      await approval.completeOfficeApproval({
        tenantId: tA, disclosureVersionId: v,
        approvalRequestId: req.approvalRequestId as string, approverUserId: uP1,
      });
      expect((await read(v)).status).toBe('OFFICE_APPROVED');
      expect((await read(v)).officeApprovedById).toBe(uP1);

      await approval.requestContentApproval({
        tenantId: tA, disclosureVersionId: v, requesterUserId: uReq,
        notificationContent: 'Tahsilat bildirimi', approvedRecipientEmail: `hp-${S}@example.test`,
      });
      expect((await read(v)).status).toBe('CONTENT_APPROVAL_PENDING');

      await approval.completeContentApproval({ tenantId: tA, disclosureVersionId: v, contentApproverUserId: uP2 });
      const afterContent = await read(v);
      expect(afterContent.status).toBe('CONTENT_APPROVED');
      // Four-eyes: uc AYRI aktor.
      expect(new Set([uReq, afterContent.officeApprovedById, afterContent.contentApprovedById]).size).toBe(3);

      await publication.beginSend({ tenantId: tA, disclosureVersionId: v, actorUserId: uP1 });
      expect((await read(v)).status).toBe('SEND_PENDING');

      const pub = await publication.dispatchAndPublish({
        tenantId: tA, disclosureVersionId: v, actorUserId: uP1, subject: 'Bildirim',
      });
      expect(pub.status).toBe('PUBLISHED');
      const final = await read(v);
      expect(final.status).toBe('PUBLISHED');
      expect(final.providerMessageId).toMatch(/^smtp-e2e-/);
      expect(final.providerAcceptedAt).toBeInstanceOf(Date);
      expect(final.publishedAt).toBeInstanceOf(Date);
      expect(providerCalls).toHaveLength(1);

      // Yetkili muvekkil portal projeksiyonunda GORUR.
      const projection = new ClientFinancialDisclosureProjectionService(inst.client);
      const surface = await projection.getCurrentSurface({ tenantId: tA, portalUserId: puA });
      const item = surface.items.find((i) => i.disclosureId === v);
      expect(item).toBeDefined();
      expect(item?.remittanceStatus).toBe('PUBLISHED');
      expect(item?.totalCollected).toBe('2500.75');
      // Sizinti sinirlari korunur.
      expect(JSON.stringify(item)).not.toContain(final.providerMessageId as string);
      expect(JSON.stringify(item)).not.toContain(final.snapshotHash);
    } finally {
      await inst.close();
    }
  });

  // ── RESTART PROOF — IKI AYRI APPLICATION INSTANCE, AYNI DB ───────────────────
  it('[2] RESTART PROOF: A kalıcı niyeti yazar ve kapanır → B devralır, provider TEK kez çağrılır', async () => {
    const a = await bootInstance('A', OK);
    let versionId: string;
    try {
      versionId = await upToSendPending(a.app, `rst-${S}`);
      // A yayinlamayi TAMAMLAMADAN kapanir; kalici niyet (SEND_PENDING) commit edilmistir.
      const beforeShutdown = await read(versionId);
      expect(beforeShutdown.status).toBe('SEND_PENDING');
      expect(beforeShutdown.sendRequestedAt).toBeNull();
      expect(beforeShutdown.publishedAt).toBeNull();
    } finally {
      await a.close(); // <- INSTANCE A TAMAMEN KAPANIR (DI grafigi + baglanti)
    }
    expect(providerCalls).toHaveLength(0); // A hicbir sey gondermedi

    // INSTANCE B: yepyeni DI grafigi, yeni baglanti, AYNI disposable DB.
    const b = await bootInstance('B', OK);
    try {
      const publication = b.app.get(ClientFinancialDisclosurePublicationService);
      const recovered = await publication.dispatchAndPublish({
        tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, subject: 'Bildirim',
      });
      expect(recovered.status).toBe('PUBLISHED');
      const final = await read(versionId);
      expect(final.status).toBe('PUBLISHED');
      expect(final.providerMessageId).not.toBeNull();
      // Kalici is KAYBOLMADI ve dis yan etki COGALMADI.
      expect(providerCalls).toHaveLength(1);
      expect(providerCalls[0].instance).toBe('B');
    } finally {
      await b.close();
    }
  });

  it('[3] RESTART PROOF: A sahiplenip düşerse B çift GÖNDERMEZ; kurtarma explicit retry’dir', async () => {
    // A gonderim SIRASINDA duser: saglayici cagrilir, fakat surec yayinlamayi tamamlayamaz.
    const a = await bootInstance('A', () => {
      throw new Error('process died mid-dispatch');
    });
    let versionId: string;
    try {
      versionId = await upToSendPending(a.app, `rst2-${S}`);
      const publication = a.app.get(ClientFinancialDisclosurePublicationService);
      await expect(
        publication.dispatchAndPublish({ tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, subject: 's' }),
      ).rejects.toThrow();
    } finally {
      await a.close();
    }
    // Sahiplenme KALICI olarak isaretli kaldi -> yeni instance kor bir yeniden gonderim YAPAMAZ.
    const afterCrash = await read(versionId);
    expect(afterCrash.sendRequestedAt).toBeInstanceOf(Date);
    expect(afterCrash.publishedAt).toBeNull();

    const b = await bootInstance('B', OK);
    try {
      const publication = b.app.get(ClientFinancialDisclosurePublicationService);
      // B'nin kor dispatch denemesi REDDEDILIR (sahiplenme serbest degil).
      await expect(
        publication.dispatchAndPublish({ tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, subject: 's' }),
      ).rejects.toThrow();
      expect(providerCalls.filter((c) => c.instance === 'B')).toHaveLength(0);

      // Canonical kurtarma yolu: once SEND_FAILED'e dusurulur, sonra explicit retrySend().
      await prisma.clientFinancialDisclosureVersion.updateMany({
        where: { id: versionId, tenantId: tA },
        data: { status: 'SEND_FAILED', sendFailureCode: 'PROCESS_INTERRUPTED' },
      });
      await publication.retrySend({ tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1 });
      expect((await read(versionId)).sendRequestedAt).toBeNull();

      const done = await publication.dispatchAndPublish({
        tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, subject: 's',
      });
      expect(done.status).toBe('PUBLISHED');
      const final = await read(versionId);
      expect(final.status).toBe('PUBLISHED');
      // Deterministik son durum: TEK message ID, TEK yayinlama.
      expect(final.providerMessageId).not.toBeNull();
      expect(providerCalls.filter((c) => c.instance === 'B')).toHaveLength(1);
    } finally {
      await b.close();
    }
  });

  // ── CONCURRENCY PROOF — IKI AYRI INSTANCE ───────────────────────────────────
  it('[4] CONCURRENCY PROOF: iki instance eşzamanlı yayınlar → tek kazanan, tek provider çağrısı', async () => {
    const a = await bootInstance('A', OK);
    const b = await bootInstance('B', OK);
    try {
      const versionId = await upToSendPending(a.app, `conc-${S}`);
      const settled = await Promise.allSettled([
        a.app.get(ClientFinancialDisclosurePublicationService).dispatchAndPublish({
          tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, subject: 's',
        }),
        b.app.get(ClientFinancialDisclosurePublicationService).dispatchAndPublish({
          tenantId: tA, disclosureVersionId: versionId, actorUserId: uP2, subject: 's',
        }),
      ]);
      const winners = settled.filter(
        (s) => s.status === 'fulfilled' && s.value.status === 'PUBLISHED' && s.value.replayed === false,
      );
      expect(winners).toHaveLength(1);
      expect(providerCalls).toHaveLength(1);

      const final = await read(versionId);
      expect(final.status).toBe('PUBLISHED');
      expect(final.providerMessageId).not.toBeNull();
      // Kaybeden deterministik: last-write-wins YOK.
      const losers = settled.filter((s) => s.status === 'rejected' || (s.status === 'fulfilled' && s.value.replayed));
      expect(losers).toHaveLength(1);
      expect(
        await prisma.auditLog.count({
          where: { tenantId: tA, entityId: versionId, action: 'CLIENT_FINANCIAL_DISCLOSURE_PUBLISHED' },
        }),
      ).toBe(1);
    } finally {
      await a.close();
      await b.close();
    }
  });

  // ── AKTIVASYON KAPISI UCTAN UCA ─────────────────────────────────────────────
  it('[5] yayınlama bayrağı KAPALI iken gerçek grafik dış gönderim YAPMAZ', async () => {
    delete process.env[CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG];
    const inst = await bootInstance('OFF', OK);
    try {
      const versionId = await upToSendPending(inst.app, `flagoff-${S}`);
      await expect(
        inst.app.get(ClientFinancialDisclosurePublicationService).dispatchAndPublish({
          tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, subject: 's',
        }),
      ).rejects.toThrow();
      expect(providerCalls).toHaveLength(0);
      const v = await read(versionId);
      expect(v.status).toBe('SEND_PENDING');
      expect(v.publishedAt).toBeNull();
      expect(v.sendRequestedAt).toBeNull();

      // Portal READ yolu bayraktan ETKILENMEZ.
      const projection = new ClientFinancialDisclosureProjectionService(inst.client);
      await expect(projection.getCurrentSurface({ tenantId: tA, portalUserId: puA })).resolves.toBeDefined();
    } finally {
      await inst.close();
      process.env[CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG] = 'true';
    }
  });

  // ── PROVIDER FAILURE MATRISI (gercek grafik uzerinden) ──────────────────────
  it('[6] provider hata matrisi: hiçbir başarısızlık PUBLISHED üretmez', async () => {
    const cases: Array<[string, () => unknown, string]> = [
      ['timeout', () => ({ success: false, errorCode: 'ETIMEDOUT', provider: 'smtp' }), 'ETIMEDOUT'],
      ['retryable', () => ({ success: false, errorCode: '503', provider: 'smtp' }), '503'],
      ['terminal', () => ({ success: false, errorCode: 'INVALID_EMAIL', provider: 'smtp' }), 'INVALID_EMAIL'],
      ['no-msgid', () => ({ success: true, provider: 'smtp' }), 'PROVIDER_MESSAGE_ID_MISSING'],
    ];
    for (const [key, reply, expected] of cases) {
      const inst = await bootInstance(`F-${key}`, reply);
      try {
        const versionId = await upToSendPending(inst.app, `f-${key}-${S}`);
        const r = await inst.app.get(ClientFinancialDisclosurePublicationService).dispatchAndPublish({
          tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, subject: 's',
        });
        expect(r.status).toBe('SEND_FAILED');
        const v = await read(versionId);
        expect(v.status).toBe('SEND_FAILED');
        expect(v.publishedAt).toBeNull();
        expect(v.providerMessageId).toBeNull();
        expect(v.sendFailureCode).toBe(expected);
        // Yayinlanmamis kayit muvekkile GORUNMEZ.
        const projection = new ClientFinancialDisclosureProjectionService(inst.client);
        const surface = await projection.getCurrentSurface({ tenantId: tA, portalUserId: puA });
        expect(surface.items.map((i) => i.disclosureId)).not.toContain(versionId);
      } finally {
        await inst.close();
      }
    }
  });
});
