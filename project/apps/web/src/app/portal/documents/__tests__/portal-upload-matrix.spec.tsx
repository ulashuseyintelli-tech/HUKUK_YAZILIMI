import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import PortalDocumentsPage from '../page';

/**
 * PR-2A1 — PORTAL BELGE YUKLEME DAVRANIS MATRISI
 * stable key: app/portal/documents/page.tsx#handleUpload
 *
 * `fetch` HTTP hatasinda throw ETMEZ; eski kod `res.ok` degilse HICBIR SEY yapmiyordu —
 * muvekkil belgeyi yukledigini saniyor, dosya hicbir yerde yok. Yeni sozlesme:
 * !ok -> throw (sunucu mesajiyla), basari yan etkileri yalniz dogrulanmis sonucta.
 */

const realFetch = globalThis.fetch;
const mockedFetch = vi.fn();

const DOCS = [
  { id: 'd1', title: 'Vekaletname', type: 'VEKALETNAME', status: 'APPROVED', createdAt: '2026-08-01', fileName: 'v.pdf', fileSize: 1000 },
];

/** URL'e gore ACIK yonlendirme; genel fallback yok. */
function primeFetch(over: Record<string, unknown> = {}) {
  mockedFetch.mockImplementation((url: string) => {
    const key = String(url);
    const route = (suffix: string) => key.includes(suffix);
    if (route('/api/portal/documents/upload')) {
      const hit = over.upload ?? { ok: true, json: async () => ({}) };
      if (hit instanceof Error) return Promise.reject(hit);
      return Promise.resolve(hit as Response);
    }
    if (route('/api/portal/documents')) {
      const hit = over.list ?? { ok: true, json: async () => DOCS };
      if (hit instanceof Error) return Promise.reject(hit);
      return Promise.resolve(hit as Response);
    }
    return Promise.reject(new Error('beklenmeyen url: ' + key));
  });
}

async function openUploadModal() {
  render(<PortalDocumentsPage />);
  await screen.findByText('Vekaletname');
  fireEvent.click(screen.getByRole('button', { name: /Belge Yükle/i }));
  await screen.findByPlaceholderText('Belge başlığı');

  fireEvent.change(screen.getByPlaceholderText('Belge başlığı'), { target: { value: 'Kimlik' } });
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['x'], 'kimlik.pdf', { type: 'application/pdf' });
  fireEvent.change(fileInput, { target: { files: [file] } });
  return screen.getByRole('button', { name: 'Yükle' });
}

let unhandled: unknown[] = [];
const onUnhandled = (e: PromiseRejectionEvent) => {
  unhandled.push(e.reason);
  e.preventDefault();
};

beforeEach(() => {
  mockedFetch.mockReset();
  primeFetch();
  globalThis.fetch = mockedFetch as unknown as typeof fetch;
  localStorage.setItem('portal_token', 'test-token');
  unhandled = [];
  window.addEventListener('unhandledrejection', onUnhandled);
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 0));
  const unh = unhandled;
  window.removeEventListener('unhandledrejection', onUnhandled);
  cleanup();
  globalThis.fetch = realFetch;
  localStorage.clear();
  vi.restoreAllMocks();
  expect(unh).toHaveLength(0);
});

const uploadCalls = () =>
  mockedFetch.mock.calls.filter(([u]) => String(u).includes('/upload')).length;

describe('portal#handleUpload', () => {
  it('success → POST /upload + modal kapanir + liste sunucudan yeniden okunur', async () => {
    const btn = await openUploadModal();
    const listBefore = mockedFetch.mock.calls.filter(([u]) => !String(u).includes('/upload')).length;
    fireEvent.click(btn);

    await waitFor(() => expect(uploadCalls()).toBe(1));
    const [, init] = mockedFetch.mock.calls.find(([u]) => String(u).includes('/upload'))!;
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).body).toBeInstanceOf(FormData);

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Yükle' })).toBeNull());
    expect(
      mockedFetch.mock.calls.filter(([u]) => !String(u).includes('/upload')).length,
    ).toBeGreaterThan(listBefore);
  });

  it('backend hata (!ok) → sunucu mesaji GORUNUR; modal ACIK, form KORUNUR', async () => {
    primeFetch({
      upload: { ok: false, status: 400, json: async () => ({ message: 'Dosya çok büyük.' }) },
    });
    const btn = await openUploadModal();
    fireEvent.click(btn);

    await screen.findAllByText(/Dosya çok büyük/i);
    expect(screen.getByRole('button', { name: 'Yükle' })).toBeTruthy();
    expect((screen.getByPlaceholderText('Belge başlığı') as HTMLInputElement).value).toBe('Kimlik');
    expect(uploadCalls()).toBe(1);
  });

  it('network hatasi → GORUNUR; sessiz console.error YOK', async () => {
    primeFetch({ upload: new TypeError('Failed to fetch') });
    const btn = await openUploadModal();
    fireEvent.click(btn);
    await screen.findAllByText(/Sunucuya ulaşılamadı/i);
    expect(screen.getByRole('button', { name: 'Yükle' })).toBeTruthy();
  });

  it('AYNI-TICK cift tik → TEK POST (gercek yaris)', async () => {
    let release!: (v: unknown) => void;
    primeFetch({ upload: undefined });
    mockedFetch.mockImplementation((url: string) => {
      if (String(url).includes('/upload')) return new Promise((res) => { release = res; });
      return Promise.resolve({ ok: true, json: async () => DOCS } as unknown as Response);
    });
    const btn = await openUploadModal();

    act(() => {
      btn.click();
      btn.click();
    });
    await Promise.resolve();
    expect(uploadCalls()).toBe(1);

    await act(async () => {
      release({ ok: true, json: async () => ({}) });
    });
  });

  it('mutation OK + reload FAIL → SUCCESS_STALE; modal KAPALI, yeniden gonderim YOK', async () => {
    const btn = await openUploadModal();
    primeFetch({ list: new TypeError('Failed to fetch') });
    fireEvent.click(btn);

    await screen.findByTestId('stale-notice');
    expect(screen.queryByRole('button', { name: 'Yükle' })).toBeNull();
    expect(uploadCalls()).toBe(1);

    // refresh-only: mutation CAGRILMAZ
    primeFetch();
    fireEvent.click(screen.getByTestId('stale-refresh'));
    await waitFor(() => expect(screen.queryByTestId('stale-notice')).toBeNull());
    expect(uploadCalls()).toBe(1);
  });

  it('malformed liste yaniti EMPTY sayilmaz → gorunur load error', async () => {
    primeFetch({ list: { ok: true, json: async () => ({ not: 'array' }) } });
    render(<PortalDocumentsPage />);
    await screen.findByText(/Belgeler yüklenemedi/i);
  });

  it('kaynakta bos catch YOK; sessiz res.ok dallanmasi KALMADI', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'page.tsx'), 'utf8');
    const fn = src.slice(src.indexOf('const handleUpload'), src.indexOf('const handleDownload'));
    expect(fn).not.toMatch(/catch\s*\([^)]*\)\s*\{\s*\}/);
    expect(fn).not.toMatch(/console\.error/);
  });
});
