"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Loader2, Users, Building2, Landmark, Plus, MapPin, Search, Scroll, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import {
  Debtor, DebtorType, DebtorAddress, PublicInstitutionType, EstateHeir,
  DebtorTypeLabels, PublicInstitutionTypeLabels,
} from "@/types/debtor";

// Kamu kurumu arama sonucu tipi
interface PublicInstitutionResult {
  id: string;
  detsisNo: string;
  name: string;
  shortName?: string;
  category: string;
  city?: string;
  district?: string;
  address?: string;
  phone?: string;
  kepAddress?: string;
}

interface NewDebtorModalProps {
  initialType: DebtorType;
  editDebtor?: Debtor; // Düzenleme modu için mevcut borçlu
  onSave: (debtor: Debtor) => void;
  onClose: () => void;
}

const CITIES = [
  "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Amasya", "Ankara", "Antalya", "Artvin",
  "Aydın", "Balıkesir", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa",
  "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Edirne", "Elazığ", "Erzincan",
  "Erzurum", "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane", "Hakkari", "Hatay", "Isparta",
  "Mersin", "İstanbul", "İzmir", "Kars", "Kastamonu", "Kayseri", "Kırklareli", "Kırşehir",
  "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Kahramanmaraş", "Mardin", "Muğla",
  "Muş", "Nevşehir", "Niğde", "Ordu", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop",
  "Sivas", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Şanlıurfa", "Uşak", "Van",
  "Yozgat", "Zonguldak", "Aksaray", "Bayburt", "Karaman", "Kırıkkale", "Batman", "Şırnak",
  "Bartın", "Ardahan", "Iğdır", "Yalova", "Karabük", "Kilis", "Osmaniye", "Düzce"
];

