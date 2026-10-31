import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { AccountCardLinkCard, ACCOUNT_CARD_LINK_TEXT } from '@/components/settings/account-card-link-card';
import { api } from '@/lib/api';

/**
 * F02 K-A1 B-1 (owner kararı 31.10.2026) — kişi kartı "Giriş Hesabı Bağlama" bloğu.
 *
 * Kanıtlanan sözleşme:
 *  1. Yalnız ADMIN görür; USER için hiçbir şey render edilmez (API çağrısı yok).
 *  2. Bağsız kart: adaylar GET unlinked-users'tan; seçim + buton → linkAccountToCard({ userId, lawyerId }) (personel için staffMemberId).
 *  3. Yanıt identityProofReady true / false → farklı metin (TCKN uyarısı); bağlandıktan sonra form kaybolur, durum metni gelir.
 *  4. Kart zaten bağlı (personUserId): adaylar ÇAĞRILMAZ, yalnız durum metni.
 *  5. Kaydedilmemiş form: seçim ve buton pasif, neden gösterilir.
 *  6. API hatası role=alert ile gösterilir; bağlı duruma geçilmez.
 */

let role: 'ADMIN' | 'USER' = 'ADMIN';
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u1', tenantId: 't1', role }, loading: false }),
}));
vi.mock('@/lib/api', () => ({
  api: { listUnlinkedAccounts: vi.fn(), linkAccountToCard: vi.fn() },
}));
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
const ROWS = [
  { id: 'ua', email: 'a@x.test', name: 'Ali', surname: 'Ak', role: 'USER', pendingInvite: false },
  { id: 'ub', email: 'b@x.test', name: 'Bora', surname: 'Bal', role: 'VIEWER', pendingInvite: true },
];

