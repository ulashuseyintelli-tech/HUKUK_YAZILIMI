/**
 * OFFICE-A07 — kontrollü yürütme + hedefli reconcile sözleşmesi.
 *
 * Owner'ın zorunlu kıldığı ayırt edici kontroller burada KODLA sabitlenir:
 *  1. Aynı aktörün NORMAL controller yolundan aynı statüye geçişi, ilgili onay için başarı
 *     kanıtı OLUŞTURAMAZ (bağ yazılmaz → reconcile BELİRSİZ döner).
 *  2. İstemcinin SAHTE `approvalRequestId` göndermesi kanıt üretemez (DTO reddeder).
 *  3. Kanıt VARSA reconcile doğru sonucu bulur ve işlemi YENİDEN UYGULAMAZ.
 *  4. Yanlış tenant / yanlış talep / YANLIŞ DENEME bağı reddedilir.
 *  5. Yetkisiz · yanlış ofis bağlamı · BAYRAK KAPALI reddedilir (bayrak yetki yerine geçmez).
 *
 * Ayrıca: genel cron reconcile metodu (`reconcileStuckRunning`) DEĞİŞTİRİLMEDİ — bu spec
 * yalnız yeni `OfficeApprovalControlledExecutionService` yolunu ölçer.
 */
import 'reflect-metadata';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { OfficeApprovalControlledExecutionService } from '../office-approval-controlled-execution.service';
import { ChangeCaseStatusDto } from '../../case-status/dto/change-case-status.dto';
import { applyCaseStatusChange } from '../../case-status/case-status.service';

const TENANT = 'off-acc-t1';
const OFFICE = 'office-1';
const ACTOR = 'u-admin';
const REQ_ID = 'req-1';
const CASE_ID = 'case-1';

const FLAG = 'OFFICE_APPROVAL_CONTROLLED_EXECUTION_ENABLED';

const approvalRow = (over: Record<string, unknown> = {}) => ({
  id: REQ_ID,
  tenantId: TENANT,
  actionCode: 'CHANGE_STATUS',
  targetType: 'LegalCase',
  targetRef: CASE_ID,
  status: 'APPROVED',
  executionStatus: 'RUNNING',
  approverUserId: 'u-approver',
  retryCount: 0,
  ...over,
});

const build = (opts: {
  approval?: Record<string, unknown> | null;
  history?: Record<string, unknown> | null;
  office?: { id: string } | null;
  f01?: boolean;
} = {}) => {
  const prisma: any = {
    office: { findUnique: jest.fn().mockResolvedValue(opts.office === undefined ? { id: OFFICE } : opts.office) },
    officeApprovalRequest: {
      findFirst: jest.fn().mockResolvedValue(opts.approval === undefined ? approvalRow() : opts.approval),
    },
    caseStatusHistory: { findFirst: jest.fn().mockResolvedValue(opts.history ?? null) },
  };
  const officeApproval: any = {
    isF01ActorAuthorized: jest.fn().mockResolvedValue(opts.f01 === undefined ? true : opts.f01),
    markExecutionSucceeded: jest.fn().mockResolvedValue({ executionStatus: 'SUCCEEDED' }),
  };
  const executor: any = { execute: jest.fn().mockResolvedValue({ id: REQ_ID, executionStatus: 'SUCCEEDED' }) };
  return { svc: new OfficeApprovalControlledExecutionService(prisma, officeApproval, executor), prisma, officeApproval, executor };
};

