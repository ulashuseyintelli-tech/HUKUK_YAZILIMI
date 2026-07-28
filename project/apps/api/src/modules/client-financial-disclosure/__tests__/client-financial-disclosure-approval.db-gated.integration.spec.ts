import { PrismaClient } from '@prisma/client';
import { describeDb } from '../../../../test/describe-db';
import { ClientFinancialDisclosureApprovalService } from '../client-financial-disclosure-approval.service';
import {
  ClientFinancialDisclosureApprovalAuthorizationError,
  ClientFinancialDisclosureApprovalError,
} from '../client-financial-disclosure-approval.contract';
import { ClientFinancialDisclosureWriterService } from '../client-financial-disclosure-writer.service';

/**
 * CLIENT-P2-U03-TRACK-B-I03 — gerçek PostgreSQL approval + concurrency suite.
 * Brief §9 (22 zorunlu test) ve §8 (yarış senaryoları) kapsanır.
 *
 * TEST_DATABASE_URL yoksa suite atlanır (test/describe-db). Canlı `hukuk_db` üzerinde
 * ASLA koşmaz — test-infra fail-closed guard'ı korunur.
 */
describeDb('CLIENT-P2-U03-TRACK-B-I03 — disclosure approval (gerçek PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const writer = new ClientFinancialDisclosureWriterService(prisma);
  const svc = new ClientFinancialDisclosureApprovalService(prisma);
  const sql = (q: string) => prisma.$executeRawUnsafe(q);

  const S = Math.random().toString(36).slice(2, 10);
  const tA = `i03-tA-${S}`;
  const tB = `i03-tB-${S}`;
  const clA = `i03-clA-${S}`;
  const caseA = `i03-caseA-${S}`;
  const ccA = `i03-ccA-${S}`;

  // Aktörler (§41.3 canonical rol eşlemesi).
  const uRequester = `i03-req-${S}`; // aktif, tenant A, Lawyer linki YOK (talep eden)
  const uPartner = `i03-partner-${S}`; // PARTNER
  const uPartner2 = `i03-partner2-${S}`; // ikinci PARTNER (four-eyes karşı tarafı)
  const uManager = `i03-manager-${S}`; // MANAGER
  const uAuthorized = `i03-auth-${S}`; // LAWYER + canApproveOfficeActions
  const uPlainLawyer = `i03-plain-${S}`; // LAWYER, capability YOK → yetkisiz
  const uNoLawyer = `i03-staff-${S}`; // Lawyer linki YOK → staff
  const uInactive = `i03-inactive-${S}`; // PARTNER ama pasif
  const uOtherTenant = `i03-other-${S}`; // PARTNER ama tenant B

  const seedSource = async (key: string) => {
    const colId = `i03-col-${key}`;
    const dispId = `i03-disp-${key}`;
    await sql(`INSERT INTO "Collection"("id","tenantId","caseId","amount","currency","type","date","status","idempotencyKey","updatedAt")
      VALUES ('${colId}','${tA}','${caseA}',2500.75,'TRY','TAHSILAT'::"CollectionType",'2026-07-01T09:30:00Z','CONFIRMED'::"CollectionStatus",'i03-idem-${key}',now())`);
    await sql(`INSERT INTO "CollectionDisposition"("id","tenantId","caseId","collectionId","beneficiaryScope","caseClientId","status","totalAmount","currency","postedAt","createdAt","updatedAt")
      VALUES ('${dispId}','${tA}','${caseA}','${colId}','SINGLE_CASE_CLIENT'::"CollectionDispositionBeneficiaryScope",
        '${ccA}','POSTED'::"CollectionDispositionStatus",2500.75,'TRY','2026-07-02T10:00:00Z',now(),now())`);
    await sql(`INSERT INTO "CollectionDispositionLine"("id","dispositionId","type","amount","createdAt") VALUES
      ('i03-dl-${key}-a','${dispId}','CLIENT_PAYABLE'::"CollectionDispositionLineType",1750.50,now()),
      ('i03-dl-${key}-b','${dispId}','CONTRACTUAL_FEE_WITHHELD'::"CollectionDispositionLineType",750.25,now())`);
    return dispId;
  };

  /** Gerçek I02 writer'ı ile DRAFT versiyon üretir (uydurma fixture YOK). */
  const mkVersion = async (key: string): Promise<string> => {
    const dispId = await seedSource(key);
    const r = await writer.createDisclosureVersion({
      tenantId: tA,
      caseId: caseA,
      caseClientId: ccA,
      collectionDispositionId: dispId,
      sendIdempotencyKey: `i03-send-${key}`,
    });
    return r.versionId;
  };

  /** DRAFT → OFFICE_APPROVAL_PENDING kısayolu. */
  const pending = async (key: string) => {
    const versionId = await mkVersion(key);
    const r = await svc.requestOfficeApproval({
      tenantId: tA,
      disclosureVersionId: versionId,
      requesterUserId: uRequester,
    });
    return { versionId, approvalRequestId: r.approvalRequestId as string };
  };

  /** DRAFT → OFFICE_APPROVED kısayolu (ofis onaylayıcısı parametrik). */
  const officeApproved = async (key: string, approver = uPartner) => {
    const { versionId, approvalRequestId } = await pending(key);
    await svc.completeOfficeApproval({
      tenantId: tA,
      disclosureVersionId: versionId,
      approvalRequestId,
      approverUserId: approver,
    });
    return { versionId, approvalRequestId };
  };

  /** DRAFT → CONTENT_APPROVAL_PENDING kısayolu. */
  const contentPending = async (key: string, approver = uPartner) => {
    const { versionId, approvalRequestId } = await officeApproved(key, approver);
    await svc.requestContentApproval({
      tenantId: tA,
      disclosureVersionId: versionId,
      requesterUserId: uRequester,
      notificationContent: `Tahsilat bildirimi ${key}`,
      approvedRecipientEmail: `client-${key}@example.test`,
    });
    return { versionId, approvalRequestId };
  };

  const readVersion = (versionId: string) =>
    prisma.clientFinancialDisclosureVersion.findUniqueOrThrow({
      where: { id: versionId },
      select: {
        status: true,
        version: true,
        snapshotHash: true,
        officeApprovalRequestId: true,
        officeApprovedAt: true,
        officeApprovedById: true,
        contentApprovedAt: true,
        contentApprovedById: true,
        notificationContent: true,
        notificationContentHash: true,
        approvedRecipientEmail: true,
        _count: { select: { lines: true } },
      },
    });

  const code = async (p: Promise<unknown>): Promise<string> => {
    try {
      await p;
      return 'NO_ERROR';
    } catch (e) {
      expect(
        e instanceof ClientFinancialDisclosureApprovalError ||
          e instanceof ClientFinancialDisclosureApprovalAuthorizationError,
      ).toBe(true);
      return (
        e as ClientFinancialDisclosureApprovalError |
          ClientFinancialDisclosureApprovalAuthorizationError
      ).code;
    }
  };

  beforeAll(async () => {
    await sql(`INSERT INTO "Tenant"("id","name","slug","createdAt","updatedAt") VALUES
      ('${tA}','TA-${S}','i03-ta-${S}',now(),now()), ('${tB}','TB-${S}','i03-tb-${S}',now(),now())`);
    await sql(`INSERT INTO "Client"("id","tenantId","type","updatedAt") VALUES ('${clA}','${tA}','PERSON'::"ClientType",now())`);
    await sql(`INSERT INTO "Case"("id","tenantId","fileNumber","type","updatedAt")
      VALUES ('${caseA}','${tA}','2026/I03A-${S}','GENERAL_EXECUTION'::"CaseType",now())`);
    await sql(`INSERT INTO "CaseClient"("id","caseId","clientId","updatedAt") VALUES ('${ccA}','${caseA}','${clA}',now())`);

    const user = (id: string, tenantId: string, active: boolean) =>
      `('${id}','${tenantId}','${id}@example.test','U','${id}',${active},now())`;
    await sql(`INSERT INTO "User"("id","tenantId","email","name","surname","isActive","updatedAt") VALUES
      ${user(uRequester, tA, true)}, ${user(uPartner, tA, true)}, ${user(uPartner2, tA, true)},
      ${user(uManager, tA, true)}, ${user(uAuthorized, tA, true)}, ${user(uPlainLawyer, tA, true)},
      ${user(uNoLawyer, tA, true)}, ${user(uInactive, tA, false)}, ${user(uOtherTenant, tB, true)}`);

    const lawyer = (userId: string, tenantId: string, rank: string, cap: boolean) =>
      `('lw-${userId}','${tenantId}','${userId}','L','${userId}','${rank}'::"LawyerRank",${cap},now())`;
    await sql(`INSERT INTO "Lawyer"("id","tenantId","userId","name","surname","lawyerRank","canApproveOfficeActions","updatedAt") VALUES
      ${lawyer(uPartner, tA, 'PARTNER', false)}, ${lawyer(uPartner2, tA, 'PARTNER', false)},
      ${lawyer(uManager, tA, 'MANAGER', false)}, ${lawyer(uAuthorized, tA, 'LAWYER', true)},
      ${lawyer(uPlainLawyer, tA, 'LAWYER', false)}, ${lawyer(uInactive, tA, 'PARTNER', false)},
      ${lawyer(uOtherTenant, tB, 'PARTNER', false)}`);
  });

  afterAll(async () => {
    await sql(`DELETE FROM "OfficeApprovalRequest" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "ClientFinancialDisclosureLine" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`UPDATE "ClientFinancialDisclosure" SET "currentVersionId" = NULL WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "ClientFinancialDisclosureVersion" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "ClientFinancialDisclosure" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "CollectionDispositionLine" WHERE id LIKE 'i03-dl-%${S}%'`);
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

  // ── [1][2][3] yeterli aktörler ────────────────────────────────────────────────
  it('[1] PARTNER office approval verebilir; canonical alanlar dolar', async () => {
    const { versionId, approvalRequestId } = await pending(`p1-${S}`);
    const r = await svc.completeOfficeApproval({
      tenantId: tA, disclosureVersionId: versionId, approvalRequestId, approverUserId: uPartner,
    });
    expect(r.replayed).toBe(false);
    expect(r.status).toBe('OFFICE_APPROVED');

    const v = await readVersion(versionId);
    expect(v.status).toBe('OFFICE_APPROVED');
    expect(v.officeApprovalRequestId).toBe(approvalRequestId);
    expect(v.officeApprovedById).toBe(uPartner);
    expect(v.officeApprovedAt).toBeInstanceOf(Date);

    const req = await prisma.officeApprovalRequest.findUniqueOrThrow({
      where: { id: approvalRequestId },
      select: { actionCode: true, targetType: true, targetRef: true, status: true, approverUserId: true },
    });
    expect(req.actionCode).toBe('CLIENT_FINANCIAL_DISCLOSURE_APPROVE');
    expect(req.targetType).toBe('ClientFinancialDisclosureVersion');
    expect(req.targetRef).toBe(versionId);
    expect(req.status).toBe('APPROVED');
    expect(req.approverUserId).toBe(uPartner);
  });

  it('[2] MANAGER office approval verebilir', async () => {
    const { versionId, approvalRequestId } = await pending(`p2-${S}`);
    await svc.completeOfficeApproval({
      tenantId: tA, disclosureVersionId: versionId, approvalRequestId, approverUserId: uManager,
    });
    expect((await readVersion(versionId)).officeApprovedById).toBe(uManager);
  });

  it('[3] canApproveOfficeActions=true avukat office approval verebilir', async () => {
    const { versionId, approvalRequestId } = await pending(`p3-${S}`);
    await svc.completeOfficeApproval({
      tenantId: tA, disclosureVersionId: versionId, approvalRequestId, approverUserId: uAuthorized,
    });
    expect((await readVersion(versionId)).officeApprovedById).toBe(uAuthorized);
  });

  // ── [4][5][6][7] yetersiz aktörler ────────────────────────────────────────────
  it('[4] yetkisiz avukat (LAWYER, capability yok) reddedilir', async () => {
    const { versionId, approvalRequestId } = await pending(`n4-${S}`);
    expect(await code(svc.completeOfficeApproval({
      tenantId: tA, disclosureVersionId: versionId, approvalRequestId, approverUserId: uPlainLawyer,
    }))).toBe('DISCLOSURE_APPROVAL_NOT_ELIGIBLE');
    expect((await readVersion(versionId)).status).toBe('OFFICE_APPROVAL_PENDING');
  });

  it('[5] pasif kullanıcı reddedilir (PARTNER olsa bile)', async () => {
    const { versionId, approvalRequestId } = await pending(`n5-${S}`);
    expect(await code(svc.completeOfficeApproval({
      tenantId: tA, disclosureVersionId: versionId, approvalRequestId, approverUserId: uInactive,
    }))).toBe('DISCLOSURE_APPROVAL_NOT_ELIGIBLE');
  });

  it('[6] başka tenant kullanıcısı reddedilir (PARTNER olsa bile)', async () => {
    const { versionId, approvalRequestId } = await pending(`n6-${S}`);
    expect(await code(svc.completeOfficeApproval({
      tenantId: tA, disclosureVersionId: versionId, approvalRequestId, approverUserId: uOtherTenant,
    }))).toBe('DISCLOSURE_APPROVAL_TENANT_MISMATCH');
  });

  it('[7] Lawyer linki OLMAYAN kullanıcı (staff) reddedilir', async () => {
    const { versionId, approvalRequestId } = await pending(`n7-${S}`);
    expect(await code(svc.completeOfficeApproval({
      tenantId: tA, disclosureVersionId: versionId, approvalRequestId, approverUserId: uNoLawyer,
    }))).toBe('DISCLOSURE_APPROVAL_NOT_ELIGIBLE');
  });

  // ── [8][9][10][11] four-eyes (§41.2 KARAR 2/4) ────────────────────────────────
  it('[8] requester kendi talebine office approval VEREMEZ', async () => {
    const versionId = await mkVersion(`n8-${S}`);
    const r = await svc.requestOfficeApproval({
      tenantId: tA, disclosureVersionId: versionId, requesterUserId: uPartner,
    });
    expect(await code(svc.completeOfficeApproval({
      tenantId: tA, disclosureVersionId: versionId,
      approvalRequestId: r.approvalRequestId as string, approverUserId: uPartner,
    }))).toBe('DISCLOSURE_APPROVAL_SELF_APPROVAL_FORBIDDEN');
    expect((await readVersion(versionId)).officeApprovedById).toBeNull();
  });

  it('[9] requester content approval VEREMEZ', async () => {
    const versionId = await mkVersion(`n9-${S}`);
    const r = await svc.requestOfficeApproval({
      tenantId: tA, disclosureVersionId: versionId, requesterUserId: uManager,
    });
    await svc.completeOfficeApproval({
      tenantId: tA, disclosureVersionId: versionId,
      approvalRequestId: r.approvalRequestId as string, approverUserId: uPartner,
    });
    await svc.requestContentApproval({
      tenantId: tA, disclosureVersionId: versionId, requesterUserId: uRequester,
      notificationContent: 'x', approvedRecipientEmail: 'c@example.test',
    });
    expect(await code(svc.completeContentApproval({
      tenantId: tA, disclosureVersionId: versionId, contentApproverUserId: uManager,
    }))).toBe('DISCLOSURE_APPROVAL_SELF_APPROVAL_FORBIDDEN');
  });

  it('[10] office approver AYNI versiyonun content approval’ını VEREMEZ (four-eyes)', async () => {
    const { versionId } = await contentPending(`n10-${S}`, uPartner);
    expect(await code(svc.completeContentApproval({
      tenantId: tA, disclosureVersionId: versionId, contentApproverUserId: uPartner,
    }))).toBe('DISCLOSURE_APPROVAL_FOUR_EYES_VIOLATION');
    expect((await readVersion(versionId)).contentApprovedById).toBeNull();
  });

  it('[11] farklı eligible content approver başarılıdır; canonical alanlar dolar', async () => {
    const { versionId } = await contentPending(`p11-${S}`, uPartner);
    const r = await svc.completeContentApproval({
      tenantId: tA, disclosureVersionId: versionId, contentApproverUserId: uPartner2,
    });
    expect(r.status).toBe('CONTENT_APPROVED');

    const v = await readVersion(versionId);
    expect(v.status).toBe('CONTENT_APPROVED');
    expect(v.contentApprovedById).toBe(uPartner2);
    expect(v.contentApprovedAt).toBeInstanceOf(Date);
    expect(v.officeApprovedById).toBe(uPartner);
    expect(v.notificationContent).toContain('p11');
    expect(v.notificationContentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(v.approvedRecipientEmail).toContain('@example.test');
  });

  it('[11b] yetkisiz content approver reddedilir (content approver AYNI yeterlilik kümesi)', async () => {
    const { versionId } = await contentPending(`n11b-${S}`, uPartner);
    expect(await code(svc.completeContentApproval({
      tenantId: tA, disclosureVersionId: versionId, contentApproverUserId: uPlainLawyer,
    }))).toBe('DISCLOSURE_APPROVAL_NOT_ELIGIBLE');
  });

  // ── [12][13][14][15] bütünlük ve stale-onay kapıları ──────────────────────────
  it('[12] snapshot hash uyuşmazlığı office approval’ı ENGELLER', async () => {
    const { versionId, approvalRequestId } = await pending(`n12-${S}`);
    await sql(`UPDATE "ClientFinancialDisclosureLine" SET "amount" = 1.11
      WHERE "disclosureVersionId" = '${versionId}' AND "type" = 'CLIENT_PAYABLE'::"CollectionDispositionLineType"`);
    expect(await code(svc.completeOfficeApproval({
      tenantId: tA, disclosureVersionId: versionId, approvalRequestId, approverUserId: uPartner,
    }))).toBe('DISCLOSURE_APPROVAL_STALE_SNAPSHOT');
    const v = await readVersion(versionId);
    expect(v.status).toBe('OFFICE_APPROVAL_PENDING');
    expect(v.officeApprovedById).toBeNull();
    expect(v.officeApprovedAt).toBeNull();
  });

  it('[13] bildirim içeriği kurcalanırsa content approval ENGELLENİR', async () => {
    const { versionId } = await contentPending(`n13-${S}`, uPartner);
    await sql(`UPDATE "ClientFinancialDisclosureVersion" SET "notificationContent" = 'KURCALANMIS' WHERE "id" = '${versionId}'`);
    expect(await code(svc.completeContentApproval({
      tenantId: tA, disclosureVersionId: versionId, contentApproverUserId: uPartner2,
    }))).toBe('DISCLOSURE_APPROVAL_CONTENT_HASH_MISMATCH');
    expect((await readVersion(versionId)).contentApprovedById).toBeNull();
  });

  it('[13b] snapshot hash uyuşmazlığı content approval’ı da ENGELLER', async () => {
    const { versionId } = await contentPending(`n13b-${S}`, uPartner);
    await sql(`UPDATE "ClientFinancialDisclosureLine" SET "amount" = 2.22
      WHERE "disclosureVersionId" = '${versionId}' AND "type" = 'CLIENT_PAYABLE'::"CollectionDispositionLineType"`);
    expect(await code(svc.completeContentApproval({
      tenantId: tA, disclosureVersionId: versionId, contentApproverUserId: uPartner2,
    }))).toBe('DISCLOSURE_APPROVAL_STALE_SNAPSHOT');
  });

  it('[14] stale approval request (talebin hash’i değişmiş) reddedilir', async () => {
    const { versionId, approvalRequestId } = await pending(`n14-${S}`);
    // Talebin savedIntent'i başka bir snapshot'a işaret ediyor → versiyon SAĞLAM olsa bile stale.
    await sql(`UPDATE "OfficeApprovalRequest"
      SET "savedIntent" = jsonb_set("savedIntent"::jsonb, '{snapshotHash}', '"${'0'.repeat(64)}"')
      WHERE "id" = '${approvalRequestId}'`);
    expect(await code(svc.completeOfficeApproval({
      tenantId: tA, disclosureVersionId: versionId, approvalRequestId, approverUserId: uPartner,
    }))).toBe('DISCLOSURE_APPROVAL_STALE_SNAPSHOT');
  });

  it('[15] başka versiyona ait approval request reddedilir', async () => {
    const a = await pending(`n15a-${S}`);
    const b = await pending(`n15b-${S}`);
    expect(await code(svc.completeOfficeApproval({
      tenantId: tA, disclosureVersionId: a.versionId,
      approvalRequestId: b.approvalRequestId, approverUserId: uPartner,
    }))).toBe('DISCLOSURE_APPROVAL_REQUEST_MISMATCH');
    expect((await readVersion(a.versionId)).officeApprovedById).toBeNull();
  });

  it('[15b] zaten karara bağlanmış talep tekrar tüketilemez', async () => {
    const { versionId, approvalRequestId } = await officeApproved(`n15c-${S}`, uPartner);
    // Versiyon geri DRAFT'a değil; ikinci bir versiyon aynı talebe bağlanamaz (REQUEST_MISMATCH).
    const other = await mkVersion(`n15d-${S}`);
    expect(await code(svc.completeOfficeApproval({
      tenantId: tA, disclosureVersionId: other, approvalRequestId, approverUserId: uPartner,
    }))).toBe('DISCLOSURE_APPROVAL_STATUS_INVALID');
    expect((await readVersion(versionId)).status).toBe('OFFICE_APPROVED');
  });

  // ── [16] idempotency ──────────────────────────────────────────────────────────
  it('[16] duplicate event duplicate transition ÜRETMEZ (talep + onay)', async () => {
    const versionId = await mkVersion(`p16-${S}`);
    const r1 = await svc.requestOfficeApproval({
      tenantId: tA, disclosureVersionId: versionId, requesterUserId: uRequester,
    });
    const r2 = await svc.requestOfficeApproval({
      tenantId: tA, disclosureVersionId: versionId, requesterUserId: uRequester,
    });
    expect(r1.replayed).toBe(false);
    expect(r2.replayed).toBe(true);
    expect(r2.approvalRequestId).toBe(r1.approvalRequestId);
    expect(await prisma.officeApprovalRequest.count({ where: { tenantId: tA, targetRef: versionId } })).toBe(1);

    const a1 = await svc.completeOfficeApproval({
      tenantId: tA, disclosureVersionId: versionId,
      approvalRequestId: r1.approvalRequestId as string, approverUserId: uPartner,
    });
    const stampedAt = (await readVersion(versionId)).officeApprovedAt;
    const a2 = await svc.completeOfficeApproval({
      tenantId: tA, disclosureVersionId: versionId,
      approvalRequestId: r1.approvalRequestId as string, approverUserId: uPartner,
    });
    expect(a1.replayed).toBe(false);
    expect(a2.replayed).toBe(true);
    expect((await readVersion(versionId)).officeApprovedAt).toEqual(stampedAt);
  });

  // ── [17][18] gerçek eşzamanlılık (ayrı PrismaClient bağlantıları) ─────────────
  it('[17] eşzamanlı iki office approver TEK canonical sonuç üretir', async () => {
    const { versionId, approvalRequestId } = await pending(`c17-${S}`);
    const c1 = new PrismaClient();
    const c2 = new PrismaClient();
    try {
      const s1 = new ClientFinancialDisclosureApprovalService(c1);
      const s2 = new ClientFinancialDisclosureApprovalService(c2);
      const settled = await Promise.allSettled([
        s1.completeOfficeApproval({ tenantId: tA, disclosureVersionId: versionId, approvalRequestId, approverUserId: uPartner }),
        s2.completeOfficeApproval({ tenantId: tA, disclosureVersionId: versionId, approvalRequestId, approverUserId: uManager }),
      ]);
      const ok = settled.filter(
        (s) => s.status === 'fulfilled' && s.value.replayed === false,
      );
      expect(ok).toHaveLength(1);
      const v = await readVersion(versionId);
      expect(v.status).toBe('OFFICE_APPROVED');
      expect([uPartner, uManager]).toContain(v.officeApprovedById);
    } finally {
      await c1.$disconnect();
      await c2.$disconnect();
    }
  });

  it('[18] eşzamanlı iki content approver TEK canonical sonuç üretir', async () => {
    const { versionId } = await contentPending(`c18-${S}`, uAuthorized);
    const c1 = new PrismaClient();
    const c2 = new PrismaClient();
    try {
      const s1 = new ClientFinancialDisclosureApprovalService(c1);
      const s2 = new ClientFinancialDisclosureApprovalService(c2);
      const settled = await Promise.allSettled([
        s1.completeContentApproval({ tenantId: tA, disclosureVersionId: versionId, contentApproverUserId: uPartner }),
        s2.completeContentApproval({ tenantId: tA, disclosureVersionId: versionId, contentApproverUserId: uPartner2 }),
      ]);
      const ok = settled.filter(
        (s) => s.status === 'fulfilled' && s.value.replayed === false,
      );
      expect(ok).toHaveLength(1);
      const v = await readVersion(versionId);
      expect(v.status).toBe('CONTENT_APPROVED');
      expect([uPartner, uPartner2]).toContain(v.contentApprovedById);
      expect(v.contentApprovedById).not.toBe(v.officeApprovedById);
    } finally {
      await c1.$disconnect();
      await c2.$disconnect();
    }
  });

  it('[18b] eşzamanlı iki approval TALEBİ tek OfficeApprovalRequest üretir', async () => {
    const versionId = await mkVersion(`c18b-${S}`);
    const c1 = new PrismaClient();
    const c2 = new PrismaClient();
    try {
      const s1 = new ClientFinancialDisclosureApprovalService(c1);
      const s2 = new ClientFinancialDisclosureApprovalService(c2);
      await Promise.allSettled([
        s1.requestOfficeApproval({ tenantId: tA, disclosureVersionId: versionId, requesterUserId: uRequester }),
        s2.requestOfficeApproval({ tenantId: tA, disclosureVersionId: versionId, requesterUserId: uRequester }),
      ]);
      expect(await prisma.officeApprovalRequest.count({ where: { tenantId: tA, targetRef: versionId } })).toBe(1);
      expect((await readVersion(versionId)).status).toBe('OFFICE_APPROVAL_PENDING');
    } finally {
      await c1.$disconnect();
      await c2.$disconnect();
    }
  });

  // ── [19] geçersiz yaşam döngüsü atlamaları (§41.5) ────────────────────────────
  it('[19] geçersiz status atlamaları reddedilir', async () => {
    const draft = await mkVersion(`n19a-${S}`);
    // DRAFT → OFFICE_APPROVED (talep yok)
    expect(await code(svc.completeOfficeApproval({
      tenantId: tA, disclosureVersionId: draft, approvalRequestId: 'yok', approverUserId: uPartner,
    }))).toBe('DISCLOSURE_APPROVAL_STATUS_INVALID');
    // DRAFT → CONTENT_APPROVAL_PENDING
    expect(await code(svc.requestContentApproval({
      tenantId: tA, disclosureVersionId: draft, requesterUserId: uRequester,
      notificationContent: 'x', approvedRecipientEmail: 'c@example.test',
    }))).toBe('DISCLOSURE_APPROVAL_STATUS_INVALID');
    // DRAFT → CONTENT_APPROVED
    expect(await code(svc.completeContentApproval({
      tenantId: tA, disclosureVersionId: draft, contentApproverUserId: uPartner,
    }))).toBe('DISCLOSURE_APPROVAL_STATUS_INVALID');
    // OFFICE_APPROVED → CONTENT_APPROVED (içerik hazırlanmadan)
    const { versionId: approved } = await officeApproved(`n19b-${S}`, uPartner);
    expect(await code(svc.completeContentApproval({
      tenantId: tA, disclosureVersionId: approved, contentApproverUserId: uPartner2,
    }))).toBe('DISCLOSURE_APPROVAL_STATUS_INVALID');
    // OFFICE_APPROVAL_PENDING → CONTENT_APPROVAL_PENDING
    const { versionId: pend } = await pending(`n19c-${S}`);
    expect(await code(svc.requestContentApproval({
      tenantId: tA, disclosureVersionId: pend, requesterUserId: uRequester,
      notificationContent: 'x', approvedRecipientEmail: 'c@example.test',
    }))).toBe('DISCLOSURE_APPROVAL_STATUS_INVALID');
  });

  it('[19b] terminal (cancelled) versiyon onaylanamaz', async () => {
    const { versionId, approvalRequestId } = await pending(`n19d-${S}`);
    await sql(`UPDATE "ClientFinancialDisclosureVersion" SET "cancelledAt" = now() WHERE "id" = '${versionId}'`);
    expect(await code(svc.completeOfficeApproval({
      tenantId: tA, disclosureVersionId: versionId, approvalRequestId, approverUserId: uPartner,
    }))).toBe('DISCLOSURE_APPROVAL_VERSION_TERMINAL');
  });

  it('[19c] tenant dışından okunan versiyon bulunamaz (tenant scope)', async () => {
    const { versionId, approvalRequestId } = await pending(`n19e-${S}`);
    expect(await code(svc.completeOfficeApproval({
      tenantId: tB, disclosureVersionId: versionId, approvalRequestId, approverUserId: uOtherTenant,
    }))).toBe('DISCLOSURE_APPROVAL_VERSION_NOT_FOUND');
  });

  // ── [20][21][22] sızıntı, kısmi yazma, I02 invariant koruması ─────────────────
  it('[20] ham Prisma kodu / SQLSTATE / finansal payload SIZMAZ', async () => {
    const { versionId, approvalRequestId } = await pending(`n20-${S}`);
    let caught: unknown;
    try {
      await svc.completeOfficeApproval({
        tenantId: tA, disclosureVersionId: versionId, approvalRequestId, approverUserId: uPlainLawyer,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ClientFinancialDisclosureApprovalAuthorizationError);
    const body = JSON.stringify(
      (caught as ClientFinancialDisclosureApprovalAuthorizationError).getResponse(),
    );
    for (const forbidden of ['P20', '1750.50', '2500.75', 'prisma', 'Invalid `', 'stack']) {
      expect(body.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('[21] başarısız geçiş HİÇBİR lifecycle alanını kısmen yazmaz', async () => {
    const { versionId } = await contentPending(`n21-${S}`, uPartner);
    const before = await readVersion(versionId);
    // Four-eyes ihlali: hiçbir alan değişmemeli.
    await code(svc.completeContentApproval({
      tenantId: tA, disclosureVersionId: versionId, contentApproverUserId: uPartner,
    }));
    const after = await readVersion(versionId);
    expect(after).toEqual(before);
  });

  it('[22] onay zinciri I02 snapshot/version invariant’larını BOZMAZ', async () => {
    const versionId = await mkVersion(`p22-${S}`);
    const before = await readVersion(versionId);
    const verifyBefore = await writer.verifyPersistedSnapshot({ tenantId: tA, versionId });

    const r = await svc.requestOfficeApproval({
      tenantId: tA, disclosureVersionId: versionId, requesterUserId: uRequester,
    });
    await svc.completeOfficeApproval({
      tenantId: tA, disclosureVersionId: versionId,
      approvalRequestId: r.approvalRequestId as string, approverUserId: uManager,
    });
    await svc.requestContentApproval({
      tenantId: tA, disclosureVersionId: versionId, requesterUserId: uRequester,
      notificationContent: 'Tahsilat bildirimi', approvedRecipientEmail: 'p22@example.test',
    });
    await svc.completeContentApproval({
      tenantId: tA, disclosureVersionId: versionId, contentApproverUserId: uPartner,
    });

    const after = await readVersion(versionId);
    const verifyAfter = await writer.verifyPersistedSnapshot({ tenantId: tA, versionId });
    expect(after.snapshotHash).toBe(before.snapshotHash);
    expect(after.version).toBe(before.version);
    expect(after._count.lines).toBe(before._count.lines);
    expect(verifyBefore.verdict).toBe('MATCH');
    expect(verifyAfter.verdict).toBe('MATCH');
    expect(after.status).toBe('CONTENT_APPROVED');
    // Zincirin sonunda üç ayrı aktör: requester, office approver, content approver.
    expect(new Set([uRequester, after.officeApprovedById, after.contentApprovedById]).size).toBe(3);
  });

  it('[22b] içerik/alıcı zorunludur — boş içerik fail-closed reddedilir', async () => {
    const { versionId } = await officeApproved(`n22b-${S}`, uPartner);
    expect(await code(svc.requestContentApproval({
      tenantId: tA, disclosureVersionId: versionId, requesterUserId: uRequester,
      notificationContent: '   ', approvedRecipientEmail: 'c@example.test',
    }))).toBe('DISCLOSURE_APPROVAL_CONTENT_REQUIRED');
    expect((await readVersion(versionId)).status).toBe('OFFICE_APPROVED');
  });
});
