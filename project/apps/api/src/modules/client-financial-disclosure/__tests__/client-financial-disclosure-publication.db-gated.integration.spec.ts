import { PrismaClient } from '@prisma/client';
import { describeDb } from '../../../../test/describe-db';
import { ClientFinancialDisclosureApprovalService } from '../client-financial-disclosure-approval.service';
import {
  ClientFinancialDisclosurePublicationAuthorizationError,
  ClientFinancialDisclosurePublicationError,
  type DisclosureDispatchResult,
  type DisclosureNotificationDispatcher,
} from '../client-financial-disclosure-publication.contract';
import { ClientFinancialDisclosurePublicationService } from '../client-financial-disclosure-publication.service';
import { ClientFinancialDisclosureWriterService } from '../client-financial-disclosure-writer.service';

/**
 * CLIENT-P2-U03-TRACK-B-I04 — gerçek PostgreSQL send/publication/reversal suite.
 * Charter §35.7 / §35.10 / §35.11 / §35.13 kapsanır.
 *
 * TEST_DATABASE_URL yoksa suite atlanır. Canlı `hukuk_db` üzerinde ASLA koşmaz.
 * GERÇEK e-posta GÖNDERİLMEZ: provider portu sahte (fake) bir adaptörle sağlanır.
 */
class FakeDispatcher implements DisclosureNotificationDispatcher {
  calls: Array<{ to: string; subject: string; text: string }> = [];
  constructor(
    readonly providerName: string,
    private readonly reply: (n: number) => DisclosureDispatchResult,
    private readonly onSend?: () => Promise<void>,
  ) {}
  async send(input: { to: string; subject: string; text: string }) {
    this.calls.push({ ...input });
    if (this.onSend) await this.onSend();
    return this.reply(this.calls.length);
  }
}

const ok = (n: number): DisclosureDispatchResult => ({
  success: true,
  messageId: `smtp-msg-${n}-${Date.now()}`,
  provider: 'smtp',
});

