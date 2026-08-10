import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * PR-1.2 — X1 office `preparationReference` TEK KANONİK ÜRETECİ.
 *
 * Bu değer ham `CollectionDisposition.id` DEĞİLDİR: tenant'a bağlı, TEK YÖNLÜ bir
 * referanstır. Ofis yüzeyi iç kimlikleri istemciye sızdırmaz (POL-4 sınırının X1
 * karşılığı), fakat komut yolunun aynı kaynağı yeniden bulabilmesi gerekir.
 *
 * Bu modül okuma (projeksiyon) ve komut (create) yollarının ORTAK üretecidir —
 * algoritma İKİNCİ KEZ KOPYALANMAZ. Hash yalnız ileri yönde kullanılır; referanstan
 * disposition'a dönüş, adayların yeniden hash'lenip karşılaştırılmasıyla yapılır
 * (tersine çevirme veya global hash-oracle YOKTUR).
 */
const PREPARATION_REFERENCE_PREFIX = 'client-financial-disclosure-office-source-v1';

export function buildPreparationReference(tenantId: string, dispositionId: string): string {
  return createHash('sha256')
    .update(`${PREPARATION_REFERENCE_PREFIX}:${tenantId}:${dispositionId}`)
    .digest('base64url');
}

/**
 * Sabit-zamanlı karşılaştırma. Uzunluk farkı erken `false` döndürür; bu bir sızıntı
 * değildir çünkü referans uzunluğu algoritma gereği zaten sabittir ve kullanıcı
 * girdisinin uzunluğu gizli bilgi taşımaz.
 */
export function preparationReferenceEquals(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
