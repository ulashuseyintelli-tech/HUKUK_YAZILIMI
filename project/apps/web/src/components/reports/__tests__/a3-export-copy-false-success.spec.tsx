import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { PdfExportModal } from '../pdf-export';
import { CaseCopyModal } from '@/components/case/case-copy-modal';
import { api } from '@/lib/api';

/**
 * WSMR-A3a — HATA YOLUNDA BAŞARI YAN ETKİSİ.
 *
 * İki yüzey, işlem BAŞARISIZ olduğu halde "oldu" gösteriyordu:
 *  - `pdf-export`     : `// Demo: Show success anyway` → "PDF Oluşturuldu!" + modal kapanışı.
 *  - `case-copy-modal`: `setNewCaseId('demo-new-case')` → OLMAYAN dosya kimliği + "Kopyalandı!".
 *
 * Kural: işlem başarısızsa hiçbir başarı yan etkisi çalışmaz; hata görünür olur.
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const mocked = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('PdfExportModal', () => {
  const open = () =>
    render(<PdfExportModal isOpen onClose={vi.fn()} reportType="case-summary" />);

  it('export FAILURE: "PDF Oluşturuldu" DEMEZ, görünür hata verir', async () => {
    mocked.get.mockRejectedValue(new Error('export down'));
    const onClose = vi.fn();
    render(<PdfExportModal isOpen onClose={onClose} reportType="case-summary" />);

    fireEvent.click(screen.getByRole('button', { name: /PDF Oluştur/i }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('PDF Oluşturuldu!')).toBeNull();
    expect(screen.queryByText(/İndirme başladı/)).toBeNull();
    // Başarı yan etkisi: modal KAPANMAZ.
    await waitFor(() => expect(onClose).not.toHaveBeenCalled());
  });

  it('export SUCCESS: gerçek başarı gösterilir', async () => {
    mocked.get.mockResolvedValue({ data: new Blob(['pdf']) });
    global.URL.createObjectURL = vi.fn(() => 'blob:x');
    global.URL.revokeObjectURL = vi.fn();
    open();

    fireEvent.click(screen.getByRole('button', { name: /PDF Oluştur/i }));

    expect(await screen.findByText('PDF Oluşturuldu!')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('CaseCopyModal', () => {
  it('copy FAILURE: sahte dosya kimliği ÜRETMEZ, "Kopyalandı" demez', async () => {
    mocked.post.mockRejectedValue(new Error('copy down'));
    const onCopied = vi.fn();
    render(
      <CaseCopyModal
        isOpen
        onClose={vi.fn()}
        sourceCaseId="c1"
        sourceCaseNumber="2026/1"
        onCopied={onCopied}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Kopyala/i }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Kopyalandı!')).toBeNull();
    // Uydurma kimlik ekrana GELMEZ ve callback ATEŞLENMEZ.
    expect(screen.queryByText(/demo-new-case/)).toBeNull();
    expect(screen.queryByRole('link', { name: /Yeni Dosyaya Git/ })).toBeNull();
    await waitFor(() => expect(onCopied).not.toHaveBeenCalled());
  });

  it('copy SUCCESS: gerçek kimlikle başarı gösterilir', async () => {
    mocked.post.mockResolvedValue({ data: { data: { id: 'gercek-id' } } });
    render(
      <CaseCopyModal isOpen onClose={vi.fn()} sourceCaseId="c1" sourceCaseNumber="2026/1" />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Kopyala/i }));

    expect(await screen.findByText('Kopyalandı!')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
