"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button, Input } from "@hukuk/ui";
import {
  AddressDTO,
  AddressType,
  AddressSource,
  CreateAddressDTO,
  UpdateAddressDTO,
  AddressTypeLabels,
  AddressSourceLabels,
  api,
} from "@/lib/api";

type DebtorPersonType = "NATURAL" | "LEGAL";

interface AddressFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  debtorId: string;
  address?: AddressDTO | null;
  debtorType?: DebtorPersonType; // NATURAL = gerçek kişi, LEGAL = tüzel kişi
}

// Gerçek kişi için adres türleri (Tebligat Kanunu m.10)
const NATURAL_PERSON_ADDRESS_TYPES: AddressType[] = [
  "MERNIS",        // Yerleşim yeri (birincil)
  "BUSINESS_HQ",   // İşyeri
  "DECLARED",      // Bildirilen adres
  "KEP",           // KEP adresi
];

// Tüzel kişi için adres türleri (Tebligat Kanunu m.12, m.13)
const LEGAL_PERSON_ADDRESS_TYPES: AddressType[] = [
  "LEGAL_CENTER",    // Ticaret Sicili merkez adresi (birincil)
  "BUSINESS_BRANCH", // Şube adresi
  "DECLARED",        // Bildirilen adres
  "KEP",             // KEP adresi
];

const ADDRESS_SOURCES: AddressSource[] = [
  "MERNIS",
  "MERSIS",
  "TICARET_SICILI",
  "CONTRACT",
  "USER_INPUT",
  "UYAP",
];

// Varsayılan adres türü (Tebligat Kanunu'na göre)
function getDefaultAddressType(debtorType?: DebtorPersonType): AddressType {
  if (debtorType === "LEGAL") {
    return "LEGAL_CENTER"; // Tüzel kişi: Ticaret Sicili merkez adresi
  }
  return "MERNIS"; // Gerçek kişi: MERNİS yerleşim yeri
}

// Varsayılan kaynak
function getDefaultSource(debtorType?: DebtorPersonType): AddressSource {
  if (debtorType === "LEGAL") {
    return "TICARET_SICILI";
  }
  return "MERNIS";
}

export function AddressFormModal({
  isOpen,
  onClose,
  onSave,
  debtorId,
  address,
  debtorType,
}: AddressFormModalProps) {
  const isEdit = !!address;
  
  // Borçlu türüne göre uygun adres türlerini belirle
  const addressTypes = debtorType === "LEGAL" 
    ? LEGAL_PERSON_ADDRESS_TYPES 
    : NATURAL_PERSON_ADDRESS_TYPES;

  const [formData, setFormData] = useState<CreateAddressDTO>({
    type: getDefaultAddressType(debtorType),
    source: getDefaultSource(debtorType),
    street: "",
    city: "",
    district: "",
    postalCode: "",
    notes: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (address) {
      setFormData({
        type: address.type,
        source: address.source,
        street: address.street,
        city: address.city,
        district: address.district || "",
        postalCode: address.postalCode || "",
        notes: "",
      });
    } else {
      // Yeni adres eklerken borçlu türüne göre varsayılan değerler
      setFormData({
        type: getDefaultAddressType(debtorType),
        source: getDefaultSource(debtorType),
        street: "",
        city: "",
        district: "",
        postalCode: "",
        notes: "",
      });
    }
  }, [address, debtorType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.street.trim() || !formData.city.trim()) {
      setError("Sokak/Cadde ve İl alanları zorunludur");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEdit && address) {
        const updateData: UpdateAddressDTO = {
          type: formData.type,
          source: formData.source,
          street: formData.street,
          city: formData.city,
          district: formData.district || undefined,
          postalCode: formData.postalCode || undefined,
        };
        await api.updateAddress(address.id, updateData);
      } else {
        await api.createAddress(debtorId, formData);
      }
      onSave();
    } catch (err: any) {
      setError(err.message || "Adres kaydedilemedi");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="text-lg font-semibold">
              {isEdit ? "Adresi Düzenle" : "Yeni Adres Ekle"}
            </h3>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)]">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            {/* Address Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Adres Türü *
              </label>
              <select
                value={formData.type}
                onChange={(e) =>
                  setFormData({ ...formData, type: e.target.value as AddressType })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {addressTypes.map((type) => (
                  <option key={type} value={type}>
                    {AddressTypeLabels[type]}
                  </option>
                ))}
              </select>
              {/* TK 21/2 uygulanabilirlik bilgisi */}
              {formData.type === "MERNIS" && (
                <p className="mt-1 text-xs text-green-600">
                  ✓ TK 21/2 (bila tebligat) uygulanabilir - Gerçek kişi yerleşim yeri
                </p>
              )}
              {formData.type === "LEGAL_CENTER" && (
                <p className="mt-1 text-xs text-green-600">
                  ✓ TK 21/2 (bila tebligat) uygulanabilir - Ticaret Sicili merkez adresi
                </p>
              )}
            </div>

            {/* Address Source */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Kaynak *
              </label>
              <select
                value={formData.source}
                onChange={(e) =>
                  setFormData({ ...formData, source: e.target.value as AddressSource })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {ADDRESS_SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {AddressSourceLabels[source]}
                  </option>
                ))}
              </select>
            </div>

            {/* Street */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sokak / Cadde / Mahalle *
              </label>
              <textarea
                value={formData.street}
                onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Atatürk Cad. No:55 D:19"
              />
            </div>

            {/* City & District */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  İl *
                </label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="İstanbul"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  İlçe
                </label>
                <Input
                  value={formData.district || ""}
                  onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                  placeholder="Ataşehir"
                />
              </div>
            </div>

            {/* Postal Code */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Posta Kodu
              </label>
              <Input
                value={formData.postalCode || ""}
                onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                placeholder="34750"
              />
            </div>

            {/* Notes */}
            {!isEdit && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notlar
                </label>
                <textarea
                  value={formData.notes || ""}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Ek bilgiler..."
                />
              </div>
            )}
          </form>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 p-4 border-t bg-gray-50">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              İptal
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Kaydediliyor..." : isEdit ? "Güncelle" : "Ekle"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