describe('A-07 — bayrak varsayilan KAPALI ve yetki yerine GECMEZ', () => {
  afterEach(() => { delete process.env[FLAG]; });

  it('bayrak TANIMSIZ -> execute REDDEDILIR (fail-safe kapali)', async () => {
    const { svc } = build();
    await expect(svc.execute(REQ_ID, TENANT, ACTOR, 'ADMIN')).rejects.toThrow(ForbiddenException);
  });

  it("bayrak 'false' -> REDDEDILIR", async () => {
    process.env[FLAG] = 'false';
    const { svc } = build();
    await expect(svc.execute(REQ_ID, TENANT, ACTOR, 'ADMIN')).rejects.toThrow(ForbiddenException);
  });

  it('bayrak ACIK ama ADMIN DEGIL -> yine REDDEDILIR (bayrak yetki yerine gecmez)', async () => {
    process.env[FLAG] = 'true';
    const { svc } = build();
    await expect(svc.execute(REQ_ID, TENANT, ACTOR, 'USER')).rejects.toThrow(ForbiddenException);
  });

  it('bayrak ACIK, ADMIN ama F01 kapisi false -> REDDEDILIR', async () => {
    process.env[FLAG] = 'true';
    const { svc } = build({ f01: false });
    await expect(svc.execute(REQ_ID, TENANT, ACTOR, 'ADMIN')).rejects.toThrow(ForbiddenException);
  });

  it('OFIS BULUNAMAZSA REDDEDILIR (fail-closed; yokluk "kontrol atlanir" DEMEK DEGIL)', async () => {
    process.env[FLAG] = 'true';
    const { svc, officeApproval } = build({ office: null });
    await expect(svc.execute(REQ_ID, TENANT, ACTOR, 'ADMIN')).rejects.toThrow(ForbiddenException);
    expect(officeApproval.isF01ActorAuthorized).not.toHaveBeenCalled();
  });

  it('ofis baglami SUNUCUDA cozulur ve F01\'e GECIRILIR (istemciden alinmaz)', async () => {
    process.env[FLAG] = 'true';
    const { svc, officeApproval, prisma } = build();
    await svc.execute(REQ_ID, TENANT, ACTOR, 'ADMIN');
    expect(prisma.office.findUnique).toHaveBeenCalledWith({ where: { tenantId: TENANT }, select: { id: true } });
    expect(officeApproval.isF01ActorAuthorized).toHaveBeenCalledWith(ACTOR, TENANT, OFFICE);
  });
});

describe('A-07 — kapsam ve tenant siniri', () => {
  beforeEach(() => { process.env[FLAG] = 'true'; });
  afterEach(() => { delete process.env[FLAG]; });

  it('talep BASKA tenant\'ta / yok -> 404 (varlik sizdirma yok)', async () => {
    const { svc } = build({ approval: null });
    await expect(svc.execute(REQ_ID, TENANT, ACTOR, 'ADMIN')).rejects.toThrow(NotFoundException);
  });

  it('kapsam disi actionCode -> 4xx, executor CAGRILMAZ', async () => {
    const { svc, executor } = build({ approval: approvalRow({ actionCode: 'COLLECTION_DISPOSITION_POST' }) });
    await expect(svc.execute(REQ_ID, TENANT, ACTOR, 'ADMIN')).rejects.toThrow(BadRequestException);
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('kapsam disi targetType -> 4xx', async () => {
    const { svc } = build({ approval: approvalRow({ targetType: 'Client' }) });
    await expect(svc.execute(REQ_ID, TENANT, ACTOR, 'ADMIN')).rejects.toThrow(BadRequestException);
  });
});

describe('A-07 — hedefli reconcile KESIN BAG ister', () => {
  beforeEach(() => { process.env[FLAG] = 'true'; });
  afterEach(() => { delete process.env[FLAG]; });

  it('KANIT YOK -> SUCCEEDED YAZILMAZ, BELIRSIZ doner', async () => {
    const { svc, officeApproval } = build({ history: null });
    const r: any = await svc.reconcile(REQ_ID, TENANT, ACTOR, 'ADMIN');
    expect(r.verdict).toBe('BELIRSIZ');
    expect(r.reason).toBe('EXECUTION_EVIDENCE_NOT_FOUND');
    expect(officeApproval.markExecutionSucceeded).not.toHaveBeenCalled();
  });

  it('kanit sorgusu TALEBE VE DENEMEYE baglidir (zaman penceresi DEGIL)', async () => {
    const { svc, prisma } = build({ approval: approvalRow({ retryCount: 2 }), history: null });
    await svc.reconcile(REQ_ID, TENANT, ACTOR, 'ADMIN');
    expect(prisma.caseStatusHistory.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { approvalRequestId: REQ_ID, approvalAttempt: 2 } }),
    );
  });

  it('KANIT VAR -> SUCCEEDED yazilir ve islem YENIDEN UYGULANMAZ', async () => {
    const { svc, officeApproval, executor } = build({ history: { id: 'h1', toStatus: 'HITAM', createdAt: new Date() } });
    const r: any = await svc.reconcile(REQ_ID, TENANT, ACTOR, 'ADMIN');
    expect(r.verdict).toBe('SUCCEEDED');
    expect(r.evidenceId).toBe('h1');
    expect(officeApproval.markExecutionSucceeded).toHaveBeenCalledTimes(1);
    expect(executor.execute).not.toHaveBeenCalled(); // RE-APPLY YOK
  });

  it('RUNNING olmayan talepte reconcile REDDEDILIR', async () => {
    const { svc } = build({ approval: approvalRow({ executionStatus: 'SUCCEEDED' }) });
    await expect(svc.reconcile(REQ_ID, TENANT, ACTOR, 'ADMIN')).rejects.toThrow(ConflictException);
  });

  it('APPROVED olmayan talepte reconcile REDDEDILIR', async () => {
    const { svc } = build({ approval: approvalRow({ status: 'PENDING_APPROVAL' }) });
    await expect(svc.reconcile(REQ_ID, TENANT, ACTOR, 'ADMIN')).rejects.toThrow(ConflictException);
  });
});

