import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import CaseDetailV2Page from '../page';
import { api } from '@/lib/api';

/**
 * WSMR-A4-AC-03 — `app/(dashboard)/cases/[id]/v2/page.tsx#fetchDebtors`
 *
 * İKİ AYRI GERÇEK BUG:
 * 1) Eskiden catch dalında yalnız console.error ile hata yutuluyordu —
 *    `debtors` boş kalınca "Borçlu yok" (GERÇEK boşlukla AYNI) görünüyordu.
 * 2) caseId (route param) değiştiğinde bu sayfa örneği UNMOUNT OLMADAN
 *    yeniden kullanılabiliyordu (Next.js App Router davranışı) — jenerasyon
 *    token'ı olmadan ÖNCEKİ dosyanın GEÇ gelen yanıtı YENİ dosyanın
 *    state'ini ezebiliyordu.
 */

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let currentCaseId = 'case-A';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: currentCaseId }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// DebtorDetailDrawer'ın kendi sözleşmesi başka yerde (A4-AB-18/19) test
// edilir — burada yalnız açık/kapalı olduğu gözlemlenebilir bir stub yeterli.
// `onUpdate` prop'u BİLEREK expose edilir: bu, sayfanın kendi "aynı caseId
// için borçlu listesini yenile" mekanizmasıdır (onUpdate={fetchDebtors}) —
// test 10 bu gerçek yolu kullanarak aynı-ID refresh hatası senaryosunu kurar.
vi.mock('@/components/debtor', () => ({
  DebtorDetailDrawer: ({ isOpen, onUpdate }: { isOpen: boolean; onUpdate: () => void }) =>
    isOpen ? (
      <div data-testid="debtor-drawer">
        drawer-open
        <button onClick={onUpdate}>trigger-update</button>
      </div>
    ) : null,
}));

vi.mock('@/lib/api', () => {
  const registry: Record<string, ReturnType<typeof vi.fn>> = {};
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop: string) {
      if (!(prop in registry)) registry[prop] = vi.fn();
      return registry[prop];
    },
  };
  return { api: new Proxy({}, handler) };
});

const mocked = api as unknown as {
  getCase: ReturnType<typeof vi.fn>;
  getCaseDebtors: ReturnType<typeof vi.fn>;
};

const REAL_CASE = {
  id: 'case-A',
  fileNumber: '2026/1',
  type: 'GENERAL_EXECUTION',
  status: 'ACTIVE',
  caseStatus: 'DEVAM_EDIYOR',
  executionPath: 'GENEL',
  caseDate: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function debtor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'd-1',
    caseDebtorId: 'cd-1',
    displayName: 'Ahmet Yılmaz',
    personType: 'REAL',
    role: 'ASIL_BORCLU',
    lifecycleStatus: 'ACTIVE',
    serviceStatus: 'NOT_STARTED',
    serviceLabel: 'Başlatılmadı',
    alertCount: 0,
    ...overrides,
  };
}

type DebtorsCall = { caseId: string; d: ReturnType<typeof deferred<any>> };
let debtorsCalls: DebtorsCall[];

function renderPage() {
  return render(<CaseDetailV2Page />);
}

