"use client";

import { useState } from "react";
import {
  Receipt,
  CheckCircle,
  ArrowLeft,
  Sparkles,
  AlertTriangle,
} from "lucide-react";

export type KambiyoSenetType = "BONO" | "POLICE" | "CEK";

interface KambiyoWizardResult {
  senetType: KambiyoSenetType;
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
  const [selectedType, setSelectedType] = useState<KambiyoSenetType | null>(null);

  const handleSenetTypeSelect = (senetType: KambiyoSenetType) => {
    setSelectedType(senetType);
    
    let result: KambiyoWizardResult;
    
    switch (senetType) {
      case "BONO":
        result = {
          senetType: "BONO",
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
        result = {
          senetType: "CEK",
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
    
    onComplete(result);
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
            Kambiyo senedi türünü seçin
          </p>
        </div>
      </div>

      {/* Senet Türü Seçimi */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-green-600 mb-4">
          <Receipt className="h-5 w-5" />
          <h3 className="font-medium">Kambiyo senedi türünü seçin:</h3>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={() => handleSenetTypeSelect("BONO")}
            className={`p-4 border-2 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all text-left ${
              selectedType === "BONO" ? "border-green-500 bg-green-50" : ""
            }`}
          >
            <div className="text-2xl mb-2">📜</div>
            <div className="font-medium">Senet / Bono</div>
            <div className="text-xs text-muted-foreground">
              Emre muharrer senet
            </div>
          </button>

          <button
            onClick={() => handleSenetTypeSelect("POLICE")}
            className={`p-4 border-2 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all text-left ${
              selectedType === "POLICE" ? "border-green-500 bg-green-50" : ""
            }`}
          >
            <div className="text-2xl mb-2">📋</div>
            <div className="font-medium">Poliçe</div>
            <div className="text-xs text-muted-foreground">
              Üçlü ilişki senedi
            </div>
          </button>

          <button
            onClick={() => handleSenetTypeSelect("CEK")}
            className={`p-4 border-2 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all text-left ${
              selectedType === "CEK" ? "border-green-500 bg-green-50" : ""
            }`}
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

      {/* Buttons */}
      <div className="mt-6 pt-4 border-t flex items-center justify-between">
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors">
            <ArrowLeft className="h-4 w-4" /> Geri
          </button>
        )}
        <button onClick={onSkip} className="text-sm text-muted-foreground hover:text-foreground">
          Sihirbazı atla, manuel seçim yap →
        </button>
      </div>
    </div>
  );
}
