'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  CheckCircle, 
  Circle, 
  ArrowRight, 
  FileText, 
  Users, 
  Zap, 
  Brain,
  Settings,
  BookOpen
} from 'lucide-react';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  action: string;
  href: string;
  completed: boolean;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);

  const steps: OnboardingStep[] = [
    {
      id: 'profile',
      title: 'Profil Bilgilerini Tamamla',
      description: 'Firma ve kullanıcı bilgilerinizi güncelleyin',
      icon: <Users className="h-6 w-6" />,
      action: 'Profili Düzenle',
      href: '/settings/profile',
      completed: completedSteps.includes('profile'),
    },
    {
      id: 'first-case',
      title: 'İlk Takip Dosyanızı Oluşturun',
      description: 'Akıllı form sihirbazı ile doğru formu seçin',
      icon: <FileText className="h-6 w-6" />,
      action: 'Yeni Takip',
      href: '/cases/new?new=true',
      completed: completedSteps.includes('first-case'),
    },
    {
      id: 'automation',
      title: 'Otomasyon Ayarlarını Keşfedin',
      description: 'Tam otomatik mod ile işlerinizi hızlandırın',
      icon: <Zap className="h-6 w-6" />,
      action: 'Otomasyonu Aç',
      href: '/settings/automation',
      completed: completedSteps.includes('automation'),
    },
    {
      id: 'ai',
      title: 'AI Asistanı Aktifleştirin',
      description: 'Yapay zeka destekli öneriler alın (opsiyonel)',
      icon: <Brain className="h-6 w-6" />,
      action: 'AI Ayarları',
      href: '/settings/ai',
      completed: completedSteps.includes('ai'),
    },
  ];

  const completionPercentage = Math.round((completedSteps.length / steps.length) * 100);

  const markAsCompleted = (stepId: string) => {
    if (!completedSteps.includes(stepId)) {
      setCompletedSteps([...completedSteps, stepId]);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold mb-3">Hoş Geldiniz! 👋</h1>
        <p className="text-muted-foreground text-lg">
          Tam Otomatik İcra-İflas Sistemine başlamak için aşağıdaki adımları tamamlayın
        </p>
      </div>

      {/* Progress Bar */}
      <div className="bg-white rounded-xl border p-6 mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="font-medium">Kurulum İlerlemesi</span>
          <span className="text-primary font-bold">{completionPercentage}%</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${completionPercentage}%` }}
          />
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          {completedSteps.length} / {steps.length} adım tamamlandı
        </p>
      </div>


      {/* Steps */}
      <div className="space-y-4 mb-8">
        {steps.map((step, index) => (
          <div 
            key={step.id}
            className={`bg-white rounded-xl border p-6 transition-all ${
              step.completed ? 'border-green-200 bg-green-50/50' : 'hover:border-primary/50'
            }`}
          >
            <div className="flex items-start gap-4">
              {/* Step Number / Check */}
              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                step.completed 
                  ? 'bg-green-500 text-white' 
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {step.completed ? (
                  <CheckCircle className="h-5 w-5" />
                ) : (
                  <span className="font-bold">{index + 1}</span>
                )}
              </div>

              {/* Content */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`${step.completed ? 'text-green-600' : 'text-primary'}`}>
                    {step.icon}
                  </span>
                  <h3 className={`font-semibold ${step.completed ? 'text-green-700' : ''}`}>
                    {step.title}
                  </h3>
                </div>
                <p className="text-muted-foreground text-sm mb-3">
                  {step.description}
                </p>
                
                {!step.completed && (
                  <button
                    onClick={() => {
                      markAsCompleted(step.id);
                      router.push(step.href);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm"
                  >
                    {step.action}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
                
                {step.completed && (
                  <span className="inline-flex items-center gap-1 text-green-600 text-sm">
                    <CheckCircle className="h-4 w-4" />
                    Tamamlandı
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Tips */}
      <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
        <h3 className="font-semibold flex items-center gap-2 mb-4">
          <BookOpen className="h-5 w-5 text-blue-600" />
          Hızlı İpuçları
        </h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg p-4">
            <h4 className="font-medium text-sm mb-1">🎯 Doğru Form Seçimi</h4>
            <p className="text-xs text-muted-foreground">
              Akıllı sihirbaz 4 soru ile size en uygun formu önerir
            </p>
          </div>
          <div className="bg-white rounded-lg p-4">
            <h4 className="font-medium text-sm mb-1">⚡ Otomatik Mod</h4>
            <p className="text-xs text-muted-foreground">
              Dosya detayında "Otomatik Mod" butonunu açarak işlemleri otomatikleştirin
            </p>
          </div>
          <div className="bg-white rounded-lg p-4">
            <h4 className="font-medium text-sm mb-1">📊 Risk Analizi</h4>
            <p className="text-xs text-muted-foreground">
              Her dosya için risk skoru otomatik hesaplanır ve öneriler sunulur
            </p>
          </div>
          <div className="bg-white rounded-lg p-4">
            <h4 className="font-medium text-sm mb-1">🤖 AI Önerileri</h4>
            <p className="text-xs text-muted-foreground">
              OpenAI API anahtarı ekleyerek gelişmiş AI önerileri alabilirsiniz
            </p>
          </div>
        </div>
      </div>

      {/* Skip Button */}
      <div className="text-center mt-8">
        <button
          onClick={() => router.push('/dashboard')}
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          Kurulumu atla ve Dashboard'a git →
        </button>
      </div>
    </div>
  );
}
