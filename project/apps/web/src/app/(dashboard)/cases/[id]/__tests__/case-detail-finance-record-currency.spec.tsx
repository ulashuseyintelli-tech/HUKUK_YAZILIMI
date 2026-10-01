import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CaseDetailPage from '../page';
import { api } from '@/lib/api';

/**
 * DOSYA ÇALIŞMA ALANI — "Alacak Kalemleri" / "Ödemeler" BLOĞU TUTARI KAYDIN KENDİ PARA BİRİMİYLE YAZAR.
 *
 * Kusur (gerçek tarayıcıda ölçüldü, main 630184e2, yerel API + disposable PostgreSQL): blok her tutarı sabit "₺" ile
 * basıyor ve kalemleri para birimine bakmadan istemcide tek sayıda topluyordu.
 *  - USD dosya (10.000 USD + 250 USD, tahsilat 1.000 USD): "10.000 ₺ · 250 ₺ · Toplam 10.250 ₺", "+1.000 ₺"
 *  - Karma dosya (10.000 USD + 5.000 EUR + 2.000 TRY): "10.000 ₺ · 5.000 ₺ · 2.000 ₺ · Toplam 17.000 ₺"
 *  - Kalemsiz USD dosya: "Asıl Alacak 10.000 ₺"
 *
 * Kural (politika gerektirmeyen kısım; RECEIVABLE-GOVERNANCE REC-ALLOC-008, REC-FX-001/002): tutar kaydın kendi para
 * birimiyle yazılır, farklı para birimleri tek "Toplam"da birleştirilmez, tutar ÇEVRİLMEZ. TL dosyada gösterim aynen kalır.
 *
 * Kayıt biçimleri gerçek API yanıtından alınmıştır (GET /cases/:id/dues ve /collections): tutar Decimal → dize.
 */

vi.mock('@/lib/api', () => {
  const registry: Record<string, ReturnType<typeof vi.fn>> = {};
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (!(prop in registry)) registry[prop] = vi.fn().mockResolvedValue([]);
      return registry[prop];
    },
  };
  return { api: new Proxy({}, handler) };
});

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'case-1' }),
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/cases/case-1',
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u1', tenantId: 't1', role: 'ADMIN' }, loading: false }),
}));

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

type CaseFixture = { currency?: string; principalAmount?: string };
type DueFixture = { id: string; type: string; description?: string; amount: string; currency?: string; dueDate?: string };
type CollectionFixture = {
  id: string;
  type: string;
  amount: string;
  currency?: string;
  date: string;
  status: string;
  allocationHold?: { status: string; holdReason?: string | null } | null;
};

const caseRecord = (fields: CaseFixture) => ({
  id: 'case-1',
  fileNumber: '2026/1',
  debtors: [],
  caseClients: [],
  lawyers: [],
  claimItems: [],
  ...fields,
});

const due = (id: string, type: string, description: string, amount: string, currency?: string): DueFixture => ({
  id,
  type,
  description,
  amount,
  dueDate: '2026-01-15T00:00:00.000Z',
  ...(currency ? { currency } : {}),
});

const collection = (id: string, amount: string, currency?: string, extra: Partial<CollectionFixture> = {}): CollectionFixture => ({
  id,
  type: 'BANK_TRANSFER',
  amount,
  date: '2026-03-01T00:00:00.000Z',
  status: 'CONFIRMED',
  allocationHold: null,
  ...(currency ? { currency } : {}),
  ...extra,
});

/** Diğer yüzeylerin gerçek sözleşme varsayılanları (WSMR-A4n ile aynı gerekçe) + bu dosyanın kayıtları. */
function mountCase(input: { caseFields: CaseFixture; dues: DueFixture[]; collections: CollectionFixture[] }) {
  const loaded = caseRecord(input.caseFields);
  mocked.getCase.mockResolvedValue(loaded);
  mocked.getCaseDues.mockResolvedValue(input.dues);
  mocked.getCaseCollections.mockResolvedValue(input.collections);
  mocked.getCaseDebtors.mockResolvedValue({
    summary: { total: 0, delivered: 0, pending: 0, returned: 0, danger: 0 },
    items: [],
  });
  mocked.getAddressTasksForCase.mockResolvedValue({ tasks: [] });
  mocked.getAddressNotesForCase.mockResolvedValue({ notes: [] });
  mocked.getActiveCaseFeeAgreement.mockResolvedValue(null);
  mocked.getCollectionDispositionsByCase.mockResolvedValue([]);
  mocked.getCaseResponsibilityAt.mockResolvedValue({
    caseId: loaded.id,
    asOf: new Date().toISOString(),
    operationOwner: { type: 'NONE', id: null, confidence: 'EVENT_CONFIRMED' },
    legalResponsibleLawyer: { lawyerId: null, confidence: 'EVENT_CONFIRMED' },
    horizon: {},
  });
  mocked.getCaseResponsibilityHistory.mockResolvedValue({ caseId: loaded.id, from: null, to: null, events: [], horizon: {} });

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CaseDetailPage />
    </QueryClientProvider>,
  );
}

