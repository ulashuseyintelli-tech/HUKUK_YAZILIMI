/**
 * Outbox erişim kapsamı (OUTBOX-F1..F4 remediation).
 *
 * Outbox tablosu platform genelinde tek kuyruktur; satirlar `tenantId` tasir.
 * Bu tip, her okuma/dispatch cagrisinin kapsamini ACIKCA tasimasini zorunlu kilar:
 * TypeScript, cagiranin kapsam secmesini derleme zamaninda zorlar; unutulan
 * tenant filtresi artik "sessizce global" anlamina gelemez.
 *
 * - `tenant`  : yalniz o tenant'a ait satirlar. TUM HTTP yuzeyi bunu kullanir.
 * - `platform`: tenant filtresi yok. YALNIZ dahili sistem surecleri (cron) icindir;
 *               hicbir controller/HTTP yolu bu kapsami uretmez.
 */
export type OutboxScope =
  | { readonly kind: 'tenant'; readonly tenantId: string }
  | { readonly kind: 'platform' };

/**
 * HTTP istegindeki dogrulanmis kullanicidan tenant kapsami uretir.
 *
 * Fail-closed: tenantId yoksa kapsam uretilmez, hata firlatilir. Cagiran
 * tarafindan saglanan body/query degeri ASLA authority olarak kullanilmaz;
 * tek kaynak JWT ile dogrulanmis `request.user.tenantId`'dir.
 *
 * /// <remarks>
 * /// Cagrildigi yerler:
 * /// - OutboxController.* -> tum /icrabot/v28/outbox uclari
 * /// - ActionsController.getAction() -> GET /icrabot/v28/actions/:actionId
 * /// </remarks>
 */
export function tenantScopeFromRequestUser(user: unknown): OutboxScope {
  const tenantId = (user as { tenantId?: unknown } | null | undefined)?.tenantId;
  if (typeof tenantId !== 'string' || tenantId.length === 0) {
    throw new Error('outbox_scope_missing_tenant: request.user.tenantId cozumlenemedi');
  }
  return { kind: 'tenant', tenantId };
}

/**
 * Kapsami Prisma `where` fragmentine cevirir.
 * `platform` icin bos nesne doner (filtre yok) — bu bilincli ve tek yerdedir.
 */
export function outboxScopeWhere(scope: OutboxScope): Record<string, unknown> {
  return scope.kind === 'tenant' ? { tenantId: scope.tenantId } : {};
}

/**
 * Bir outbox satirinin verilen kapsam icinde gorunur olup olmadigini soyler.
 * Satirin kendi `tenantId`'si NULL ise tenant kapsaminda ASLA gorunmez (fail-closed).
 */
export function outboxRowInScope(
  row: { tenantId?: string | null } | null | undefined,
  scope: OutboxScope,
): boolean {
  if (!row) return false;
  if (scope.kind === 'platform') return true;
  return typeof row.tenantId === 'string' && row.tenantId === scope.tenantId;
}
