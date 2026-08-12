import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { ClaimItemPanel } from '../ClaimItemPanel';
import { api } from '@/lib/api';

/**
 * PR-2A1 — FINANSAL MUTATION DAVRANIS MATRISI
 * stable keys:
 *   components/claim-item/ClaimItemPanel.tsx#handleDelete
 *   components/claim-item/ClaimItemPanel.tsx#handleRecalculateInterest
 *
 * Cekirdek ayrim: HTTP basarisi != DOMAIN basarisi. `approvalRequired` bir ARA
 * DURUMDUR — silme GERCEKLESMEMISTIR; success yan etkisi calismaz.
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/lib/interest-type-resolver', () => ({ getInterestReadDisplayLabel: () => 'Faiz' }));

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const ITEM = {
  id: 'ci-1', itemType: 'PRINCIPAL', amount: 1000, currency: 'TRY',
  description: 'Asil alacak kalemi', status: 'ACTIVE', isCalculated: false,
  interestRate: 12,
};
const SUMMARY = {
  caseId: 'case-1', currency: 'TRY', items: [],
  totals: { principal: 1000, preInterest: 0, postInterest: 0, totalInterest: 0, expense: 0,
    fee: 0, attorneyFee: 0, penalty: 0, tax: 0, other: 0, grandTotal: 1000 },
  calculationDate: '2026-08-11',
};

/** Her cagri AYRI kurulur; genel fallback mock YOK. */
function primeReads(items = [ITEM]) {
  mocked.get.mockImplementation((url: string) =>
    Promise.resolve(
      url.endsWith('/summary') ? { data: { data: SUMMARY } } : { data: { data: items } },
    ),
  );
}

async function renderPanel() {
  render(<ClaimItemPanel caseId="case-1" />);
  await screen.findByText(/Asil alacak kalemi/i);
}

/** Kesin erisilebilir ad — coklu kalemde yanlis satir secilemez. */
function deleteButton(label = 'Asıl Alacak kalemini sil') {
  return screen.getByRole('button', { name: label });
}

function interestButton() {
  return screen.getByRole('button', { name: 'Faizleri Yeniden Hesapla' });
}

beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  primeReads();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ClaimItemPanel#handleDelete', () => {
  it('cancel MUTATION BASLATMAZ', async () => {
    (window.confirm as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
    await renderPanel();
    fireEvent.click(deleteButton());
    expect(mocked.delete).not.toHaveBeenCalled();
  });

  it('backend validation hatasi GORUNUR; satir KORUNUR', async () => {
    mocked.delete.mockRejectedValueOnce({ body: { message: 'Bu kalem silinemez.' } });
    await renderPanel();
    fireEvent.click(deleteButton());
    await screen.findByText(/Bu kalem silinemez/i);
    expect(screen.getByText(/Asil alacak kalemi/i)).toBeTruthy();
  });

  it('network hatasi GORUNUR', async () => {
    mocked.delete.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await renderPanel();
    fireEvent.click(deleteButton());
    await screen.findByText(/Sunucuya ulaşılamadı/i);
  });

  it('approvalRequired BASARI DEGILDIR — liste tazelenmez, satir durur', async () => {
    mocked.delete.mockResolvedValueOnce({ data: { data: { approvalRequired: true } } });
    await renderPanel();
    const getsBefore = mocked.get.mock.calls.length;
    fireEvent.click(deleteButton());

    await screen.findByTestId('approval-notice');
    expect(screen.getByText(/Asil alacak kalemi/i)).toBeTruthy();
    // Tazeleme CALISMADI.
    expect(mocked.get.mock.calls.length).toBe(getsBefore);
    expect(screen.queryByTestId('stale-notice')).toBeNull();
  });

  it('terminal success -> liste sunucudan yeniden okunur', async () => {
    mocked.delete.mockResolvedValueOnce({ data: { data: { approvalRequired: false } } });
    await renderPanel();
    const before = mocked.get.mock.calls.length;
    fireEvent.click(deleteButton());
    await waitFor(() => expect(mocked.get.mock.calls.length).toBeGreaterThan(before));
    expect(screen.queryByTestId('stale-notice')).toBeNull();
  });

  it('refresh failure -> SUCCESS_STALE; tekrar delete SUNULMAZ', async () => {
    mocked.delete.mockResolvedValueOnce({ data: { data: { approvalRequired: false } } });
    await renderPanel();
    mocked.get.mockRejectedValue(new TypeError('Failed to fetch'));
    fireEvent.click(deleteButton());

    await screen.findByTestId('stale-notice');
    expect(mocked.delete).toHaveBeenCalledTimes(1);
  });

  it('stale refresh-only -> mutation 0', async () => {
    mocked.delete.mockResolvedValueOnce({ data: { data: { approvalRequired: false } } });
    await renderPanel();
    mocked.get.mockRejectedValue(new TypeError('Failed to fetch'));
    fireEvent.click(deleteButton());
    await screen.findByTestId('stale-notice');

    primeReads([]);
    fireEvent.click(screen.getByTestId('stale-refresh'));
    await waitFor(() => expect(screen.queryByTestId('stale-notice')).toBeNull());
    expect(mocked.delete).toHaveBeenCalledTimes(1);
  });

  it('AYNI-TICK duplicate -> TEK mutation (gercek yaris)', async () => {
    let release!: (v: unknown) => void;
    mocked.delete.mockImplementation(() => new Promise((res) => { release = res; }));
    await renderPanel();
    const btn = deleteButton();

    btn.click();
    btn.click();
    await Promise.resolve();

    expect(mocked.delete).toHaveBeenCalledTimes(1);
    release({ data: { data: { approvalRequired: false } } });
  });
});

