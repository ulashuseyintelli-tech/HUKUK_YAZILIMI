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

/* ─────────────────────────────────────────────────────────────────────────────
   WSMR-A4i — OWNER'IN ZORUNLU KILDIGI DENETIM MATRISI.
   Her satir ayri ayri kanitlanir; hicbiri digerinin yerine gecmez.
   ───────────────────────────────────────────────────────────────────────────── */
describe('A4i — zorunlu denetim matrisi', () => {
  it('403 → onProceed 0 (500 ve network ile AYNI davranis)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Devam Et' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onProceed).not.toHaveBeenCalled();
  });

  it('2xx → onProceed TAM OLARAK BIR kez', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Devam Et' }));

    await vi.waitFor(() => expect(onProceed).toHaveBeenCalledTimes(1));
    // Ek bir gecikmeli cagri OLMADIGI da dogrulanir.
    await new Promise((r) => setTimeout(r, 20));
    expect(onProceed).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('HIZLI CIFT TIK → TEK audit cagrisi ve TEK proceed', async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    fetchMock.mockImplementation(() => new Promise((r) => { resolveFetch = r; }));
    renderModal();

    const btn = screen.getByRole('button', { name: 'Devam Et' });
    // AYNI TICK icinde iki tik: `isLoading` henuz re-render etmedi.
    fireEvent.click(btn);
    fireEvent.click(btn);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch({ ok: true });
    await vi.waitFor(() => expect(onProceed).toHaveBeenCalledTimes(1));
  });

  it('override OLMADAN modal kapatilirsa onProceed 0', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Devam Et' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Kayıt olmadan kapat' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onProceed).not.toHaveBeenCalled();
  });

  it('backdrop ile kapatma da onProceed URETMEZ', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const { container } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Devam Et' }));
    await screen.findByRole('alert');
    const backdrop = container.querySelector('.absolute.inset-0') as HTMLElement;
    fireEvent.click(backdrop);

    expect(onProceed).not.toHaveBeenCalled();
  });

  it('BAYAT hata yeni denemede TEMIZLENIR', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 }).mockResolvedValue({ ok: true });
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Devam Et' }));
    const band = await screen.findByRole('alert');
    expect(band).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));

    // ONCE sonucu bekle: band `setLogError(null)` ile SENKRON temizlendigi icin
    // yalniz band'i beklemek istegi beklemeden gecerdi (yanlis-yesil tuzagi).
    await vi.waitFor(() => expect(onProceed).toHaveBeenCalledTimes(1));
    // Basaridan sonra band KALMAZ; eski hata yeni sonucu golgelemez.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ILK onay tikligi IKINCI onayin yerine GECMEZ', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    renderModal();

    // Ilk tik: override dugmeleri HENUZ YOK.
    expect(screen.queryByRole('button', { name: 'Kayıt olmadan devam et' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Devam Et' }));
    await screen.findByRole('alert');

    // Override ANCAK hata gorunduKTEN SONRA ortaya cikar ve ayri bir tik ister.
    expect(onProceed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Kayıt olmadan devam et' }));
    expect(onProceed).toHaveBeenCalledTimes(1);
  });

  it('override YETKI URETMEZ — cagrilan callback ebeveynin onProceed I', async () => {
    // Modal kendi basina bir yetki kapisi acmaz: devam yetkisi ebeveynin verdigi
    // callback'tedir. Ebeveyn devam ettirmek istemiyorsa modali hic acmaz veya
    // onProceed'i kendi kuralina bagli tutar. Burada dogrulanan: override AYNI
    // callback'i cagirir, alternatif/gizli bir yol KULLANMAZ.
    fetchMock.mockResolvedValue({ ok: false, status: 403 });
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Devam Et' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Kayıt olmadan devam et' }));

    expect(onProceed).toHaveBeenCalledTimes(1);
    // Override sirasinda YENI bir audit istegi uydurulmaz.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
