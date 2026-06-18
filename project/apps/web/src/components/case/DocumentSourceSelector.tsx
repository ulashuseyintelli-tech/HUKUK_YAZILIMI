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
  FileCheck,
} from "lucide-react";
import { api } from "@/lib/api";

// Dayanak belge türleri
export type DocumentSourceType = "ILAM" | "KAMBIYO" | "SOZLESME" | "VEKALETNAME" | null;

// OCR sınıflandırma sonucu
export interface ClassificationResult {
  detectedType: string;
  detectedSubCategory: string | null;
  confidence: number;
  matchedKeywords: string[];
  suggestedFormCode: string | null;
  explanation: string;
}

// Vekaletname tarama sonucu
export interface PoaScanResult {
  clientType: "PERSON" | "COMPANY" | "PUBLIC";
  firstName?: string;
  lastName?: string;
  companyName?: string;
  tckn?: string;
  vkn?: string;
  taxOffice?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  district?: string;
  poaNumber?: string;
  poaDate?: string;
  notaryName?: string;
  notaryCity?: string;
  canCollect: boolean;
  canWaive: boolean;
  canSettle: boolean;
  canRelease: boolean;
  lawyerName?: string;
  lawyerBarNumber?: string;
  lawyerBarCity?: string;
  isLimited?: boolean;
  validUntil?: string;
  scopeType?: "GENEL" | "ICRA_TAKIP" | "BU_DOSYA" | "OZEL";
  scopeDescription?: string;
  lawyers?: { name: string; barNumber?: string; barCity?: string; }[];
  confidence: number;
  rawText?: string;
}

interface DocumentSourceSelectorProps {
  onSelect: (sourceType: DocumentSourceType, ocrResult?: ClassificationResult) => void;
  onSkip: () => void;
  onPoaScan?: (result: PoaScanResult) => void;
}

