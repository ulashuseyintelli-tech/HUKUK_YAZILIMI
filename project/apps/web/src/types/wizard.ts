/**
 * Wizard Types
 * Form sihirbazı için state ve soru yapıları
 */

export interface WizardAnswers {
  hasJudgment: boolean | null;
  isKambiyo: boolean | null;
  hasMortgage: boolean | null;
  isRental: boolean | null;
}

export interface WizardState {
  currentStep: number;
  answers: WizardAnswers;
  isComplete: boolean;
  showAllForms: boolean;
}

export interface WizardOption {
  value: boolean;
  label: string;
}

export interface WizardQuestion {
  id: keyof WizardAnswers;
  question: string;
  description: string;
  options: WizardOption[];
}

export const wizardQuestions: WizardQuestion[] = [
  {
    id: 'hasJudgment',
    question: 'Elinde mahkeme kararı veya ilam var mı?',
    description: 'Kesinleşmiş mahkeme kararı, hakem kararı veya ilam niteliğinde belge',
    options: [
      { value: true, label: 'Evet, ilam var' },
      { value: false, label: 'Hayır, ilam yok' },
    ],
  },
  {
    id: 'isKambiyo',
    question: 'Alacak kambiyo senedine mi dayanıyor?',
    description: 'Bono, poliçe veya çek',
    options: [
      { value: true, label: 'Evet, kambiyo senedi var' },
      { value: false, label: 'Hayır, kambiyo senedi yok' },
    ],
  },
  {
    id: 'hasMortgage',
    question: 'Alacak ipotek veya rehne mi dayanıyor?',
    description: 'Taşınmaz ipoteği veya taşınır rehni',
    options: [
      { value: true, label: 'Evet, ipotek/rehin var' },
      { value: false, label: 'Hayır, ipotek/rehin yok' },
    ],
  },
  {
    id: 'isRental',
    question: 'Takip konusu kira ile mi ilgili?',
    description: 'Kira alacağı veya tahliye',
    options: [
      { value: true, label: 'Evet, kira ile ilgili' },
      { value: false, label: 'Hayır, kira ile ilgili değil' },
    ],
  },
];

export const initialWizardState: WizardState = {
  currentStep: 0,
  answers: {
    hasJudgment: null,
    isKambiyo: null,
    hasMortgage: null,
    isRental: null,
  },
  isComplete: false,
  showAllForms: false,
};
