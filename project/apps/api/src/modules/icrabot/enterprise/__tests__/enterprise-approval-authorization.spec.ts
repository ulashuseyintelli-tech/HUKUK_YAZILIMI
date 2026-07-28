/**
 * DEBTOR-ENTERPRISE-APPROVAL-AUTHORIZATION-P0-I01 — bulgu R02-F09A
 *
 * Bu spec, enterprise approval HTTP yuzeyinin trust boundary'sini kanitlar.
 *
 * ONCEKI DURUM (bu PR'dan once):
 *   - controller'da HICBIR guard yoktu ve global APP_GUARD da yok;
 *   - tenantId, userId ve userRole DOGRUDAN govdeden/URL'den okunuyordu;
 *   - karar gecisi read-then-act idi, `update` yukleminde tenantId yoktu;
 *   - her iki yazma da `catch -> logger.warn` ile yutuluyor, yanit yine
 *     "approved" donuyordu.
 *
 * Testler iki dilime ayrilir:
 *   I01A CONTAINMENT       — authn, tenant authority, actor binding, DTO, ownership
 *   I01B DECISION AUTHORITY — atomik state predicate, transaction/audit, fail-closed
 */

import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import {
  ApprovalWorkflowController,
  AuditChainController,
} from '../enterprise.controller';
import { ApprovalWorkflowService } from '../approval-workflow.service';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import {
  CreateApprovalRequestDto,
  SubmitApprovalDecisionDto,
} from '../dto/enterprise-approval.dto';

const CONTROLLER_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'enterprise.controller.ts'),
  'utf8',
);
const SERVICE_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'approval-workflow.service.ts'),
  'utf8',
);
const BARREL_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');
const MODULE_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'icrabot.module.ts'),
  'utf8',
);
const PII_SERVICE_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'pii-masking.service.ts'),
  'utf8',
);

const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';
const ACTOR = 'user-1';

/**
 * Global ValidationPipe ile AYNI ayarlar (main.ts: whitelist + forbidNonWhitelisted).
 * Boylece "bilinmeyen alan reddedilir mi" sorusu gercek runtime sozlesmesiyle olculur.
 */
async function validateLikeGlobalPipe<T extends object>(
  cls: new () => T,
  payload: Record<string, unknown>,
) {
  const instance = plainToInstance(cls, payload);
  return validate(instance, { whitelist: true, forbidNonWhitelisted: true });
}

// ============================================================
// I01A — AUTHENTICATION / GUARD KAPSAMI
// ============================================================
describe('I01A · authentication ve guard kapsami', () => {
  it('ApprovalWorkflowController JwtAuthGuard ile korunur', () => {
    const guards = Reflect.getMetadata('__guards__', ApprovalWorkflowController) || [];
    expect(guards).toContain(JwtAuthGuard);
  });

  it('guard F09B controller sinifina SIZMAZ (kapsam disi yuzey degismedi)', () => {
    // Approval guard'i yalniz kendi sinifina uygulanir. F09B (audit) AYRI bir siniftir
    // ve davranisi bilerek DEGISTIRILMEMISTIR.
    // F09D (PII) I02 ile, F09C (leasing) I03 ile HTTP yuzeyinden tamamen kaldirildi;
    // asagidaki containment bloklari bunu ayrica ve daha guclu bicimde dogrular.
    for (const cls of [AuditChainController]) {
      const guards = Reflect.getMetadata('__guards__', cls) || [];
      expect(guards).toHaveLength(0);
    }
  });
});

