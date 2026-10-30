/**
 * F02-D / J-27 — VIEWER (salt okuyucu) YAZMA REDDİ: ilgili consumer'larda uygulama (owner F02 talimatı 29.10.2026).
 *
 * Kapalı kural (yeniden sorulmaz): VIEWER yazamaz — OWN-13 §51 D01/D02 (CLIENT), AK-1a `isOfficeWriteDeniedForRole`
 * (OFFICE), B4/B6 `ViewerWriteDenyGuard` (owner GO 2026-09-27). Bu spec aynı yüklemi, bugüne kadar yalnız JWT ile
 * korunan Claude şeridi consumer'larına taşıyan uygulamayı KANITLAR.
 *
 * Yöntem: yazma rotaları controller META VERİSİNDEN keşfedilir (yeni rota eklenince otomatik kapsanır). Gerçek Nest
 * HTTP hattı: gerçek JWT + JwtStrategy + AuthService.validateUser (rol DB satırından; sahte PrismaService), gerçek
 * guard zinciri; servisler stub (yalnız "çağrıldı mı" kaydeder). DB YOK; dış sisteme çağrı YOK.
 *
 * Kanıtlanan sözleşme:
 *  1. VIEWER → her yazma rotasında 403; ret kodu rotanın TAŞIDIĞI kapıdan türetilir: `VIEWER_WRITE_DENIED`
 *     (ViewerWriteDenyGuard), `OFFICE_WRITE_DENIED_VIEWER` (şablon yazma uçlarındaki F01 kapısı — ölçülmüş kod korunur)
 *     ya da AdminGuard reddi. Servis / adaptör HİÇ çağrılmaz (yazma 0, dış gönderim 0).
 *  2. Kapısız yazma rotası YOKTUR: keşif fail-closed'dur — yeni bir yazma rotası VIEWER'ı reddeden kapı taşımazsa test KIRMIZI.
 *  3. USER → guard geçer (403 değil). GET rotaları VIEWER için 403 değil (okuma değişmez).
 *  4. `@AllowViewerReadOnlyPost` ile işaretli SAF POST'lar (şablon önizleme, kambiyo zinciri analizi, vekalet geçerlilik
 *     kontrolü) VIEWER'a açık.
 *  5. Portal yönetici belge kararı (approve/reject) metot düzeyinde JwtAuthGuard + ViewerWriteDenyGuard taşır (statik).
 *
 * R02 (owner devam talimatı 29.10.2026): poa, client-notification (3 denetleyici) ve greeting (tebrik) Codex şeridinden
 * Claude şeridine alındı ve kapsandı. client-notification'da kapı METOT düzeyindedir (şablon uçları ölçülmüş kodlu F01
 * kapısını taşır; NotificationDispatchController sınıf guard sayısı karakterizasyon sözleşmesinde sabittir).
 *
 * R03 (F02-D-2 dilim 1, owner devam talimatı 30.10.2026 — "önce dış gönderim ve mali yazma yolları; servis koruması ve principal
 * modeli doğrula; yalnız gerçekten ihlal edilen yüzeyleri düzelt"): tebligat (SMS/e-posta/ödeme emri), borçlu iletişimi
 * (SMS/e-posta/çağrı kaydı), e-imza (istek/toplu/doğrulama), ödeme talimatı, muhasebe manuel düzeltme + ters kayıt (servis
 * yalnız RÜTBE soruyordu — PARTNER kartlı VIEWER geçiyordu), banka (hesap ekleme, senkron, eşleştirme, EFT/havale) ve banka
 * yaşam döngüsü (servis yalnız GRANT soruyordu). Ölçüm: değişiklik öncesi bu rotalarda VIEWER servise iniyordu.
 * BİLİNÇLİ DIŞARIDA: uyap-export (yazmasız XML dışa aktarım = okuma; saf hesaplama/okuma yollarına körlemesine guard yok).
 *
 * R04 (F02-D-2 dilim 2, owner "Burada başla" 30.10.2026; sıra önerisi karar listesi R03 §B-3): tarife (yıl oluştur / güncelle / sil /
 * içe aktar = dosya yazma; Resmî Gazete bildirim durumu + manuel kontrol = durum yazma + dış RSS çekimi; TariffService rol sormuyor) ve
 * template-engine (tek gerçek yazma `cases/:caseId/documents/:format`: belge artifact kaydı + denetim izi). template-engine'in JSON
 * gövdesinden üreten 10 POST'u (takip talebi / ödeme emri / icra emri / haciz tutanağı metin, önizleme, indirme, PDF, Word, UDF, XML)
 * DB okumaz / yazmaz, denetim izi yazmaz, dış çağrı yapmaz — kaynaktan doğrulandı: servis dosyasının tek yazma zinciri
 * `generateDocumentFromCase` → `recordDocumentArtifact` → `auditService.log` (statik bekçi `template-engine-viewer-read-only-posts.static.spec.ts`)
 * → `@AllowViewerReadOnlyPost`. BİLİNÇLİ DIŞARIDA: pdf (iki POST saf PDF üretimi; yazma rotası yok = ihlal yok).
 *
 * R05 (F02-D-2 dilim 3, owner ek talimatı 30.10.2026 — kalan belge/para etkili yollar; controller + servis + principal birlikte incelendi,
 * servis yan etki haritası kanıt): tebligat (oluştur / güncelle / gönderildi / PTT + elektronik sonuç / MERNİS / toplu PTT sorgusu /
 * UETS ve KEP gönderimi), export-import (müvekkil içe aktarım), exchange-rate (TCMB kur yenileme), cost-package (paket oluşturma;
 * `compute` saf), claim-engine (`reload` kural durumu; 5 hesap saf), precautionary-order (8 yazma), ocr (geri bildirim denetim izi +
 * OpenAI/dosya taramaları; `classify-text` ve `supported-formats` saf), limitation-engine (`log-risk` → LimitationRiskLog; `check` /
 * `recommend` saf), interest-engine METOT düzeyi (`calculate` denetim kaydı yazar; `preview` saf; `health` açık). KANITLA KAPATILAN
 * (kod değişmez, yazma rotası yok): fee-engine (5 hesap POST'u; servis yan etki 0), case-payment-preview (servis yan etki 0), pdf (dilim 2).
 *
 * R06 (F02-D-2 dilim 4, owner ek talimatı 30.10.2026 — UYAP / icrabot yolları; servis yan etki haritası + principal incelemesi):
 * bundle (paket CRUD / onay / terfi / arşiv / klon / denetim dışa aktarım / zamanlayıcı tetiği / kuyruk / iş koşturma; `validate` saf),
 * icrabot (otomasyon başlat / durdur / reçete koştur / bot görevi onay-iptal / e-tebligat / kesinleşme / mal varlığı / safahat /
 * durum geçişi; `determine-channel` saf), ops (reçete duraklat / sürdür, iş iptal, SLA boost), recorder + health + recorder-test
 * (UI harita kaydı, eski günlük silme, tıklama testi), enterprise/approval (talep / karar; servis yalnız rütbe sorar). UYAP gönderim
 * yetkisi GENİŞLETİLMEZ (yalnız VIEWER reddi). KANITLA KAPATILAN (kod değişmez): icrabot/admin (12/12 yazma handler'ı girişte
 * `checkPermission` → VIEWER'a izin yok; statik bekçi `admin-write-permission-closed.static.spec.ts`), uyap-export (4 servis yan etki
 * 0 = yazmasız dışa aktarım), v28-engine (yüzeyler ICRABOT_V28_* containment bayraklarıyla kapalı; `v28-surface-containment.spec`).
 * OWNER KALEMİ (F02-C): enterprise audit / backpressure / plan sınıfları guard'sız ve tenantId'yi gövde/yoldan okur (I01A bilinçli).
 *
 * Kapsam dışı (DEĞİŞMEZ): user `me/password` (öz-servis), auth ve portal KULLANICI rotaları, office/lawyer/staff (zaten
 * OfficeF01AuthorizationGuard), client.controller ve client-address (zaten servis düzeyi VIEWER DENY). Envanterdeki öteki
 * yalnız-JWT yazıcılar F02-D KALAN yüzeydir; dilimler hâlinde ele alınır, raporda listelenir.
 */
