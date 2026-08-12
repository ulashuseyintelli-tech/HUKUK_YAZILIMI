import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within, act } from '@testing-library/react';
import OfficeSettingsPage from '../page';
import { api } from '@/lib/api';

/**
 * PR-2A1 — SETTINGS/OFFICE ALTI SIGNATURE DAVRANIS MATRISI
 * stable keys:
 *   app/(dashboard)/settings/office/page.tsx#handleDeleteLawyer
 *   app/(dashboard)/settings/office/page.tsx#handleDeleteBankAccount
 *   app/(dashboard)/settings/office/page.tsx#handleDeleteStaff
 *   app/(dashboard)/settings/office/page.tsx#handleSaveBankAccount
 *   app/(dashboard)/settings/office/page.tsx#OfficeSettingsInner:defaultLawyer
 *   app/(dashboard)/settings/office/page.tsx#OfficeSettingsInner:defaultStaff
 *
 * Sozlesme notu (owner, 2026-08-12): `isDefaultForNewCases` COKLU-SECIM bayragidir
 * (DEFAULT_FLAG_IS_MULTI_VALUED) — farkli kayitlarin bayraklari birbirini BLOKLAMAZ;
 * kilit kaynak bazlidir.
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

const OFFICE = {
  name: 'TELLI HUKUK',
  lawyers: [
    { id: 'l1', name: 'ULAS', surname: 'TELLI', isDefaultForNewCases: false, sortOrder: 0 },
    { id: 'l2', name: 'FATMA', surname: 'ULUCA', isDefaultForNewCases: true, sortOrder: 1 },
  ],
  bankAccounts: [
    { id: 'b1', bankName: 'Ziraat', iban: 'TR33***41326', accountName: 'Ana', isDefault: true },
  ],
};
const STAFF = [
  { id: 's1', firstName: 'Aysu', lastName: 'Aktay', staffType: 'STAJYER_AVUKAT', isDefaultForNewCases: false },
];

/** Her GET URL'i ACIKCA kurulur; genel fallback mock YOK. */
function primeReads(over: Record<string, unknown> = {}) {
  mocked.get.mockImplementation((url: string) => {
    const map: Record<string, unknown> = {
      '/office': { data: OFFICE },
      '/office/smtp-settings': { data: {} },
      '/office/sms-settings': { data: {} },
      '/office/greeting-settings': { data: {} },
      '/office/escalation-settings': { data: {} },
      '/staff': { data: { data: STAFF } },
      ...over,
    };
    const hit = map[url];
    if (hit instanceof Error) return Promise.reject(hit);
    return Promise.resolve(hit ?? { data: {} });
  });
}

/** Aktif drawer koku — dashboard kartlari DOM'da kaldigi icin sorgular drawer'a daraltilir. */
function drawer(): HTMLElement {
  return screen.getByRole('dialog');
}

async function renderSection(section: 'lawyers' | 'bank' | 'staff', markerName: string) {
  search = new URLSearchParams(`section=${section}`);
  render(<OfficeSettingsPage />);
  await waitFor(() => expect(within(drawer()).getByRole('button', { name: markerName })).toBeTruthy());
  return within(drawer());
}

const netFail = () => new TypeError('Failed to fetch');

let consoleErrors: unknown[][] = [];
let unhandled: unknown[] = [];
const onUnhandled = (e: PromiseRejectionEvent) => {
  unhandled.push(e.reason);
  e.preventDefault();
};

beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  primeReads();
  search = new URLSearchParams('');
  consoleErrors = [];
  unhandled = [];
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    consoleErrors.push(args);
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  window.addEventListener('unhandledrejection', onUnhandled);
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 0));
  const errs = consoleErrors;
  const unh = unhandled;
  // ONCE temizlik: guard atarsa bile sonraki test temiz DOM/mock ile baslar.
  window.removeEventListener('unhandledrejection', onUnhandled);
  cleanup();
  vi.restoreAllMocks();
  // console.error, unhandled rejection ve act warning PASS SAYILMAZ.
  expect(unh).toHaveLength(0);
  expect(errs).toHaveLength(0);
});

