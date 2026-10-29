/**
 * F02-B-1 (owner kararı 2026-10-29/30; OK-34 / OD-08 B / OD-10 B) — görev ve masraf listelerinde "büro geneli görünüm"
 * izninin TAŞIYICISI: mevcut `PermissionGrant` (GLOBAL kapsam, ALLOW/DENY etkisi, geçerlilik penceresi, denetim izi).
 *
 * Owner hükümleri:
 *  - AYRI iki anahtar (masraf mali veri + müvekkil iletişimi taşır).
 *  - Grant verme / geri alma: yalnız GÜNCEL DB rolü ADMIN olan aktör, tx içinde (bildirim geçmişi izni emsali); ürün yolu şart.
 *  - DENY > ALLOW > varsayılan (yok). Varsayılan görünüm = atanan/oluşturan ∪ dosya ilişkisi (CaseLawyer / CaseStaff canView);
 *    dosyasız kayıt = yalnız atanan/oluşturan (+ masrafta onaycı). ReportingLine erişim ÜRETMEZ.
 *  - Bu izinler MÜVEKKİL okuma ya da dosyaya bağlama yetkisi VERMEZ (K16 kapsamı ayrıdır).
 *  - Otomatik toplu grant YOK; canlı grant yazımı ve kapsam etkinleştirmesi ayrı yayın yetkisi (G3: önce masraf, sonra görev).
 */
export const WORK_SCOPE_VIEW_ALL_KEYS = ['office.tasks.view_all', 'office.expenses.view_all'] as const;
export type WorkScopeViewAllKey = (typeof WORK_SCOPE_VIEW_ALL_KEYS)[number];

export const WORK_SCOPE_PERSON_TYPES = ['lawyer', 'staff'] as const;
export type WorkScopePersonType = (typeof WORK_SCOPE_PERSON_TYPES)[number];

export const WORK_SCOPE_EFFECTS = ['ALLOW', 'DENY'] as const;
export type WorkScopeEffect = (typeof WORK_SCOPE_EFFECTS)[number];

/** Çözümleme sonucu: DENY (açık ret) > ALLOW (büro geneli) > NONE (varsayılan kapsam). */
export type WorkScopeResolution = WorkScopeEffect | 'NONE';

export function isWorkScopeViewAllKey(value: unknown): value is WorkScopeViewAllKey {
  return typeof value === 'string' && (WORK_SCOPE_VIEW_ALL_KEYS as readonly string[]).includes(value);
}
