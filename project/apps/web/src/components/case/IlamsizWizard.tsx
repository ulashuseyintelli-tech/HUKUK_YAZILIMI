"use client";

import { useState } from "react";
import { FileText, CheckCircle, ArrowLeft, Sparkles } from "lucide-react";

export type IlamsizResultType = "KIRA_ALACAK" | "TAHLIYE" | "GENEL" | "REHIN";
export type MahiyetType = "FATURA" | "SOZLESME" | "CARI_HESAP" | "AIDAT" | "HIZMET" | "DIGER";

interface IlamsizWizardResult {
  resultType: IlamsizResultType;
  suggestedFormCode: string;
  formTitle: string;
  explanation: string;
  uyapCode: string;
  mahiyetType?: MahiyetType;
  mahiyetCode?: string;
}

interface IlamsizWizardProps {
  onComplete: (result: IlamsizWizardResult) => void;
  onSkip: () => void;
  onBack?: () => void;
  initialStep?: number;
  onStepChange?: (step: number) => void;
  initialAnswers?: { isKira: boolean | null };
  onAnswersChange?: (answers: { isKira: boolean | null }) => void;
}

type Step = 1 | 2 | 3;

const MAHIYET_OPTIONS = [
  { type: "FATURA" as MahiyetType, code: "FATURA", label: "Fatura Alacağı", icon: "🧾", desc: "Mal veya hizmet faturası" },
  { type: "SOZLESME" as MahiyetType, code: "SOZLESME", label: "Sözleşme Alacağı", icon: "📝", desc: "Sözleşmeye dayalı alacak" },
  { type: "CARI_HESAP" as MahiyetType, code: "CARI_HESAP", label: "Cari Hesap", icon: "📊", desc: "Cari hesap bakiyesi" },
  { type: "AIDAT" as MahiyetType, code: "AIDAT", label: "Aidat Alacağı", icon: "🏢", desc: "Site/apartman aidatı" },
  { type: "HIZMET" as MahiyetType, code: "HIZMET", label: "Hizmet Bedeli", icon: "🔧", desc: "Hizmet karşılığı alacak" },
  { type: "DIGER" as MahiyetType, code: "DIGER", label: "Diğer Alacak", icon: "📋", desc: "Diğer ilamsız alacaklar" },
];