jest.mock('pdf-poppler', () => ({ convert: async () => { throw new Error('pdf-poppler is stubbed in unit tests'); } }));

import 'reflect-metadata';
import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { PrismaService } from '../../../../prisma/prisma.service';
import { AuthService } from '../../auth.service';
import { JwtStrategy } from '../../strategies/jwt.strategy';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { VIEWER_WRITE_DENIED, ViewerWriteDenyGuard } from '../viewer-write-deny.guard';

import { ClientApprovalController } from '../../../client-approval/client-approval.controller';
import { ClientApprovalService } from '../../../client-approval/client-approval.service';
import { ClientStatementController } from '../../../client-statement/client-statement.controller';
import { ClientStatementMonthlyDeliveryService } from '../../../client-statement/client-statement-monthly-delivery.service';
import { ClientStatementService } from '../../../client-statement/client-statement.service';
import { ClientIntelStatementController } from '../../../client-intel-statement/client-intel-statement.controller';
import { ClientIntelStatementService } from '../../../client-intel-statement/client-intel-statement.service';
import { DocumentController } from '../../../document/document.controller';
import { DocumentService } from '../../../document/document.service';
import { DocumentTemplateService } from '../../../document/document-template.service';
import { TaskController } from '../../../task/task.controller';
import { TaskService } from '../../../task/task.service';
import { CaseInstrumentController } from '../../../case-instrument/case-instrument.controller';
import { CaseInstrumentService } from '../../../case-instrument/case-instrument.service';
import { CaseLeaseController } from '../../../case-lease/case-lease.controller';
import { CaseLeaseService } from '../../../case-lease/case-lease.service';
import { CaseJudgmentController } from '../../../case-judgment/case-judgment.controller';
import { CaseJudgmentService } from '../../../case-judgment/case-judgment.service';
import { CaseCollateralController } from '../../../case-collateral/case-collateral.controller';
import { CaseCollateralService } from '../../../case-collateral/case-collateral.service';
import { CaseStatusController } from '../../../case-status/case-status.controller';
import { CaseStatusService } from '../../../case-status/case-status.service';
import { FinancialCaseCloseApprovalService } from '../../../case-status/financial-case-close-approval.service';
import { GuidedOpenObserveService } from '../../../permission-diagnostics/guided-open-observe.service';
import { GuidedEdgeGateService } from '../../../permission-diagnostics/guided-edge/guided-edge-gate.service';
import { OfficeApprovalShadowService } from '../../../office-approval/office-approval-shadow.service';
import { OfficeApprovalService } from '../../../office-approval/office-approval.service';
import { ClientLegalHoldController } from '../../../client/client-legal-hold.controller';
import { ClientLegalHoldService } from '../../../client/client-legal-hold.service';
import { ClientConsentController } from '../../../client/client-consent.controller';
import { ClientConsentService } from '../../../client/client-consent.service';
import { ClientSpecialCategoryController } from '../../../client/client-special-category.controller';
import { ClientSpecialCategoryService } from '../../../client/client-special-category.service';
import { ClientKvkkRightsController } from '../../../client/client-kvkk-rights.controller';
import { ClientDisclosureService } from '../../../client/client-disclosure.service';
import { ClientDataSubjectRequestService } from '../../../client/client-data-subject-request.service';
import { PortalController } from '../../../portal/portal.controller';
// R02: Codex şeridinden alınan consumer'lar
import { PoaController } from '../../../poa/poa.controller';
import { PoaService } from '../../../poa/poa.service';
import { ClientNotificationController } from '../../../client-notification/client-notification.controller';
import { ClientNotificationService } from '../../../client-notification/client-notification.service';
import { ClientNotificationAuthorityAdapter } from '../../../client-notification/client-notification-authority.adapter';
import { ClientNotificationHistoryAccessService } from '../../../client-notification/client-notification-history-access.service';
import { NotificationDispatchController } from '../../../client-notification/notification-dispatch.controller';
import { NotificationDispatcherService } from '../../../client-notification/notification-dispatcher.service';
import { NotificationHistoryPermissionController } from '../../../client-notification/notification-history-permission.controller';
import { NotificationHistoryPermissionService } from '../../../client-notification/notification-history-permission.service';
import { GreetingController } from '../../../greeting/greeting.controller';
import { GreetingService } from '../../../greeting/greeting.service';
import { AdminGuard } from '../admin.guard';
import { OfficeF01AuthorizationGuard } from '../../../office-approval/office-f01-authorization.guard';
// R03 (F02-D-2 dilim 1, owner devam talimatı 30.10.2026): dış gönderim + mali yazma yolları
import { NotificationController } from '../../../notification/notification.controller';
import { NotificationService } from '../../../notification/notification.service';
import { CommunicationController } from '../../../debtor/communication.controller';
import { DebtorCommunicationService } from '../../../debtor/communication.service';
import { ESignController } from '../../../esign/esign.controller';
import { ESignService } from '../../../esign/esign.service';
import { PaymentInstructionController } from '../../../payment-instruction/payment-instruction.controller';
import { PaymentInstructionService } from '../../../payment-instruction/payment-instruction.service';
import { AccountingJournalManualAdjustmentController } from '../../../accounting-journal/accounting-journal-manual-adjustment.controller';
import { AccountingJournalManualAdjustmentService } from '../../../accounting-journal/accounting-journal-manual-adjustment.service';
import { AccountingJournalReversalController } from '../../../accounting-journal/accounting-journal-reversal.controller';
import { AccountingJournalReversalService } from '../../../accounting-journal/accounting-journal-reversal.service';
import { BankController } from '../../../bank/bank.controller';
import { BankService } from '../../../bank/bank.service';
import { ReceiptObjectScopeAuthorizationService } from '../../../collection/receipt-object-scope-authorization.service';
import { BankLifecycleController } from '../../../bank/bank-lifecycle.controller';
import { BankSettlementEvidenceWriterService } from '../../../bank/bank-settlement-evidence-writer.service';
import { BankCandidateSettlementTransitionService } from '../../../bank/bank-candidate-settlement-transition.service';
// R04 (F02-D-2 dilim 2): tarife yazma + belge artifact üretimi
import { TariffController } from '../../../tariff/tariff.controller';
import { TariffService } from '../../../tariff/tariff.service';
import { GazetteWatcherService } from '../../../tariff/gazette-watcher.service';
import { TemplateEngineController } from '../../../template-engine/template-engine.controller';
import { TemplateEngineService } from '../../../template-engine/template-engine.service';
// R05 (F02-D-2 dilim 3): kalan belge/para etkili yollar
import { TebligatController } from '../../../tebligat/tebligat.controller';
import { TebligatService } from '../../../tebligat/tebligat.service';
import { PttTrackingService } from '../../../tebligat/ptt-tracking.service';
import { UetsService } from '../../../tebligat/uets.service';
import { ExportImportController } from '../../../export-import/export-import.controller';
import { ExportImportService } from '../../../export-import/export-import.service';
import { ExchangeRateController } from '../../../exchange-rate/exchange-rate.controller';
import { ExchangeRateService } from '../../../exchange-rate/exchange-rate.service';
import { CostPackageController } from '../../../cost-package/cost-package.controller';
import { CostPackageService } from '../../../cost-package/cost-package.service';
import { ClaimEngineController } from '../../../claim-engine/claim-engine.controller';
import { ClaimEngineService } from '../../../claim-engine/claim-engine.service';
import { PrecautionaryOrderController } from '../../../precautionary-order/precautionary-order.controller';
import { PrecautionaryOrderService } from '../../../precautionary-order/precautionary-order.service';
import { OcrController } from '../../../ocr/ocr.controller';
import { OcrService } from '../../../ocr/ocr.service';
import { OcrFeedbackService } from '../../../ocr/ocr-feedback.service';
import { LimitationEngineController } from '../../../limitation-engine/limitation-engine.controller';
import { LimitationEngineService } from '../../../limitation-engine/limitation-engine.service';
import { InterestEngineController } from '../../../interest-engine/interest-engine.controller';
import { InterestEngineService } from '../../../interest-engine/interest-engine.service';
import { AuditWriterService } from '../../../interest-engine/audit/audit-writer.service';
import { TraceExporterService } from '../../../interest-engine/trace/trace-exporter.service';
import { InterestEngineMetricsService } from '../../../interest-engine/metrics/interest-engine-metrics.service';
import { CaseBalanceService } from '../../../interest-engine/orchestration/case-balance.service';
// R06 (F02-D-2 dilim 4): UYAP / icrabot yolları
import { BundleController } from '../../../icrabot/bundle/bundle.controller';
import { BundleService } from '../../../icrabot/bundle/bundle.service';
import { AuditExportService } from '../../../icrabot/export/audit-export.service';
import { SchedulerService } from '../../../icrabot/scheduler/scheduler.service';
import { RecipeRunnerService } from '../../../icrabot/runner/recipe-runner.service';
import { IcrabotController } from '../../../icrabot/icrabot.controller';
import { IcrabotService } from '../../../icrabot/icrabot.service';
import { OpsController } from '../../../icrabot/ops/ops.controller';
import { RecipePauseService } from '../../../icrabot/ops/recipe-pause.service';
import { SlaBoostService } from '../../../icrabot/ops/sla-boost.service';
import { QueuePolicyLoaderService } from '../../../icrabot/scheduler/queue-policy-loader.service';
import { HealthController, RecorderController, RecorderTestController } from '../../../icrabot/recorder/recorder.controller';
import { UiMapRecorderService } from '../../../icrabot/recorder/uimap-recorder.service';
import { SelectorHealthService } from '../../../icrabot/recorder/selector-health.service';
import { ApprovalWorkflowController } from '../../../icrabot/enterprise/enterprise.controller';
import { ApprovalWorkflowService } from '../../../icrabot/enterprise/approval-workflow.service';

