"use client";

import React, { useState, useEffect } from "react";
import { X, Users, Building2, Landmark, MapPin, ChevronDown, ChevronUp, Phone, Mail, FileText, Edit2, Zap, Truck, AlertCircle, CheckCircle, Scroll, Barcode } from "lucide-react";
import {
  CaseDebtor, Debtor, DebtorType, DebtorRole,
  DebtorRoleLabels, DebtorTypeLabels,
  TebligatLegalMethod, TebligatDeliveryType,
} from "@/types/debtor";

// Elektronik tebligat zorunlu mu?
function isElectronicNotificationRequired(debtor: Debtor): boolean {
  if (debtor.type === DebtorType.COMPANY) return true;
  if (debtor.type === DebtorType.PUBLIC_INSTITUTION) return true;
  if (debtor.kepAddress) return true;
  return false;
}

function getDefaultLegalMethod(debtor: Debtor): TebligatLegalMethod {
  if (isElectronicNotificationRequired(debtor)) {
    return TebligatLegalMethod.ELECTRONIC;
  }
  return TebligatLegalMethod.POSTAL;
}

// Yararlı adres var mı? (Task bypass için)
function hasUsefulAddresses(debtor: Debtor): boolean {
  const addresses = debtor?.debtorAddresses || [];
  if (addresses.length === 0) return false;
  
  // Yararlı adres kategorileri
  const usefulCategories = ['DECLARED_CLIENT', 'DECLARED_DOCUMENT', 'MERNIS_RESIDENCE'];
  // Yararlı güven seviyeleri
  const usefulConfidenceLevels = ['MEDIUM', 'MEDIUM_HIGH', 'HIGH'];
  
  return addresses.some(addr => {
    // Güncel adres mi?
    const isCurrent = addr.isCurrent !== false; // undefined veya true ise güncel
    // Yararlı kategori mi?
    const hasUsefulCategory = !addr.addressCategory || usefulCategories.includes(addr.addressCategory);
    // Yararlı güven seviyesi mi?
    const hasUsefulConfidence = !addr.confidenceLevel || usefulConfidenceLevels.includes(addr.confidenceLevel);
    
    return isCurrent && hasUsefulCategory && hasUsefulConfidence;
  });
}

interface SelectedDebtorCardProps {
  caseDebtor: CaseDebtor;
  onUpdate: (updates: Partial<CaseDebtor>) => void;
  onRemove: () => void;
  onEdit?: (debtor: Debtor) => void;
}

