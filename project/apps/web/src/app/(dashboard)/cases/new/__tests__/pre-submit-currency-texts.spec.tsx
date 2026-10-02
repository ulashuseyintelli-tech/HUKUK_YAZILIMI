import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import NewCasePage from '../page';
import { api } from '@/lib/api';

/**
 * Sihirbaz son adım — gönderim ÖNCESİ metinler sistemin yapmadığı şeyi vaat etmez (owner seçimi 2026-10-01: nötr metin).
 *
 * Ölçülen kusur (main ef16f07f, sayfa testi + gerçek tarayıcı): dövizli dosyada, istek gitmeden önce "Döviz cinsi: USD - Kur
 * hesaplaması otomatik yapılacak" bilgisi ve "Takip oluşturulacak ve açılış masrafları hesaplanacak… / Oluştur ve Masraf Maili
 * Gönder" penceresi gösteriliyordu; sunucu ise kur çevirmesi yapmıyor, otomatik açılış masraf talebini oluşturmuyor ve e-postayı
 * göndermiyordu (kullanıcı bunu yalnız açılıştan sonraki mesajdan öğreniyordu).
 *
 * Taslakta TL dışı para birimi varken (dosya, listelenen kalem ya da taranan evrak) pencere sonucu sunucunun belirleyeceğini
 * söyler. Sihirbaz hangi dosyada talep oluşmayacağına kendisi karar vermez; akış ve gönderilen istek değişmez. TL taslakta
 * metinler ve akış AYNEN kalır.
 *
 * Gerçek sayfa render edilir; yalnız ağ, Next yönlendirme ve borçlu adımının tarama bileşeni mock'tur.
 */

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: {
    getLawyers: vi.fn(),
    searchDebtors: vi.fn(),
    getNextFileNumber: vi.fn(),
    createCase: vi.fn(),
    previewCekFormation: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/cases/new',
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('@/lib/api/interest-engine', () => ({
  interestEngineApi: {
    preview: vi.fn(async () => ({
      success: true,
      data: { estimatedInterest: 0, currentRate: 0, days: 0, interestType: 'LEGAL_3095' },
      cached: false,
    })),
  },
  InterestTypeCode: {
    LEGAL_3095: 'LEGAL_3095',
    COMMERCIAL_AVANS_3095_2_2: 'COMMERCIAL_AVANS_3095_2_2',
    COMMERCIAL_FIXED: 'COMMERCIAL_FIXED',
    CONTRACTUAL: 'CONTRACTUAL',
    MEVDUAT_TL_BANKALARCA: 'MEVDUAT_TL_BANKALARCA',
    MEVDUAT_TL_KAMU: 'MEVDUAT_TL_KAMU',
  },
  requiresFixedRate: () => false,
  formatRate: (r: number) => String(r),
}));

vi.mock('@/lib/api/fee-engine', () => ({
  feeEngineApi: {
    preview: vi.fn(async () => ({ success: false, error: { code: 'UNAVAILABLE', message: 'test' }, cached: false })),
  },
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u1', tenantId: 't1' }, loading: false }),
}));

vi.mock('@/components/debtor', () => ({
  DebtorStep: () => <div data-testid="stub-debtor-step" />,
}));

const mocked = api as unknown as Record<
  'getLawyers' | 'searchDebtors' | 'getNextFileNumber' | 'createCase' | 'get' | 'post',
  ReturnType<typeof vi.fn>
>;

const LOOKUPS = {
  takipTuru: [{ id: 'tt-ilamsiz', name: 'İlamsız Genel Haciz', code: 'ILAMSIZ_GENEL' }],
  asama: [{ id: 'as-1', name: 'Dosya Açıldı', code: 'DOSYA_ACILDI' }],
  risk: [],
  durumEtiketi: [],
  mahiyetTipi: [],
};

function routeApi() {
  mocked.getLawyers.mockResolvedValue([]);
  mocked.searchDebtors.mockResolvedValue([]);
  mocked.getNextFileNumber.mockResolvedValue('2026/1');
  mocked.get.mockImplementation((url: string) => {
    const u = String(url);
    if (u.startsWith('/lookups')) return Promise.resolve({ data: { data: LOOKUPS } });
    if (u.startsWith('/cases/responsible-candidates')) {
      return Promise.resolve({ data: { data: [{ type: 'LAWYER', id: 'l1', displayName: 'Av. Bir', subtitle: '' }] } });
    }
    return Promise.resolve({ data: { data: [] } });
  });
  mocked.post.mockResolvedValue({ data: {} });
}

const DRAFT_KEY = 'case_wizard_draft:t1:u1';

interface DraftOptions {
  caseCurrency: string;
  /** Listelenen fatura kaleminin para birimi (varsayılan: dosya para birimi). */
  itemCurrency?: string;
  /** Taramadan gelen kambiyo evrakı (createCase `instruments[]`). */
  instruments?: Record<string, unknown>[];
  /** Listede kalem olmasın (kalem formda bekleyecek). */
  withoutListedItem?: boolean;
}

/** Gönderime hazır müvekkilli taslak (son adım): avukat, müvekkil, borçlu, dosya sorumlusu ve bir fatura kalemi. */
const seedReadyDraft = ({ caseCurrency, itemCurrency = caseCurrency, instruments, withoutListedItem }: DraftOptions) =>
  window.localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({
      currentStep: 5,
      caseData: {
        fileNumber: '2026/7',
        takipTuruId: 'tt-ilamsiz',
        startDate: '2026-09-01',
        currency: caseCurrency,
        interestType: 'YASAL',
        interestTypeSelected: true,
      },
      formSelection: { formCode: 'FORM_7', subFormCode: null },
      hesapTarihi: '2026-09-15',
      lawyers: [{ id: 'l1', name: 'Bir', surname: 'Avukat', isResponsible: true }],
      creditors: [{ id: 'c1', type: 'COMPANY', name: 'Müvekkil A.Ş.' }],
      caseDebtors: [{ debtorId: 'd1', role: 'ASIL_BORCLU', debtor: { id: 'd1', type: 'COMPANY', name: 'Borçlu Ltd.' } }],
      responsiblePerson: { type: 'LAWYER', id: 'l1' },
      claimDraftItems: withoutListedItem
        ? []
        : [
            {
              id: 'k1',
              raw: {
                kalemTuru: 'FATURA',
                toplamTutar: 10000,
                bakiyeTutar: 10000,
                currency: itemCurrency,
                vadeTarihi: '2026-02-01',
                takipOncesiFaiz: 'YOK',
                takipSonrasiFaiz: 'YOK',
                faizsizGerekce: 'test',
                faturaBilgileri: { faturaNo: 'FTR-9', faturaTarihi: '2026-01-05' },
              },
            },
          ],
      ...(instruments ? { instruments } : {}),
      tenantId: 't1',
      userId: 'u1',
      savedAt: new Date().toISOString(),
    }),
  );