const SECRET = 'f02d-j27-viewer-write-deny-local-test-secret-at-least-32-bytes';
const TENANT = 'tenant-j27';
const ALLOW_VIEWER_READ_ONLY_POST = 'allowViewerReadOnlyPost'; // viewer-write-deny.guard.ts ile aynı anahtar

/** TEST-ONLY aktörler — rol, JwtStrategy → AuthService.validateUser üzerinden "DB" satırından okunur. */
const ACTORS = {
  // VIEWER'ın bağlı avukatı PARTNER olsa bile yazamaz: rol kapısı rütbeden ÖNCE gelir.
  viewer: { id: 'u-j27-viewer', email: 'viewer@example.test', role: 'VIEWER', lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false } },
  user: { id: 'u-j27-user', email: 'user@example.test', role: 'USER', lawyer: null },
} as const;
type ActorKey = keyof typeof ACTORS;

const dbRow = (a: (typeof ACTORS)[ActorKey]) => ({
  id: a.id, tenantId: TENANT, email: a.email, role: a.role, isActive: true, tokenVersion: 0,
  passwordHash: 'x'.repeat(20), name: 'Test', surname: a.role, lawyer: a.lawyer, staffMember: null,
  tenant: { id: TENANT, lifecycle: 'ACTIVE' },
});
const fakePrisma = {
  user: {
    findUnique: async (args: { where: { id: string } }) => {
      const a = Object.values(ACTORS).find((x) => x.id === args.where.id);
      return a ? dbRow(a) : null;
    },
  },
};