/**
 * Başlığı verilen kutunun ekrana yazdığı satırlar (yerel saat dilimine bağlı tarih satırları hariç).
 * İç içe yazılan açıklama, içinde durduğu satırın metnine dahildir (ayrı satır sayılmaz).
 * Kutu bulunamazsa hata fırlatır — boş liste "bakıldı ve boştu" anlamına gelir, "bulunamadı" değil.
 */
function boxLines(title: 'Alacak Kalemleri' | 'Ödemeler'): string[] {
  const heading = screen.getByText(title, { selector: 'h4' });
  const box = heading.parentElement?.parentElement?.children[1];
  if (!box) throw new Error(`"${title}" kutusu bulunamadı`);
  return Array.from(box.querySelectorAll('span, p'))
    .filter((el) => !el.parentElement?.closest('span, p'))
    .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter((text) => text !== '' && !text.startsWith('Vade: ') && !/^\d{2}\.\d{2}\.\d{4}$/.test(text));
}

// Tam paralel regresyonda sayfa render'ı CPU rekabetine girer (bkz. a4w spec) — bekleme süresi geniş tutulur.
// Test süresi beklemeden UZUN olmalı: aksi halde düşen iddia "beklenen / ekrandaki" farkı yerine zaman aşımı yazar.
const WAIT = { timeout: 8_000 };
vi.setConfig({ testTimeout: 20_000 });
const expectBox = (title: 'Alacak Kalemleri' | 'Ödemeler', lines: string[]) =>
  waitFor(() => expect(boxLines(title)).toEqual(lines), WAIT);

