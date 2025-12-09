/**
 * Form Metadata Types
 * İcra takip formları için metadata yapısı
 */

export type FormCategory = 'GENEL_ICRA' | 'KAMBIYO' | 'IPOTEK_REHIN' | 'IFLAS' | 'KIRA';

export interface SubFormMetadata {
  code: string;
  name: string;
  title: string;
  uyapCode: string;
  usageScenario: string;
}

export interface FormMetadata {
  code: string;
  name: string;
  title: string;
  description: string;
  category: FormCategory;
  uyapCode: string;
  iikMaddesi: string;
  usageScenario: string;
  exampleCase: string;
  requiredDocuments: string[];
  hasJudgment: boolean;
  needsMortgage: boolean;
  isKambiyo: boolean;
  isRental: boolean;
  subForms?: SubFormMetadata[];
}

export interface FormCategoryConfig {
  code: FormCategory;
  label: string;
  icon: string;
}

export interface FormUsageHistory {
  formCode: string;
  usageCount: number;
  lastUsedAt: string;
}