export function SelectedDebtorCard({ caseDebtor, onUpdate, onRemove, onEdit }: SelectedDebtorCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const { debtor } = caseDebtor;
  
  const addresses = debtor?.debtorAddresses || [];
  const isElectronicRequired = debtor ? isElectronicNotificationRequired(debtor) : false;
  const isEstate = debtor?.type === DebtorType.ESTATE;
  const hasUseful = debtor ? hasUsefulAddresses(debtor) : false;
  
  useEffect(() => {
    if (!debtor) return;
    if (!caseDebtor.tebligatLegalMethod && !isEstate) {
      const defaultMethod = getDefaultLegalMethod(debtor);
      onUpdate({ 
        tebligatLegalMethod: defaultMethod,
        tebligatDeliveryType: defaultMethod === TebligatLegalMethod.POSTAL ? TebligatDeliveryType.NORMAL : undefined,
        isElectronicRequired,
      });
    }
  }, [debtor?.id, caseDebtor.tebligatLegalMethod, isEstate, isElectronicRequired, onUpdate]);
  
  if (!debtor) return null;

  const currentLegalMethod = caseDebtor.tebligatLegalMethod || getDefaultLegalMethod(debtor);
  const currentDeliveryType = caseDebtor.tebligatDeliveryType || TebligatDeliveryType.NORMAL;

  return (
    <div className="border rounded-lg bg-white relative overflow-hidden p-3">
      {/* Üst Butonlar */}
      <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
        {onEdit && (
          <button type="button" onClick={() => onEdit(debtor)} className="text-gray-400 hover:text-blue-500 p-1" title="Düzenle">
            <Edit2 className="h-4 w-4" />
          </button>
        )}
        <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-500 p-1" title="Kaldır">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Borçlu Başlık */}
      <div className="flex items-center gap-2 mb-2 pr-16 cursor-pointer" onClick={() => setShowDetails(!showDetails)}>
        {debtor.type === DebtorType.INDIVIDUAL && <Users className="h-4 w-4 text-emerald-500" />}
        {debtor.type === DebtorType.COMPANY && <Building2 className="h-4 w-4 text-blue-500" />}
        {debtor.type === DebtorType.PUBLIC_INSTITUTION && <Landmark className="h-4 w-4 text-purple-500" />}
        {isEstate && <Scroll className="h-4 w-4 text-amber-500" />}
        <span className="font-medium text-sm">{debtor.name}</span>
        {debtor.identityNo && <span className="text-xs text-gray-500">({debtor.identityNo})</span>}
        {/* Yararlı adres indicator */}
        {hasUseful && (
          <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium" title="Yararlı adres mevcut">
            <CheckCircle className="h-3 w-3" /> Adres ✓
          </span>
        )}
        {!hasUseful && !isEstate && addresses.length === 0 && (
          <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium" title="Adres bilgisi yok">
            <AlertCircle className="h-3 w-3" /> Adres yok
          </span>
        )}
        <span className="ml-auto text-gray-400">
          {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </div>

      {/* Detay Paneli */}
      {showDetails && (
        <div className="bg-gray-50 rounded p-2 mb-2 text-xs">
          <div className="font-medium text-gray-600 mb-1 flex items-center gap-1">
            <FileText className="h-3 w-3" /> {DebtorTypeLabels[debtor.type]}
          </div>
          <div className="grid grid-cols-2 gap-1 text-gray-600">
            {debtor.type === DebtorType.INDIVIDUAL && debtor.tckn && <div>TCKN: {debtor.tckn}</div>}
            {debtor.type === DebtorType.COMPANY && debtor.vkn && <div>VKN: {debtor.vkn}</div>}
            {debtor.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" /> {debtor.phone}</div>}
            {debtor.email && <div className="flex items-center gap-1"><Mail className="h-3 w-3" /> {debtor.email}</div>}
          </div>
          {/* Tereke Mirasçıları */}
          {isEstate && debtor.estateHeirs && debtor.estateHeirs.length > 0 && (
            <div className="mt-2 pt-2 border-t">
              <div className="font-medium text-amber-700 mb-1">Mirasçılar ({debtor.estateHeirs.length})</div>
              {debtor.estateHeirs.map((heir, idx) => (
                <div key={idx} className="bg-amber-50 px-2 py-1 rounded mb-1 border border-amber-200">
                  <div className="flex justify-between">
                    <span className="font-medium">{heir.name}</span>
                    {heir.shareRatio && <span className="text-amber-600">{heir.shareRatio}</span>}
                  </div>
                  {heir.city && <div className="text-gray-500">{heir.city}{heir.district ? ` / ${heir.district}` : ""}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Kontroller */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <label className="block text-xs font-medium mb-1">Rol</label>
          <select
            value={caseDebtor.role}
            onChange={(e) => onUpdate({ role: e.target.value as DebtorRole })}
            className="w-full border rounded px-2 py-1.5 text-xs"
          >
            {Object.entries(DebtorRoleLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {isEstate ? "Mirasçılar" : "Tebligat Adresi"}
          </label>
          {isEstate ? (
            <div className="text-xs text-amber-600 bg-amber-50 px-2 py-1.5 rounded border border-amber-200">
              {debtor.estateHeirs?.length || 0} mirasçıya ayrı tebligat
            </div>
          ) : addresses.length > 0 ? (
            <select
              value={caseDebtor.selectedAddressId || ""}
              onChange={(e) => {
                const addr = addresses.find((a) => a.id === e.target.value);
                onUpdate({ selectedAddressId: e.target.value, selectedAddress: addr });
              }}
              className="w-full border rounded px-2 py-1.5 text-xs"
            >
              {addresses.map((addr) => (
                <option key={addr.id} value={addr.id}>
                  {addr.city}{addr.district ? ` / ${addr.district}` : ""}{addr.isPrimary ? " (Ana)" : ""}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-xs text-amber-600 bg-amber-50 px-2 py-1.5 rounded">Adres yok</div>
          )}
        </div>
      </div>


      {/* Tereke için Mirasçı Listesi */}
      {isEstate && debtor.estateHeirs && debtor.estateHeirs.length > 0 && (
        <div className="mt-2 p-2 bg-amber-50 rounded border border-amber-200">
          <div className="text-xs font-medium text-amber-800 mb-1">📬 Mirasçı Tebligat Adresleri</div>
          <div className="space-y-1">
            {debtor.estateHeirs.map((heir, idx) => (
              <div key={idx} className="text-xs bg-white px-2 py-1 rounded border flex justify-between">
                <span className="font-medium">{heir.name}</span>
                <span className="text-gray-500">{heir.city || "Adres yok"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tebligat Yöntemi - Tereke hariç */}
      {!isEstate && (
        <div className="mt-2 p-2 bg-slate-50 rounded border">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs font-medium text-slate-600">Tebligat:</label>
            {isElectronicRequired ? (
              <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                <Zap className="h-3 w-3" /> E-Tebligat (zorunlu) <CheckCircle className="h-3 w-3" />
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onUpdate({ tebligatLegalMethod: TebligatLegalMethod.ELECTRONIC, tebligatDeliveryType: undefined })}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${currentLegalMethod === TebligatLegalMethod.ELECTRONIC ? "bg-blue-500 text-white" : "bg-white border hover:bg-blue-50"}`}
                >
                  <Zap className="h-3 w-3" /> E-Tebligat
                </button>
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => onUpdate({ tebligatLegalMethod: TebligatLegalMethod.POSTAL, tebligatDeliveryType: TebligatDeliveryType.NORMAL })}
                    className={`flex items-center gap-1 px-2 py-1 rounded-l text-xs border-y border-l ${
                      currentLegalMethod === TebligatLegalMethod.POSTAL && currentDeliveryType === TebligatDeliveryType.NORMAL 
                        ? "bg-emerald-500 text-white border-emerald-500" 
                        : "bg-white hover:bg-emerald-50 border-gray-200"
                    }`}
                  >
                    <Truck className="h-3 w-3" /> Posta
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdate({ tebligatLegalMethod: TebligatLegalMethod.POSTAL, tebligatDeliveryType: TebligatDeliveryType.HIZLI })}
                    className={`px-2 py-1 rounded-r text-xs border ${
                      currentLegalMethod === TebligatLegalMethod.POSTAL && currentDeliveryType === TebligatDeliveryType.HIZLI 
                        ? "bg-orange-500 text-white border-orange-500" 
                        : "bg-white hover:bg-orange-50 border-gray-200"
                    }`}
                  >
                    Hızlı
                  </button>
                </div>
              </div>
            )}
          </div>
          {isElectronicRequired && !debtor.kepAddress && (
            <div className="mt-1 flex items-center gap-1 text-xs text-amber-600">
              <AlertCircle className="h-3 w-3" /> KEP adresi tanımlı değil
            </div>
          )}
          {/* Barkod No - Posta seçiliyse göster */}
          {currentLegalMethod === TebligatLegalMethod.POSTAL && (
            <div className="mt-2 flex items-center gap-2">
              <Barcode className="h-3 w-3 text-gray-400" />
              <input
                type="text"
                value={caseDebtor.notificationBarcode || ""}
                onChange={(e) => onUpdate({ notificationBarcode: e.target.value })}
                placeholder="PTT Barkod No (opsiyonel)"
                className="flex-1 text-xs border rounded px-2 py-1"
              />
            </div>
          )}
        </div>
      )}

      {/* Dosya Notu */}
      <div className="mt-2">
        <label className="block text-xs font-medium mb-1">Dosya Notu</label>
        <input
          type="text"
          value={caseDebtor.caseNote || ""}
          onChange={(e) => onUpdate({ caseNote: e.target.value })}
          placeholder="Bu borçlu için özel not..."
          className="w-full text-xs border rounded px-2 py-1.5"
        />
      </div>
    </div>
  );
}