export function NewDebtorModal({ initialType, editDebtor, onSave, onClose }: NewDebtorModalProps) {
  const isEditMode = !!editDebtor;
  const [type, setType] = useState<DebtorType>(editDebtor?.type || initialType);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Individual fields
  const [firstName, setFirstName] = useState(editDebtor?.firstName || "");
  const [lastName, setLastName] = useState(editDebtor?.lastName || "");
  const [tckn, setTckn] = useState(editDebtor?.tckn || "");
  const [gender, setGender] = useState(editDebtor?.gender || "");
  const [birthDate, setBirthDate] = useState(editDebtor?.birthDate?.split("T")[0] || "");
  const [fatherName, setFatherName] = useState(editDebtor?.fatherName || "");

  // Company fields
  const [companyName, setCompanyName] = useState(editDebtor?.companyName || "");
  const [vkn, setVkn] = useState(editDebtor?.vkn || "");
  const [taxOffice, setTaxOffice] = useState(editDebtor?.taxOffice || "");
  const [mersisNo, setMersisNo] = useState(editDebtor?.mersisNo || "");

  // Public Institution fields
  const [institutionName, setInstitutionName] = useState(editDebtor?.institutionName || "");
  const [detsisNo, setDetsisNo] = useState(editDebtor?.detsisNo || "");
  const [institutionType, setInstitutionType] = useState<PublicInstitutionType | "">(editDebtor?.institutionType || "");
  const [parentInstitution, setParentInstitution] = useState(editDebtor?.parentInstitution || "");

  // Estate (Tereke) fields
  const [deceasedName, setDeceasedName] = useState(editDebtor?.deceasedName || "");
  const [deceasedTckn, setDeceasedTckn] = useState(editDebtor?.deceasedTckn || "");
  const [deathDate, setDeathDate] = useState(editDebtor?.deathDate?.split("T")[0] || "");
  const [estateHeirs, setEstateHeirs] = useState<Partial<EstateHeir>[]>(
    editDebtor?.estateHeirs?.length 
      ? editDebtor.estateHeirs.map(h => ({ ...h }))
      : [{ name: "", tckn: "", address: "", city: "", shareRatio: "" }]
  );

  // Contact fields
  const [phone, setPhone] = useState(editDebtor?.phone || "");
  const [email, setEmail] = useState(editDebtor?.email || "");
  const [kepAddress, setKepAddress] = useState(editDebtor?.kepAddress || "");

  // Address
  const [addresses, setAddresses] = useState<Partial<DebtorAddress>[]>(
    editDebtor?.debtorAddresses?.length 
      ? editDebtor.debtorAddresses.map(a => ({ ...a }))
      : [{ addressType: "TEBLIGAT", street: "", city: "", district: "", isPrimary: true, isMernis: false }]
  );

  const addAddress = () => {
    setAddresses([...addresses, { addressType: "EV", street: "", city: "", district: "", isPrimary: false, isMernis: false }]);
  };

  // Estate heir functions
  const addHeir = () => {
    setEstateHeirs([...estateHeirs, { name: "", tckn: "", address: "", city: "", shareRatio: "" }]);
  };

  const updateHeir = (index: number, field: string, value: string) => {
    const updated = [...estateHeirs];
    updated[index] = { ...updated[index], [field]: value };
    setEstateHeirs(updated);
  };

  const removeHeir = (index: number) => {
    if (estateHeirs.length <= 1) return;
    setEstateHeirs(estateHeirs.filter((_, i) => i !== index));
  };

  const updateAddress = (index: number, field: string, value: any) => {
    const updated = [...addresses];
    updated[index] = { ...updated[index], [field]: value };
    // If setting as primary, unset others
    if (field === "isPrimary" && value) {
      updated.forEach((a, i) => { if (i !== index) a.isPrimary = false; });
    }
    setAddresses(updated);
  };

  const removeAddress = (index: number) => {
    if (addresses.length <= 1) return;
    setAddresses(addresses.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    if (type === DebtorType.INDIVIDUAL && (!firstName || !lastName)) {
      setError("Ad ve soyad zorunludur");
      return;
    }
    if (type === DebtorType.COMPANY && !companyName) {
      setError("Şirket adı zorunludur");
      return;
    }
    if (type === DebtorType.PUBLIC_INSTITUTION && !institutionName) {
      setError("Kurum adı zorunludur");
      return;
    }
    if (type === DebtorType.ESTATE) {
      if (!deceasedName) {
        setError("Murisin (müteveffanın) adı zorunludur");
        return;
      }
      const validHeirs = estateHeirs.filter(h => h.name && h.name.trim());
      if (validHeirs.length === 0) {
        setError("En az bir mirasçı girilmelidir");
        return;
      }
    }

    // At least one address with street and city (tereke hariç - mirasçı adresleri kullanılır)
    const validAddresses = addresses.filter(a => a.street && a.city);
    if (type !== DebtorType.ESTATE && validAddresses.length === 0) {
      setError("En az bir geçerli adres girilmelidir");
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        type,
        phone: phone || undefined,
        email: email || undefined,
        kepAddress: kepAddress || undefined,
        addresses: validAddresses,
      };

      if (type === DebtorType.INDIVIDUAL) {
        payload.firstName = firstName;
        payload.lastName = lastName;
        payload.tckn = tckn || undefined;
        payload.gender = gender || undefined;
        payload.birthDate = birthDate || undefined;
        payload.fatherName = fatherName || undefined;
      } else if (type === DebtorType.COMPANY) {
        payload.companyName = companyName;
        payload.vkn = vkn || undefined;
        payload.taxOffice = taxOffice || undefined;
        payload.mersisNo = mersisNo || undefined;
      } else if (type === DebtorType.PUBLIC_INSTITUTION) {
        payload.institutionName = institutionName;
        payload.detsisNo = detsisNo || undefined;
        payload.institutionType = institutionType || undefined;
        payload.parentInstitution = parentInstitution || undefined;
      } else if (type === DebtorType.ESTATE) {
        payload.deceasedName = deceasedName;
        payload.deceasedTckn = deceasedTckn || undefined;
        payload.deathDate = deathDate || undefined;
        // Mirasçıları ekle
        payload.estateHeirs = estateHeirs
          .filter(h => h.name && h.name.trim())
          .map(h => ({
            name: h.name,
            tckn: h.tckn || undefined,
            address: h.address || undefined,
            city: h.city || undefined,
            district: h.district || undefined,
            shareRatio: h.shareRatio || undefined,
            phone: h.phone || undefined,
            email: h.email || undefined,
          }));
      }

      let res;
      if (isEditMode && editDebtor?.id) {
        res = await api.patch(`/debtors/${editDebtor.id}`, payload);
      } else {
        res = await api.post("/debtors", payload);
      }
      onSave(res.data?.data || res.data);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Borçlu kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            {type === DebtorType.INDIVIDUAL && <Users className="h-5 w-5 text-emerald-500" />}
            {type === DebtorType.COMPANY && <Building2 className="h-5 w-5 text-blue-500" />}
            {type === DebtorType.PUBLIC_INSTITUTION && <Landmark className="h-5 w-5 text-purple-500" />}
            {type === DebtorType.ESTATE && <Scroll className="h-5 w-5 text-amber-500" />}
            {isEditMode ? "Borçlu Düzenle" : "Yeni Borçlu Ekle"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 overflow-y-auto max-h-[calc(90vh-130px)]">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>
          )}

          {/* Tip Seçimi */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Borçlu Türü</label>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setType(DebtorType.INDIVIDUAL)}
                disabled={type === DebtorType.ESTATE}
                className={`flex-1 min-w-[100px] py-2 px-3 rounded-lg text-sm font-medium border transition-colors flex items-center justify-center gap-1 ${
                  type === DebtorType.INDIVIDUAL
                    ? "bg-emerald-500 text-white border-emerald-500"
                    : type === DebtorType.ESTATE
                    ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                    : "bg-white hover:bg-gray-50 border-gray-200"
                }`}
              >
                <Users className="h-4 w-4" /> Gerçek Kişi
              </button>
              <button
                type="button"
                onClick={() => setType(DebtorType.COMPANY)}
                disabled={type === DebtorType.ESTATE}
                className={`flex-1 min-w-[100px] py-2 px-3 rounded-lg text-sm font-medium border transition-colors flex items-center justify-center gap-1 ${
                  type === DebtorType.COMPANY
                    ? "bg-blue-500 text-white border-blue-500"
                    : type === DebtorType.ESTATE
                    ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                    : "bg-white hover:bg-gray-50 border-gray-200"
                }`}
              >
                <Building2 className="h-4 w-4" /> Tüzel Kişi
              </button>
              <button
                type="button"
                onClick={() => setType(DebtorType.PUBLIC_INSTITUTION)}
                disabled={type === DebtorType.ESTATE}
                className={`flex-1 min-w-[100px] py-2 px-3 rounded-lg text-sm font-medium border transition-colors flex items-center justify-center gap-1 ${
                  type === DebtorType.PUBLIC_INSTITUTION
                    ? "bg-purple-500 text-white border-purple-500"
                    : type === DebtorType.ESTATE
                    ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                    : "bg-white hover:bg-gray-50 border-gray-200"
                }`}
              >
                <Landmark className="h-4 w-4" /> Kamu Kurumu
              </button>
              <button
                type="button"
                onClick={() => setType(DebtorType.ESTATE)}
                className={`flex-1 min-w-[100px] py-2 px-3 rounded-lg text-sm font-medium border transition-colors flex items-center justify-center gap-1 ${
                  type === DebtorType.ESTATE
                    ? "bg-amber-500 text-white border-amber-500"
                    : "bg-white hover:bg-gray-50 border-gray-200"
                }`}
              >
                <Scroll className="h-4 w-4" /> Tereke
              </button>
            </div>
            {type === DebtorType.ESTATE && (
              <p className="text-xs text-amber-600 mt-2">
                ⚠️ Tereke bir kişilik değildir. Takip mirasçılara yönelir, her mirasçıya ayrı tebligat yapılır.
              </p>
            )}
          </div>

          {/* Individual Fields */}
          {type === DebtorType.INDIVIDUAL && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium mb-1">Ad <span className="text-red-500">*</span></label>
                <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Soyad <span className="text-red-500">*</span></label>
                <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">TCKN</label>
                <input type="text" value={tckn} onChange={(e) => setTckn(e.target.value.replace(/\D/g, "").slice(0, 11))} maxLength={11} placeholder="11 haneli" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Cinsiyet</label>
                <select value={gender} onChange={(e) => setGender(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary">
                  <option value="">Seçiniz</option>
                  <option value="E">Erkek</option>
                  <option value="K">Kadın</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Doğum Tarihi</label>
                <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Baba Adı</label>
                <input type="text" value={fatherName} onChange={(e) => setFatherName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
              </div>
            </div>
          )}


          {/* Company Fields */}
          {type === DebtorType.COMPANY && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium mb-1">Şirket Adı <span className="text-red-500">*</span></label>
                <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">VKN</label>
                <input type="text" value={vkn} onChange={(e) => setVkn(e.target.value.replace(/\D/g, "").slice(0, 10))} maxLength={10} placeholder="10 haneli" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Vergi Dairesi</label>
                <input type="text" value={taxOffice} onChange={(e) => setTaxOffice(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">MERSİS No</label>
                <input type="text" value={mersisNo} onChange={(e) => setMersisNo(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
              </div>
            </div>
          )}

          {/* Public Institution Fields with Autocomplete */}
          {type === DebtorType.PUBLIC_INSTITUTION && (
            <PublicInstitutionFields
              institutionName={institutionName}
              setInstitutionName={setInstitutionName}
              detsisNo={detsisNo}
              setDetsisNo={setDetsisNo}
              institutionType={institutionType}
              setInstitutionType={setInstitutionType}
              parentInstitution={parentInstitution}
              setParentInstitution={setParentInstitution}
              kepAddress={kepAddress}
              setKepAddress={setKepAddress}
              addresses={addresses}
              setAddresses={setAddresses}
            />
          )}

          {/* Estate (Tereke) Fields */}
          {type === DebtorType.ESTATE && (
            <div className="mb-4">
              {/* Muris Bilgileri */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                <h4 className="text-sm font-medium text-amber-800 mb-2 flex items-center gap-1">
                  <Scroll className="h-4 w-4" /> Muris (Müteveffa) Bilgileri
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium mb-1">Murisin Adı Soyadı <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={deceasedName}
                      onChange={(e) => setDeceasedName(e.target.value)}
                      placeholder="Ör: Ahmet Yılmaz"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Murisin TCKN</label>
                    <input
                      type="text"
                      value={deceasedTckn}
                      onChange={(e) => setDeceasedTckn(e.target.value.replace(/\D/g, "").slice(0, 11))}
                      maxLength={11}
                      placeholder="11 haneli"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Ölüm Tarihi</label>
                    <input
                      type="date"
                      value={deathDate}
                      onChange={(e) => setDeathDate(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Mirasçılar */}
              <div className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium flex items-center gap-1">
                    <Users className="h-4 w-4" /> Mirasçılar
                  </h4>
                  <button
                    type="button"
                    onClick={addHeir}
                    className="text-xs text-amber-600 hover:text-amber-700 flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Mirasçı Ekle
                  </button>
                </div>
                <div className="space-y-2">
                  {estateHeirs.map((heir, index) => (
                    <div key={index} className="bg-gray-50 border rounded-lg p-2 relative">
                      {estateHeirs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeHeir(index)}
                          className="absolute top-2 right-2 text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                      <div className="grid grid-cols-4 gap-2">
                        <div className="col-span-2">
                          <label className="block text-xs font-medium mb-1">Ad Soyad <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            value={heir.name || ""}
                            onChange={(e) => updateHeir(index, "name", e.target.value)}
                            placeholder="Mirasçı adı soyadı"
                            className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">TCKN</label>
                          <input
                            type="text"
                            value={heir.tckn || ""}
                            onChange={(e) => updateHeir(index, "tckn", e.target.value.replace(/\D/g, "").slice(0, 11))}
                            maxLength={11}
                            placeholder="11 haneli"
                            className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Miras Payı</label>
                          <input
                            type="text"
                            value={heir.shareRatio || ""}
                            onChange={(e) => updateHeir(index, "shareRatio", e.target.value)}
                            placeholder="Ör: 1/4"
                            className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">İl</label>
                          <select
                            value={heir.city || ""}
                            onChange={(e) => updateHeir(index, "city", e.target.value)}
                            className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-amber-500"
                          >
                            <option value="">Seçiniz</option>
                            {CITIES.map((city) => (
                              <option key={city} value={city}>{city}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">İlçe</label>
                          <input
                            type="text"
                            value={heir.district || ""}
                            onChange={(e) => updateHeir(index, "district", e.target.value)}
                            className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium mb-1">Adres</label>
                          <input
                            type="text"
                            value={heir.address || ""}
                            onChange={(e) => updateHeir(index, "address", e.target.value)}
                            placeholder="Mahalle, sokak, bina no..."
                            className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Telefon</label>
                          <input
                            type="tel"
                            value={heir.phone || ""}
                            onChange={(e) => updateHeir(index, "phone", e.target.value)}
                            placeholder="05XX XXX XX XX"
                            className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">E-posta</label>
                          <input
                            type="email"
                            value={heir.email || ""}
                            onChange={(e) => updateHeir(index, "email", e.target.value)}
                            placeholder="ornek@mail.com"
                            className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  💡 Veraset ilamındaki tüm mirasçıları ekleyin. Her mirasçıya ayrı tebligat yapılacaktır.
                </p>
              </div>
            </div>
          )}

          {/* Contact Fields - Tereke hariç */}
          {type !== DebtorType.ESTATE && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium mb-1">Telefon</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05XX XXX XX XX" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">E-posta</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">KEP Adresi</label>
                <input type="email" value={kepAddress} onChange={(e) => setKepAddress(e.target.value)} placeholder="xxx@hs01.kep.tr" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
              </div>
            </div>
          )}


          {/* Addresses - Tereke hariç (tereke için mirasçı adresleri kullanılır) */}
          {type !== DebtorType.ESTATE && (
            <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <MapPin className="h-4 w-4" /> Adresler
              </label>
              <button type="button" onClick={addAddress} className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus className="h-3 w-3" /> Adres Ekle
              </button>
            </div>
            <div className="space-y-3">
              {addresses.map((addr, index) => (
                <div key={index} className="border rounded-lg p-3 relative">
                  {addresses.length > 1 && (
                    <button type="button" onClick={() => removeAddress(index)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="block text-xs font-medium mb-1">Adres Türü</label>
                      <select value={addr.addressType} onChange={(e) => updateAddress(index, "addressType", e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-primary">
                        <option value="TEBLIGAT">Tebligat</option>
                        <option value="EV">Ev</option>
                        <option value="IS">İş</option>
                        <option value="MERNIS">MERNİS</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">İl <span className="text-red-500">*</span></label>
                      <select value={addr.city} onChange={(e) => updateAddress(index, "city", e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-primary">
                        <option value="">Seçiniz</option>
                        {CITIES.map((city) => (
                          <option key={city} value={city}>{city}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">İlçe</label>
                      <input type="text" value={addr.district || ""} onChange={(e) => updateAddress(index, "district", e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-primary" />
                    </div>
                    <div className="flex items-end gap-2">
                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                        <input type="checkbox" checked={addr.isPrimary} onChange={(e) => updateAddress(index, "isPrimary", e.target.checked)} className="rounded" />
                        Ana Adres
                      </label>
                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                        <input type="checkbox" checked={addr.isMernis} onChange={(e) => updateAddress(index, "isMernis", e.target.checked)} className="rounded" />
                        MERNİS
                      </label>
                    </div>
                    <div className="col-span-4">
                      <label className="block text-xs font-medium mb-1">Adres <span className="text-red-500">*</span></label>
                      <textarea value={addr.street || ""} onChange={(e) => updateAddress(index, "street", e.target.value)} rows={2} placeholder="Mahalle, cadde, sokak, bina no, daire no..." className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-primary resize-none" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">
              İptal
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


// ==================== PUBLIC INSTITUTION AUTOCOMPLETE ====================

interface PublicInstitutionFieldsProps {
  institutionName: string;
  setInstitutionName: (v: string) => void;
  detsisNo: string;
  setDetsisNo: (v: string) => void;
  institutionType: PublicInstitutionType | "";
  setInstitutionType: (v: PublicInstitutionType | "") => void;
  parentInstitution: string;
  setParentInstitution: (v: string) => void;
  kepAddress: string;
  setKepAddress: (v: string) => void;
  addresses: Partial<DebtorAddress>[];
  setAddresses: (v: Partial<DebtorAddress>[]) => void;
}

function PublicInstitutionFields({
  institutionName, setInstitutionName,
  detsisNo, setDetsisNo,
  institutionType, setInstitutionType,
  parentInstitution, setParentInstitution,
  kepAddress, setKepAddress,
  addresses, setAddresses,
}: PublicInstitutionFieldsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PublicInstitutionResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get<PublicInstitutionResult[]>(`/public-institutions/search?q=${encodeURIComponent(searchQuery)}&limit=15`);
        setSearchResults(res.data || []);
        setShowDropdown(true);
      } catch (e) {
        console.error("Search error:", e);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (inst: PublicInstitutionResult) => {
    setInstitutionName(inst.name);
    setDetsisNo(inst.detsisNo);
    if (inst.kepAddress) setKepAddress(inst.kepAddress);
    
    // Kategoriyi kurum türüne çevir
    const categoryMap: Record<string, PublicInstitutionType> = {
      BAKANLIK: PublicInstitutionType.BAKANLIK,
      GENEL_MUDURLUK: PublicInstitutionType.GENEL_MUDURLUK,
      BASKANLIK: PublicInstitutionType.BASKANLIK,
      KURUL: PublicInstitutionType.KURUL,
      KURUM: PublicInstitutionType.KURUM,
      UNIVERSITE: PublicInstitutionType.UNIVERSITE,
      BELEDIYE: PublicInstitutionType.BELEDIYE,
      IL_OZEL_IDARESI: PublicInstitutionType.IL_OZEL_IDARESI,
      VALILIK: PublicInstitutionType.VALILIK,
      KAYMAKAMLIK: PublicInstitutionType.KAYMAKAMLIK,
      MAHKEME: PublicInstitutionType.MAHKEME,
      SAVCILIK: PublicInstitutionType.SAVCILIK,
      DIGER: PublicInstitutionType.DIGER,
    };
    if (inst.category && categoryMap[inst.category]) {
      setInstitutionType(categoryMap[inst.category]);
    }

    // Adres bilgisi varsa ekle
    if (inst.address && inst.city) {
      const newAddress: Partial<DebtorAddress> = {
        addressType: "TEBLIGAT",
        street: inst.address,
        city: inst.city,
        district: inst.district || "",
        isPrimary: true,
        isMernis: false,
      };
      // Mevcut adresleri güncelle veya yeni ekle
      if (addresses.length === 1 && !addresses[0].street) {
        setAddresses([newAddress]);
      } else {
        setAddresses([newAddress, ...addresses.filter(a => a.street)]);
      }
    }

    setSearchQuery("");
    setShowDropdown(false);
  };

  const getCategoryLabel = (cat: string) => {
    const labels: Record<string, string> = {
      BAKANLIK: "Bakanlık",
      GENEL_MUDURLUK: "Genel Müdürlük",
      BASKANLIK: "Başkanlık",
      KURUL: "Kurul",
      KURUM: "Kurum",
      UNIVERSITE: "Üniversite",
      BELEDIYE: "Belediye",
      IL_OZEL_IDARESI: "İl Özel İdaresi",
      VALILIK: "Valilik",
      KAYMAKAMLIK: "Kaymakamlık",
      MAHKEME: "Mahkeme",
      SAVCILIK: "Savcılık",
      DIGER: "Diğer",
    };
    return labels[cat] || cat;
  };

  return (
    <div className="grid grid-cols-2 gap-3 mb-4">
      {/* Autocomplete Search */}
      <div className="col-span-2 relative" ref={dropdownRef}>
        <label className="block text-xs font-medium mb-1">
          <Search className="inline h-3 w-3 mr-1" />
          Kamu Kurumu Ara (DETSİS)
        </label>
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Kurum adı veya DETSİS no yazın..."
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-8 h-4 w-4 animate-spin text-gray-400" />
        )}
        
        {/* Dropdown */}
        {showDropdown && searchResults.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {searchResults.map((inst) => (
              <button
                key={inst.id}
                type="button"
                onClick={() => handleSelect(inst)}
                className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b last:border-b-0"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{inst.name}</span>
                  <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{getCategoryLabel(inst.category)}</span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  DETSİS: {inst.detsisNo} {inst.city && `• ${inst.city}`}
                </div>
              </button>
            ))}
          </div>
        )}
        {showDropdown && searchQuery.length >= 2 && searchResults.length === 0 && !searching && (
          <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg p-3 text-sm text-gray-500">
            Sonuç bulunamadı. Manuel olarak girebilirsiniz.
          </div>
        )}
      </div>

      {/* Manual Entry Fields */}
      <div className="col-span-2">
        <label className="block text-xs font-medium mb-1">Kurum Adı <span className="text-red-500">*</span></label>
        <input
          type="text"
          value={institutionName}
          onChange={(e) => setInstitutionName(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">DETSİS No</label>
        <input
          type="text"
          value={detsisNo}
          onChange={(e) => setDetsisNo(e.target.value)}
          placeholder="detsis.gov.tr"
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Kurum Türü</label>
        <select
          value={institutionType}
          onChange={(e) => setInstitutionType(e.target.value as PublicInstitutionType)}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
        >
          <option value="">Seçiniz</option>
          {Object.entries(PublicInstitutionTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <div className="col-span-2">
        <label className="block text-xs font-medium mb-1">Bağlı Olduğu Kurum</label>
        <input
          type="text"
          value={parentInstitution}
          onChange={(e) => setParentInstitution(e.target.value)}
          placeholder="Ör: İçişleri Bakanlığı"
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
      </div>
    </div>
  );
}
