"use client";

import React, { useState } from "react";
import { X, Users, Building2, Landmark, MapPin, ChevronDown, ChevronUp, Phone, Mail, FileText, Edit2 } from "lucide-react";
import {
  CaseDebtor, Debtor, DebtorType, DebtorRole,
  DebtorRoleLabels, DebtorTypeLabels,
} from "@/types/debtor";

interface SelectedDebtorCardProps {
  caseDebtor: CaseDebtor;
  onUpdate: (updates: Partial<CaseDebtor>) => void;
  onRemove: () => void;
  onEdit?: (debtor: Debtor) => void;
}

export function SelectedDebtorCard({ caseDebtor, onUpdate, onRemove, onEdit }: SelectedDebtorCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const { debtor } = caseDebtor;
  if (!debtor) return null;

  const addresses = debtor.debtorAddresses || [];

  return (
    <div className="border rounded-lg bg-white relative overflow-hidden">
      {/* Üst Butonlar */}
      <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(debtor)}
            className="text-gray-400 hover:text-blue-500 p-1"
            title="Borçluyu Düzenle"
          >
            <Edit2 className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="text-gray-400 hover:text-red-500 p-1"
          title="Kaldır"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Borçlu Başlık - Tıklanabilir */}
      <div 
        className="flex items-center gap-2 mb-3 pr-6 cursor-pointer hover:bg-gray-50 p-2 -m-2 rounded transition-colors"
        onClick={() => setShowDetails(!showDetails)}
      >
        {debtor.type === DebtorType.INDIVIDUAL && <Users className="h-4 w-4 text-emerald-500" />}
        {debtor.type === DebtorType.COMPANY && <Building2 className="h-4 w-4 text-blue-500" />}
        {debtor.type === DebtorType.PUBLIC_INSTITUTION && <Landmark className="h-4 w-4 text-purple-500" />}
        <span className="font-medium">{debtor.name}</span>
        {debtor.identityNo && (
          <span className="text-xs text-muted-foreground">({debtor.identityNo})</span>
        )}
        <span className="ml-auto mr-4 text-gray-400">
          {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </div>

      {/* Detay Paneli */}
      {showDetails && (
        <div className="bg-gray-50 border-t border-b mb-3 -mx-3 px-3 py-3">
          <div className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {DebtorTypeLabels[debtor.type]} Bilgileri
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {/* Şahıs Bilgileri */}
            {debtor.type === DebtorType.INDIVIDUAL && (
              <>
                {debtor.tckn && (
                  <div><span className="text-gray-500">TC Kimlik:</span> {debtor.tckn}</div>
                )}
                {debtor.fatherName && (
                  <div><span className="text-gray-500">Baba Adı:</span> {debtor.fatherName}</div>
                )}
                {debtor.motherName && (
                  <div><span className="text-gray-500">Anne Adı:</span> {debtor.motherName}</div>
                )}
                {debtor.birthDate && (
                  <div><span className="text-gray-500">Doğum Tarihi:</span> {new Date(debtor.birthDate).toLocaleDateString('tr-TR')}</div>
                )}
                {debtor.birthPlace && (
                  <div><span className="text-gray-500">Doğum Yeri:</span> {debtor.birthPlace}</div>
                )}
              </>
            )}
            {/* Şirket Bilgileri */}
            {debtor.type === DebtorType.COMPANY && (
              <>
                {debtor.vkn && (
                  <div><span className="text-gray-500">VKN:</span> {debtor.vkn}</div>
                )}
                {debtor.taxOffice && (
                  <div><span className="text-gray-500">Vergi Dairesi:</span> {debtor.taxOffice}</div>
                )}
                {debtor.mersisNo && (
                  <div><span className="text-gray-500">MERSİS No:</span> {debtor.mersisNo}</div>
                )}
                {debtor.tradeRegisterNo && (
                  <div><span className="text-gray-500">Ticaret Sicil No:</span> {debtor.tradeRegisterNo}</div>
                )}
              </>
            )}
            {/* Kamu Kurumu Bilgileri */}
            {debtor.type === DebtorType.PUBLIC_INSTITUTION && (
              <>
                {debtor.detsisNo && (
                  <div><span className="text-gray-500">DETSİS No:</span> {debtor.detsisNo}</div>
                )}
                {debtor.parentInstitution && (
                  <div><span className="text-gray-500">Bağlı Kurum:</span> {debtor.parentInstitution}</div>
                )}
                {debtor.authorizedPerson && (
                  <div><span className="text-gray-500">Yetkili Kişi:</span> {debtor.authorizedPerson}</div>
                )}
              </>
            )}
            {/* Ortak İletişim Bilgileri */}
            {debtor.phone && (
              <div className="flex items-center gap-1">
                <Phone className="h-3 w-3 text-gray-400" />
                <span className="text-gray-500">Tel:</span> {debtor.phone}
              </div>
            )}
            {debtor.email && (
              <div className="flex items-center gap-1">
                <Mail className="h-3 w-3 text-gray-400" />
                <span className="text-gray-500">E-posta:</span> {debtor.email}
              </div>
            )}
            {debtor.kepAddress && (
              <div className="col-span-2">
                <span className="text-gray-500">KEP:</span> {debtor.kepAddress}
              </div>
            )}
            {/* Adresler */}
            {addresses.length > 0 && (
              <div className="col-span-2 mt-2 pt-2 border-t">
                <div className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Kayıtlı Adresler ({addresses.length})
                </div>
                <div className="space-y-1">
                  {addresses.map((addr, idx) => (
                    <div key={addr.id || idx} className="text-xs bg-white px-2 py-1 rounded border">
                      <span className="font-medium">{addr.city}{addr.district ? ` / ${addr.district}` : ""}</span>
                      {addr.isPrimary && <span className="ml-1 text-emerald-600">(Ana)</span>}
                      {addr.isMernis && <span className="ml-1 text-blue-600">(MERNİS)</span>}
                      {addr.street && <div className="text-gray-500 truncate">{addr.street}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Risk Bilgisi */}
            {debtor.riskLevel && (
              <div className="col-span-2 mt-2 pt-2 border-t">
                <span className="text-gray-500">Risk Seviyesi:</span>{" "}
                <span className={`font-medium ${
                  debtor.riskLevel === 'COK_YUKSEK' ? 'text-red-600' :
                  debtor.riskLevel === 'YUKSEK' ? 'text-orange-600' :
                  debtor.riskLevel === 'ORTA' ? 'text-yellow-600' : 'text-green-600'
                }`}>
                  {debtor.riskLevel === 'COK_YUKSEK' ? 'Çok Yüksek' :
                   debtor.riskLevel === 'YUKSEK' ? 'Yüksek' :
                   debtor.riskLevel === 'ORTA' ? 'Orta' : 'Düşük'}
                </span>
                {debtor.riskNotes && <div className="text-xs text-gray-500 mt-1">{debtor.riskNotes}</div>}
              </div>
            )}
            {/* Notlar */}
            {debtor.notes && (
              <div className="col-span-2 mt-2 pt-2 border-t">
                <span className="text-gray-500">Notlar:</span>
                <div className="text-xs text-gray-600 mt-1">{debtor.notes}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Kontroller */}
      <div className="grid grid-cols-2 gap-2">
        {/* Rol Seçimi */}
        <div>
          <label className="block text-xs font-medium mb-1">Rol</label>
          <select
            value={caseDebtor.role}
            onChange={(e) => onUpdate({ role: e.target.value as DebtorRole })}
            className="w-full text-sm border rounded px-2 py-1.5 focus:outline-none focus:border-primary"
          >
            {Object.entries(DebtorRoleLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {/* Tebligat Adresi */}
        <div>
          <label className="block text-xs font-medium mb-1 flex items-center gap-1">
            <MapPin className="h-3 w-3" /> Tebligat Adresi
          </label>
          {addresses.length > 0 ? (
            <select
              value={caseDebtor.selectedAddressId || ""}
              onChange={(e) => {
                const addr = addresses.find((a) => a.id === e.target.value);
                onUpdate({ selectedAddressId: e.target.value, selectedAddress: addr });
              }}
              className="w-full text-sm border rounded px-2 py-1.5 focus:outline-none focus:border-primary"
            >
              {addresses.map((addr) => (
                <option key={addr.id} value={addr.id}>
                  {addr.city}{addr.district ? ` / ${addr.district}` : ""} 
                  {addr.isPrimary ? " (Ana)" : ""}
                  {addr.isMernis ? " (MERNİS)" : ""}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-xs text-amber-600 bg-amber-50 px-2 py-1.5 rounded">
              Adres tanımlı değil
            </div>
          )}
        </div>
      </div>

      {/* Dosya Notu */}
      <div className="mt-2">
        <label className="block text-xs font-medium mb-1">Dosya Notu (Opsiyonel)</label>
        <input
          type="text"
          value={caseDebtor.caseNote || ""}
          onChange={(e) => onUpdate({ caseNote: e.target.value })}
          placeholder="Bu borçlu için özel not..."
          className="w-full text-sm border rounded px-2 py-1.5 focus:outline-none focus:border-primary"
        />
      </div>
    </div>
  );
}
