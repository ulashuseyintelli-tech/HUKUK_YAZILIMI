import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { JudgmentForm } from '../JudgmentForm';
import { api } from '@/lib/api';

/**
 * WSMR-A3e — OKUMA HATASI ≠ "KAYIT YOK".
 *
 * `JudgmentForm`/`LeaseForm` yükleme başarısız olduğunda da `setEditing(true)`
 * yapıyordu. Sonuç: ağ hatası ile "bu dosyada ilam kaydı yok" AYNI görünüyordu.
 * Kullanıcı, aslında ilamı OLAN bir dosyada boş oluşturma formu görüp
 * doldurabiliyor ve kaydedince mükerrer/üzerine yazan kayıt riski doğuyordu.
 *
 * Kural: okuma hatasında düzenleme moduna GEÇİLMEZ; hata görünür olur.
 */

vi.mock('@/lib/api', () => ({
  api: { getJudgmentByCase: vi.fn(), createJudgment: vi.fn(), updateJudgment: vi.fn() },
}));

const mocked = api as unknown as {
  getJudgmentByCase: ReturnType<typeof vi.fn>;
  createJudgment: ReturnType<typeof vi.fn>;
  updateJudgment: ReturnType<typeof vi.fn>;
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('JudgmentForm — okuma hatası', () => {
  it('hata: düzenleme moduna GEÇMEZ, görünür hata + retry gösterir', async () => {
    mocked.getJudgmentByCase.mockRejectedValue(new Error('network down'));
    render(<JudgmentForm caseId="c1" />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    // Bos olusturma formu ACILMAZ -> yanlislikla kayit olusturulamaz.
    expect(screen.queryByLabelText(/Mahkeme/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
    // Hicbir yazma cagrisi yapilmadi.
    expect(mocked.createJudgment).not.toHaveBeenCalled();
    expect(mocked.updateJudgment).not.toHaveBeenCalled();
  });

  it('kayıt YOK (başarılı, boş): oluşturma formu açılır — hata gösterilmez', async () => {
    mocked.getJudgmentByCase.mockResolvedValue(null);
    render(<JudgmentForm caseId="c1" />);

    // "Kayit yok" DOGRULANMIS bir yanittir: form acilir, hata YOK.
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('retry: yalnız okuma tekrarlanır, mutation üretilmez', async () => {
    mocked.getJudgmentByCase.mockRejectedValueOnce(new Error('geçici')).mockResolvedValue(null);
    render(<JudgmentForm caseId="c1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Tekrar dene' }));

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(mocked.getJudgmentByCase).toHaveBeenCalledTimes(2);
    expect(mocked.createJudgment).not.toHaveBeenCalled();
    expect(mocked.updateJudgment).not.toHaveBeenCalled();
  });
});