const DEL_LAWYER = 'ULAS TELLI avukatını pasifleştir';
const DEF_LAWYER = 'ULAS TELLI varsayılan ayarını değiştir';
const DEF_LAWYER2 = 'FATMA ULUCA varsayılan ayarını değiştir';
const DEL_BANK = 'Ziraat banka hesabını sil';
const DEL_STAFF = 'Aysu Aktay personelini sil';
const DEF_STAFF = 'Aysu Aktay varsayılan ayarını değiştir';

describe('handleDeleteLawyer', () => {
  it('success → DELETE /lawyers/:id + reload; hata yok', async () => {
    mocked.delete.mockResolvedValueOnce({ data: {} });
    const d = await renderSection('lawyers', DEL_LAWYER);
    const before = mocked.get.mock.calls.length;
    fireEvent.click(d.getByRole('button', { name: DEL_LAWYER }));
    await waitFor(() => expect(mocked.delete).toHaveBeenCalledWith('/lawyers/l1'));
    await waitFor(() => expect(mocked.get.mock.calls.length).toBeGreaterThan(before));
  });

  it('cancel MUTATION BASLATMAZ', async () => {
    (window.confirm as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const d = await renderSection('lawyers', DEL_LAWYER);
    fireEvent.click(d.getByRole('button', { name: DEL_LAWYER }));
    expect(mocked.delete).not.toHaveBeenCalled();
  });

  it('backend hata (403/validation) GORUNUR; satir KORUNUR', async () => {
    mocked.delete.mockRejectedValueOnce({ body: { message: 'Bu avukat aktif dosyada sorumlu.' } });
    const d = await renderSection('lawyers', DEL_LAWYER);
    fireEvent.click(d.getByRole('button', { name: DEL_LAWYER }));
    await screen.findByText(/Bu avukat aktif dosyada sorumlu/i);
    expect(d.getByRole('button', { name: DEL_LAWYER })).toBeTruthy();
  });

  it('AYNI satira ayni-tick cift tik → TEK mutation; hata sonrasi retry → 1 yeni', async () => {
    let release!: (v: unknown) => void;
    mocked.delete.mockImplementationOnce(() => new Promise((_, rej) => { release = rej; }));
    const d = await renderSection('lawyers', DEL_LAWYER);
    const btn = d.getByRole('button', { name: DEL_LAWYER });
    act(() => {
      btn.click();
      btn.click();
    });
    await Promise.resolve();
    expect(mocked.delete).toHaveBeenCalledTimes(1);

    release({ body: { message: 'Reddedildi.' } });
    await screen.findByText(/Reddedildi/i);
    mocked.delete.mockResolvedValueOnce({ data: {} });
    fireEvent.click(btn);
    await waitFor(() => expect(mocked.delete).toHaveBeenCalledTimes(2));
  });

  it('mutation OK + reload FAIL → SUCCESS_STALE; ayni satir kilitli, digeri ACIK', async () => {
    mocked.delete.mockResolvedValueOnce({ data: {} });
    const d = await renderSection('lawyers', DEL_LAWYER);
    primeReads({ '/office': netFail() });
    fireEvent.click(d.getByRole('button', { name: DEL_LAWYER }));

    await screen.findByText(/PASİFLEŞTİRİLDİ, ancak liste yenilenemedi/i);
    expect((d.getByRole('button', { name: DEL_LAWYER }) as HTMLButtonElement).disabled).toBe(true);
    expect((d.getByRole('button', { name: DEF_LAWYER2 }) as HTMLButtonElement).disabled).toBe(false);

    // refresh-only: mutation CAGRILMAZ; basarisizsa band KORUNUR
    fireEvent.click(d.getByRole('button', { name: 'Avukat listesini yenile' }));
    await waitFor(() => expect(mocked.get.mock.calls.length).toBeGreaterThan(2));
    expect(mocked.delete).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/ancak liste yenilenemedi/i)).toBeTruthy();

    // basarili refresh band + kilidi temizler
    primeReads();
    fireEvent.click(d.getByRole('button', { name: 'Avukat listesini yenile' }));
    await waitFor(() => expect(screen.queryByText(/ancak liste yenilenemedi/i)).toBeNull());
    expect((d.getByRole('button', { name: DEL_LAWYER }) as HTMLButtonElement).disabled).toBe(false);
    expect(mocked.delete).toHaveBeenCalledTimes(1);
  });
});