beforeEach(() => {
  currentCaseId = 'case-A';
  debtorsCalls = [];
  mocked.getCase.mockImplementation((id: string) =>
    Promise.resolve({ ...REAL_CASE, id }),
  );
  mocked.getCaseDebtors.mockImplementation((caseId: string) => {
    const d = deferred<any>();
    debtorsCalls.push({ caseId, d });
    return d.promise;
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WSMR-A4-AC-03 — case v2 fetchDebtors okuma hatası', () => {
  it('1) ilk yükleme: istek beklerken hata bandı YOK', async () => {
    renderPage();
    await waitFor(() => expect(debtorsCalls.length).toBe(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await act(async () => {
      debtorsCalls[0].d.resolve({ items: [], summary: {} });
    });
  });

  it('2) gerçek başarı — dolu borçlu listesi render edilir, hata bandı yok', async () => {
    renderPage();
    await waitFor(() => expect(debtorsCalls.length).toBe(1));
    await act(async () => {
      debtorsCalls[0].d.resolve({ items: [debtor({ displayName: 'Ahmet Yılmaz' })], summary: {} });
    });
    expect(await screen.findByText('Ahmet Yılmaz')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Borçlu yok')).not.toBeInTheDocument();
  });

  it('3) gerçek başarı — GERÇEKTEN boş liste "Borçlu yok" gösterir, hata bandı yok', async () => {
    renderPage();
    await waitFor(() => expect(debtorsCalls.length).toBe(1));
    await act(async () => {
      debtorsCalls[0].d.resolve({ items: [], summary: {} });
    });
    expect(await screen.findByText('Borçlu yok')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('4) network hatası — görünür bant, "Borçlu yok" ile KARIŞMAZ', async () => {
    renderPage();
    await waitFor(() => expect(debtorsCalls.length).toBe(1));
    await act(async () => {
      debtorsCalls[0].d.reject(new Error('Network Error'));
    });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Borçlu yok')).not.toBeInTheDocument();
  });

  it('5) HTTP hatası — görünür bant', async () => {
    renderPage();
    await waitFor(() => expect(debtorsCalls.length).toBe(1));
    await act(async () => {
      debtorsCalls[0].d.reject({ message: 'Sunucu hatası (500)', status: 500 });
    });
    const alertEl = await screen.findByRole('alert');
    expect(alertEl.textContent).toMatch(/Borçlular yüklenemedi|Sunucu hatası/);
  });

  it('6) malformed gövde (items dizi değil) — crash etmez, hata olarak işlenir', async () => {
    renderPage();
    await waitFor(() => expect(debtorsCalls.length).toBe(1));
    await act(async () => {
      debtorsCalls[0].d.resolve({ items: null, summary: {} });
    });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Borçlu yok')).not.toBeInTheDocument();
  });

  it('7) hata görünürlüğü ve boş-state gizlenmesi birlikte doğrulanır', async () => {
    renderPage();
    await waitFor(() => expect(debtorsCalls.length).toBe(1));
    await act(async () => {
      debtorsCalls[0].d.reject(new Error('boom'));
    });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Borçlu yok')).not.toBeInTheDocument();
  });

  it('8) hata -> retry -> başarı', async () => {
    renderPage();
    await waitFor(() => expect(debtorsCalls.length).toBe(1));
    await act(async () => {
      debtorsCalls[0].d.reject(new Error('boom'));
    });
    await screen.findByRole('alert');

    const retryBtn = screen.getByRole('button', { name: /Tekrar dene/i });
    await act(async () => {
      retryBtn.click();
    });
    await waitFor(() => expect(debtorsCalls.length).toBe(2));
    await act(async () => {
      debtorsCalls[1].d.resolve({ items: [debtor({ displayName: 'Zeynep Kaya' })], summary: {} });
    });
    expect(await screen.findByText('Zeynep Kaya')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('9) retry YALNIZ getCaseDebtors kaynağını tekrar dener, getCase tekrar çağrılmaz', async () => {
    renderPage();
    await waitFor(() => expect(debtorsCalls.length).toBe(1));
    await act(async () => {
      debtorsCalls[0].d.reject(new Error('boom'));
    });
    await screen.findByRole('alert');
    const callsBefore = mocked.getCase.mock.calls.length;

    const retryBtn = screen.getByRole('button', { name: /Tekrar dene/i });
    await act(async () => {
      retryBtn.click();
    });
    await waitFor(() => expect(debtorsCalls.length).toBe(2));
    expect(mocked.getCase.mock.calls.length).toBe(callsBefore);
  });

  it('10) başarılı veri -> aynı caseId refresh hatası -> veri KORUNUR + bayat etiketi', async () => {
    renderPage();
    await waitFor(() => expect(debtorsCalls.length).toBe(1));
    await act(async () => {
      debtorsCalls[0].d.resolve({
        items: [debtor({ displayName: 'Ahmet Yılmaz', caseDebtorId: 'cd-1' })],
        summary: {},
      });
    });
    await screen.findByText('Ahmet Yılmaz');

    // Borçlu satırına tıkla -> drawer açılır -> drawer'ın onUpdate'i (=
    // sayfanın KENDİ "aynı caseId için borçlu listesini yenile" mekanizması,
    // fetchDebtors) tetiklenir.
    const debtorRow = screen.getByText('Ahmet Yılmaz').closest('button')!;
    await act(async () => {
      debtorRow.click();
    });
    const updateBtn = await screen.findByText('trigger-update');
    await act(async () => {
      updateBtn.click();
    });

    await waitFor(() => expect(debtorsCalls.length).toBe(2));
    await act(async () => {
      debtorsCalls[1].d.reject(new Error('refresh başarısız'));
    });

    // Önceki başarıyla yüklenmiş liste (AYNI caseId) SİLİNMEZ; bayat etiketi
    // görünür olur.
    expect(await screen.findByText('Ahmet Yılmaz')).toBeInTheDocument();
    const alertEl = await screen.findByRole('alert');
    expect(alertEl.textContent).toMatch(/bayat/i);
  });

  it('11) A başarı -> B geçişi -> A verisi ANINDA görünmez olur', async () => {
    const { rerender } = renderPage();
    await waitFor(() => expect(debtorsCalls.length).toBe(1));
    await act(async () => {
      debtorsCalls[0].d.resolve({ items: [debtor({ displayName: 'Borçlu A1' })], summary: {} });
    });
    await screen.findByText('Borçlu A1');

    // AYNI bileşen örneği (unmount YOK) — Next.js App Router'ın ayni page
    // bileşenini caseId degisince yeniden kullanma davranışı simüle edilir.
    currentCaseId = 'case-B';
    await act(async () => {
      rerender(<CaseDetailV2Page />);
    });

    expect(screen.queryByText('Borçlu A1')).not.toBeInTheDocument();
  });

  it('12) geç A success B state\'ini DEĞİŞTİRMEZ', async () => {
    const { rerender } = renderPage();
    await waitFor(() => expect(debtorsCalls.length).toBe(1));
    const aCall = debtorsCalls[0];

    // A'nın isteği HENÜZ çözülmeden caseId B'ye geçer (hızlı gezinme) — AYNI
    // bileşen örneği (unmount YOK).
    currentCaseId = 'case-B';
    await act(async () => {
      rerender(<CaseDetailV2Page />);
    });
    await waitFor(() => expect(debtorsCalls.length).toBe(2));
    const bCall = debtorsCalls[1];

    // B'nin kendi isteği HENÜZ çözülmedi; A'nın GEÇ gelen başarı yanıtı
    // artık jenerasyon token'ı ile ESKİ sayılır ve state'i ETKİLEMEMELİ.
    await act(async () => {
      aCall.d.resolve({ items: [debtor({ displayName: 'Borçlu A1' })], summary: {} });
    });
    expect(screen.queryByText('Borçlu A1')).not.toBeInTheDocument();

    await act(async () => {
      bCall.d.resolve({ items: [debtor({ displayName: 'Borçlu B1' })], summary: {} });
    });
    expect(await screen.findByText('Borçlu B1')).toBeInTheDocument();
    expect(screen.queryByText('Borçlu A1')).not.toBeInTheDocument();
  });

  it('13) geç A rejection B state\'ini DEĞİŞTİRMEZ (hata bandı sızmaz)', async () => {
    const { rerender } = renderPage();
    await waitFor(() => expect(debtorsCalls.length).toBe(1));
    const aCall = debtorsCalls[0];

    currentCaseId = 'case-B';
    await act(async () => {
      rerender(<CaseDetailV2Page />);
    });
    await waitFor(() => expect(debtorsCalls.length).toBe(2));
    const bCall = debtorsCalls[1];

    await act(async () => {
      aCall.d.reject(new Error('A icin gec gelen red'));
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await act(async () => {
      bCall.d.resolve({ items: [debtor({ displayName: 'Borçlu B1' })], summary: {} });
    });
    expect(await screen.findByText('Borçlu B1')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('14) çift retry -> tek ek istek (disabled + in-flight koruması)', async () => {
    renderPage();
    await waitFor(() => expect(debtorsCalls.length).toBe(1));
    await act(async () => {
      debtorsCalls[0].d.reject(new Error('boom'));
    });
    await screen.findByRole('alert');

    const retryBtn = screen.getByRole('button', { name: /Tekrar dene/i });
    await act(async () => {
      retryBtn.click();
    });
    // İlk tıklamadan hemen sonra buton disabled olur (debtorsRetrying=true) —
    // disabled bir <button>'a ikinci .click() onClick'i TETİKLEMEZ.
    expect(retryBtn).toBeDisabled();
    await act(async () => {
      retryBtn.click();
    });
    await waitFor(() => expect(debtorsCalls.length).toBeGreaterThanOrEqual(2));
    expect(debtorsCalls.length).toBe(2);
  });

  it('15) unmount sonrası state yazılmaz (crash/uyarı yok)', async () => {
    const { unmount } = renderPage();
    await waitFor(() => expect(debtorsCalls.length).toBe(1));
    const call = debtorsCalls[0];
    unmount();
    await act(async () => {
      call.d.resolve({ items: [debtor()], summary: {} });
    });
    // Assertion yok — hedef unmount sonrası setState uyarısı/throw ÜRETMEMEK.
  });

  it('16) hata durumunda false-success yan etkisi yok (borçlu eklenmiş/redirect gibi görünmez)', async () => {
    renderPage();
    await waitFor(() => expect(debtorsCalls.length).toBe(1));
    const callsBefore = mocked.getCase.mock.calls.length;
    await act(async () => {
      debtorsCalls[0].d.reject(new Error('boom'));
    });
    await screen.findByRole('alert');
    expect(screen.queryByText('Borçlu yok')).not.toBeInTheDocument();
    expect(screen.queryByTestId('debtor-drawer')).not.toBeInTheDocument();
    expect(mocked.getCase.mock.calls.length).toBe(callsBefore);
  });
});
