"use client";

import { useState } from "react";
import { ArrowRight, SkipForward, Sparkles, Check, Settings } from "lucide-react";
import { WizardState, WizardAnswers, wizardQuestions, initialWizardState } from "@/types/wizard";
import { FormMetadata } from "@/types/form-metadata";
import { formMetadata } from "@/config/form-metadata";
import { saveUserSettings } from "@/lib/user-settings";
import Link from "next/link";

interface FormWizardProps {
  onComplete: (recommendedForm: FormMetadata | null, answers: WizardAnswers) => void;
  onSkip: () => void;
}

export function getRecommendedForm(answers: WizardAnswers): FormMetadata | null {
  const { hasJudgment, isKambiyo, hasMortgage, isRental } = answers;

  // Tüm sorular cevaplanmamışsa null döndür
  if (hasJudgment === null || isKambiyo === null || hasMortgage === null || isRental === null) {
    return null;
  }

  // Filtreleme mantığı - öncelik sırasına göre
  let candidates = [...formMetadata];

  // 1. Kira ile ilgili mi?
  if (isRental) {
    candidates = candidates.filter((f) => f.isRental);
    // Kira alacağı veya tahliye - en yaygın Form 13
    return candidates.find((f) => f.code === "FORM_13") || candidates[0] || null;
  }

  // 2. Kambiyo senedi var mı?
  if (isKambiyo) {
    candidates = candidates.filter((f) => f.isKambiyo);
    // En yaygın kambiyo takibi Form 10
    return candidates.find((f) => f.code === "FORM_10") || candidates[0] || null;
  }

  // 3. İpotek/rehin var mı?
  if (hasMortgage) {
    candidates = candidates.filter((f) => f.needsMortgage);
    // İlam durumuna göre filtrele
    if (hasJudgment) {
      return candidates.find((f) => f.hasJudgment) || candidates[0] || null;
    } else {
      return candidates.find((f) => !f.hasJudgment) || candidates[0] || null;
    }
  }

  // 4. İlam var mı?
  if (hasJudgment) {
    candidates = candidates.filter((f) => f.hasJudgment && !f.needsMortgage);
    return candidates.find((f) => f.code === "FORM_2_3_4_5") || candidates[0] || null;
  }

  // 5. Hiçbiri değilse - İlamsız İcra (Form 7)
  return formMetadata.find((f) => f.code === "FORM_7") || null;
}

export function filterFormsByAnswers(answers: WizardAnswers): FormMetadata[] {
  const { hasJudgment, isKambiyo, hasMortgage, isRental } = answers;

  return formMetadata.filter((form) => {
    // Eğer soru cevaplanmamışsa, o kriteri atla
    if (hasJudgment !== null && form.hasJudgment !== hasJudgment) return false;
    if (isKambiyo !== null && form.isKambiyo !== isKambiyo) return false;
    if (hasMortgage !== null && form.needsMortgage !== hasMortgage) return false;
    if (isRental !== null && form.isRental !== isRental) return false;
    return true;
  });
}

export function FormWizard({ onComplete, onSkip }: FormWizardProps) {
  const [state, setState] = useState<WizardState>(initialWizardState);

  const currentQuestion = wizardQuestions[state.currentStep];
  const isLastStep = state.currentStep === wizardQuestions.length - 1;

  const handleAnswer = (value: boolean) => {
    const newAnswers = { ...state.answers, [currentQuestion.id]: value };

    if (isLastStep) {
      // Son soru - tamamla
      const recommended = getRecommendedForm(newAnswers);
      setState((prev) => ({ ...prev, answers: newAnswers, isComplete: true }));
      onComplete(recommended, newAnswers);
    } else {
      // Sonraki soruya geç
      setState((prev) => ({
        ...prev,
        answers: newAnswers,
        currentStep: prev.currentStep + 1,
      }));
    }
  };

  const answeredCount = Object.values(state.answers).filter((v) => v !== null).length;

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-600" />
          <h3 className="font-semibold text-blue-900">Akıllı Form Sihirbazı</h3>
        </div>
        <button
          onClick={onSkip}
          className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          <SkipForward className="h-4 w-4" />
          Sihirbazı Atla
        </button>
      </div>

      {/* Progress */}
      <div className="flex gap-2 mb-6">
        {wizardQuestions.map((_, index) => (
          <div
            key={index}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              index < state.currentStep
                ? "bg-blue-600"
                : index === state.currentStep
                ? "bg-blue-400"
                : "bg-blue-200"
            }`}
          />
        ))}
      </div>

      {/* Question */}
      <div className="mb-6">
        <p className="text-sm text-blue-600 mb-1">
          Soru {state.currentStep + 1} / {wizardQuestions.length}
        </p>
        <h4 className="text-lg font-medium text-gray-900 mb-2">{currentQuestion.question}</h4>
        <p className="text-sm text-gray-600">{currentQuestion.description}</p>
      </div>

      {/* Options */}
      <div className="grid grid-cols-2 gap-3">
        {currentQuestion.options.map((option) => (
          <button
            key={String(option.value)}
            onClick={() => handleAnswer(option.value)}
            className="p-4 border-2 border-blue-200 rounded-lg text-left hover:border-blue-500 hover:bg-white transition-colors group"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-900">{option.label}</span>
              <ArrowRight className="h-4 w-4 text-blue-400 group-hover:text-blue-600 transition-colors" />
            </div>
          </button>
        ))}
      </div>

      {/* Answered summary */}
      {answeredCount > 0 && (
        <div className="mt-4 pt-4 border-t border-blue-200">
          <p className="text-xs text-blue-600 flex items-center gap-1">
            <Check className="h-3 w-3" />
            {answeredCount} soru cevaplandı
          </p>
        </div>
      )}

      {/* Don't show again option */}
      <div className="mt-4 pt-4 border-t border-blue-200 flex items-center justify-between">
        <button
          onClick={() => {
            saveUserSettings({ showWizardOnNewCase: false });
            onSkip();
          }}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          Bir daha gösterme
        </button>
        <Link 
          href="/settings" 
          className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          <Settings className="h-3 w-3" />
          Ayarlar
        </Link>
      </div>
    </div>
  );
}