/** Stub servis: her metod çağrısını kaydeder, hiçbir şey yapmaz. */
const serviceCalls: string[] = [];
const NEST_LIFECYCLE = new Set(['onModuleInit', 'onApplicationBootstrap', 'onModuleDestroy', 'beforeApplicationShutdown', 'onApplicationShutdown']);
function stubService(name: string, results: Record<string, unknown> = {}): object {
  return new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      if (NEST_LIFECYCLE.has(String(prop))) return undefined;
      return (..._args: unknown[]) => {
        serviceCalls.push(`${name}.${String(prop)}`);
        return Promise.resolve(String(prop) in results ? results[String(prop)] : { stubbed: true });
      };
    },
  });
}

/** J-27 kapsamındaki consumer controller'lar (sınıf düzeyi guard beklenir; CaseStatus ve METHOD_GUARDED: metot düzeyi). */
const CLASS_GUARDED = [
  ClientApprovalController, ClientStatementController, ClientIntelStatementController,
  DocumentController, TaskController,
  CaseInstrumentController, CaseLeaseController, CaseJudgmentController, CaseCollateralController,
  ClientLegalHoldController, ClientConsentController, ClientSpecialCategoryController, ClientKvkkRightsController,
  // R02: Codex şeridinden alınan consumer'lar
  PoaController, NotificationHistoryPermissionController, GreetingController,
  // R03 (F02-D-2 dilim 1): dış gönderim + mali yazma yolları — servis katmanı rol sormuyordu ya da yalnız rütbe/grant soruyordu
  // (rol kapısı rütbeden ÖNCE gelir: AK-1a). uyap-export BİLİNÇLİ DIŞARIDA (yazmasız dışa aktarım = okuma).
  NotificationController, CommunicationController, ESignController, PaymentInstructionController,
  AccountingJournalManualAdjustmentController, AccountingJournalReversalController, BankController, BankLifecycleController,
  // R04 (F02-D-2 dilim 2): tarife yazma (dosya + gazete durumu + dış çekim) ve dosyadan belge artifact üretimi; 10 saf üretim POST'u işaretli.
  TariffController, TemplateEngineController,
  // R05 (F02-D-2 dilim 3): kalan belge/para etkili yollar (servis katmanı rol sormuyor); saf hesap POST'ları işaretli.
  TebligatController, ExportImportController, ExchangeRateController, CostPackageController, ClaimEngineController,
  PrecautionaryOrderController, OcrController, LimitationEngineController,
  // R06 (F02-D-2 dilim 4): UYAP / icrabot yolları (servis katmanı rol sormuyor; UYAP gönderim yetkisi genişletilmez)
  BundleController, IcrabotController, OpsController, RecorderController, HealthController, RecorderTestController, ApprovalWorkflowController,
];
/** R02: METOT düzeyi ViewerWriteDenyGuard beklenen handler'lar (sınıf düzeyi kapı ölçülmüş sözleşmeleri değiştirirdi). */
const METHOD_GUARDED: ReadonlyArray<readonly [Function, string]> = [
  [ClientNotificationController, 'sendEmail'], [ClientNotificationController, 'sendSms'],
  [ClientNotificationController, 'testSmtpConnection'], [ClientNotificationController, 'testSmsConnection'],
  [ClientNotificationController, 'testSend'], [ClientNotificationController, 'sendBulkEmail'],
  [NotificationDispatchController, 'resend'],
  // R05: interest-engine sınıf düzeyinde guard taşımaz (`health` açık); yalnız `calculate` denetim kaydı yazar → metot düzeyi.
  [InterestEngineController, 'calculate'],
];
/** Şablon YAZMA uçları: ölçülmüş F01 kapısı (OFFICE_WRITE_DENIED_VIEWER) korunur; ikinci VIEWER kapısı TAKILMAZ. */
const F01_TEMPLATE_WRITE = ['createEmailTemplate', 'updateEmailTemplate', 'createDefaultTemplates'];
const MOUNTED = [...CLASS_GUARDED, CaseStatusController, ClientNotificationController, NotificationDispatchController, InterestEngineController];