beforeEach(() => {
  vi.clearAllMocks();
  // Sayfanın alt bileşenleri (ör. hesap özeti) kendi istemcisiyle ağa çıkar. Test yerelde çalışan bir API'ye istek
  // atmasın diye yanıt hiç dönmez: o bileşenler "yükleniyor" durumunda kalır; bu test onları ölçmez.
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('USD dosya — tutar kaydın kendi para birimiyle', () => {
  it('kalem satırları ve Toplam USD ile yazılır; "₺" yazılmaz', async () => {
    mountCase({
      caseFields: { currency: 'USD', principalAmount: '10000' },
      dues: [due('d1', 'PRINCIPAL', 'Asıl alacak', '10000', 'USD'), due('d2', 'EXPENSE', 'Masraf', '250', 'USD')],
      collections: [],
    });

    await expectBox('Alacak Kalemleri', ['Asıl alacak', '10.000 USD', 'Masraf', '250 USD', 'Toplam', '10.250 USD']);
  });

  it('Ödemeler satırı tahsilatın kendi para birimiyle yazılır', async () => {
    mountCase({
      caseFields: { currency: 'USD', principalAmount: '10000' },
      dues: [due('d1', 'PRINCIPAL', 'Asıl alacak', '10000', 'USD')],
      collections: [collection('c1', '1000', 'USD')],
    });

    await expectBox('Ödemeler', ['Havale', 'Onaylandı', '+1.000 USD']);
  });

  it('mahsubu bekleyen tahsilat da kendi para birimiyle ve "+" olmadan yazılır', async () => {
    mountCase({
      caseFields: { currency: 'USD', principalAmount: '10000' },
      dues: [due('d1', 'PRINCIPAL', 'Asıl alacak', '10000', 'USD')],
      collections: [collection('c1', '1000', 'USD', { allocationHold: { status: 'HELD', holdReason: null } })],
    });

    await expectBox('Ödemeler', ['Havale', 'Mahsubu bekliyor (borçtan düşülmedi)', '1.000 USD']);
  });

  it('dosya para biriminden farklı para birimindeki tahsilat kaydı da KENDİ para birimiyle yazılır (dosyanınkiyle değil)', async () => {
    mountCase({
      caseFields: { currency: 'USD', principalAmount: '10000' },
      dues: [due('d1', 'PRINCIPAL', 'Asıl alacak', '10000', 'USD')],
      collections: [
        collection('c1', '1000', 'USD'),
        collection('c2', '500', 'EUR', { date: '2026-03-02T00:00:00.000Z' }),
        collection('c3', '750', 'TRY', { date: '2026-03-03T00:00:00.000Z' }),
      ],
    });

    await expectBox('Ödemeler', [
      'Havale',
      'Onaylandı',
      '+1.000 USD',
      'Havale',
      'Onaylandı',
      '+500 EUR',
      'Havale',
      'Onaylandı',
      '+750 ₺',
    ]);
  });

  it('kalemsiz dosyada "Asıl Alacak" dosyanın para birimiyle yazılır', async () => {
    mountCase({ caseFields: { currency: 'USD', principalAmount: '10000' }, dues: [], collections: [] });

    await expectBox('Alacak Kalemleri', ['Asıl Alacak', '10.000 USD']);
    await expectBox('Ödemeler', ['Henüz ödeme yok']);
  });
});

describe('Karma dosya — farklı para birimleri tek "Toplam"da birleştirilmez', () => {
  it('her kalem kendi para birimiyle; Toplam "gösterilemez" (17.000 yazılmaz, tutar çevrilmez)', async () => {
    mountCase({
      caseFields: { currency: 'USD', principalAmount: '10000' },
      dues: [
        due('d1', 'PRINCIPAL', 'Asıl alacak', '10000', 'USD'),
        due('d2', 'PRINCIPAL', 'Asıl alacak (EUR)', '5000', 'EUR'),
        due('d3', 'PRINCIPAL', 'Asıl alacak (TRY)', '2000', 'TRY'),
      ],
      collections: [],
    });

    await expectBox('Alacak Kalemleri', [
      'Asıl alacak',
      '10.000 USD',
      'Asıl alacak (EUR)',
      '5.000 EUR',
      'Asıl alacak (TRY)',
      '2.000 ₺',
      'Toplam (farklı para birimleri)',
      'gösterilemez',
    ]);
    expect(boxLines('Alacak Kalemleri').join(' | ')).not.toContain('17.000');
    // Neden ekranda: toplam satırı açıklamayı taşır
    expect(screen.getByTestId('dues-total-unavailable').closest('[title]')?.getAttribute('title')).toBe(
      'Kalemler birden fazla para biriminde; tutarlar çevrilmez ve tek toplamda birleştirilmez.',
    );
  });

  it('aynı para birimindeki kalemler (dosya para birimi farklı olsa da) tek Toplam ile o para biriminde yazılır', async () => {
    mountCase({
      caseFields: { currency: 'USD', principalAmount: '0' },
      dues: [due('d1', 'PRINCIPAL', 'Asıl alacak', '5000', 'EUR'), due('d2', 'EXPENSE', 'Masraf', '100.5', 'EUR')],
      collections: [],
    });

    await expectBox('Alacak Kalemleri', ['Asıl alacak', '5.000 EUR', 'Masraf', '100,5 EUR', 'Toplam', '5.100,5 EUR']);
    expect(screen.queryByTestId('dues-total-unavailable')).toBeNull();
  });
});

describe('TL dosya — gösterim DEĞİŞMEDİ (düzeltme öncesi ölçülen metinle birebir)', () => {
  it('kalem satırları, Toplam ve Ödemeler satırı "₺" ile, aynı biçimde', async () => {
    mountCase({
      caseFields: { currency: 'TRY', principalAmount: '10000' },
      dues: [due('d1', 'PRINCIPAL', 'Asıl alacak', '10000', 'TRY'), due('d2', 'EXPENSE', 'Masraf', '250', 'TRY')],
      collections: [collection('c1', '1000', 'TRY')],
    });

    await expectBox('Alacak Kalemleri', ['Asıl alacak', '10.000 ₺', 'Masraf', '250 ₺', 'Toplam', '10.250 ₺']);
    await expectBox('Ödemeler', ['Havale', 'Onaylandı', '+1.000 ₺']);
    expect(screen.queryByTestId('dues-total-unavailable')).toBeNull();
  });

  it('kuruşlu tutar önceki biçimle yazılır', async () => {
    mountCase({
      caseFields: { currency: 'TRY', principalAmount: '10000' },
      dues: [due('d1', 'PRINCIPAL', 'Asıl alacak', '10000', 'TRY'), due('d2', 'EXPENSE', 'Masraf', '250.5', 'TRY')],
      collections: [],
    });

    await expectBox('Alacak Kalemleri', ['Asıl alacak', '10.000 ₺', 'Masraf', '250,5 ₺', 'Toplam', '10.250,5 ₺']);
  });

  it('kalemsiz dosyada "Asıl Alacak" önceki gibi "₺" ile yazılır', async () => {
    mountCase({ caseFields: { currency: 'TRY', principalAmount: '10000' }, dues: [], collections: [] });

    await expectBox('Alacak Kalemleri', ['Asıl Alacak', '10.000 ₺']);
  });

  it('para birimi alanı taşımayan kayıt (eski yanıt biçimi) şema varsayılanı TRY sayılır; gösterim aynı', async () => {
    mountCase({
      caseFields: { principalAmount: '15000' },
      dues: [due('d1', 'INTEREST', 'Faiz', '500')],
      collections: [collection('c1', '200')],
    });

    await expectBox('Alacak Kalemleri', ['Faiz', '500 ₺', 'Toplam', '500 ₺']);
    await expectBox('Ödemeler', ['Havale', 'Onaylandı', '+200 ₺']);
  });
});
