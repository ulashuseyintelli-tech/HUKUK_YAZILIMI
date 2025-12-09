"use client";

import { useState, useEffect } from "react";

interface CaseCoreFieldsProps {
  formTypeId?: string;
  executionPath: string;
  caseDate: string;
  executionOfficeId?: string;
  uyapCode?: string;
  fileNumber: string;
  executionFileNumber?: string;
  subType?: string;
  caseStatus: string;
  formTypes?: { id: string; code: string; name: string }[];
  executionOffices?: { id: string; name: string; city: string; uyapCode?: string }[];
  onFieldChange: (field: string, value: any) => void;
  onStatusChange: (status: string) => void;
}

const EXECUTION_PATHS = [
  { value: "HACIZ", label: "Haciz Yolu" },
  { value: "IFLAS", label: "İflas Yolu" },
  { value: "REHIN", label: "Rehin Paraya Çevirme" },
  { value: "IPOTEK", label: "İpotek Paraya Çevirme" },
  { value: "TAHLIYE", label: "Tahliye" },
];

const SUB_TYPES = [
  { value: "GENEL", label: "Genel" },
  { value: "KAMBIYO", label: "Kambiyo" },
  { value: "ILAMLI", label: "İlamlı" },
  { value: "ILAMSIZ", label: "İlamsız" },
];

export function CaseCoreFields({
  formTypeId,
  executionPath,
  caseDate,
  executionOfficeId,
  uyapCode,
  fileNumber,
  executionFileNumber,
  subType,
  caseStatus,
  formTypes = [],
  executionOffices = [],
  onFieldChange,
  onStatusChange,
}: CaseCoreFieldsProps) {
  const [selectedCity, setSelectedCity] = useState<string>("");
  const [filteredOffices, setFilteredOffices] = useState(executionOffices);

  // İl seçildiğinde daireleri filtrele (F.30)
  useEffect(() => {
    if (selectedCity) {
      setFilteredOffices(executionOffices.filter((o) => o.city === selectedCity));
    } else {
      setFilteredOffices(executionOffices);
    }
  }, [selectedCity, executionOffices]);

  // İcra dairesi seçildiğinde UYAP kodunu otomatik doldur (F.30)
  const handleOfficeChange = (officeId: string) => {
    onFieldChange("executionOfficeId", officeId);
    const office = executionOffices.find((o) => o.id === officeId);
    if (office?.uyapCode) {
      onFieldChange("uyapBirimKodu", office.uyapCode);
    }
  };

  // Dosya no format kontrolü (F.31)
  const validateFileNumber = (value: string): boolean => {
    const pattern = /^\d{4}\/\d+$/; // 2024/12345 formatı
    return pattern.test(value);
  };

  const cities = [...new Set(executionOffices.map((o) => o.city))].sort();

  return (
    <div className="bg-white rounded-xl border p-4">
      <h3 className="font-semibold mb-4">Temel Takip Bilgileri</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Takip Tipi (F.28) */}
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            Takip Tipi <span className="text-red-500">*</span>
          </label>
          <select
            value={formTypeId || ""}
            onChange={(e) => onFieldChange("formTypeId", e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
            required
          >
            <option value="">Seçiniz</option>
            {formTypes.map((ft) => (
              <option key={ft.id} value={ft.id}>
                {ft.name}
              </option>
            ))}
          </select>
        </div>

        {/* Takip Yolu (F.28) */}
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            Takip Yolu <span className="text-red-500">*</span>
          </label>
          <select
            value={executionPath}
            onChange={(e) => onFieldChange("executionPath", e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
            required
          >
            {EXECUTION_PATHS.map((ep) => (
              <option key={ep.value} value={ep.value}>
                {ep.label}
              </option>
            ))}
          </select>
        </div>

        {/* Alt Takip Türü (F.29) */}
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            Alt Takip Türü
          </label>
          <select
            value={subType || ""}
            onChange={(e) => onFieldChange("subType", e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="">Seçiniz</option>
            {SUB_TYPES.map((st) => (
              <option key={st.value} value={st.value}>
                {st.label}
              </option>
            ))}
          </select>
        </div>

        {/* Takip Tarihi */}
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            Takip Tarihi <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={caseDate ? caseDate.split("T")[0] : ""}
            onChange={(e) => onFieldChange("caseDate", e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
            required
          />
        </div>

        {/* İl Seçimi (F.30) */}
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            İl
          </label>
          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="">Tüm İller</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </div>

        {/* İcra Dairesi (F.30) */}
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            İcra Dairesi
          </label>
          <select
            value={executionOfficeId || ""}
            onChange={(e) => handleOfficeChange(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="">Seçiniz</option>
            {filteredOffices.map((office) => (
              <option key={office.id} value={office.id}>
                {office.name}
              </option>
            ))}
          </select>
        </div>

        {/* Büro Dosya No */}
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            Büro Dosya No <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={fileNumber}
            onChange={(e) => onFieldChange("fileNumber", e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
            required
          />
        </div>

        {/* İcra Dosya No (F.31) */}
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            İcra Dosya No
          </label>
          <input
            type="text"
            value={executionFileNumber || ""}
            onChange={(e) => onFieldChange("executionFileNumber", e.target.value)}
            placeholder="2024/12345"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary ${
              executionFileNumber && !validateFileNumber(executionFileNumber)
                ? "border-red-300 bg-red-50"
                : ""
            }`}
          />
          {executionFileNumber && !validateFileNumber(executionFileNumber) && (
            <p className="text-xs text-red-500 mt-1">Format: YYYY/XXXXX (örn: 2024/12345)</p>
          )}
        </div>

        {/* UYAP Kodu */}
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            UYAP Birim Kodu
          </label>
          <input
            type="text"
            value={uyapCode || ""}
            onChange={(e) => onFieldChange("uyapBirimKodu", e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
            placeholder="Otomatik doldurulur"
          />
        </div>
      </div>
    </div>
  );
}
