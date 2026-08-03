/**
 * C3-B01 — KVKK İŞLEME DAYANAĞI REGISTRY'Sİ (md.5) — VERSİYONLU STATİK KAYIT.
 *
 * Owner ratifikasyonu: decision-log 2026-08-03 "CLIENT-C3 §13/5 RATIFIED (K5.1-K5.5)".
 * Model C-HİBRİT'in statik yarısı: md.5/2 dayanakları bu registry'de; md.5/1 açık rıza
 * gerektiren faaliyetler müvekkil-bazlı ClientConsent kaydıyla (client-consent.service.ts).
 *
 * KURAL (ratifiye): Bu registry'de hukuki dayanağı bulunmayan faaliyet RED (fail-closed).
 * Bu dosyaya owner ratifikasyonu olmadan yeni faaliyet/bent EKLENMEZ — implementation-layer
 * policy invention YASAKTIR. Eşleme değişikliği yalnız yeni decision-log kaydıyla yapılır
 * ve REGISTRY_VERSION artırılır.
 */

/** Ratifiye faaliyet envanteri (K5.1) — kapalı liste. */
export const CLIENT_PROCESSING_ACTIVITIES = [
  'IDENTITY_AND_CONTACT_MANAGEMENT', // kimlik ve iletişim yönetimi
  'ENGAGEMENT_AND_RELATIONSHIP', // avukatlık sözleşmesi ve müvekkil ilişkisi
  'MANDATE_AND_REPRESENTATION', // vekâlet ve temsil
  'LEGAL_PROCEEDINGS_EXECUTION', // dava, takip ve hukuki işlem yürütme
  'PORTAL_ACCESS', // portal erişimi
  'ACCOUNTING_AND_STATUTORY_RECORDS', // muhasebe ve yasal kayıtlar
  'SECURITY_AND_AUDIT', // güvenlik ve audit
  'UYAP_TRANSFER', // UYAP aktarımı
  'GREETING_AND_OPTIONAL_COMMUNICATION', // tebrik, kutlama ve isteğe bağlı iletişimler
] as const;

export type ClientProcessingActivity = (typeof CLIENT_PROCESSING_ACTIVITIES)[number];

/** KVKK md.5 bent kodları (yalnız ratifiye eşlemede kullanılanlar). */
export type ClientLegalBasisCode =
  | 'MD_5_1_ACIK_RIZA'
  | 'MD_5_2_C' // bir sözleşmenin kurulması/ifasıyla doğrudan ilgili olma
  | 'MD_5_2_CH' // veri sorumlusunun hukuki yükümlülüğü (ç bendi)
  | 'MD_5_2_E' // bir hakkın tesisi, kullanılması veya korunması
  | 'MD_5_2_F'; // meşru menfaat (gereklilik ve menfaat dengesi kaydıyla)

export interface ClientProcessingBasisEntry {
  activity: ClientProcessingActivity;
  /** Birincil dayanak (ratifiye K5.2). */
  primaryBasis: ClientLegalBasisCode;
  /** Koşullu ek dayanak: somut yasal yükümlülük varsa (K5.2 vekâlet/dava/UYAP satırı). */
  conditionalAdditionalBasis?: ClientLegalBasisCode;
  /** md.5/1 açık rıza şartı — TRUE ise ClientConsent kaydı olmadan faaliyet RED. */
  requiresExplicitConsent: boolean;
  /** Owner kaydındaki koşul/şerh (varsa) — hukuki değerlendirme owner'ındır. */
  ownerNote?: string;
}

/**
 * Registry sürümü: eşleme yalnız yeni owner ratifikasyonuyla değişir ve bu sayı artar.
 * v1 = decision-log 2026-08-03 §13/5 kaydı (C3-B00 AŞAMA 2).
 */
export const CLIENT_PROCESSING_BASIS_REGISTRY_VERSION = 1;

