'use client';

/**
 * ClientForm — Native müvekkil oluşturma/düzenleme formu (Task 7A, v1).
 *
 * ClientModal (settings/clients/page.tsx) JSX'i TAŞINMADI — bilinçli karar (Task 7 design-gate):
 * ClientModal 570 satır, sayfa-kendi-state'ine sıkı bağlı, OCR-tarama coupling'i var, modal-chrome
 * (page değil). Bu bileşen davranış-mantığını (lib/client-write.ts) paylaşır, JSX'i sıfırdan ve
 * KÜÇÜK yazılmıştır. v1 kapsamı: kimlik + tek adres + yetkiler + not. Telefon/e-posta yalnız
 * create'te düzenlenebilir (edit'te salt-okuma — bkz. lib/client-write.ts başlık yorumu, contacts
 * deleteMany+recreate riski). Vekalet/tebrik/çoklu-adres v1'de YOK (backlog).
 */
import { useState, type FormEvent } from 'react';
import { Building2, Landmark, User } from 'lucide-react';
import {
  emptyClientFormValues,
  validateClientForm,
  type ClientFormType,
  type ClientFormValues,
} from '@/lib/client-write';
import {
  SENSITIVE_FIELD_LOCK_REASON,
  VIEWER_MUTATION_LOCK_REASON,
  type ClientMutationCapabilities,
} from '@/lib/client-mutation-capabilities';

const CLIENT_TYPES: { value: ClientFormType; label: string; icon: typeof User }[] = [
  { value: 'PERSON', label: 'Şahıs', icon: User },
  { value: 'COMPANY', label: 'Kurum', icon: Building2 },
  { value: 'PUBLIC', label: 'Kamu', icon: Landmark },
];

export interface ClientFormReadOnlyContact {
  phone: string | null;
  email: string | null;
  address: string | null;
}

export interface ClientFormProps {
  mode: 'create' | 'edit';
  initialValues?: ClientFormValues;
  /** Yalnız edit modunda: mevcut telefon/e-posta/adres salt-okuma özeti. */
  readOnlyContact?: ClientFormReadOnlyContact;
  /**
   * VER-02: müvekkilin yapısal `ClientAddress` satırı VAR mı. true ise bu formun düz adres
   * alanları OTORİTER DEĞİLDİR — backend onları uygulamaz (Workspace-yönetimli satırlar korunur).
   * Bu durumda alanlar salt-okuma gösterilir ve kullanıcı yetkili editöre yönlendirilir;
   * yanıltıcı "kaydedildi" izlenimi verilmez.
   */
  addressManagedExternally?: boolean;
  /** Yetkili adres editörünün adresi (Workspace "Adres" bölümü). */
  addressManagerHref?: string;
  /**
   * OWN-13 I01 (owner D02): BACKEND-DERIVED yetki sinyali. Form politikayı KENDİ BAŞINA
   * HESAPLAMAZ — bu nesneyi tüketir. API enforcement authority olarak KALIR; buradaki
   * disabled/gerekçe yalnız kullanıcıya kaydedilemeyecek bir alanı önceden bildirmek içindir.
   * Verilmezse (eski çağıran) davranış DEĞİŞMEZ: tüm alanlar açık kalır.
   */
  capabilities?: ClientMutationCapabilities;
  saving: boolean;
  submitError?: string | null;
  onSubmit: (values: ClientFormValues) => void;
  onCancel: () => void;
}

