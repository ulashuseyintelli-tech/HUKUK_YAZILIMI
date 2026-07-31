/**
 * CLIENT-OWN-11-WORKSPACE-URL-CONTRACT-I01
 *
 * Kanonik Client Workspace URL kontratı, navigasyon hedefleri ve klavye gezinmesi.
 *
 * Owner kararları (D01–D16, GO-IMPLEMENT ile onaylandı):
 *  - D01 `/clients/:id` kanonik staff Client Workspace'tir.
 *  - D02+D03 sekmeler URL-adreslenebilir: `/clients/:id?tab=<tabId>` (query parameter).
 *  - D04 refresh geçerli sekmeyi korur · D05 geri/ileri sekme geçmişinde gezinir.
 *  - D11 varsayılan `overview`; geçerli `?tab=` bunu ezer.
 *  - D14 geçersiz/bilinmeyen `?tab=` GÜVENLE `overview`'e düşer (404/403 DEĞİL).
 *  - D12 sekme sırası ve kimlikleri DEĞİŞMEZ · D08/D10 sekme eklenmez/çıkarılmaz/taşınmaz.
 *
 * Aktif sekme artık component state'i DEĞİL, URL'den türevlenir; bu yüzden refresh ve
 * geçmiş davranışı yapısal olarak garanti edilir (ayrı senkronizasyon state'i YOKTUR).
 */
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const routerPush = vi.fn();
const routerReplace = vi.fn();
let currentSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
  usePathname: () => '/clients/client-1',
  useSearchParams: () => currentSearchParams,
  useParams: () => ({ clientId: 'client-1' }),
}));

vi.mock('@/lib/api', () => ({
  api: {
    getClient: vi.fn(),
    getCases: vi.fn(),
    getClientActionCatalog: vi.fn(),
    getClientOperatingSnapshot: vi.fn(),
    getClientAddresses: vi.fn(),
    createClientAddress: vi.fn(),
    updateClientAddress: vi.fn(),
    archiveClientAddress: vi.fn(),
    restoreClientAddress: vi.fn(),
    listIntakeLinks: vi.fn(),
    listIntakeSubmissions: vi.fn(),
    get: vi.fn(),
  },
}));

import { api } from '@/lib/api';
import {
  ClientProfile,
  CLIENT_WORKSPACE_TAB_IDS,
  CLIENT_WORKSPACE_DEFAULT_TAB,
  isClientWorkspaceTabId,
  resolveClientWorkspaceTab,
} from '@/components/client/client-profile';
import ClientDetailPage from '@/app/(dashboard)/clients/[clientId]/page';

const apiMock = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const CLIENT = {
  id: 'client-1',
  type: 'PERSON',
  displayName: 'Ada Müvekkil',
  firstName: 'Ada',
  lastName: 'Müvekkil',
  tckn: '11111111110',
  contacts: [],
  powerOfAttorneys: [],
  addresses: [],
};

const SNAPSHOT = {
  clientId: 'client-1',
  health: 'healthy',
  riskLevel: 'low',
  contact: {
    status: 'complete',
    missingFields: [],
    followUpStatus: null,
    openTaskCount: 0,
    overdueTaskCount: 0,
    nextFollowUpAt: null,
    escalationLevel: null,
  },
  poa: { status: 'active', activeCount: 0, nearestValidUntil: null },
  intake: { status: 'none', latestSubmission: null, latestLink: null },
  notification: { status: 'none', latest: null },
  signals: [],
};

/** Sekme etiketleri — kanonik sıra (D12). Testler bu sırayı da pinler. */
const TAB_LABELS: Record<string, string> = {
  overview: 'Genel',
  identity: 'Kimlik & İletişim',
  cases: 'Dosyalar',
  poa: 'Vekalet',
  portal: 'Portal',
  'info-requests': 'Bilgi Talepleri',
  intelligence: 'İstihbarat',
  intake: 'Intake',
  actions: 'İşlemler',
  activity: 'Aktivite',
};

async function renderWorkspace(search = '') {
  currentSearchParams = new URLSearchParams(search);
  const result = render(<ClientProfile clientId="client-1" />);
  await waitFor(() => expect(screen.getAllByText('Ada Müvekkil').length).toBeGreaterThan(0));
  return result;
}

function activeTabName(): string | null {
  const selected = screen.getAllByRole('tab').find((el) => el.getAttribute('aria-selected') === 'true');
  return selected?.textContent?.trim() ?? null;
}