type DenyGuard = 'viewer' | 'f01' | 'admin' | 'none';
interface Route { ctrl: string; handler: string; method: RequestMethod; url: string; readOnlyPost: boolean; denyGuard: DenyGuard }
const WRITE_METHODS = new Set([RequestMethod.POST, RequestMethod.PUT, RequestMethod.PATCH, RequestMethod.DELETE]);
const VERB: Record<number, 'get' | 'post' | 'put' | 'delete' | 'patch'> = {
  [RequestMethod.GET]: 'get', [RequestMethod.POST]: 'post', [RequestMethod.PUT]: 'put', [RequestMethod.DELETE]: 'delete', [RequestMethod.PATCH]: 'patch',
};

/** Rotanın VIEWER'ı reddeden kapısı: sınıf + metot guard meta verisinden (fail-closed: hiçbiri yoksa 'none'). */
function denyGuardOf(ctrl: Function, handler: Function): DenyGuard {
  const guards: unknown[] = [
    ...((Reflect.getMetadata(GUARDS_METADATA, ctrl) as unknown[] | undefined) ?? []),
    ...((Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[] | undefined) ?? []),
  ];
  if (guards.includes(ViewerWriteDenyGuard)) return 'viewer';
  if (guards.includes(OfficeF01AuthorizationGuard)) return 'f01';
  if (guards.includes(AdminGuard)) return 'admin';
  return 'none';
}

function discoverRoutes(ctrl: Function): Route[] {
  const base = String(Reflect.getMetadata(PATH_METADATA, ctrl) ?? '');
  const proto = ctrl.prototype;
  return Object.getOwnPropertyNames(proto)
    .filter((n) => n !== 'constructor' && typeof proto[n] === 'function')
    .flatMap((handler) => {
      const method = Reflect.getMetadata(METHOD_METADATA, proto[handler]) as RequestMethod | undefined;
      const path = Reflect.getMetadata(PATH_METADATA, proto[handler]) as string | undefined;
      if (method === undefined || path === undefined || !(method in VERB)) return [];
      const url = ('/api/' + [base, path].join('/')).replace(/\/+/g, '/').replace(/\/$/, '').replace(/:[A-Za-z_]+/g, 'x');
      const readOnlyPost = Reflect.getMetadata(ALLOW_VIEWER_READ_ONLY_POST, proto[handler]) === true;
      return [{ ctrl: ctrl.name, handler, method, url, readOnlyPost, denyGuard: denyGuardOf(ctrl, proto[handler]) }];
    });
}

