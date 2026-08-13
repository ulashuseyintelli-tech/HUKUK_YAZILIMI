import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import KanbanPage from '../page';
import { api } from '@/lib/api';

/**
 * WSMR-A4f — KANBAN PANOSUNDA UYDURMA GÖREV KAYITLARI.
 *
 * `/tasks` hata verdiğinde catch bloğu beş adet sahte hukuki görev diziyordu:
 * "Haciz talebi hazırla", "Tebligat kontrolü", "Müvekkil görüşmesi",
 * "Dosya inceleme", "Rapor hazırla". Kullanıcı bunları gerçek iş listesi sanıp
 * planlama yapabilir; gerçek görevlerini ise hiç görmediği için kaçırabilirdi.
 *
 * İkinci ve daha sinsi hat: sürükle-bırak mutasyonu başarısız olduğunda geri
 * alma `loadTasks()` ile yapılıyordu — o da hata verirse pano sahte görevlere
 * DÜŞÜYORDU. Yani başarısız bir mutasyon uydurma veriyle sonuçlanabiliyordu.
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), put: vi.fn() },
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const mocked = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
};

const DEMO_TITLES = [
  'Haciz talebi hazırla',
  'Tebligat kontrolü',
  'Müvekkil görüşmesi',
  'Dosya inceleme',
  'Rapor hazırla',
];

const REAL_TASKS = [
  { id: 't1', title: 'Gerçek görev A', status: 'PENDING', priority: 'HIGH' },
  { id: 't2', title: 'Gerçek görev B', status: 'IN_PROGRESS', priority: 'LOW' },
];

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('Kanban — yükleme hatası', () => {
  it('hata: SAHTE görev kartı basmaz, görünür hata + retry gösterir', async () => {
    mocked.get.mockRejectedValue(new Error('network down'));
    render(<KanbanPage />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    for (const title of DEMO_TITLES) {
      expect(screen.queryByText(title)).toBeNull();
    }
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
    // Sutun basliklari da basilmaz -> "bos pano" ile "hata" karistirilamaz.
    expect(screen.queryByText('Bekliyor')).toBeNull();
  });

  it('bozuk gövde (dizi değil): sahte veriye düşmez, hata verir', async () => {
    mocked.get.mockResolvedValue({ data: { unexpected: true } });
    render(<KanbanPage />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    for (const title of DEMO_TITLES) {
      expect(screen.queryByText(title)).toBeNull();
    }
  });

  it('retry: yalnız okuma tekrarlanır, hiçbir mutasyon üretilmez', async () => {
    mocked.get.mockRejectedValueOnce(new Error('geçici')).mockResolvedValue({ data: REAL_TASKS });
    render(<KanbanPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Tekrar dene' }));

    expect(await screen.findByText('Gerçek görev A')).toBeTruthy();
    expect(mocked.get).toHaveBeenCalledTimes(2);
    expect(mocked.put).not.toHaveBeenCalled();
  });

  it('başarılı okuma: yalnız gerçek görevler görünür', async () => {
    mocked.get.mockResolvedValue({ data: REAL_TASKS });
    render(<KanbanPage />);

    expect(await screen.findByText('Gerçek görev A')).toBeTruthy();
    expect(screen.getByText('Gerçek görev B')).toBeTruthy();
    for (const title of DEMO_TITLES) {
      expect(screen.queryByText(title)).toBeNull();
    }
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sarmalanmış gövde ({data:{data:[...]}}) de sözleşmeye uyar', async () => {
    mocked.get.mockResolvedValue({ data: { data: REAL_TASKS } });
    render(<KanbanPage />);

    expect(await screen.findByText('Gerçek görev A')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Kanban — sürükle-bırak mutasyon hatası', () => {
  it('mutasyon hatası: kart ESKİ sütuna döner ve sahte göreve düşülmez', async () => {
    mocked.get.mockResolvedValue({ data: REAL_TASKS });
    mocked.put.mockRejectedValue(new Error('write failed'));
    // Geri alma yolu bir daha okuma YAPARSA ve o okuma da hata verirse eski kod
    // demo veriye dusuyordu; bu senaryoyu kasten kuruyoruz.
    render(<KanbanPage />);

    const card = await screen.findByText('Gerçek görev A');
    const draggable = card.closest('[draggable]') as HTMLElement;
    fireEvent.dragStart(draggable);

    const completedColumn = screen.getByText('Tamamlandı').closest('div')!.parentElement!;
    fireEvent.dragOver(completedColumn);
    fireEvent.drop(completedColumn);

    expect(await screen.findByRole('alert')).toBeTruthy();
    for (const title of DEMO_TITLES) {
      expect(screen.queryByText(title)).toBeNull();
    }
    // Yalnizca ilk yukleme okumasi yapildi; basarisiz mutasyon yeni okuma tetiklemedi.
    expect(mocked.get).toHaveBeenCalledTimes(1);
    // Kart hala gorunur (kaybolmadi) ve gercek veri korunuyor.
    expect(screen.getByText('Gerçek görev A')).toBeTruthy();
  });

  it('mutasyon başarılı: hata gösterilmez', async () => {
    mocked.get.mockResolvedValue({ data: REAL_TASKS });
    mocked.put.mockResolvedValue({ data: { ok: true } });
    render(<KanbanPage />);

    const card = await screen.findByText('Gerçek görev A');
    fireEvent.dragStart(card.closest('[draggable]') as HTMLElement);
    const completedColumn = screen.getByText('Tamamlandı').closest('div')!.parentElement!;
    fireEvent.drop(completedColumn);

    await vi.waitFor(() => expect(mocked.put).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