const REGISTRY: Record<ClientProcessingActivity, ClientProcessingBasisEntry> = {
  IDENTITY_AND_CONTACT_MANAGEMENT: {
    activity: 'IDENTITY_AND_CONTACT_MANAGEMENT',
    primaryBasis: 'MD_5_2_C',
    requiresExplicitConsent: false,
  },
  ENGAGEMENT_AND_RELATIONSHIP: {
    activity: 'ENGAGEMENT_AND_RELATIONSHIP',
    primaryBasis: 'MD_5_2_C',
    requiresExplicitConsent: false,
  },
  MANDATE_AND_REPRESENTATION: {
    activity: 'MANDATE_AND_REPRESENTATION',
    primaryBasis: 'MD_5_2_E',
    conditionalAdditionalBasis: 'MD_5_2_CH',
    requiresExplicitConsent: false,
    ownerNote: 'Somut yasal yükümlülük varsa ayrıca md.5/2-ç uygulanır.',
  },
  LEGAL_PROCEEDINGS_EXECUTION: {
    activity: 'LEGAL_PROCEEDINGS_EXECUTION',
    primaryBasis: 'MD_5_2_E',
    conditionalAdditionalBasis: 'MD_5_2_CH',
    requiresExplicitConsent: false,
    ownerNote: 'Somut yasal yükümlülük varsa ayrıca md.5/2-ç uygulanır.',
  },
  PORTAL_ACCESS: {
    activity: 'PORTAL_ACCESS',
    primaryBasis: 'MD_5_2_C',
    requiresExplicitConsent: false,
  },
  ACCOUNTING_AND_STATUTORY_RECORDS: {
    activity: 'ACCOUNTING_AND_STATUTORY_RECORDS',
    primaryBasis: 'MD_5_2_CH',
    requiresExplicitConsent: false,
  },
  SECURITY_AND_AUDIT: {
    activity: 'SECURITY_AND_AUDIT',
    primaryBasis: 'MD_5_2_F',
    requiresExplicitConsent: false,
    ownerNote: 'Gereklilik ve menfaat dengesi kaydıyla (K5.2).',
  },
  UYAP_TRANSFER: {
    activity: 'UYAP_TRANSFER',
    primaryBasis: 'MD_5_2_E',
    conditionalAdditionalBasis: 'MD_5_2_CH',
    requiresExplicitConsent: false,
    ownerNote:
      'Somut yasal yükümlülük varsa ayrıca md.5/2-ç. Aktarım kapısının kendisi §13/10 (C3-B06): geçerli POA + kayıtlı dayanak, fail-closed.',
  },
  GREETING_AND_OPTIONAL_COMMUNICATION: {
    activity: 'GREETING_AND_OPTIONAL_COMMUNICATION',
    primaryBasis: 'MD_5_1_ACIK_RIZA',
    requiresExplicitConsent: true,
    ownerNote:
      'Tebrik, kutlama, pazarlama ve zorunlu olmayan iletişimler: geçerli opt-in yoksa RED; tüm varsayılanlar FALSE (K5.3).',
  },
};

export interface ClientProcessingBasisDecision {
  allowed: boolean;
  entry?: ClientProcessingBasisEntry;
  reasonCode: 'BASIS_PRESENT' | 'NO_LEGAL_BASIS_REGISTERED' | 'EXPLICIT_CONSENT_REQUIRED';
}

/** Kayıtlı dayanağı döndürür; bilinmeyen faaliyet → undefined (fail-closed karar aşağıda). */
export function resolveClientProcessingBasis(
  activity: string,
): ClientProcessingBasisEntry | undefined {
  return (REGISTRY as Record<string, ClientProcessingBasisEntry>)[activity];
}

/**
 * FAIL-CLOSED karar (K5.5): registry'de dayanağı olmayan faaliyet RED.
 * requiresExplicitConsent faaliyetlerinde bu fonksiyon TEK BAŞINA yeterli DEĞİLDİR —
 * çağıran, müvekkil-bazlı geçerli opt-in kaydını (ClientConsent) ayrıca doğrulamak
 * ZORUNDADIR; bu ayrımı görünür kılmak için reasonCode EXPLICIT_CONSENT_REQUIRED döner.
 */
export function decideClientProcessingBasis(activity: string): ClientProcessingBasisDecision {
  const entry = resolveClientProcessingBasis(activity);
  if (!entry) {
    return { allowed: false, reasonCode: 'NO_LEGAL_BASIS_REGISTERED' };
  }
  if (entry.requiresExplicitConsent) {
    return { allowed: false, entry, reasonCode: 'EXPLICIT_CONSENT_REQUIRED' };
  }
  return { allowed: true, entry, reasonCode: 'BASIS_PRESENT' };
}
