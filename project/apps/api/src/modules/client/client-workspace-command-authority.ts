import { ForbiddenException } from '@nestjs/common';
import {
  CLIENT_MUTATION_REASON,
  ClientMutationDecision,
  decideClientIntakeReviewCommand,
  decideClientWorkspaceCommand,
} from './client-mutation-policy';

/**
 * C2-B02 R4 — workspace komut yetki uygulama noktası (owner §13/11 RATIFIED 2026-08-03).
 *
 * Gate CONTROLLER SINIRINDADIR (servis gövdeleri `client.service.ts` C1 lane-owned olduğu
 * için oraya konulamaz; sayfa outcome-gate'i "ortak command-authority helper" seçeneğini
 * kanıtla seçti): yetkisiz aktörde `execute` HİÇ çağrılmaz → mail/SMS, queue, artefakt,
 * dosya veya client-state yazımı OLUŞMAZ (owner zorunlu kuralı). Elevated sinyali çağıran
 * `officeApproval.isApproverEligible` ile hesaplar ve buraya fonksiyon olarak verir —
 * OFFICE eligibility hesabı KOPYALANMAZ; ADMIN rolünde hiç sorgulanmaz (lazy, mevcut
 * `assertCanUpdate` deseniyle aynı).
 *
 * @remarks Çağrıldığı yerler: ClientController.sendPoaReminder / sendTemplateNotification /
 * sendDocumentRequest / createIntakeLink / createAndDeliverIntakeLink / uploadPoaFile.
 */

/** Audit `metadata.commandType` için stabil komut adları (owner §13/11 kapsam listesi). */
export const CLIENT_WORKSPACE_COMMAND = {
  POA_REMINDER_SEND: 'POA_REMINDER_SEND',
  TEMPLATE_NOTIFICATION_SEND: 'TEMPLATE_NOTIFICATION_SEND',
  DOCUMENT_REQUEST_SEND: 'DOCUMENT_REQUEST_SEND',
  INTAKE_LINK_CREATE: 'INTAKE_LINK_CREATE',
  INTAKE_LINK_CREATE_AND_DELIVER: 'INTAKE_LINK_CREATE_AND_DELIVER',
  INTAKE_LINK_REVOKE: 'INTAKE_LINK_REVOKE',
  POA_FILE_UPLOAD: 'POA_FILE_UPLOAD',
  NOTIFICATION_SEND_EMAIL: 'NOTIFICATION_SEND_EMAIL',
  NOTIFICATION_SEND_SMS: 'NOTIFICATION_SEND_SMS',
  NOTIFICATION_BULK_EMAIL: 'NOTIFICATION_BULK_EMAIL',
  NOTIFICATION_RESEND: 'NOTIFICATION_RESEND',
  INTAKE_REVIEW_CLAIM: 'INTAKE_REVIEW_CLAIM',
  INTAKE_REVIEW_FIELD_DECIDE: 'INTAKE_REVIEW_FIELD_DECIDE',
  INTAKE_REVIEW_SUBMISSION_REJECT: 'INTAKE_REVIEW_SUBMISSION_REJECT',
} as const;

// =========================================================================================
// C2 REVIEW AUTHORITY EXTENSION — CR-1 (owner RATIFIED 2026-08-03; bounded GO-COMPLETE)
//
// X3-B04'ün TÜKETECEĞİ intake-review komut seti ve permission mapping:
//   INTAKE_REVIEW_CLAIM             → claim(submission)            (üstlenme yazımı)
//   INTAKE_REVIEW_FIELD_DECIDE      → reviewField / bulkReviewFields (APPROVE|REJECT)
//   INTAKE_REVIEW_SUBMISSION_REJECT → rejectSubmission
// Bu ÜÇ komut `INTAKE_REVIEW` sınıfındadır ve yetki sinyali `deps.isIntakeReviewAuthorized`
// ile doğrulanır — `isApproverEligible` (promotion) BU SINIFA YETKİ VERMEZ ve rol adı
// (ADMIN dahil) tek başına YETMEZ (CR-1 md.1/3/6; owner talimatı md.5/6). Promotion
// authority ve approver-eligibility davranışı DEĞİŞTİRİLMEMİŞTİR; review ve promotion
// AYRI kapılardır — aynı aktör ikisini ancak iki yetkiyi ayrı ayrı taşıyorsa yapar.
// Review sınıfı komutlar AYRI audit action üretir: `CLIENT_INTAKE_REVIEW_COMMAND`
// (CR-1 md.7 — aktör/zaman AuditLog satırında korunur). Sinyalin hangi kanonik
// permission'dan besleneceği X3-B04 wiring'inin işidir; C2 kapı ŞEKLİNİ dondurur.
// Public shape freeze sözleşmesi (B03) bu genişletmeyi de kapsar.
// Sözleşme kanıtı: __tests__/client-intake-review-authority-extension.spec.ts
// =========================================================================================

