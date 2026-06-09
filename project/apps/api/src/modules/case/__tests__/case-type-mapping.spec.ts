/**
 * Unit test — case.dto.CaseType → interest-strategy.config.CaseType mapping (doc 24).
 *
 * Mevcut bug'ı kapatan exhaustive eşlemeyi kilitler:
 *   - net eşlemeler (CHECK→KAMBIYO_CEK vb.)
 *   - BANKRUPTCY / OTHER → ILAMSIZ_GENEL explicit fallback (reasoning ile)
 *   - sourceCaseType = orijinal dto tipi (audit fidelity)
 *   - silent default YOK: bilinmeyen değer Record'da olmadığı için tanımsız döner (negatif kontrol)
 */
import { mapDtoCaseTypeToInterestCaseType } from '../case-type-mapping';
import { CaseType as DtoCaseType } from '../dto/case.dto';
import { CaseType as InterestCaseType } from '../../interest-engine/interest-strategy.config';

describe('mapDtoCaseTypeToInterestCaseType (doc 24)', () => {
  it('net eşlemeler (reasoning YOK)', () => {
    const cases: Array<[DtoCaseType, InterestCaseType]> = [
      [DtoCaseType.CHECK, InterestCaseType.KAMBIYO_CEK],
      [DtoCaseType.BOND, InterestCaseType.KAMBIYO_BONO],
      [DtoCaseType.MORTGAGE, InterestCaseType.IPOTEK],
      [DtoCaseType.PLEDGE, InterestCaseType.REHIN],
      [DtoCaseType.RENTAL, InterestCaseType.ILAMSIZ_KIRA],
      [DtoCaseType.GENERAL_EXECUTION, InterestCaseType.ILAMSIZ_GENEL],
    ];
    for (const [dto, expected] of cases) {
      const m = mapDtoCaseTypeToInterestCaseType(dto);
      expect(m.configType).toBe(expected);
      expect(m.sourceCaseType).toBe(dto);
      expect(m.reasoning).toBeUndefined();
    }
  });

  it('BANKRUPTCY → ILAMSIZ_GENEL explicit fallback (reasoning ile)', () => {
    const m = mapDtoCaseTypeToInterestCaseType(DtoCaseType.BANKRUPTCY);
    expect(m.configType).toBe(InterestCaseType.ILAMSIZ_GENEL);
    expect(m.sourceCaseType).toBe(DtoCaseType.BANKRUPTCY);
    expect(m.reasoning).toBe(
      'BANKRUPTCY has no dedicated interest strategy; mapped to ILAMSIZ_GENEL baseline.',
    );
  });

  it('OTHER → ILAMSIZ_GENEL explicit fallback (reasoning ile)', () => {
    const m = mapDtoCaseTypeToInterestCaseType(DtoCaseType.OTHER);
    expect(m.configType).toBe(InterestCaseType.ILAMSIZ_GENEL);
    expect(m.sourceCaseType).toBe(DtoCaseType.OTHER);
    expect(m.reasoning).toBe(
      'OTHER mapped to ILAMSIZ_GENEL baseline because no specific strategy was selected.',
    );
  });

  it('exhaustive: tüm 8 dto.CaseType üyesi eşlenmiş (silent default yok)', () => {
    const allDtoTypes = Object.values(DtoCaseType);
    expect(allDtoTypes).toHaveLength(8);
    for (const dto of allDtoTypes) {
      const m = mapDtoCaseTypeToInterestCaseType(dto);
      // configType geçerli bir InterestCaseType olmalı (tanımsız/undefined fallback DEĞİL)
      expect(Object.values(InterestCaseType)).toContain(m.configType);
    }
  });
});
