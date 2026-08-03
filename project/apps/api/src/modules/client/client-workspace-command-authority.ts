import { ForbiddenException } from '@nestjs/common';
import {
  CLIENT_MUTATION_REASON,
  ClientMutationDecision,
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
  POA_FILE_UPLOAD: 'POA_FILE_UPLOAD',
} as const;

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
  /** `officeApproval.isApproverEligible` — yalnız rol ADMIN DEĞİLKEN çağrılır. */
  isApproverEligible: (userId: string, tenantId: string) => Promise<boolean>;
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

  const result = await execute();

  await deps.auditLog({
    tenantId: ctx.tenantId,
    userId,
    action: 'CLIENT_WORKSPACE_COMMAND',
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