describe('F02 K-A1 B-1 — AccountCardLinkCard', () => {
  beforeEach(() => {
    role = 'ADMIN';
    Object.values(mocked).forEach((m) => m.mockReset());
    mocked.listUnlinkedAccounts.mockResolvedValue(ROWS);
    mocked.linkAccountToCard.mockResolvedValue({ userId: 'ua', cardType: 'LAWYER', cardId: 'l1', identityProofReady: true });
  });
  afterEach(() => cleanup());

  it('USER: hiçbir şey render edilmez, API çağrısı yok', () => {
    role = 'USER';
    render(<AccountCardLinkCard personType="lawyer" personId="l1" personUserId={null} formDirty={false} />);
    expect(screen.queryByTestId('account-card-link-card')).toBeNull();
    expect(mocked.listUnlinkedAccounts).not.toHaveBeenCalled();
  });

  it('ADMIN + bağsız avukat kartı: adaylar listelenir (bekleyen davet işaretli); seçim + buton → linkAccountToCard({ userId, lawyerId }); kanıt hazır metni; form kapanır', async () => {
    const onLinked = vi.fn();
    render(<AccountCardLinkCard personType="lawyer" personId="l1" personUserId={null} formDirty={false} onLinked={onLinked} />);
    await waitFor(() => expect(mocked.listUnlinkedAccounts).toHaveBeenCalledTimes(1));
    const select = (await screen.findByTestId('account-card-link-select')) as HTMLSelectElement;
    await waitFor(() => expect(select.disabled).toBe(false));
    expect(select.options.length).toBe(3);
    expect(select.options[2].text).toContain(ACCOUNT_CARD_LINK_TEXT.pending);
    const button = screen.getByTestId('account-card-link-button') as HTMLButtonElement;
    expect(button.disabled).toBe(true); // seçim yok
    fireEvent.change(select, { target: { value: 'ua' } });
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(mocked.linkAccountToCard).toHaveBeenCalledWith({ userId: 'ua', lawyerId: 'l1' }));
    expect(await screen.findByTestId('account-card-link-toast')).toHaveTextContent(ACCOUNT_CARD_LINK_TEXT.readyTrue);
    expect(screen.getByTestId('account-card-link-linked')).toBeTruthy();
    expect(screen.queryByTestId('account-card-link-select')).toBeNull();
    expect(onLinked).toHaveBeenCalledWith(expect.objectContaining({ userId: 'ua', cardType: 'LAWYER' }));
    expect(screen.getByText(/parolası değişmez; e-posta gönderilmez/i)).toBeTruthy();
  });

  it('personel kartı: staffMemberId gönderilir; identityProofReady false → TCKN uyarısı', async () => {
    mocked.linkAccountToCard.mockResolvedValue({ userId: 'ub', cardType: 'STAFF', cardId: 's1', identityProofReady: false });
    render(<AccountCardLinkCard personType="staff" personId="s1" personUserId={null} formDirty={false} />);
    const select = (await screen.findByTestId('account-card-link-select')) as HTMLSelectElement;
    await waitFor(() => expect(select.disabled).toBe(false));
    fireEvent.change(select, { target: { value: 'ub' } });
    fireEvent.click(screen.getByTestId('account-card-link-button'));
    await waitFor(() => expect(mocked.linkAccountToCard).toHaveBeenCalledWith({ userId: 'ub', staffMemberId: 's1' }));
    expect(await screen.findByTestId('account-card-link-toast')).toHaveTextContent(ACCOUNT_CARD_LINK_TEXT.readyFalse);
  });

  it('kart zaten bağlı (personUserId): adaylar çağrılmaz, yalnız durum metni', async () => {
    render(<AccountCardLinkCard personType="lawyer" personId="l1" personUserId="u9" formDirty={false} />);
    expect(await screen.findByTestId('account-card-link-linked')).toHaveTextContent(ACCOUNT_CARD_LINK_TEXT.linked);
    expect(screen.queryByTestId('account-card-link-select')).toBeNull();
    expect(mocked.listUnlinkedAccounts).not.toHaveBeenCalled();
  });

  it('kaydedilmemiş form: seçim ve buton pasif, neden gösterilir', async () => {
    render(<AccountCardLinkCard personType="lawyer" personId="l1" personUserId={null} formDirty={true} />);
    const select = (await screen.findByTestId('account-card-link-select')) as HTMLSelectElement;
    await waitFor(() => expect(mocked.listUnlinkedAccounts).toHaveBeenCalled());
    expect(select.disabled).toBe(true);
    expect((screen.getByTestId('account-card-link-button') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('account-card-link-disabled-reason')).toHaveTextContent(ACCOUNT_CARD_LINK_TEXT.dirty);
  });

  it('API hatası: role=alert mesajı; bağlı duruma GEÇİLMEZ', async () => {
    mocked.linkAccountToCard.mockRejectedValue({ body: { message: 'Bu avukat kartı zaten bir hesaba bağlı' } });
    render(<AccountCardLinkCard personType="lawyer" personId="l1" personUserId={null} formDirty={false} />);
    const select = (await screen.findByTestId('account-card-link-select')) as HTMLSelectElement;
    await waitFor(() => expect(select.disabled).toBe(false));
    fireEvent.change(select, { target: { value: 'ua' } });
    fireEvent.click(screen.getByTestId('account-card-link-button'));
    expect(await screen.findByRole('alert')).toHaveTextContent('zaten bir hesaba bağlı');
    expect(screen.queryByTestId('account-card-link-linked')).toBeNull();
  });

  it('aday yok: boş-liste metni; buton pasif', async () => {
    mocked.listUnlinkedAccounts.mockResolvedValue([]);
    render(<AccountCardLinkCard personType="lawyer" personId="l1" personUserId={null} formDirty={false} />);
    const select = (await screen.findByTestId('account-card-link-select')) as HTMLSelectElement;
    await waitFor(() => expect(select.options[0].text).toBe(ACCOUNT_CARD_LINK_TEXT.empty));
    expect((screen.getByTestId('account-card-link-button') as HTMLButtonElement).disabled).toBe(true);
  });
});
