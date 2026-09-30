/**
 * Dosya açılışında sınıflandırma tutarlılığı — YALNIZ belgelenmiş, olgusal çelişki (owner GO 2026-09-30, madde 4).
 *
 * Mevcut sözleşmelerden çıkarılan kural:
 *  - Kambiyo alt formları belge türünü açıkça tanımlar (web `config/form-metadata.ts` FORM_10 alt formları):
 *    FORM_10_CEK = "Çeke dayalı kambiyo takibi"; FORM_10_BONO = bono / emre muharrer senet; FORM_10_POLICE = poliçe.
 *  - Takip türü kataloğu da belge türünü tanımlar (`lookup/lookup-catalog.ts`): KAMBIYO_CEK = "Çeke dayalı takip",
 *    KAMBIYO_SENET = "Senede dayalı takip" (poliçe şablon seçiminde de senet türüdür: template-case-classification).
 *  - İkisi de kambiyo yoludur; farklı belge türü (çek ↔ senet) birlikte OLAMAZ. Önceden şablon seçimi takip türünü
 *    öne aldığı için çek formlu dosyada SESSİZCE senet şablonu seçiliyordu. Hangisinin doğru olduğu tahmin EDİLMEZ →
 *    istek reddedilir, kullanıcı düzeltir.
 *
 * BİLİNÇLİ OLARAK DENETLENMEYEN (hukuki tercih ya da dayanaksız): çek/senet formu + kambiyo dışı takip türü (ör.
 * ilamsız genel haciz — owner kararı 2026-09-30: alacaklı çekle genel haciz yolunu seçebilir); `Case.type` (web onu
 * kategoriye göre VARSAYILAN olarak doldurur, belge türü kanıtı değildir); alt formu olmayan FORM_10; diğer form /
 * takip türü / mahiyet / takip yolu kombinasyonları (yasaklayıcı sözleşme yok).
 */

export type KambiyoDocumentKind = 'CEK' | 'SENET';

const DOCUMENT_KIND_BY_KAMBIYO_SUB_FORM: Readonly<Record<string, KambiyoDocumentKind>> = Object.freeze({
  FORM_10_CEK: 'CEK',
  FORM_10_BONO: 'SENET',
  FORM_10_POLICE: 'SENET',
});

const DOCUMENT_KIND_BY_TAKIP_TURU: Readonly<Record<string, KambiyoDocumentKind>> = Object.freeze({
  KAMBIYO_CEK: 'CEK',
  KAMBIYO_SENET: 'SENET',
});

const KIND_LABEL: Readonly<Record<KambiyoDocumentKind, string>> = Object.freeze({ CEK: 'çek', SENET: 'senet' });

/** Kambiyo alt formu belge türü (değilse null) — takip türü kodu yalnız bu durumda sorgulanır */
export function kambiyoDocumentKindOfSubForm(subType: string | null | undefined): KambiyoDocumentKind | null {
  return DOCUMENT_KIND_BY_KAMBIYO_SUB_FORM[String(subType ?? '')] ?? null;
}

/**
 * Çelişki varsa kararlı kod + Türkçe açıklama; yoksa null.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - CaseService.assertClassificationConsistent() → POST /cases (tx öncesi)
 * /// </remarks>
 */
export function findClassificationDocumentKindConflict(input: {
  readonly subType: string | null | undefined;
  readonly takipTuruCode: string | null | undefined;
}): { code: 'CASE_CLASSIFICATION_DOCUMENT_KIND_CONFLICT'; message: string } | null {
  const formKind = kambiyoDocumentKindOfSubForm(input.subType);
  const takipKind = DOCUMENT_KIND_BY_TAKIP_TURU[String(input.takipTuruCode ?? '')] ?? null;
  if (!formKind || !takipKind || formKind === takipKind) return null;
  return {
    code: 'CASE_CLASSIFICATION_DOCUMENT_KIND_CONFLICT',
    message:
      `Seçilen form ${KIND_LABEL[formKind]} takibi, takip türü ise ${KIND_LABEL[takipKind]} takibi; belge türü çelişiyor. ` +
      'Form ya da takip türünü düzeltin; takip oluşturulmadı.',
  };
}
