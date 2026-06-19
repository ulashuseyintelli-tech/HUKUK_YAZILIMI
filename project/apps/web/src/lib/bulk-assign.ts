/**
 * Toplu atama (bulk-assign) payload kurucusu — ASSIGN-4a.
 *
 * Yalnız PERSONEL ('staff') toplu ataması desteklenir: sorumlu personel
 * (`Case.sorumluPersonelId`) `POST /cases/batch-update` ucuyla tenant-scoped yazılır
 * (uç zaten `sorumluPersonelId`'yi kabul ediyor; raporlar sayfasında kanıtlı).
 *
 * AVUKAT ('lawyer') toplu ataması GEÇİCİ DEVRE DIŞIDIR: "sorumlu avukat" kanonik olarak
 * `CaseLawyer.isResponsible`'dır (Case üzerinde bir skalar DEĞİLDİR) ve toplu değişiminin
 * semantiği (mevcut sorumluyu düşürme, görev devri, audit, çok-avukatlı dosyalar) sorumlu-
 * avukat modeli kararı (ASSIGN-4d) olmadan net değildir. Bu yüzden `lawyer` ve bilinmeyen
 * türler için `null` döner → çağıran sessizce no-op yapar ("sahte başarılı" toast yok).
 *
 * Çağrıldığı yerler:
 * - apps/web cases/page.tsx#handleBulkAssign → POST /cases/batch-update (toplu sorumlu personel atama)
 */

export interface BatchUpdatePayload {
  caseIds: string[];
  updates: { sorumluPersonelId: string };
}

/**
 * Toplu atama için batch-update payload'u üretir.
 * @returns Yalnız `type === 'staff'` ve geçerli `assigneeId`/`caseIds` varsa payload; aksi halde `null`.
 */
export function buildBulkAssignPayload(
  type: string,
  caseIds: string[],
  assigneeId: string,
): BatchUpdatePayload | null {
  if (type !== 'staff') return null; // avukat/bilinmeyen → desteklenmiyor (ASSIGN-4d)
  if (!assigneeId) return null; // seçim yok
  if (!caseIds || caseIds.length === 0) return null; // hedef dosya yok
  return { caseIds, updates: { sorumluPersonelId: assigneeId } };
}
