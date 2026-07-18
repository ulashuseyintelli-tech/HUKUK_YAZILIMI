import { DebtorRole } from '@prisma/client';
import type { OfficialRoleResolution } from './official-role-translation.types';

/**
 * DBP-P2-UYAP-CONTRACT-A-P02A + P03A — Official Role Translation Boundary
 *
 * Domain `DebtorRole` değerlerini resmî UYAP Contract A `rolTur` çözümleme SONUÇ TİPİNE sınıflandırır.
 * - P03A (owner-ratified, 2026-07-18): 4 owner-safe rol (borçlu/kefil ailesi) `RESOLVED` döner; resmî
 *   `rolID`/`Rol` değerleri owner tarafından ratifiye edilmiş TEK immutable authority tablosundadır
 *   (`OWNER_SAFE_ROLE_TARGETS`). Değerler switch dallarında TEKRARLANMAZ.
 * - LDO_OWNER 3 rol (miras/tasfiye/iflas) hâlâ `UNRESOLVED_AUTHORITY_REQUIRED` — hedef SEÇİLMEZ (P03B).
 * - Kambiyo 5 sıfat hâlâ `UNSUPPORTED_FOR_ROLTUR`.
 * - Sessiz BORÇLU fallback YOKTUR; varsayılan `rolID` YOKTUR; reverse mapping YOKTUR.
 *
 * Çıktı yalnız Contract A `rolTur` sınıflandırmasıdır; BORÇLULUK/SORUMLULUK kararı DEĞİLDİR. Domain
 * rolünü birleştirmez/değiştirmez/persist etmez; adi/müşterek/müteselsil ayrımı domain modelinde
 * korunur (wire seviyesinde 22/33'e projeksiyon hukuki sonuç üretmez). Enstrüman alanına mapping DEĞİLDİR.
 *
 * Bağımlılık sınırı: legacy `UYAP_ROL_TURLERI` / `uyap-xml.service.ts` import EDİLMEZ; `PrismaService`
 * kullanılmaz; NestJS provider/decorator içermez. Yalnız test-reachable saf fonksiyondur; hiçbir
 * controller/servis/route bunu çağırmaz (runtime izolasyonu).
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
 * LDO_OWNER rolleri resmî `rolTur`'a çözülebilir OLABİLİR ama hedef değeri LDO + OWNER kararını (P03B)
 * bekler. Bu mesaj hedef değer SEÇMEZ.
 */
const AUTHORITY_REQUIRED_REASON =
  'Resmi rolID hedef degeri secilmemistir; domain -> rolID eslemesi P03B (LDO + OWNER) authority ' +
  'kararini bekler. Bu birim (P03A) bu roller icin hedef deger uretmez.';

/**
 * P03A owner-ratified (2026-07-18) owner-safe teknik taraf-rolü hedefleri. TEK immutable authority
 * tablosu — `rolID`/`Rol` değerleri switch dallarında TEKRARLANMAZ. Değerler resmî KodluBilgilerData
 * (Contract A) birebir karşılıklarıdır: BORÇLU/MÜFLİS=22, KEFİL=33. Bu tablo yalnız Contract A rolTur
 * çıktısıdır; hukuki sorumluluk sonucu DEĞİLDİR ve domain rolünü birleştirmez/değiştirmez. Reverse
 * mapping YOKTUR.
 */
const OWNER_SAFE_ROLE_TARGETS: Readonly<
  Partial<Record<DebtorRole, { readonly rolID: string; readonly rol: string }>>
> = Object.freeze({
  [DebtorRole.ASIL_BORCLU]: { rolID: '22', rol: 'BORÇLU/MÜFLİS' },
  [DebtorRole.MUSETEREK_BORCLU]: { rolID: '22', rol: 'BORÇLU/MÜFLİS' },
  [DebtorRole.ADI_KEFIL]: { rolID: '33', rol: 'KEFİL' },
  [DebtorRole.MUTESELSIL_KEFIL]: { rolID: '33', rol: 'KEFİL' },
});

/**
 * Bir domain `DebtorRole` değerini resmî `rolTur` çözümleme sonucuna sınıflandırır.
 *
 * Davranış (P02A sınıflandırma + P03A owner-safe çözüm):
 * - Kambiyo enstrüman sıfatları (KESIDECI/CIRANTA/AVAL/LEHDAR/MUHATAP) → `UNSUPPORTED_FOR_ROLTUR`
 * - Owner-safe roller (ASIL_BORCLU/MUSETEREK_BORCLU/ADI_KEFIL/MUTESELSIL_KEFIL) → `RESOLVED`
 *   (`OWNER_SAFE_ROLE_TARGETS`; P03A owner-ratified)
 * - LDO_OWNER roller (MIRASCI/TASFIYE_MEMURU/IFLAS_MASASI) → `UNRESOLVED_AUTHORITY_REQUIRED` (P03B)
 * - Enum dışı / bilinmeyen girdi → `INVALID_INPUT` (runtime savunması)
 * - Sessiz BORÇLU fallback / varsayılan `rolID` YOKTUR
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

    // Owner-safe roller (P03A owner-ratified) → RESOLVED, tek immutable authority tablosundan.
    case DebtorRole.ASIL_BORCLU:
    case DebtorRole.MUSETEREK_BORCLU:
    case DebtorRole.ADI_KEFIL:
    case DebtorRole.MUTESELSIL_KEFIL: {
      const target = OWNER_SAFE_ROLE_TARGETS[debtorRole];
      if (!target) {
        // Ulaşılamaz: yukarıdaki 4 case tabloyla birebir eşleşir. Savunma amaçlı INVALID_INPUT.
        return {
          kind: 'INVALID_INPUT',
          detail: `Owner-safe rol icin hedef bulunamadi: ${String(debtorRole)}`,
        };
      }
      return { kind: 'RESOLVED', rolID: target.rolID, rol: target.rol };
    }

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