/** Sunucunun dövizli dosyadaki yanıt biçimi (yalnız talep OLUŞTURULMADIYSA gelir). */
const notCreated = (currency: string, expenseEmailRequested: boolean) => ({
  status: 'NOT_CREATED',
  reasonCode: 'OPENING_EXPENSE_FX_BASIS_POLICY_MISSING',
  message: `Açılış masraf talebi otomatik oluşturulmadı: dosya para birimi ${currency}. Peşin harç hesaplanmadı, tutar çevrilmedi ve eksik tutarla talep oluşturulmadı.`,
  requiredInfo: ['Peşin harç tutarı (TL)'],
  notCalculableItems: [{ itemCode: 'PESIN_HARC', label: 'Peşin Harç' }],
  caseCurrency: currency,
  basisCurrencies: [currency],
  tariffCurrency: 'TRY',
  expenseEmailRequested,
  expenseEmailSent: false,
});

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** Son adımdaki uyarı panelinin satırları (panel yoksa null). */
function panelLines(): string[] | null {
  const heading = Array.from(document.querySelectorAll('h4')).find((h) => /Uyar[ıi]lar|Eksik Alanlar/.test(text(h)));
  const panel = heading?.parentElement?.parentElement;
  return panel ? Array.from(panel.querySelectorAll('li')).map(text) : null;
}

/** Masraf penceresinin metni ve düğmeleri (pencere yoksa null). */
function expenseModal(): { message: string[]; buttons: string[] } | null {
  const modal = screen.queryByRole('heading', { name: 'Masraf Talebi Gönderimi' })?.closest('.fixed');
  if (!modal) return null;
  return {
    message: Array.from(modal.querySelectorAll('p')).map(text),
    buttons: Array.from(modal.querySelectorAll('button')).map(text),
  };
}

// TL taslakta AYNEN kalması gereken metinler
const TL_MESSAGE = 'Takip oluşturulacak ve açılış masrafları hesaplanacak. Müvekkile masraf talebi e-postası göndermek ister misiniz?';
const TL_BUTTONS = ['Oluştur ve Masraf Maili Gönder', 'Sadece Oluştur (Mail Sonra)', 'İptal'];

