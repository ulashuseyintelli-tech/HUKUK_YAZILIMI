import { FormMetadata, FormCategoryConfig } from '@/types/form-metadata';

export const formCategories: FormCategoryConfig[] = [
  { code: 'GENEL_ICRA', label: 'Genel İcra', icon: 'FileText' },
  { code: 'KAMBIYO', label: 'Kambiyo', icon: 'Receipt' },
  { code: 'IPOTEK_REHIN', label: 'İpotek / Rehin', icon: 'Building' },
  { code: 'IFLAS', label: 'İflas', icon: 'AlertTriangle' },
  { code: 'KIRA', label: 'Kira', icon: 'Home' },
];

export const formMetadata: FormMetadata[] = [
  // GENEL İCRA
  {
    code: 'FORM_7',
    name: 'Form 7',
    title: 'İlamsız İcra Takibi',
    description: 'İlamsız İcra (49)',
    category: 'GENEL_ICRA',
    uyapCode: '49',
    iikMaddesi: 'İİK m. 42-49',
    usageScenario: 'Fatura, sözleşme, cari hesap, yazılı belge – kambiyo senedi değil – ilam yok.',
    exampleCase: "X A.Ş.'nin Y Ltd.'ye kestiği fatura alacağının tahsili",
    requiredDocuments: ['fatura', 'sözleşme', 'cari_hesap_ekstresi'],
    hasJudgment: false,
    needsMortgage: false,
    isKambiyo: false,
    isRental: false,
  },
  {
    code: 'FORM_2_3_4_5',
    name: 'Form 2-3-4-5',
    title: 'İlamlı İcra Takibi',
    description: 'İlamlı İcra (53-54-55)',
    category: 'GENEL_ICRA',
    uyapCode: '53-54-55',
    iikMaddesi: 'İİK m. 32-38',
    usageScenario: 'Mahkeme kararı / hakem kararı / ilam niteliğinde belgeye dayalı para veya teminat alacağı.',
    exampleCase: 'Kesinleşmiş mahkeme kararına dayalı tazminat alacağının tahsili',
    requiredDocuments: ['ilam', 'kesinlesme_serhi', 'vekaletname'],
    hasJudgment: true,
    needsMortgage: false,
    isKambiyo: false,
    isRental: false,
    subForms: [
      { code: 'FORM_5_ALACAK', name: 'Form 5', title: 'İlamlı Para Alacağı', uyapCode: '53', usageScenario: 'Mahkeme kararına dayalı para alacağının tahsili (tazminat, alacak hükmü)' },
      { code: 'FORM_5_NAFAKA', name: 'Form 5', title: 'İlamlı Nafaka', uyapCode: '53', usageScenario: 'Nafaka kararına dayalı aylık nafaka alacağının tahsili' },
      { code: 'FORM_5_DOVIZ', name: 'Form 5', title: 'İlamlı Döviz Alacağı', uyapCode: '53', usageScenario: 'Yabancı para cinsinden hükmedilmiş alacağın tahsili' },
      { code: 'FORM_2_5_TAHLIYE', name: 'Form 2-5', title: 'İlamlı Tahliye', uyapCode: '53-54', usageScenario: 'Mahkeme kararına dayalı tahliye işlemi' },
      { code: 'FORM_2_5_TASINIR', name: 'Form 2-5', title: 'İlamlı Taşınır Teslimi', uyapCode: '53-54', usageScenario: 'Taşınır mal teslimi kararının icrası' },
      { code: 'FORM_2_5_TASINMAZ', name: 'Form 2-5', title: 'İlamlı Taşınmaz Tahliye ve Teslimi', uyapCode: '53-54', usageScenario: 'Taşınmaz tahliye ve teslim kararının icrası' },
      { code: 'FORM_4_IS', name: 'Form 4', title: 'İlamlı İşin Yapılması', uyapCode: '53', usageScenario: 'Bir işin yapılması veya yapılmaması kararının icrası' },
      { code: 'FORM_4_IRTIFAK', name: 'Form 4', title: 'İlamlı İrtifak Hakkı', uyapCode: '53', usageScenario: 'İrtifak hakkı tesisi kararının icrası' },
      { code: 'FORM_5_TEMINAT', name: 'Form 5', title: 'İlamlı Teminat', uyapCode: '53', usageScenario: 'Teminat alacağının tahsili' },
      // DEPRECATED: Çocuk Teslimi - 7253 sayılı Kanun ile kaldırıldı (28.07.2020)
      // { code: 'FORM_3_5_COCUK', name: 'Form 3-5', title: 'Çocuk Teslimi', uyapCode: '53-55', usageScenario: 'Çocuk teslimi kararının icrası', isDeprecated: true },
    ],
  },

  // KAMBIYO
  {
    code: 'FORM_10',
    name: 'Form 10',
    title: 'Kambiyo Senedine Dayalı Takip',
    description: 'Kambiyo Senetleri (163)',
    category: 'KAMBIYO',
    uyapCode: '163',
    iikMaddesi: 'İİK m. 167-176',
    usageScenario: 'Bono / poliçe / çek alacağının tahsili – özel kambiyo takibi.',
    exampleCase: "Vadesi geçmiş 100.000 TL'lik bono alacağının tahsili",
    requiredDocuments: ['kambiyo_senedi_aslı', 'protesto', 'vekaletname'],
    hasJudgment: false,
    needsMortgage: false,
    isKambiyo: true,
    isRental: false,
    // PR-3: Kambiyo senedi türünü (çek/bono/poliçe) manuel akışta SOR. Tek kart çek+bono+poliçe'yi
    // birleştirdiği için seçince doğrudan 2. adıma geçmek yerine alt-kırılım açılır (İlamlı ile aynı
    // pattern, FormCard değişmeden). Çek/senet ayrımı mahiyet (CEK vs SENET) + faiz/vade için kritik.
    // İflas yoluyla kambiyo AYRI form (FORM_12) olduğu için burada yer almaz.
    subForms: [
      { code: 'FORM_10_CEK', name: 'Form 10', title: 'Çek', uyapCode: '163', usageScenario: 'Çeke dayalı kambiyo takibi — çekte vade yoktur, keşide tarihi esas alınır' },
      { code: 'FORM_10_BONO', name: 'Form 10', title: 'Bono / Emre Muharrer Senet', uyapCode: '163', usageScenario: 'Bono (emre muharrer senet) alacağının kambiyo takibi — vade tarihli' },
      { code: 'FORM_10_POLICE', name: 'Form 10', title: 'Poliçe', uyapCode: '163', usageScenario: 'Poliçeye dayalı kambiyo takibi' },
    ],
  },
  {
    code: 'FORM_12',
    name: 'Form 12',
    title: 'İflas Yoluyla Kambiyo Takibi',
    description: 'İflas Kambiyo Senetleri (152)',
    category: 'KAMBIYO',
    uyapCode: '152',
    iikMaddesi: 'İİK m. 167, 171',
    usageScenario: 'Kambiyo senedine dayalı iflas yoluyla takip.',
    exampleCase: 'Tacir borçluya karşı çek alacağı için iflas takibi',
    requiredDocuments: ['kambiyo_senedi_aslı', 'ticaret_sicil_kaydı'],
    hasJudgment: false,
    needsMortgage: false,
    isKambiyo: true,
    isRental: false,
  },

  // İPOTEK / REHİN
  {
    code: 'FORM_6',
    name: 'Form 6',
    title: 'İpotekli İlamlı Takip',
    description: 'İpotek İlamlı (151)',
    category: 'IPOTEK_REHIN',
    uyapCode: '151',
    iikMaddesi: 'İİK m. 149-150',
    usageScenario: 'İpotek akit tablosuna veya ilama dayalı ipotek alacağının tahsili.',
    exampleCase: 'Banka kredisi için tesis edilen ipotek alacağının tahsili',
    requiredDocuments: ['ipotek_akit_tablosu', 'ilam', 'tapu_kaydı'],
    hasJudgment: true,
    needsMortgage: true,
    isKambiyo: false,
    isRental: false,
  },
  {
    code: 'FORM_9',
    name: 'Form 9',
    title: 'İpotekli İlamsız Takip',
    description: 'İpotek İlamsız (152)',
    category: 'IPOTEK_REHIN',
    uyapCode: '152',
    iikMaddesi: 'İİK m. 148',
    usageScenario: 'İpotek akit tablosuna dayalı (ilamsız) ipotek alacağının tahsili.',
    exampleCase: 'Vadesi gelmiş ipotek alacağının ilamsız takibi',
    requiredDocuments: ['ipotek_akit_tablosu', 'hesap_özeti', 'tapu_kaydı'],
    hasJudgment: false,
    needsMortgage: true,
    isKambiyo: false,
    isRental: false,
  },
  {
    code: 'FORM_8',
    name: 'Form 8',
    title: 'Taşınır Rehni Takibi',
    description: 'Taşınır Rehni (50)',
    category: 'IPOTEK_REHIN',
    uyapCode: '50',
    iikMaddesi: 'İİK m. 145-147',
    usageScenario: 'Taşınır rehni (ticari işletme rehni, araç rehni vb.) alacağının tahsili.',
    exampleCase: 'Araç rehni karşılığı verilen kredi alacağının tahsili',
    requiredDocuments: ['rehin_sözleşmesi', 'sicil_kaydı'],
    hasJudgment: false,
    needsMortgage: true,
    isKambiyo: false,
    isRental: false,
  },
  {
    code: 'FORM_44',
    name: 'Form 44',
    title: 'Taşınır Rehni İlamlı Takip',
    description: 'Taşınır Rehni İlamlı (201)',
    category: 'IPOTEK_REHIN',
    uyapCode: '201',
    iikMaddesi: 'İİK m. 145-147, 32-38',
    usageScenario: 'İlama dayalı taşınır rehni alacağının tahsili.',
    exampleCase: 'Mahkeme kararına dayalı rehinli alacağın tahsili',
    requiredDocuments: ['ilam', 'rehin_sözleşmesi', 'sicil_kaydı'],
    hasJudgment: true,
    needsMortgage: true,
    isKambiyo: false,
    isRental: false,
  },

  // İFLAS
  {
    code: 'FORM_11',
    name: 'Form 11',
    title: 'İflas Adi Takip',
    description: 'İflas Adı Takip (153)',
    category: 'IFLAS',
    uyapCode: '153',
    iikMaddesi: 'İİK m. 154-166',
    usageScenario: 'Tacir borçluya karşı adi alacak için iflas yoluyla takip.',
    exampleCase: 'Ticaret şirketine karşı fatura alacağı için iflas takibi',
    requiredDocuments: ['alacak_belgesi', 'ticaret_sicil_kaydı'],
    hasJudgment: false,
    needsMortgage: false,
    isKambiyo: false,
    isRental: false,
  },

  // KİRA
  {
    code: 'FORM_13',
    name: 'Form 13',
    title: 'Kira Alacağı Takibi',
    description: 'Kira Alacakları (51)',
    category: 'KIRA',
    uyapCode: '51',
    iikMaddesi: 'İİK m. 269-269/d',
    usageScenario: 'Kira sözleşmesine dayalı kira borçlarının tahsili – konut/işyeri.',
    exampleCase: '3 aylık birikmiş kira alacağının tahsili',
    requiredDocuments: ['kira_sözleşmesi', 'ihtarname'],
    hasJudgment: false,
    needsMortgage: false,
    isKambiyo: false,
    isRental: true,
  },
  {
    code: 'FORM_14',
    name: 'Form 14',
    title: 'Tahliye Takibi',
    description: 'Tahliye (56)',
    category: 'KIRA',
    uyapCode: '56',
    iikMaddesi: 'İİK m. 272-276',
    usageScenario: 'Kira sözleşmesi sona ermiş kiracının tahliyesi.',
    exampleCase: 'Kira süresi dolan kiracının tahliye takibi',
    requiredDocuments: ['kira_sözleşmesi', 'fesih_ihtarnamesi'],
    hasJudgment: false,
    needsMortgage: false,
    isKambiyo: false,
    isRental: true,
  },
];

// Sık kullanılan formlar (varsayılan)
export const frequentFormCodes = ['FORM_7', 'FORM_10', 'FORM_13'];

// Form koduna göre metadata getir
export function getFormByCode(code: string): FormMetadata | undefined {
  return formMetadata.find((f) => f.code === code);
}

// Kategoriye göre formları filtrele
export function filterFormsByCategory(category: string | null): FormMetadata[] {
  if (!category || category === 'ALL') return formMetadata;
  return formMetadata.filter((f) => f.category === category);
}

// Formları kategoriye göre grupla
export function groupFormsByCategory(): Record<string, FormMetadata[]> {
  return formMetadata.reduce((acc, form) => {
    if (!acc[form.category]) acc[form.category] = [];
    acc[form.category].push(form);
    return acc;
  }, {} as Record<string, FormMetadata[]>);
}
