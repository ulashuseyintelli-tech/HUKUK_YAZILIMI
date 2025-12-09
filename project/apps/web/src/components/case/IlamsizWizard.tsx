"use client";

import { useState } from "react";
import {
  Home,
  FileText,
  Package,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Sparkles,
} from "lucide-react";

export type IlamsizResultType = "KIRA_ALACAK" | "TAHLIYE" | "GENEL" | "REHIN";

interface IlamsizWizardResult {
  resultType: IlamsizResultType;
  suggestedFormCode: string;
  formTitle: string;
  explanation: string;
  uyapCode: string;
}

interface IlamsizWizardProps {
  onComplete: (result: IlamsizWizardResult) => void;
  onSkip: () => void;
}

type Step = 1 | 2;

export function IlamsizWizard({ onComplete, onSkip }: IlamsizWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [answers, setAnswers] = useState({
    isKira: null as boolean | null,
    kiraType: null as "ALACAK" | "TAHLIYE" | null,
  });

  // Soru 1: Kira ile ilgili mi?
  const handleKiraAnswer = (isKira: boolean) => {
    setAnswers({ ...answers, isKira });
    if (isKira) {
      setStep(2); // Kira alacağı mı tahliye mi?
    } else {
      // Kira değilse direkt genel ilamsız
      const result: IlamsizWizardResult = {
        resultType: "GENEL",
        suggestedFormCode: "FORM_7",
        formTitle: "İlamsız İcra Takibi",
        explanation: "Fatura, sözleşme veya cari hesap alacağınız için standart ilamsız icra takibi uygundur.",
        uyapCode: "49",
      };
      onComplete(result);
    }
  };

  // Soru 2: Kira alacağı mı tahliye mi?
  const handleKiraTypeAnswer = (kiraType: "ALACAK" | "TAHLIYE") => {
    setAnswers({ ...answers, kiraType });
    
    if (kiraType === "ALACAK") {
      const result: IlamsizWizardResult = {
        resultType: "KIRA_ALACAK",
        suggestedFormCode: "FORM_13",
        formTitle: "Kira Alacağı Takibi",
        explanation: "Kira sözleşmesine dayalı birikmiş kira alacaklarınızın tahsili için kira alacağı takibi uygundur.",
        uyapCode: "51",
      };
      onComplete(result);
    } else {
      const result: IlamsizWizardResult = {
        resultType: "TAHLIYE",
        suggestedFormCode: "FORM_14",
        formTitle: "Tahliye Takibi",
        explanation: "Kira süresi sona ermiş veya sözleşmeye aykırılık nedeniyle kiracının tahliyesi için tahliye takibi uygundur.",
        uyapCode: "56",
      };
      onComplete(result);
    }
  };

  const goBack = () => {
    if (step === 2) setStep(1);
  };

  return (
    <div className="bg-white rounded-xl border p-6 mb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-purple-100 rounded-lg">
          <Sparkles className="h-6 w-6 text-purple-600" />
        </div>
        <div>
          <h2 className="font-semibold text-lg">İlamsız Takip Sihirbazı</h2>
          <p className="text-sm text-muted-foreground">
            Yazılı belgenize uygun takip türünü belirleyelim
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2].map((s) => (
          <div key={s} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                s < step
                  ? "bg-purple-500 text-white"
                  : s === step
                    ? "bg-purple-600 text-white"
                    : "bg-gray-100 text-gray-400"
              }`}
            >
              {s < step ? <CheckCircle className="h-4 w-4" /> : s}
            </div>
            {s < 2 && (
              <div
                className={`w-12 h-1 mx-1 rounded ${s < step ? "bg-purple-500" : "bg-gray-200"}`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Kira ile ilgili mi? */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-purple-600 mb-4">
            <Home className="h-5 w-5" />
            <h3 className="font-medium">Soru 1: Bu alacak kira ile ilgili mi?</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => handleKiraAnswer(true)}
              className="p-4 border-2 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition-all text-left group"
            >
              <div className="text-2xl mb-2">🏠</div>
              <div className="font-medium">Evet, Kira İle İlgili</div>
              <div className="text-sm text-muted-foreground">
                Kira alacağı veya tahliye
              </div>
            </button>

            <button
              onClick={() => handleKiraAnswer(false)}
              className="p-4 border-2 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition-all text-left group"
            >
              <div className="text-2xl mb-2">📄</div>
              <div className="font-medium">Hayır, Diğer Alacak</div>
              <div className="text-sm text-muted-foreground">
                Fatura, sözleşme, cari hesap
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Kira alacağı mı tahliye mi? */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-purple-600 mb-4">
            <FileText className="h-5 w-5" />
            <h3 className="font-medium">Soru 2: Ne tür bir kira takibi?</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => handleKiraTypeAnswer("ALACAK")}
              className="p-4 border-2 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition-all text-left"
            >
              <div className="text-2xl mb-2">💰</div>
              <div className="font-medium">Kira Alacağı</div>
              <div className="text-sm text-muted-foreground">
                Birikmiş kira borcunun tahsili
              </div>
            </button>

            <button
              onClick={() => handleKiraTypeAnswer("TAHLIYE")}
              className="p-4 border-2 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition-all text-left"
            >
              <div className="text-2xl mb-2">🚪</div>
              <div className="font-medium">Tahliye</div>
              <div className="text-sm text-muted-foreground">
                Kiracının tahliyesi
              </div>
            </button>
          </div>

          <button
            onClick={goBack}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mt-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Geri
          </button>
        </div>
      )}

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