/** Komut sınıfı: yetki sinyalinin kaynağını belirler (WORKSPACE ≠ INTAKE_REVIEW). */
export const CLIENT_WORKSPACE_COMMAND_CLASS = {
  POA_REMINDER_SEND: 'WORKSPACE',
  TEMPLATE_NOTIFICATION_SEND: 'WORKSPACE',
  DOCUMENT_REQUEST_SEND: 'WORKSPACE',
  INTAKE_LINK_CREATE: 'WORKSPACE',
  INTAKE_LINK_CREATE_AND_DELIVER: 'WORKSPACE',
  INTAKE_LINK_REVOKE: 'WORKSPACE',
  POA_FILE_UPLOAD: 'WORKSPACE',
  NOTIFICATION_SEND_EMAIL: 'WORKSPACE',
  NOTIFICATION_SEND_SMS: 'WORKSPACE',
  NOTIFICATION_BULK_EMAIL: 'WORKSPACE',
  NOTIFICATION_RESEND: 'WORKSPACE',
  INTAKE_REVIEW_CLAIM: 'INTAKE_REVIEW',
  INTAKE_REVIEW_FIELD_DECIDE: 'INTAKE_REVIEW',
  INTAKE_REVIEW_SUBMISSION_REJECT: 'INTAKE_REVIEW',
} as const satisfies Record<keyof typeof CLIENT_WORKSPACE_COMMAND, 'WORKSPACE' | 'INTAKE_REVIEW'>;

// =========================================================================================
// C2-B06 — NOTIFICATION/WORKSPACE AUTHORITY PRIMITIVE (CANONICAL + FROZEN, 2026-08-03)
//
// CODEX-CLIENT-X1 (CN-1 WIRING) için sözleşme: client-notification yüzeyinin dört
// rol-kontrolsüz komutu (`send-email` · `send-sms` · `bulk-email` · `resend`) BU
// dosyadaki primitive çiftiyle ve `NOTIFICATION_*` komut tipleriyle yetkilendirilir.
// Eşik owner §13/11 madde 6 ("gerçek mail/SMS gönderimi veya gönderim kuyruğuna yazma")
// ile ratifiyedir: ADMIN VEYA canonical elevated; VIEWER/tanımsız rol fail-closed;
// yetki kontrolü queue-write/dispatch'ten ÖNCE. X1 KENDİ rol politikasını ÜRETMEZ,
// yalnız WIRE eder; endpoint'lere bağlama X1'in işidir (client-notification/ C2'ye
// kapalıdır). Bulk komutta `ctx.clientId` hedef kapsam kimliğini taşıyabilir —
// primitive clientId semantiğini doğrulamaz, audit'e olduğu gibi yazar.
// Bu genişletme de B03'teki freeze sözleşmesine tabidir (yalnız C2 değiştirebilir).
// Sözleşme kanıtı: __tests__/client-notification-authority-primitive-b06.spec.ts
// =========================================================================================