export function IlamsizWizard({ onComplete, onSkip, onBack, initialStep = 1, onStepChange, initialAnswers, onAnswersChange }: IlamsizWizardProps) {
  // initialStep'i answers ile uyumlu hale getir
  const getValidInitialStep = (): Step => {
    if (initialStep === 3 && initialAnswers?.isKira === false) return 3;
    if (initialStep === 2 && initialAnswers?.isKira === true) return 2;
    return 1;
  };
  
  const [step, setStepInternal] = useState<Step>(getValidInitialStep());
  const [answers, setAnswersInternal] = useState({
    isKira: initialAnswers?.isKira ?? null,
    kiraType: null as "ALACAK" | "TAHLIYE" | null,
    mahiyetType: null as MahiyetType | null,
  });

  // Step değiştiğinde parent'a bildir
  const setStep = (newStep: Step) => {
    setStepInternal(newStep);
    onStepChange?.(newStep);
  };

  // Answers değiştiğinde parent'a bildir
  const setAnswers = (newAnswers: typeof answers) => {
    setAnswersInternal(newAnswers);
    onAnswersChange?.({ isKira: newAnswers.isKira });
  };

  // Soru 1: Alacak türü
  const handleAlacakTuru = (isKira: boolean) => {
    setAnswers({ ...answers, isKira });
    if (isKira) {
      setStep(2); // Kira alacağı mı tahliye mi?
    } else {
      setStep(3); // Mahiyet seçimi
    }
  };

  // Soru 2: Kira alacağı mı tahliye mi?
  const handleKiraTypeAnswer = (kiraType: "ALACAK" | "TAHLIYE") => {
    setAnswers({ ...answers, kiraType });
    
    if (kiraType === "ALACAK") {
      onComplete({
        resultType: "KIRA_ALACAK",
        suggestedFormCode: "FORM_13",
        formTitle: "Kira Alacağı Takibi",
        explanation: "Kira sözleşmesine dayalı birikmiş kira alacaklarınızın tahsili için kira alacağı takibi uygundur.",
        uyapCode: "51",
        mahiyetType: "SOZLESME",
        mahiyetCode: "KIRA",
      });
    } else {
      onComplete({
        resultType: "TAHLIYE",
        suggestedFormCode: "FORM_14",
        formTitle: "Tahliye Takibi",
        explanation: "Kira süresi sona ermiş veya sözleşmeye aykırılık nedeniyle kiracının tahliyesi için tahliye takibi uygundur.",
        uyapCode: "56",
        mahiyetType: "SOZLESME",
        mahiyetCode: "TAHLIYE",
      });
    }
  };

  // Soru 3: Mahiyet seçimi
  const handleMahiyetSelect = (mahiyet: typeof MAHIYET_OPTIONS[0]) => {
    onComplete({
      resultType: "GENEL",
      suggestedFormCode: "FORM_7",
      formTitle: "İlamsız İcra Takibi",
      explanation: `${mahiyet.label} için standart ilamsız icra takibi uygundur.`,
      uyapCode: "49",
      mahiyetType: mahiyet.type,
      mahiyetCode: mahiyet.code,
    });
  };

  const goBack = () => {
    if (step === 1 && onBack) {
      onBack(); // Belge seçiciye dön
    } else if (step === 2) {
      setStep(1);
    } else if (step === 3) {
      setStep(1);
    }
  };

  const totalSteps = answers.isKira === false ? 2 : 2;

  return (
    <div className="bg-white rounded-xl border p-4 mb-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-purple-100 rounded-lg">
          <Sparkles className="h-5 w-5 text-purple-600" />
        </div>
        <div>
          <h2 className="font-semibold">İlamsız Takip Sihirbazı</h2>
          <p className="text-xs text-muted-foreground">Yazılı belgenize uygun takip türünü belirleyelim</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        {[1, 2].map((s) => (
          <div key={s} className="flex items-center">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${s < step ? "bg-purple-500 text-white" : s === step || (step === 3 && s === 2) ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-400"}`}>
              {s < step || (step === 3 && s === 2) ? <CheckCircle className="h-3 w-3" /> : s}
            </div>
            {s < 2 && <div className={`w-8 h-0.5 mx-1 rounded ${s < step ? "bg-purple-500" : "bg-gray-200"}`} />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-purple-600 mb-3">
            <FileText className="h-4 w-4" />
            <h3 className="text-sm font-medium">Alacağınızın türü nedir?</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => handleAlacakTuru(false)} className="p-3 border-2 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all text-left">
              <div className="text-xl mb-1">📄</div>
              <div className="text-sm font-medium">Fatura / Sözleşme</div>
              <div className="text-xs text-muted-foreground">Fatura, sözleşme, cari hesap</div>
            </button>
            <button onClick={() => handleAlacakTuru(true)} className="p-3 border-2 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all text-left">
              <div className="text-xl mb-1">🏠</div>
              <div className="text-sm font-medium">Kira / Tahliye</div>
              <div className="text-xs text-muted-foreground">Kira alacağı veya tahliye</div>
            </button>
          </div>
          {onBack && (
            <button onClick={goBack} className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-200 hover:border-gray-400 transition-colors mt-3">
              <ArrowLeft className="h-4 w-4" /> Geri
            </button>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-purple-600 mb-3">
            <FileText className="h-4 w-4" />
            <h3 className="text-sm font-medium">Ne tür bir kira takibi?</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => handleKiraTypeAnswer("ALACAK")} className="p-3 border-2 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all text-left">
              <div className="text-xl mb-1">💰</div>
              <div className="text-sm font-medium">Kira Alacağı</div>
              <div className="text-xs text-muted-foreground">Birikmiş kira borcu</div>
            </button>
            <button onClick={() => handleKiraTypeAnswer("TAHLIYE")} className="p-3 border-2 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all text-left">
              <div className="text-xl mb-1">🚪</div>
              <div className="text-sm font-medium">Tahliye</div>
              <div className="text-xs text-muted-foreground">Kiracının tahliyesi</div>
            </button>
          </div>
          <button onClick={goBack} className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-200 hover:border-gray-400 transition-colors mt-3">
            <ArrowLeft className="h-4 w-4" /> Geri
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-purple-600 mb-3">
            <FileText className="h-4 w-4" />
            <h3 className="text-sm font-medium">Alacağınızın mahiyetini seçin:</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {MAHIYET_OPTIONS.map((m) => (
              <button key={m.type} onClick={() => handleMahiyetSelect(m)} className="p-2 border-2 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all text-left">
                <div className="text-lg">{m.icon}</div>
                <div className="text-xs font-medium">{m.label}</div>
                <div className="text-[10px] text-muted-foreground">{m.desc}</div>
              </button>
            ))}
          </div>
          <button onClick={goBack} className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-200 hover:border-gray-400 transition-colors mt-3">
            <ArrowLeft className="h-4 w-4" /> Geri
          </button>
        </div>
      )}

      <div className="mt-4 pt-3 border-t">
        <button onClick={onSkip} className="text-xs text-muted-foreground hover:text-foreground">
          Sihirbazı atla, manuel seçim yap →
        </button>
      </div>
    </div>
  );
}
