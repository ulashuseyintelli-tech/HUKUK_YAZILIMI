/**
 * case.dto.CaseType → interest-strategy.config.CaseType mapping (doc 24).
 *
 * NEDEN: İki ayrı CaseType domaini var:
 *   - case.dto.CaseType        : operasyonel/DB tipleri (kullanıcı seçimi)
 *   - interest-strategy.config : hukuki faiz-strateji tipleri (resolveInitialPolicy bekler)
 * Aralarında mapping olmadığı için case.create'teki INTEREST_POLICY_ASSIGNED emit'i
 * resolveInitialPolicy(dto.type) ile yanlış değer geçiriyordu → getInterestStrategy
 * sessizce ILAMSIZ_GENEL'e düşüyordu (doc 24 known-debt; audit-only, canlı hesap dışı).
 *
 * BU DOSYA: dto → config eşlemesini AÇIKÇA ve EXHAUSTIVE yapar.
 *   - Record<CaseType, …> → derleme-zamanı exhaustiveness (her dto tipi zorunlu; eksik = tsc hatası).
 *   - Silent default YOK; type-cast YOK.
 *   - BANKRUPTCY / OTHER → ILAMSIZ_GENEL **explicit fallback** (reasoning ile kayıtlı; sessiz değil).
 *
 * Çağrıldığı yerler:
 * - case.service.create() → POST /cases (INTEREST_POLICY_ASSIGNED payload üretiminde dto.type'ı
 *   hukuki strateji tipine çevirir; audit-only).
 *
 * Bağımlılık yönü: case → interest-engine (mevcut yön; ters yön döngü yaratırdı).
 * NOT: getInterestStrategy'deki `|| ILAMSIZ_GENEL` fallback'ine BU PR dokunmaz (ayrı/daha geniş davranış).
 */
import { CaseType as DtoCaseType } from './dto/case.dto';
import { CaseType as InterestCaseType } from '../interest-engine/interest-strategy.config';

export interface InterestCaseTypeMapping {
  /** Hukuki strateji tipi (resolveInitialPolicy'e geçilecek). */
  configType: InterestCaseType;
  /** Orijinal operasyonel tip (audit fidelity). */
  sourceCaseType: DtoCaseType;
  /** Explicit fallback gerekçesi (yalnız baseline'a eşlenenlerde dolu). */
  reasoning?: string;
}

/**
 * Exhaustive eşleme. `Record<DtoCaseType, …>` → bir dto tipi eklenir de buraya
 * eklenmezse derleme HATASI verir (silent default imkânsız).
 */
const DTO_TO_INTEREST_CASE_TYPE: Record<
  DtoCaseType,
  { configType: InterestCaseType; reasoning?: string }
> = {
  [DtoCaseType.CHECK]: { configType: InterestCaseType.KAMBIYO_CEK },
  [DtoCaseType.BOND]: { configType: InterestCaseType.KAMBIYO_BONO },
  [DtoCaseType.MORTGAGE]: { configType: InterestCaseType.IPOTEK },
  [DtoCaseType.PLEDGE]: { configType: InterestCaseType.REHIN },
  [DtoCaseType.RENTAL]: { configType: InterestCaseType.ILAMSIZ_KIRA },
  [DtoCaseType.GENERAL_EXECUTION]: { configType: InterestCaseType.ILAMSIZ_GENEL },
  [DtoCaseType.BANKRUPTCY]: {
    configType: InterestCaseType.ILAMSIZ_GENEL,
    reasoning:
      'BANKRUPTCY has no dedicated interest strategy; mapped to ILAMSIZ_GENEL baseline.',
  },
  [DtoCaseType.OTHER]: {
    configType: InterestCaseType.ILAMSIZ_GENEL,
    reasoning:
      'OTHER mapped to ILAMSIZ_GENEL baseline because no specific strategy was selected.',
  },
};

/**
 * Operasyonel case tipini hukuki faiz-strateji tipine çevirir (audit-only).
 */
export function mapDtoCaseTypeToInterestCaseType(
  dtoType: DtoCaseType,
): InterestCaseTypeMapping {
  const entry = DTO_TO_INTEREST_CASE_TYPE[dtoType];
  return {
    configType: entry.configType,
    sourceCaseType: dtoType,
    reasoning: entry.reasoning,
  };
}
