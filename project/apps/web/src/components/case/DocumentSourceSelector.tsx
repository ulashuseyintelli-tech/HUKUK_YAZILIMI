"use client";

import { useState, useRef } from "react";
import {
  FileText,
  Receipt,
  FileSignature,
  ScanLine,
  Sparkles,
  ArrowRight,
  Loader2,
  CheckCircle,
  AlertTriangle,
  X,
  Upload,
  File,
  Image,
  FileType,
} from "lucide-react";
import { api } from "@/lib/api";

// Dayanak belge türleri
export type DocumentSourceType = "ILAM" | "KAMBIYO" | "SOZLESME" | null;

// OCR sınıflandırma sonucu
export interface ClassificationResult {
  detectedType: string;
  detectedSubCategory: string | null;
  confidence: number;
  matchedKeywords: string[];
  suggestedFormCode: string | null;
  explanation: string;
}

interface DocumentSourceSelectorProps {
  onSelect: (sourceType: DocumentSourceType, ocrResult?: ClassificationResult) => void;
  onSkip: () => void;
}

export function DocumentSourceSelector({ onSelect, onSkip }: DocumentSourceSelectorProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ClassificationResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [textInput, setTextInput] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [useAI, setUseAI] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Belge kartları
  const documentCards = [
    {
      type: "ILAM" as DocumentSourceType,
      icon: FileText,
      title: "Mahkeme Kararı / İlam",
      description: "Mahkeme kararı, ilam veya ilam hükmünde belge",
      examples: ["Asliye Hukuk Mahkemesi kararı", "Aile Mahkemesi nafaka kararı", "Ticaret Mahkemesi tazminat kararı"],
      color: "blue",
      nextFlow: "İlamlı Takip Sihirbazı",
    },
    {
      type: "KAMBIYO" as DocumentSourceType,
      icon: Receipt,
      title: "Senet / Bono / Çek",
      description: "Kambiyo senedi (bono, poliçe, çek)",
      examples: ["Emre muharrer senet", "Hamiline çek", "Poliçe"],
      color: "green",
      nextFlow: "Kambiyo Takibi (Form 10)",
    },
    {
      type: "SOZLESME" as DocumentSourceType,
      icon: FileSignature,
      title: "Sözleşme / Fatura / Diğer",
      description: "Yazılı belge, sözleşme veya fatura",
      examples: ["Kira sözleşmesi", "Satış faturası", "Taahhütname"],
      color: "purple",
      nextFlow: "İlamsız Takip veya Kira Takibi",
    },
  ];

  // Dosya seçimi
  const handleFileSelect = (file: File) => {
    const lowerName = file.name.toLocaleLowerCase('tr-TR');
    
    // Uzantı kontrolü (MIME type güvenilir değil, uzantıya bak)
    const isPdf = lowerName.endsWith('.pdf');
    const isUdf = lowerName.endsWith('.udf');
    const isDocx = lowerName.endsWith('.docx');
    const isDoc = lowerName.endsWith('.doc') && !lowerName.endsWith('.docx');
    const isRtf = lowerName.endsWith('.rtf');
    const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.bmp'].some(ext => lowerName.endsWith(ext));
    const isTxt = lowerName.endsWith('.txt');
    
    // Desteklenen formatlar (artık .doc da destekleniyor)
    const isSupported = isPdf || isUdf || isDocx || isDoc || isRtf || isImage || isTxt;
    
    if (!isSupported) {
      setScanError('Desteklenmeyen dosya formatı. PDF, Word (DOC/DOCX), RTF, UDF, JPG, PNG, TIFF veya TXT yükleyin.');
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
      setScanError('Dosya boyutu 10MB\'dan büyük olamaz.');
      return;
    }
    setSelectedFile(file);
    setScanError(null);
  };

  // Drag & Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  // Dosya yükleme ve analiz
  const handleFileUpload = async () => {
    if (!selectedFile) return;

    setIsScanning(true);
    setScanError(null);
    setUploadProgress(0);

    try {
      // Progress simulation
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('useAI', useAI.toString());

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/ocr/classify-file`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Dosya analizi başarısız');
      }

      const data = await response.json();
      if (data.success) {
        setScanResult(data.result);
      } else {
        setScanError('Analiz yapılamadı');
      }
    } catch (error: any) {
      // Daha kullanıcı dostu hata mesajı
      const errorMsg = error.message || 'Dosya yüklenirken bir hata oluştu';
      if (errorMsg.includes('metin çıkarılamadı') || errorMsg.includes('okunamadı')) {
        setScanError('Görüntüden metin çıkarılamadı. Belgenin net ve okunaklı olduğundan emin olun veya aşağıdan manuel olarak takip türünü seçin.');
      } else {
        setScanError(errorMsg);
      }
    } finally {
      setIsScanning(false);
      setUploadProgress(0);
    }
  };

  // Metin analizi yap
  const handleTextAnalysis = async () => {
    if (!textInput.trim()) {
      setScanError("Lütfen analiz edilecek metin girin");
      return;
    }

    setIsScanning(true);
    setScanError(null);

    try {
      const response = await api.post("/cases/suggest-type", { text: textInput });
      if (response.data?.success) {
        setScanResult(response.data.suggestion);
      } else {
        setScanError("Analiz yapılamadı");
      }
    } catch (error: any) {
      setScanError(error.message || "Analiz sırasında bir hata oluştu");
    } finally {
      setIsScanning(false);
    }
  };

  // Sonucu kabul et
  const handleAcceptResult = () => {
    if (scanResult) {
      // DetectedType'a göre DocumentSourceType belirle
      let sourceType: DocumentSourceType = null;
      if (scanResult.detectedType === "ILAMLI") {
        sourceType = "ILAM";
      } else if (scanResult.detectedType === "KAMBIYO") {
        sourceType = "KAMBIYO";
      } else if (["ILAMSIZ", "KIRA", "IPOTEK", "REHIN"].includes(scanResult.detectedType)) {
        sourceType = "SOZLESME";
      }
      onSelect(sourceType, scanResult);
    }
  };

  // Sonucu reddet ve manuel seç
  const handleRejectResult = () => {
    setScanResult(null);
    setTextInput("");
    setShowTextInput(false);
  };

  const getColorClasses = (color: string, isHover = false) => {
    const colors: Record<string, { bg: string; border: string; text: string; hover: string }> = {
      blue: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", hover: "hover:border-blue-400 hover:bg-blue-50" },
      green: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", hover: "hover:border-green-400 hover:bg-green-50" },
      purple: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", hover: "hover:border-purple-400 hover:bg-purple-50" },
    };
    return colors[color] || colors.blue;
  };

  return (
    <div className="bg-white rounded-lg border p-3 sm:p-4 mb-3 sm:mb-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 sm:mb-4">
        <div className="p-1.5 bg-primary/10 rounded-lg">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-base">🧙‍♂️ Akıllı Takip Sihirbazı</h2>
          <p className="text-xs text-muted-foreground">
            Takibin dayanağı olan belge türünü seçin veya belgenizi taratın
          </p>
        </div>
      </div>

      {/* OCR Sonucu Gösterimi */}
      {scanResult && (
        <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-green-800 mb-1">
                📌 Sistem belgenize göre en uygun takip türünü belirledi
              </h3>
              <p className="text-lg font-bold text-green-900 mb-2">
                {scanResult.detectedType === "ILAMLI" && "İlamlı Takip"}
                {scanResult.detectedType === "KAMBIYO" && "Kambiyo Senetlerine Özgü Takip"}
                {scanResult.detectedType === "KIRA" && "Kira Alacağı Takibi"}
                {scanResult.detectedType === "IPOTEK" && "İpoteğin Paraya Çevrilmesi"}
                {scanResult.detectedType === "ILAMSIZ" && "İlamsız Takip"}
                {scanResult.detectedType === "UNKNOWN" && "Belirsiz - Manuel Seçim Önerilir"}
                {scanResult.detectedSubCategory && ` - ${scanResult.detectedSubCategory}`}
              </p>
              <p className="text-sm text-green-700 mb-3">{scanResult.explanation}</p>
              
              {/* Güven Skoru */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-green-600">Güven:</span>
                <div className="flex-1 h-2 bg-green-100 rounded-full max-w-[200px]">
                  <div 
                    className={`h-full rounded-full ${
                      scanResult.confidence >= 70 ? "bg-green-500" : 
                      scanResult.confidence >= 40 ? "bg-yellow-500" : "bg-red-500"
                    }`}
                    style={{ width: `${scanResult.confidence}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-green-700">%{scanResult.confidence}</span>
              </div>

              {/* Eşleşen Anahtar Kelimeler */}
              {scanResult.matchedKeywords.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {scanResult.matchedKeywords.slice(0, 6).map((keyword, i) => (
                    <span key={i} className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                      {keyword}
                    </span>
                  ))}
                </div>
              )}

              {/* Aksiyon Butonları */}
              <div className="flex gap-2">
                <button
                  onClick={handleAcceptResult}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  Kabul Et
                </button>
                <button
                  onClick={handleRejectResult}
                  className="px-4 py-2 border border-green-300 text-green-700 rounded-lg hover:bg-green-50 transition-colors flex items-center gap-2"
                >
                  <X className="h-4 w-4" />
                  Değiştir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Belge Tarama Seçenekleri */}
      {!scanResult && (
        <div className="mb-3 sm:mb-4">
          {/* Ana Tarama Butonu */}
          <button
            onClick={() => { setShowFileUpload(!showFileUpload); setShowTextInput(false); }}
            className="w-full p-2 sm:p-3 border-2 border-dashed border-primary/30 rounded-lg hover:border-primary hover:bg-primary/5 transition-all flex items-center gap-2 sm:gap-3 group"
          >
            <div className="p-1.5 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors flex-shrink-0">
              <ScanLine className="h-5 w-5 text-primary" />
            </div>
            <div className="text-left flex-1 min-w-0">
              <div className="font-medium text-primary text-sm">📄 Belgeni Tara – Takip Türünü Ben Belirleyeyim</div>
              <div className="text-xs text-muted-foreground hidden sm:block">
                PDF, görüntü veya metin yükleyin, sistem otomatik takip türünü önersin
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </button>

          {/* Dosya Yükleme Alanı */}
          {showFileUpload && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              {/* Tab Seçimi */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => { setShowTextInput(false); }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    !showTextInput ? 'bg-primary text-white' : 'bg-white border hover:bg-gray-100'
                  }`}
                >
                  <Upload className="h-4 w-4 inline mr-2" />
                  Dosya Yükle
                </button>
                <button
                  onClick={() => { setShowTextInput(true); setSelectedFile(null); }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    showTextInput ? 'bg-primary text-white' : 'bg-white border hover:bg-gray-100'
                  }`}
                >
                  <FileText className="h-4 w-4 inline mr-2" />
                  Metin Yapıştır
                </button>
              </div>

              {/* Dosya Yükleme */}
              {!showTextInput && (
                <div>
                  {/* Drag & Drop Alanı */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
                      isDragging 
                        ? 'border-primary bg-primary/5' 
                        : 'border-gray-300 hover:border-primary hover:bg-gray-100'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.udf,.doc,.docx,.rtf,.jpg,.jpeg,.png,.webp,.tiff,.tif,.bmp,.txt"
                      onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                      className="hidden"
                    />
                    <div className="flex justify-center gap-2 mb-3">
                      <File className="h-8 w-8 text-gray-400" />
                      <Image className="h-8 w-8 text-gray-400" />
                      <FileType className="h-8 w-8 text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-700 mb-1">
                      Dosyayı sürükleyip bırakın veya tıklayın
                    </p>
                    <p className="text-xs text-muted-foreground">
                      PDF, Word (DOC/DOCX), RTF, UDF, JPG, PNG, TIFF veya TXT (max 10MB)
                    </p>
                  </div>

                  {/* Seçilen Dosya */}
                  {selectedFile && (
                    <div className="mt-3 p-3 bg-white border rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 rounded-lg">
                          {selectedFile.type.includes('pdf') ? (
                            <FileText className="h-5 w-5 text-blue-600" />
                          ) : selectedFile.type.includes('image') ? (
                            <Image className="h-5 w-5 text-blue-600" />
                          ) : (
                            <File className="h-5 w-5 text-blue-600" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{selectedFile.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(selectedFile.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        <X className="h-4 w-4 text-gray-500" />
                      </button>
                    </div>
                  )}

                  {/* Progress Bar */}
                  {isScanning && uploadProgress > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>Analiz ediliyor...</span>
                        <span>%{uploadProgress}</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Metin Girişi */}
              {showTextInput && (
                <div>
                  <textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Mahkeme kararı, senet veya sözleşme metnini buraya yapıştırın..."
                    className="w-full h-32 p-3 border rounded-lg text-sm resize-none focus:outline-none focus:border-primary"
                  />
                </div>
              )}

              {/* Hata Mesajı */}
              {scanError && (
                <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  {scanError}
                </div>
              )}

              {/* AI Checkbox */}
              <div className="mt-4 p-3 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useAI}
                    onChange={(e) => setUseAI(e.target.checked)}
                    className="w-5 h-5 rounded border-purple-300 text-purple-600 focus:ring-purple-500"
                  />
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-600" />
                    <span className="font-medium text-purple-900">Yapay Zeka ile Yorumla</span>
                  </div>
                </label>
                <p className="text-xs text-purple-700 mt-1 ml-8">
                  OpenAI GPT ile daha akıllı belge analizi (daha yavaş ama daha doğru)
                </p>
              </div>

              {/* Aksiyon Butonları */}
              <div className="mt-4 flex gap-2">
                <button
                  onClick={showTextInput ? handleTextAnalysis : handleFileUpload}
                  disabled={isScanning || (showTextInput ? !textInput.trim() : !selectedFile)}
                  className={`px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                    useAI ? 'bg-purple-600 hover:bg-purple-700' : 'bg-primary hover:bg-primary/90'
                  }`}
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {useAI ? 'AI Analiz Ediyor...' : 'Analiz Ediliyor...'}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      {useAI ? 'AI ile Analiz Et' : 'Analiz Et'}
                    </>
                  )}
                </button>
                <button
                  onClick={() => { 
                    setShowFileUpload(false); 
                    setShowTextInput(false); 
                    setTextInput(""); 
                    setSelectedFile(null);
                    setScanError(null); 
                  }}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-100 transition-colors"
                >
                  İptal
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Belge Türü Kartları */}
      {!scanResult && (
        <>
          <div className="mb-2">
            <h3 className="text-xs font-medium text-muted-foreground">
              veya manuel olarak dayanak belge türünü seçin:
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            {documentCards.map((card) => {
              const colors = getColorClasses(card.color);
              const Icon = card.icon;
              
              return (
                <button
                  key={card.type}
                  onClick={() => onSelect(card.type)}
                  className={`p-2 sm:p-3 border-2 rounded-lg text-left transition-all ${colors.hover} group min-w-0`}
                >
                  <div className="flex sm:flex-col items-center sm:items-start gap-2 sm:gap-0">
                    <div className={`p-1.5 ${colors.bg} rounded-lg flex-shrink-0 sm:mb-2`}>
                      <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${colors.text}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-xs sm:text-sm truncate sm:whitespace-normal">{card.title}</h4>
                      <p className="text-xs text-muted-foreground hidden sm:block mt-1">{card.description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Skip Button - Sihirbazı Atlama */}
      <div className="mt-4 pt-3 border-t flex items-center justify-end">
        <button
          onClick={onSkip}
          className="px-3 py-1.5 text-xs sm:text-sm border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors flex items-center gap-1"
        >
          <ArrowRight className="h-3 w-3" />
          <span className="hidden sm:inline">Sihirbazı Atla,</span> Form Seçimine Git
        </button>
      </div>
    </div>
  );
}