// =========================================================================================
// C2-B03 R5 — INTAKE-LINK MUTATION AUTHORITY PRIMITIVE (CANONICAL + FROZEN, 2026-08-03)
//
// CODEX-CLIENT-X3 için sözleşme: intake-link mutasyonlarının (create · create-and-deliver ·
// revoke) yetki primitive'i BU dosyadaki `runAuthorizedClientWorkspaceCommand` +
// `decideClientWorkspaceCommand` (client-mutation-policy.ts) çiftidir ve `INTAKE_LINK_*`
// komut tipleriyle kullanılır. Eşik owner §13/11 ile ratifiyedir (ADMIN VEYA canonical
// elevated); X3 KENDİ authority modelini KURMAZ, yalnız TÜKETİR. `INTAKE_LINK_REVOKE`
// aynı ratifiye eşiğe bağlanmıştır (yeni eşik İCAT EDİLMEMİŞTİR — tek fark komut adıdır).
// CR-1 (review ≠ promote ayrımı) BU primitive'in kapsamı DIŞINDADIR ve owner kararı
// bekler (master plan §13/12) — promotion yetkisi buradan TÜRETİLEMEZ.
// Bu public shape DONDURULMUŞTUR: export adları, komut tipi string değerleri ve eşik
// semantiği C2 sayfası dışında DEĞİŞTİRİLEMEZ; yeni komut tipi ihtiyacı C2'ye bildirilir.
// Sözleşme kanıtı: __tests__/client-intake-link-authority-primitive-b03.spec.ts
// =========================================================================================

export type ClientWorkspaceCommandType =
  (typeof CLIENT_WORKSPACE_COMMAND)[keyof typeof CLIENT_WORKSPACE_COMMAND];

export interface ClientWorkspaceCommandActor {
  userId?: string | null;
  tenantId?: string | null;
  role?: string | null;
}

export interface ClientWorkspaceCommandContext {
  /** Hedef tenant — actor.tenantId ile EXACT eşit olmalı (cross-tenant kesin ret). */
  tenantId: string;
  clientId: string;
  commandType: ClientWorkspaceCommandType;
}

export interface ClientWorkspaceCommandDeps {
  /** `officeApproval.isApproverEligible` — yalnız rol ADMIN DEĞİLKEN çağrılır (WORKSPACE sınıfı). */
  isApproverEligible: (userId: string, tenantId: string) => Promise<boolean>;
  /**
   * CR-1: INTAKE_REVIEW sınıfı komutların yetki sinyali — promotion eşiğinden
   * (`isApproverEligible`) BAĞIMSIZ ayrı kapı; rol adı (ADMIN dahil) yetki VERMEZ.
   * Review komutu çalıştırılacaksa ZORUNLUDUR (yoksa fail-closed yapılandırma hatası).
   */
  isIntakeReviewAuthorized?: (userId: string, tenantId: string) => Promise<boolean>;
  /** Başarılı komutta zorunlu audit yazıcısı (`AuditService.log`). */
  auditLog: (input: {
    tenantId: string;
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
  }) => Promise<void>;
}

const DENY_MESSAGES: Partial<Record<string, string>> = {
  [CLIENT_MUTATION_REASON.NO_ACTOR]: 'Yetkilendirme bağlamı yok.',
  [CLIENT_MUTATION_REASON.UNKNOWN_ROLE]: 'Kullanıcı rolü tanınmadı.',
  [CLIENT_MUTATION_REASON.VIEWER_DENIED]:
    'Görüntüleyici (VIEWER) rolü müvekkil-yüzlü komut çalıştıramaz.',
  [CLIENT_MUTATION_REASON.TENANT_MISMATCH]: 'Aktör hedef tenant ile eşleşmiyor.',
  [CLIENT_MUTATION_REASON.WORKSPACE_COMMAND_DENIED]:
    'Müvekkil-yüzlü komut için yetki yok (ADMIN veya yetkilendirilmiş onaylayıcı gerekir).',
  [CLIENT_MUTATION_REASON.INTAKE_REVIEW_DENIED]:
    'Intake review kararı için yetki yok (intake-review yetkisi gerekir; rol tek başına yetmez).',
};

/** Reddi stabil `reasonCode` ile 403'e çevirir — gövde alan DEĞERİ taşımaz (PII yasağı). */
function denyWorkspaceCommand(decision: ClientMutationDecision): never {
  throw new ForbiddenException({
    message: DENY_MESSAGES[decision.reasonCode] ?? 'Müvekkil-yüzlü komut reddedildi.',
    reasonCode: decision.reasonCode,
  });
}

