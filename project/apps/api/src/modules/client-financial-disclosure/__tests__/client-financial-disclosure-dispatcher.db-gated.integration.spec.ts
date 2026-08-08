import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { describeDb } from '../../../../test/describe-db';
import { EmailProviderService } from '../../notification/email-provider.service';
import { ClientFinancialDisclosureApprovalService } from '../client-financial-disclosure-approval.service';
import { ClientFinancialDisclosureEmailDispatcher } from '../client-financial-disclosure-email-dispatcher';
import { ClientFinancialDisclosurePublicationService } from '../client-financial-disclosure-publication.service';
import { ClientFinancialDisclosureWriterService } from '../client-financial-disclosure-writer.service';
import { UnconfiguredDisclosureNotificationDispatcher } from '../unconfigured-disclosure-dispatcher';

/**
 * CLIENT-FD-ACT-R01-I04 — GERÇEK publication servisi + GERÇEK adapter, gerçek PostgreSQL.
 *
 * Mock-only güvenceyle yetinilmez: adapter canonical `ClientFinancialDisclosurePublicationService`
 * ile birlikte koşar ve DB durumu doğrulanır. Sahte olan TEK şey provider'ın ağ çağrısıdır
 * (`EmailProviderService.send` seviyesinde kesilir). GERÇEK E-POSTA GÖNDERİLMEZ.
 */
