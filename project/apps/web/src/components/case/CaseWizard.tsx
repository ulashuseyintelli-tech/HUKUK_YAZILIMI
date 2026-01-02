"use client";

import { Sparkles, Banknote, Home, Package, Briefcase, FileText, Shield, Building, Heart } from "lucide-react";

export type CaseSubCategoryType = "GENEL" | "NAFAKA" | "DOVIZ";
export type CurrencyType = "TRY" | "USD" | "EUR" | "GBP" | "CHF";
export type InterestRateType = "DEGISKEN" | "SABIT";
export type IlamliTakipType =
  | "PARA_ALACAGI"
  | "NAFAKA"
  | "TASINIR"
  | "TASINMAZ"
  | "TAHLIYE"
  | "IS_YAPILMASI"
  | "IRTIFAK"
  | "TEMINAT"
  | "IPOTEK"
  | "TASINIR_REHNI";

interface WizardResult {
  subCategory: CaseSubCategoryType;
  currency: CurrencyType;
  interestRateType: InterestRateType;
  interestDescription: string;
  recommendation: string;
  explanation: string;
  legalBasis?: string;
  tips?: string[];
  warnings?: string[];
  automationFeatures?: string[];
  ilamliTakipType?: IlamliTakipType;
  suggestedSubFormCode?: string;
}

interface CaseWizardProps {
  onComplete: (result: WizardResult) => void;
  onSkip: () => void;
}

// İlamlı takip türleri
const ilamliTakipTurleri = [
  {
    type: "PARA_ALACAGI" as IlamliTakipType,
    icon: Banknote,
    title: "İlamlı Para Alacağı",
    description: "Mahkeme kararına dayalı para alacağı (tazminat, alacak hükmü)",
    subFormCode: "FORM_5_ALACAK",
  },
  {
    type: "NAFAKA" as IlamliTakipType,
    icon: Heart,
    title: "İlamlı Nafaka",
    description: "Nafaka kararına dayalı aylık nafaka alacağının tahsili",
    subFormCode: "FORM_5_NAFAKA",
  },
  {
    type: "IPOTEK" as IlamliTakipType,
    icon: Building,
    title: "İlamlı İpotek",
    description: "İpotek akit tablosuna veya ilama dayalı ipotek alacağının tahsili",
    subFormCode: "FORM_6",
  },
  {
    type: "TASINIR_REHNI" as IlamliTakipType,
    icon: Package,
    title: "İlamlı Taşınır Rehni",
    description: "İlama dayalı taşınır rehni alacağının tahsili",
    subFormCode: "FORM_44",
  },
  {
    type: "TASINIR" as IlamliTakipType,
    icon: Package,
    title: "İlamlı Taşınır Teslimi",
    description: "Taşınır mal teslimi kararının icrası",
    subFormCode: "FORM_2_5_TASINIR",
  },
  {
    type: "TASINMAZ" as IlamliTakipType,
    icon: Home,
    title: "İlamlı Taşınmaz Tahliye ve Teslimi",
    description: "Taşınmaz tahliye ve teslim kararının icrası",
    subFormCode: "FORM_2_5_TASINMAZ",
  },
  {
    type: "TAHLIYE" as IlamliTakipType,
    icon: Home,
    title: "İlamlı Tahliye",
    description: "Mahkeme kararına dayalı tahliye işlemi",
    subFormCode: "FORM_2_5_TAHLIYE",
  },
  {
    type: "IS_YAPILMASI" as IlamliTakipType,
    icon: Briefcase,
    title: "İlamlı İşin Yapılması",
    description: "Bir işin yapılması veya yapılmaması kararının icrası",
    subFormCode: "FORM_4_IS",
  },
  {
    type: "IRTIFAK" as IlamliTakipType,
    icon: FileText,
    title: "İlamlı İrtifak Hakkı",
    description: "İrtifak hakkı tesisi kararının icrası",
    subFormCode: "FORM_4_IRTIFAK",
  },
  {
    type: "TEMINAT" as IlamliTakipType,
    icon: Shield,
    title: "İlamlı Teminat",
    description: "Teminat alacağının tahsili",
    subFormCode: "FORM_5_TEMINAT",
  },
];

export function CaseWizard({ onComplete, onSkip }: CaseWizardProps) {
  // Takip türü seçildiğinde direkt sonuç döndür
  const handleTakipTypeSelect = (type: IlamliTakipType) => {
    const selectedType = ilamliTakipTurleri.find((t) => t.type === type);

    const result: WizardResult = {
      subCategory: "GENEL", // Varsayılan, Takip Bilgileri adımında değiştirilebilir
      currency: "TRY",
      interestRateType: "DEGISKEN",
      interestDescription: "",
      recommendation: selectedType?.title || "İlamlı Takip",
      explanation: selectedType?.description || "",
      ilamliTakipType: type,
      suggestedSubFormCode: selectedType?.subFormCode,
      legalBasis: "İİK m.32-38 - İlamların icrası",
      tips: [
        "İlam aslı veya onaylı örneği gereklidir",
        "Kesinleşme şerhi kontrol edilmelidir",
      ],
      warnings: ["İlam zamanaşımı 10 yıldır (İİK m.39)"],
    };

    onComplete(result);
  };

  return (
    <div className="bg-white rounded-xl border p-6 mb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Sparkles className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h2 className="font-semibold text-lg">İlamlı Takip Sihirbazı</h2>
          <p className="text-sm text-muted-foreground">
            Mahkeme kararınıza uygun takip türünü seçin
          </p>
        </div>
      </div>

      {/* Takip Türleri */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-blue-600 mb-4">
          <FileText className="h-5 w-5" />
          <h3 className="font-medium">İlamlı takip türünü seçin:</h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {ilamliTakipTurleri.map((takip) => {
            const Icon = takip.icon;
            return (
              <button
                key={takip.type}
                onClick={() => handleTakipTypeSelect(takip.type)}
                className="p-4 border-2 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="h-5 w-5 text-blue-600" />
                </div>
                <div className="font-medium text-sm">{takip.title}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {takip.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Skip Button */}
      <div className="mt-6 pt-4 border-t">
        <button
          onClick={onSkip}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Sihirbazı atla, manuel seçim yap →
        </button>
      </div>
    </div>
  );
}
