'use client';

/**
 * ClientAddressSection — Client Workspace "Adres" bölümü.
 *
 * "İletişim Kanalları" satır deseni mirror edilir (tip + ★ primary + değer + aksiyonlar).
 * addresses.length===0 → AÇIK legacy düz alan fallback'i (backfill YOK, eski kayıt olduğu gibi
 * gösterilir). DebtorAddress'in hukuki/tebligat/risk alanları buraya taşınmaz.
 *
 * VER-02: satır metni `clientAddressLine()` (client-display) ile üretilir — profil header'ı da
 * AYNI formatter'ı kullanır, seçim/format mantığı burada ÇOĞALTILMAZ.
 *
 * CLIENT-ARC-07-STAFF-HISTORY-I03 (charter §49.7 / ARC-07-D06):
 *  - "Aktif Adresler" ve "Arşivlenmiş Adresler" AYRI listelenir; arşiv satırı aktif listeye
 *    KARIŞMAZ ve birincil olarak GÖSTERİLMEZ.
 *  - Fiziksel silme aksiyonu UI'dan KALDIRILDI (I02: backend koşulsuz fail-closed). Yerine
 *    AÇIK "Arşivle" aksiyonu vardır — DELETE arşive yeniden ETİKETLENMEZ.
 *  - Birincil adres arşivlenirken geride güncel adres kalıyorsa yerine geçecek birincil
 *    AÇIKÇA seçtirilir; UI sessizce aday SEÇMEZ ("ilk adres birincil olur" davranışı YOK).
 *  - Geri alma varsayılan olarak non-primary'dir; birincilik yalnız AÇIK onayla devredilir.
 *  - Arşiv listesi I03 okuma sözleşmesinden gelir (GET .../addresses?status=archived).
 *    Portal expozürü YOK.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
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

function addressTypeLabel(addr: ClientAddress) {
  return ADDRESS_TYPE_LABELS[addr.type] || addr.type;
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
  const [archiveTarget, setArchiveTarget] = useState<ClientAddress | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<ClientAddress | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [archived, setArchived] = useState<ClientAddress[]>([]);
  const [archivedError, setArchivedError] = useState('');

  // I03: backend zaten `isCurrent:true` filtreliyor; bu ikinci filtre arşiv satırının aktif
  // listeye SIZMASINI yapısal olarak imkânsız kılar (savunma derinliği, §4).
  const activeAddresses = addresses.filter((addr) => addr.isCurrent !== false);

  const loadArchived = useCallback(async () => {
    setArchivedError('');
    try {
      const rows = await api.getClientAddresses(clientId, 'archived');
      setArchived(Array.isArray(rows) ? (rows as ClientAddress[]) : []);
    } catch (error) {
      setArchivedError(addressErrorMessage(error, 'Arşivlenmiş adresler yüklenemedi.'));
      setArchived([]);
    }
  }, [clientId]);

  useEffect(() => {
    void loadArchived();
  }, [loadArchived]);

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

  const submitArchive = async (addr: ClientAddress, replacementPrimaryAddressId?: string) => {
    setBusyId(addr.id);
    setActionError('');
    try {
      await api.archiveClientAddress(
        clientId,
        addr.id,
        replacementPrimaryAddressId ? { replacementPrimaryAddressId } : {},
      );
      setArchiveTarget(null);
      await loadArchived();
      onChanged();
    } catch (error) {
      setActionError(addressErrorMessage(error, 'Adres arşivlenemedi.'));
    } finally {
      setBusyId(null);
    }
  };

  const submitRestore = async (addr: ClientAddress, makePrimary: boolean) => {
    setBusyId(addr.id);
    setActionError('');
    try {
      await api.restoreClientAddress(clientId, addr.id, makePrimary ? { makePrimary: true } : {});
      setRestoreTarget(null);
      await loadArchived();
      onChanged();
    } catch (error) {
      setActionError(addressErrorMessage(error, 'Adres geri alınamadı.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="col-span-full space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Aktif Adresler</p>
        {activeAddresses.length > 0 ? (
          <div className="space-y-2">
            {activeAddresses.map((addr) => (
              <div key={addr.id} className="flex items-center gap-3 text-sm">
                <span className="text-gray-400 w-28 shrink-0">
                  {addressTypeLabel(addr)}
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
                    onClick={() => {
                      setActionError('');
                      setArchiveTarget(addr);
                    }}
                    className="text-amber-700 hover:underline disabled:opacity-50"
                  >
                    Arşivle
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-700">{fallbackAddress || 'Adres kayıtlı değil.'}</p>
        )}
      </div>

      {archived.length > 0 && (
        <div className="space-y-2 border-t border-gray-200 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Arşivlenmiş Adresler</p>
          <div className="space-y-2">
            {archived.map((addr) => (
              <div key={addr.id} className="flex items-center gap-3 text-sm">
                <span className="text-gray-400 w-28 shrink-0">{addressTypeLabel(addr)}</span>
                <span className="flex-1 text-gray-500 line-through">{clientAddressLine(addr)}</span>
                <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
                  Arşivlendi
                </span>
                <div className="flex items-center gap-2 shrink-0 text-xs">
                  <button
                    type="button"
                    disabled={busyId === addr.id}
                    onClick={() => {
                      setActionError('');
                      setRestoreTarget(addr);
                    }}
                    className="text-blue-600 hover:underline disabled:opacity-50"
                  >
                    Geri Al
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {archivedError && <p className="text-xs text-red-600">{archivedError}</p>}
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

      {archiveTarget && (
        <ArchiveAddressModal
          address={archiveTarget}
          // Aday kümesi: AYNI müvekkilin GÜNCEL ve hedef-olmayan adresleri. Arşiv satırları
          // zaten bu listede yoktur (aktif liste), hedef açıkça çıkarılır.
          candidates={activeAddresses.filter((addr) => addr.id !== archiveTarget.id)}
          busy={busyId === archiveTarget.id}
          onCancel={() => setArchiveTarget(null)}
          onConfirm={(replacementId) => submitArchive(archiveTarget, replacementId)}
        />
      )}

      {restoreTarget && (
        <RestoreAddressModal
          address={restoreTarget}
          currentPrimary={activeAddresses.find((addr) => addr.isPrimary) ?? null}
          busy={busyId === restoreTarget.id}
          onCancel={() => setRestoreTarget(null)}
          onConfirm={(makePrimary) => submitRestore(restoreTarget, makePrimary)}
        />
      )}
    </div>
  );
}

/**
 * I03 §5 — arşivleme onayı. Birincil adres arşivleniyor VE geride güncel adres kalıyorsa
 * yerine geçecek birincil AÇIKÇA seçilmeden onay verilemez (I02 backend'i de bunu zorunlu
 * kılar; UI sessizce aday seçmez).
 */
