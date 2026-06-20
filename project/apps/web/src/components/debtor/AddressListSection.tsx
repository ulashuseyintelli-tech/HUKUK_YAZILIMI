"use client";

import { useState } from "react";
import { Plus, MapPin, ChevronDown, ChevronUp, Lightbulb, AlertCircle, ShieldCheck, RefreshCw } from "lucide-react";
import { Button } from "@hukuk/ui";
import { AddressDTO, api, VerificationResultDTO } from "@/lib/api";
import { AddressCard } from "./AddressCard";
import { AddressFormModal } from "./modals/AddressFormModal";
import { AddressHistoryModal } from "./modals/AddressHistoryModal";

type DebtorPersonType = "NATURAL" | "LEGAL";

interface AddressListSectionProps {
  debtorId: string;
  caseDebtorId: string;
  addresses: AddressDTO[];
  selectedAddressId?: string;
  debtorType?: DebtorPersonType;
  identityNo?: string; // TCKN or VKN
  readOnly?: boolean;
  onUpdate: () => void;
}

export function AddressListSection({
  debtorId,
  caseDebtorId,
  addresses,
  selectedAddressId,
  debtorType,
  identityNo,
  readOnly = false,
  onUpdate,
}: AddressListSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<AddressDTO | null>(null);
  const [historyAddressId, setHistoryAddressId] = useState<string | null>(null);
  const [verifyingAddressId, setVerifyingAddressId] = useState<string | null>(null);
  const [isVerifyingAll, setIsVerifyingAll] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{ addressId: string; result: VerificationResultDTO } | null>(null);

  const handleSetActive = async (addressId: string) => {
    if (readOnly) return;
    try {
      await api.setActiveAddress(caseDebtorId, addressId);
      onUpdate();
    } catch (err: any) {
      alert(err.message || "Aktif adres değiştirilemedi");
    }
  };

  const handleDelete = async (addressId: string) => {
    if (readOnly) return;
    if (!confirm("Bu adresi silmek istediğinize emin misiniz?")) return;
    
    try {
      await api.deleteAddress(addressId);
      onUpdate();
    } catch (err: any) {
      alert(err.message || "Adres silinemedi");
    }
  };

  const handleVerify = async (address: AddressDTO) => {
    if (readOnly) return;
    if (!identityNo) {
      alert("Doğrulama için TCKN/VKN bilgisi gereklidir");
      return;
    }

    setVerifyingAddressId(address.id);
    setVerificationResult(null);
    
    try {
      let result: VerificationResultDTO;
      
      if (debtorType === "NATURAL" && address.type === "MERNIS") {
        result = await api.verifyAddressViaMernis(address.id, identityNo);
      } else if (debtorType === "LEGAL" && address.type === "LEGAL_CENTER") {
        result = await api.verifyAddressViaMersis(address.id, identityNo);
      } else {
        alert("Bu adres türü için doğrulama desteklenmiyor");
        return;
      }

      setVerificationResult({ addressId: address.id, result });
      
      if (result.verified) {
        onUpdate();
      }
    } catch (err: any) {
      alert(err.message || "Doğrulama başarısız");
    } finally {
      setVerifyingAddressId(null);
    }
  };

  const handleVerifyAll = async () => {
    if (readOnly) return;
    if (!identityNo) {
      alert("Doğrulama için TCKN/VKN bilgisi gereklidir");
      return;
    }

    setIsVerifyingAll(true);
    try {
      const result = await api.verifyAllAddresses(debtorId);
      alert(`Doğrulama tamamlandı: ${result.verified} başarılı, ${result.failed} başarısız`);
      onUpdate();
    } catch (err: any) {
      alert(err.message || "Toplu doğrulama başarısız");
    } finally {
      setIsVerifyingAll(false);
    }
  };

  const handleEdit = (address: AddressDTO) => {
    if (readOnly) return;
    setEditingAddress(address);
    setIsFormOpen(true);
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingAddress(null);
  };

  const handleFormSave = () => {
    handleFormClose();
    onUpdate();
  };

  // Sort: active first, then by priority
  const sortedAddresses = [...addresses].sort((a, b) => {
    if (a.id === selectedAddressId) return -1;
    if (b.id === selectedAddressId) return 1;
    const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return priorityOrder[a.legalPriority] - priorityOrder[b.legalPriority];
  });

  // Check if any address needs verification
  const hasUnverifiedAddresses = addresses.some(
    a => (a.type === "MERNIS" || a.type === "LEGAL_CENTER") && 
         (!a.verified || a.verificationStatus === "OUTDATED")
  );

  // Tebligat Kanunu'na göre öneri hesapla
  const getRecommendation = (): { type: "success" | "warning" | "info"; message: string } | null => {
    if (addresses.length === 0) return null;
    
    const activeAddress = addresses.find(a => a.id === selectedAddressId);
    const hasVerifiedAddress = addresses.some(a => a.verified);
    const hasTk21_2Eligible = addresses.some(a => a.canApply21_2);
    
    // Tüzel kişi için öneriler
    if (debtorType === "LEGAL") {
      const hasLegalCenter = addresses.some(a => a.type === "LEGAL_CENTER");
      const hasBranch = addresses.some(a => a.type === "BUSINESS_BRANCH");
      const hasKep = addresses.some(a => a.type === "KEP");
      
      if (!hasLegalCenter) {
        return {
          type: "warning",
          message: "TK m.12: Tüzel kişilere öncelikle Ticaret Sicili merkez adresine tebligat yapılmalıdır."
        };
      }
      
      if (activeAddress && activeAddress.type !== "LEGAL_CENTER" && hasLegalCenter) {
        return {
          type: "info",
          message: "Öneri: Ticaret Sicili merkez adresi mevcut. TK m.12'ye göre öncelikli olarak bu adrese tebligat yapılması önerilir."
        };
      }
      
      if (hasLegalCenter && !hasBranch && !hasKep) {
        return {
          type: "success",
          message: "✓ TK m.12 uyumlu: Ticaret Sicili merkez adresi mevcut. İade halinde TK 35 uygulanabilir."
        };
      }
    }
    
    // Gerçek kişi için öneriler
    if (debtorType === "NATURAL") {
      const hasMernis = addresses.some(a => a.type === "MERNIS");
      
      if (!hasMernis) {
        return {
          type: "warning",
          message: "TK m.10: Gerçek kişilere öncelikle MERNİS yerleşim yeri adresine tebligat yapılmalıdır."
        };
      }
      
      if (activeAddress && activeAddress.type !== "MERNIS" && hasMernis) {
        return {
          type: "info",
          message: "Öneri: MERNİS adresi mevcut. TK m.10'a göre öncelikli olarak bu adrese tebligat yapılması önerilir."
        };
      }
      
      if (hasMernis && hasTk21_2Eligible) {
        return {
          type: "success",
          message: "✓ TK m.10 uyumlu: MERNİS adresi mevcut. İade halinde TK 21/2 (bila tebligat) uygulanabilir."
        };
      }
    }
    
    // Genel öneriler
    if (!hasVerifiedAddress && addresses.length > 0) {
      return {
        type: "info",
        message: "Öneri: Adreslerden en az birinin doğrulanması (MERNİS/Ticaret Sicili sorgusu) önerilir."
      };
    }
    
    return null;
  };

  const recommendation = getRecommendation();

  return (
    <div className="border rounded-lg bg-white">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-gray-500" />
          <span className="font-medium text-sm">Adresler</span>
          <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
            {addresses.length}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="p-3 pt-0 space-y-3">
          {/* Tebligat Kanunu Öneri Kutusu */}
          {recommendation && (
            <div
              className={`p-3 rounded-lg text-sm flex items-start gap-2 ${
                recommendation.type === "success"
                  ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                  : recommendation.type === "warning"
                  ? "bg-amber-50 border border-amber-200 text-amber-700"
                  : "bg-blue-50 border border-blue-200 text-blue-700"
              }`}
            >
              {recommendation.type === "warning" ? (
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              ) : (
                <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5" />
              )}
              <span>{recommendation.message}</span>
            </div>
          )}

          {/* Address List */}
          {readOnly && (
            <div className="p-2 rounded bg-gray-50 border border-gray-200 text-xs text-gray-600">
              Pasif kayit: adres islemleri salt okunur.
            </div>
          )}

          {sortedAddresses.length === 0 ? (
            <div className="text-center py-6 text-gray-500 text-sm">
              Henüz adres eklenmemiş
            </div>
          ) : (
            <div className="space-y-2">
              {sortedAddresses.map((address) => (
                <AddressCard
                  key={address.id}
                  address={address}
                  isActive={address.id === selectedAddressId}
                  onSetActive={readOnly ? undefined : () => handleSetActive(address.id)}
                  onEdit={readOnly ? undefined : () => handleEdit(address)}
                  onDelete={readOnly ? undefined : () => handleDelete(address.id)}
                  onViewHistory={() => setHistoryAddressId(address.id)}
                  onVerify={readOnly ? undefined : () => handleVerify(address)}
                  isVerifying={verifyingAddressId === address.id}
                />
              ))}
            </div>
          )}

          {/* Verification Result Toast */}
          {verificationResult && (
            <div
              className={`p-3 rounded-lg text-sm ${
                verificationResult.result.verified
                  ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                  : "bg-amber-50 border border-amber-200 text-amber-700"
              }`}
            >
              <div className="font-medium">
                {verificationResult.result.verified ? "✓ Doğrulama Başarılı" : "⚠ Doğrulama Başarısız"}
              </div>
              <div className="text-xs mt-1">{verificationResult.result.message}</div>
              <button
                onClick={() => setVerificationResult(null)}
                className="text-xs underline mt-2"
              >
                Kapat
              </button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setIsFormOpen(true)}
              disabled={readOnly}
            >
              <Plus className="w-4 h-4 mr-1" />
              Yeni Adres
            </Button>
            
            {hasUnverifiedAddresses && identityNo && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleVerifyAll}
                disabled={isVerifyingAll || readOnly}
                className="text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                {isVerifyingAll ? (
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4 mr-1" />
                )}
                {isVerifyingAll ? "Doğrulanıyor..." : "Tümünü Doğrula"}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Form Modal */}
      {isFormOpen && !readOnly && (
        <AddressFormModal
          isOpen={isFormOpen}
          onClose={handleFormClose}
          onSave={handleFormSave}
          debtorId={debtorId}
          address={editingAddress}
          debtorType={debtorType}
        />
      )}

      {/* History Modal */}
      {historyAddressId && (
        <AddressHistoryModal
          isOpen={!!historyAddressId}
          onClose={() => setHistoryAddressId(null)}
          addressId={historyAddressId}
        />
      )}
    </div>
  );
}
