import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within, act } from '@testing-library/react';
import OfficeSettingsPage from '../page';
import { api } from '@/lib/api';
import {
  buildBankAccountCreatePayload,
  buildBankAccountUpdatePayload,
  isRealIbanInput,
} from '@/lib/bank-account-payload';

/**
 * OFFICE-BANK-ACCOUNT (owner kararı 2026-10-03, madde 6) — Büro Ayarları → Banka Hesapları ekranı.
 * stable key: app/(dashboard)/settings/office/page.tsx#handleSaveBankAccount
 *
 * SUNUCU ŞEKLİ (okuma yüzeyi B): hesap = { officeId, id, isDefault, iban(MASKELİ) }. Banka adı / şube / hesap sahibi YOK.
 * Sözleşme:
 *  - Düzenle MEVCUT hesabı günceller (PUT /office/bank-accounts/:id), yeni hesap OLUŞTURMAZ (POST yok).
 *  - Yalnız DEĞİŞEN alan gider; boş bırakılan bilinmeyen alan (şube, hesap sahibi) GÖNDERİLMEZ (kayıtlı değer silinmez).
 *  - Maskeli IBAN gerçek IBAN diye GÖNDERİLMEZ; tam IBAN girilirse gider.
 *  - Silme doğru kimliği kullanır; satır başlığı banka adı yoksa maskeli IBAN'dır ("undefined" yok).
 *  - Değişiklik yoksa istek ÇIKMAZ. Kimliksiz satırda kaydet ÇIKMAZ (oluşturma dalına düşmez).
 * Kanıt sınıfı: TEST (jsdom + sahte api). Gerçek tarayıcı/API kanıtı DEĞİLDİR.
 */

let search = new URLSearchParams('');
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/settings/office',
  useSearchParams: () => search,
}));
vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const MASKED_1 = 'TR33****1326';
const MASKED_2 = 'TR00****0002';
const SERVER_OFFICE = (accounts: unknown[]) => ({ name: 'TELLI HUKUK', lawyers: [], bankAccounts: accounts });
const SERVER_ACCOUNTS = [
  { officeId: 'o1', id: 'b1', isDefault: true, iban: MASKED_1 },
  { officeId: 'o1', id: 'b2', isDefault: false, iban: MASKED_2 },
];

function prime(accounts: unknown[] = SERVER_ACCOUNTS) {
  mocked.get.mockImplementation((url: string) => {
    const map: Record<string, unknown> = {
      '/office': SERVER_OFFICE(accounts),
      '/office/smtp-settings': {},
      '/office/sms-settings': {},
      '/office/greeting-settings': {},
      '/office/escalation-settings': {},
      '/staff': { data: [] },
    };
    return Promise.resolve({ data: url in map ? map[url] : {} });
  });
  mocked.put.mockResolvedValue({ data: {} });
  mocked.post.mockResolvedValue({ data: {} });
  mocked.delete.mockResolvedValue({ data: {} });
}

async function openBank() {
  search = new URLSearchParams('section=bank');
  render(<OfficeSettingsPage />);
  await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  return within(screen.getByRole('dialog'));
}
async function openEdit(d: ReturnType<typeof within>, index = 0) {
  fireEvent.click(d.getAllByRole('button', { name: 'Düzenle' })[index]);
  const kaydet = await screen.findByRole('button', { name: 'Kaydet' });
  const form = kaydet.closest('form') as HTMLFormElement;
  const inputs = Array.from(form.querySelectorAll('input')) as HTMLInputElement[];
  // [0]=Banka [1]=Şube [2]=IBAN [3]=Hesap Sahibi [4]=checkbox (Varsayılan)
  return { kaydet, form, inputs };
}

beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  prime();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('banka hesapları ekranı — sunucu şekli (kimlik + varsayılan + maskeli IBAN)', () => {
  it('liste: maskeli IBAN görünür, varsayılan işareti isDefault\'a bağlı, "undefined" yok; silme etiketi maskeli IBAN taşır', async () => {
    const d = await openBank();
    expect(d.getByText(MASKED_1)).toBeTruthy();
    expect(d.getByText(MASKED_2)).toBeTruthy();
    expect(document.body.textContent).not.toContain('undefined');
    expect(d.getByRole('button', { name: `${MASKED_1} banka hesabını sil` })).toBeTruthy();
    // yıldız yalnız varsayılan hesapta: iki satırdan YALNIZ biri yıldızlı
    const rows = Array.from(document.querySelectorAll('.divide-y.divide-blue-100 > div'));
    expect(rows.map((r) => !!r.querySelector('svg.fill-amber-500'))).toEqual([true, false]);
  });

  it('özet kartı: yıldız yalnız varsayılan hesap varken; maskeli IBAN; "Banka hesabı" başlığı', async () => {
    prime([{ officeId: 'o1', id: 'b2', isDefault: false, iban: MASKED_2 }]);
    search = new URLSearchParams('');
    render(<OfficeSettingsPage />);
    await waitFor(() => expect(screen.getByText(`IBAN ${MASKED_2}`)).toBeTruthy());
    const kart = screen.getByText(`IBAN ${MASKED_2}`).closest('button') as HTMLElement;
    expect(kart.querySelector('svg.fill-amber-500')).toBeNull(); // varsayılan hesap yok → yıldız yok
    expect(kart.textContent).toContain('Banka hesabı');
  });

  it('SİL doğru kimliği kullanır: DELETE /office/bank-accounts/b2 (undefined değil)', async () => {
    const d = await openBank();
    fireEvent.click(d.getByRole('button', { name: `${MASKED_2} banka hesabını sil` }));
    await waitFor(() => expect(mocked.delete).toHaveBeenCalledWith('/office/bank-accounts/b2'));
    expect(mocked.delete.mock.calls.every((c) => !String(c[0]).includes('undefined'))).toBe(true);
  });
});

