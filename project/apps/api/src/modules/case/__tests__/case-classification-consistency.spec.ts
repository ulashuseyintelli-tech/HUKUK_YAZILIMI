import { findClassificationDocumentKindConflict, kambiyoDocumentKindOfSubForm } from '../case-classification-consistency';

/**
 * Dosya açılışında yalnız belgelenmiş olgusal çelişki: kambiyo alt formu ↔ kambiyo takip türü belge türü (çek ↔ senet).
 * Uçtan uca kanıt: case-create-classification.http.db-gated.integration.spec.ts.
 */
describe('findClassificationDocumentKindConflict', () => {
  it.each([
    ['FORM_10_CEK', 'KAMBIYO_SENET'],
    ['FORM_10_BONO', 'KAMBIYO_CEK'],
    ['FORM_10_POLICE', 'KAMBIYO_CEK'],
  ])('%s + %s → çelişki (kararlı kod)', (subType, takipTuruCode) => {
    expect(findClassificationDocumentKindConflict({ subType, takipTuruCode })).toMatchObject({
      code: 'CASE_CLASSIFICATION_DOCUMENT_KIND_CONFLICT',
    });
  });

  it.each([
    ['FORM_10_CEK', 'KAMBIYO_CEK'],
    ['FORM_10_BONO', 'KAMBIYO_SENET'],
    ['FORM_10_POLICE', 'KAMBIYO_SENET'],
    // Hukuki tercih — DENETLENMEZ (owner kararı: çekle genel haciz yolu seçilebilir)
    ['FORM_10_CEK', 'ILAMSIZ_GENEL'],
    ['FORM_10_BONO', 'ILAMLI'],
    // Belge türü taşımayan form / takip türü yok
    ['FORM_10', 'KAMBIYO_SENET'],
    ['FORM_7', 'KAMBIYO_CEK'],
    [null, 'KAMBIYO_CEK'],
    ['FORM_10_CEK', null],
  ])('%s + %s → çelişki YOK', (subType, takipTuruCode) => {
    expect(findClassificationDocumentKindConflict({ subType, takipTuruCode })).toBeNull();
  });

  it('yalnız kambiyo alt formlarında takip türü kodu sorgulanır', () => {
    expect(kambiyoDocumentKindOfSubForm('FORM_10_CEK')).toBe('CEK');
    expect(kambiyoDocumentKindOfSubForm('FORM_10')).toBeNull();
    expect(kambiyoDocumentKindOfSubForm(undefined)).toBeNull();
  });
});