function ArchiveAddressModal({
  address,
  candidates,
  busy,
  onCancel,
  onConfirm,
}: {
  address: ClientAddress;
  candidates: ClientAddress[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: (replacementPrimaryAddressId?: string) => void;
}) {
  const requiresReplacement = address.isPrimary && candidates.length > 0;
  const [replacementId, setReplacementId] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-800">Adresi Arşivle</h3>
        <p className="text-sm text-gray-700">
          {addressTypeLabel(address)} — {clientAddressLine(address)}
        </p>
        <p className="text-xs text-gray-600">
          Arşivlenen adres silinmez; kayıt korunur ve aktif adres listesinden çıkarılır.
        </p>

        {requiresReplacement && (
          <div className="space-y-2 rounded-md bg-amber-50 p-3">
            <p className="text-xs text-amber-900">
              Bu adres birincil. Birincil adres, yerine geçecek bir adres seçilmeden arşivlenemez.
            </p>
            <label className="block text-xs font-medium text-gray-700">
              Yeni birincil adres
              <select
                aria-label="Yeni birincil adres"
                value={replacementId}
                onChange={(event) => setReplacementId(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-normal"
              >
                <option value="">Seçiniz</option>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {addressTypeLabel(candidate)} — {clientAddressLine(candidate)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {address.isPrimary && candidates.length === 0 && (
          <p className="text-xs text-gray-600">
            Bu, müvekkilin tek güncel adresi. Arşivlendikten sonra kayıtlı güncel adres kalmayacak.
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={busy || (requiresReplacement && !replacementId)}
            onClick={() => onConfirm(requiresReplacement ? replacementId : undefined)}
            className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-60"
          >
            {busy ? 'Arşivleniyor...' : 'Arşivle'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * I03 §6 — geri alma onayı. VARSAYILAN non-primary; birincilik yalnız açık onayla devredilir
 * ve devredilecekse mevcut birincilin değişeceği AÇIKÇA belirtilir.
 */
function RestoreAddressModal({
  address,
  currentPrimary,
  busy,
  onCancel,
  onConfirm,
}: {
  address: ClientAddress;
  currentPrimary: ClientAddress | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (makePrimary: boolean) => void;
}) {
  const [makePrimary, setMakePrimary] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-800">Adresi Geri Al</h3>
        <p className="text-sm text-gray-700">
          {addressTypeLabel(address)} — {clientAddressLine(address)}
        </p>
        <p className="text-xs text-gray-600">
          Adres güncel adresler listesine döner. Aksi belirtilmedikçe birincil YAPILMAZ.
        </p>

        <label className="flex items-start gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={makePrimary}
            onChange={(event) => setMakePrimary(event.target.checked)}
            className="mt-0.5"
          />
          <span>Bu adresi birincil yap</span>
        </label>

        {makePrimary && currentPrimary && (
          <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
            Mevcut birincil adres ({addressTypeLabel(currentPrimary)} — {clientAddressLine(currentPrimary)}) birincil
            olmaktan çıkacak.
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm(makePrimary)}
            className="rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
          >
            {busy ? 'Geri alınıyor...' : 'Geri Al'}
          </button>
        </div>
      </div>
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
