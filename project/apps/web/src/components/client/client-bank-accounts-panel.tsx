'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { clientBankAccountsApi as api, type ClientBankAccountInput, type ClientBankAccountList, type ClientBankAccountView } from '@/lib/api/client-bank-accounts';

const empty = () => ({ bankName: '', branchName: '', accountHolder: '', iban: '', isPrimary: false });
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Banka hesabı işlemi tamamlanamadı.';

/** Keyed per Client: neither masked IBANs nor another client's form become write payloads. */
export function ClientBankAccountsPanel({ clientId }: { clientId: string }) {
  return <ClientBankAccountsForClient key={clientId} clientId={clientId} />;
}

function ClientBankAccountsForClient({ clientId }: { clientId: string }) {
  const [list, setList] = useState<ClientBankAccountList | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<ClientBankAccountView | null>(null);
  const [form, setForm] = useState(empty);
  const [success, setSuccess] = useState(false);
  const alive = useRef(true);
  const generation = useRef(0);
  const load = async () => {
    const ticket = ++generation.current;
    setLoading(true); setList(null);
    try {
      const result = await api.list(clientId);
      if (alive.current && generation.current === ticket) { setList(result); setError(''); }
    } catch (e) {
      if (alive.current && generation.current === ticket) { setList(null); setError(errorMessage(e)); }
    } finally {
      if (alive.current && generation.current === ticket) setLoading(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    void load();
    return () => { alive.current = false; ++generation.current; };
  // The parent key remounts this state for each client.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const edit = (row: ClientBankAccountView | null) => {
    setSelected(row); setSuccess(false); setError('');
    setForm(row ? { bankName: row.bankName, branchName: row.branchName ?? '', accountHolder: row.accountHolder ?? '', iban: '', isPrimary: row.isPrimary } : empty());
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !list || !(selected ? list.capabilities.canUpdate : list.capabilities.canCreate)) return;
    setSaving(true); setError(''); setSuccess(false);
    const payload: Partial<ClientBankAccountInput> = {};
    if (!selected || form.bankName.trim() !== selected.bankName) payload.bankName = form.bankName.trim();
    if (!selected || form.branchName.trim() !== (selected.branchName ?? '')) payload.branchName = form.branchName.trim() || null;
    if (!selected || form.accountHolder.trim() !== (selected.accountHolder ?? '')) payload.accountHolder = form.accountHolder.trim() || null;
    if (form.iban.trim()) payload.iban = form.iban;
    if (!selected || form.isPrimary !== selected.isPrimary) payload.isPrimary = form.isPrimary;
    try {
      if (selected) await api.update(clientId, selected.id, payload);
      else await api.create(clientId, payload as ClientBankAccountInput);
      if (!alive.current) return;
      setSelected(null); setForm(empty()); setSuccess(true);
      await load();
    } catch (e) {
      if (!alive.current) return;
      setError(errorMessage(e)); setSuccess(false);
      // Re-read scoped capabilities after every rejection; never retain old parent data on denial.
      const status = (e as { status?: number; response?: { status?: number } })?.status ?? (e as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403 || status === 404) {
        ++generation.current; setList(null); setSelected(null); setForm(empty());
      }
    } finally { if (alive.current) setSaving(false); }
  };
  const writable = list && (selected ? list.capabilities.canUpdate : list.capabilities.canCreate);
  return <section aria-label="Müvekkil banka hesapları" className="space-y-3 rounded-xl border bg-white p-5">
    <h2 className="font-semibold">Müvekkil banka hesapları</h2>
    {loading ? <p role="status">Banka hesapları yükleniyor.</p> : null}
    {error ? <p role="alert" className="text-red-700">{error}</p> : null}
    {success && !error ? <p role="status">Banka hesabı kaydedildi.</p> : null}
    {list ? <>
      {!list.items.length ? <p>Kayıtlı banka hesabı yok.</p> : <ul>{list.items.map(row => <li key={row.id} className="flex flex-wrap gap-2 py-1">
        <span>{row.bankName} · {row.branchName} · {row.accountHolder} · {row.ibanMasked}{row.isPrimary ? ' · Birincil' : ''}</span>
        {list.capabilities.canUpdate ? <button type="button" disabled={saving} onClick={() => edit(row)}>Düzenle: {row.bankName}</button> : null}
      </li>)}</ul>}
      {!writable ? <p>Bu müvekkilin banka hesaplarını değiştirme yetkiniz yok.</p> : <form onSubmit={submit} className="space-y-2">
        <h3>{selected ? 'Banka hesabını düzenle' : 'Banka hesabı ekle'}</h3>
        {(['bankName', 'branchName', 'accountHolder', 'iban'] as const).map((key, index) => <label key={key} className="block text-sm">
          {['Banka adı', 'Şube', 'Hesap sahibi', selected ? 'Yeni IBAN (değiştirmiyorsanız boş bırakın)' : 'IBAN'][index]}
          <input aria-label={['Banka adı', 'Şube', 'Hesap sahibi', 'IBAN'][index]} className="ml-2 rounded border p-1" value={form[key]} autoComplete="off"
            required={key === 'bankName' || (key === 'iban' && !selected)} disabled={saving}
            onChange={e => setForm(current => ({ ...current, [key]: e.target.value }))} />
        </label>)}
        <label><input type="checkbox" checked={form.isPrimary} disabled={saving} onChange={e => setForm(current => ({ ...current, isPrimary: e.target.checked }))} /> Birincil hesap</label>
        <div className="flex gap-3"><button type="submit" disabled={saving}>Banka hesabını kaydet</button>
          {selected ? <button type="button" disabled={saving} onClick={() => edit(null)}>Düzenlemeyi iptal et</button> : null}</div>
      </form>}
    </> : null}
  </section>;
}
