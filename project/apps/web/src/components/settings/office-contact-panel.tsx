'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { CONTACT_KEYS, contactFailure, ContactCapabilities, ContactKey, ContactPermissionState, ContactStaff, ContactValues,
  OFFICE_CONTACT_FIELDS, officeContacts, STAFF_CONTACT_FIELDS } from '@/lib/api/office-contact';

const LABEL: Record<string, string> = { address: 'Adres', city: 'İl', district: 'İlçe', postalCode: 'Posta kodu', phone: 'Telefon', fax: 'Faks', email: 'E-posta', website: 'Web sitesi', mobilePhone: 'Cep telefonu', whatsappPhone: 'WhatsApp telefonu' };
const KEY_LABEL: Record<ContactKey, string> = { 'office.contact.manage': 'Büro iletişimini düzenle (G1)', 'staff.contact.manage': 'Personel iletişimini düzenle (G2)' };
type Page<T> = { items: T[]; nextCursor: string | null };
type State = { capabilities: ContactCapabilities; office: ContactValues | null; staff: Page<ContactStaff> | null; subjects: Page<ContactStaff> | null };

function ContactForm({ title, fields, initial, writable, save, invalidate }: {
  title: string; fields: readonly string[]; initial: ContactValues; writable: boolean;
  save: (v: ContactValues) => Promise<ContactValues>; invalidate: (message: string) => void;
}) {
  const [values, setValues] = useState<ContactValues>(() => Object.fromEntries(fields.map(k => [k, initial[k] ?? null])));
  const [baseline, setBaseline] = useState<ContactValues>(values);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  return <form className="space-y-3 rounded border p-4" onSubmit={async e => {
    e.preventDefault(); if (busy || !writable) return;
    setBusy(true); setMessage('');
    try {
      const payload = Object.fromEntries(fields.filter(k => values[k] !== (baseline[k] ?? null)).map(k => [k, values[k]]));
      if (!Object.keys(payload).length) { setMessage('Değişiklik yok.'); return; }
      const saved = await save(payload); setBaseline(saved); setValues(saved); setMessage('İletişim bilgileri kaydedildi.');
    } catch (error) { setValues({}); invalidate(contactFailure(error)); }
    finally { setBusy(false); }
  }}>
    <h2 className="font-semibold">{title}</h2>
    {fields.map(k => <label key={k} className="block">{LABEL[k]}<input className="block w-full rounded border p-2" value={values[k] ?? ''}
      disabled={busy || !writable} onChange={e => setValues(v => ({ ...v, [k]: e.target.value || null }))} /></label>)}
    {writable && <button disabled={busy} className="rounded bg-blue-700 px-4 py-2 text-white">{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>}
    {message && <p role="status">{message}</p>}
  </form>;
}

function PermissionPanel({ subjects, more, invalidate }: { subjects: Page<ContactStaff>; more: () => Promise<void>; invalidate: (message: string) => void }) {
  const [staffId, setStaffId] = useState(''), [state, setState] = useState<ContactPermissionState | null>(null);
  const [key, setKey] = useState<ContactKey>(CONTACT_KEYS[0]), [from, setFrom] = useState(''), [until, setUntil] = useState(''), [reason, setReason] = useState('');
  const [version, setVersion] = useState(0), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => {
    let active = true; setState(null); setMessage('');
    if (staffId) void officeContacts.permissions(staffId).then(value => { if (active) setState(value); }, e => { if (active) invalidate(contactFailure(e)); });
    return () => { active = false; };
  }, [staffId, version, invalidate]);
  const act = async (grant: boolean) => {
    if (busy || !state || state.staffId !== staffId) return;
    setBusy(true); setMessage('');
    try {
      if (grant) await officeContacts.grant(staffId, { permissionKey: key, validFrom: new Date(from).toISOString(), validUntil: new Date(until).toISOString(), reason });
      else await officeContacts.revoke(staffId, key, reason);
      setVersion(v => v + 1); setMessage(grant ? 'İzin kaydedildi.' : 'İlgili ALLOW izinleri sona erdirildi.');
    } catch (e) { setState(null); invalidate(contactFailure(e)); }
    finally { setBusy(false); }
  };
  return <section className="rounded border p-4 space-y-3"><h2 className="font-semibold">İletişim izinlerini yönet</h2>
    <p>GLOBAL izin yalnız ilgili iletişim alanlarında ve kişinin doğrulanan bürosunda geçerlidir. F01 veya onay yetkisi vermez.</p>
    <label className="block">İzin verilecek personel<select value={staffId} disabled={busy} onChange={e => { setState(null); setStaffId(e.target.value); }} className="block border p-2">
      <option value="">Personel seçin</option>{subjects.items.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.isActive ? '' : ' (pasif)'}</option>)}
    </select></label>
    {subjects.nextCursor && <button type="button" onClick={() => void more()}>Diğer personelleri yükle</button>}
    {state && state.staffId === staffId && <>
      <ul aria-label="Mevcut iletişim izinleri">{state.grants.map(g => <li key={g.id}>{KEY_LABEL[g.permissionKey]} · {g.effect} · {g.validFrom} → {g.validUntil ?? 'bitiş tanımsız'}</li>)}</ul>
      <form onSubmit={e => { e.preventDefault(); void act(true); }} className="space-y-2">
        <label className="block">İzin<select value={key} onChange={e => setKey(e.target.value as ContactKey)} disabled={busy} className="block border p-2">{CONTACT_KEYS.map(k => <option key={k} value={k}>{KEY_LABEL[k]}</option>)}</select></label>
        <label className="block">Başlangıç<input type="datetime-local" required value={from} onChange={e => setFrom(e.target.value)} disabled={busy} className="block border p-2" /></label>
        <label className="block">Bitiş<input type="datetime-local" required value={until} onChange={e => setUntil(e.target.value)} disabled={busy} className="block border p-2" /></label>
        <label className="block">Gerekçe<input required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} className="block w-full border p-2" /></label>
        <button disabled={busy || !state.canReceiveGrant} className="rounded bg-blue-700 px-4 py-2 text-white">Süreli izin ver</button>
        <button type="button" disabled={busy || !reason.trim()} onClick={() => void act(false)} className="ml-2 rounded border px-4 py-2">İlgili izinleri geri al</button>
      </form>
    </>}{message && <p role="status">{message}</p>}
  </section>;
}