export function DocumentSourceSelector({ onSelect, onSkip, onPoaScan }: DocumentSourceSelectorProps) {
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
  
  // Vekaletname tarama state'leri
  const [showPoaScanner, setShowPoaScanner] = useState(false);
  const [poaScanResult, setPoaScanResult] = useState<PoaScanResult | null>(null);
  const [poaScanning, setPoaScanning] = useState(false);
  const [poaFileName, setPoaFileName] = useState("");
  const poaFileInputRef = useRef<HTMLInputElement>(null);

  // Vekaletname dosya işleme
  const handlePoaFileSelect = async (file: File) => {
    const allowedExtensions = [".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".tif", ".doc", ".docx"];
    const fileExt = "." + file.name.split(".").pop()?.toLowerCase();
    
    if (!allowedExtensions.includes(fileExt)) {
      setScanError("Desteklenmeyen dosya formatı. PDF, Word, JPG, PNG veya TIFF yükleyin.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setScanError("Dosya boyutu 10MB'dan büyük olamaz.");
      return;
    }

    setPoaFileName(file.name);
    setScanError(null);
    setPoaScanning(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const token = localStorage.getItem("token");
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/api/ocr/scan-poa`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Vekaletname taranamadı");
      }

      const data = await response.json();
      const result = data.data || data;
      setPoaScanResult(result);
    } catch (err: any) {
      setScanError(err.message || "Vekaletname taranırken bir hata oluştu");
    } finally {
      setPoaScanning(false);
      if (poaFileInputRef.current) poaFileInputRef.current.value = "";
    }
  };

  // Vekaletname sonucunu kabul et
  const handleAcceptPoaResult = () => {
    if (poaScanResult && onPoaScan) {
      onPoaScan(poaScanResult);
    }
    setShowPoaScanner(false);
    setPoaScanResult(null);
  };

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
        <div className="mb-6 p-4 bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border border-emerald-200 rounded-xl shadow-sm">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-md">
              <CheckCircle className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-emerald-800 mb-1 flex items-center gap-2">
                📌 Sistem belgenize göre en uygun takip türünü belirledi
              </h3>
              <p className="text-lg font-bold text-emerald-900 mb-2">
                {scanResult.detectedType === "ILAMLI" && "İlamlı Takip"}
                {scanResult.detectedType === "KAMBIYO" && "Kambiyo Senetlerine Özgü Takip"}
                {scanResult.detectedType === "KIRA" && "Kira Alacağı Takibi"}
                {scanResult.detectedType === "IPOTEK" && "İpoteğin Paraya Çevrilmesi"}
                {scanResult.detectedType === "ILAMSIZ" && "İlamsız Takip"}
                {scanResult.detectedType === "UNKNOWN" && "Belirsiz - Manuel Seçim Önerilir"}
                {scanResult.detectedSubCategory && ` - ${scanResult.detectedSubCategory}`}
              </p>
              <p className="text-sm text-emerald-700 mb-3">{scanResult.explanation}</p>
              
              {/* Güven Skoru */}
              <div className="flex items-center gap-2 mb-3 p-2 bg-white/50 rounded-lg">
                <span className="text-xs text-emerald-600 font-medium">Güven:</span>
                <div className="flex-1 h-2 bg-emerald-100 rounded-full max-w-[200px]">
                  <div 
                    className={`h-full rounded-full ${
                      scanResult.confidence >= 70 ? "bg-emerald-500" : 
                      scanResult.confidence >= 40 ? "bg-yellow-500" : "bg-red-500"
                    }`}
                    style={{ width: `${scanResult.confidence}%` }}
                  />
                </div>
                <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${scanResult.confidence >= 70 ? "bg-emerald-100 text-emerald-700" : scanResult.confidence >= 40 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                  %{scanResult.confidence}
                </span>
              </div>

              {/* Eşleşen Anahtar Kelimeler */}
              {scanResult.matchedKeywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {scanResult.matchedKeywords.slice(0, 6).map((keyword, i) => (
                    <span key={i} className="px-2.5 py-1 bg-emerald-100 text-emerald-700 text-xs rounded-lg font-medium">
                      {keyword}
                    </span>
                  ))}
                </div>
              )}

              {/* Aksiyon Butonları */}
              <div className="flex gap-2 pt-2 border-t border-emerald-100">
                <button
                  onClick={handleAcceptResult}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  Kabul Et
                </button>
                <button
                  onClick={handleRejectResult}
                  className="px-4 py-2 border border-emerald-300 text-emerald-700 rounded-xl hover:bg-emerald-50 transition-colors flex items-center gap-2"
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
      {!scanResult && !poaScanResult && (
        <div className="mb-3 sm:mb-4 space-y-2">
          {/* Ana Tarama Butonu - Takip Türü + Borçlu + Vade Tespiti */}
          <button
            onClick={() => { setShowFileUpload(!showFileUpload); setShowTextInput(false); setShowPoaScanner(false); }}
            className="w-full p-3 sm:p-4 bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border-2 border-dashed border-emerald-300 rounded-xl hover:border-emerald-500 hover:shadow-md transition-all flex items-center gap-3 group"
          >
            <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-md group-hover:shadow-lg transition-shadow flex-shrink-0">
              <ScanLine className="h-5 w-5 text-white" />
            </div>
            <div className="text-left flex-1 min-w-0">
              <div className="font-semibold text-emerald-800 text-sm flex items-center gap-2">
                📄 Borç Evrakını Tara – Takip Türü, Borçlu ve Vadeyi Tespit Et
              </div>
              <div className="text-xs text-emerald-600/80 hidden sm:block mt-0.5">
                Fatura, senet, çek, kira sözleşmesi veya mahkeme kararı yükleyin - takip türü, borçlu ve vade otomatik tespit edilsin
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-emerald-500 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all flex-shrink-0" />
          </button>

          {/* Vekaletname Tarama Butonu */}
          <button
            onClick={() => { setShowPoaScanner(!showPoaScanner); setShowFileUpload(false); setShowTextInput(false); }}
            className="w-full p-3 sm:p-4 bg-gradient-to-r from-indigo-50 via-blue-50 to-cyan-50 border-2 border-dashed border-indigo-300 rounded-xl hover:border-indigo-500 hover:shadow-md transition-all flex items-center gap-3 group"
          >
            <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl shadow-md group-hover:shadow-lg transition-shadow flex-shrink-0">
              <FileCheck className="h-5 w-5 text-white" />
            </div>
            <div className="text-left flex-1 min-w-0">
              <div className="font-semibold text-indigo-800 text-sm flex items-center gap-2">
                📋 Vekaletname Tara – Müvekkil ve Vekalet Oluştur
              </div>
              <div className="text-xs text-indigo-600/80 hidden sm:block mt-0.5">
                Vekaletname tarayın, müvekkil ve vekalet kaydı otomatik oluşturulsun
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-indigo-500 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all flex-shrink-0" />
          </button>

          {/* Dosya Yükleme Alanı */}
          {showFileUpload && (
            <div className="mt-4 p-4 bg-gradient-to-br from-emerald-50/50 to-teal-50/50 rounded-xl border border-emerald-200">
              {/* Tab Seçimi */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => { setShowTextInput(false); }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    !showTextInput ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md' : 'bg-white border border-emerald-200 hover:bg-emerald-50'
                  }`}
                >
                  <Upload className="h-4 w-4 inline mr-2" />
                  Dosya Yükle
                </button>
                <button
                  onClick={() => { setShowTextInput(true); setSelectedFile(null); }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    showTextInput ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md' : 'bg-white border border-emerald-200 hover:bg-emerald-50'
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
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                      isDragging 
                        ? 'border-emerald-500 bg-emerald-100 scale-[1.02] shadow-lg' 
                        : 'border-emerald-300 hover:border-emerald-500 hover:bg-white/70 hover:shadow-md'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.udf,.doc,.docx,.rtf,.jpg,.jpeg,.png,.webp,.tiff,.tif,.bmp,.txt"
                      onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                      className="hidden"
                    />
                    <div className={`w-16 h-16 mx-auto mb-3 rounded-2xl flex items-center justify-center transition-colors ${isDragging ? "bg-emerald-200" : "bg-emerald-100"}`}>
                      <div className="flex gap-1">
                        <File className={`h-5 w-5 ${isDragging ? "text-emerald-600" : "text-emerald-400"}`} />
                        <Image className={`h-5 w-5 ${isDragging ? "text-emerald-600" : "text-emerald-400"}`} />
                        <FileType className={`h-5 w-5 ${isDragging ? "text-emerald-600" : "text-emerald-400"}`} />
                      </div>
                    </div>
                    <p className="text-sm font-medium text-emerald-800 mb-1">
                      {isDragging ? "Dosyayı Bırakın" : "Dosyayı sürükleyip bırakın veya tıklayın"}
                    </p>
                    <p className="text-xs text-emerald-600/80">
                      PDF, Word (DOC/DOCX), RTF, UDF, JPG, PNG, TIFF veya TXT (max 10MB)
                    </p>
                  </div>

                  {/* Seçilen Dosya */}
                  {selectedFile && (
                    <div className="mt-3 p-3 bg-white border border-emerald-200 rounded-xl flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-100 rounded-xl">
                          {selectedFile.type.includes('pdf') ? (
                            <FileText className="h-5 w-5 text-emerald-600" />
                          ) : selectedFile.type.includes('image') ? (
                            <Image className="h-5 w-5 text-emerald-600" />
                          ) : (
                            <File className="h-5 w-5 text-emerald-600" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-emerald-800">{selectedFile.name}</p>
                          <p className="text-xs text-emerald-600/70">
                            {(selectedFile.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                        className="p-1.5 hover:bg-emerald-50 rounded-lg transition-colors"
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
              <div className="mt-4 p-3 bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-xl">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useAI}
                    onChange={(e) => setUseAI(e.target.checked)}
                    className="w-5 h-5 rounded-lg border-violet-300 text-violet-600 focus:ring-violet-500"
                  />
                  <div className="flex items-center gap-2">
                    <div className="p-1 bg-violet-100 rounded-lg">
                      <Sparkles className="h-4 w-4 text-violet-600" />
                    </div>
                    <span className="font-medium text-violet-900">Yapay Zeka ile Yorumla</span>
                  </div>
                </label>
                <p className="text-xs text-violet-700 mt-1 ml-8">
                  OpenAI GPT ile daha akıllı belge analizi (daha yavaş ama daha doğru)
                </p>
              </div>

              {/* Aksiyon Butonları */}
              <div className="mt-4 flex gap-2">
                <button
                  onClick={showTextInput ? handleTextAnalysis : handleFileUpload}
                  disabled={isScanning || (showTextInput ? !textInput.trim() : !selectedFile)}
                  className={`px-5 py-2.5 text-white rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md hover:shadow-lg ${
                    useAI ? 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700' : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700'
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
                  className="px-4 py-2 border border-gray-300 rounded-xl hover:bg-white/70 transition-colors"
                >
                  İptal
                </button>
              </div>
            </div>
          )}

          {/* Vekaletname Tarama Alanı */}
          {showPoaScanner && (
            <div className="mt-4 p-4 bg-gradient-to-br from-indigo-50/50 to-blue-50/50 rounded-xl border border-indigo-200">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-lg">
                  <FileCheck className="h-4 w-4 text-white" />
                </div>
                <span className="font-semibold text-indigo-800">Vekaletname Tarama</span>
              </div>

              {/* Drag & Drop Alanı */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); const file = e.dataTransfer.files[0]; if (file) handlePoaFileSelect(file); }}
                onClick={() => poaFileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                  isDragging ? 'border-indigo-500 bg-indigo-100 scale-[1.02] shadow-lg' : 'border-indigo-300 hover:border-indigo-500 hover:bg-white/70 hover:shadow-md'
                }`}
              >
                <input
                  ref={poaFileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.tiff,.doc,.docx"
                  onChange={(e) => e.target.files?.[0] && handlePoaFileSelect(e.target.files[0])}
                  className="hidden"
                />
                {poaScanning ? (
                  <div className="py-4">
                    <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-indigo-100 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
                    </div>
                    <p className="text-sm font-medium text-indigo-700">Vekaletname taranıyor...</p>
                    <p className="text-xs text-indigo-600">{poaFileName}</p>
                    <div className="mt-3 mx-auto max-w-xs">
                      <div className="h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full animate-pulse" style={{ width: '60%' }} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={`w-16 h-16 mx-auto mb-3 rounded-2xl flex items-center justify-center transition-colors ${isDragging ? "bg-indigo-200" : "bg-indigo-100"}`}>
                      <FileCheck className={`h-8 w-8 ${isDragging ? "text-indigo-600" : "text-indigo-400"}`} />
                    </div>
                    <p className="text-sm font-medium text-indigo-800 mb-1">
                      {isDragging ? "Dosyayı Bırakın" : "Vekaletname dosyasını sürükleyin veya tıklayın"}
                    </p>
                    <p className="text-xs text-indigo-600/80">PDF, Word, JPG, PNG veya TIFF (max 10MB)</p>
                  </>
                )}
              </div>

              {/* Hata Mesajı */}
              {scanError && (
                <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  {scanError}
                </div>
              )}

              {/* Bilgi Notu */}
              <div className="mt-3 p-2.5 bg-indigo-100/70 rounded-xl">
                <p className="text-xs text-indigo-700">
                  <strong>💡 İpucu:</strong> Vekaletname tarandığında müvekkil bilgileri ve vekalet kaydı otomatik oluşturulur. 
                  Ardından takip türü seçimine devam edebilirsiniz.
                </p>
              </div>

              {/* İptal Butonu */}
              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => { setShowPoaScanner(false); setScanError(null); }}
                  className="px-4 py-2 border border-indigo-300 text-indigo-700 rounded-xl hover:bg-indigo-50 transition-colors"
                >
                  İptal
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Vekaletname Tarama Sonucu */}
      {poaScanResult && (
        <div className="mb-6 p-4 bg-gradient-to-r from-indigo-50 via-blue-50 to-cyan-50 border border-indigo-200 rounded-xl shadow-sm">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl shadow-md">
              <FileCheck className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-indigo-800 mb-3 flex items-center gap-2">
                📋 Vekaletname Tarama Sonucu
              </h3>
              
              <div className="grid grid-cols-2 gap-4 mb-3">
                {/* Müvekkil Bilgileri */}
                <div className="p-3 bg-white rounded-xl border shadow-sm">
                  <p className="text-xs font-semibold text-indigo-800 mb-2 border-b border-indigo-100 pb-1 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                    Müvekkil Bilgileri
                  </p>
                  <div className="space-y-1 text-xs">
                    <p><span className="text-gray-500">Tür:</span> <span className="font-medium">{poaScanResult.clientType === "PERSON" ? "Şahıs" : poaScanResult.clientType === "COMPANY" ? "Kurum" : "Kamu"}</span></p>
                    {poaScanResult.firstName && <p><span className="text-gray-500">Ad Soyad:</span> <span className="font-medium">{poaScanResult.firstName} {poaScanResult.lastName}</span></p>}
                    {poaScanResult.companyName && <p><span className="text-gray-500">Kurum:</span> <span className="font-medium">{poaScanResult.companyName}</span></p>}
                    {poaScanResult.tckn && <p><span className="text-gray-500">TCKN:</span> <span className="font-mono">{poaScanResult.tckn}</span></p>}
                    {poaScanResult.vkn && <p><span className="text-gray-500">VKN:</span> <span className="font-mono">{poaScanResult.vkn}</span></p>}
                    {poaScanResult.address && <p><span className="text-gray-500">Adres:</span> <span className="font-medium">{poaScanResult.address}</span></p>}
                    {(poaScanResult.city || poaScanResult.district) && (
                      <p><span className="text-gray-500">İl/İlçe:</span> <span className="font-medium">{[poaScanResult.district, poaScanResult.city].filter(Boolean).join(" / ")}</span></p>
                    )}
                  </div>
                </div>

                {/* Vekalet Bilgileri */}
                <div className="p-3 bg-white rounded-xl border shadow-sm">
                  <p className="text-xs font-semibold text-indigo-800 mb-2 border-b border-indigo-100 pb-1 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                    Vekalet Bilgileri
                  </p>
                  <div className="space-y-1 text-xs">
                    {poaScanResult.poaNumber && <p><span className="text-gray-500">Yevmiye No:</span> <span className="font-medium">{poaScanResult.poaNumber}</span></p>}
                    {poaScanResult.poaDate && <p><span className="text-gray-500">Tarih:</span> <span>{poaScanResult.poaDate}</span></p>}
                    {poaScanResult.notaryName && <p><span className="text-gray-500">Noter:</span> <span>{poaScanResult.notaryName}{poaScanResult.notaryCity ? ` (${poaScanResult.notaryCity})` : ""}</span></p>}
                    {poaScanResult.isLimited ? (
                      <p><span className="text-gray-500">Geçerlilik:</span> <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-lg text-xs">Süreli - {poaScanResult.validUntil && new Date(poaScanResult.validUntil).toLocaleDateString("tr-TR")}</span></p>
                    ) : (
                      <p><span className="text-gray-500">Geçerlilik:</span> <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded-lg text-xs">Süresiz</span></p>
                    )}
                    {/* Vekiller */}
                    {poaScanResult.lawyers && poaScanResult.lawyers.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <p className="text-gray-500 mb-1">Vekiller:</p>
                        {poaScanResult.lawyers.map((lawyer, idx) => (
                          <p key={idx} className="font-medium text-indigo-700">• {lawyer.name}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Güven Skoru */}
              <div className="flex items-center gap-2 mb-3 p-2 bg-white/50 rounded-lg">
                <span className="text-xs text-indigo-600 font-medium">Güven:</span>
                <div className="flex-1 h-2 bg-indigo-100 rounded-full max-w-[200px]">
                  <div 
                    className={`h-full rounded-full ${poaScanResult.confidence >= 70 ? "bg-green-500" : poaScanResult.confidence >= 40 ? "bg-yellow-500" : "bg-red-500"}`}
                    style={{ width: `${poaScanResult.confidence}%` }}
                  />
                </div>
                <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${poaScanResult.confidence >= 70 ? "bg-green-100 text-green-700" : poaScanResult.confidence >= 40 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                  %{poaScanResult.confidence}
                </span>
              </div>

              {/* Aksiyon Butonları */}
              <div className="flex gap-2 pt-2 border-t border-indigo-100">
                <button
                  onClick={handleAcceptPoaResult}
                  className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl hover:from-indigo-700 hover:to-blue-700 transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  Müvekkil ve Vekalet Oluştur
                </button>
                <button
                  onClick={() => { setPoaScanResult(null); setShowPoaScanner(true); }}
                  className="px-4 py-2 border border-indigo-300 text-indigo-700 rounded-xl hover:bg-indigo-50 transition-colors flex items-center gap-2"
                >
                  <X className="h-4 w-4" />
                  Farklı Dosya Yükle
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Belge Türü Kartları */}
      {!scanResult && !poaScanResult && (
        <>
          <div className="mb-2">
            <h3 className="text-xs font-medium text-muted-foreground">
              veya manuel olarak dayanak belge türünü seçin:
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            {documentCards.map((card) => {
              const Icon = card.icon;
              const colorStyles = {
                blue: { gradient: "from-blue-500 to-indigo-600", bg: "bg-blue-50", border: "border-blue-200 hover:border-blue-400", text: "text-blue-800" },
                green: { gradient: "from-emerald-500 to-teal-600", bg: "bg-emerald-50", border: "border-emerald-200 hover:border-emerald-400", text: "text-emerald-800" },
                purple: { gradient: "from-purple-500 to-violet-600", bg: "bg-purple-50", border: "border-purple-200 hover:border-purple-400", text: "text-purple-800" },
              };
              const style = colorStyles[card.color as keyof typeof colorStyles] || colorStyles.blue;
              
              return (
                <button
                  key={card.type}
                  onClick={() => onSelect(card.type)}
                  className={`p-3 sm:p-4 border-2 rounded-xl text-left transition-all ${style.bg} ${style.border} hover:shadow-md group min-w-0`}
                >
                  <div className="flex sm:flex-col items-center sm:items-start gap-2 sm:gap-0">
                    <div className={`p-2 bg-gradient-to-br ${style.gradient} rounded-xl shadow-sm flex-shrink-0 sm:mb-2`}>
                      <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className={`font-semibold text-xs sm:text-sm truncate sm:whitespace-normal ${style.text}`}>{card.title}</h4>
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
      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-end">
        <button
          onClick={onSkip}
          className="px-4 py-2 text-xs sm:text-sm border border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 hover:shadow-sm transition-all flex items-center gap-1.5 text-gray-600 hover:text-gray-800"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Sihirbazı Atla,</span> Form Seçimine Git
        </button>
      </div>
    </div>
  );
}
