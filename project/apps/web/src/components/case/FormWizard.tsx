'use client';

import { useState, useCallback } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Gavel, 
  FileText, 
  Receipt, 
  Building, 
  Home,
  Sparkles,
  SkipForward,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  wizardQuestions, 
  WizardAnswer, 
  getRecommendedFormCode,
} from '@/types/wizard';

interface FormWizardProps {
  onComplete: (recommendedFormCode: string) => void;
  onSkip: () => void;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Gavel,
  FileText,
  Receipt,
  Building,
  Home,
};

export function FormWizard({ onComplete, onSkip }: FormWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<WizardAnswer>({
    hasJudgment: null,
    hasKambiyo: null,
    hasMortgage: null,
    isRental: null,
  });

  const currentQuestion = wizardQuestions[currentStep];
  const isLastStep = currentStep === wizardQuestions.length - 1;
  const canGoBack = currentStep > 0;

  const handleAnswer = useCallback((value: string) => {
    const questionId = currentQuestion.id as keyof WizardAnswer;
    const boolValue = value === 'yes';

    setAnswers((prev) => ({
      ...prev,
      [questionId]: boolValue,
    }));

    // Otomatik ilerleme
    if (isLastStep) {
      // Son soruysa, önerilen formu hesapla ve tamamla
      const newAnswers = { ...answers, [questionId]: boolValue };
      const recommendedCode = getRecommendedFormCode(newAnswers);
      onComplete(recommendedCode);
    } else {
      // Sonraki soruya geç
      setCurrentStep((prev) => prev + 1);
    }
  }, [currentQuestion, isLastStep, answers, onComplete]);

  const handleBack = useCallback(() => {
    if (canGoBack) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [canGoBack]);

  const getAnswerForQuestion = (questionId: string): string | null => {
    const value = answers[questionId as keyof WizardAnswer];
    if (value === null) return null;
    return value ? 'yes' : 'no';
  };

  return (
    <div className="border rounded-lg bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
      <div className="px-4 py-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Takip Türü Sihirbazı</h3>
          </div>
          <button 
            type="button"
            onClick={onSkip} 
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
          >
            <SkipForward className="h-4 w-4 mr-1" />
            Atla
          </button>
        </div>
        
        {/* Progress indicator */}
        <div className="flex gap-1 mt-4">
          {wizardQuestions.map((_, index) => (
            <div
              key={index}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                index < currentStep
                  ? 'bg-primary'
                  : index === currentStep
                  ? 'bg-primary/60'
                  : 'bg-gray-200'
              )}
            />
          ))}
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Question */}
        <div className="space-y-2">
          <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full border bg-white text-gray-600 mb-2">
            Soru {currentStep + 1} / {wizardQuestions.length}
          </span>
          <h3 className="text-xl font-semibold">{currentQuestion.question}</h3>
        </div>

        {/* Options */}
        <div className="grid gap-3">
          {currentQuestion.options.map((option) => {
            const Icon = option.icon ? iconMap[option.icon] : FileText;
            const isSelected = getAnswerForQuestion(currentQuestion.id) === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleAnswer(option.value)}
                className={cn(
                  'flex items-start gap-4 p-4 rounded-lg border-2 text-left transition-all',
                  'hover:border-primary/50 hover:bg-primary/5',
                  isSelected
                    ? 'border-primary bg-primary/10'
                    : 'border-gray-200 bg-white'
                )}
              >
                <div className={cn(
                  'p-2 rounded-lg',
                  isSelected ? 'bg-primary text-white' : 'bg-gray-100'
                )}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="font-medium">{option.label}</div>
                  {option.description && (
                    <div className="text-sm text-gray-500 mt-1">
                      {option.description}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <button
            type="button"
            onClick={handleBack}
            disabled={!canGoBack}
            className={cn(
              "inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border",
              canGoBack 
                ? "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                : "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
            )}
          >
            <ChevronLeft className="h-4 w-4" />
            Geri
          </button>

          <div className="text-sm text-gray-500">
            {currentStep + 1} / {wizardQuestions.length}
          </div>
        </div>
      </div>
    </div>
  );
}