describeDb('CLIENT-FD-ACT-R01-I04 — dispatcher + publication (gerçek PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const writer = new ClientFinancialDisclosureWriterService(prisma);
  const approval = new ClientFinancialDisclosureApprovalService(prisma);
  const sql = (q: string) => prisma.$executeRawUnsafe(q);

  const S = Math.random().toString(36).slice(2, 10);
  const tA = `fd4-t-${S}`;
  const clA = `fd4-cl-${S}`;
  const caseA = `fd4-case-${S}`;
  const ccA = `fd4-cc-${S}`;
  const uReq = `fd4-req-${S}`;
  const uP1 = `fd4-p1-${S}`;
  const uP2 = `fd4-p2-${S}`;

  /** GERÇEK EmailProviderService; yalnız ağ yapan `send` deterministik olarak kesilir. */
  const provider = (name: string, reply: () => unknown, spy?: jest.Mock) => {
    const p = new EmailProviderService({
      get: (k: string) => (k === 'EMAIL_PROVIDER' ? name : undefined),
    } as unknown as ConfigService);
    jest.spyOn(p, 'send').mockImplementation(async (o) => {
      spy?.(o);
      return reply() as never;
    });
    return p;
  };

  const pubWith = (email: EmailProviderService, client: PrismaClient = prisma) =>
    new ClientFinancialDisclosurePublicationService(
      client,
      new ClientFinancialDisclosureEmailDispatcher(email),
    );

  const seedSource = async (key: string) => {
    await sql(`INSERT INTO "Collection"("id","tenantId","caseId","amount","currency","type","date","status","idempotencyKey","updatedAt")
      VALUES ('fd4-col-${key}','${tA}','${caseA}',2500.75,'TRY','TAHSILAT'::"CollectionType",'2026-07-01T09:30:00Z','CONFIRMED'::"CollectionStatus",'fd4-idem-${key}',now())`);
    await sql(`INSERT INTO "CollectionDisposition"("id","tenantId","caseId","collectionId","beneficiaryScope","caseClientId","status","totalAmount","currency","postedAt","createdAt","updatedAt")
      VALUES ('fd4-disp-${key}','${tA}','${caseA}','fd4-col-${key}','SINGLE_CASE_CLIENT'::"CollectionDispositionBeneficiaryScope",
        '${ccA}','POSTED'::"CollectionDispositionStatus",2500.75,'TRY','2026-07-02T10:00:00Z',now(),now())`);
    await sql(`INSERT INTO "CollectionDispositionLine"("id","dispositionId","type","amount","createdAt") VALUES
      ('fd4-dl-${key}-a','fd4-disp-${key}','CLIENT_PAYABLE'::"CollectionDispositionLineType",1750.50,now()),
      ('fd4-dl-${key}-b','fd4-disp-${key}','CONTRACTUAL_FEE_WITHHELD'::"CollectionDispositionLineType",750.25,now())`);
    return `fd4-disp-${key}`;
  };

  /** DRAFT → SEND_PENDING tam canonical zincir (gerçek writer + gerçek approval servisi). */
  const sendPending = async (key: string): Promise<string> => {
    const dispId = await seedSource(key);
    const created = await writer.createDisclosureVersion({
      tenantId: tA, caseId: caseA, caseClientId: ccA,
      collectionDispositionId: dispId, sendIdempotencyKey: `fd4-send-${key}`,
    });
    const versionId = created.versionId;
    const req = await approval.requestOfficeApproval({
      tenantId: tA, disclosureVersionId: versionId, requesterUserId: uReq,
    });
    await approval.completeOfficeApproval({
      tenantId: tA, disclosureVersionId: versionId,
      approvalRequestId: req.approvalRequestId as string, approverUserId: uP1,
    });
    await approval.requestContentApproval({
      tenantId: tA, disclosureVersionId: versionId, requesterUserId: uReq,
      approvedRecipientEmail: `client-${key}@example.test`,
    });
    await approval.completeContentApproval({
      tenantId: tA, disclosureVersionId: versionId, contentApproverUserId: uP2,
    });
    await pubWith(provider('smtp', () => ({ success: true, messageId: 'X', provider: 'smtp' }))).beginSend({
      tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1,
    });
    return versionId;
  };

  const read = (id: string) =>
    prisma.clientFinancialDisclosureVersion.findUniqueOrThrow({
      where: { id },
      select: { status: true, providerMessageId: true, publishedAt: true, sendFailureCode: true, sendRequestedAt: true },
    });

  beforeAll(async () => {
    await sql(`INSERT INTO "Tenant"("id","name","slug","createdAt","updatedAt") VALUES ('${tA}','T-${S}','fd4-t-${S}',now(),now())`);
    await sql(`INSERT INTO "Client"("id","tenantId","type","updatedAt") VALUES ('${clA}','${tA}','PERSON'::"ClientType",now())`);
    await sql(`INSERT INTO "Case"("id","tenantId","fileNumber","type","updatedAt") VALUES ('${caseA}','${tA}','2026/FD4-${S}','GENERAL_EXECUTION'::"CaseType",now())`);
    await sql(`INSERT INTO "CaseClient"("id","caseId","clientId","updatedAt") VALUES ('${ccA}','${caseA}','${clA}',now())`);
    const u = (id: string) => `('${id}','${tA}','${id}@example.test','U','${id}',true,now())`;
    await sql(`INSERT INTO "User"("id","tenantId","email","name","surname","isActive","updatedAt") VALUES ${u(uReq)}, ${u(uP1)}, ${u(uP2)}`);
    await sql(`INSERT INTO "Lawyer"("id","tenantId","userId","name","surname","lawyerRank","canApproveOfficeActions","updatedAt") VALUES
      ('lw-${uP1}','${tA}','${uP1}','L','A','PARTNER'::"LawyerRank",false,now()),
      ('lw-${uP2}','${tA}','${uP2}','L','B','PARTNER'::"LawyerRank",false,now())`);
  });

  afterAll(async () => {
    await sql(`DELETE FROM "AuditLog" WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "OfficeApprovalRequest" WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "ClientFinancialDisclosureLine" WHERE "tenantId" = '${tA}'`);
    await sql(`UPDATE "ClientFinancialDisclosure" SET "currentVersionId" = NULL WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "ClientFinancialDisclosureVersion" WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "ClientFinancialDisclosure" WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "CollectionDispositionLine" WHERE id LIKE 'fd4-dl-%${S}%'`);
    await sql(`DELETE FROM "CollectionDisposition" WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "Collection" WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "Lawyer" WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "User" WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "CaseClient" WHERE id = '${ccA}'`);
    await sql(`DELETE FROM "Case" WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "Client" WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "Tenant" WHERE id = '${tA}'`);
    await prisma.$disconnect();
  });

  it('[11] yapılandırılmış adapter ile yayınlama TAMAMLANIR ve provider ID persist edilir', async () => {
    const versionId = await sendPending(`ok-${S}`);
    const spy = jest.fn();
    const r = await pubWith(provider('smtp', () => ({ success: true, messageId: 'smtp-real-1', provider: 'smtp' }), spy))
      .dispatchAndPublish({ tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1 });
    expect(r.status).toBe('PUBLISHED');
    const v = await read(versionId);
    expect(v.status).toBe('PUBLISHED');
    expect(v.providerMessageId).toBe('smtp-real-1');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('[12] adapter başarısızlığında PUBLISHED’a ULAŞILAMAZ (DB’den doğrulandı)', async () => {
    for (const [key, reply, expected] of [
      ['fail1', () => ({ success: false, errorCode: 'SMTP_550', provider: 'smtp' }), 'SMTP_550'],
      ['fail2', () => ({ success: true, provider: 'smtp' }), 'PROVIDER_MESSAGE_ID_MISSING'],
      ['fail3', () => ({ success: false, errorCode: '', provider: 'smtp' }), 'PROVIDER_ERROR'],
    ] as Array<[string, () => unknown, string]>) {
      const versionId = await sendPending(`${key}-${S}`);
      const r = await pubWith(provider('smtp', reply)).dispatchAndPublish({
        tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1,
      });
      expect(r.status).toBe('SEND_FAILED');
      const v = await read(versionId);
      expect(v.status).toBe('SEND_FAILED');
      expect(v.publishedAt).toBeNull();
      expect(v.providerMessageId).toBeNull();
      expect(v.sendFailureCode).toBe(expected);
    }
  });

  it('[13] geçersiz alıcı provider’a HİÇ ULAŞMAZ ve yayınlama olmaz', async () => {
    const versionId = await sendPending(`badrcpt-${S}`);
    // Alici ve icerik hash'i birlikte gecersiz alici ile guncellenir ki ICERIK kapisi degil
    // ALICI kapisi izole olsun.
    const v0 = await prisma.clientFinancialDisclosureVersion.findUniqueOrThrow({
      where: { id: versionId }, select: { notificationContent: true, snapshotHash: true },
    });
    const { domainSeparatedHash } = await import('../client-financial-disclosure-canonical');
    const { CLIENT_FINANCIAL_DISCLOSURE_NOTIFICATION_CONTENT_CONTRACT_VERSION } = await import(
      '../client-financial-disclosure-approval.contract'
    );
    const bad = 'gecersiz-adres';
    const h = domainSeparatedHash(CLIENT_FINANCIAL_DISCLOSURE_NOTIFICATION_CONTENT_CONTRACT_VERSION, {
      contractVersion: CLIENT_FINANCIAL_DISCLOSURE_NOTIFICATION_CONTENT_CONTRACT_VERSION,
      tenantId: tA, disclosureVersionId: versionId, snapshotHash: v0.snapshotHash,
      notificationContent: v0.notificationContent, approvedRecipientEmail: bad,
      approvedRecipientPortalUserId: null,
    });
    await sql(`UPDATE "ClientFinancialDisclosureVersion"
      SET "approvedRecipientEmail" = '${bad}', "notificationContentHash" = '${h}' WHERE "id" = '${versionId}'`);

    const spy = jest.fn();
    const r = await pubWith(provider('smtp', () => ({ success: true, messageId: 'X', provider: 'smtp' }), spy))
      .dispatchAndPublish({ tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1 });
    expect(r.status).toBe('SEND_FAILED');
    expect(r.sendFailureCode).toBe('DISCLOSURE_RECIPIENT_INVALID');
    expect(spy).not.toHaveBeenCalled();
    expect((await read(versionId)).publishedAt).toBeNull();
  });

  it('[14] eşzamanlı yayınlama provider’ı TAM BİR KEZ çağırır', async () => {
    const versionId = await sendPending(`conc-${S}`);
    const c1 = new PrismaClient();
    const c2 = new PrismaClient();
    const s1 = jest.fn();
    const s2 = jest.fn();
    try {
      const settled = await Promise.allSettled([
        pubWith(provider('smtp', () => ({ success: true, messageId: 'm1', provider: 'smtp' }), s1), c1)
          .dispatchAndPublish({ tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1 }),
        pubWith(provider('smtp', () => ({ success: true, messageId: 'm2', provider: 'smtp' }), s2), c2)
          .dispatchAndPublish({ tenantId: tA, disclosureVersionId: versionId, actorUserId: uP2 }),
      ]);
      const published = settled.filter(
        (x) => x.status === 'fulfilled' && x.value.status === 'PUBLISHED' && x.value.replayed === false,
      );
      expect(published).toHaveLength(1);
      expect(s1.mock.calls.length + s2.mock.calls.length).toBe(1);
      expect((await read(versionId)).status).toBe('PUBLISHED');
    } finally {
      await c1.$disconnect();
      await c2.$disconnect();
    }
  });

  it('[15] fail-closed varsayılan adapter ile yayınlama ASLA tamamlanmaz', async () => {
    const versionId = await sendPending(`unconf-${S}`);
    const svc = new ClientFinancialDisclosurePublicationService(
      prisma,
      new UnconfiguredDisclosureNotificationDispatcher(),
    );
    await expect(
      svc.dispatchAndPublish({ tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1 }),
    ).rejects.toThrow();
    const v = await read(versionId);
    expect(v.status).toBe('SEND_PENDING');
    expect(v.publishedAt).toBeNull();
    expect(v.sendRequestedAt).toBeNull(); // guard, claim'den bile ONCE calisti
  });
});