describeDb('CLIENT-P2-U03-TRACK-B-I04 — disclosure publication (gerçek PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const writer = new ClientFinancialDisclosureWriterService(prisma);
  const approval = new ClientFinancialDisclosureApprovalService(prisma);
  const sql = (q: string) => prisma.$executeRawUnsafe(q);

  const S = Math.random().toString(36).slice(2, 10);
  const tA = `i04-tA-${S}`;
  const tB = `i04-tB-${S}`;
  const clA = `i04-clA-${S}`;
  const caseA = `i04-caseA-${S}`;
  const ccA = `i04-ccA-${S}`;
  const uReq = `i04-req-${S}`;
  const uP1 = `i04-p1-${S}`;
  const uP2 = `i04-p2-${S}`;
  const uPlain = `i04-plain-${S}`;
  const uOther = `i04-other-${S}`;

  const svcWith = (d: DisclosureNotificationDispatcher, client: PrismaClient = prisma) =>
    new ClientFinancialDisclosurePublicationService(client, d);

  const seedSource = async (key: string) => {
    const colId = `i04-col-${key}`;
    const dispId = `i04-disp-${key}`;
    await sql(`INSERT INTO "Collection"("id","tenantId","caseId","amount","currency","type","date","status","idempotencyKey","updatedAt")
      VALUES ('${colId}','${tA}','${caseA}',2500.75,'TRY','TAHSILAT'::"CollectionType",'2026-07-01T09:30:00Z','CONFIRMED'::"CollectionStatus",'i04-idem-${key}',now())`);
    await sql(`INSERT INTO "CollectionDisposition"("id","tenantId","caseId","collectionId","beneficiaryScope","caseClientId","status","totalAmount","currency","postedAt","createdAt","updatedAt")
      VALUES ('${dispId}','${tA}','${caseA}','${colId}','SINGLE_CASE_CLIENT'::"CollectionDispositionBeneficiaryScope",
        '${ccA}','POSTED'::"CollectionDispositionStatus",2500.75,'TRY','2026-07-02T10:00:00Z',now(),now())`);
    await sql(`INSERT INTO "CollectionDispositionLine"("id","dispositionId","type","amount","createdAt") VALUES
      ('i04-dl-${key}-a','${dispId}','CLIENT_PAYABLE'::"CollectionDispositionLineType",1750.50,now()),
      ('i04-dl-${key}-b','${dispId}','CONTRACTUAL_FEE_WITHHELD'::"CollectionDispositionLineType",750.25,now())`);
    return dispId;
  };

  /** DRAFT → CONTENT_APPROVED tam onay zinciri (I02 + I03 gerçek servisleriyle). */
  const contentApproved = async (key: string): Promise<string> => {
    const dispId = await seedSource(key);
    const created = await writer.createDisclosureVersion({
      tenantId: tA, caseId: caseA, caseClientId: ccA,
      collectionDispositionId: dispId, sendIdempotencyKey: `i04-send-${key}`,
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
      notificationContent: `Tahsilat bildirimi ${key}`,
      approvedRecipientEmail: `client-${key}@example.test`,
    });
    await approval.completeContentApproval({
      tenantId: tA, disclosureVersionId: versionId, contentApproverUserId: uP2,
    });
    return versionId;
  };

  /** CONTENT_APPROVED → SEND_PENDING. */
  const sendPending = async (key: string): Promise<string> => {
    const versionId = await contentApproved(key);
    await svcWith(new FakeDispatcher('smtp', ok)).beginSend({
      tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1,
    });
    return versionId;
  };

  const readVersion = (versionId: string) =>
    prisma.clientFinancialDisclosureVersion.findUniqueOrThrow({
      where: { id: versionId },
      select: {
        status: true, version: true, disclosureId: true, snapshotHash: true,
        sendRequestedAt: true, providerMessageId: true, providerAcceptedAt: true,
        sendFailureCode: true, sendFailureDetail: true, publishedAt: true,
        supersedesVersionId: true, supersededAt: true, reversedAt: true, correctionReason: true,
        approvedRecipientEmail: true, notificationContentHash: true,
      },
    });

  const code = async (p: Promise<unknown>): Promise<string> => {
    try {
      await p;
      return 'NO_ERROR';
    } catch (e) {
      expect(
        e instanceof ClientFinancialDisclosurePublicationError ||
          e instanceof ClientFinancialDisclosurePublicationAuthorizationError,
      ).toBe(true);
      return (
        e as ClientFinancialDisclosurePublicationError |
          ClientFinancialDisclosurePublicationAuthorizationError
      ).code;
    }
  };

  beforeAll(async () => {
    await sql(`INSERT INTO "Tenant"("id","name","slug","createdAt","updatedAt") VALUES
      ('${tA}','TA-${S}','i04-ta-${S}',now(),now()), ('${tB}','TB-${S}','i04-tb-${S}',now(),now())`);
    await sql(`INSERT INTO "Client"("id","tenantId","type","updatedAt") VALUES ('${clA}','${tA}','PERSON'::"ClientType",now())`);
    await sql(`INSERT INTO "Case"("id","tenantId","fileNumber","type","updatedAt")
      VALUES ('${caseA}','${tA}','2026/I04A-${S}','GENERAL_EXECUTION'::"CaseType",now())`);
    await sql(`INSERT INTO "CaseClient"("id","caseId","clientId","updatedAt") VALUES ('${ccA}','${caseA}','${clA}',now())`);
    const user = (id: string, t: string) => `('${id}','${t}','${id}@example.test','U','${id}',true,now())`;
    await sql(`INSERT INTO "User"("id","tenantId","email","name","surname","isActive","updatedAt") VALUES
      ${user(uReq, tA)}, ${user(uP1, tA)}, ${user(uP2, tA)}, ${user(uPlain, tA)}, ${user(uOther, tB)}`);
    const lw = (u: string, t: string, r: string, c: boolean) =>
      `('lw-${u}','${t}','${u}','L','${u}','${r}'::"LawyerRank",${c},now())`;
    await sql(`INSERT INTO "Lawyer"("id","tenantId","userId","name","surname","lawyerRank","canApproveOfficeActions","updatedAt") VALUES
      ${lw(uP1, tA, 'PARTNER', false)}, ${lw(uP2, tA, 'PARTNER', false)},
      ${lw(uPlain, tA, 'LAWYER', false)}, ${lw(uOther, tB, 'PARTNER', false)}`);
  });

  afterAll(async () => {
    await sql(`DELETE FROM "AuditLog" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "OfficeApprovalRequest" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "ClientFinancialDisclosureLine" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`UPDATE "ClientFinancialDisclosure" SET "currentVersionId" = NULL WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`UPDATE "ClientFinancialDisclosureVersion" SET "supersedesVersionId" = NULL WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "ClientFinancialDisclosureVersion" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "ClientFinancialDisclosure" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "CollectionDispositionLine" WHERE id LIKE 'i04-dl-%${S}%'`);
    await sql(`DELETE FROM "CollectionDisposition" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "Collection" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "Lawyer" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "User" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "CaseClient" WHERE id = '${ccA}'`);
    await sql(`DELETE FROM "Case" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "Client" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "Tenant" WHERE id IN ('${tA}','${tB}')`);
    await prisma.$disconnect();
  });

  // ── §35.10 mock provider yasagi ───────────────────────────────────────────────
  it('[1] mock provider yayınlamayı ASLA yetkilendiremez; provider’a tek byte gitmez', async () => {
    const versionId = await sendPending(`n1-${S}`);
    const mock = new FakeDispatcher('mock', ok);
    expect(await code(svcWith(mock).dispatchAndPublish({
      tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, subject: 'x',
    }))).toBe('DISCLOSURE_PUBLICATION_PROVIDER_NOT_PRODUCTION');
    expect(mock.calls).toHaveLength(0);
    const v = await readVersion(versionId);
    expect(v.status).toBe('SEND_PENDING');
    expect(v.publishedAt).toBeNull();
  });

  it('[1b] listede olmayan / boş provider adı da reddedilir', async () => {
    const versionId = await sendPending(`n1b-${S}`);
    for (const name of ['', '  ', 'console', 'fake-smtp']) {
      const d = new FakeDispatcher(name, ok);
      expect(await code(svcWith(d).dispatchAndPublish({
        tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, subject: 'x',
      }))).toBe('DISCLOSURE_PUBLICATION_PROVIDER_NOT_PRODUCTION');
      expect(d.calls).toHaveLength(0);
    }
  });

  // ── §35.11 (1) SEND_PENDING kalici commit ─────────────────────────────────────
  it('[2] CONTENT_APPROVED → SEND_PENDING kalıcı commit edilir ve idempotenttir', async () => {
    const versionId = await contentApproved(`p2-${S}`);
    const svc = svcWith(new FakeDispatcher('smtp', ok));
    const r1 = await svc.beginSend({ tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1 });
    expect(r1.replayed).toBe(false);
    expect(r1.status).toBe('SEND_PENDING');
    expect((await readVersion(versionId)).status).toBe('SEND_PENDING');
    const r2 = await svc.beginSend({ tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1 });
    expect(r2.replayed).toBe(true);
  });

  it('[3] beginSend yanlış statüden reddedilir (onay tamamlanmadan gönderim YOK)', async () => {
    const dispId = await seedSource(`n3-${S}`);
    const created = await writer.createDisclosureVersion({
      tenantId: tA, caseId: caseA, caseClientId: ccA,
      collectionDispositionId: dispId, sendIdempotencyKey: `i04-send-n3-${S}`,
    });
    expect(await code(svcWith(new FakeDispatcher('smtp', ok)).beginSend({
      tenantId: tA, disclosureVersionId: created.versionId, actorUserId: uP1,
    }))).toBe('DISCLOSURE_PUBLICATION_STATUS_INVALID');
  });

  // ── §35.11 (2)-(6) basarili yayinlama ─────────────────────────────────────────
  it('[4] başarılı gönderim → PUBLISHED, kalıcı message ID ve iki ayrı audit olayı', async () => {
    const versionId = await sendPending(`p4-${S}`);
    const d = new FakeDispatcher('smtp', ok);
    const r = await svcWith(d).dispatchAndPublish({
      tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, subject: 'Bildirim',
    });
    expect(r.status).toBe('PUBLISHED');
    expect(r.providerMessageId).toMatch(/^smtp-msg-/);
    expect(d.calls).toHaveLength(1);
    expect(d.calls[0].to).toContain('@example.test');

    const v = await readVersion(versionId);
    expect(v.status).toBe('PUBLISHED');
    expect(v.providerMessageId).toBe(r.providerMessageId);
    expect(v.providerAcceptedAt).toBeInstanceOf(Date);
    expect(v.publishedAt).toBeInstanceOf(Date);
    expect(v.sendFailureCode).toBeNull();

    const audits = await prisma.auditLog.findMany({
      where: { tenantId: tA, entityId: versionId },
      select: { action: true, entityType: true, metadata: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits.map((a) => a.action)).toEqual([
      'CLIENT_FINANCIAL_DISCLOSURE_SENT',
      'CLIENT_FINANCIAL_DISCLOSURE_PUBLISHED',
    ]);
    expect(audits[0].entityType).toBe('ClientFinancialDisclosureVersion');
    // §35.14: audit metadata finansal tutar, alıcı e-postası veya hash TAŞIMAZ.
    const meta = JSON.stringify(audits.map((a) => a.metadata));
    for (const forbidden of ['1750.50', '2500.75', '@example.test', v.snapshotHash, v.notificationContentHash]) {
      expect(meta).not.toContain(String(forbidden));
    }
  });

  // ── §35.10 kanit kapisi ───────────────────────────────────────────────────────
  it('[5] message ID yoksa SEND_FAILED — PUBLISHED OLMAZ', async () => {
    const versionId = await sendPending(`n5-${S}`);
    const d = new FakeDispatcher('smtp', () => ({ success: true, provider: 'smtp' }));
    const r = await svcWith(d).dispatchAndPublish({
      tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, subject: 'x',
    });
    expect(r.status).toBe('SEND_FAILED');
    const v = await readVersion(versionId);
    expect(v.status).toBe('SEND_FAILED');
    expect(v.publishedAt).toBeNull();
    expect(v.providerMessageId).toBeNull();
    expect(v.sendFailureCode).toBe('PROVIDER_MESSAGE_ID_MISSING');
  });

  it('[6] provider reddi SEND_FAILED üretir; hata DETAYI yalnız internal kolonda kalır', async () => {
    const versionId = await sendPending(`n6-${S}`);
    const d = new FakeDispatcher('smtp', () => ({
      success: false, errorCode: 'SMTP_550', errorMessage: 'mailbox unavailable', provider: 'smtp',
    }));
    const r = await svcWith(d).dispatchAndPublish({
      tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, subject: 'x',
    });
    expect(r.status).toBe('SEND_FAILED');
    expect(r.sendFailureCode).toBe('SMTP_550');
    const v = await readVersion(versionId);
    expect(v.sendFailureDetail).toBe('mailbox unavailable');
    expect(v.publishedAt).toBeNull();
    const audits = await prisma.auditLog.findMany({
      where: { tenantId: tA, entityId: versionId }, select: { action: true, metadata: true },
    });
    expect(audits.map((a) => a.action)).toEqual(['CLIENT_FINANCIAL_DISCLOSURE_SEND_FAILED']);
    expect(JSON.stringify(audits[0].metadata)).not.toContain('mailbox unavailable');
  });

  // ── cift gonderim / cift yayinlama ────────────────────────────────────────────
  it('[7] çift gönderim ENGELLENİR — ikinci dispatch provider’ı çağırmaz', async () => {
    const versionId = await sendPending(`n7-${S}`);
    const slow = new FakeDispatcher('smtp', () => ({ success: false, errorCode: 'X', provider: 'smtp' }));
    // İlk dispatch send'i sahiplenir ve SEND_FAILED'e düşer (sendRequestedAt DOLU kalır).
    await svcWith(slow).dispatchAndPublish({
      tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, subject: 'x',
    });
    const second = new FakeDispatcher('smtp', ok);
    // SEND_FAILED'ten dispatch reddedilir; explicit retrySend gerekir.
    expect(await code(svcWith(second).dispatchAndPublish({
      tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, subject: 'x',
    }))).toBe('DISCLOSURE_PUBLICATION_STATUS_INVALID');
    expect(second.calls).toHaveLength(0);
  });

  it('[8] çift yayınlama ENGELLENİR', async () => {
    const versionId = await sendPending(`n8-${S}`);
    await svcWith(new FakeDispatcher('smtp', ok)).dispatchAndPublish({
      tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, subject: 'x',
    });
    const again = new FakeDispatcher('smtp', ok);
    expect(await code(svcWith(again).dispatchAndPublish({
      tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, subject: 'x',
    }))).toBe('DISCLOSURE_PUBLICATION_ALREADY_PUBLISHED');
    expect(again.calls).toHaveLength(0);
    expect(await prisma.auditLog.count({
      where: { tenantId: tA, entityId: versionId, action: 'CLIENT_FINANCIAL_DISCLOSURE_PUBLISHED' },
    })).toBe(1);
  });

  // ── stale onay / degismis alici ───────────────────────────────────────────────
  it('[9] stale snapshot yayınlamayı ENGELLER; provider hiç çağrılmaz', async () => {
    const versionId = await sendPending(`n9-${S}`);
    await sql(`UPDATE "ClientFinancialDisclosureLine" SET "amount" = 9.99
      WHERE "disclosureVersionId" = '${versionId}' AND "type" = 'CLIENT_PAYABLE'::"CollectionDispositionLineType"`);
    const d = new FakeDispatcher('smtp', ok);
    expect(await code(svcWith(d).dispatchAndPublish({
      tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, subject: 'x',
    }))).toBe('DISCLOSURE_PUBLICATION_STALE_SNAPSHOT');
    expect(d.calls).toHaveLength(0);
    expect((await readVersion(versionId)).publishedAt).toBeNull();
  });

  it('[10] içerik kurcalanmışsa yayınlama ENGELLENİR', async () => {
    const versionId = await sendPending(`n10-${S}`);
    await sql(`UPDATE "ClientFinancialDisclosureVersion" SET "notificationContent" = 'KURCALANMIS' WHERE "id" = '${versionId}'`);
    const d = new FakeDispatcher('smtp', ok);
    expect(await code(svcWith(d).dispatchAndPublish({
      tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, subject: 'x',
    }))).toBe('DISCLOSURE_PUBLICATION_CONTENT_HASH_MISMATCH');
    expect(d.calls).toHaveLength(0);
  });

  it('[11] alıcı bağlaması yoksa hiçbir şey gönderilmez', async () => {
    const versionId = await sendPending(`n11-${S}`);
    await sql(`UPDATE "ClientFinancialDisclosureVersion" SET "approvedRecipientEmail" = NULL WHERE "id" = '${versionId}'`);
    const d = new FakeDispatcher('smtp', ok);
    expect(await code(svcWith(d).dispatchAndPublish({
      tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, subject: 'x',
    }))).toBe('DISCLOSURE_PUBLICATION_RECIPIENT_MISSING');
    expect(d.calls).toHaveLength(0);
  });

  it('[12] alıcı gönderim SIRASINDA değişirse yayınlama ENGELLENİR (gönderim kaydı korunur)', async () => {
    const versionId = await sendPending(`n12-${S}`);
    const d = new FakeDispatcher('smtp', ok, async () => {
      // Provider çağrısı sürerken alıcı bağlaması değiştirilir (hash de birlikte güncellenir
      // ki [10]'daki içerik-hash kapısı değil, ALICI kapısı izole edilsin).
      const v = await prisma.clientFinancialDisclosureVersion.findUniqueOrThrow({
        where: { id: versionId }, select: { notificationContent: true, snapshotHash: true },
      });
      const { domainSeparatedHash } = await import('../client-financial-disclosure-canonical');
      const { CLIENT_FINANCIAL_DISCLOSURE_NOTIFICATION_CONTENT_CONTRACT_VERSION } =
        await import('../client-financial-disclosure-approval.contract');
      const email = 'hijacked@example.test';
      const h = domainSeparatedHash(CLIENT_FINANCIAL_DISCLOSURE_NOTIFICATION_CONTENT_CONTRACT_VERSION, {
        contractVersion: CLIENT_FINANCIAL_DISCLOSURE_NOTIFICATION_CONTENT_CONTRACT_VERSION,
        tenantId: tA, disclosureVersionId: versionId, snapshotHash: v.snapshotHash,
        notificationContent: v.notificationContent, approvedRecipientEmail: email,
        approvedRecipientPortalUserId: null,
      });
      await sql(`UPDATE "ClientFinancialDisclosureVersion"
        SET "approvedRecipientEmail" = '${email}', "notificationContentHash" = '${h}' WHERE "id" = '${versionId}'`);
    });
    expect(await code(svcWith(d).dispatchAndPublish({
      tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, subject: 'x',
    }))).toBe('DISCLOSURE_PUBLICATION_RECIPIENT_CHANGED');
    expect(d.calls).toHaveLength(1);
    expect((await readVersion(versionId)).publishedAt).toBeNull();
  });

  // ── yetkilendirme ─────────────────────────────────────────────────────────────
  it('[13] yetkisiz aktör gönderim başlatamaz / yayınlayamaz', async () => {
    const versionId = await contentApproved(`n13-${S}`);
    expect(await code(svcWith(new FakeDispatcher('smtp', ok)).beginSend({
      tenantId: tA, disclosureVersionId: versionId, actorUserId: uPlain,
    }))).toBe('DISCLOSURE_PUBLICATION_NOT_ELIGIBLE');
  });

  it('[14] başka tenant aktörü reddedilir', async () => {
    const versionId = await contentApproved(`n14-${S}`);
    expect(await code(svcWith(new FakeDispatcher('smtp', ok)).beginSend({
      tenantId: tA, disclosureVersionId: versionId, actorUserId: uOther,
    }))).toBe('DISCLOSURE_PUBLICATION_TENANT_MISMATCH');
  });

  // ── §35.7 SEND_FAILED retry ───────────────────────────────────────────────────
  it('[15] retrySend SEND_FAILED → SEND_PENDING; sahiplenme serbest bırakılır ve yayınlanır', async () => {
    const versionId = await sendPending(`p15-${S}`);
    await svcWith(new FakeDispatcher('smtp', () => ({ success: false, errorCode: 'SMTP_421', provider: 'smtp' })))
      .dispatchAndPublish({ tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, subject: 'x' });
    expect((await readVersion(versionId)).sendRequestedAt).toBeInstanceOf(Date);

    const svc = svcWith(new FakeDispatcher('smtp', ok));
    const r = await svc.retrySend({ tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1 });
    expect(r.status).toBe('SEND_PENDING');
    expect((await readVersion(versionId)).sendRequestedAt).toBeNull();

    const done = await svc.dispatchAndPublish({
      tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, subject: 'x',
    });
    expect(done.status).toBe('PUBLISHED');
    expect((await readVersion(versionId)).sendFailureCode).toBeNull();
  });

  it('[16] yayınlanmış versiyon retry EDİLEMEZ', async () => {
    const versionId = await sendPending(`n16-${S}`);
    await svcWith(new FakeDispatcher('smtp', ok)).dispatchAndPublish({
      tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, subject: 'x',
    });
    expect(await code(svcWith(new FakeDispatcher('smtp', ok)).retrySend({
      tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1,
    }))).toBe('DISCLOSURE_PUBLICATION_ALREADY_PUBLISHED');
  });

  // ── §35.13 reversal / supersession ────────────────────────────────────────────
  it('[17] PUBLISHED → REVERSED; geçmiş korunur ve idempotenttir', async () => {
    const versionId = await sendPending(`p17-${S}`);
    const svc = svcWith(new FakeDispatcher('smtp', ok));
    await svc.dispatchAndPublish({ tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, subject: 'x' });
    const before = await readVersion(versionId);

    const r = await svc.reversePublishedVersion({
      tenantId: tA, disclosureVersionId: versionId, actorUserId: uP2, correctionReason: 'Hatalı tutar',
    });
    expect(r.status).toBe('REVERSED');
    const after = await readVersion(versionId);
    expect(after.reversedAt).toBeInstanceOf(Date);
    expect(after.correctionReason).toBe('Hatalı tutar');
    // Gönderim/yayınlama kanıtı SİLİNMEZ.
    expect(after.providerMessageId).toBe(before.providerMessageId);
    expect(after.publishedAt).toEqual(before.publishedAt);

    const again = await svc.reversePublishedVersion({
      tenantId: tA, disclosureVersionId: versionId, actorUserId: uP2, correctionReason: 'Hatalı tutar',
    });
    expect(again.replayed).toBe(true);
  });

  it('[18] yayınlanmamış versiyon reverse EDİLEMEZ', async () => {
    const versionId = await sendPending(`n18-${S}`);
    expect(await code(svcWith(new FakeDispatcher('smtp', ok)).reversePublishedVersion({
      tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, correctionReason: 'x',
    }))).toBe('DISCLOSURE_PUBLICATION_STATUS_INVALID');
  });

  it('[19] PUBLISHED → SUPERSEDED; yeni versiyon eskisine bağlanır ve idempotenttir', async () => {
    // Aynı disclosure kökü için ikinci bir versiyon: kaynak dispozisyonu aynı olmalı.
    const versionA = await sendPending(`p19-${S}`);
    const svc = svcWith(new FakeDispatcher('smtp', ok));
    await svc.dispatchAndPublish({ tenantId: tA, disclosureVersionId: versionA, actorUserId: uP1, subject: 'x' });
    const rootId = (await readVersion(versionA)).disclosureId;

    // v2'yi doğrudan aynı kök altında, onaylanmış biçimde kur (I02/I03 zinciri v1'i tüketti).
    const v2 = `i04-v2-${S}`;
    await sql(`INSERT INTO "ClientFinancialDisclosureVersion"
      ("id","tenantId","disclosureId","version","status","sourceCollectionId","sourceCollectionAmount",
       "sourceCollectionDate","dispositionTotalAmount","dispositionPostedAt","currency","totalCollected",
       "clientNetAmount","snapshotHash","sourceFingerprint","sendIdempotencyKey",
       "officeApprovedById","officeApprovedAt","contentApprovedById","contentApprovedAt","createdAt","updatedAt")
      SELECT '${v2}',"tenantId","disclosureId",2,'CONTENT_APPROVED'::"ClientFinancialDisclosureStatus",
       "sourceCollectionId","sourceCollectionAmount","sourceCollectionDate","dispositionTotalAmount",
       "dispositionPostedAt","currency","totalCollected","clientNetAmount",'${'a'.repeat(64)}',
       "sourceFingerprint",'i04-send-v2-${S}','${uP1}',now(),'${uP2}',now(),now(),now()
      FROM "ClientFinancialDisclosureVersion" WHERE "id" = '${versionA}'`);

    const r = await svc.supersedePublishedVersion({
      tenantId: tA, supersededVersionId: versionA, supersedingVersionId: v2,
      actorUserId: uP1, correctionReason: 'Düzeltme',
    });
    expect(r.status).toBe('SUPERSEDED');
    const oldV = await readVersion(versionA);
    const newV = await readVersion(v2);
    expect(oldV.status).toBe('SUPERSEDED');
    expect(oldV.supersededAt).toBeInstanceOf(Date);
    expect(oldV.providerMessageId).not.toBeNull(); // gecmis SILINMEZ
    expect(newV.supersedesVersionId).toBe(versionA);
    expect(newV.correctionReason).toBe('Düzeltme');
    expect(rootId).toBe(newV.disclosureId);

    const again = await svc.supersedePublishedVersion({
      tenantId: tA, supersededVersionId: versionA, supersedingVersionId: v2,
      actorUserId: uP1, correctionReason: 'Düzeltme',
    });
    expect(again.replayed).toBe(true);
  });

  it('[20] farklı disclosure’a ait veya onaylanmamış versiyonla supersession reddedilir', async () => {
    const a = await sendPending(`n20a-${S}`);
    const svc = svcWith(new FakeDispatcher('smtp', ok));
    await svc.dispatchAndPublish({ tenantId: tA, disclosureVersionId: a, actorUserId: uP1, subject: 'x' });
    const b = await contentApproved(`n20b-${S}`); // BASKA disclosure koku
    expect(await code(svc.supersedePublishedVersion({
      tenantId: tA, supersededVersionId: a, supersedingVersionId: b,
      actorUserId: uP1, correctionReason: 'x',
    }))).toBe('DISCLOSURE_PUBLICATION_SUPERSESSION_INVALID');
    expect((await readVersion(a)).status).toBe('PUBLISHED');
  });

  it('[21] terminal (reversed) versiyon yeniden yayınlanamaz', async () => {
    const versionId = await sendPending(`n21-${S}`);
    const svc = svcWith(new FakeDispatcher('smtp', ok));
    await svc.dispatchAndPublish({ tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, subject: 'x' });
    await svc.reversePublishedVersion({
      tenantId: tA, disclosureVersionId: versionId, actorUserId: uP2, correctionReason: 'x',
    });
    expect(await code(svc.beginSend({
      tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1,
    }))).toBe('DISCLOSURE_PUBLICATION_VERSION_TERMINAL');
  });

  // ── gercek eszamanlilik ───────────────────────────────────────────────────────
  it('[22] eşzamanlı iki dispatch TEK yayınlama üretir ve provider TEK kez çağrılır', async () => {
    const versionId = await sendPending(`c22-${S}`);
    const c1 = new PrismaClient();
    const c2 = new PrismaClient();
    const d1 = new FakeDispatcher('smtp', ok);
    const d2 = new FakeDispatcher('smtp', ok);
    try {
      const settled = await Promise.allSettled([
        svcWith(d1, c1).dispatchAndPublish({ tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1, subject: 'x' }),
        svcWith(d2, c2).dispatchAndPublish({ tenantId: tA, disclosureVersionId: versionId, actorUserId: uP2, subject: 'x' }),
      ]);
      const published = settled.filter(
        (s) => s.status === 'fulfilled' && s.value.status === 'PUBLISHED' && s.value.replayed === false,
      );
      expect(published).toHaveLength(1);
      expect(d1.calls.length + d2.calls.length).toBe(1);
      expect((await readVersion(versionId)).status).toBe('PUBLISHED');
      expect(await prisma.auditLog.count({
        where: { tenantId: tA, entityId: versionId, action: 'CLIENT_FINANCIAL_DISCLOSURE_PUBLISHED' },
      })).toBe(1);
    } finally {
      await c1.$disconnect();
      await c2.$disconnect();
    }
  });

  it('[23] hata gövdeleri ham Prisma kodu / finansal payload / alıcı SIZDIRMAZ', async () => {
    const versionId = await contentApproved(`n23-${S}`);
    let caught: unknown;
    try {
      await svcWith(new FakeDispatcher('smtp', ok)).beginSend({
        tenantId: tA, disclosureVersionId: versionId, actorUserId: uPlain,
      });
    } catch (e) {
      caught = e;
    }
    const body = JSON.stringify(
      (caught as ClientFinancialDisclosurePublicationAuthorizationError).getResponse(),
    );
    for (const forbidden of ['P20', '1750.50', '2500.75', '@example.test', 'prisma', 'stack']) {
      expect(body.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