describe('handleDeleteBankAccount + handleDeleteStaff', () => {
  it('bank delete failure → satir KORUNUR, hata GORUNUR', async () => {
    mocked.delete.mockRejectedValueOnce(netFail());
    const d = await renderSection('bank', DEL_BANK);
    fireEvent.click(d.getByRole('button', { name: DEL_BANK }));
    await screen.findByText(/Sunucuya ulaşılamadı/i);
    expect(d.getByRole('button', { name: DEL_BANK })).toBeTruthy();
  });

  it('bank delete success → DELETE /office/bank-accounts/:id', async () => {
    mocked.delete.mockResolvedValueOnce({ data: {} });
    const d = await renderSection('bank', DEL_BANK);
    fireEvent.click(d.getByRole('button', { name: DEL_BANK }));
    await waitFor(() => expect(mocked.delete).toHaveBeenCalledWith('/office/bank-accounts/b1'));
  });

  it('staff delete failure → satir KORUNUR; success → DELETE /staff/:id + reload', async () => {
    mocked.delete.mockRejectedValueOnce({ body: { message: 'Personel silinemez.' } });
    const d = await renderSection('staff', DEL_STAFF);
    fireEvent.click(d.getByRole('button', { name: DEL_STAFF }));
    await screen.findByText(/Personel silinemez/i);
    expect(d.getByRole('button', { name: DEL_STAFF })).toBeTruthy();

    mocked.delete.mockResolvedValueOnce({ data: {} });
    fireEvent.click(d.getByRole('button', { name: DEL_STAFF }));
    await waitFor(() => expect(mocked.delete).toHaveBeenCalledWith('/staff/s1'));
  });
});