// ============================================================
// I01A — TENANT AUTHORITY / ACTOR BINDING
// ============================================================
describe('I01A · tenant authority ve actor binding', () => {
  const buildController = () => {
    const service = {
      createApprovalRequest: jest.fn(async () => ({ id: 'req-1' })),
      getPendingRequests: jest.fn(async () => []),
      submitDecisionAuthorized: jest.fn(),
    } as unknown as ApprovalWorkflowService;
    return { controller: new ApprovalWorkflowController(service), service: service as any };
  };

  it('pending: URL tenant principal ile uyusmuyorsa FAIL-CLOSED (bos liste degil)', async () => {
    const { controller, service } = buildController();
    await expect(controller.getPending(TENANT_B, TENANT_A)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // Yan etki 0: sorgu hic calismaz.
    expect(service.getPendingRequests).not.toHaveBeenCalled();
  });

  it('pending: principal tenant yoksa FAIL-CLOSED', async () => {
    const { controller, service } = buildController();
    await expect(
      controller.getPending(TENANT_A, undefined as unknown as string),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.getPendingRequests).not.toHaveBeenCalled();
  });

  it('pending: yalniz principal tenant ile sorgulanir', async () => {
    const { controller, service } = buildController();
    await controller.getPending(TENANT_A, TENANT_A);
    expect(service.getPendingRequests).toHaveBeenCalledWith(TENANT_A);
  });

  it('request: govde tenant iddiasi principal ile uyusmuyorsa FAIL-CLOSED', async () => {
    const { controller, service } = buildController();
    await expect(
      controller.createRequest(
        { caseId: 'c1', reason: 'r', tenantId: TENANT_B } as CreateApprovalRequestDto,
        TENANT_A,
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.createApprovalRequest).not.toHaveBeenCalled();
  });

  it('request: tenant VE requester principal\'dan turer (govde degil)', async () => {
    const { controller, service } = buildController();
    await controller.createRequest(
      { caseId: 'c1', reason: 'r' } as CreateApprovalRequestDto,
      TENANT_A,
      ACTOR,
    );
    expect(service.createApprovalRequest).toHaveBeenCalledWith(
      TENANT_A,
      'c1',
      ACTOR,
      'r',
      expect.any(Object),
    );
  });

  it('request: principal actor yoksa FAIL-CLOSED', async () => {
    const { controller, service } = buildController();
    await expect(
      controller.createRequest(
        { caseId: 'c1', reason: 'r' } as CreateApprovalRequestDto,
        TENANT_A,
        '' as string,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.createApprovalRequest).not.toHaveBeenCalled();
  });

  it('decide: govde tenant spoof FAIL-CLOSED, servise hic gidilmez', async () => {
    const { controller, service } = buildController();
    await expect(
      controller.submitDecision(
        {
          approvalRequestId: 'req-1',
          decision: 'APPROVE',
          tenantId: TENANT_B,
        } as SubmitApprovalDecisionDto,
        TENANT_A,
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.submitDecisionAuthorized).not.toHaveBeenCalled();
  });
});

// ============================================================
// I01A — DTO SOZLESMESI
// ============================================================
describe('I01A · DTO authority alanlarini kabul etmez', () => {
  it('request DTO: requestedByUserId gonderimi REDDEDILIR', async () => {
    const errors = await validateLikeGlobalPipe(CreateApprovalRequestDto, {
      caseId: 'c1',
      reason: 'r',
      requestedByUserId: 'attacker',
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('decide DTO: userId ve userRole gonderimi REDDEDILIR', async () => {
    for (const spoof of [{ userId: 'attacker' }, { userRole: 'ADMIN' }, { userRole: 'LAWYER' }]) {
      const errors = await validateLikeGlobalPipe(SubmitApprovalDecisionDto, {
        approvalRequestId: 'req-1',
        decision: 'APPROVE',
        ...spoof,
      });
      expect(errors.length).toBeGreaterThan(0);
    }
  });

  it('decide DTO: gecersiz decision degeri REDDEDILIR', async () => {
    const errors = await validateLikeGlobalPipe(SubmitApprovalDecisionDto, {
      approvalRequestId: 'req-1',
      decision: 'MAYBE',
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('request DTO: zorunlu alanlar eksikse REDDEDILIR', async () => {
    const errors = await validateLikeGlobalPipe(CreateApprovalRequestDto, { caseId: '' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('gecerli payload kabul edilir', async () => {
    expect(
      await validateLikeGlobalPipe(CreateApprovalRequestDto, { caseId: 'c1', reason: 'r' }),
    ).toHaveLength(0);
    expect(
      await validateLikeGlobalPipe(SubmitApprovalDecisionDto, {
        approvalRequestId: 'req-1',
        decision: 'APPROVE',
      }),
    ).toHaveLength(0);
  });
});

// ============================================================
// I01B — OWNERSHIP + FAIL-CLOSED DECISION AUTHORITY
// ============================================================
describe('I01B · ownership ve fail-closed karar yetkisi', () => {
  const PENDING = { id: 'req-1', tenantId: TENANT_A, status: 'PENDING', riskLevel: 'CRITICAL' };

  /** `where` yuklemini GERCEKTEN uygulayan fake: dusen tenant filtresi testi gecemez. */
  const buildService = (rows: any[] = [PENDING]) => {
    const decisionCreate = jest.fn(async () => ({ id: 'dec-1' }));
    const prisma: any = {
      icrabotApprovalRequest: {
        findFirst: jest.fn(async ({ where }: any) =>
          rows.find((r) => r.id === where.id && r.tenantId === where.tenantId) ?? null,
        ),
        updateMany: jest.fn(async ({ where }: any) => ({
          count: rows.filter(
            (r) =>
              r.id === where.id && r.tenantId === where.tenantId && r.status === where.status,
          ).length,
        })),
      },
      icrabotApprovalDecision: { create: decisionCreate },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };
    return { svc: new ApprovalWorkflowService(prisma), prisma, decisionCreate };
  };

  it('kimlikli olsa da HER actor icin karar mutasyonu FAIL-CLOSED', async () => {
    const { svc, prisma, decisionCreate } = buildService();
    await expect(
      svc.submitDecisionAuthorized(TENANT_A, 'req-1', ACTOR, 'APPROVE'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // Yan etki 0: ne gecis ne audit.
    expect(prisma.icrabotApprovalRequest.updateMany).not.toHaveBeenCalled();
    expect(decisionCreate).not.toHaveBeenCalled();
  });

  it('cross-tenant id ile var-olmayan id AYNI dis hatayi uretir (varlik sizintisi yok)', async () => {
    const { svc } = buildService();
    const crossTenant = await svc
      .submitDecisionAuthorized(TENANT_B, 'req-1', ACTOR, 'APPROVE')
      .catch((e) => e);
    const nonexistent = await svc
      .submitDecisionAuthorized(TENANT_A, 'yok', ACTOR, 'APPROVE')
      .catch((e) => e);

    expect(crossTenant).toBeInstanceOf(NotFoundException);
    expect(nonexistent).toBeInstanceOf(NotFoundException);
    expect(crossTenant.message).toBe(nonexistent.message);
  });

  it('tenant/actor bos ise sahiplik sorgusu bile calismaz', async () => {
    const { svc, prisma } = buildService();
    await expect(
      svc.submitDecisionAuthorized('', 'req-1', ACTOR, 'APPROVE'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      svc.submitDecisionAuthorized(TENANT_A, 'req-1', '', 'APPROVE'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.icrabotApprovalRequest.findFirst).not.toHaveBeenCalled();
  });

  it('PENDING olmayan kayit reddedilir', async () => {
    const { svc } = buildService([{ ...PENDING, status: 'APPROVED' }]);
    await expect(
      svc.submitDecisionAuthorized(TENANT_A, 'req-1', ACTOR, 'APPROVE'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ============================================================
// I01B — ATOMIK GECIS + TRANSACTION/AUDIT BUTUNLUGU
// ============================================================
describe('I01B · atomik gecis ve audit butunlugu', () => {
  const PENDING = { id: 'req-1', tenantId: TENANT_A, status: 'PENDING' };

  const buildService = (opts: { count?: number; auditFails?: boolean } = {}) => {
    const decisionCreate = jest.fn(async () => {
      if (opts.auditFails) throw new Error('audit store down');
      return { id: 'dec-1' };
    });
    const capturedWhere: any[] = [];
    const prisma: any = {
      icrabotApprovalRequest: {
        findFirst: jest.fn(async () => ({ ...PENDING })),
        updateMany: jest.fn(async ({ where }: any) => {
          capturedWhere.push(where);
          return { count: opts.count ?? 1 };
        }),
      },
      icrabotApprovalDecision: { create: decisionCreate },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };
    return { svc: new ApprovalWorkflowService(prisma), prisma, decisionCreate, capturedWhere };
  };

  it('gecis yuklemi id + tenantId + status=PENDING icerir (replay/concurrent tek kazanan)', async () => {
    const { svc, capturedWhere } = buildService();
    await svc.submitDecision(TENANT_A, 'req-1', ACTOR, 'ADMIN', 'APPROVE');
    expect(capturedWhere[0]).toEqual({ id: 'req-1', tenantId: TENANT_A, status: 'PENDING' });
  });

  it('gecis ve audit AYNI transaction icinde yurur', async () => {
    const { svc, prisma } = buildService();
    await svc.submitDecision(TENANT_A, 'req-1', ACTOR, 'ADMIN', 'APPROVE');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('count !== 1 ise FAIL-CLOSED ve audit kaydi OLUSMAZ', async () => {
    const { svc, decisionCreate } = buildService({ count: 0 });
    await expect(
      svc.submitDecision(TENANT_A, 'req-1', ACTOR, 'ADMIN', 'APPROVE'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(decisionCreate).not.toHaveBeenCalled();
  });

  it('count > 1 anomalisi de FAIL-CLOSED', async () => {
    const { svc, decisionCreate } = buildService({ count: 2 });
    await expect(
      svc.submitDecision(TENANT_A, 'req-1', ACTOR, 'ADMIN', 'APPROVE'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(decisionCreate).not.toHaveBeenCalled();
  });

  it('audit yazilamazsa hata YUTULMAZ ve basari yaniti URETILMEZ', async () => {
    const { svc } = buildService({ auditFails: true });
    await expect(
      svc.submitDecision(TENANT_A, 'req-1', ACTOR, 'ADMIN', 'APPROVE'),
    ).rejects.toThrow('audit store down');
  });
});

// ============================================================
// MUTATION CONTROL — testlerin dekoratif olmadigini kanitlar
// ============================================================
describe('mutation control · guvenlik yuklemleri kaynakta gercekten var', () => {
  it('MUTATION-1: tenant predicate kaldirilirsa bu iddia duser', () => {
    expect(SERVICE_SRC).toMatch(/where:\s*\{\s*id:\s*approvalRequestId,\s*tenantId,\s*status:\s*'PENDING'\s*\}/);
  });

  it('MUTATION-2: state predicate + count kontrolu kaldirilirsa bu iddia duser', () => {
    expect(SERVICE_SRC).toMatch(/transitioned\.count\s*!==\s*1/);
  });

  it('MUTATION-3: hata yutan catch->warn geri gelirse bu iddia duser', () => {
    expect(SERVICE_SRC).not.toMatch(/Could not record approval decision/);
    expect(SERVICE_SRC).not.toMatch(/Could not update approval request status/);
  });

  it('MUTATION-4: fail-closed capability kapisi kaldirilirsa bu iddia duser', () => {
    expect(SERVICE_SRC).toMatch(/enterprise_approval_capability_unresolved/);
  });

  it('MUTATION-5: actor/tenant principal binding kaldirilirsa bu iddia duser', () => {
    expect(CONTROLLER_SRC).toMatch(/@CurrentUser\('tenantId'\)/);
    expect(CONTROLLER_SRC).toMatch(/@CurrentUser\('id'\)/);
  });

  it('MUTATION-6: controller artik govdeden authority okumaz', () => {
    expect(CONTROLLER_SRC).not.toMatch(/body\.tenantId,\s*\n\s*body\.caseId/);
    expect(CONTROLLER_SRC).not.toMatch(/body\.userRole/);
    expect(CONTROLLER_SRC).not.toMatch(/body\.requestedByUserId/);
  });
});

// ============================================================
// R02-F09D · I02 — PII TESHIS YUZEYI CONTAINMENT
//
// `POST /icrabot/enterprise/pii/test-mask` ve `GET /icrabot/enterprise/pii/should-mask`
// KIMLIK DOGRULAMASIZ yayindaydi. Endpoint'ler depolanmis PII okumuyordu
// (PiiMaskingService saf/IO-suz) fakat kimliksiz olarak maskeleme POLITIKASINI ve
// maskeleme fonksiyonlarinin ne kadarini acikta biraktigini olculebilir kiliyordu.
//
// Iki bagimsiz repo taramasi uretim tuketicisi bulamadi (frontend 0, servis 0,
// script 0, Python katmaninda HTTP cagrisi 0). Yetki modeli ICAT EDILMEDI —
// yuzey tamamen kaldirildi.
// ============================================================
describe('I02 · PII teshis HTTP yuzeyi kaldirildi', () => {
  it('controller dosyasi artik pii route prefixini TANIMLAMAZ', () => {
    expect(CONTROLLER_SRC).not.toMatch(/@Controller\('icrabot\/enterprise\/pii'\)/);
    expect(CONTROLLER_SRC).not.toMatch(/@Post\('test-mask'\)/);
    expect(CONTROLLER_SRC).not.toMatch(/@Get\('should-mask'\)/);
  });

  it('PiiMaskingController hicbir yerden export/register EDILMEZ', () => {
    expect(CONTROLLER_SRC).not.toMatch(/export class PiiMaskingController/);
    expect(BARREL_SRC).not.toMatch(/\bPiiMaskingController\b/);
    // Modulde yalniz aciklama satiri kalir; gercek kayit satiri kalmaz.
    expect(MODULE_SRC).not.toMatch(/^\s*PiiMaskingController,\s*$/m);
  });

  it('runtime export yuzeyinde PiiMaskingController YOK', () => {
    // Kaynak metni degil, gercek modul export'lari uzerinden dogrulama.
    const exported = require('../enterprise.controller');
    expect(Object.keys(exported)).not.toContain('PiiMaskingController');
    expect(Object.keys(exported)).toContain('ApprovalWorkflowController');
  });

  it('PiiMaskingService KASITLI OLARAK DEGISTIRILMEDI (owner talimati)', () => {
    expect(PII_SERVICE_SRC).toMatch(/export class PiiMaskingService/);
    expect(PII_SERVICE_SRC).toMatch(/applyMask</);
    expect(PII_SERVICE_SRC).toMatch(/applyMaskToArray</);
    expect(PII_SERVICE_SRC).toMatch(/shouldMask\(/);
  });

  it('F09B audit yuzeyi HALA MEVCUT (kapsam disi, dokunulmadi)', () => {
    expect(CONTROLLER_SRC).toMatch(/@Controller\('icrabot\/enterprise\/audit'\)/);
  });

  it('F09C leasing yuzeyi ARTIK MEVCUT DEGIL (I03 ile kaldirildi)', () => {
    expect(CONTROLLER_SRC).not.toMatch(/@Controller\('icrabot\/enterprise\/leasing'\)/);
  });
});

// ============================================================
// R02-F09C · I03 — JOB LEASING HTTP YUZEYI CONTAINMENT
//
// Dort ucun HEPSI YAZMA idi ve hicbirinde guard yoktu; tenant ve worker kimligi
// dogrudan govdeden/URL'den okunuyordu. Kimliksiz bir cagiran baska tenant'in
// kuyrugundan is kapabiliyor, baskasinin isini DONE/FAILED isaretleyebiliyor,
// lease uzatarak gercek worker'i ac birakabiliyor ve bir tenant'in lease'lerini
// toplu temizleyebiliyordu.
//
// Uretim tuketicisi YOKTU (frontend 0, servis 0, scheduler/worker 0; Python
// tarafindaki dosya calisan istemci degil, `# Pseudo-code (Django)` tasarim notu).
//
// Bu blogun iddialari KAYNAK METNINE DEGIL, gercek modul composition'ina ve
// runtime controller metadata'sina dayanir.
// ============================================================
// R02-F15 (bu gorevde tespit edildi): `icrabot/admin/admin.service.ts:8` cozulemeyen
// bir import tasiyor (`../../prisma/prisma.service` -> yok; dogrusu `../../../`).
// O dizin tsconfig tarafindan exclude edildigi icin kirikli k hic yakalanmamis ve
// `IcrabotModule` hicbir testte import EDILEMIYOR. Modul composition'ini GERCEK
// runtime uzerinden dogrulayabilmek icin yalniz bu bozuk modulu mock'luyoruz;
// baska hicbir davranis degistirilmiyor.
jest.mock('../../admin/admin.service', () => ({ IcrabotAdminService: class {} }));
jest.mock('../../admin/audit-report.service', () => ({ AuditReportService: class {} }));
jest.mock('../../admin/job-monitor.service', () => ({ JobMonitorService: class {} }));
jest.mock('../../evidence.service', () => ({ EvidenceService: class {} }));
jest.mock('../../icrabot.service', () => ({ IcrabotService: class {} }));
jest.mock('../../recipe.service', () => ({ RecipeService: class {} }));
jest.mock('../../task-orchestrator.service', () => ({ TaskOrchestratorService: class {} }));

describe('I03 · job leasing HTTP yuzeyi kaldirildi (composition tabanli)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { IcrabotModule } = require('../../icrabot.module');
  const moduleControllers: any[] =
    Reflect.getMetadata('controllers', IcrabotModule) || [];
  const controllerPaths = moduleControllers.map(
    (c) => Reflect.getMetadata('path', c) as string,
  );

  it('modul composition JobLeasingController ICERMIYOR', () => {
    expect(moduleControllers.length).toBeGreaterThan(0);
    expect(moduleControllers.map((c) => c.name)).not.toContain('JobLeasingController');
  });

  it('leasing route prefix runtime controller metadata da YOK', () => {
    expect(controllerPaths).not.toContain('icrabot/enterprise/leasing');
  });

  it('public barrel uzerinden leasing controller ERISILEMIYOR', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const barrel = require('../index');
    expect(Object.keys(barrel)).not.toContain('JobLeasingController');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ctrlModule = require('../enterprise.controller');
    expect(Object.keys(ctrlModule)).not.toContain('JobLeasingController');
  });

  it('JobLeasingService KORUNDU ve instantiate edilebiliyor (dormant capability)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const barrel = require('../index');
    expect(Object.keys(barrel)).toContain('JobLeasingService');
    const { JobLeasingService } = barrel;
    const instance = new JobLeasingService({} as any);
    expect(instance).toBeInstanceOf(JobLeasingService);
    expect(typeof instance.acquireLease).toBe('function');
    expect(typeof instance.releaseLease).toBe('function');
    expect(typeof instance.extendLease).toBe('function');
    expect(typeof instance.cleanupExpiredLeases).toBe('function');
  });

  it('JobLeasingService modul provider listesinde KALIYOR', () => {
    const providers: any[] = Reflect.getMetadata('providers', IcrabotModule) || [];
    expect(providers.map((p) => p?.name ?? p)).toContain('JobLeasingService');
  });

  it('approval controller HALA kayitli ve JwtAuthGuard korunuyor', () => {
    expect(moduleControllers).toContain(ApprovalWorkflowController);
    const guards = Reflect.getMetadata('__guards__', ApprovalWorkflowController) || [];
    expect(guards).toContain(JwtAuthGuard);
  });

  it('F09B audit controller HALA kayitli ve davranisi DEGISMEDI', () => {
    expect(moduleControllers).toContain(AuditChainController);
    expect(controllerPaths).toContain('icrabot/enterprise/audit');
    const guards = Reflect.getMetadata('__guards__', AuditChainController) || [];
    expect(guards).toHaveLength(0);
  });

  it('F09D PII controller HALA kayitli DEGIL (I02 geri alinmadi)', () => {
    expect(moduleControllers.map((c) => c.name)).not.toContain('PiiMaskingController');
    expect(controllerPaths).not.toContain('icrabot/enterprise/pii');
  });
});