beforeEach(() => {
  vi.clearAllMocks();
  currentSearchParams = new URLSearchParams();
  apiMock.getClient.mockResolvedValue({ data: CLIENT });
  apiMock.getCases.mockResolvedValue({ data: [] });
  apiMock.getClientActionCatalog.mockResolvedValue({ data: [] });
  apiMock.getClientOperatingSnapshot.mockResolvedValue({ data: SNAPSHOT });
  apiMock.getClientAddresses.mockResolvedValue([]);
  apiMock.listIntakeLinks.mockResolvedValue({ data: [] });
  apiMock.listIntakeSubmissions.mockResolvedValue({ data: [] });
  // Activity/Bilgi Talepleri sekmeleri generic `api.get` üzerinden besleniyor; bu suite
  // sekme SEÇİMİNİ test ediyor, sekme içeriğini değil — boş ama geçerli yanıt yeterli.
  apiMock.get.mockResolvedValue({ data: { data: [], nextCursor: null } });
});

describe('[1-6] sekme başlatma — query parametresi', () => {
  it('[1] query parametresi YOKken varsayılan `overview` seçilir', async () => {
    await renderWorkspace('');
    expect(activeTabName()).toContain('Genel');
    // Temiz URL gereksiz yere `?tab=overview`e çevrilmez (owner §6).
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('[2] geçerli `?tab=identity` doğrudan o sekmeyi açar', async () => {
    await renderWorkspace('tab=identity');
    expect(activeTabName()).toContain('Kimlik & İletişim');
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it.each([...CLIENT_WORKSPACE_TAB_IDS])(
    '[3] `?tab=%s` kendi sekmesini açar (10/10 kanonik kimlik)',
    async (tabId) => {
      await renderWorkspace(`tab=${tabId}`);
      expect(activeTabName()).toContain(TAB_LABELS[tabId]);
      expect(routerReplace).not.toHaveBeenCalled();
    },
  );

  it('[4] GEÇERSİZ sekme değeri güvenle `overview`e düşer (404/403 YOK)', async () => {
    await renderWorkspace('tab=does-not-exist');
    expect(activeTabName()).toContain('Genel');
    expect(screen.queryByText(/bulunamadı|yetkisiz|403|404/i)).toBeNull();
  });

  it('[5] BOŞ sekme değeri güvenle `overview`e düşer ve URL normalize edilir', async () => {
    await renderWorkspace('tab=');
    expect(activeTabName()).toContain('Genel');
    await waitFor(() => expect(routerReplace).toHaveBeenCalled());
    expect(routerReplace.mock.calls[0][0]).toContain('tab=overview');
  });

  it('[6] normalizasyon `replace` kullanır (geçmiş döngüsü ÜRETMEZ)', async () => {
    await renderWorkspace('tab=bogus');
    await waitFor(() => expect(routerReplace).toHaveBeenCalled());
    expect(routerPush).not.toHaveBeenCalled();
  });
});

describe('[7-10] sekme etkileşimi', () => {
  it('[7-8] sekmeye tıklamak URL`i `?tab=` ile günceller', async () => {
    await renderWorkspace('');
    fireEvent.click(screen.getByRole('tab', { name: /Kimlik & İletişim/ }));
    expect(routerPush).toHaveBeenCalledTimes(1);
    expect(routerPush.mock.calls[0][0]).toBe('/clients/client-1?tab=identity');
  });

  it('[9] KULLANICI sekme değişimi geçmiş üreten `push` kullanır (replace DEĞİL)', async () => {
    await renderWorkspace('');
    fireEvent.click(screen.getByRole('tab', { name: /Aktivite/ }));
    expect(routerPush).toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('[10] sekme DIŞI query parametreleri KORUNUR', async () => {
    await renderWorkspace('caseId=case-9&tab=overview');
    fireEvent.click(screen.getByRole('tab', { name: /Dosyalar/ }));
    const target = routerPush.mock.calls[0][0] as string;
    expect(target).toContain('caseId=case-9');
    expect(target).toContain('tab=cases');
  });
});

describe('[11-14] refresh / geçmiş kontratı', () => {
  it('[11] query`den ilk render aktif sekmeyi geri yükler (refresh davranışı)', async () => {
    await renderWorkspace('tab=poa');
    expect(activeTabName()).toContain('Vekalet');
  });

  it('[12] geri gidildiğinde önceki sekme URL`den geri gelir', async () => {
    // Browser geri = önceki URL ile yeniden render; aktif sekme component state`inde
    // TUTULMADIĞI için (URL`den türevlenir) önceki sekme kendiliğinden geri gelir.
    const first = await renderWorkspace('tab=activity');
    expect(activeTabName()).toContain('Aktivite');
    first.unmount();

    await renderWorkspace('tab=overview');
    expect(activeTabName()).toContain('Genel');
  });

  it('[13] ileri gidildiğinde sonraki sekme URL`den gelir', async () => {
    const first = await renderWorkspace('tab=overview');
    expect(activeTabName()).toContain('Genel');
    first.unmount();

    await renderWorkspace('tab=intake');
    expect(activeTabName()).toContain('Intake');
  });

  it('[14] geçersiz sekme normalizasyonu `push` KULLANMAZ (geçmiş döngüsü yok)', async () => {
    await renderWorkspace('tab=zzz');
    await waitFor(() => expect(routerReplace).toHaveBeenCalled());
    // Kritik sözleşme: normalizasyon geçmişe KAYIT EKLEMEZ. (Çağrı SAYISI burada
    // pinlenmez: mock `useSearchParams` statiktir, gerçek router`da `replace` URL`i
    // düzeltir ve effect bir daha tetiklenmez.)
    expect(routerPush).not.toHaveBeenCalled();
    routerReplace.mock.calls.forEach(([target]) => {
      expect(target).toContain('tab=overview');
    });
  });
});

describe('[15-20] klavye gezinmesi (WAI-ARIA tabs)', () => {
  it('[15] ArrowRight SONRAKİ sekmeyi seçer', async () => {
    await renderWorkspace('tab=overview');
    fireEvent.keyDown(screen.getByRole('tab', { name: /Genel/ }), { key: 'ArrowRight' });
    expect(routerPush.mock.calls[0][0]).toContain('tab=identity');
  });

  it('[16] ArrowLeft ÖNCEKİ sekmeyi seçer ve başta SARAR', async () => {
    await renderWorkspace('tab=overview');
    fireEvent.keyDown(screen.getByRole('tab', { name: /Genel/ }), { key: 'ArrowLeft' });
    expect(routerPush.mock.calls[0][0]).toContain('tab=activity');
  });

  it('[17] Home İLK sekmeyi seçer', async () => {
    await renderWorkspace('tab=activity');
    fireEvent.keyDown(screen.getByRole('tab', { name: /Aktivite/ }), { key: 'Home' });
    expect(routerPush.mock.calls[0][0]).toContain('tab=overview');
  });

  it('[18] End SON sekmeyi seçer', async () => {
    await renderWorkspace('tab=overview');
    fireEvent.keyDown(screen.getByRole('tab', { name: /Genel/ }), { key: 'End' });
    expect(routerPush.mock.calls[0][0]).toContain('tab=activity');
  });

  it('[19] klavye değişimi URL`i günceller VE odağı yeni sekmeye taşır', async () => {
    await renderWorkspace('tab=overview');
    fireEvent.keyDown(screen.getByRole('tab', { name: /Genel/ }), { key: 'ArrowRight' });
    expect(routerPush).toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /Kimlik & İletişim/ }));
  });

  it('[20] mevcut ARIA nitelikleri korunur (roving tabIndex dahil)', async () => {
    await renderWorkspace('tab=cases');
    const active = screen.getByRole('tab', { name: /Dosyalar/ });
    expect(active.getAttribute('aria-selected')).toBe('true');
    expect(active.getAttribute('tabindex')).toBe('0');
    expect(active.getAttribute('aria-controls')).toBe('client-profile-client-1-cases-panel');
    const inactive = screen.getByRole('tab', { name: /Genel/ });
    expect(inactive.getAttribute('aria-selected')).toBe('false');
    expect(inactive.getAttribute('tabindex')).toBe('-1');
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(
      'client-profile-client-1-cases-tab',
    );
  });
});

/**
 * [21-25] Navigasyon hedefleri kaynak-seviyesinde pinlenir. Bu sayfaların tamamını
 * render etmek (header arama, tasks listesi, settings modal'ı) kendi ağır bağımlılık
 * kurulumlarını gerektirir ve hedefi DEĞİL kurulumu test etmiş olurdu; burada test
 * edilen sözleşme "hangi URL'e gidiliyor" olduğu için kanonik hedef doğrudan pinlenir.
 * Bir hedef eski compatibility yüzeyine geri alınırsa bu testler KIRILIR (M4/M5 dişleri).
 */
describe('[21-25] kanonik navigasyon hedefleri (kaynak sözleşmesi)', () => {
  const read = (relative: string) =>
    readFileSync(resolvePath(__dirname, '..', relative), 'utf8');

  it('[21] global arama müvekkil sonucu `/clients/:id`e gider (settings listesine DEĞİL)', () => {
    const source = read('components/layout/header.tsx');
    expect(source).toContain("router.push(`/clients/${result.id}`)");
    expect(source).not.toContain("result.type === 'client') router.push(`/settings/clients`)");
  });

  it('[22] görev listesindeki müvekkil bağlantısı `/clients/:id`e gider', () => {
    const source = read('app/(dashboard)/tasks/page.tsx');
    expect(source).toContain('href={`/clients/${task.clientId}`}');
    expect(source).not.toContain('/settings/clients?edit=${task.clientId}');
  });

  it('[23] settings satırı kanonik Workspace bağlantısı taşır', () => {
    const source = read('app/(dashboard)/settings/clients/page.tsx');
    expect(source).toContain('href={`/clients/${client.id}`}');
    expect(source).toContain('Müvekkil Detayı (Client Workspace)');
    // D07: compatibility yüzeyi KALDIRILMADI — modal ve POA/portal aksiyonları duruyor.
    expect(source).toContain('ClientModal');
    expect(source).toContain('PortalAccessModal');
  });

  it('[24] settings adres yönlendirmesi `?tab=identity` taşır', () => {
    const source = read('app/(dashboard)/settings/clients/page.tsx');
    expect(source).toContain('href={`/clients/${client.id}?tab=identity`}');
  });

  it('[25] edit sayfasının adres yönlendirmesi `?tab=identity` taşır', () => {
    const source = read('app/(dashboard)/clients/[clientId]/edit/page.tsx');
    expect(source).toContain('addressManagerHref={`/clients/${clientId}?tab=identity`}');
  });
});

describe('[26] muhasebe girişi', () => {
  it('[26] Workspace kabuğu muhasebeye GÖRÜNÜR giriş verir (ayrı route kalır)', () => {
    render(<ClientDetailPage />);
    const link = screen.getByRole('link', { name: /Muhasebe/ });
    expect(link.getAttribute('href')).toBe('/clients/client-1/accounting');
    // D09: muhasebe bir Workspace SEKMESİ DEĞİLDİR — sekme listesinde yer almaz.
    expect(CLIENT_WORKSPACE_TAB_IDS).not.toContain('accounting' as never);
  });

  it('[26b] Workspace kabuğu düzenleme route`unu ayrı tutar (D06)', () => {
    render(<ClientDetailPage />);
    expect(screen.getByRole('link', { name: /Düzenle/ }).getAttribute('href')).toBe(
      '/clients/client-1/edit',
    );
  });
});

describe('[27-30] regresyon — sekme kümesi, sıra, varsayılan', () => {
  it('[27] ON sekmenin tamamı hâlâ render edilir', async () => {
    await renderWorkspace('');
    expect(screen.getAllByRole('tab')).toHaveLength(10);
  });

  it('[28] sekme SIRASI değişmedi (D12)', async () => {
    await renderWorkspace('');
    const rendered = screen.getAllByRole('tab').map((el) => el.textContent?.trim() ?? '');
    CLIENT_WORKSPACE_TAB_IDS.forEach((tabId, index) => {
      expect(rendered[index]).toContain(TAB_LABELS[tabId]);
    });
  });

  it('[29] varsayılan sekme `overview` olarak KALIR (D11)', () => {
    expect(CLIENT_WORKSPACE_DEFAULT_TAB).toBe('overview');
    expect(resolveClientWorkspaceTab(null)).toBe('overview');
    expect(resolveClientWorkspaceTab(undefined)).toBe('overview');
  });

  it('[30] allowlist doğrulayıcısı yalnız kanonik kimlikleri kabul eder', () => {
    CLIENT_WORKSPACE_TAB_IDS.forEach((id) => expect(isClientWorkspaceTabId(id)).toBe(true));
    ['accounting', 'edit', 'ADDRESSES', '', null, undefined, 'identity '].forEach((bad) =>
      expect(isClientWorkspaceTabId(bad as string)).toBe(false),
    );
  });

  it('[31] sekme kimlikleri R01 envanteriyle BİREBİR (ekleme/çıkarma yok)', () => {
    expect([...CLIENT_WORKSPACE_TAB_IDS]).toEqual([
      'overview',
      'identity',
      'cases',
      'poa',
      'portal',
      'info-requests',
      'intelligence',
      'intake',
      'actions',
      'activity',
    ]);
  });
});
