"use client";

import React, { useState, useRef } from "react";
import { Upload, Loader2, Check, X, FileText, AlertCircle, ScanLine } from "lucide-react";
import { MAX_OCR_UPLOAD_LABEL } from "@/lib/upload-limits";

interface PoaScanResult {
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
  // Süreli vekalet bilgileri
  isLimited?: boolean;
  validUntil?: string;
  scopeType?: "GENEL" | "ICRA_TAKIP" | "BU_DOSYA" | "OZEL";
  scopeDescription?: string;
  // Çoklu avukat
  lawyers?: {
    name: string;
    barNumber?: string;
    barCity?: string;
  }[];
  confidence: number;
  rawText?: string;
}

interface PoaScannerWizardProps {
  onScanComplete: (result: PoaScanResult) => void;
  onClose?: () => void;
  compact?: boolean; // Kompakt mod (sadece buton)
  asButton?: boolean; // Buton olarak göster, tıklanınca modal aç
}

export function PoaScannerWizard({ onScanComplete, onClose, compact = false, asButton = false }: PoaScannerWizardProps) {
  const [step, setStep] = useState<"upload" | "scanning" | "review">("upload");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PoaScanResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Dosya işleme fonksiyonu (hem input hem drag için ortak)
  const processFile = async (file: File) => {
    // Dosya türü kontrolü
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/tiff",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    const allowedExtensions = [".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".tif", ".doc", ".docx"];
    const fileExt = "." + file.name.split(".").pop()?.toLowerCase();
    
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExt)) {
      setError("Desteklenmeyen dosya formatı. PDF, Word, JPG, PNG veya TIFF yükleyin.");
      return;
    }

    setFileName(file.name);
    setError(null);
    setScanning(true);
    setStep("scanning");

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
      const scanResult = data.data || data;

      setResult(scanResult);
      setStep("review");
    } catch (err: any) {
      setError(err.message || "Vekaletname taranırken bir hata oluştu");
      setStep("upload");
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  // Drag & Drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Sadece drop zone'dan çıkıldığında
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await processFile(files[0]);
    }
  };

  const handleAccept = () => {
    if (result) {
      onScanComplete(result);
      setShowModal(false);
      setStep("upload");
      setResult(null);
      if (onClose) onClose();
    }
  };

  const handleRetry = () => {
    setResult(null);
    setError(null);
    setStep("upload");
    fileInputRef.current?.click();
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setStep("upload");
    setResult(null);
    setError(null);
    if (onClose) onClose();
  };

  // Kompakt mod - sadece buton
  if (compact) {
    return (
      <div className="relative">
        <label
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded cursor-pointer transition-colors ${
            scanning
              ? "bg-blue-100 text-blue-600"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {scanning ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Taranıyor...
            </>
          ) : (
            <>
              <Upload className="h-3.5 w-3.5" />
              Vekaletname Tara
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.tiff,.doc,.docx"
            onChange={handleFileSelect}
            className="hidden"
            disabled={scanning}
          />
        </label>
        {error && (
          <div className="absolute top-full left-0 mt-1 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600 whitespace-nowrap z-10">
            {error}
          </div>
        )}
      </div>
    );
  }

  // Buton modu - tıklanınca modal açılır
  if (asButton) {
    return (
      <>
        {/* Trigger Butonu - Manuel Ekle ile tutarlı tasarım */}
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="p-4 bg-gradient-to-r from-indigo-50 to-blue-50 border-2 border-dashed border-indigo-300 rounded-xl hover:border-indigo-500 hover:shadow-md transition-all flex items-center gap-3 group w-full"
        >
          <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl shadow-md group-hover:shadow-lg transition-shadow">
            <ScanLine className="h-5 w-5 text-white" />
          </div>
          <div className="text-left">
            <div className="font-semibold text-indigo-800 text-sm">📋 Vekaletname Tara</div>
            <div className="text-xs text-indigo-600/80">AI ile vekaletnameden otomatik bilgi çıkarın</div>
          </div>
        </button>

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && handleCloseModal()}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-1">
              <WizardContent
                step={step}
                scanning={scanning}
                error={error}
                result={result}
                fileName={fileName}
                isDragging={isDragging}
                fileInputRef={fileInputRef}
                dropZoneRef={dropZoneRef}
                handleFileSelect={handleFileSelect}
                handleDragEnter={handleDragEnter}
                handleDragLeave={handleDragLeave}
                handleDragOver={handleDragOver}
                handleDrop={handleDrop}
                handleAccept={handleAccept}
                handleRetry={handleRetry}
                onClose={handleCloseModal}
              />
            </div>
          </div>
        )}
      </>
    );
  }

  // Wizard Content bileşeni
  function WizardContent({
    step,
    scanning,
    error,
    result,
    fileName,
    isDragging,
    fileInputRef,
    dropZoneRef,
    handleFileSelect,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleAccept,
    handleRetry,
    onClose,
  }: {
    step: "upload" | "scanning" | "review";
    scanning: boolean;
    error: string | null;
    result: PoaScanResult | null;
    fileName: string;
    isDragging: boolean;
    fileInputRef: React.RefObject<HTMLInputElement>;
    dropZoneRef: React.RefObject<HTMLDivElement>;
    handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleDragEnter: (e: React.DragEvent) => void;
    handleDragLeave: (e: React.DragEvent) => void;
    handleDragOver: (e: React.DragEvent) => void;
    handleDrop: (e: React.DragEvent) => void;
    handleAccept: () => void;
    handleRetry: () => void;
    onClose: () => void;
  }) {
    return (
      <div className="p-4 bg-gradient-to-br from-indigo-50 via-blue-50 to-cyan-50 rounded-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl shadow-md">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-indigo-900 flex items-center gap-2">
                📋 Vekaletname Tarama Sihirbazı
              </h3>
              <p className="text-xs text-indigo-600">
                AI destekli otomatik bilgi çıkarma
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white/50 rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step: Upload */}
        {step === "upload" && (
          <div className="text-center py-4">
            <div
              ref={dropZoneRef}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-6 transition-all cursor-pointer ${
                isDragging
                  ? "border-indigo-500 bg-indigo-100 scale-[1.02] shadow-lg"
                  : "border-indigo-300 hover:border-indigo-500 hover:bg-white/70 hover:shadow-md"
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className={`w-16 h-16 mx-auto mb-3 rounded-2xl flex items-center justify-center transition-colors ${isDragging ? "bg-indigo-200" : "bg-indigo-100"}`}>
                <Upload className={`h-8 w-8 transition-colors ${isDragging ? "text-indigo-600" : "text-indigo-400"}`} />
              </div>
              <p className="text-sm font-medium text-indigo-800 mb-1">
                {isDragging ? "Dosyayı Bırakın" : "Vekaletname Dosyası Yükleyin"}
              </p>
              <p className="text-xs text-indigo-600 mb-3">
                {isDragging ? "Dosya algılandı, bırakabilirsiniz" : "Sürükle-bırak veya tıklayarak seçin"}
              </p>
              <p className="text-xs text-gray-500 mb-3">
                PDF, Word, JPG, PNG veya TIFF formatında (max {MAX_OCR_UPLOAD_LABEL})
              </p>
              {!isDragging && (
                <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-sm rounded-xl hover:from-indigo-700 hover:to-blue-700 shadow-md hover:shadow-lg transition-all">
                  <Upload className="h-4 w-4" />
                  Dosya Seç
                </span>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.tiff,.doc,.docx"
              onChange={handleFileSelect}
              className="hidden"
            />
            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}
          </div>
        )}

        {/* Step: Scanning */}
        {step === "scanning" && (
          <div className="text-center py-8">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-100 to-blue-100 flex items-center justify-center">
              <Loader2 className="h-10 w-10 text-indigo-600 animate-spin" />
            </div>
            <p className="text-sm font-medium text-indigo-800 mb-1">
              Vekaletname Taranıyor...
            </p>
            <p className="text-xs text-indigo-600 font-medium">{fileName}</p>
            <p className="text-xs text-gray-500 mt-2">
              AI ile metin analizi yapılıyor, lütfen bekleyin
            </p>
            <div className="mt-4 mx-auto max-w-xs">
              <div className="h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
            </div>
          </div>
        )}

        {/* Step: Review */}
        {step === "review" && result && (
          <div className="space-y-4">
            {/* Güven Skoru */}
            <div className="flex items-center justify-between p-3 bg-white rounded-xl border shadow-sm">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-green-100 rounded-lg">
                  <Check className="h-4 w-4 text-green-600" />
                </div>
                <span className="text-sm font-medium text-gray-800">Tarama Tamamlandı</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${
                      result.confidence >= 70 ? "bg-green-500" : 
                      result.confidence >= 40 ? "bg-amber-500" : "bg-red-500"
                    }`}
                    style={{ width: `${result.confidence}%` }}
                  />
                </div>
                <span
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                    result.confidence >= 70
                      ? "bg-green-100 text-green-700"
                      : result.confidence >= 40
                      ? "bg-amber-100 text-amber-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  %{result.confidence}
                </span>
              </div>
            </div>

            {/* Bulunan Bilgiler */}
            <div className="grid grid-cols-2 gap-3">
              {/* Müvekkil Bilgileri */}
              <div className="p-3 bg-white rounded-xl border shadow-sm">
                <p className="text-xs font-semibold text-indigo-800 mb-2 border-b border-indigo-100 pb-1 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                  Müvekkil Bilgileri
                </p>
                <div className="space-y-1 text-xs">
                  <p>
                    <span className="text-gray-500">Tür:</span>{" "}
                    <span className="font-medium">
                      {result.clientType === "PERSON"
                        ? "Şahıs"
                        : result.clientType === "COMPANY"
                        ? "Kurum"
                        : "Kamu"}
                    </span>
                  </p>
                  {result.firstName && (
                    <p>
                      <span className="text-gray-500">Ad Soyad:</span>{" "}
                      <span className="font-medium">
                        {result.firstName} {result.lastName}
                      </span>
                    </p>
                  )}
                  {result.companyName && (
                    <p>
                      <span className="text-gray-500">Kurum:</span>{" "}
                      <span className="font-medium">{result.companyName}</span>
                    </p>
                  )}
                  {result.tckn && (
                    <p>
                      <span className="text-gray-500">TCKN:</span>{" "}
                      <span className="font-mono">{result.tckn}</span>
                    </p>
                  )}
                  {result.vkn && (
                    <p>
                      <span className="text-gray-500">VKN:</span>{" "}
                      <span className="font-mono">{result.vkn}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Vekaletname Bilgileri */}
              <div className="p-3 bg-white rounded-xl border shadow-sm">
                <p className="text-xs font-semibold text-indigo-800 mb-2 border-b border-indigo-100 pb-1 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                  Vekaletname Bilgileri
                </p>
                <div className="space-y-1 text-xs">
                  {result.poaNumber && (
                    <p>
                      <span className="text-gray-500">Yevmiye No:</span>{" "}
                      <span className="font-medium">{result.poaNumber}</span>
                    </p>
                  )}
                  {result.poaDate && (
                    <p>
                      <span className="text-gray-500">Tarih:</span>{" "}
                      <span>{result.poaDate}</span>
                    </p>
                  )}
                  {result.notaryName && (
                    <p>
                      <span className="text-gray-500">Noter:</span>{" "}
                      <span>
                        {result.notaryName}
                        {result.notaryCity && ` - ${result.notaryCity}`}
                      </span>
                    </p>
                  )}
                  {result.lawyerName && (
                    <p>
                      <span className="text-gray-500">Avukat:</span>{" "}
                      <span className="font-medium">{result.lawyerName}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Yetkiler */}
            <div className="p-3 bg-white rounded-xl border shadow-sm">
              <p className="text-xs font-semibold text-indigo-800 mb-2">Yetkiler:</p>
              <div className="flex flex-wrap gap-1">
                {result.canCollect && (
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs">Ahzu Kabza</span>
                )}
                {result.canWaive && (
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs">Feragat</span>
                )}
                {result.canSettle && (
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs">Sulh</span>
                )}
                {result.canRelease && (
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs">İbra</span>
                )}
              </div>
            </div>

            {/* Butonlar */}
            <div className="flex justify-between items-center pt-3 border-t border-indigo-100">
              <button
                onClick={handleRetry}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-white/70 rounded-lg transition-colors"
              >
                Farklı Dosya Yükle
              </button>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-xl hover:bg-white/70 transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={handleAccept}
                  className="px-5 py-2 text-sm bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl hover:from-indigo-700 hover:to-blue-700 shadow-md hover:shadow-lg transition-all flex items-center gap-1.5"
                >
                  <Check className="h-4 w-4" />
                  Bilgileri Kullan
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Tam sihirbaz modu
  return (
    <div className="p-4 bg-gradient-to-br from-indigo-50 via-blue-50 to-cyan-50 rounded-xl border border-indigo-200 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl shadow-md">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-indigo-900 flex items-center gap-2">
              📋 Vekaletname Tarama Sihirbazı
            </h3>
            <p className="text-xs text-indigo-600">
              AI destekli otomatik bilgi çıkarma
            </p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white/50 rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Step: Upload */}
      {step === "upload" && (
        <div className="text-center py-4">
          <div
            ref={dropZoneRef}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-6 transition-all cursor-pointer ${
              isDragging
                ? "border-indigo-500 bg-indigo-100 scale-[1.02] shadow-lg"
                : "border-indigo-300 hover:border-indigo-500 hover:bg-white/70 hover:shadow-md"
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className={`w-16 h-16 mx-auto mb-3 rounded-2xl flex items-center justify-center transition-colors ${isDragging ? "bg-indigo-200" : "bg-indigo-100"}`}>
              <Upload className={`h-8 w-8 transition-colors ${isDragging ? "text-indigo-600" : "text-indigo-400"}`} />
            </div>
            <p className="text-sm font-medium text-indigo-800 mb-1">
              {isDragging ? "Dosyayı Bırakın" : "Vekaletname Dosyası Yükleyin"}
            </p>
            <p className="text-xs text-indigo-600 mb-3">
              {isDragging ? "Dosya algılandı, bırakabilirsiniz" : "Sürükle-bırak veya tıklayarak seçin"}
            </p>
            <p className="text-xs text-gray-500 mb-3">
              PDF, Word, JPG, PNG veya TIFF formatında (max {MAX_OCR_UPLOAD_LABEL})
            </p>
            {!isDragging && (
              <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-sm rounded-xl hover:from-indigo-700 hover:to-blue-700 shadow-md hover:shadow-lg transition-all">
                <Upload className="h-4 w-4" />
                Dosya Seç
              </span>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.tiff,.doc,.docx"
            onChange={handleFileSelect}
            className="hidden"
          />
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </div>
      )}

      {/* Step: Scanning */}
      {step === "scanning" && (
        <div className="text-center py-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-100 to-blue-100 flex items-center justify-center">
            <Loader2 className="h-10 w-10 text-indigo-600 animate-spin" />
          </div>
          <p className="text-sm font-medium text-indigo-800 mb-1">
            Vekaletname Taranıyor...
          </p>
          <p className="text-xs text-indigo-600 font-medium">{fileName}</p>
          <p className="text-xs text-gray-500 mt-2">
            AI ile metin analizi yapılıyor, lütfen bekleyin
          </p>
          <div className="mt-4 mx-auto max-w-xs">
            <div className="h-1.5 bg-indigo-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        </div>
      )}

      {/* Step: Review */}
      {step === "review" && result && (
        <div className="space-y-4">
          {/* Güven Skoru */}
          <div className="flex items-center justify-between p-3 bg-white rounded-xl border shadow-sm">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-green-100 rounded-lg">
                <Check className="h-4 w-4 text-green-600" />
              </div>
              <span className="text-sm font-medium text-gray-800">Tarama Tamamlandı</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full ${
                    result.confidence >= 70 ? "bg-green-500" : 
                    result.confidence >= 40 ? "bg-amber-500" : "bg-red-500"
                  }`}
                  style={{ width: `${result.confidence}%` }}
                />
              </div>
              <span
                className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                  result.confidence >= 70
                    ? "bg-green-100 text-green-700"
                    : result.confidence >= 40
                    ? "bg-amber-100 text-amber-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                %{result.confidence}
              </span>
            </div>
          </div>

          {/* Bulunan Bilgiler */}
          <div className="grid grid-cols-2 gap-3">
            {/* Müvekkil Bilgileri */}
            <div className="p-3 bg-white rounded-xl border shadow-sm">
              <p className="text-xs font-semibold text-indigo-800 mb-2 border-b border-indigo-100 pb-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                Müvekkil Bilgileri
              </p>
              <div className="space-y-1 text-xs">
                <p>
                  <span className="text-gray-500">Tür:</span>{" "}
                  <span className="font-medium">
                    {result.clientType === "PERSON"
                      ? "Şahıs"
                      : result.clientType === "COMPANY"
                      ? "Kurum"
                      : "Kamu"}
                  </span>
                </p>
                {result.firstName && (
                  <p>
                    <span className="text-gray-500">Ad Soyad:</span>{" "}
                    <span className="font-medium">
                      {result.firstName} {result.lastName}
                    </span>
                  </p>
                )}
                {result.companyName && (
                  <p>
                    <span className="text-gray-500">Kurum:</span>{" "}
                    <span className="font-medium">{result.companyName}</span>
                  </p>
                )}
                {result.tckn && (
                  <p>
                    <span className="text-gray-500">TCKN:</span>{" "}
                    <span className="font-mono">{result.tckn}</span>
                  </p>
                )}
                {result.vkn && (
                  <p>
                    <span className="text-gray-500">VKN:</span>{" "}
                    <span className="font-mono">{result.vkn}</span>
                  </p>
                )}
                {result.address && (
                  <p>
                    <span className="text-gray-500">Adres:</span>{" "}
                    <span>{result.address}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Vekaletname Bilgileri */}
            <div className="p-3 bg-white rounded-xl border shadow-sm">
              <p className="text-xs font-semibold text-indigo-800 mb-2 border-b border-indigo-100 pb-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                Vekaletname Bilgileri
              </p>
              <div className="space-y-1 text-xs">
                {result.poaNumber && (
                  <p>
                    <span className="text-gray-500">Yevmiye No:</span>{" "}
                    <span className="font-medium">{result.poaNumber}</span>
                  </p>
                )}
                {result.poaDate && (
                  <p>
                    <span className="text-gray-500">Tarih:</span>{" "}
                    <span>{result.poaDate}</span>
                  </p>
                )}
                {result.notaryName && (
                  <p>
                    <span className="text-gray-500">Noter:</span>{" "}
                    <span>
                      {result.notaryName}
                      {result.notaryCity && ` - ${result.notaryCity}`}
                    </span>
                  </p>
                )}
                
                {/* Süreli Vekalet Bilgisi */}
                <div className="pt-2 border-t mt-2">
                  <p className="text-gray-500 mb-1">Geçerlilik:</p>
                  {result.isLimited ? (
                    <div className="flex items-center gap-1">
                      <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                        Süreli Vekalet
                      </span>
                      {result.validUntil && (
                        <span className="text-amber-700 text-xs">
                          {new Date(result.validUntil).toLocaleDateString("tr-TR")}&apos;e kadar
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                      Süresiz
                    </span>
                  )}
                </div>

                {/* Kapsam */}
                {result.scopeType && result.scopeType !== "GENEL" && (
                  <div className="pt-1">
                    <p className="text-gray-500 mb-1">Kapsam:</p>
                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                      result.scopeType === "ICRA_TAKIP" ? "bg-blue-100 text-blue-700" :
                      result.scopeType === "BU_DOSYA" ? "bg-purple-100 text-purple-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>
                      {result.scopeType === "ICRA_TAKIP" ? "İcra Takipleri" :
                       result.scopeType === "BU_DOSYA" ? "Bu Dosya İçin" :
                       result.scopeType === "OZEL" ? "Özel Kapsam" : "Genel"}
                    </span>
                    {result.scopeDescription && (
                      <p className="text-gray-500 text-xs mt-1">{result.scopeDescription}</p>
                    )}
                  </div>
                )}

                {/* Avukatlar */}
                <div className="pt-2 border-t mt-2">
                  <p className="text-gray-500 mb-1">Vekil(ler):</p>
                  {result.lawyers && result.lawyers.length > 0 ? (
                    <div className="space-y-1">
                      {result.lawyers.map((lawyer, idx) => (
                        <p key={idx} className="text-xs">
                          <span className="font-medium">{lawyer.name}</span>
                          {lawyer.barNumber && <span className="text-gray-500"> #{lawyer.barNumber}</span>}
                          {lawyer.barCity && <span className="text-gray-400"> ({lawyer.barCity})</span>}
                        </p>
                      ))}
                    </div>
                  ) : result.lawyerName ? (
                    <p>
                      <span className="font-medium">{result.lawyerName}</span>
                      {result.lawyerBarNumber && <span className="text-gray-500"> #{result.lawyerBarNumber}</span>}
                    </p>
                  ) : (
                    <span className="text-gray-400">Tespit edilemedi</span>
                  )}
                </div>

                {/* Yetkiler */}
                <div className="pt-2 border-t mt-2">
                  <p className="text-gray-500 mb-1">Yetkiler:</p>
                  <div className="flex flex-wrap gap-1">
                    {result.canCollect && (
                      <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                        Ahzu Kabza
                      </span>
                    )}
                    {result.canWaive && (
                      <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                        Feragat
                      </span>
                    )}
                    {result.canSettle && (
                      <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                        Sulh
                      </span>
                    )}
                    {result.canRelease && (
                      <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                        İbra
                      </span>
                    )}
                    {!result.canCollect &&
                      !result.canWaive &&
                      !result.canSettle &&
                      !result.canRelease && (
                        <span className="text-gray-400">Tespit edilemedi</span>
                      )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Uyarılar */}
          {result.confidence < 70 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
              <div className="p-1 bg-amber-100 rounded-lg">
                <AlertCircle className="h-4 w-4 text-amber-600" />
              </div>
              <div className="text-xs text-amber-700">
                <p className="font-medium">Düşük Güven Skoru</p>
                <p>
                  Bazı bilgiler doğru çıkarılamamış olabilir. Lütfen bilgileri
                  kontrol edin ve gerekirse düzeltin.
                </p>
              </div>
            </div>
          )}
          
          {/* Süreli vekalet uyarısı */}
          {result.isLimited && result.validUntil && (
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-start gap-2">
              <div className="p-1 bg-indigo-100 rounded-lg">
                <AlertCircle className="h-4 w-4 text-indigo-600" />
              </div>
              <div className="text-xs text-indigo-700">
                <p className="font-medium">Süreli Vekalet Tespit Edildi</p>
                <p>
                  Bu vekalet <strong>{new Date(result.validUntil).toLocaleDateString("tr-TR")}</strong> tarihine kadar geçerlidir.
                  Süre dolduğunda sistem sizi uyaracaktır.
                </p>
              </div>
            </div>
          )}

          {/* Butonlar */}
          <div className="flex justify-between items-center pt-3 border-t border-indigo-100">
            <button
              onClick={handleRetry}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-white/70 rounded-lg transition-colors"
            >
              Farklı Dosya Yükle
            </button>
            <div className="flex gap-2">
              {onClose && (
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-xl hover:bg-white/70 transition-colors"
                >
                  İptal
                </button>
              )}
              <button
                onClick={handleAccept}
                className="px-5 py-2 text-sm bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl hover:from-indigo-700 hover:to-blue-700 shadow-md hover:shadow-lg transition-all flex items-center gap-1.5"
              >
                <Check className="h-4 w-4" />
                Bilgileri Kullan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
