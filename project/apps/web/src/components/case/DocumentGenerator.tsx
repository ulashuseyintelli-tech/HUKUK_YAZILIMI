"use client";

import { useState, useEffect } from "react";
import {
  FileText,
  Download,
  Eye,
  AlertCircle,
  Check,
  Loader2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";

interface DocumentTemplate {
  id: string;
  code: string;
  name: string;
  title: string;
  description?: string;
  category: string;
  subCategory?: string;
  currency?: string;
  iikMaddesi?: string;
  isRecommended?: boolean;
}

interface DocumentGeneratorProps {
  caseId: string;
  hasArticle4Request: boolean;
  subCategory?: string;
  currency?: string;
  onArticle4Change: (value: boolean) => void;
}

export function DocumentGenerator({
  caseId,
  hasArticle4Request,
  subCategory = "GENEL",
  currency = "TRY",
  onArticle4Change,
}: DocumentGeneratorProps) {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Şablonları yükle
  useEffect(() => {
    loadTemplates();
  }, [caseId]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await api.get(
        `/documents/case/${caseId}/available-templates`
      );
      setTemplates(response.data);
    } catch (err) {
      console.error("Şablonlar yüklenemedi:", err);
      // Fallback: statik liste
      setTemplates([
        {
          id: "1",
          code: "TAKIP_TALEBI_GENEL",
          name: "Takip Talebi - Genel",
          title: "İLAMLI İCRA TAKİP TALEBİ",
          category: "TAKIP_TALEBI",
          subCategory: "GENEL",
          iikMaddesi: "İİK m.4",
          isRecommended: subCategory === "GENEL",
        },
        {
          id: "2",
          code: "TAKIP_TALEBI_NAFAKA",
          name: "Takip Talebi - Nafaka",
          title: "İLAMLI İCRA TAKİP TALEBİ (NAFAKA)",
          category: "TAKIP_TALEBI",
          subCategory: "NAFAKA",
          iikMaddesi: "İİK m.4",
          isRecommended: subCategory === "NAFAKA",
        },
        {
          id: "3",
          code: "TAKIP_TALEBI_DOVIZ",
          name: "Takip Talebi - Döviz",
          title: "İLAMLI İCRA TAKİP TALEBİ (DÖVİZ)",
          category: "TAKIP_TALEBI",
          subCategory: "DOVIZ",
          iikMaddesi: "İİK m.4",
          isRecommended: currency !== "TRY",
        },
        {
          id: "4",
          code: "ODEME_EMRI_GENEL",
          name: "Ödeme Emri - Genel",
          title: "ÖDEME EMRİ",
          category: "ODEME_EMRI",
          subCategory: "GENEL",
          iikMaddesi: "İİK m.32",
          isRecommended: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async (templateCode: string) => {
    try {
      setGenerating(true);
      const response = await api.get(
        `/documents/case/${caseId}/generate/${templateCode}`
      );
      setPreviewContent(response.data.content);
      setPreviewTitle(response.data.title);
    } catch (err: any) {
      setError(err.message || "Önizleme yüklenemedi");
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedTemplate) return;

    setGenerating(true);
    setError(null);

    try {
      const response = await api.get(
        `/documents/case/${caseId}/generate/${selectedTemplate}`
      );

      // 4. madde talebi oluşturulduysa flag'i güncelle
      if (selectedTemplate.startsWith("TAKIP_TALEBI")) {
        onArticle4Change(true);
      }

      // İçeriği önizleme olarak göster
      setPreviewContent(response.data.content);
      setPreviewTitle(response.data.title);
    } catch (err: any) {
      setError(err.message || "Belge oluşturulurken hata oluştu");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!previewContent) return;

    // HTML olarak indir
    const blob = new Blob(
      [
        `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${previewTitle}</title>
  <style>
    body { font-family: 'Times New Roman', serif; padding: 40px; line-height: 1.6; }
    pre { white-space: pre-wrap; font-family: inherit; }
  </style>
</head>
<body>
<pre>${previewContent}</pre>
</body>
</html>`,
      ],
      { type: "text/html" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${previewTitle.replace(/\s+/g, "_")}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Kategoriye göre grupla
  const groupedTemplates = templates.reduce(
    (acc, t) => {
      const cat = t.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(t);
      return acc;
    },
    {} as Record<string, DocumentTemplate[]>
  );

  const categoryLabels: Record<string, string> = {
    TAKIP_TALEBI: "Takip Talebi (4. Madde)",
    ODEME_EMRI: "Ödeme Emri",
    HACIZ_MUZEKKERESI: "Haciz Müzekkeresi",
    SATIS_ILANI: "Satış İlanı",
    REDDIYAT: "Reddiyat Yazısı",
    MTS_DONUS: "MTS Geri Dönüş",
    DIGER: "Diğer",
  };

  return (
    <div className="bg-white rounded-xl border p-4">
      <h3 className="font-semibold flex items-center gap-2 mb-4">
        <FileText className="h-5 w-5 text-primary" />
        Belge Üretimi
      </h3>

      {/* 4. Madde Durumu */}
      <div
        className={`p-3 rounded-lg mb-4 ${hasArticle4Request ? "bg-green-50" : "bg-amber-50"}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {hasArticle4Request ? (
              <Check className="h-5 w-5 text-green-600" />
            ) : (
              <AlertCircle className="h-5 w-5 text-amber-600" />
            )}
            <span
              className={`text-sm font-medium ${hasArticle4Request ? "text-green-700" : "text-amber-700"}`}
            >
              {hasArticle4Request
                ? "4. Madde Talebi Mevcut"
                : "4. Madde Talebi Gerekli"}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Şablon Listesi */}
          <div className="space-y-4 mb-4">
            {Object.entries(groupedTemplates).map(([category, temps]) => (
              <div key={category}>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  {categoryLabels[category] || category}
                </h4>
                <div className="space-y-2">
                  {temps.map((template) => {
                    const isSelected = selectedTemplate === template.code;
                    const isOdemeEmri = template.category === "ODEME_EMRI";
                    const isDisabled = isOdemeEmri && !hasArticle4Request;

                    return (
                      <div
                        key={template.code}
                        className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
                          isDisabled
                            ? "opacity-50 cursor-not-allowed bg-gray-50"
                            : isSelected
                              ? "border-primary bg-primary/5"
                              : "hover:bg-gray-50 cursor-pointer"
                        }`}
                        onClick={() =>
                          !isDisabled && setSelectedTemplate(template.code)
                        }
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="template"
                            checked={isSelected}
                            disabled={isDisabled}
                            onChange={() => {}}
                            className="h-4 w-4"
                          />
                          <div>
                            <span
                              className={`text-sm ${isSelected ? "font-medium" : ""}`}
                            >
                              {template.name}
                            </span>
                            {template.isRecommended && (
                              <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                                Önerilen
                              </span>
                            )}
                            {template.iikMaddesi && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                ({template.iikMaddesi})
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePreview(template.code);
                          }}
                          disabled={isDisabled}
                          className="text-muted-foreground hover:text-foreground p-1"
                          title="Önizle"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Üret Butonu */}
          <button
            onClick={handleGenerate}
            disabled={!selectedTemplate || generating}
            className={`w-full py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors ${
              !selectedTemplate || generating
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-primary text-white hover:bg-primary/90"
            }`}
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Oluşturuluyor...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Belge Üret
              </>
            )}
          </button>
        </>
      )}

      {/* Önizleme Modal */}
      {previewContent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold">{previewTitle}</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownload}
                  className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm flex items-center gap-1"
                >
                  <Download className="h-4 w-4" />
                  İndir
                </button>
                <button
                  onClick={() => setPreviewContent(null)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-auto flex-1">
              <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed">
                {previewContent}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