const ROUTES = MOUNTED.flatMap(discoverRoutes);
const WRITE_ROUTES = ROUTES.filter((r) => WRITE_METHODS.has(r.method) && !r.readOnlyPost);
const READ_ONLY_POSTS = ROUTES.filter((r) => r.readOnlyPost);
const GET_ROUTES = ROUTES.filter((r) => r.method === RequestMethod.GET);

describe('F02-D / J-27: VIEWER yazma reddi — consumer uygulaması (gerçek JWT + Nest HTTP, stub servisler)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: SECRET, signOptions: { expiresIn: '5m' } }),
      ],
      controllers: MOUNTED,
      providers: [
        AuthService, JwtStrategy, JwtAuthGuard, ViewerWriteDenyGuard,
        { provide: PrismaService, useValue: fakePrisma },
        { provide: ConfigService, useValue: { get: (key: string, fallback?: unknown) => (key === 'JWT_SECRET' ? SECRET : fallback) } },
        { provide: ClientApprovalService, useValue: stubService('ClientApprovalService') },
        { provide: ClientStatementService, useValue: stubService('ClientStatementService') },
        { provide: ClientStatementMonthlyDeliveryService, useValue: stubService('ClientStatementMonthlyDeliveryService') },
        { provide: OfficeApprovalService, useValue: stubService('OfficeApprovalService') },
        { provide: ClientIntelStatementService, useValue: stubService('ClientIntelStatementService') },
        { provide: DocumentService, useValue: stubService('DocumentService') },
        { provide: DocumentTemplateService, useValue: stubService('DocumentTemplateService') },
        { provide: TaskService, useValue: stubService('TaskService') },
        { provide: CaseInstrumentService, useValue: stubService('CaseInstrumentService') },
        { provide: CaseLeaseService, useValue: stubService('CaseLeaseService') },
        { provide: CaseJudgmentService, useValue: stubService('CaseJudgmentService') },
        { provide: CaseCollateralService, useValue: stubService('CaseCollateralService') },
        { provide: CaseStatusService, useValue: stubService('CaseStatusService') },
        { provide: FinancialCaseCloseApprovalService, useValue: stubService('FinancialCaseCloseApprovalService') },
        { provide: GuidedOpenObserveService, useValue: stubService('GuidedOpenObserveService') },
        { provide: GuidedEdgeGateService, useValue: stubService('GuidedEdgeGateService') },
        { provide: OfficeApprovalShadowService, useValue: stubService('OfficeApprovalShadowService') },
        { provide: ClientLegalHoldService, useValue: stubService('ClientLegalHoldService') },
        { provide: ClientConsentService, useValue: stubService('ClientConsentService') },
        { provide: ClientSpecialCategoryService, useValue: stubService('ClientSpecialCategoryService') },
        { provide: ClientDisclosureService, useValue: stubService('ClientDisclosureService') },
        { provide: ClientDataSubjectRequestService, useValue: stubService('ClientDataSubjectRequestService') },
        // R02: Codex şeridinden alınan consumer'ların servisleri (stub; dış sisteme çağrı YOK)
        { provide: PoaService, useValue: stubService('PoaService', { getFile: { mimeType: 'application/octet-stream', filename: 'stub.bin', buffer: Buffer.from('') } }) },
        { provide: ClientNotificationService, useValue: stubService('ClientNotificationService') },
        { provide: ClientNotificationAuthorityAdapter, useValue: stubService('ClientNotificationAuthorityAdapter') },
        { provide: ClientNotificationHistoryAccessService, useValue: stubService('ClientNotificationHistoryAccessService') },
        { provide: NotificationDispatcherService, useValue: stubService('NotificationDispatcherService') },
        { provide: NotificationHistoryPermissionService, useValue: stubService('NotificationHistoryPermissionService') },
        { provide: GreetingService, useValue: stubService('GreetingService') },
        // R03 (F02-D-2 dilim 1) servisleri (stub; dış sisteme çağrı YOK, para hareketi YOK)
        { provide: NotificationService, useValue: stubService('NotificationService') },
        { provide: DebtorCommunicationService, useValue: stubService('DebtorCommunicationService') },
        { provide: ESignService, useValue: stubService('ESignService') },
        { provide: PaymentInstructionService, useValue: stubService('PaymentInstructionService') },
        { provide: AccountingJournalManualAdjustmentService, useValue: stubService('AccountingJournalManualAdjustmentService') },
        { provide: AccountingJournalReversalService, useValue: stubService('AccountingJournalReversalService') },
        { provide: BankService, useValue: stubService('BankService') },
        { provide: ReceiptObjectScopeAuthorizationService, useValue: stubService('ReceiptObjectScopeAuthorizationService') },
        { provide: BankSettlementEvidenceWriterService, useValue: stubService('BankSettlementEvidenceWriterService') },
        { provide: BankCandidateSettlementTransitionService, useValue: stubService('BankCandidateSettlementTransitionService') },
        // R04 (F02-D-2 dilim 2) servisleri (stub; dosya yazma YOK, dış RSS çekimi YOK, artifact kaydı YOK)
        { provide: TariffService, useValue: stubService('TariffService') },
        { provide: GazetteWatcherService, useValue: stubService('GazetteWatcherService') },
        { provide: TemplateEngineService, useValue: stubService('TemplateEngineService') },
        // R05 (F02-D-2 dilim 3) servisleri (stub; dış gönderim YOK, OpenAI/TCMB/PTT çağrısı YOK, DB yazma YOK)
        { provide: TebligatService, useValue: stubService('TebligatService') },
        { provide: PttTrackingService, useValue: stubService('PttTrackingService', { trackMultipleBarcodes: new Map() }) },
        { provide: UetsService, useValue: stubService('UetsService') },
        { provide: ExportImportService, useValue: stubService('ExportImportService') },
        { provide: ExchangeRateService, useValue: stubService('ExchangeRateService') },
        { provide: CostPackageService, useValue: stubService('CostPackageService') },
        { provide: ClaimEngineService, useValue: stubService('ClaimEngineService') },
        { provide: PrecautionaryOrderService, useValue: stubService('PrecautionaryOrderService') },
        { provide: OcrService, useValue: stubService('OcrService') },
        { provide: OcrFeedbackService, useValue: stubService('OcrFeedbackService') },
        { provide: LimitationEngineService, useValue: stubService('LimitationEngineService') },
        { provide: InterestEngineService, useValue: stubService('InterestEngineService') },
        { provide: AuditWriterService, useValue: stubService('AuditWriterService') },
        { provide: TraceExporterService, useValue: stubService('TraceExporterService') },
        { provide: InterestEngineMetricsService, useValue: stubService('InterestEngineMetricsService') },
        { provide: CaseBalanceService, useValue: stubService('CaseBalanceService') },
        // R06 (F02-D-2 dilim 4) servisleri (stub; UYAP'a / tarayıcıya / zamanlayıcıya çağrı YOK, DB yazma YOK)
        { provide: BundleService, useValue: stubService('BundleService') },
        { provide: AuditExportService, useValue: stubService('AuditExportService') },
        { provide: SchedulerService, useValue: stubService('SchedulerService') },
        { provide: RecipeRunnerService, useValue: stubService('RecipeRunnerService') },
        { provide: IcrabotService, useValue: stubService('IcrabotService') },
        { provide: RecipePauseService, useValue: stubService('RecipePauseService') },
        { provide: SlaBoostService, useValue: stubService('SlaBoostService') },
        { provide: QueuePolicyLoaderService, useValue: stubService('QueuePolicyLoaderService') },
        { provide: UiMapRecorderService, useValue: stubService('UiMapRecorderService') },
        { provide: SelectorHealthService, useValue: stubService('SelectorHealthService') },
        { provide: ApprovalWorkflowService, useValue: stubService('ApprovalWorkflowService') },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
    jwt = module.get(JwtService);
  });

  afterAll(async () => { await app?.close(); });
  beforeEach(() => { serviceCalls.length = 0; });

  const bearer = (key: ActorKey) => {
    const a = ACTORS[key];
    return `Bearer ${jwt.sign({ sub: a.id, tenantId: TENANT, email: a.email, role: a.role, tokenVersion: 0 })}`;
  };
  const call = (r: Route, key: ActorKey) =>
    request(app.getHttpServer())[VERB[r.method]](r.url).set('Authorization', bearer(key)).send({});

  it('keşif kör değil: yazma rotası ≥ 155, GET ≥ 158, saf POST = 27 (R01 4 + template-engine 10 + R05 hesap/önizleme 11 + R06 icrabot 2)', () => {
    expect(WRITE_ROUTES.length).toBeGreaterThanOrEqual(155);
    expect(GET_ROUTES.length).toBeGreaterThanOrEqual(158);
    expect(READ_ONLY_POSTS.map((r) => `${r.ctrl}.${r.handler}`).sort()).toEqual([
      'BundleController.validateBundle', // R06: paket içerik doğrulaması (saf)
      'CaseInstrumentController.analyzeChain',
      // R05: saf hesap / önizleme POST'ları (servis yan etki haritası: ilgili metotlarda yazma / denetim / dış çağrı yok)
      'ClaimEngineController.calculatePenalty', 'ClaimEngineController.classifyDocument', 'ClaimEngineController.generateClaimItems',
      'ClaimEngineController.routeCase', 'ClaimEngineController.validateCase', 'CostPackageController.computeExpenseRequest',
      'DocumentController.previewTemplate', 'IcrabotController.determineChannel', 'InterestEngineController.preview',
      'LimitationEngineController.checkLimitation', 'LimitationEngineController.recommendEnforcement',
      'NotificationController.getCollectionTemplates', 'OcrController.classifyText', 'OcrController.getSupportedFormats', 'PoaController.checkValidPoaForLawyers',
      // R04: JSON gövdesinden üretim — DB / denetim izi / dış çağrı yok (kaynaktan doğrulandı; statik bekçi template-engine-viewer-read-only-posts)
      'TemplateEngineController.downloadTakipTalebi', 'TemplateEngineController.downloadTakipTalebiPdf', 'TemplateEngineController.downloadTakipTalebiWord',
      'TemplateEngineController.downloadTakipTalebiXml', 'TemplateEngineController.generateHacizTutanagi', 'TemplateEngineController.generateIcraEmri',
      'TemplateEngineController.generateOdemeEmri', 'TemplateEngineController.generateTakipTalebi', 'TemplateEngineController.generateTakipTalebiUdf',
      'TemplateEngineController.previewTakipTalebi',
    ]);
  });

  it("kapısız yazma rotası YOK (fail-closed keşif): her yazma rotası VIEWER'ı reddeden bir kapı taşır", () => {
    expect(WRITE_ROUTES.filter((r) => r.denyGuard === 'none').map((r) => `${r.ctrl}.${r.handler}`)).toEqual([]);
  });

  describe('statik: guard zinciri', () => {
    it.each(CLASS_GUARDED.map((c) => [c.name, c] as const))('%s sınıf düzeyinde ViewerWriteDenyGuard taşır', (_n, ctrl) => {
      const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, ctrl) ?? [];
      expect(guards).toContain(ViewerWriteDenyGuard);
    });
    it('CaseStatusController.changeStatus metot düzeyinde JwtAuthGuard + ViewerWriteDenyGuard taşır', () => {
      const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, CaseStatusController.prototype.changeStatus) ?? [];
      expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, ViewerWriteDenyGuard]));
    });
    it.each(METHOD_GUARDED.map(([c, h]) => [`${c.name}.${h}`, c, h] as const))('%s metot düzeyinde ViewerWriteDenyGuard taşır (R02)', (_n, ctrl, h) => {
      const handler = (ctrl.prototype as Record<string, unknown>)[h];
      expect(typeof handler).toBe('function');
      const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, handler as object) ?? [];
      expect(guards).toContain(ViewerWriteDenyGuard);
    });
    it.each(F01_TEMPLATE_WRITE)('ClientNotificationController.%s ölçülmüş F01 kapısını taşır; ikinci VIEWER kapısı TAKILMAZ (kod sözleşmesi korunur)', (h) => {
      const handler = (ClientNotificationController.prototype as unknown as Record<string, unknown>)[h];
      expect(typeof handler).toBe('function');
      const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, handler as object) ?? [];
      expect(guards).toContain(OfficeF01AuthorizationGuard);
      expect(guards).not.toContain(ViewerWriteDenyGuard);
    });
    it('NotificationDispatchController sınıf düzeyinde TEK guard taşır (karakterizasyon sözleşmesi DEĞİŞMEZ)', () => {
      expect(((Reflect.getMetadata(GUARDS_METADATA, NotificationDispatchController) as unknown[] | undefined) ?? [])).toHaveLength(1);
    });
    it.each(['approveDocument', 'rejectDocument'])('PortalController.%s (yönetici belge kararı) JwtAuthGuard + ViewerWriteDenyGuard taşır', (h) => {
      const handler = (PortalController.prototype as unknown as Record<string, unknown>)[h];
      expect(typeof handler).toBe('function');
      const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, handler as object) ?? [];
      expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, ViewerWriteDenyGuard]));
    });
  });

  describe('VIEWER → 403 (ret kodu taşıdığı kapıdan), servis / adaptör çağrısı 0', () => {
    const EXPECTED_CODE: Record<'viewer' | 'f01', string> = { viewer: VIEWER_WRITE_DENIED, f01: 'OFFICE_WRITE_DENIED_VIEWER' };
    it.each(WRITE_ROUTES.map((r) => [`${RequestMethod[r.method]} ${r.url} (${r.ctrl}.${r.handler}) [${r.denyGuard}]`, r] as const))('%s', async (_n, r) => {
      const res = await call(r, 'viewer');
      expect(res.status).toBe(403);
      if (r.denyGuard === 'admin') expect(String(res.body?.message ?? '')).toContain('ADMIN');
      else expect(res.body?.code).toBe(EXPECTED_CODE[r.denyGuard as 'viewer' | 'f01']);
      expect(serviceCalls).toEqual([]);
    });
  });

  describe('USER → guard geçer (403 değil); okuma ve saf POST VIEWER için açık', () => {
    // "VIEWER guard'ı tarafından engellenmedi" sözleşmesi: 401 değil ve VIEWER_WRITE_DENIED değil. Rotanın kendi
    // mevcut kapıları (ör. run-now'da elevated eşiği → USER için 403 ELEVATED_DENIED) bu spec'in konusu değildir.
    const notBlockedByViewerGuard = (res: request.Response) => {
      expect(res.status).not.toBe(401);
      expect(res.body?.code).not.toBe(VIEWER_WRITE_DENIED);
    };
    it.each(WRITE_ROUTES.map((r) => [`${RequestMethod[r.method]} ${r.url}`, r] as const))('USER %s', async (_n, r) => {
      notBlockedByViewerGuard(await call(r, 'user'));
    });
    it.each(GET_ROUTES.map((r) => [`GET ${r.url}`, r] as const))('VIEWER okuma %s → engellenmez', async (_n, r) => {
      notBlockedByViewerGuard(await call(r, 'viewer'));
    });
    it.each(READ_ONLY_POSTS.map((r) => [`POST ${r.url}`, r] as const))('VIEWER saf POST %s → engellenmez (AllowViewerReadOnlyPost)', async (_n, r) => {
      notBlockedByViewerGuard(await call(r, 'viewer'));
    });
    it('JWT yoksa 401 (guard zinciri gerçek)', async () => {
      const r = WRITE_ROUTES[0];
      const res = await request(app.getHttpServer())[VERB[r.method]](r.url).send({});
      expect(res.status).toBe(401);
    });
  });
});
