import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { UyapPanel } from '../UyapPanel';
import { api } from '@/lib/api';

/**
 * PR-2A1 — DAVRANIS MATRISI
 * stable key: components/case/UyapPanel.tsx#handleHacizSubmit
 *
 * Bu spec, `handleHacizSubmit`'in scanner tarafindan `[YALANCI BASARI]` olarak
 * isaretlenmesinin FALSE POSITIVE olup olmadigini KODU DEGISTIRMEDEN olcer.
 *
 * Alti kriterin HEPSI gecmelidir. Biri bile duserse dugum TESTED_FALSE_POSITIVE
 * DEGILDIR ve FIXED olarak onarilmalidir. Ozellikle: yalniz hata gorunurlugu olmasi,
 * duplicate-submit veya yalanci basari riskinin bulunmadigini KANITLAMAZ.
 */

vi.mock('@/lib/api', () => ({
  api: {
    getUyapStatus: vi.fn(),
    validateUyapCasePoa: vi.fn(),
    getUyapRequestHistory: vi.fn(),
    getCaseDebtors: vi.fn(),
    getPreHacizIntelligence: vi.fn(),
    sendUyapHacizRequest: vi.fn(),
    submitUyapDocument: vi.fn(),
    retryUyapFailedRequests: vi.fn(),
  },
}));

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const DEBTOR = { caseDebtorId: 'cd-1', debtorId: 'd-1', name: 'Test Borclu', role: 'ASIL_BORCLU' };

/**
 * Her cagri AYRI ve SOZLESME SEKLINDE kurulur; genel fallback mock YOK.
 * Eksik dizi alani bilesenin render sirasinda `.map` ile patlamasina yol aciyordu —
 * teshis bunu gosterdi, bu yuzden sekiller tam verilir.
 */
function primeReads() {
  mocked.getUyapStatus.mockResolvedValue({
    connected: true,
    mode: 'STUB',
    integrationEnabled: true,
    features: [],
  });
  mocked.validateUyapCasePoa.mockResolvedValue({
    valid: true,
    canProceed: true,
    errors: [],
    reasons: [],
    blockers: [],
    warnings: [],
  });
  mocked.getUyapRequestHistory.mockResolvedValue([]);
  mocked.getCaseDebtors.mockResolvedValue({ items: [DEBTOR], total: 1 });
  mocked.getPreHacizIntelligence.mockResolvedValue({ debtors: [], overallLevel: 'YOK' });
}

/** Yukleme kapisi: loading / gorunur load error / tablist hazir — hangisi? */
async function assertTablistReady() {
  const tabs = await screen.findAllByRole('tab');
  expect(tabs).toHaveLength(4);
  expect(screen.queryByTestId('action-error')).toBeNull();
}

/** Haciz sekmesini acar, tutari doldurur ve gonder dugmesini dondurur. */
async function openHacizForm() {
  render(<UyapPanel caseId="case-1" />);

  // Yukleme bitene kadar sekme seti mount OLMAZ; `getUyapStatus` cagrildi diye
  // beklemek yetmez — semantik tab'in gorunmesini bekle.
  const hacizTab = await screen.findByRole('tab', { name: 'Haciz Talebi' });
  fireEvent.click(hacizTab);

  // Panelin GERCEKTEN mount oldugunu dogrula (tab/panel iliskisi uzerinden).
  const panel = await screen.findByRole('tabpanel');
  expect(panel.getAttribute('aria-labelledby')).toBe('uyap-tab-haciz');

  const numeric = Array.from(panel.querySelectorAll('input[type="number"]'));
  const amount = numeric[0] as HTMLInputElement | undefined;
  if (!amount) throw new Error('haciz tutar alani bulunamadi');
  fireEvent.change(amount, { target: { value: '1000' } });

  const submit = Array.from(panel.querySelectorAll('button')).find((b) =>
    /haciz talebi/i.test(b.textContent ?? ''),
  );
  if (!submit) throw new Error('haciz gonder dugmesi bulunamadi');
  return submit as HTMLButtonElement;
}

beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  primeReads();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('EVIDENCE: UyapPanel#handleHacizSubmit', () => {
  it('kriter 1 — backend validation hatasi GORUNUR', async () => {
    mocked.sendUyapHacizRequest.mockRejectedValueOnce({
      body: { message: 'Haciz tutari borcu asamaz.' },
    });
    const submit = await openHacizForm();
    fireEvent.click(submit);

    await waitFor(() =>
      expect(screen.getByText(/gönderilemedi|Haciz tutari/i)).toBeTruthy(),
    );
  });

  it('kriter 2 — network hatasi GORUNUR', async () => {
    mocked.sendUyapHacizRequest.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const submit = await openHacizForm();
    fireEvent.click(submit);

    await waitFor(() => expect(screen.getByText(/Sunucuya ulaşılamadı/i)).toBeTruthy());
  });

  it('kriter 3 — basari YALNIZ gercek response sonrasi', async () => {
    let release!: () => void;
    mocked.sendUyapHacizRequest.mockImplementationOnce(
      () => new Promise((res) => { release = () => res({ id: 'h-1' }); }),
    );
    const submit = await openHacizForm();
    fireEvent.click(submit);

    // Uctan yanit gelmeden tutar temizlenmemeli.
    const amountBefore = screen.getByDisplayValue('1000');
    expect(amountBefore).toBeTruthy();

    release();
    await waitFor(() => expect(mocked.getUyapStatus).toHaveBeenCalledTimes(2));
  });

  it('kriter 4 — AYNI-TICK cift giris TEK mutation (gercek yaris)', async () => {
    let release!: (v: unknown) => void;
    mocked.sendUyapHacizRequest.mockImplementation(
      () => new Promise((res) => { release = res; }),
    );
    const submit = await openHacizForm();

    //  her tikta act flush eder; bu, React state korumasini yapay olarak
    // guclendirir. Gercek yaris icin handler AYNI event-loop turunda iki kez
    // tetiklenir — React disabled state i flush etmeye FIRSAT BULAMAZ.
    submit.click();
    submit.click();

    await Promise.resolve();
    expect(mocked.sendUyapHacizRequest).toHaveBeenCalledTimes(1);

    release({ id: 1 });
    await waitFor(() => expect(mocked.sendUyapHacizRequest).toHaveBeenCalledTimes(1));
  });

  it('kriter 4b — hata sonrasi kilit BIRAKILIR, retry TEK yeni mutation baslatir', async () => {
    mocked.sendUyapHacizRequest
      .mockRejectedValueOnce({ body: { message: 'Reddedildi.' } })
      .mockResolvedValueOnce({ id: 'h-2' });
    const submit = await openHacizForm();

    fireEvent.click(submit);
    await waitFor(() => expect(screen.getByText(/gönderilemedi|Reddedildi/i)).toBeTruthy());
    expect(mocked.sendUyapHacizRequest).toHaveBeenCalledTimes(1);

    // Kilit birakildi -> kullanicinin yeniden denemesi TAM 1 yeni mutation uretir.
    fireEvent.click(submit);
    await waitFor(() => expect(mocked.sendUyapHacizRequest).toHaveBeenCalledTimes(2));
  });

  it('kriter 4c — malformed response basari SAYILMAZ', async () => {
    mocked.sendUyapHacizRequest.mockResolvedValueOnce({ id: 1 });
    const submit = await openHacizForm();
    // Ilk yukleme tamamlandiktan SONRA tazelemeyi bozuyoruz; aksi halde 
    // mount sirasindaki loadData tarafindan tuketilirdi.
    mocked.getUyapRequestHistory.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fireEvent.click(submit);

    // Tazeleme sozlesmeye uymuyorsa SUCCESS_STALE uretilir, sessiz basari DEGIL.
    await screen.findByTestId('stale-notice');
  });

  it('kriter 5 — hata halinde form/reset/close CALISMIYOR', async () => {
    mocked.sendUyapHacizRequest.mockRejectedValueOnce({
      body: { message: 'Reddedildi.' },
    });
    const submit = await openHacizForm();
    fireEvent.click(submit);

    await waitFor(() => expect(mocked.sendUyapHacizRequest).toHaveBeenCalled());
    // Tutar KORUNMALI — hata halinde form temizlenmemeli.
    await waitFor(() => expect(screen.getByDisplayValue('1000')).toBeTruthy());
  });

  it('kriter 6 — kaynakta bos catch YOK', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'UyapPanel.tsx'), 'utf8');
    const fn = src.slice(src.indexOf('const handleHacizSubmit'), src.indexOf('const handleRetryFailed'));
    expect(fn).not.toMatch(/catch\s*\([^)]*\)\s*\{\s*\}/);
  });
});
