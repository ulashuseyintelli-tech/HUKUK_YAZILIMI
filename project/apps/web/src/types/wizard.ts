/**
 * Form Wizard Types
 * Takip türü seçimi için sihirbaz yapısı
 */

export interface WizardQuestion {
  id: string;
  question: string;
  options: WizardOption[];
}

export interface WizardOption {
  value: string;
  label: string;
  description?: string;
  icon?: string;
}

export interface WizardState {
  currentStep: number;
  answers: Record<string, string>;
  isComplete: boolean;
}

export interface WizardAnswer {
  hasJudgment: boolean | null;      // İlam var mı?
  hasKambiyo: boolean | null;       // Kambiyo senedi var mı?
  hasMortgage: boolean | null;      // İpotek/Rehin var mı?
  isRental: boolean | null;         // Kira alacağı mı?
}

// Wizard soruları konfigürasyonu
export const wizardQuestions: WizardQuestion[] = [
  {
    id: 'hasJudgment',
    question: 'Mahkeme kararı (ilam) var mı?',
    options: [
      { value: 'yes', label: 'Evet', description: 'Kesinleşmiş mahkeme kararı veya ilam niteliğinde belge var', icon: 'Gavel' },
      { value: 'no', label: 'Hayır', description: 'Mahkeme kararı yok, alacak belgesi var', icon: 'FileText' },
    ],
  },
  {
    id: 'hasKambiyo',
    question: 'Alacak kambiyo senedine (çek/senet/poliçe) mi dayanıyor?',
    options: [
      { value: 'yes', label: 'Evet', description: 'Çek, bono veya poliçe alacağı', icon: 'Receipt' },
      { value: 'no', label: 'Hayır', description: 'Fatura, sözleşme veya diğer alacak', icon: 'FileText' },
    ],
  },
  {
    id: 'hasMortgage',
    question: 'Alacak ipotek veya rehinle teminat altında mı?',
    options: [
      { value: 'yes', label: 'Evet', description: 'İpotek veya taşınır rehni var', icon: 'Building' },
      { value: 'no', label: 'Hayır', description: 'Teminatsız alacak', icon: 'FileText' },
    ],
  },
  {
    id: 'isRental',
    question: 'Kira alacağı veya tahliye talebi mi?',
    options: [
      { value: 'yes', label: 'Evet', description: 'Kira borcu veya kiracı tahliyesi', icon: 'Home' },
      { value: 'no', label: 'Hayır', description: 'Diğer alacak türü', icon: 'FileText' },
    ],
  },
];

// Cevaplara göre önerilen form kodunu belirle
export function getRecommendedFormCode(answers: WizardAnswer): string {
  const { hasJudgment, hasKambiyo, hasMortgage, isRental } = answers;

  // Kira alacağı
  if (isRental === true) {
    return 'FORM_13'; // Kira Alacağı Takibi
  }

  // İpotek/Rehin
  if (hasMortgage === true) {
    if (hasJudgment === true) {
      return 'FORM_6'; // İpotekli İlamlı Takip
    }
    return 'FORM_9'; // İpotekli İlamsız Takip
  }

  // Kambiyo
  if (hasKambiyo === true) {
    return 'FORM_10'; // Kambiyo Senedine Dayalı Takip
  }

  // İlamlı
  if (hasJudgment === true) {
    return 'FORM_2_3_4_5'; // İlamlı İcra Takibi
  }

  // Varsayılan: İlamsız
  return 'FORM_7'; // İlamsız İcra Takibi
}

// Cevaplara göre uygun formları filtrele
export function filterFormsByWizardAnswers(
  forms: Array<{ code: string; hasJudgment: boolean; isKambiyo: boolean; needsMortgage: boolean; isRental: boolean }>,
  answers: WizardAnswer
): string[] {
  return forms
    .filter((form) => {
      // Kira filtresi
      if (answers.isRental === true && !form.isRental) return false;
      if (answers.isRental === false && form.isRental) return false;

      // Kambiyo filtresi
      if (answers.hasKambiyo === true && !form.isKambiyo) return false;
      if (answers.hasKambiyo === false && form.isKambiyo) return false;

      // İpotek/Rehin filtresi
      if (answers.hasMortgage === true && !form.needsMortgage) return false;
      if (answers.hasMortgage === false && form.needsMortgage) return false;

      // İlam filtresi
      if (answers.hasJudgment === true && !form.hasJudgment) return false;
      if (answers.hasJudgment === false && form.hasJudgment) return false;

      return true;
    })
    .map((form) => form.code);
}