export function ClientForm({
  mode,
  initialValues,
  readOnlyContact,
  addressManagedExternally = false,
  addressManagerHref,
  capabilities,
  saving,
  submitError,
  onSubmit,
  onCancel,
}: ClientFormProps) {
  const [form, setForm] = useState<ClientFormValues>(initialValues ?? emptyClientFormValues());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isPerson = form.type === 'PERSON';
  const isCreate = mode === 'create';

  // OWN-13 I01: `capabilities` verilmemişse (eski çağıran) davranış DEĞİŞMEZ — hiçbir alan
  // kilitlenmez. Verilmişse yalnız backend'in bildirdiği sonuç uygulanır; burada rol
  // karşılaştırması veya eşik hesabı YAPILMAZ.
  const mutationBlocked = capabilities ? !(isCreate ? capabilities.canCreate : capabilities.canUpdateStandard) : false;
  // Hassas alanlar (kimlik/unvan/tür/vergi/vekalet yetkileri) — owner D02 sınıflandırması.
  // Create, hassas-update ayrımının İSTİSNASIDIR (owner): USER create yapabilir.
  const sensitiveLocked = capabilities ? !isCreate && !capabilities.canUpdateSensitive : false;
  const lockReason = mutationBlocked ? VIEWER_MUTATION_LOCK_REASON : SENSITIVE_FIELD_LOCK_REASON;
  const identityDisabled = mutationBlocked || sensitiveLocked;

  const set = <K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const nextErrors = validateClientForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {submitError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {submitError}
        </div>
      )}

      {/* OWN-13 I01: yetki gerekçesi. Kontroller GİZLENMEZ; disabled + gerekçeli gösterilir. */}
      {mutationBlocked && (
        <div
          data-testid="client-form-mutation-blocked"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {VIEWER_MUTATION_LOCK_REASON}
        </div>
      )}
      {!mutationBlocked && sensitiveLocked && (
        <div
          data-testid="client-form-sensitive-locked"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {SENSITIVE_FIELD_LOCK_REASON} Diğer alanları düzenleyip kaydedebilirsiniz.
        </div>
      )}

      {/* Müvekkil Türü */}
      <div className="bg-white rounded-xl border p-6">
        <label className="block text-sm font-medium mb-2">Müvekkil Türü</label>
        <div className="flex gap-2">
          {CLIENT_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => set('type', t.value)}
              disabled={identityDisabled}
              title={identityDisabled ? lockReason : undefined}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                form.type === t.value ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-600'
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Kimlik */}
      <div className="bg-white rounded-xl border p-6 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Kimlik</h3>
        {identityDisabled && (
          <p data-testid="client-form-identity-lock-reason" className="text-xs text-amber-800">
            {lockReason}
          </p>
        )}
        {isPerson ? (
          <div className="grid grid-cols-2 gap-3">
            <Field id="client-firstName" label="Ad" required error={errors.firstName}>
              <input
                id="client-firstName"
                value={form.firstName}
                onChange={(e) => set('firstName', e.target.value)}
                disabled={identityDisabled}
                title={identityDisabled ? lockReason : undefined}
                className="w-full border rounded px-2 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-500"
              />
            </Field>
            <Field id="client-lastName" label="Soyad" required error={errors.lastName}>
              <input
                id="client-lastName"
                value={form.lastName}
                onChange={(e) => set('lastName', e.target.value)}
                disabled={identityDisabled}
                title={identityDisabled ? lockReason : undefined}
                className="w-full border rounded px-2 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-500"
              />
            </Field>
            <Field id="client-tckn" label="TCKN" required error={errors.tckn}>
              <input
                id="client-tckn"
                value={form.tckn}
                onChange={(e) => set('tckn', e.target.value.replace(/\D/g, ''))}
                maxLength={11}
                disabled={identityDisabled}
                title={identityDisabled ? lockReason : undefined}
                className="w-full border rounded px-2 py-1.5 text-sm font-mono disabled:bg-gray-100 disabled:text-gray-500"
              />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field id="client-companyName" label="Kurum Adı" required error={errors.companyName} className="col-span-2">
              <input
                id="client-companyName"
                value={form.companyName}
                onChange={(e) => set('companyName', e.target.value)}
                disabled={identityDisabled}
                title={identityDisabled ? lockReason : undefined}
                className="w-full border rounded px-2 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-500"
              />
            </Field>
            <Field id="client-vkn" label="VKN" required error={errors.vkn}>
              <input
                id="client-vkn"
                value={form.vkn}
                onChange={(e) => set('vkn', e.target.value.replace(/\D/g, ''))}
                maxLength={10}
                disabled={identityDisabled}
                title={identityDisabled ? lockReason : undefined}
                className="w-full border rounded px-2 py-1.5 text-sm font-mono disabled:bg-gray-100 disabled:text-gray-500"
              />
            </Field>
            <Field id="client-taxOffice" label="Vergi Dairesi">
              <input
                id="client-taxOffice"
                value={form.taxOffice}
                onChange={(e) => set('taxOffice', e.target.value)}
                disabled={identityDisabled}
                title={identityDisabled ? lockReason : undefined}
                className="w-full border rounded px-2 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-500"
              />
            </Field>
          </div>
        )}
      </div>

      {/* İletişim */}
      <div className="bg-white rounded-xl border p-6 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">İletişim</h3>
        {isCreate ? (
          <div className="grid grid-cols-2 gap-3">
            <Field id="client-phone" label="Telefon" error={errors.phone}>
              <input
                id="client-phone"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="05XX XXX XX XX"
                disabled={mutationBlocked}
                title={mutationBlocked ? VIEWER_MUTATION_LOCK_REASON : undefined}
                className="w-full border rounded px-2 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-500"
              />
            </Field>
            <Field id="client-email" label="E-posta" error={errors.email}>
              <input
                id="client-email"
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="ornek@email.com"
                disabled={mutationBlocked}
                title={mutationBlocked ? VIEWER_MUTATION_LOCK_REASON : undefined}
                className="w-full border rounded px-2 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-500"
              />
            </Field>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-3 text-sm text-gray-600 space-y-1">
            <p>Telefon: {readOnlyContact?.phone || '—'}</p>
            <p>E-posta: {readOnlyContact?.email || '—'}</p>
            <p className="text-xs text-gray-400">
              İletişim bilgileri ayrı{' '}
              <a href="/settings/clients" className="underline">
                Müvekkiller (Ayarlar)
              </a>{' '}
              sayfasından yönetilir.
            </p>
          </div>
        )}
      </div>

      {/* Adres */}
      <div className="bg-white rounded-xl border p-6 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Adres</h3>
        {addressManagedExternally ? (
          // VER-02: yapısal ClientAddress satırı var → bu form adresi DEĞİŞTİREMEZ (backend
          // Workspace-yönetimli satırları korur). Düzenlenebilir alan göstermek yanıltıcı
          // "kaydedildi" izlenimi yaratırdı; onun yerine mevcut adres + yetkili editör linki.
          <div
            data-testid="client-form-address-managed"
            className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 space-y-1"
          >
            <p>Bu müvekkilin adresleri adres kayıtları üzerinden yönetiliyor.</p>
            <p className="text-amber-800">Mevcut adres: {readOnlyContact?.address || '—'}</p>
            <p className="text-xs">
              Adres eklemek, düzenlemek veya birincil adresi değiştirmek için{' '}
              {addressManagerHref ? (
                <a href={addressManagerHref} className="underline font-medium">
                  müvekkil detayındaki Adres bölümünü
                </a>
              ) : (
                'müvekkil detayındaki Adres bölümünü'
              )}{' '}
              kullanın. Buradan yapılan adres değişiklikleri UYGULANMAZ.
            </p>
          </div>
        ) : (
          <>
            <textarea
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="Adres"
              rows={2}
              disabled={mutationBlocked}
              title={mutationBlocked ? VIEWER_MUTATION_LOCK_REASON : undefined}
              className="w-full border rounded px-2 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-500"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
                placeholder="İl"
                disabled={mutationBlocked}
                className="border rounded px-2 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-500"
              />
              <input
                value={form.district}
                onChange={(e) => set('district', e.target.value)}
                placeholder="İlçe"
                disabled={mutationBlocked}
                className="border rounded px-2 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-500"
              />
              <input
                value={form.region}
                onChange={(e) => set('region', e.target.value)}
                placeholder="İcra Bölgesi"
                disabled={mutationBlocked}
                className="border rounded px-2 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>
          </>
        )}
      </div>

      {/* Yetkiler — temsil yetkisi niteliğinde: hassas sınıf (owner D02). */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Vekaletname Yetkileri</h3>
        {identityDisabled && (
          <p data-testid="client-form-poa-lock-reason" className="mb-2 text-xs text-amber-800">
            {lockReason}
          </p>
        )}
        <div className="flex flex-wrap gap-4">
          <Checkbox label="Ahzu Kabza" checked={form.canCollect} onChange={(v) => set('canCollect', v)} disabled={identityDisabled} />
          <Checkbox label="Feragat" checked={form.canWaive} onChange={(v) => set('canWaive', v)} disabled={identityDisabled} />
          <Checkbox label="Sulh" checked={form.canSettle} onChange={(v) => set('canSettle', v)} disabled={identityDisabled} />
          <Checkbox label="İbra" checked={form.canRelease} onChange={(v) => set('canRelease', v)} disabled={identityDisabled} />
        </div>
      </div>

      {/* Notlar */}
      <div className="bg-white rounded-xl border p-6">
        <label className="block text-xs font-medium mb-1">Notlar</label>
        <textarea
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={2}
          disabled={mutationBlocked}
          title={mutationBlocked ? VIEWER_MUTATION_LOCK_REASON : undefined}
          className="w-full border rounded px-2 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-500"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
        >
          İptal
        </button>
        <button
          type="submit"
          disabled={saving || mutationBlocked}
          title={mutationBlocked ? VIEWER_MUTATION_LOCK_REASON : undefined}
          className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  required,
  error,
  className = '',
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-medium mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center gap-1.5 ${disabled ? 'cursor-not-allowed text-gray-400' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="w-4 h-4 rounded"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}