describe('Düzenle MEVCUT hesabı günceller (PUT), yeni hesap oluşturmaz (POST yok)', () => {
  it('düzenleme penceresi: IBAN maskeli, Banka / Şube / Hesap Sahibi boş (yer tutucu), zorunlu alan YOK, açıklama var', async () => {
    const d = await openBank();
    const { inputs } = await openEdit(d);
    expect(inputs[2].value).toBe(MASKED_1);
    expect([inputs[0].value, inputs[1].value, inputs[3].value]).toEqual(['', '', '']);
    expect(inputs[0].required).toBe(false);
    expect(inputs[2].required).toBe(false);
    expect(inputs[0].placeholder).toBe('Değiştirmek için yazın');
    expect(screen.getByTestId('bank-edit-hint')).toBeTruthy();
    expect(inputs[4].checked).toBe(true); // b1 varsayılan
  });

  it('dokunmadan Kaydet → HİÇBİR istek yok (ne POST ne PUT), pencere kapanır', async () => {
    const d = await openBank();
    const { kaydet } = await openEdit(d);
    fireEvent.click(kaydet);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Kaydet' })).toBeNull());
    expect(mocked.post).not.toHaveBeenCalled();
    expect(mocked.put).not.toHaveBeenCalled();
  });

  it('YALNIZ varsayılan işareti değişti → PUT /office/bank-accounts/b2 { isDefault:true }; şube / hesap sahibi / IBAN GÖNDERİLMEZ (veri kaybı tuzağı)', async () => {
    const d = await openBank();
    const { kaydet, inputs } = await openEdit(d, 1); // b2
    fireEvent.click(inputs[4]);
    fireEvent.click(kaydet);
    await waitFor(() => expect(mocked.put).toHaveBeenCalledTimes(1));
    const [url, body] = mocked.put.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/office/bank-accounts/b2');
    expect(body).toEqual({ isDefault: true });
    expect(mocked.post).not.toHaveBeenCalled();
  });

  it('yalnız banka adı yazıldı → { bankName }; boş şube / hesap sahibi "" olarak GİTMEZ', async () => {
    const d = await openBank();
    const { kaydet, inputs } = await openEdit(d);
    fireEvent.change(inputs[0], { target: { value: 'Yeni Banka' } });
    fireEvent.click(kaydet);
    await waitFor(() => expect(mocked.put).toHaveBeenCalledTimes(1));
    expect(mocked.put.mock.calls[0][1]).toEqual({ bankName: 'Yeni Banka' });
  });

  it('tam IBAN yazıldı → normalize edilip { iban } gider; maskeli prefill ASLA gitmez', async () => {
    const d = await openBank();
    const { kaydet, inputs } = await openEdit(d);
    fireEvent.change(inputs[2], { target: { value: 'tr33 0006 1005 1978 6457 8413 26' } });
    fireEvent.click(kaydet);
    await waitFor(() => expect(mocked.put).toHaveBeenCalledTimes(1));
    expect(mocked.put.mock.calls[0][1]).toEqual({ iban: 'TR330006100519786457841326' });
  });

  it('IBAN alanı kısmen maskeli bırakıldı / maskeli değer yazıldı → IBAN gitmez, başka değişiklik yoksa istek çıkmaz', async () => {
    const d = await openBank();
    const { kaydet, inputs } = await openEdit(d);
    fireEvent.change(inputs[2], { target: { value: 'TR33••••••1326' } });
    fireEvent.click(kaydet);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Kaydet' })).toBeNull());
    expect(mocked.put).not.toHaveBeenCalled();
    expect(mocked.post).not.toHaveBeenCalled();
  });

  it('KİMLİKSİZ satırda Kaydet → istek ÇIKMAZ (oluşturma dalına düşmez), hata görünür', async () => {
    prime([{ officeId: 'o1', isDefault: false, iban: MASKED_1 }]); // eski kusurun şekli: id yok
    const d = await openBank();
    const { kaydet, inputs } = await openEdit(d);
    fireEvent.change(inputs[0], { target: { value: 'X' } });
    fireEvent.click(kaydet);
    await screen.findAllByText(/Hesap kimliği okunamadı/);
    expect(mocked.post).not.toHaveBeenCalled();
    expect(mocked.put).not.toHaveBeenCalled();
  });

  it('sunucu reddederse (400) pencere AÇIK kalır, hata görünür, form korunur', async () => {
    mocked.put.mockRejectedValueOnce({ body: { message: 'IBAN için geçerli tam değer girin.' } });
    const d = await openBank();
    const { kaydet, inputs } = await openEdit(d);
    fireEvent.change(inputs[0], { target: { value: 'Yeni' } });
    fireEvent.click(kaydet);
    expect((await screen.findAllByText(/IBAN için geçerli tam değer/)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeTruthy();
    expect(inputs[0].value).toBe('Yeni');
  });
});

describe('Yeni hesap davranışı DEĞİŞMEDİ', () => {
  it('create → POST /office/bank-accounts; beş alan, IBAN normalize; zorunlu alanlar işaretli; ilk hesap otomatik varsayılan DEĞİL', async () => {
    prime([]); // boş büro
    const d = await openBank();
    fireEvent.click(d.getByRole('button', { name: '+Ekle' }));
    const kaydet = await screen.findByRole('button', { name: 'Kaydet' });
    const inputs = Array.from((kaydet.closest('form') as HTMLFormElement).querySelectorAll('input')) as HTMLInputElement[];
    expect(inputs[0].required).toBe(true);
    expect(inputs[2].required).toBe(true);
    expect(inputs[4].checked).toBe(false); // yeni politika yok: kutu işaretsiz açılır
    fireEvent.change(inputs[0], { target: { value: 'VakifBank' } });
    fireEvent.change(inputs[2], { target: { value: 'tr330006100519786457841326' } });
    fireEvent.click(kaydet);
    await waitFor(() => expect(mocked.post).toHaveBeenCalledTimes(1));
    expect(mocked.post.mock.calls[0]).toEqual([
      '/office/bank-accounts',
      { bankName: 'VakifBank', branchName: '', accountName: '', isDefault: false, iban: 'TR330006100519786457841326' },
    ]);
    expect(mocked.put).not.toHaveBeenCalled();
  });
});

describe('bank-account-payload yardımcıları (saf)', () => {
  const form = { bankName: '', branchName: '', iban: MASKED_1, accountName: '', isDefault: true };

  it('isRealIbanInput: boş / boşluk / maskeli (*, •, ·, …) / metin değil → false; tam IBAN → true', () => {
    for (const bad of ['', '   ', MASKED_1, 'TR33••1326', 'TR33··1326', 'TR33…1326', null, undefined, 5]) expect(isRealIbanInput(bad)).toBe(false);
    expect(isRealIbanInput('TR330006100519786457841326')).toBe(true);
  });

  it('update: bilinmeyen alan + boş girdi → gönderilmez; bilinen alan aynı değer → gönderilmez; farklıysa gönderilir; banka adı boşaltılamaz', () => {
    expect(buildBankAccountUpdatePayload({ isDefault: true, iban: MASKED_1 }, form)).toEqual({});
    expect(buildBankAccountUpdatePayload({ bankName: 'Z', branchName: 'M', accountName: 'S', iban: MASKED_1, isDefault: true },
      { ...form, bankName: 'Z', branchName: 'M', accountName: 'S' })).toEqual({});
    expect(buildBankAccountUpdatePayload({ bankName: 'Z', branchName: 'M', accountName: 'S', iban: MASKED_1, isDefault: true },
      { ...form, bankName: 'Z2', branchName: '', accountName: 'S' })).toEqual({ bankName: 'Z2', branchName: '' });
    expect(buildBankAccountUpdatePayload({ bankName: 'Z', iban: MASKED_1, isDefault: true }, { ...form, bankName: '' })).toEqual({});
  });

  it('update: yalnız gerçek ve kayıtlıdan farklı IBAN gider; isDefault yalnız değişince', () => {
    expect(buildBankAccountUpdatePayload({ iban: MASKED_1, isDefault: false }, { ...form, iban: 'tr33 0006 1005 1978 6457 8413 26', isDefault: false }))
      .toEqual({ iban: 'TR330006100519786457841326' });
    expect(buildBankAccountUpdatePayload({ iban: 'TR330006100519786457841326', isDefault: false }, { ...form, iban: 'TR330006100519786457841326', isDefault: false }))
      .toEqual({});
    expect(buildBankAccountUpdatePayload({ iban: MASKED_1, isDefault: false }, { ...form, isDefault: true })).toEqual({ isDefault: true });
  });

  it('create: boş / maskeli IBAN çıkarılır, doluysa normalize edilir; diğer dört alan aynen', () => {
    expect(buildBankAccountCreatePayload({ ...form, bankName: 'B', iban: '  ' })).toEqual({ bankName: 'B', branchName: '', accountName: '', isDefault: true });
    expect(buildBankAccountCreatePayload({ ...form, bankName: 'B', iban: MASKED_1 })).toEqual({ bankName: 'B', branchName: '', accountName: '', isDefault: true });
    expect(buildBankAccountCreatePayload({ ...form, bankName: 'B', iban: 'tr33 0006' })).toMatchObject({ iban: 'TR330006' });
  });
});