// Taslakta TL dışı para birimi varken gösterilen metinler
const foreignMessage = (currencies: string) =>
  `Takip oluşturulacak. Dosyada TL dışı para birimi var (${currencies}); açılış masraf talebinin otomatik oluşturulup ` +
  'oluşturulmayacağını sunucu belirler ve sonuç dosya oluşturulduktan sonra gösterilir. Talep oluşturulursa müvekkile ' +
  'masraf talebi e-postası gönderilsin mi?';
const FOREIGN_SEND = 'Oluştur (Talep Oluşursa Mail Gönder)';
const FOREIGN_BUTTONS = [FOREIGN_SEND, 'Sadece Oluştur (Mail Sonra)', 'İptal'];

const OLD_PROMISES = ['Kur hesaplaması otomatik yapılacak', 'açılış masrafları hesaplanacak', 'Oluştur ve Masraf Maili Gönder'];

let alertSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/cases/new');
  alertSpy = vi.fn();
  vi.stubGlobal('alert', alertSpy);
  // Hermetik: sayfanın alt bileşenleri gerçek ağa çıkmaz
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

/** Son adımda "Takibi Oluştur"a basar ve masraf penceresinin açılmasını bekler (istek henüz gitmemiştir). */
async function openExpenseModal(draft: DraftOptions, response: Record<string, unknown> = { id: 'case-new' }) {
  routeApi();
  seedReadyDraft(draft);
  mocked.createCase.mockResolvedValue(response);
  render(<NewCasePage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Takibi Oluştur' }));
  await screen.findByRole('heading', { name: 'Masraf Talebi Gönderimi' });
  expect(mocked.createCase).not.toHaveBeenCalled();
}

/** Pencerede verilen düğmeye basar ve isteğin gövdesini döner. */
async function submitWith(button: string) {
  fireEvent.click(screen.getByRole('button', { name: button }));
  await waitFor(() => expect(mocked.createCase).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
  return mocked.createCase.mock.calls[0][0] as Record<string, unknown>;
}

describe('Sihirbaz son adım — gönderim öncesi metinler', () => {
  for (const currency of ['USD', 'EUR']) {
    it(`${currency} dosya: kur hesabı da masraf hesabı / e-postası da vaat edilmez; sonucu sunucunun belirleyeceği söylenir`, async () => {
      await openExpenseModal({ caseCurrency: currency }, { id: 'case-fx', openingExpenseRequest: notCreated(currency, true) });

      expect(panelLines()).toEqual([`Döviz cinsi: ${currency} - Sistem kur çevirmesi yapmaz; tutarlar ${currency} olarak kaydedilir`]);
      expect(expenseModal()).toEqual({ message: [foreignMessage(currency)], buttons: FOREIGN_BUTTONS });
      for (const promise of OLD_PROMISES) expect(document.body.textContent).not.toContain(promise);

      // Akış ve istek değişmez: e-posta tercihi sunucuya aynen gider, sunucunun sonucu yönlendirmeden önce gösterilir
      const body = await submitWith(FOREIGN_SEND);
      expect(body).toMatchObject({ currency, sendExpenseEmail: true });
      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(alertSpy.mock.calls[0][0]).toContain('otomatik oluşturulmadı');
      expect(alertSpy.mock.calls[0][0]).toContain('Masraf e-postası GÖNDERİLMEDİ.');
      expect(alertSpy.mock.invocationCallOrder[0]).toBeLessThan(push.mock.invocationCallOrder[0]);
      expect(push).toHaveBeenCalledWith('/cases/case-fx?tab=documents');
    });
  }

  it('dövizli dosyada "Sadece Oluştur (Mail Sonra)": e-posta istenmeden gönderilir', async () => {
    await openExpenseModal({ caseCurrency: 'USD' }, { id: 'case-fx', openingExpenseRequest: notCreated('USD', false) });

    const body = await submitWith('Sadece Oluştur (Mail Sonra)');

    expect(body).toMatchObject({ currency: 'USD', sendExpenseEmail: false });
  });

  it('dövizli dosyada sunucu talebi oluşturursa (yanıtta sonuç alanı yok) uyarı gösterilmez — metin bunu da kapsar', async () => {
    await openExpenseModal({ caseCurrency: 'USD' }, { id: 'case-fx-ok' });

    const body = await submitWith(FOREIGN_SEND);

    expect(body).toMatchObject({ currency: 'USD', sendExpenseEmail: true });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/cases/case-fx-ok?tab=documents');
  });

  it('dövizli dosyada "İptal": istek gitmez; bilgi satırı vaat içermeden ekranda kalır', async () => {
    await openExpenseModal({ caseCurrency: 'USD' });

    fireEvent.click(screen.getByRole('button', { name: 'İptal' }));
    await waitFor(() => expect(expenseModal()).toBeNull());

    expect(mocked.createCase).not.toHaveBeenCalled();
    expect(panelLines()).toEqual(['Döviz cinsi: USD - Sistem kur çevirmesi yapmaz; tutarlar USD olarak kaydedilir']);
  });

  it('TL dosya: metinler ve akış AYNEN — bilgi satırı yok, pencere eski metniyle, istek aynı', async () => {
    await openExpenseModal({ caseCurrency: 'TRY' }, { id: 'case-tl' });

    expect(panelLines()).toBeNull();
    expect(expenseModal()).toEqual({ message: [TL_MESSAGE], buttons: TL_BUTTONS });
    expect(document.body.textContent).not.toContain('TL dışı para birimi');
    expect(document.body.textContent).not.toContain('Talep Oluşursa');

    const body = await submitWith('Oluştur ve Masraf Maili Gönder');
    expect(body).toMatchObject({ currency: 'TRY', sendExpenseEmail: true });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/cases/case-tl?tab=documents');
  });

  it('TL dosyada "Sadece Oluştur (Mail Sonra)": e-posta istenmeden gönderilir (aynen)', async () => {
    await openExpenseModal({ caseCurrency: 'TRY' }, { id: 'case-tl' });

    const body = await submitWith('Sadece Oluştur (Mail Sonra)');

    expect(body).toMatchObject({ currency: 'TRY', sendExpenseEmail: false });
  });

  it('karma taslak — dosya TRY, listelenen kalem USD: dosya para birimine bakılmaz, pencere vaat vermez', async () => {
    await openExpenseModal({ caseCurrency: 'TRY', itemCurrency: 'USD' });

    // Bilgi satırı dosya para birimine bağlıdır (TRY → satır yok); pencere taslaktaki para birimlerine bakar
    expect(panelLines()).toBeNull();
    expect(expenseModal()).toEqual({ message: [foreignMessage('USD')], buttons: FOREIGN_BUTTONS });

    const body = await submitWith(FOREIGN_SEND);
    expect(body).toMatchObject({ currency: 'TRY', sendExpenseEmail: true });
  });

  it('karma taslak — dosya ve kalem TRY, taranan evrak USD: pencere vaat vermez', async () => {
    await openExpenseModal({
      caseCurrency: 'TRY',
      instruments: [{ type: 'SENET', amount: 5000, currency: 'USD', documentNo: 'SN-1', issueDate: '2026-01-05', dueDate: '2026-03-01' }],
    });

    expect(panelLines()).toBeNull();
    expect(expenseModal()).toEqual({ message: [foreignMessage('USD')], buttons: FOREIGN_BUTTONS });
  });

  it('birden fazla TL dışı para birimi: hepsi sıralı yazılır', async () => {
    await openExpenseModal({ caseCurrency: 'USD', itemCurrency: 'EUR' });

    expect(expenseModal()).toEqual({ message: [foreignMessage('EUR, USD')], buttons: FOREIGN_BUTTONS });
  });

  it('formda bekleyen (listeye eklenmemiş) USD kalem: gönderimde listeye alınır ve pencere onu da görür', async () => {
    routeApi();
    seedReadyDraft({ caseCurrency: 'TRY', withoutListedItem: true });
    mocked.createCase.mockResolvedValue({ id: 'case-new' });
    render(<NewCasePage />);
    await screen.findByRole('button', { name: 'Takibi Oluştur' });

    // Kalem formu: para birimi USD, tutar 5.000 — "Kalemi Listeye Ekle" denmeden gönderilir
    const currencySelect = (screen.getAllByRole('combobox') as HTMLSelectElement[]).find((select) =>
      Array.from(select.options).some((option) => option.value === 'USD'),
    )!;
    fireEvent.change(currencySelect, { target: { value: 'USD' } });
    fireEvent.change(document.querySelector('input[type="number"][placeholder="0,00"]')!, { target: { value: '5000' } });
    await screen.findByText('SON BORÇ', undefined, { timeout: 4000 }); // kalem hesabı bitti → form tamponu doldu

    fireEvent.click(screen.getByRole('button', { name: 'Takibi Oluştur' }));
    await screen.findByRole('heading', { name: 'Masraf Talebi Gönderimi' });

    expect(expenseModal()).toEqual({ message: [foreignMessage('USD')], buttons: FOREIGN_BUTTONS });
    expect(screen.getByTestId('listed-claim-items-live-aggregate').textContent).toContain('USD');
  });
});
