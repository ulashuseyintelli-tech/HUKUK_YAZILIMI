import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, ValidationPipe, type INestApplication } from '@nestjs/common';
import request = require('supertest');
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
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
  CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG,
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
    httpIdentityFixture = false,
  ): Promise<{ app: TestingModule; client: PrismaClient; close: () => Promise<void> }> => {
    const client = new PrismaClient();
    const email = new EmailProviderService({
      get: (k: string) => (k === 'EMAIL_PROVIDER' ? 'smtp' : undefined),
    } as unknown as ConfigService);
    jest.spyOn(email, 'send').mockImplementation(async (o) => {
      providerCalls.push({ instance: name, to: o.to });
      return reply(providerCalls.length) as never;
    });
    const builder = Test.createTestingModule({ imports: [ClientFinancialDisclosureModule] })
      .overrideProvider(PrismaService)
      .useValue(client)
      .overrideProvider(EmailProviderService)
      .useValue(email);
    // Only the added HTTP acceptance uses a synthetic identity adapter. It resolves
    // actual disposable-DB users; JWT signing/verification is not claimed by this test.
    if (httpIdentityFixture) builder.overrideGuard(JwtAuthGuard).useValue({
      canActivate: async (context: { switchToHttp: () => { getRequest: () => any } }) => {
        const req = context.switchToHttp().getRequest();
        const id = req.headers['x-test-user'];
        const user = typeof id === 'string' ? await client.user.findUnique({ where: { id } }) : null;
        if (!user?.isActive) throw new ForbiddenException();
        req.user = user;
        return true;
      },
    });
    const app = await builder.compile();
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
    await prisma.clientContact.create({ data: { clientId: clA, type: 'EMAIL', value: `client-${key}@example.test` } });
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
    await sql(`INSERT INTO "Client"("id","tenantId","type","email","updatedAt") VALUES ('${clA}','${tA}','PERSON'::"ClientType",'hp-${S}@example.test',now())`);
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

  it('5a real HTTP/DB recipient selection and rejection leave provider and persisted records unchanged', async () => {
    const inst = await bootInstance('5a-http', OK, true);
    const app = inst.app.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    const previousWrite = process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG];
    process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG] = 'true';
    try {
      await app.init();
      const key = `5a-http-${S}`;
      const source = await seedSource(key);
      const version = await inst.app.get(ClientFinancialDisclosureWriterService).createDisclosureVersion({ tenantId: tA, caseId: caseA, caseClientId: ccA, collectionDispositionId: source, sendIdempotencyKey: `5a-http-${S}` });
      const approval = inst.app.get(ClientFinancialDisclosureApprovalService);
      const pending = await approval.requestOfficeApproval({ tenantId: tA, disclosureVersionId: version.versionId, requesterUserId: uReq });
      await approval.completeOfficeApproval({ tenantId: tA, disclosureVersionId: version.versionId, approvalRequestId: pending.approvalRequestId!, approverUserId: uP1 });
      const path = `/client-financial-disclosures/office/clients/${clA}/versions/${version.versionId}/recipients`;
      const command = `/client-financial-disclosures/${version.versionId}/request-content-approval`;
      const state = async () => ({
        version: await prisma.clientFinancialDisclosureVersion.findUniqueOrThrow({ where: { id: version.versionId } }),
        audits: await prisma.auditLog.findMany({ where: { tenantId: tA }, orderBy: { id: 'asc' } }),
        requests: await prisma.officeApprovalRequest.findMany({ where: { tenantId: tA }, orderBy: { id: 'asc' } }),
      });
      const before = await state();
      const result = await request(app.getHttpServer()).get(path).set('x-test-user', uReq).expect(200);
      expect(Object.keys(result.body).sort()).toEqual(['options', 'selectedRecipient', 'surface']);
      expect(result.body.options).toContainEqual(expect.objectContaining({ email: `client-${key}@example.test` }));
      expect(result.body.selectedRecipient).toBeNull();
      await request(app.getHttpServer()).get(path.replace(`/clients/${clA}/`, '/clients/wrong-parent/')).set('x-test-user', uReq).expect(404);
      await request(app.getHttpServer()).get(path).expect(403);
      await request(app.getHttpServer()).post(command).set('x-test-user', uReq).send({ approvedRecipientEmail: 'outside@example.test' }).expect(409).expect(res => expect(res.body.code).toBe('DISCLOSURE_RECIPIENT_NOT_LINKED'));
      await request(app.getHttpServer()).post(command).set('x-test-user', uReq).send({ approvedRecipientEmail: { set: `client-${key}@example.test` } }).expect(400);
      await prisma.user.update({ where: { id: uReq }, data: { role: 'VIEWER' } });
      try {
        await request(app.getHttpServer()).post(command).set('x-test-user', uReq).send({ approvedRecipientEmail: `client-${key}@example.test` }).expect(403);
      } finally { await prisma.user.update({ where: { id: uReq }, data: { role: 'USER' } }); }
      expect(await state()).toEqual(before);
      expect(providerCalls).toHaveLength(0);
      await request(app.getHttpServer()).post(command).set('x-test-user', uReq).send({ approvedRecipientEmail: `client-${key}@example.test` }).expect(201);
      const selected = await request(app.getHttpServer()).get(path).set('x-test-user', uP2).expect(200);
      expect(selected.body.selectedRecipient).toEqual({ email: `client-${key}@example.test` });
      expect((await read(version.versionId)).status).toBe('CONTENT_APPROVAL_PENDING');
      expect(providerCalls).toHaveLength(0);
    } finally {
      if (previousWrite === undefined) delete process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG];
      else process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG] = previousWrite;
      await app.close();
      await inst.close();
    }
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
        approvedRecipientEmail: `hp-${S}@example.test`,
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
        tenantId: tA, disclosureVersionId: v, actorUserId: uP1,
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
        tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1,
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

  it('[3] RESTART PROOF: A sahiplenip düşerse B çift GÖNDERMEZ; kanıtsız legacy retry engellidir', async () => {
    // A gonderim SIRASINDA duser: saglayici cagrilir, fakat surec yayinlamayi tamamlayamaz.
    const a = await bootInstance('A', () => {
      throw new Error('process died mid-dispatch');
    });
    let versionId: string;
    try {
      versionId = await upToSendPending(a.app, `rst2-${S}`);
      const publication = a.app.get(ClientFinancialDisclosurePublicationService);
      await expect(
        publication.dispatchAndPublish({ tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1 }),
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
        publication.dispatchAndPublish({ tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1 }),
      ).rejects.toThrow();
      expect(providerCalls.filter((c) => c.instance === 'B')).toHaveLength(0);

      // Legacy DB mutation is NOT delivery evidence and must not authorize a resend.
      await prisma.clientFinancialDisclosureVersion.updateMany({
        where: { id: versionId, tenantId: tA },
        data: { status: 'SEND_FAILED', sendFailureCode: 'PROCESS_INTERRUPTED' },
      });
      const before = await read(versionId);
      await expect(publication.retrySend({ tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1 }))
        .rejects.toMatchObject({ response: { code: 'DISCLOSURE_PUBLICATION_RECONCILIATION_REQUIRED' } });
      expect(await read(versionId)).toEqual(before);
      expect(providerCalls.filter((c) => c.instance === 'B')).toHaveLength(0);
    } finally {
      await b.close();
    }
  });

  // CL-R10: real HTTP + Nest/Prisma/approval/FD adapter; only external transport is substituted.
  const withHttp = async (
    name: string,
    reply: (n: number) => unknown,
    run: (context: { module: TestingModule; http: INestApplication; client: PrismaClient }) => Promise<void>,
  ) => {
    const write = process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG];
    process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG] = 'true';
    const inst = await bootInstance(name, reply, true);
    const http = inst.app.createNestApplication();
    http.useLogger(false);
    http.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    try {
      await http.init();
      await run({ module: inst.app, http, client: inst.client });
    } finally {
      await http.close();
      await inst.close();
      if (write === undefined) delete process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG];
      else process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG] = write;
    }
  };
  const persisted = async (id: string) => ({
    version: await prisma.clientFinancialDisclosureVersion.findUniqueOrThrow({ where: { id } }),
    audits: await prisma.auditLog.findMany({ where: { tenantId: tA, entityId: id }, orderBy: { id: 'asc' } }),
  });
  const postRecovery = (http: INestApplication, id: string, actor = uP1) =>
    request(http.getHttpServer()).post(`/client-financial-disclosures/${id}/retry-publication`).set('x-test-user', actor);

  it.each(['reverse', 'supersede'])('KI-230 HTTP %s binds the actual principal and preserves the original replay attribution', async operation => {
    await withHttp(`ki230-http-${operation}`, OK, async ({ module, http }) => {
      const id = await upToSendPending(module, `ki230-http-${operation}-${S}`);
      const untouched = await persisted(id);
      await request(http.getHttpServer()).post(`/client-financial-disclosures/${id}/publish`).expect(403);
      expect(await persisted(id)).toEqual(untouched);
      expect(providerCalls).toHaveLength(0);
      await request(http.getHttpServer()).post(`/client-financial-disclosures/${id}/publish`)
        .set('x-test-user', uP1).send({ actorUserId: uP2 }).expect(201);
      let state = await persisted(id);
      expect(state.audits.find(a => a.action === 'CLIENT_FINANCIAL_DISCLOSURE_PUBLISHED'))
        .toMatchObject({ actorType: 'USER', userId: uP1 });
      expect(state.audits.find(a => a.action === 'CLIENT_FINANCIAL_DISCLOSURE_SENT'))
        .toMatchObject({ actorType: 'SYSTEM', userId: null });
      const body: { correctionReason: string; supersedingVersionId?: string } = { correctionReason: 'Düzeltme' };
      if (operation === 'supersede') {
        const original = await prisma.clientFinancialDisclosureVersion.findUniqueOrThrow({ where: { id } });
        const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...fields } = original;
        const next = `e2e-ki230-next-${S}`;
        await prisma.clientFinancialDisclosureVersion.create({ data: {
          ...fields, id: next, version: 2, status: 'CONTENT_APPROVED',
          officeApprovalRequestId: null, sendIdempotencyKey: `e2e-ki230-next-send-${S}`,
          sendRequestedAt: null, providerMessageId: null, providerAcceptedAt: null, publishedAt: null,
        } });
        body.supersedingVersionId = next;
      }
      const beforeCommand = await persisted(id);
      await request(http.getHttpServer()).post(`/client-financial-disclosures/${id}/${operation}`)
        .set('x-test-user', uP2).send({ ...body, actorUserId: uP1 }).expect(400);
      expect(await persisted(id)).toEqual(beforeCommand);
      await request(http.getHttpServer()).post(`/client-financial-disclosures/${id}/${operation}`)
        .set('x-test-user', uP2).send(body).expect(201);
      const action = operation === 'reverse' ? 'REVERSED' : 'SUPERSEDED';
      state = await persisted(id);
      expect(state.version.status).toBe(action);
      const commandAudits = state.audits.filter(a => a.action === `CLIENT_FINANCIAL_DISCLOSURE_${action}`);
      expect(commandAudits).toHaveLength(1);
      expect(commandAudits[0]).toMatchObject({ actorType: 'USER', userId: uP2 });
      const timeline = await request(http.getHttpServer())
        .get(`/client-financial-disclosures/office/clients/${clA}/versions/${id}/timeline`)
        .set('x-test-user', uP1).expect(200);
      expect(timeline.body.events.find((event: { type: string }) => event.type === action)?.actor).toBe('OFFICE_USER');
      expect(JSON.stringify(timeline.body)).not.toContain(uP2);
      expect(JSON.stringify(timeline.body)).not.toContain('userId');
      await request(http.getHttpServer()).post(`/client-financial-disclosures/${id}/${operation}`)
        .set('x-test-user', uP1).send(body).expect(201).expect(r => expect(r.body.replayed).toBe(true));
      expect(await persisted(id)).toEqual(state);
      expect(providerCalls).toHaveLength(1);
    });
  });

  it('CL-R10 HTTP never-claimed durable intent resumes the first send with the existing recipient gate', async () => {
    await withHttp('clr10-first-send', OK, async ({ module, http }) => {
      const id = await upToSendPending(module, `clr10-first-send-${S}`);
      expect((await read(id)).sendRequestedAt).toBeNull();
      expect(providerCalls).toHaveLength(0);
      const detail = await request(http.getHttpServer()).get(`/client-financial-disclosures/office/clients/${clA}/versions/${id}`).set('x-test-user', uP1).expect(200);
      expect(detail.body.actions.canPublish).toBe(true);
      expect(detail.body.actions.canRetryPublication).toBe(false);
      await request(http.getHttpServer()).get(`/client-financial-disclosures/office/clients/${clA}/versions/${id}/recipients`).set('x-test-user', uP1).expect(200)
        .expect(r => expect(r.body.selectedRecipient.email).toBe(`client-clr10-first-send-${S}@example.test`));
      await request(http.getHttpServer()).post(`/client-financial-disclosures/${id}/publish`).set('x-test-user', uP1).expect(201)
        .expect(r => expect(r.body.status).toBe('PUBLISHED'));
      const before = await persisted(id);
      await request(http.getHttpServer()).post(`/client-financial-disclosures/${id}/publish`).set('x-test-user', uP1).expect(409);
      expect(await persisted(id)).toEqual(before);
      expect(providerCalls).toHaveLength(1);
    });
  });

  it.each([
    ['timeout', { success: false, errorCode: 'ETIMEDOUT', provider: 'smtp', deliveryOutcome: 'INDETERMINATE' }],
    ['reset', { success: false, errorCode: 'ECONNRESET', provider: 'smtp', deliveryOutcome: 'INDETERMINATE' }],
    ['missing-id', { success: true, provider: 'smtp', deliveryOutcome: 'ACCEPTED' }],
    ['legacy', { success: false, errorCode: 'SMTP_550', provider: 'smtp' }],
    ['wrong-provider', { success: true, messageId: 'untrusted', provider: 'mock', deliveryOutcome: 'ACCEPTED' }],
  ])('CL-R10 HTTP %s cannot release claim, resend, publish or write success audit', async (key, result) => {
    await withHttp(`clr10-${key}`, () => result, async ({ module, http }) => {
      const id = await upToSendPending(module, `clr10-${key}-${S}`);
      await request(http.getHttpServer()).post(`/client-financial-disclosures/${id}/publish`).set('x-test-user', uP1)
        .expect(201).expect(r => expect(r.body.status).toBe('SEND_FAILED'));
      const before = await persisted(id);
      expect(before.version.providerMessageId).toBeNull();
      await postRecovery(http, id).expect(409).expect(r => expect(r.body.code).toBe('DISCLOSURE_PUBLICATION_RECONCILIATION_REQUIRED'));
      expect(await persisted(id)).toEqual(before);
      expect(providerCalls).toHaveLength(1);
      const detail = await request(http.getHttpServer()).get(`/client-financial-disclosures/office/clients/${clA}/versions/${id}`).set('x-test-user', uP1).expect(200);
      expect(detail.body.delivery.state).toBe('RECONCILIATION_REQUIRED');
      expect(detail.body.actions.canRetryPublication).toBe(false);
      expect(before.audits.filter(a => /_SENT$|_PUBLISHED$/.test(a.action))).toHaveLength(0);
    });
  });

  it('CL-R10 HTTP proven rejection permits one explicit resend and publishes once', async () => {
    await withHttp('clr10-rejected', n => n === 1
      ? { success: false, errorCode: 'SMTP_550', provider: 'smtp', deliveryOutcome: 'REJECTED' } : OK(n),
    async ({ module, http }) => {
      const id = await upToSendPending(module, `clr10-rejected-${S}`);
      await request(http.getHttpServer()).post(`/client-financial-disclosures/${id}/publish`).set('x-test-user', uP1).expect(201);
      const detail = await request(http.getHttpServer()).get(`/client-financial-disclosures/office/clients/${clA}/versions/${id}`).set('x-test-user', uP1).expect(200);
      expect(detail.body.delivery.state).toBe('FAILED_RETRY_AVAILABLE');
      expect(detail.body.actions.canRetryPublication).toBe(true);
      await postRecovery(http, id).expect(201).expect(r => expect(r.body.status).toBe('PUBLISHED'));
      const before = await persisted(id);
      await postRecovery(http, id).expect(409);
      expect(await persisted(id)).toEqual(before);
      expect(providerCalls).toHaveLength(2);
      expect(before.audits.filter(a => a.action === 'CLIENT_FINANCIAL_DISCLOSURE_SENT')).toHaveLength(1);
      expect(before.audits.filter(a => a.action === 'CLIENT_FINANCIAL_DISCLOSURE_PUBLISHED')).toHaveLength(1);
    });
  });

  it.each(['SENT', 'PUBLISHED'])('CL-R10 HTTP %s audit fault: restart preserves exact evidence boundary', async action => {
    let id = '';
    await withHttp(`clr10-fault-${action}`, OK, async ({ module, http }) => {
      id = await upToSendPending(module, `clr10-fault-${action}-${S}`);
      const service = module.get(ClientFinancialDisclosurePublicationService) as any;
      const original = service.writeAudit.bind(service);
      const fault = jest.spyOn(service, 'writeAudit').mockImplementation(async (...args: any[]) => {
        if (args[2] === `CLIENT_FINANCIAL_DISCLOSURE_${action}`) throw new Error('isolated audit fault');
        return original(...args);
      });
      try {
        await request(http.getHttpServer()).post(`/client-financial-disclosures/${id}/publish`).set('x-test-user', uP1).expect(500);
        expect(fault).toHaveBeenCalledWith(expect.anything(), expect.anything(), `CLIENT_FINANCIAL_DISCLOSURE_${action}`, expect.anything(),
          action === 'SENT' ? { actorType: 'SYSTEM' } : { actorType: 'USER', userId: uP1 });
      }
      finally { fault.mockRestore(); }
      const v = await read(id);
      expect(v.status).toBe('SEND_PENDING');
      expect(v.publishedAt).toBeNull();
      expect(v.providerMessageId === null).toBe(action === 'SENT');
      expect(providerCalls).toHaveLength(1);
    });
    const before = await persisted(id);
    await withHttp(`clr10-restart-${action}`, () => { throw new Error('RECOVERY MUST NOT SEND'); }, async ({ http }) => {
      if (action === 'SENT') {
        await postRecovery(http, id).expect(409);
        expect(await persisted(id)).toEqual(before);
      } else {
        const detail = await request(http.getHttpServer()).get(`/client-financial-disclosures/office/clients/${clA}/versions/${id}`).set('x-test-user', uP1).expect(200);
        expect(detail.body.delivery.state).toBe('PROVIDER_ACCEPTED');
        expect(detail.body.actions.canRetryPublication).toBe(true);
        const results = await Promise.all([postRecovery(http, id, uP2), postRecovery(http, id, uP2)]);
        expect(results.some(r => r.status === 201 && r.body.status === 'PUBLISHED')).toBe(true);
        expect(results.every(r => r.status === 201 || r.status === 409)).toBe(true);
        const after = await persisted(id);
        expect(after.version.providerMessageId).toBe(before.version.providerMessageId);
        expect(after.version.providerAcceptedAt).toEqual(before.version.providerAcceptedAt);
        expect(after.audits.filter(a => a.action === 'CLIENT_FINANCIAL_DISCLOSURE_SENT')).toHaveLength(1);
        expect(after.audits.filter(a => a.action === 'CLIENT_FINANCIAL_DISCLOSURE_PUBLISHED')).toHaveLength(1);
        expect(after.audits.find(a => a.action === 'CLIENT_FINANCIAL_DISCLOSURE_SENT'))
          .toMatchObject({ actorType: 'SYSTEM', userId: null });
        expect(after.audits.find(a => a.action === 'CLIENT_FINANCIAL_DISCLOSURE_PUBLISHED'))
          .toMatchObject({ actorType: 'USER', userId: uP2 });
      }
      expect(providerCalls).toHaveLength(1);
    });
  });

  it.each(['SEND_FAILED', 'SEND_PENDING'])('CL-R10 HTTP legacy %s with cleared claim is not fresh send intent', async status => {
    await withHttp('clr10-legacy-cleared', OK, async ({ module, http }) => {
      const id = await upToSendPending(module, `clr10-old-${status}-${S}`);
      await prisma.clientFinancialDisclosureVersion.update({ where: { id }, data: { status: status as any, sendRequestedAt: null, sendFailureCode: 'PROCESS_INTERRUPTED' } });
      const before = await persisted(id);
      await postRecovery(http, id).expect(409);
      if (status === 'SEND_PENDING') await request(http.getHttpServer()).post(`/client-financial-disclosures/${id}/publish`).set('x-test-user', uP1).expect(409);
      expect(await persisted(id)).toEqual(before);
      expect(providerCalls).toHaveLength(0);
    });
  });

  it('CL-R10 HTTP current actor, role, flag and recipient gates retain rejection atomicity', async () => {
    await withHttp('clr10-auth', () => ({ success: false, errorCode: 'SMTP_550', provider: 'smtp', deliveryOutcome: 'REJECTED' }), async ({ module, http }) => {
      const id = await upToSendPending(module, `clr10-auth-${S}`);
      await request(http.getHttpServer()).post(`/client-financial-disclosures/${id}/publish`).set('x-test-user', uP1).expect(201);
      const before = await persisted(id);
      await postRecovery(http, id, uReq).expect(403);
      await request(http.getHttpServer()).post(`/client-financial-disclosures/${id}/retry-publication`).expect(403);
      await prisma.user.update({ where: { id: uP1 }, data: { role: 'VIEWER' } });
      try { await postRecovery(http, id).expect(403); }
      finally { await prisma.user.update({ where: { id: uP1 }, data: { role: 'USER' } }); }
      await prisma.user.update({ where: { id: uP1 }, data: { isActive: false } });
      try { await postRecovery(http, id).expect(403); }
      finally { await prisma.user.update({ where: { id: uP1 }, data: { isActive: true } }); }
      delete process.env[CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG];
      try { await postRecovery(http, id).expect(403); }
      finally { process.env[CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG] = 'true'; }
      expect(await persisted(id)).toEqual(before);
      expect(providerCalls).toHaveLength(1);
      await prisma.clientContact.deleteMany({ where: { clientId: clA, value: `client-clr10-auth-${S}@example.test` } });
      await postRecovery(http, id).expect(409);
      expect(await persisted(id)).toEqual(before);
      expect(providerCalls).toHaveLength(1);
    });
  });

  // ── CONCURRENCY PROOF — IKI AYRI INSTANCE ───────────────────────────────────
  it('[4] CONCURRENCY PROOF: iki instance eşzamanlı yayınlar → tek kazanan, tek provider çağrısı', async () => {
    const a = await bootInstance('A', OK);
    const b = await bootInstance('B', OK);
    try {
      const versionId = await upToSendPending(a.app, `conc-${S}`);
      const settled = await Promise.allSettled([
        a.app.get(ClientFinancialDisclosurePublicationService).dispatchAndPublish({
          tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1,
        }),
        b.app.get(ClientFinancialDisclosurePublicationService).dispatchAndPublish({
          tenantId: tA, disclosureVersionId: versionId, actorUserId: uP2,
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
          tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1,
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
          tenantId: tA, disclosureVersionId: versionId, actorUserId: uP1,
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