/**
 * Yetki → yürütme → audit zinciri. Sıra owner §13/11 zorunlu kurallarına birebir:
 * 1. actor/tenant fail-closed doğrulanır (cross-tenant hiç sorgu üretmeden reddedilir),
 * 2. eşik (ADMIN VEYA elevated) `decideClientWorkspaceCommand` ile karara bağlanır,
 * 3. YALNIZ izin verilirse `execute` çağrılır (dış yan etki/queue yazımı bundan sonra),
 * 4. başarılı sonuçta AuditLog üretilir (actor/tenant/client/commandType/result;
 *    timestamp AuditLog.createdAt; ham PII metadata'ya YAZILMAZ — resultMeta çağıranın
 *    verdiği GÜVENLİ alanlarla sınırlıdır).
 *
 * `execute` throw ederse audit ÜRETİLMEZ (başarısız mutasyon audit üretmez kuralı);
 * audit yazımı hatası ise sonucu çağırana taşınır (sessizce yutulmaz).
 */
export async function runAuthorizedClientWorkspaceCommand<T>(
  deps: ClientWorkspaceCommandDeps,
  actor: ClientWorkspaceCommandActor,
  ctx: ClientWorkspaceCommandContext,
  execute: () => Promise<T>,
  resultMeta?: (result: T) => Record<string, unknown>,
): Promise<T> {
  const userId = String(actor?.userId ?? '').trim();
  const actorTenantId = String(actor?.tenantId ?? '').trim();
  if (!userId || !actorTenantId) {
    denyWorkspaceCommand({ allowed: false, reasonCode: CLIENT_MUTATION_REASON.NO_ACTOR });
  }
  if (actorTenantId !== ctx.tenantId) {
    denyWorkspaceCommand({ allowed: false, reasonCode: CLIENT_MUTATION_REASON.TENANT_MISMATCH });
  }

  const commandClass =
    CLIENT_WORKSPACE_COMMAND_CLASS[ctx.commandType as keyof typeof CLIENT_WORKSPACE_COMMAND_CLASS];

  if (commandClass === 'INTAKE_REVIEW') {
    // CR-1: review AYRI kapıdır — sinyal `isIntakeReviewAuthorized`; promotion eşiği
    // (`isApproverEligible`) BU SINIFTA HİÇ sorgulanmaz, rol adı yetki vermez.
    const coarse = decideClientIntakeReviewCommand({ userId, role: actor.role, reviewAuthority: false });
    if (!coarse.allowed && coarse.reasonCode !== CLIENT_MUTATION_REASON.INTAKE_REVIEW_DENIED) {
      denyWorkspaceCommand(coarse);
    }
    if (!deps.isIntakeReviewAuthorized) {
      throw new Error('Intake review authority is not configured');
    }
    const reviewAuthority = await deps.isIntakeReviewAuthorized(userId, actorTenantId);
    const decision = decideClientIntakeReviewCommand({ userId, role: actor.role, reviewAuthority });
    if (!decision.allowed) denyWorkspaceCommand(decision);
  } else {
    // `isApproverEligible` YALNIZ gerçekten gerektiğinde sorgulanır (`assertCanUpdate`
    // deseniyle aynı): ADMIN ve coarse retler (NO_ACTOR/UNKNOWN_ROLE/VIEWER) DB'ye gitmez.
    const coarse = decideClientWorkspaceCommand({ userId, role: actor.role, elevatedAuthority: false });
    if (!coarse.allowed) {
      if (coarse.reasonCode !== CLIENT_MUTATION_REASON.WORKSPACE_COMMAND_DENIED) {
        denyWorkspaceCommand(coarse);
      }
      const elevatedAuthority = await deps.isApproverEligible(userId, actorTenantId);
      const decision = decideClientWorkspaceCommand({ userId, role: actor.role, elevatedAuthority });
      if (!decision.allowed) denyWorkspaceCommand(decision);
    }
  }

  const result = await execute();

  await deps.auditLog({
    tenantId: ctx.tenantId,
    userId,
    // CR-1 md.7: review ve promotion AYRI audit kayıtları — review sınıfı ayrı action alır.
    action: commandClass === 'INTAKE_REVIEW' ? 'CLIENT_INTAKE_REVIEW_COMMAND' : 'CLIENT_WORKSPACE_COMMAND',
    entityType: 'Client',
    entityId: ctx.clientId,
    metadata: {
      commandType: ctx.commandType,
      actorRole: actor.role ?? null,
      ...(resultMeta ? resultMeta(result) : {}),
    },
  });

  return result;
}