describe('handleSaveBankAccount', () => {
  /** Modal formunu Kaydet dugmesi uzerinden bulur; zorunlu alanlari doldurur. */
  async function openCreateModal(fill = true) {
    const d = await renderSection('bank', DEL_BANK);
    fireEvent.click(d.getByRole('button', { name: '+Ekle' }));
    const kaydet = await screen.findByRole('button', { name: 'Kaydet' });
    const form = kaydet.closest('form') as HTMLFormElement;
    expect(form).toBeTruthy();
    const inputs = form.querySelectorAll('input');
    if (fill) {
      // [0]=Banka* [1]=Sube [2]=IBAN* [3]=Hesap Sahibi [4]=checkbox
      fireEvent.change(inputs[0], { target: { value: 'VakifBank' } });
      fireEvent.change(inputs[2], { target: { value: 'tr330006100519786457841326' } });
    }
    return { d, form, kaydet, inputs };
  }

  it('create → POST /office/bank-accounts; IBAN NORMALIZE edilerek gider', async () => {
    mocked.post.mockResolvedValueOnce({ data: {} });
    const { kaydet } = await openCreateModal();
    fireEvent.click(kaydet);

    await waitFor(() => expect(mocked.post).toHaveBeenCalledTimes(1));
    const [url, payload] = mocked.post.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/office/bank-accounts');
    expect(payload.iban).toBe('TR330006100519786457841326');
    expect(payload.bankName).toBe('VakifBank');
  });

  it('failure → modal ACIK, hata MODAL ICINDE, form KORUNUR, "Kaydedildi" YOK', async () => {
    mocked.post.mockRejectedValueOnce({ body: { message: 'IBAN geçersiz.' } });
    const { kaydet, inputs } = await openCreateModal();
    fireEvent.click(kaydet);

    // Hata hem drawer bandinda hem MODAL ICINDE gorunur (iki yuzey de kasitli).
    const errs = await screen.findAllByText(/IBAN geçersiz/i);
    expect(errs.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeTruthy(); // modal acik
    expect((inputs[0] as HTMLInputElement).value).toBe('VakifBank'); // form korunur
    expect(screen.queryByText(/Kaydedildi/i)).toBeNull();
  });

  it('ayni-tick cift submit → TEK POST', async () => {
    let release!: (v: unknown) => void;
    mocked.post.mockImplementation(() => new Promise((res) => { release = res; }));
    const { kaydet } = await openCreateModal();
    act(() => {
      kaydet.click();
      kaydet.click();
    });
    await Promise.resolve();
    expect(mocked.post).toHaveBeenCalledTimes(1);
    await act(async () => {
      release({ data: {} });
    });
  });

  it('mutation OK + reload FAIL → modal KAPANIR, SUCCESS_STALE + refresh-only', async () => {
    mocked.post.mockResolvedValueOnce({ data: {} });
    const { d, kaydet } = await openCreateModal();
    primeReads({ '/office': netFail() });
    fireEvent.click(kaydet);

    await screen.findByText(/KAYDEDİLDİ, ancak liste yenilenemedi/i);
    // modal kapandi → ayni payload yeniden gonderilemez
    expect(screen.queryByRole('button', { name: 'Kaydet' })).toBeNull();
    expect(mocked.post).toHaveBeenCalledTimes(1);
    expect(d.getByRole('button', { name: 'Banka hesap listesini yenile' })).toBeTruthy();
  });

  it('update → PUT /office/bank-accounts/:id; MASKELI IBAN payload’dan CIKARILIR (omit regresyonu)', async () => {
    mocked.put.mockResolvedValueOnce({ data: {} });
    await renderSection('bank', DEL_BANK);
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Düzenle' }));
    const kaydet = await screen.findByRole('button', { name: 'Kaydet' });
    // Prefill maskeli IBAN ('TR33***41326') ile gelir; kullanici dokunmaz.
    fireEvent.click(kaydet);
    await waitFor(() => expect(mocked.put).toHaveBeenCalledTimes(1));
    const [url, payload] = mocked.put.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/office/bank-accounts/b1');
    expect('iban' in payload).toBe(false); // maskeli deger gercek IBAN'i EZEMEZ
    expect(payload.bankName).toBe('Ziraat');
  });
});

describe('default lawyer/staff — DEFAULT_FLAG_IS_MULTI_VALUED', () => {
  it('failure eski secimi DEGISTIRMEZ (optimistic kalici state yok)', async () => {
    mocked.put.mockRejectedValueOnce({ body: { message: 'Yetkiniz yok.' } });
    const d = await renderSection('lawyers', DEF_LAWYER);
    fireEvent.click(d.getByRole('button', { name: DEF_LAWYER }));
    await screen.findByText(/Yetkiniz yok/i);
    // l1 hala varsayilan DEGIL (☆ Seç)
    expect(d.getByRole('button', { name: DEF_LAWYER }).textContent).toContain('Seç');
  });

  it('payload canonical satirdan uretilir: PUT dogru degerle gider', async () => {
    mocked.put.mockResolvedValueOnce({ data: {} });
    const d = await renderSection('lawyers', DEF_LAWYER);
    fireEvent.click(d.getByRole('button', { name: DEF_LAWYER }));
    await waitFor(() =>
      expect(mocked.put).toHaveBeenCalledWith('/lawyers/l1', { isDefaultForNewCases: true }),
    );
  });

  it('AYNI kayda ayni-tick cift tik → TEK mutation; FARKLI kayitlar BLOKLANMAZ', async () => {
    const releases: Array<(v: unknown) => void> = [];
    mocked.put.mockImplementation(() => new Promise((res) => { releases.push(res); }));
    const d = await renderSection('lawyers', DEF_LAWYER);

    const b1 = d.getByRole('button', { name: DEF_LAWYER });
    const b2 = d.getByRole('button', { name: DEF_LAWYER2 });
    act(() => {
      b1.click();
      b1.click(); // ayni kaynak → bloklanir
      b2.click(); // farkli kaynak → MESRU coklu-varsayilan, bloklanmaz
    });
    await Promise.resolve();

    expect(mocked.put).toHaveBeenCalledTimes(2);
    // Pending mutation'lar ACT icinde cozulur; aksi halde devam eden setState'ler
    // act-uyarisi uretir ve guard testi dusurur.
    await act(async () => {
      releases.forEach((r) => r({ data: {} }));
    });
  });

  it('staff toggle: pending iken OPTIMISTIC yazilmaz; failure eski degeri korur', async () => {
    let reject!: (e: unknown) => void;
    mocked.put.mockImplementationOnce(() => new Promise((_, rej) => { reject = rej; }));
    const d = await renderSection('staff', DEF_STAFF);
    const btn = d.getByRole('button', { name: DEF_STAFF });
    expect(btn.textContent).toContain('Seç');

    fireEvent.click(btn);
    await Promise.resolve();
    // Sunucu yanit vermeden gorunur secim DEGISMEZ.
    expect(d.getByRole('button', { name: DEF_STAFF }).textContent).toContain('Seç');

    reject({ body: { message: 'Reddedildi.' } });
    await screen.findByText(/Reddedildi/i);
    expect(d.getByRole('button', { name: DEF_STAFF }).textContent).toContain('Seç');
  });

  it('mutation OK + reload FAIL → toggle kilitli, yalniz refresh-only', async () => {
    mocked.put.mockResolvedValueOnce({ data: {} });
    const d = await renderSection('staff', DEF_STAFF);
    primeReads({ '/staff': netFail() });
    fireEvent.click(d.getByRole('button', { name: DEF_STAFF }));

    await screen.findByText(/GÜNCELLENDİ, ancak liste yenilenemedi/i);
    expect((d.getByRole('button', { name: DEF_STAFF }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocked.put).toHaveBeenCalledTimes(1);

    primeReads();
    fireEvent.click(d.getByRole('button', { name: 'Personel listesini yenile' }));
    await waitFor(() => expect(screen.queryByText(/ancak liste yenilenemedi/i)).toBeNull());
    expect((d.getByRole('button', { name: DEF_STAFF }) as HTMLButtonElement).disabled).toBe(false);
    expect(mocked.put).toHaveBeenCalledTimes(1);
  });
});

describe('OfficeSettingsInner:lawyerOrder — surukle-birak siralama', () => {
  /** l2'yi l1 satirinin uzerine birakir → beklenen yeni sira ['l2','l1']. */
  const dt = { getData: (k: string) => (k === 'lawyerId' ? 'l2' : '1') };

  function rowOf(d: ReturnType<typeof within>, name: string): HTMLElement {
    const row = d.getByRole('button', { name }).closest('[draggable]');
    if (!row) throw new Error('surunebilir satir bulunamadi');
    return row as HTMLElement;
  }

  it('basarili siralama → PUT /lawyers/order/update KESIN payload + canonical reload', async () => {
    mocked.put.mockResolvedValueOnce({ data: {} });
    const d = await renderSection('lawyers', DEL_LAWYER);
    const before = mocked.get.mock.calls.length;

    fireEvent.drop(rowOf(d, DEL_LAWYER), { dataTransfer: dt });

    await waitFor(() =>
      expect(mocked.put).toHaveBeenCalledWith('/lawyers/order/update', { lawyerIds: ['l2', 'l1'] }),
    );
    // Yerel DnD sirasi tek basina basari KANITI DEGIL; canonical reload sart.
    await waitFor(() => expect(mocked.get.mock.calls.length).toBeGreaterThan(before));
  });

  it('failure (403/validation) → gorunur hata + canonical reload; STALE metni GOSTERILMEZ', async () => {
    mocked.put.mockRejectedValueOnce({ body: { message: 'Yetkiniz yok.' } });
    const d = await renderSection('lawyers', DEL_LAWYER);
    const before = mocked.get.mock.calls.length;

    fireEvent.drop(rowOf(d, DEL_LAWYER), { dataTransfer: dt });

    await screen.findByText(/Yetkiniz yok/i);
    // "kaydedilmedi" ile "kaydedildi fakat dogrulanamadi" TERS gosterilmez.
    expect(screen.queryByText(/KAYDEDİLDİ, ancak liste yenilenemedi/i)).toBeNull();
    // Sunucunun eski sirasi geri okunur (canonical reload calisti).
    await waitFor(() => expect(mocked.get.mock.calls.length).toBeGreaterThan(before));
  });

  it('failure + reload da FAIL → gercek hata + load error; stale/reconciliation AYRI kalir', async () => {
    mocked.put.mockRejectedValueOnce(netFail());
    const d = await renderSection('lawyers', DEL_LAWYER);
    primeReads({ '/office': netFail() });

    fireEvent.drop(rowOf(d, DEL_LAWYER), { dataTransfer: dt });

    await screen.findAllByText(/Sunucuya ulaşılamadı/i);
    expect(screen.queryByText(/KAYDEDİLDİ, ancak/i)).toBeNull();
  });

  it('AYNI-TICK iki birakma → office:lawyer-order kilidi TEK mutation', async () => {
    let release!: (v: unknown) => void;
    mocked.put.mockImplementation(() => new Promise((res) => { release = res; }));
    const d = await renderSection('lawyers', DEL_LAWYER);
    const row = rowOf(d, DEL_LAWYER);

    act(() => {
      fireEvent.drop(row, { dataTransfer: dt });
      fireEvent.drop(row, { dataTransfer: dt });
    });
    await Promise.resolve();

    expect(mocked.put).toHaveBeenCalledTimes(1);
    await act(async () => {
      release({ data: {} });
    });
  });

  it('failure sonrasi retry → kilit serbest, TAM 1 yeni mutation', async () => {
    mocked.put
      .mockRejectedValueOnce({ body: { message: 'Sıra reddedildi.' } })
      .mockResolvedValueOnce({ data: {} });
    const d = await renderSection('lawyers', DEL_LAWYER);
    const row = rowOf(d, DEL_LAWYER);

    fireEvent.drop(row, { dataTransfer: dt });
    await screen.findByText(/Sıra reddedildi/i);
    expect(mocked.put).toHaveBeenCalledTimes(1);

    fireEvent.drop(row, { dataTransfer: dt });
    await waitFor(() => expect(mocked.put).toHaveBeenCalledTimes(2));
  });
});

describe('kaynak disiplini', () => {
  it('malformed /office yaniti bos liste gibi GOSTERILMEZ → gorunur load error', async () => {
    primeReads({ '/office': netFail() });
    search = new URLSearchParams('section=lawyers');
    render(<OfficeSettingsPage />);
    await screen.findByText(/Sunucuya ulaşılamadı/i);
  });

  it('alti handler icin bos catch / sessiz suppression YOK', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'page.tsx'), 'utf8');
    for (const fn of ['handleDeleteLawyer', 'handleDeleteBankAccount', 'handleDeleteStaff', 'handleSaveBankAccount', 'handleSetDefaultLawyer', 'handleSetDefaultStaff']) {
      const i = src.indexOf(`const ${fn} = async`);
      expect(i, fn).toBeGreaterThan(-1);
      const seg = src.slice(i, i + 2200);
      expect(seg, fn).not.toMatch(/catch\s*\([^)]*\)\s*\{\s*\}/);
      expect(seg, fn).not.toMatch(/console\.error\([^)]*\)\s*;?\s*\}/);
    }
  });
});
