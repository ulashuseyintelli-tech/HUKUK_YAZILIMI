import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PoaCaseLinks } from '../PoaCaseLinks';
import { api, type PoaCaseCandidatesResult, type PoaCaseLinksResult } from '@/lib/api';
import { buildApiHttpError } from '@/lib/api-error';

vi.mock('@/lib/api', () => ({ api: {
  getPoaCaseLinks: vi.fn(), getPoaCaseCandidates: vi.fn(), linkPoaCase: vi.fn(), unlinkPoaCase: vi.fn(),
} }));
const mocked = vi.mocked(api);
const stamp = '2026-11-15T10:00:00.000Z';
const updatedStamp = '2026-11-15T11:00:00.000Z';
const link = { caseId: 'case-1', fileNumber: '2026/101', sourcePoaUpdatedAt: stamp, sourceChanged: false };
const candidate = { caseId: 'case-2', fileNumber: '2026/202' };
const list = (data = [link], canManageLinks = true): PoaCaseLinksResult => ({ data, poaUpdatedAt: stamp, visibility: 'AUTHORIZED_CASES_ONLY', canManageLinks });
const page = (data = [candidate], number = 1, total = data.length): PoaCaseCandidatesResult => ({ data, pagination: { page: number, limit: 20, total, totalPages: Math.ceil(total / 20) } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function open(clientId = 'client-1', poaId = 'poa-1') { return render(<PoaCaseLinks clientId={clientId} poaId={poaId} />); }
async function showPicker() { fireEvent.click(await screen.findByRole('button', { name: 'Mevcut dosyaya bağla' })); }

beforeEach(() => {
  mocked.getPoaCaseLinks.mockReset().mockResolvedValue(list());
  mocked.getPoaCaseCandidates.mockReset().mockResolvedValue(page());
  mocked.linkPoaCase.mockReset().mockResolvedValue({ caseId: candidate.caseId, linked: true, changed: true, sourcePoaUpdatedAt: stamp });
  mocked.unlinkPoaCase.mockReset().mockResolvedValue({ caseId: link.caseId, linked: false, changed: true, sourcePoaUpdatedAt: stamp });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('POA Case links — bounded authorized subset and single-case changes', () => {
  it('does not present loading or an unavailable read as an empty list', async () => {
    const pending = deferred<PoaCaseLinksResult>(); mocked.getPoaCaseLinks.mockReturnValueOnce(pending.promise);
    open(); expect(screen.getByRole('status')).toHaveTextContent('yükleniyor');
    expect(screen.queryByText('Bu görünümde dosya bağlantısı bulunmuyor.')).toBeNull();
    await act(async () => pending.resolve(list()));
    expect(await screen.findByText(link.fileNumber!)).toBeInTheDocument();
    expect(mocked.getPoaCaseCandidates).not.toHaveBeenCalled();
  });

  it('labels the authorized subset without presenting a legal authority result', async () => {
    open(); await screen.findByText(link.fileNumber!);
    expect(screen.getByText(/Yalnız görüntüleme yetkinizin bulunduğu/)).toHaveTextContent('işlem yetkisi veya hukuki kapsam uygunluğu değildir');
    expect(screen.queryByText(/Vekalet geçerli|İşlem yapılabilir/)).toBeNull();
  });

  it.each([403, 404, 500])('shows a failed read (%s) without a no-links claim or enabled writer', async status => {
    mocked.getPoaCaseLinks.mockRejectedValueOnce(buildApiHttpError({ message: 'PRIVATE internal diagnostic' }, status));
    open(); const error = await screen.findByRole('alert'); expect(error).not.toHaveTextContent('PRIVATE');
    expect(screen.queryByText('Bu görünümde dosya bağlantısı bulunmuyor.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mevcut dosyaya bağla' })).toBeNull();
    expect(mocked.linkPoaCase).not.toHaveBeenCalled(); expect(mocked.getPoaCaseCandidates).not.toHaveBeenCalled();
  });

  it('rejects a malformed list instead of treating missing data as an empty authorized result', async () => {
    mocked.getPoaCaseLinks.mockResolvedValueOnce({ data: [], poaUpdatedAt: stamp } as PoaCaseLinksResult);
    open(); await screen.findByRole('alert');
    expect(screen.queryByText('Bu görünümde dosya bağlantısı bulunmuyor.')).toBeNull();
  });

  it('uses the server canManageLinks boundary and never fetches candidates for a read-only actor', async () => {
    mocked.getPoaCaseLinks.mockResolvedValueOnce(list([link], false));
    open(); await screen.findByText(link.fileNumber!);
    expect(screen.getByText('Dosya bağlantılarını değiştirme yetkiniz yok.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /bağlantısını kaldır|Mevcut dosyaya bağla/ })).toBeNull();
    expect(mocked.getPoaCaseCandidates).not.toHaveBeenCalled();
  });

  it('keeps sourceChanged visible without silently relinking or accepting scope', async () => {
    mocked.getPoaCaseLinks.mockResolvedValueOnce(list([{ ...link, sourceChanged: true }]));
    open(); await screen.findByText('Vekalet kaynağı değişti; bu bağlantı yeniden gözden geçirilmelidir.');
    expect(mocked.linkPoaCase).not.toHaveBeenCalled(); expect(mocked.unlinkPoaCase).not.toHaveBeenCalled();
  });

  it('adds only the selected existing Case using the server source version, then refreshes without replacing the list wholesale', async () => {
    mocked.getPoaCaseLinks.mockResolvedValueOnce(list()).mockResolvedValueOnce(list([link, { ...candidate, sourcePoaUpdatedAt: stamp, sourceChanged: false }]));
    open(); await showPicker(); fireEvent.click(await screen.findByRole('button', { name: `${candidate.fileNumber} dosyasını bağla` }));
    expect(await screen.findByText('Dosya bağlantısı kaydedildi; işlem kapsamı ayrıca değerlendirilir.')).toBeInTheDocument();
    await waitFor(() => expect(mocked.getPoaCaseLinks).toHaveBeenCalledTimes(2));
    expect(mocked.linkPoaCase).toHaveBeenCalledTimes(1);
    expect(mocked.linkPoaCase).toHaveBeenCalledWith('poa-1', candidate.caseId, { expectedPoaUpdatedAt: stamp });
    expect(await screen.findByText(link.fileNumber!)).toBeInTheDocument();
    expect(await screen.findByText(candidate.fileNumber!)).toBeInTheDocument(); expect(mocked.unlinkPoaCase).not.toHaveBeenCalled();
  });

  it('removes only the selected visible link and keeps an authenticated empty subset distinct', async () => {
    mocked.getPoaCaseLinks.mockResolvedValueOnce(list()).mockResolvedValueOnce(list([]));
    open(); fireEvent.click(await screen.findByRole('button', { name: `${link.fileNumber} bağlantısını kaldır` }));
    await screen.findByText('Dosya bağlantısı kaldırıldı; vekalet kaydı ve geçmişi korunur.');
    expect(await screen.findByText('Bu görünümde dosya bağlantısı bulunmuyor.')).toBeInTheDocument();
    expect(mocked.unlinkPoaCase).toHaveBeenCalledTimes(1);
    expect(mocked.unlinkPoaCase).toHaveBeenCalledWith('poa-1', link.caseId, { expectedPoaUpdatedAt: stamp });
    expect(mocked.linkPoaCase).not.toHaveBeenCalled();
  });

  it('makes a 409 visible and prevents another write until a successful source refresh', async () => {
    mocked.linkPoaCase.mockRejectedValueOnce(buildApiHttpError({ message: 'PRIVATE' }, 409));
    open(); await showPicker(); fireEvent.click(await screen.findByRole('button', { name: `${candidate.fileNumber} dosyasını bağla` }));
    await screen.findByText('Vekalet kaynağı değişti. Bağlantıları yenileyip işlemi yeniden değerlendirin.');
    expect(screen.queryByText('Dosya bağlantısı kaydedildi; işlem kapsamı ayrıca değerlendirilir.')).toBeNull();
    expect(screen.getByRole('button', { name: `${link.fileNumber} bağlantısını kaldır` })).toBeDisabled();
    mocked.getPoaCaseLinks.mockResolvedValueOnce({ ...list(), poaUpdatedAt: updatedStamp });
    fireEvent.click(screen.getByRole('button', { name: 'Bağlantıları yenile' }));
    await waitFor(() => expect(screen.getByRole('button', { name: `${link.fileNumber} bağlantısını kaldır` })).toBeEnabled());
    expect(mocked.linkPoaCase).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['link', 403], ['unlink', 403], ['link', 404], ['unlink', 404],
  ] as const)('clears stale private rows and candidates after %s rejects with %s', async (action, status) => {
    const mutation = action === 'link' ? mocked.linkPoaCase : mocked.unlinkPoaCase;
    mutation.mockRejectedValueOnce(buildApiHttpError({ message: 'PRIVATE' }, status));
    open(); await showPicker(); await screen.findByText(candidate.fileNumber!);
    const button = screen.getByRole('button', { name: action === 'link' ? `${candidate.fileNumber} dosyasını bağla` : `${link.fileNumber} bağlantısını kaldır` });
    await act(async () => { fireEvent.click(button); });
    await screen.findByText(status === 403 ? 'Dosya bağlantılarını değiştirme yetkiniz yok.' : 'Vekalet veya dosya erişimi doğrulanamadı.');
    await waitFor(() => {
      expect(screen.queryByText(link.fileNumber!)).toBeNull();
      expect(screen.queryByText(candidate.fileNumber!)).toBeNull();
    });
    expect(screen.queryByText('Dosya bağlantısı kaydedildi; işlem kapsamı ayrıca değerlendirilir.')).toBeNull();
    expect(screen.queryByText('Dosya bağlantısı kaldırıldı; vekalet kaydı ve geçmişi korunur.')).toBeNull();
    expect(screen.queryByText('Bu görünümde dosya bağlantısı bulunmuyor.')).toBeNull();
    expect(screen.queryByText('Bu aramada görüntülenebilen dosya adayı yok.')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Dosya numarasıyla ara' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Bağlantıları yenile' })).toBeEnabled();
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(action === 'link' ? mocked.unlinkPoaCase : mocked.linkPoaCase).not.toHaveBeenCalled();
  });

  it('does not turn a successful mutation into failure or retry when its subsequent refresh fails', async () => {
    mocked.getPoaCaseLinks.mockResolvedValueOnce(list()).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    open(); fireEvent.click(await screen.findByRole('button', { name: `${link.fileNumber} bağlantısını kaldır` }));
    await screen.findByText('Dosya bağlantısı kaldırıldı; vekalet kaydı ve geçmişi korunur.');
    await screen.findByRole('alert'); expect(mocked.unlinkPoaCase).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: `${link.fileNumber} bağlantısını kaldır` })).toBeDisabled();
  });

  it('clears a formerly visible Case when its post-write read loses authorization', async () => {
    mocked.getPoaCaseLinks.mockResolvedValueOnce(list()).mockRejectedValueOnce(buildApiHttpError({ message: 'Denied' }, 403));
    open(); fireEvent.click(await screen.findByRole('button', { name: `${link.fileNumber} bağlantısını kaldır` }));
    await screen.findByText('Dosya bağlantılarını görüntüleme yetkiniz yok.');
    expect(screen.queryByText(link.fileNumber!)).toBeNull();
    expect(screen.queryByText('Bu görünümde dosya bağlantısı bulunmuyor.')).toBeNull();
  });

  it('locks same-tick duplicate writes while the first mutation is pending', async () => {
    const pending = deferred<Awaited<ReturnType<typeof api.unlinkPoaCase>>>(); mocked.unlinkPoaCase.mockReturnValueOnce(pending.promise);
    mocked.getPoaCaseLinks.mockResolvedValueOnce(list()).mockResolvedValueOnce(list([]));
    open(); const button = await screen.findByRole('button', { name: `${link.fileNumber} bağlantısını kaldır` });
    act(() => { button.click(); button.click(); });
    expect(mocked.unlinkPoaCase).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ caseId: link.caseId, linked: false, changed: true, sourcePoaUpdatedAt: stamp }));
    await screen.findByText('Bu görünümde dosya bağlantısı bulunmuyor.');
    expect(mocked.unlinkPoaCase).toHaveBeenCalledTimes(1);
  });

  it('does not turn a failed candidate search into no candidates', async () => {
    mocked.getPoaCaseCandidates.mockRejectedValueOnce(buildApiHttpError({ message: 'PRIVATE' }, 403));
    open(); await showPicker(); await screen.findByRole('alert');
    expect(screen.queryByText('Bu aramada görüntülenebilen dosya adayı yok.')).toBeNull();
    expect(mocked.linkPoaCase).not.toHaveBeenCalled();
  });

  it('uses bounded pages and an explicit search rather than assuming the first candidate page is the whole set', async () => {
    mocked.getPoaCaseCandidates.mockResolvedValueOnce(page([candidate], 1, 21))
      .mockResolvedValueOnce(page([{ caseId: 'case-21', fileNumber: '2026/221' }], 2, 21))
      .mockResolvedValueOnce(page([]));
    open(); await showPicker(); await screen.findByText(candidate.fileNumber!);
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki sayfa' })); await screen.findByText('2026/221');
    expect(mocked.getPoaCaseCandidates).toHaveBeenNthCalledWith(2, 'poa-1', { page: 2, limit: 20, q: '' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Dosya numarasıyla ara' }), { target: { value: '  2026/777  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ara' })); await screen.findByText('Bu aramada görüntülenebilen dosya adayı yok.');
    expect(mocked.getPoaCaseCandidates).toHaveBeenLastCalledWith('poa-1', { page: 1, limit: 20, q: '2026/777' });
  });

  it.each(['client', 'poa'] as const)('clears the prior %s context immediately and ignores its late response', async context => {
    const old = deferred<PoaCaseLinksResult>(); mocked.getPoaCaseLinks.mockReturnValueOnce(old.promise).mockResolvedValueOnce(list([]));
    const view = open();
    view.rerender(<PoaCaseLinks clientId={context === 'client' ? 'client-2' : 'client-1'} poaId={context === 'poa' ? 'poa-2' : 'poa-1'} />);
    await screen.findByText('Bu görünümde dosya bağlantısı bulunmuyor.');
    await act(async () => old.resolve(list()));
    expect(screen.queryByText(link.fileNumber!)).toBeNull(); expect(mocked.linkPoaCase).not.toHaveBeenCalled();
  });

  it('ignores a late mutation result after switching to another POA', async () => {
    const old = deferred<Awaited<ReturnType<typeof api.unlinkPoaCase>>>(); mocked.unlinkPoaCase.mockReturnValueOnce(old.promise);
    const view = open(); fireEvent.click(await screen.findByRole('button', { name: `${link.fileNumber} bağlantısını kaldır` }));
    mocked.getPoaCaseLinks.mockResolvedValueOnce(list([]));
    view.rerender(<PoaCaseLinks clientId="client-1" poaId="poa-2" />);
    await screen.findByText('Bu görünümde dosya bağlantısı bulunmuyor.');
    await act(async () => old.resolve({ caseId: link.caseId, linked: false, changed: true, sourcePoaUpdatedAt: stamp }));
    expect(screen.queryByText('Dosya bağlantısı kaldırıldı; vekalet kaydı ve geçmişi korunur.')).toBeNull();
    expect(mocked.getPoaCaseLinks).toHaveBeenCalledTimes(2);
  });
});
