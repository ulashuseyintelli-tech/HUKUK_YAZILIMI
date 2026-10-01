/**
 * K3-L KP-2 (owner kararı 2026-10-01) — dosya faiz türünün KAYNAĞI.
 *
 * Yeni dosyada kullanıcı seçmeden YASAL faiz kesin tercih kabul edilmez; açık seçim istenir. Sunucu dosya açılışında
 * türün açıkça istekte gelip gelmediğini `Case.metadata.interestTypeSource` alanına yazar:
 *  - REQUEST_EXPLICIT: tür istekte açıkça geldi (sihirbaz yalnız kullanıcı seçtiğinde gönderir);
 *  - SYSTEM_DEFAULT: istekte tür yoktu, şema varsayılanı (YASAL) uygulandı.
 * Kaydı olmayan eski dosyada kaynak BİLİNMİYOR (null). Mevcut dosyaların faiz türü DEĞİŞTİRİLMEZ; kaynağı doğrulanamayan
 * eski YASAL varsayılanı uyarıyla gösterilir, geçersiz sayılmaz. Bu, yeni bir yasal oran ya da yürürlük onayı değildir.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - CaseService.create() → açılışta kaynak yazımı
 * - CaseService.getCalculationSummary() → `dosyaFaizTuru` uyarısı
 * - CaseBalanceService.computeCaseBalance() → assembler dosya düzeyi faiz türü uyarısı
 * - TemplateEngineService.determineInterestInfo() → açık seçilmiş YASAL şablonda ezilmez (TK-13)
 * </remarks>
 */
export type CaseInterestTypeSource = 'REQUEST_EXPLICIT' | 'SYSTEM_DEFAULT';

const SOURCES: ReadonlySet<string> = new Set<CaseInterestTypeSource>(['REQUEST_EXPLICIT', 'SYSTEM_DEFAULT']);

/** Dosya açılışında yazılacak kaynak: tür istekte açıkça geldiyse REQUEST_EXPLICIT, yoksa SYSTEM_DEFAULT. */
export function caseInterestTypeSourceForCreate(requestedInterestType: unknown): CaseInterestTypeSource {
  return typeof requestedInterestType === 'string' && requestedInterestType.trim() !== '' ? 'REQUEST_EXPLICIT' : 'SYSTEM_DEFAULT';
}

/** `Case.metadata`'dan kaynağı okur; kayıt yoksa/tanınmazsa null (eski dosya: bilinmiyor). */
export function readCaseInterestTypeSource(metadata: unknown): CaseInterestTypeSource | null {
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).interestTypeSource;
  return typeof value === 'string' && SOURCES.has(value) ? (value as CaseInterestTypeSource) : null;
}

/** Dosya faiz türü kullanıcı/istek tarafından açıkça mı verildi? */
export function isExplicitCaseInterestType(metadata: unknown): boolean {
  return readCaseInterestTypeSource(metadata) === 'REQUEST_EXPLICIT';
}

/**
 * Kaynağı doğrulanamayan YASAL mı? (eski varsayılan olabilir) — yalnız YASAL için: şema varsayılanı YASAL'dır; başka
 * türler varsayılandan gelemez.
 */
export function isUnconfirmedDefaultLegalInterest(interestType: unknown, metadata: unknown): boolean {
  return interestType === 'YASAL' && !isExplicitCaseInterestType(metadata);
}
