'use client';

/**
 * ClientAddressSection — Client Workspace "Adres" bölümü (ClientAddress-4).
 *
 * "İletişim Kanalları" satır deseni mirror edilir (tip + ★ primary + değer + aksiyonlar).
 * addresses.length===0 → AÇIK legacy düz alan fallback'i (backfill YOK, eski kayıt olduğu gibi
 * gösterilir). isCurrent/arşiv UI'a açılmaz; DebtorAddress'in hukuki/tebligat/risk alanları buraya
 * taşınmaz — yalnız dedicated endpoint'lerle (POST /clients/:clientId/addresses,
 * PUT/DELETE /clients/:clientId/addresses/:addressId) id-bazlı CRUD.
 *
 * VER-02: satır metni `clientAddressLine()` (client-display) ile üretilir — profil header'ı da
 * AYNI formatter'ı kullanır, seçim/format mantığı burada ÇOĞALTILMAZ.
 */
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { clientAddressLine } from '@/lib/client-display';
import type { ClientAddress, ClientAddressType, ClientAddressWritePayload } from '@/lib/api/client.types';

const ADDRESS_TYPE_LABELS: Record<ClientAddressType, string> = {
  MERNIS: 'MERNİS',
  TICARI: 'Ticari',
  TEBLIGAT: 'Tebligat',
  FATURA: 'Fatura',
  BEYAN: 'Beyan',
};

function addressErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

interface ClientAddressSectionProps {
  clientId: string;
  addresses: ClientAddress[];
  fallbackAddress: string | null;
  onChanged: () => void;
}

export function ClientAddressSection({ clientId, addresses, fallbackAddress, onChanged }: ClientAddressSectionProps) {
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<ClientAddress | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const openCreate = () => {
    setEditing(null);
    setActionError('');
    setModalMode('create');
  };

  const openEdit = (addr: ClientAddress) => {
    setEditing(addr);
    setActionError('');
    setModalMode('edit');
  };

  const closeModal = () => {
    setModalMode(null);
    setEditing(null);
  };

  const handlePromote = async (addr: ClientAddress) => {
    if (addr.isPrimary || busyId) return;
    setBusyId(addr.id);
    setActionError('');
    try {
      await api.updateClientAddress(clientId, addr.id, { isPrimary: true });
      onChanged();
    } catch (error) {
      setActionError(addressErrorMessage(error, 'Birincil adres güncellenemedi.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (addr: ClientAddress) => {
    if (busyId) return;
    if (!confirm('Bu adresi silmek istediğinize emin misiniz?')) return;
    setBusyId(addr.id);
    setActionError('');
    try {
      await api.deleteClientAddress(clientId, addr.id);
      onChanged();
    } catch (error) {
      setActionError(addressErrorMessage(error, 'Adres silinemedi.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="col-span-full space-y-3">
      {addresses.length > 0 ? (
        <div className="space-y-2">
          {addresses.map((addr) => (
            <div key={addr.id} className="flex items-center gap-3 text-sm">
              <span className="text-gray-400 w-28 shrink-0">
                {ADDRESS_TYPE_LABELS[addr.type] || addr.type}
                {addr.isPrimary ? ' ★' : ''}
              </span>
              <span className="flex-1 text-gray-700">{clientAddressLine(addr)}</span>
              <div className="flex items-center gap-2 shrink-0 text-xs">
                {!addr.isPrimary && (
                  <button
                    type="button"
                    disabled={busyId === addr.id}
                    onClick={() => handlePromote(addr)}
                    className="text-blue-600 hover:underline disabled:opacity-50"
                  >
                    Birincil Yap
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyId === addr.id}
                  onClick={() => openEdit(addr)}
                  className="text-blue-600 hover:underline disabled:opacity-50"
                >
                  Düzenle
                </button>
                <button
                  type="button"
                  disabled={busyId === addr.id}
                  onClick={() => handleDelete(addr)}
                  className="text-red-600 hover:underline disabled:opacity-50"
                >
                  Sil
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-700">{fallbackAddress || 'Adres kayıtlı değil.'}</p>
      )}

      {actionError && <p className="text-xs text-red-600">{actionError}</p>}

      <button type="button" onClick={openCreate} className="text-xs font-medium text-blue-600 hover:underline">
        + Adres Ekle
      </button>

      {modalMode && (
        <ClientAddressModal
          clientId={clientId}
          mode={modalMode}
          address={editing}
          onClose={closeModal}
          onSaved={() => {
            closeModal();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function ClientAddressModal({
  clientId,
  mode,
  address,
  onClose,
  onSaved,
}: {
  clientId: string;
  mode: 'create' | 'edit';
  address: ClientAddress | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<ClientAddressType>(address?.type || 'BEYAN');
  const [street, setStreet] = useState(address?.street || '');
  const [city, setCity] = useState(address?.city || '');
  const [district, setDistrict] = useState(address?.district || '');
  const [region, setRegion] = useState(address?.region || '');
  const [postalCode, setPostalCode] = useState(address?.postalCode || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    const payload: ClientAddressWritePayload = {
      type,
      street: street.trim() || undefined,
      city: city.trim() || undefined,
      district: district.trim() || undefined,
      region: region.trim() || undefined,
      postalCode: postalCode.trim() || undefined,
    };
    try {
      if (mode === 'create') {
        await api.createClientAddress(clientId, payload);
      } else if (address) {
        await api.updateClientAddress(clientId, address.id, payload);
      }
      onSaved();
    } catch (err) {
      setError(addressErrorMessage(err, 'Adres kaydedilemedi.'));
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(event) => event.target === event.currentTarget && !saving && onClose()}
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">
          {mode === 'create' ? 'Adres Ekle' : 'Adresi Düzenle'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-xs font-medium text-gray-700">
            Tür
            <select
              value={type}
              onChange={(event) => setType(event.target.value as ClientAddressType)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-normal"
            >
              {Object.entries(ADDRESS_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-gray-700">
            Adres
            <input
              value={street}
              onChange={(event) => setStreet(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-normal"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-gray-700">
              İlçe
              <input
                value={district}
                onChange={(event) => setDistrict(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="block text-xs font-medium text-gray-700">
              Şehir
              <input
                value={city}
                onChange={(event) => setCity(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-normal"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-gray-700">
              Bölge
              <input
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="block text-xs font-medium text-gray-700">
              Posta Kodu
              <input
                value={postalCode}
                onChange={(event) => setPostalCode(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-normal"
              />
            </label>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
