/*
 * İ12 — MAKBUZ KİMLİK BAĞI DOĞRULAMASI (salt-okuma; TEK KAYNAK)
 *
 * Owner kuralı: "Kurtarmada HER YAZMADAN ÖNCE hedef ve yabancı tenant ID/slug/runId bağını DB'den
 * doğrula; yanlış kimlikte hiçbir kullanıcıya/Office kaydına YAZMA."
 *
 * Bu modül hiçbir şey YAZMAZ. Doğrulanan bağ:
 *   1. makbuz slug'ı runId'den TÜRETİLMİŞ olmalı:      tenantSlug === `ah-<runId>`
 *   2. hedef tenant DB'de VAR ve slug'ı makbuzunkiyle AYNI (id↔slug bağı)
 *   3. yabancı tenant (varsa) DB'de VAR ve slug'ı `ah-<runId>-x`
 *   4. her iki slug da `ah-` sentetik önekini taşır (assertOwnSlug — gerçek müvekkil tenant'ı ASLA)
 * Biri bile sağlanmazsa `{ok:false, reason}` döner; çağıran HİÇBİR yazma yapmadan durur (fail-closed).
 */
'use strict';
const path = require('path');
const I3 = path.resolve(__dirname, '../../client-acceptance-runners-i3-r01/scripts');
const L = require(path.join(I3, 'i3-lib'));

const REASON = {
  OK: 'IDENTITY_OK',
  BAD_RECEIPT: 'RECEIPT_FIELDS_MISSING',
  SLUG_NOT_DERIVED: 'TARGET_SLUG_NOT_DERIVED_FROM_RUNID',
  NOT_OWN_SLUG: 'SLUG_NOT_SYNTHETIC_AH_PREFIX',
  TARGET_NOT_FOUND: 'TARGET_TENANT_NOT_FOUND_IN_DB',
  TARGET_SLUG_MISMATCH: 'TARGET_TENANT_ID_SLUG_MISMATCH',
  FOREIGN_NOT_FOUND: 'FOREIGN_TENANT_NOT_FOUND_IN_DB',
  FOREIGN_SLUG_MISMATCH: 'FOREIGN_TENANT_ID_SLUG_MISMATCH',
  DB_ERROR: 'IDENTITY_DB_READ_FAILED',
};

/**
 * @returns {Promise<{ok:boolean, reason:string, target?:{id:string,slug:string}, foreign?:{id:string,slug:string}|null}>}
 */
async function assertReceiptIdentity(prisma, receipt) {
  if (!receipt || !receipt.runId || !receipt.tenantId || !receipt.tenantSlug) {
    return { ok: false, reason: REASON.BAD_RECEIPT };
  }
  const runId = String(receipt.runId).toLowerCase();
  const derived = `${L.AH.TENANT_PREFIX}${runId}`;
  const derivedForeign = `${derived}-x`;

  if (receipt.tenantSlug !== derived) return { ok: false, reason: `${REASON.SLUG_NOT_DERIVED} (makbuz='${receipt.tenantSlug}' türetilen='${derived}')` };
  try { L.AH.assertOwnSlug(receipt.tenantSlug); } catch (e) { return { ok: false, reason: `${REASON.NOT_OWN_SLUG}: ${e && e.message ? e.message : e}` }; }

  let target, foreign = null;
  try {
    target = await prisma.tenant.findUnique({ where: { id: receipt.tenantId }, select: { id: true, slug: true } });
    if (receipt.foreignTenantId) {
      foreign = await prisma.tenant.findUnique({ where: { id: receipt.foreignTenantId }, select: { id: true, slug: true } });
    }
  } catch (e) { return { ok: false, reason: `${REASON.DB_ERROR}: ${e && e.message ? e.message : e}` }; }

  if (!target) return { ok: false, reason: `${REASON.TARGET_NOT_FOUND} (id=${receipt.tenantId})` };
  if (target.slug !== receipt.tenantSlug) return { ok: false, reason: `${REASON.TARGET_SLUG_MISMATCH} (DB='${target.slug}' makbuz='${receipt.tenantSlug}')` };

  if (receipt.foreignTenantId) {
    if (!foreign) return { ok: false, reason: `${REASON.FOREIGN_NOT_FOUND} (id=${receipt.foreignTenantId})` };
    if (foreign.slug !== derivedForeign) return { ok: false, reason: `${REASON.FOREIGN_SLUG_MISMATCH} (DB='${foreign.slug}' türetilen='${derivedForeign}')` };
    try { L.AH.assertOwnSlug(foreign.slug); } catch (e) { return { ok: false, reason: `${REASON.NOT_OWN_SLUG}(foreign): ${e && e.message ? e.message : e}` }; }
  }

  return { ok: true, reason: REASON.OK, target: { id: target.id, slug: target.slug }, foreign: foreign ? { id: foreign.id, slug: foreign.slug } : null };
}

module.exports = { assertReceiptIdentity, REASON };
