import { DebtorRole } from '@prisma/client';
import type { OfficialRoleResolution } from './official-role-translation.types';

/**
 * DBP-P2-UYAP-CONTRACT-A-P02A — Official Role Translation Boundary (SKELETON)
 *
 * Domain `DebtorRole` değerlerini resmî UYAP Contract A `rolTur` çözümleme SONUÇ TİPİNE sınıflandırır.
 * Bu bir İSKELETTİR:
 * - Resolution tablosu BOŞtur; hiçbir gerçek `rolID` (21-71) değeri seçilmez.
 * - Production yolunda `RESOLVED` ÜRETİLMEZ (gerçek domain→rolID eşlemesi P03'te, OWNER/LDO gated).
 * - Sessiz BORÇLU fallback YOKTUR; varsayılan `rolID` YOKTUR.
 *
 * Sınıflandırma yalnızca "bu değer resmî rolTur sözlüğüne ait mi / hangi authority kararını bekliyor"
 * bilgisini taşır. BORÇLULUK veya SORUMLULUK kararı DEĞİLDİR ve enstrüman alanına otomatik mapping
 * DEĞİLDİR.
 *
 * Bağımlılık sınırı: legacy `UYAP_ROL_TURLERI` / `uyap-xml.service.ts` import EDİLMEZ; `PrismaService`
 * kullanılmaz; NestJS provider/decorator içermez. Yalnız test-reachable saf fonksiyondur; hiçbir
 * controller/servis/route bunu çağırmaz (P02A runtime izolasyonu).
 */

/**
 * Resmî Contract A `rolTur` sözlüğünde (rolID 21-71) taraf-rolü karşılığı OLMAYAN, kambiyo
 * enstrümanına özgü sıfatlar. Resmî modelde bunlar enstrüman öğesinin parçasıdır (P02B/P04 kapsamı),
 * taraf `rolTur`'u DEĞİLDİR. Buradaki sınıflandırma yalnız "rolTur sözlüğüne ait değil" ifadesidir;
 * enstrüman alanına mapping YAPMAZ.
 */
const INSTRUMENT_PARTICIPANT_UNSUPPORTED_REASON =
  'Kambiyo enstruman sifati; resmi UYAP Contract A rolTur sozlugunde (rolID 21-71) taraf rolu ' +
  'karsiligi yoktur. Enstruman modeli P02B/P04 kapsamindadir; taraf rolTur degeri degildir.';

/**
 * Rol resmî `rolTur`'a çözülebilir OLABİLİR ama hedef değeri authority (OWNER/LDO) kararını bekler.
 * Bu mesaj hedef değer SEÇMEZ; yalnız kararın P03'e ait olduğunu belirtir.
 */
const AUTHORITY_REQUIRED_REASON =
  'Resmi rolID hedef degeri secilmemistir; domain -> rolID eslemesi P03 authority (OWNER/LDO) ' +
  'kararini bekler. P02A hicbir hedef deger uretmez.';

/**
 * Bir domain `DebtorRole` değerini resmî `rolTur` çözümleme sonucuna sınıflandırır.
 *
 * P02A davranışı (değer içermez):
 * - Kambiyo enstrüman sıfatları (KESIDECI/CIRANTA/AVAL/LEHDAR/MUHATAP) → `UNSUPPORTED_FOR_ROLTUR`
 * - Kalan roller → `UNRESOLVED_AUTHORITY_REQUIRED` (OWNER veya LDO_OWNER)
 * - `RESOLVED` ASLA üretilmez
 * - Enum dışı / bilinmeyen girdi → `INVALID_INPUT` (runtime savunması)
 *
 * Exhaustive `switch` + `assertUnreachableRole(never)`: ileride `DebtorRole`'a yeni değer eklenip
 * burada ele alınmazsa DERLEME HATASI verir (exhaustive guard).
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * /// - (P02A) YALNIZ test-reachable; hiçbir controller/servis/route/module bu fonksiyonu çağırmaz.
 * /// </remarks>
 */
export function resolveOfficialRole(debtorRole: DebtorRole): OfficialRoleResolution {
  switch (debtorRole) {
    // Kambiyo enstrüman sıfatları — resmî rolTur sözlüğünde taraf-rolü YOK.
    case DebtorRole.KESIDECI:
    case DebtorRole.CIRANTA:
    case DebtorRole.AVAL:
    case DebtorRole.LEHDAR:
    case DebtorRole.MUHATAP:
      return {
        kind: 'UNSUPPORTED_FOR_ROLTUR',
        debtorRole,
        reason: INSTRUMENT_PARTICIPANT_UNSUPPORTED_REASON,
      };

    // Hedef değeri OWNER kararı bekleyen roller (borçlu/kefil ailesi).
    case DebtorRole.ASIL_BORCLU:
    case DebtorRole.MUSETEREK_BORCLU:
    case DebtorRole.ADI_KEFIL:
    case DebtorRole.MUTESELSIL_KEFIL:
      return {
        kind: 'UNRESOLVED_AUTHORITY_REQUIRED',
        debtorRole,
        requiredAuthority: 'OWNER',
        reason: AUTHORITY_REQUIRED_REASON,
      };

    // Hedef değeri LDO + OWNER kararı bekleyen roller (miras/tasfiye/iflas).
    case DebtorRole.MIRASCI:
    case DebtorRole.TASFIYE_MEMURU:
    case DebtorRole.IFLAS_MASASI:
      return {
        kind: 'UNRESOLVED_AUTHORITY_REQUIRED',
        debtorRole,
        requiredAuthority: 'LDO_OWNER',
        reason: AUTHORITY_REQUIRED_REASON,
      };

    default:
      // Tüm 12 DebtorRole değeri yukarıda tükenir → `debtorRole` burada `never`'dır (exhaustive guard).
      // Runtime'da (enum dışı cast) buraya düşen girdi INVALID_INPUT olarak sınıflandırılır.
      return assertUnreachableRole(debtorRole);
  }
}

/**
 * Exhaustive-switch bekçisi. Tüm `DebtorRole` değerleri ele alındığında `role` derleme-zamanı
 * `never`'dır; yeni bir değer eklenip ele alınmazsa çağrı derlenmez. Runtime'da (type-güvenliği
 * atlanmış girdi) `INVALID_INPUT` döndürür.
 */
function assertUnreachableRole(role: never): OfficialRoleResolution {
  return {
    kind: 'INVALID_INPUT',
    detail: `Siniflandirilamayan/bilinmeyen DebtorRole degeri: ${String(role)}`,
  };
}