describe('A-07 — istemci SAHTE bag URETEMEZ (DTO siniri)', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const body = (metatype: any) => ({ type: 'body' as const, metatype });

  it.each(['approvalRequestId', 'approvalAttempt'])(
    'gövdede %s -> 400 (forbidNonWhitelisted)',
    async (field) => {
      await expect(
        pipe.transform({ status: 'HITAM', [field]: 'enjekte' }, body(ChangeCaseStatusDto)),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it('mesru govde 400 OLMAZ (mevcut cagiranlar korunur)', async () => {
    const out: any = await pipe.transform(
      { status: 'HITAM', reason: 'gerekce', userId: 'yok-sayilir', confirmationToken: 't' },
      body(ChangeCaseStatusDto),
    );
    expect(out.status).toBe('HITAM');
    expect(out.reason).toBe('gerekce');
  });

  it('gecersiz statu enum -> 400', async () => {
    await expect(pipe.transform({ status: 'OLMAYAN' }, body(ChangeCaseStatusDto))).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('A-07 — bag AYNI transaction\'da ve YALNIZ executor baglamindan yazilir', () => {
  const makePrisma = () => {
    const created: any[] = [];
    const tx = {
      case: { update: jest.fn().mockResolvedValue({ id: CASE_ID }) },
      caseStatusHistory: { create: jest.fn().mockImplementation(({ data }: any) => { created.push(data); return Promise.resolve(data); }) },
      decisionLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      case: { findFirst: jest.fn().mockResolvedValue({ caseStatus: 'DERDEST', isAutomationEnabled: true }) },
      $transaction: jest.fn().mockImplementation((fn: any) => fn(tx)),
    };
    return { prisma, tx, created };
  };

  it('bag VERILMEZSE (controller yolu) history satirinda alanlar YOKTUR', async () => {
    const { prisma, created } = makePrisma();
    await applyCaseStatusChange(prisma, TENANT, CASE_ID, 'HITAM' as never, ACTOR, 'gerekce');
    expect('approvalRequestId' in created[0]).toBe(false);
    expect('approvalAttempt' in created[0]).toBe(false);
  });

  it('bag VERILIRSE (executor yolu) AYNI tx icindeki history satirina yazilir', async () => {
    const { prisma, tx, created } = makePrisma();
    await applyCaseStatusChange(prisma, TENANT, CASE_ID, 'HITAM' as never, ACTOR, 'gerekce', {
      approvalRequestId: REQ_ID, approvalAttempt: 3,
    });
    expect(created[0].approvalRequestId).toBe(REQ_ID);
    expect(created[0].approvalAttempt).toBe(3);
    // AYNI transaction: Case update + history + decisionLog hepsi ayni tx nesnesinde.
    expect(tx.case.update).toHaveBeenCalledTimes(1);
    expect(tx.caseStatusHistory.create).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('transaction GERI ALINIRSA kanit KALMAZ (create cagrisi tx icindedir)', async () => {
    const { prisma } = makePrisma();
    prisma.$transaction = jest.fn().mockImplementation(async (fn: any) => {
      const tx = {
        case: { update: jest.fn().mockResolvedValue({}) },
        caseStatusHistory: { create: jest.fn().mockResolvedValue({}) },
        decisionLog: { create: jest.fn().mockRejectedValue(new Error('ROLLBACK')) },
      };
      await fn(tx); // decisionLog patlar -> tx geri alinir
    });
    await expect(
      applyCaseStatusChange(prisma, TENANT, CASE_ID, 'HITAM' as never, ACTOR, 'g', {
        approvalRequestId: REQ_ID, approvalAttempt: 0,
      }),
    ).rejects.toThrow('ROLLBACK');
  });
});
