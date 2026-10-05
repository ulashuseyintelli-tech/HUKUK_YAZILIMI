import 'reflect-metadata';
import { TAKIP_TURU_CATALOG } from '../../lookup/lookup-catalog';
import { FEE_PROFILE_CASE_TYPE_BY_TAKIP_TURU, TAKIP_TURU_CODES_WITHOUT_FEE_PROFILE } from '../fee-case-type';
import { FeeEngineService } from '../fee-engine.service';

/**
 * Takip türü kodu → masraf profili eşlemesi (tek kaynak) — katalog uyumu ve gerçek profil dosyası.
 *
 * Ölçülen kusur: lookup kataloğundaki 11 takip türü kodunun HİÇBİRİ masraf profilinin `applies_to_case_types` değeriyle
 * eşleşmiyordu; bilinmeyen kod sessizce "harç yok" üretiyordu. Bu spec eşlemenin katalogla ve gerçek `fee-profiles.yaml` ile
 * kayma yapmasını engeller.
 */
describe('fee-case-type — takip türü → masraf profili eşlemesi', () => {
  const catalogCodes = TAKIP_TURU_CATALOG.map((item) => item.code);

  it('katalog boş değil (bu test BAKTIĞI öğe sayısını kanıtlar)', () => {
    expect(catalogCodes.length).toBeGreaterThanOrEqual(11);
  });

  it('katalogdaki HER takip türü kodu tam olarak bir listede: eşlenmiş YA DA açıkça "profili yok"', () => {
    const mapped = Object.keys(FEE_PROFILE_CASE_TYPE_BY_TAKIP_TURU);
    for (const code of catalogCodes) {
      const inMap = mapped.includes(code);
      const inNoProfile = TAKIP_TURU_CODES_WITHOUT_FEE_PROFILE.includes(code);
      expect({ code, inMap, inNoProfile, tamOlarakBiri: inMap !== inNoProfile }).toEqual({
        code,
        inMap,
        inNoProfile,
        tamOlarakBiri: true,
      });
    }
  });

  it('eşlemede katalogda olmayan (yetim) kod yok', () => {
    for (const code of [...Object.keys(FEE_PROFILE_CASE_TYPE_BY_TAKIP_TURU), ...TAKIP_TURU_CODES_WITHOUT_FEE_PROFILE]) {
      expect(catalogCodes).toContain(code);
    }
  });

  describe('gerçek fee-profiles.yaml', () => {
    let service: FeeEngineService;

    beforeAll(async () => {
      service = new FeeEngineService({ getTariff: () => null, getActiveTariff: () => null } as any);
      await service.onModuleInit();
    });

    it.each(Object.entries(FEE_PROFILE_CASE_TYPE_BY_TAKIP_TURU))(
      '%s → %s: masraf profili VAR (eşleme boşa gitmez)',
      (takipTuruCode, profileCaseType) => {
        expect(service.resolveFeeCaseType(takipTuruCode, undefined)).toEqual({ caseType: profileCaseType });
      },
    );

    it('profili olmayan takip türü: sessiz 0 değil, açık hata', () => {
      for (const code of TAKIP_TURU_CODES_WITHOUT_FEE_PROFILE) {
        expect(service.resolveFeeCaseType(code, undefined)).toMatchObject({ error: { code: 'CASE_TYPE_UNRESOLVED' } });
      }
    });

    it('KALEM TÜRÜ takip türü değildir: eşleşmez, hata', () => {
      for (const kalemTuru of ['ASIL_ALACAK', 'FATURA', 'CEK', 'SENET', 'ILAM', 'AIDAT', 'KREDI', 'NAFAKA', 'IPOTEK', 'BANKA']) {
        expect(service.resolveFeeCaseType(undefined, kalemTuru)).toMatchObject({ error: { code: 'CASE_TYPE_UNRESOLVED' } });
      }
    });

    it('takip türü kodu varsa o esastır: kod çözülemezse caseType ile KURTARILMAZ', () => {
      expect(service.resolveFeeCaseType('NAFAKA', 'ILAMSIZ')).toMatchObject({ error: { code: 'CASE_TYPE_UNRESOLVED' } });
      expect(service.resolveFeeCaseType('YOK_BOYLE_BIR_KOD', 'ILAMSIZ')).toMatchObject({ error: { code: 'CASE_TYPE_UNRESOLVED' } });
    });

    it('doğrudan profil kodu (caseType) geçerli; boş / yalnız boşluk bildirilmemiş sayılır', () => {
      expect(service.resolveFeeCaseType(undefined, 'KIRA')).toEqual({ caseType: 'KIRA' });
      expect(service.resolveFeeCaseType('  ', ' ILAMLI ')).toEqual({ caseType: 'ILAMLI' });
      expect(service.resolveFeeCaseType(undefined, '')).toMatchObject({ error: { code: 'CASE_TYPE_UNRESOLVED' } });
      expect(service.resolveFeeCaseType(undefined, undefined)).toMatchObject({ error: { code: 'CASE_TYPE_UNRESOLVED' } });
    });
  });
});