export function OfficeContactPanel() {
  const { user } = useAuth();
  const [state, setState] = useState<State | null>(null), [error, setError] = useState(''), [version, setVersion] = useState(0), [selected, setSelected] = useState('');
  // Stable callback keeps permission reads tied to the selected person rather than each render.
  const [invalidate] = useState(() => (message: string) => { setState(null); setSelected(''); setError(message); });
  useEffect(() => {
    let active = true; setState(null); setSelected(''); setError('');
    void (async () => {
      try {
        const capabilities = await officeContacts.capabilities();
        const [office, staff, subjects] = await Promise.all([capabilities.office ? officeContacts.office() : null,
          capabilities.staff ? officeContacts.staff() : null, capabilities.managePermissions ? officeContacts.subjects() : null]);
        if (active) setState({ capabilities, office, staff, subjects });
      } catch (e) { if (active) invalidate(contactFailure(e)); }
    })();
    return () => { active = false; };
  }, [user?.id, version, invalidate]);
  const more = async (kind: 'staff' | 'subjects') => {
    const cursor = state?.[kind]?.nextCursor; if (!cursor) return;
    try {
      const page = await officeContacts[kind](cursor);
      setState(s => !s || s[kind]?.nextCursor !== cursor ? s : ({ ...s, [kind]: { items: [...s[kind]!.items, ...page.items], nextCursor: page.nextCursor } }));
    } catch (e) { invalidate(contactFailure(e)); }
  };
  const staff = state?.staff?.items.find(p => p.id === selected);
  return <main className="max-w-3xl space-y-5 p-5"><h1 className="text-xl font-semibold">İletişim bilgileri</h1>
    {error ? <><p role="alert">{error}</p><button onClick={() => setVersion(v => v + 1)}>Bilgileri yenile</button></> : !state ? <p>Yükleniyor…</p> : <>
      {!state.capabilities.office && !state.capabilities.staff && !state.capabilities.managePermissions && <p role="alert">Bu iletişim ekranında işlem yetkiniz yok.</p>}
      {state.office && <ContactForm key={`office-${version}`} title="Büro iletişimi" fields={OFFICE_CONTACT_FIELDS} initial={state.office} writable={state.capabilities.writeOffice} save={officeContacts.saveOffice} invalidate={invalidate} />}
      {state.staff && <section><label>İletişimi düzenlenecek personel<select className="block border p-2" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Personel seçin</option>{state.staff.items.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}</select></label>
        {state.staff.nextCursor && <button onClick={() => void more('staff')}>Diğer personelleri yükle</button>}
        {staff && <ContactForm key={`${user?.id}-${staff.id}-${version}`} title={`${staff.firstName} ${staff.lastName} iletişimi`} fields={STAFF_CONTACT_FIELDS} initial={Object.fromEntries(STAFF_CONTACT_FIELDS.map(k => [k, staff[k] ?? null]))} writable={state.capabilities.writeStaff} save={v => officeContacts.saveStaff(staff.id, v)} invalidate={invalidate} />}
      </section>}
      {state.subjects && <PermissionPanel subjects={state.subjects} more={() => more('subjects')} invalidate={invalidate} />}
    </>}
  </main>;
}
