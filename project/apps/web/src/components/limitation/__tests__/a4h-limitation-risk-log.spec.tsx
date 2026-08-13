import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { LimitationWarningModal, type LimitationCheckResult } from '../LimitationWarningModal';

/**
 * WSMR-A4h — ZAMANAŞIMI RİSK ONAYININ DENETİM İZİ.
 *
 * `/api/limitation-engine/log-risk` kaydı, avukatın zamanaşımı uyarısını görüp
 * riski üstlenerek devam ettiğini belgeler. Eski hâlde bu kayıt İKİ ayrı yoldan
 * sessizce kayboluyordu:
 *   1. `fetch` yanıtı HİÇ kontrol edilmiyordu — 403/500 dönse bile başarı
 *      sayılıp `onProceed()` çalışıyordu (`fetch` yalnız ağ hatasında reject eder).
 *   2. Ağ hatası catch'e düşünce yine `onProceed()` çağrılıyordu.
 *
 * Sonuç: kayıt yokken takip başlatılıyor, sonradan "uyarıldı mı" sorusunun
 * cevabı bulunamıyordu.
 *
 * Politika DEĞİŞMEDİ: devam etme yetkisi hâlâ kullanıcıdadır. Değişen tek şey,
 * kaydın yazılamadığının GÖRÜNÜR olması ve devamın AÇIK ikinci bir karar olması.
 */

const RESULT: LimitationCheckResult = {
  status: {
    level: 'RED',
    ruleCode: 'TBK_146',
    ruleName: 'Genel zamanaşımı',
    expiryDate: '2025-01-01',
    daysLeft: -120,
    years: 10,
    baseStartDate: '2015-01-01',
    legalBasis: 'TBK m.146',
    message: 'Zamanaşımı dolmuş görünüyor.',
  },
  shouldShowModal: true,
  modalType: 'RED',
  modalTitle: 'Zamanaşımı Uyarısı',
  modalMessage: 'Bu alacakta zamanaşımı dolmuş olabilir.',
  suggestions: ['Zamanaşımı def’ini değerlendirin'],
};

let fetchMock: ReturnType<typeof vi.fn>;
let onProceed: ReturnType<typeof vi.fn<() => void>>;
let onClose: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  onProceed = vi.fn<() => void>();
  onClose = vi.fn<() => void>();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const renderModal = () =>
  render(
    <LimitationWarningModal isOpen onClose={onClose} onProceed={onProceed} result={RESULT} />,
  );

describe('Risk onayı — PROCEED', () => {
  it('HTTP hatasi: onProceed CAGRILMAZ, hata gorunur', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Devam Et' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onProceed).not.toHaveBeenCalled();
  });

  it('ag hatasi: onProceed CAGRILMAZ, hata gorunur', async () => {
    fetchMock.mockRejectedValue(new Error('Failed to fetch'));
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Devam Et' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onProceed).not.toHaveBeenCalled();
  });

  it('kayit basarili: onProceed CAGRILIR, hata YOK', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Devam Et' }));

    await vi.waitFor(() => expect(onProceed).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('gonderilen govde ackAction=PROCEED tasir', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Devam Et' }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ ackAction: 'PROCEED', claimTypeCode: 'TBK_146', level: 'RED' });
  });
});

describe('Risk onayı — BACK', () => {
  it('HTTP hatasi: onClose CAGRILMAZ, hata gorunur', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Geri Dön' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('kayit basarili: onClose CAGRILIR', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Geri Dön' }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

describe('Kayıt yazılamadığında kullanıcı kararı', () => {
  it('"Tekrar dene" YALNIZ kaydi tekrar dener; basarida ilerler', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 }).mockResolvedValue({ ok: true });
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Devam Et' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Tekrar dene' }));

    await vi.waitFor(() => expect(onProceed).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('"Kayit olmadan devam et" ACIK ikinci karardir — yeni istek gonderilmez', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Devam Et' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Kayıt olmadan devam et' }));

    expect(onProceed).toHaveBeenCalledTimes(1);
    // Kullanici kaydin OLMADIGINI gorerek ilerledi; sahte bir kayit denemesi yapilmadi.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('"Kayit olmadan kapat" modali kapatir', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Devam Et' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Kayıt olmadan kapat' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hata bandi kaydin OLUSMAYACAGINI acikca soyler', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Devam Et' }));

    const band = await screen.findByRole('alert');
    expect(band.textContent).toMatch(/kayıt OLUŞMAZ/i);
  });
});
