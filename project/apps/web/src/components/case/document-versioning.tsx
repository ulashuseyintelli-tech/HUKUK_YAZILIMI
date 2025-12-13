"use client";

import { useState } from "react";
import { FileText, Clock, User, RotateCcw, Eye, GitCompare, ChevronDown, ChevronRight } from "lucide-react";

interface DocumentVersion {
  id: string;
  version: number;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  size: string;
  changes?: string;
}

interface Document {
  id: string;
  name: string;
  currentVersion: number;
  versions: DocumentVersion[];
}

const mockDocuments: Document[] = [
  {
    id: "1",
    name: "Ödeme Emri",
    currentVersion: 3,
    versions: [
      { id: "v3", version: 3, fileName: "odeme_emri_v3.pdf", uploadedAt: "2025-12-10T14:30:00", uploadedBy: "Av. Mehmet Yılmaz", size: "245 KB", changes: "Faiz hesabı güncellendi" },
      { id: "v2", version: 2, fileName: "odeme_emri_v2.pdf", uploadedAt: "2025-12-05T10:15:00", uploadedBy: "Av. Mehmet Yılmaz", size: "240 KB", changes: "Borçlu adresi düzeltildi" },
      { id: "v1", version: 1, fileName: "odeme_emri_v1.pdf", uploadedAt: "2025-12-01T09:00:00", uploadedBy: "Av. Ayşe Kaya", size: "235 KB" },
    ],
  },
  {
    id: "2",
    name: "Haciz Talebi",
    currentVersion: 2,
    versions: [
      { id: "v2", version: 2, fileName: "haciz_talebi_v2.pdf", uploadedAt: "2025-12-08T16:45:00", uploadedBy: "Av. Mehmet Yılmaz", size: "180 KB", changes: "Mal listesi eklendi" },
      { id: "v1", version: 1, fileName: "haciz_talebi_v1.pdf", uploadedAt: "2025-12-03T11:20:00", uploadedBy: "Av. Ayşe Kaya", size: "150 KB" },
    ],
  },
];

interface DocumentVersioningProps {
  caseId?: string;
}

export function DocumentVersioning({ caseId }: DocumentVersioningProps) {
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);

  const toggleExpand = (docId: string) => {
    setExpandedDoc(expandedDoc === docId ? null : docId);
  };

  const handleRestore = (docId: string, versionId: string) => {
    alert(`${versionId} versiyonu geri yükleniyor...`);
  };

  const handleCompare = () => {
    if (selectedVersions.length === 2) {
      alert(`Karşılaştırılıyor: ${selectedVersions.join(" vs ")}`);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Belge Versiyonları</h3>
        {compareMode && selectedVersions.length === 2 && (
          <button
            onClick={handleCompare}
            className="text-sm bg-blue-600 text-white px-3 py-1 rounded-lg flex items-center gap-1"
          >
            <GitCompare className="w-4 h-4" /> Karşılaştır
          </button>
        )}
      </div>

      <div className="space-y-2">
        {mockDocuments.map((doc) => (
          <div key={doc.id} className="border rounded-lg">
            <button
              onClick={() => toggleExpand(doc.id)}
              className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <div className="flex items-center gap-3">
                {expandedDoc === doc.id ? (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
                <FileText className="w-5 h-5 text-blue-600" />
                <span className="font-medium">{doc.name}</span>
              </div>
              <span className="text-sm text-gray-500">v{doc.currentVersion}</span>
            </button>

            {expandedDoc === doc.id && (
              <div className="border-t p-3 space-y-2">
                {doc.versions.map((version, idx) => (
                  <div
                    key={version.id}
                    className={`flex items-center justify-between p-2 rounded-lg ${
                      idx === 0 ? "bg-green-50 dark:bg-green-900/20" : "bg-gray-50 dark:bg-gray-700"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {compareMode && (
                        <input
                          type="checkbox"
                          checked={selectedVersions.includes(version.id)}
                          onChange={(e) => {
                            if (e.target.checked && selectedVersions.length < 2) {
                              setSelectedVersions([...selectedVersions, version.id]);
                            } else {
                              setSelectedVersions(selectedVersions.filter((v) => v !== version.id));
                            }
                          }}
                          className="rounded"
                        />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">v{version.version}</span>
                          {idx === 0 && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                              Güncel
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500 flex items-center gap-2">
                          <Clock className="w-3 h-3" />
                          {new Date(version.uploadedAt).toLocaleString("tr-TR")}
                          <User className="w-3 h-3 ml-2" />
                          {version.uploadedBy}
                        </div>
                        {version.changes && (
                          <div className="text-xs text-gray-400 mt-1">{version.changes}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{version.size}</span>
                      <button className="p-1 hover:bg-gray-200 rounded" title="Önizle">
                        <Eye className="w-4 h-4 text-gray-500" />
                      </button>
                      {idx !== 0 && (
                        <button
                          onClick={() => handleRestore(doc.id, version.id)}
                          className="p-1 hover:bg-gray-200 rounded"
                          title="Geri Yükle"
                        >
                          <RotateCcw className="w-4 h-4 text-orange-500" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={compareMode}
            onChange={(e) => {
              setCompareMode(e.target.checked);
              setSelectedVersions([]);
            }}
            className="rounded"
          />
          Karşılaştırma modu
        </label>
      </div>
    </div>
  );
}
