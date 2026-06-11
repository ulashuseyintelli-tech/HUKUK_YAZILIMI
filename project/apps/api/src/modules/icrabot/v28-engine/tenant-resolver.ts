/**
 * v28 Tenant Resolver — caseId → tenantId, fail-closed.
 *
 * AMAÇ: v28 yazıcı boundary'lerinde (uyap-ingest, action-handler, callback, seed) tenantId
 *   tek kaynaktan, fail-closed çözülsün. tenantId context'te yoksa caseId'den türetilir;
 *   case bulunamazsa NULL yazmak yerine controlled error fırlatılır.
 *
 * Neden fail-closed: tenant izolasyonu legal-grade. `Case.tenantId` NOT NULL olduğundan, var olan
 *   her case için tenantId doludur; tek null yolu case'in bulunmamasıdır → bu durumda timeline'a
 *   null tenant yazmak yerine hata (bridge removal / spec-15 §10 "explicit at write time").
 *
 * NOT: TimelineService.addEntry içindeki geçici bridge (per-insert lookup) Phase 2 PR2'de
 *   kaldırılacak; bu resolver onun kalıcı, fail-closed ve boundary-seviyesi (per-insert değil) hâli.
 *
 * Çağrıldığı yerler (Phase 2 PR1):
 * - UyapEventIngestService.ingestEvent() → boundary resolution.
 * - ActionHandlerService.dispatch() → outbox satırı null tenantId ise.
 * - ActionFeedbackService.processCallback() → external callback.
 * - SeedService.seedCase()/seedUyapEvents() → demo boundary.
 */

/** caseId→tenant okuma için minimal yüzey (PrismaService / tx client structural olarak uyar). */
export interface CaseTenantReader {
  case: {
    findUnique: (args: {
      where: { id: string };
      select: { tenantId: true };
    }) => Promise<{ tenantId: string | null } | null>;
  };
}

/** caseId için tenantId çözümlenemediğinde (case yok / tenantId boş) fırlatılır. */
export class TenantResolutionError extends Error {
  constructor(public readonly caseId: string) {
    super(`tenant_resolution_failed: caseId=${caseId} için tenant bulunamadı (fail-closed)`);
    this.name = 'TenantResolutionError';
  }
}

/**
 * caseId'den tenantId çözer; çözemezse TenantResolutionError fırlatır (NULL döndürmez).
 */
export async function resolveTenantIdOrThrow(
  db: CaseTenantReader,
  caseId: string,
): Promise<string> {
  const c = await db.case.findUnique({ where: { id: caseId }, select: { tenantId: true } });
  if (!c?.tenantId) {
    throw new TenantResolutionError(caseId);
  }
  return c.tenantId;
}
