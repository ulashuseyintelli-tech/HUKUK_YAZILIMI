import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import IntakeSubmissionDetailPage from '../[id]/page';
import IntakePromotePage from '../[id]/promote/page';
import { api } from '@/lib/api';

/**
 * WSMR-A4j — OKUMA HATASI "KAYIT BULUNAMADI" DEĞİLDİR.
 *
 * Her iki intake sayfasında da `catch { setNotFound(true) }` vardı: ağ kesintisi,
 * 500, yetki hatası — hepsi ekranda **"Gönderim bulunamadı."** olarak görünüyordu.
 * VAR OLAN bir başvuru silinmiş gibi okunuyor, kullanıcı kuyruğa dönüp kaydı
 * aramaktan vazgeçebiliyordu.
 *
 * Ayrıca promote sayfasında borçlu listesi okuması `catch { setDebtors([]) }` ile
 * boşa düşüyor ve ekran **"Bu dosyada borçlu yok; aktarım yapılamaz."** diyordu —
 * okunamamış bir listeden çıkarılan KESİN bir olgu iddiası.
 */

vi.mock('@/lib/api', () => ({
  api: {
    getIntakeSubmission: vi.fn(),
    getCase: vi.fn(),
    getCaseDebtors: vi.fn(),
    claimIntakeSubmission: vi.fn(),
    rejectIntakeSubmission: vi.fn(),
    promoteSoftField: vi.fn(),
  },
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const mocked = api as unknown as {
  getIntakeSubmission: ReturnType<typeof vi.fn>;
  getCase: ReturnType<typeof vi.fn>;
  getCaseDebtors: ReturnType<typeof vi.fn>;
};

const SUB = {
  id: 'sub-1',
  caseId: 'case-1',
  status: 'IN_REVIEW',
  createdAt: '2026-08-01T10:00:00.000Z',
  fields: [],
};

/** Sunucunun DOGRULADIGI yokluk. */
const notFoundError = () => {
  const e = new Error('Kayıt yok') as Error & { status?: number };
  e.status = 404;
  return e;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getCase.mockResolvedValue({ fileNumber: '2026/123', client: { name: 'Ayşe Yılmaz' } });
  mocked.getCaseDebtors.mockResolvedValue({ items: [{ id: 'dbt-1', displayName: 'Mehmet Demir' }] });
});

afterEach(() => cleanup());

const params = { id: 'sub-1' };

describe('Intake detay — okuma hatası', () => {
  it('AG HATASI: "Gönderim bulunamadı" YAZILMAZ, gorunur hata cikar', async () => {
    mocked.getIntakeSubmission.mockRejectedValue(new Error('network down'));
    render(<IntakeSubmissionDetailPage params={params} />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Gönderim bulunamadı.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('500: yine hata — yokluk iddiasi URETILMEZ', async () => {
    const e = new Error('sunucu hatasi') as Error & { status?: number };
    e.status = 500;
    mocked.getIntakeSubmission.mockRejectedValue(e);
    render(<IntakeSubmissionDetailPage params={params} />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Gönderim bulunamadı.')).toBeNull();
  });

  it('404: SUNUCU dogrulamasi — "bulunamadi" DOGRU ve hata bandi YOK', async () => {
    mocked.getIntakeSubmission.mockRejectedValue(notFoundError());
    render(<IntakeSubmissionDetailPage params={params} />);

    expect(await screen.findByText('Gönderim bulunamadı.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retry: YALNIZ okuma tekrarlanir ve basarida icerik gelir', async () => {
    mocked.getIntakeSubmission
      .mockRejectedValueOnce(new Error('geçici'))
      .mockResolvedValue(SUB);
    render(<IntakeSubmissionDetailPage params={params} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Tekrar dene' }));

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(mocked.getIntakeSubmission).toHaveBeenCalledTimes(2);
  });
});

describe('Intake promote — okuma hatası', () => {
  it('AG HATASI: "Gönderim bulunamadı" YAZILMAZ', async () => {
    mocked.getIntakeSubmission.mockRejectedValue(new Error('network down'));
    render(<IntakePromotePage params={params} />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Gönderim bulunamadı.')).toBeNull();
  });

  it('404: "bulunamadi" DOGRU', async () => {
    mocked.getIntakeSubmission.mockRejectedValue(notFoundError());
    render(<IntakePromotePage params={params} />);

    expect(await screen.findByText('Gönderim bulunamadı.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('borclu listesi OKUNAMADI: "bu dosyada borclu yok" KESIN iddiasi URETILMEZ', async () => {
    mocked.getIntakeSubmission.mockResolvedValue(SUB);
    mocked.getCaseDebtors.mockRejectedValue(new Error('network down'));
    render(<IntakePromotePage params={params} />);

    const band = await screen.findByRole('alert');
    expect(band.textContent).toMatch(/Dosya borçluları yüklenemedi/i);
    expect(band.textContent).toMatch(/OLMADIĞI anlamına gelmez/i);
    expect(screen.queryByText('Bu dosyada borçlu yok; aktarım yapılamaz.')).toBeNull();
  });

  it('borclu listesi GERCEKTEN bos: kesin iddia DOGRU ve hata bandi YOK', async () => {
    mocked.getIntakeSubmission.mockResolvedValue(SUB);
    mocked.getCaseDebtors.mockResolvedValue({ items: [] });
    render(<IntakePromotePage params={params} />);

    expect(
      await screen.findByText('Bu dosyada borçlu yok; aktarım yapılamaz.'),
    ).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('borclu listesi basarili: secim kutusu gelir, hata YOK', async () => {
    mocked.getIntakeSubmission.mockResolvedValue(SUB);
    render(<IntakePromotePage params={params} />);

    expect(await screen.findByText('Mehmet Demir')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   `catch { setCaseLabel(d.caseId) }` — terminal sınıf:
   FALSE_POSITIVE_WITH_TESTED_RULE_REASON.

   Kural: bu dal UYDURMA İÇERİK ÜRETMEZ. Dostane etiket (`2026/123 · Ayşe Yılmaz`)
   üretilemediğinde yerine zaten elde bulunan GERÇEK `caseId` gösterilir — yani
   daha az okunabilir ama DOĞRU bir kimlik. Kullanıcıya yanlış bir dosya numarası
   veya var olmayan bir müvekkil adı gösterilmez ve link yine doğru dosyaya gider.

   Aşağıdaki testler bu kuralı DAVRANIŞSAL olarak kilitler: biri ileride buraya
   uydurma bir etiket koyarsa test kırılır.

   WSMR-A4-AA (Aday 3) re-adjudication: owner "iki ayrı davranış testiyle kanıtla —
   yanlış etiket/boş değer/yanlış navigasyon oluşmadığını" talep etti. Üç iddia da
   AŞAĞIDA ayrı ayrı assert edilir (yanlış etiket YOK, `label.textContent` boş
   DEĞİL tam `case-1`, `href` HER ZAMAN gerçek caseId'e gider — caseLabel'e değil).
   ───────────────────────────────────────────────────────────────────────────── */
describe('Dosya etiketi — okunamayınca gerçek kimliğe düşer', () => {
  it('getCase HATASI: uydurma dosya no / muvekkil adi GOSTERILMEZ', async () => {
    mocked.getIntakeSubmission.mockResolvedValue(SUB);
    mocked.getCase.mockRejectedValue(new Error('network down'));
    render(<IntakeSubmissionDetailPage params={params} />);

    // Gercek caseId gorunur...
    const label = await screen.findByText('case-1');
    expect(label.textContent).toBe('case-1'); // BOS DEGER degil — tam ve dogru metin.
    // ...uydurma bir dosya numarasi veya isim ASLA basilmaz.
    expect(screen.queryByText(/2026\/123/)).toBeNull();
    expect(screen.queryByText(/Ayşe Yılmaz/)).toBeNull();
    // YANLIS NAVIGASYON olusmaz: link hedefi caseLabel'e degil, HER ZAMAN gercek
    // sub.caseId'e baglidir (enrichment sonucundan bagimsiz).
    expect((label.closest('a') as HTMLAnchorElement).getAttribute('href')).toBe('/cases/case-1');
  });

  it('getCase HATASI sayfayi hataya DUSURMEZ (kozmetik degradasyon)', async () => {
    mocked.getIntakeSubmission.mockResolvedValue(SUB);
    mocked.getCase.mockRejectedValue(new Error('network down'));
    render(<IntakeSubmissionDetailPage params={params} />);

    await screen.findByText('case-1');
    // Bu dal bir OKUMA HATASI bandi gerektirmez: gosterilen kimlik DOGRU.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Gönderim bulunamadı.')).toBeNull();
  });

  it('getCase BASARILI: dostane etiket gosterilir', async () => {
    mocked.getIntakeSubmission.mockResolvedValue(SUB);
    render(<IntakeSubmissionDetailPage params={params} />);

    expect(await screen.findByText(/2026\/123 · Ayşe Yılmaz/)).toBeTruthy();
  });

  it('promote sayfasinda da ayni kural gecerli', async () => {
    mocked.getIntakeSubmission.mockResolvedValue(SUB);
    mocked.getCase.mockRejectedValue(new Error('network down'));
    render(<IntakePromotePage params={params} />);

    const label = await screen.findByText('case-1');
    expect(label.textContent).toBe('case-1'); // BOS DEGER degil.
    expect(screen.queryByText(/2026\/123/)).toBeNull();
    expect(screen.queryByText(/Ayşe Yılmaz/)).toBeNull();
    // YANLIS NAVIGASYON olusmaz: link hedefi HER ZAMAN gercek sub.caseId'e baglidir.
    expect((label.closest('a') as HTMLAnchorElement).getAttribute('href')).toBe('/cases/case-1');
  });
});
