import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import NewCasePage from '../page';
import { api } from '@/lib/api';

/**
 * Otomatik açılış masraf talebi "oluşturulmadı" sonucu — sihirbaz (owner ara kararı 2026-10-01).
 *
 * Dövizli / karma dosyada sunucu yanlış ya da eksik tutarlı otomatik talebi kayda geçirmez; dosya açılır ve yanıtta
 * `openingExpenseRequest` sonucu döner. Sihirbaz bu sonucu SESSİZCE YUTMAZ: sunucunun nedeni, tamamlanması gereken bilgi
 * ve (istenmişse) masraf e-postasının gönderilmediği, dosya sayfasına yönlendirmeden ÖNCE kullanıcıya gösterilir.
 * Sihirbaz hangi dosyada talep oluşmayacağına kendisi karar vermez; yalnız sunucunun sonucunu gösterir.
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

/** Gönderime hazır müvekkilli taslak (son adım): avukat, müvekkil, borçlu, dosya sorumlusu ve bir fatura kalemi. */
const seedReadyDraft = (currency: string) =>
  window.localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({
      currentStep: 5,
      caseData: {
        fileNumber: '2026/7',
        takipTuruId: 'tt-ilamsiz',
        startDate: '2026-09-01',
        currency,
        interestType: 'YASAL',
        interestTypeSelected: true,
      },
      formSelection: { formCode: 'FORM_7', subFormCode: null },
      hesapTarihi: '2026-09-15',
      lawyers: [{ id: 'l1', name: 'Bir', surname: 'Avukat', isResponsible: true }],
      creditors: [{ id: 'c1', type: 'COMPANY', name: 'Müvekkil A.Ş.' }],
      caseDebtors: [{ debtorId: 'd1', role: 'ASIL_BORCLU', debtor: { id: 'd1', type: 'COMPANY', name: 'Borçlu Ltd.' } }],
      responsiblePerson: { type: 'LAWYER', id: 'l1' },
      claimDraftItems: [
        {
          id: 'k1',
          raw: {
            kalemTuru: 'FATURA',
            toplamTutar: 10000,
            bakiyeTutar: 10000,
            currency,
            vadeTarihi: '2026-02-01',
            takipOncesiFaiz: 'YOK',
            takipSonrasiFaiz: 'YOK',
            faizsizGerekce: 'test',
            faturaBilgileri: { faturaNo: 'FTR-9', faturaTarihi: '2026-01-05' },
          },
        },
      ],
      tenantId: 't1',
      userId: 'u1',
      savedAt: new Date().toISOString(),
    }),
  );

const SUNUCU_MESAJI =
  'Açılış masraf talebi otomatik oluşturulmadı: dosya para birimi USD. Peşin harç hesaplanmadı, tutar çevrilmedi ve eksik tutarla talep oluşturulmadı.';

const NOT_CREATED = {
  status: 'NOT_CREATED',
  reasonCode: 'OPENING_EXPENSE_FX_BASIS_POLICY_MISSING',
  message: SUNUCU_MESAJI,
  requiredInfo: ['Peşin harç tutarı (TL)'],
  notCalculableItems: [{ itemCode: 'PESIN_HARC', label: 'Peşin Harç' }],
  caseCurrency: 'USD',
  basisCurrencies: ['USD'],
  tariffCurrency: 'TRY',
  expenseEmailRequested: true,
  expenseEmailSent: false,
};

let alertSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/cases/new');
  alertSpy = vi.fn();
  vi.stubGlobal('alert', alertSpy);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

/** Son adımdan gönderir: "Takibi Oluştur" → masraf penceresinde verilen düğme. */
async function submit(modalButton: string) {
  fireEvent.click(await screen.findByRole('button', { name: 'Takibi Oluştur' }));
  fireEvent.click(await screen.findByRole('button', { name: modalButton }));
  await vi.waitFor(() => expect(mocked.createCase).toHaveBeenCalledTimes(1));
}

describe('Sihirbaz — açılış yanıtındaki masraf talebi sonucu', () => {
  it('dövizli dosya: sunucunun "oluşturulmadı" nedeni, gereken bilgi ve e-postanın gönderilmediği yönlendirmeden ÖNCE gösterilir', async () => {
    routeApi();
    seedReadyDraft('USD');
    mocked.createCase.mockResolvedValue({ id: 'case-new', openingExpenseRequest: NOT_CREATED });
    render(<NewCasePage />);

    await submit('Oluştur ve Masraf Maili Gönder');

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/cases/case-new?tab=documents'));
    expect(mocked.createCase.mock.calls[0][0]).toMatchObject({ currency: 'USD', sendExpenseEmail: true });
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      `Dosya oluşturuldu. ${SUNUCU_MESAJI} Gereken bilgi: Peşin harç tutarı (TL). Masraf e-postası GÖNDERİLMEDİ.`,
    );
    expect(alertSpy.mock.invocationCallOrder[0]).toBeLessThan(push.mock.invocationCallOrder[0]);
  });

  it('dövizli dosyada e-posta istenmediyse yalnız neden ve gereken bilgi yazılır', async () => {
    routeApi();
    seedReadyDraft('USD');
    mocked.createCase.mockResolvedValue({ id: 'case-new', openingExpenseRequest: { ...NOT_CREATED, expenseEmailRequested: false } });
    render(<NewCasePage />);

    await submit('Sadece Oluştur (Mail Sonra)');

    await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(mocked.createCase.mock.calls[0][0]).toMatchObject({ sendExpenseEmail: false });
    expect(alertSpy).toHaveBeenCalledWith(`Dosya oluşturuldu. ${SUNUCU_MESAJI} Gereken bilgi: Peşin harç tutarı (TL).`);
  });

  it('TL dosya (yanıtta sonuç alanı yok): uyarı gösterilmez, akış aynen sürer', async () => {
    routeApi();
    seedReadyDraft('TRY');
    mocked.createCase.mockResolvedValue({ id: 'case-tl' });
    render(<NewCasePage />);

    await submit('Oluştur ve Masraf Maili Gönder');

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/cases/case-tl?tab=documents'));
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