describe('ClaimItemPanel#handleRecalculateInterest', () => {
  it('backend hatasi GORUNUR; onceki deger DEGISMEZ', async () => {
    mocked.post.mockRejectedValueOnce({ body: { message: 'Faiz hesaplanamadi.' } });
    await renderPanel();
    fireEvent.click(interestButton());
    await screen.findByText(/Faiz hesaplanamadi/i);
    expect(screen.getByText(/Asil alacak kalemi/i)).toBeTruthy();
  });

  it('network hatasi GORUNUR', async () => {
    mocked.post.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await renderPanel();
    fireEvent.click(interestButton());
    await screen.findByText(/Sunucuya ulaşılamadı/i);
  });

  it('sonuc YALNIZ dogrulanmis reload ile gosterilir', async () => {
    mocked.post.mockResolvedValueOnce({ data: { data: { ok: true } } });
    await renderPanel();
    const before = mocked.get.mock.calls.length;
    fireEvent.click(interestButton());
    await waitFor(() => expect(mocked.get.mock.calls.length).toBeGreaterThan(before));
  });

  it('malformed reload BASARI SAYILMAZ -> SUCCESS_STALE', async () => {
    mocked.post.mockResolvedValueOnce({ data: { data: { ok: true } } });
    await renderPanel();
    mocked.get.mockResolvedValue({ data: { data: null } });
    fireEvent.click(interestButton());
    await screen.findByTestId('stale-notice');
  });

  it('AYNI-TICK duplicate -> TEK mutation', async () => {
    let release!: (v: unknown) => void;
    mocked.post.mockImplementation(() => new Promise((res) => { release = res; }));
    await renderPanel();
    const btn = interestButton();

    btn.click();
    btn.click();
    await Promise.resolve();

    expect(mocked.post).toHaveBeenCalledTimes(1);
    release({ data: { data: { ok: true } } });
  });
});

describe('ClaimItemPanel — kaynak disiplini', () => {
  it('bos catch / sessiz suppression YOK', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'ClaimItemPanel.tsx'), 'utf8');
    expect(src).not.toMatch(/catch\s*\([^)]*\)\s*\{\s*\}/);
    expect(src).not.toMatch(/\.catch\(\s*\(\s*[^)]*\)\s*=>\s*\{\s*\}\s*\)/);
  });
});
