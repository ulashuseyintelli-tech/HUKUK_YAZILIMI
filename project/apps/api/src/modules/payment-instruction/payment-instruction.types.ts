/**
 * Ödeme Talimatı Türleri ve Tipleri
 * 
 * İcra müdürlüğüne yapılacak ödemelerin yönlendirilmesi için kullanılır.
 * Her ödeme türü otomatik olarak doğru IBAN'a yönlendirilir.
 */

// Kim ödüyor?
export enum PayerType {
  DEBTOR = 'DEBTOR',           // Borçlu
  CREDITOR = 'CREDITOR',       // Alacaklı
  LAWYER = 'LAWYER',           // Vekil/Avukat
}

// Ödeme amacı - Bu seçime göre hedef hesap otomatik belirlenir
export enum PaymentPurpose {
  // Borçlu ödemeleri → Emanet hesabına (iban)
  DEBT_PAYMENT = 'DEBT_PAYMENT',                     // Borç ödemesi (ana para + faiz + vekalet + masraf)
  
  // Alacaklı/Vekil ödemeleri → Harç hesabına (ibanHarc)
  APPLICATION_FEE = 'APPLICATION_FEE',               // Başvurma harcı
  ADVANCE_FEE = 'ADVANCE_FEE',                       // Peşin harç
  COLLECTION_FEE = 'COLLECTION_FEE',                 // Tahsil harcı
  NOTIFICATION_EXPENSE = 'NOTIFICATION_EXPENSE',     // Tebligat gideri
  SEIZURE_ADVANCE = 'SEIZURE_ADVANCE',               // Haciz avansı
  SALE_ADVANCE = 'SALE_ADVANCE',                     // Satış avansı
  EXPERT_ADVANCE = 'EXPERT_ADVANCE',                 // Bilirkişi/ekspertiz avansı
  OTHER_EXPENSE = 'OTHER_EXPENSE',                   // Diğer masraf/gider
  
  // Cezaevi harcı → Cezaevi hesabına (ibanCezaevi)
  PRISON_FEE = 'PRISON_FEE',                         // Cezaevi harcı (%2)
}

// Hedef hesap türü
export enum TargetAccountType {
  EMANET = 'EMANET',           // iban - Borçlu ödemeleri
  HARC = 'HARC',               // ibanHarc - Harç + Masraf ödemeleri
  CEZAEVI = 'CEZAEVI',         // ibanCezaevi - Cezaevi harcı
}

// Ödeme amacı -> Hedef hesap eşleştirmesi
export const PAYMENT_PURPOSE_TO_ACCOUNT: Record<PaymentPurpose, TargetAccountType> = {
  // Borçlu ödemeleri → Emanet
  [PaymentPurpose.DEBT_PAYMENT]: TargetAccountType.EMANET,
  
  // Harç ve masraflar → Harç hesabı
  [PaymentPurpose.APPLICATION_FEE]: TargetAccountType.HARC,
  [PaymentPurpose.ADVANCE_FEE]: TargetAccountType.HARC,
  [PaymentPurpose.COLLECTION_FEE]: TargetAccountType.HARC,
  [PaymentPurpose.NOTIFICATION_EXPENSE]: TargetAccountType.HARC,
  [PaymentPurpose.SEIZURE_ADVANCE]: TargetAccountType.HARC,
  [PaymentPurpose.SALE_ADVANCE]: TargetAccountType.HARC,
  [PaymentPurpose.EXPERT_ADVANCE]: TargetAccountType.HARC,
  [PaymentPurpose.OTHER_EXPENSE]: TargetAccountType.HARC,
  
  // Cezaevi harcı → Cezaevi hesabı
  [PaymentPurpose.PRISON_FEE]: TargetAccountType.CEZAEVI,
};

// Ödeme amacı Türkçe etiketleri
export const PAYMENT_PURPOSE_LABELS: Record<PaymentPurpose, string> = {
  [PaymentPurpose.DEBT_PAYMENT]: 'Borç Ödemesi',
  [PaymentPurpose.APPLICATION_FEE]: 'Başvurma Harcı',
  [PaymentPurpose.ADVANCE_FEE]: 'Peşin Harç',
  [PaymentPurpose.COLLECTION_FEE]: 'Tahsil Harcı',
  [PaymentPurpose.NOTIFICATION_EXPENSE]: 'Tebligat Gideri',
  [PaymentPurpose.SEIZURE_ADVANCE]: 'Haciz Avansı',
  [PaymentPurpose.SALE_ADVANCE]: 'Satış Avansı',
  [PaymentPurpose.EXPERT_ADVANCE]: 'Bilirkişi Avansı',
  [PaymentPurpose.OTHER_EXPENSE]: 'Diğer Masraf',
  [PaymentPurpose.PRISON_FEE]: 'Cezaevi Harcı',
};

// Ödeme talimatı oluşturma isteği
export interface CreatePaymentInstructionDto {
  caseId: string;
  payerType: PayerType;
  purpose: PaymentPurpose;
  amount: number;
  payerName?: string;        // Borçlu adı (borçlu ödemesinde)
  description?: string;      // Ek açıklama
}

// Ödeme talimatı yanıtı
export interface PaymentInstructionResult {
  // Hedef hesap bilgileri
  bankName: string;
  iban: string;
  ibanFormatted: string;     // TR00 0000 0000 ... formatında
  
  // Açıklama şablonu
  description: string;
  
  // Dosya bilgileri
  executionOfficeName: string;
  executionFileNumber: string;
  
  // Ödeme detayları
  amount: number;
  purpose: PaymentPurpose;
  purposeLabel: string;
  
  // Uyarılar
  warnings?: string[];
}
