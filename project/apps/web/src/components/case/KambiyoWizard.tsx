"use client";

import { useState } from "react";
import {
  Receipt,
  CheckCircle,
  ArrowLeft,
  Sparkles,
  AlertTriangle,
  Gavel,
} from "lucide-react";

export type KambiyoSenetType = "BONO" | "POLICE" | "CEK";
export type KambiyoTakipYolu = "HACIZ" | "IFLAS";

interface KambiyoWizardResult {
  senetType: KambiyoSenetType;
  takipYolu: KambiyoTakipYolu;
  suggestedFormCode: string;
  formTitle: string;
  explanation: string;
  uyapCode: string;
  warnings: string[];
  tips: string[];
}

interface KambiyoWizardProps {
  onComplete: (result: KambiyoWizardResult) => void;
  onSkip: () => void;
  onBack?: () => void;
}

export function KambiyoWizard({ onComplete, onSkip, onBack }: KambiyoWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<KambiyoSenetType | null>(null);

  // Adım 1: Senet türü seçimi
  const handleSenetTypeSelect = (senetType: KambiyoSenetType) => {
    setSelectedType(senetType);
    setStep(2); // Takip yolu seçimine geç
  };

  // Adım 2: Takip yolu seçimi (Haciz veya İflas)
  const handleTakipYoluSelect = (takipYolu: KambiyoTakipYolu) => {
    if (!selectedType) return;
    
    let result: KambiyoWizardResult;
    
    const senetLabels = {
      BONO: "Bono/Senet",
      POLICE: "Poliçe",
      CEK: "Çek",
    };
    
    if (takipYolu === "HACIZ") {
      // Normal kambiyo haciz takibi
      switch (selectedType) {
        case "BONO":
          result = {
            senetType: "BONO",
            takipYolu: "HACIZ",
            suggestedFormCode: "FORM_10",
            formTitle: "Kambiyo Senedine Dayalı Takip (Bono)",
            explanation: "Emre muharrer senet (bono) alacağınız için kambiyo senetlerine özgü haciz yoluyla takip uygundur.",
            uyapCode: "163",
            warnings: [
              "Bono vadesinin geçmiş olması gerekir",
              "Protesto çekilmesi gerekebilir (ciranta takibi için)",
              "5 günlük ödeme süresi vardır"
            ],
            tips: [
              "Bono aslını saklamayı unutmayın",
              "Vade tarihi ve düzenleme tarihini kontrol edin",
              "Keşideci ve ciranta bilgilerini doğrulayın"
            ],
          };
          break;
        case "POLICE":
          result = {
            senetType: "POLICE",
            takipYolu: "HACIZ",
            suggestedFormCode: "FORM_10",
            formTitle: "Kambiyo Senedine Dayalı Takip (Poliçe)",
            explanation: "Poliçe alacağınız için kambiyo senetlerine özgü haciz yoluyla takip uygundur.",
            uyapCode: "163",
            warnings: [
              "Poliçenin kabul edilmiş olması gerekir",
              "Protesto zorunluluğu vardır",
              "5 günlük ödeme süresi vardır"
            ],
            tips: [
              "Kabul şerhini kontrol edin",
              "Muhatap ve keşideci bilgilerini doğrulayın",
              "Ciro silsilesini kontrol edin"
            ],
          };
          break;
        case "CEK":
        default:
          result = {
            senetType: "CEK",
            takipYolu: "HACIZ",
            suggestedFormCode: "FORM_10",
            formTitle: "Kambiyo Senedine Dayalı Takip (Çek)",
            explanation: "Karşılıksız çek alacağınız için kambiyo senetlerine özgü haciz yoluyla takip uygundur.",
            uyapCode: "163",
            warnings: [
              "Çekin ibraz süresinde bankaya ibraz edilmiş olması gerekir",
              "Karşılıksız şerhi veya banka yazısı gereklidir",
              "5 günlük ödeme süresi vardır"
            ],
            tips: [
              "Karşılıksız şerhini kontrol edin",
              "İbraz tarihini doğrulayın",
              "Keşideci ve banka bilgilerini kontrol edin"
            ],
          };
          break;
      }
    } else {
      // İflas yoluyla kambiyo takibi
      result = {
        senetType: selectedType,
        takipYolu: "IFLAS",
        suggestedFormCode: "FORM_12",
        formTitle: `İflas Yoluyla Kambiyo Takibi (${senetLabels[selectedType]})`,
        explanation: `Tacir borçluya karşı ${senetLabels[selectedType].toLowerCase()} alacağınız için iflas yoluyla kambiyo takibi uygundur.`,
        uyapCode: "152",
        warnings: [
          "Borçlunun tacir olması gerekir",
          "Ticaret sicil kaydı gereklidir",
          "İflas davası açılabilir"
        ],
        tips: [
          "Borçlunun ticaret sicil kaydını kontrol edin",
          "Kambiyo senedi aslını saklamayı unutmayın",
          "İflas masraflarını göz önünde bulundurun"
        ],
      };
    }
    
    onComplete(result);
  };

  const goBack = () => {
    if (step === 2) {
      setStep(1);
      setSelectedType(null);
    } else if (onBack) {
      onBack();
    }
  };

  const senetLabels = {
    BONO: "Bono/Senet",
    POLICE: "Poliçe",
    CEK: "Çek",
  };

  return (
    <div className="bg-white rounded-xl border p-6 mb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-green-100 rounded-lg">
          <Sparkles className="h-6 w-6 text-green-600" />
        </div>
        <div>
          <h2 className="font-semibold text-lg">Kambiyo Takibi Sihirbazı</h2>
          <p className="text-sm text-muted-foreground">
            {step === 1 ? "Kambiyo senedi türünü seçin" : "Takip yolunu seçin"}
          </p>
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2].map((s) => (
          <div key={s} className="flex items-center">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
              s < step ? "bg-green-500 text-white" : 
              s === step ? "bg-green-600 text-white" : 
              "bg-gray-100 text-gray-400"
            }`}>
              {s < step ? <CheckCircle className="h-4 w-4" /> : s}
            </div>
            {s < 2 && <div className={`w-10 h-0.5 mx-1 rounded ${s < step ? "bg-green-500" : "bg-gray-200"}`} />}
          </div>
        ))}
        <span className="text-xs text-muted-foreground ml-2">
          {step === 1 ? "Senet Türü" : "Takip Yolu"}
        </span>
      </div>

      {/* Step 1: Senet Türü Seçimi */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-600 mb-4">
            <Receipt className="h-5 w-5" />
            <h3 className="font-medium">Kambiyo senedi türünü seçin:</h3>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <button
              onClick={() => handleSenetTypeSelect("BONO")}
              className="p-4 border-2 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all text-left"
            >
              <div className="text-2xl mb-2">📜</div>
              <div className="font-medium">Senet / Bono</div>
              <div className="text-xs text-muted-foreground">
                Emre muharrer senet
              </div>
            </button>

            <button
              onClick={() => handleSenetTypeSelect("POLICE")}
              className="p-4 border-2 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all text-left"
            >
              <div className="text-2xl mb-2">📋</div>
              <div className="font-medium">Poliçe</div>
              <div className="text-xs text-muted-foreground">
                Üçlü ilişki senedi
              </div>
            </button>

            <button
              onClick={() => handleSenetTypeSelect("CEK")}
              className="p-4 border-2 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all text-left"
            >
              <div className="text-2xl mb-2">🏦</div>
              <div className="font-medium">Çek</div>
              <div className="text-xs text-muted-foreground">
                Karşılıksız çek
              </div>
            </button>
          </div>

          {/* Bilgi Kutusu */}
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
              <div className="text-xs text-amber-800">
                <p className="font-medium mb-1">Kambiyo Takibi Hakkında:</p>
                <ul className="space-y-1">
                  <li>• Kambiyo senetleri için özel takip yolu (İİK m.167-176)</li>
                  <li>• 5 günlük ödeme süresi verilir</li>
                  <li>• İtiraz icrayı durdurmaz (satış dışında)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Takip Yolu Seçimi */}
      {step === 2 && selectedType && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-600 mb-4">
            <Gavel className="h-5 w-5" />
            <h3 className="font-medium">
              {senetLabels[selectedType]} için takip yolunu seçin:
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => handleTakipYoluSelect("HACIZ")}
              className="p-4 border-2 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all text-left"
            >
              <div className="text-2xl mb-2">⚡</div>
              <div className="font-medium">Haciz Yoluyla Takip</div>
              <div className="text-xs text-muted-foreground">
                Standart kambiyo takibi (İİK m.167)
              </div>
              <div className="mt-2 text-xs text-green-600">
                • 5 gün ödeme süresi<br/>
                • Hızlı haciz imkanı
              </div>
            </button>

            <button
              onClick={() => handleTakipYoluSelect("IFLAS")}
              className="p-4 border-2 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all text-left"
            >
              <div className="text-2xl mb-2">⚠️</div>
              <div className="font-medium">İflas Yoluyla Takip</div>
              <div className="text-xs text-muted-foreground">
                Tacir borçlu için iflas takibi
              </div>
              <div className="mt-2 text-xs text-amber-600">
                • Borçlu tacir olmalı<br/>
                • İflas davası açılabilir
              </div>
            </button>
          </div>

          {/* Seçilen senet bilgisi */}
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-800">
                Seçilen senet türü: <strong>{senetLabels[selectedType]}</strong>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="mt-6 pt-4 border-t flex items-center justify-between">
        <button 
          onClick={goBack} 
          className="flex items-center gap-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Geri
        </button>
        <button onClick={onSkip} className="text-sm text-muted-foreground hover:text-foreground">
          Sihirbazı atla, manuel seçim yap →
        </button>
      </div>
    </div>
  );
}
