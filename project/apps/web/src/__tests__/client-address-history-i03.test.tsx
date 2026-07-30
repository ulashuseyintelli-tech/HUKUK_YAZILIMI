/**
 * CLIENT-ARC-07-STAFF-HISTORY-I03 — staff adres geçmişi UI sözleşmesi.
 *
 * KANONİK OTORİTE: `CLIENT-GOVERNANCE-CHARTER.md` §49.7 (ARC-07-D06).
 * Bileşen DOĞRUDAN render edilir (ClientProfile üzerinden DEĞİL) — bu dilimin ölçtüğü şey
 * adres bölümünün kendi davranışıdır; profil kabuğu `client-address-section.test.tsx`'te
 * ayrıca kapsanır.
 *
 * KAPSAM: aktif/arşiv ayrımı · arşivleme (birincil yeniden-atama seçimi) · geri alma
 * (varsayılan non-primary + açık birincilik) · fiziksel silmenin SUNULMAMASI · stabil hata
 * gösterimi · listelerin tazelenmesi.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientAddressSection } from '@/components/client/client-address-section';
import { api } from '@/lib/api';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      createClientAddress: vi.fn(),
      updateClientAddress: vi.fn(),
      deleteClientAddress: vi.fn(),
      getClientAddresses: vi.fn(),
      archiveClientAddress: vi.fn(),
      restoreClientAddress: vi.fn(),
    },
  };
});

const apiMock = api as unknown as {
  createClientAddress: ReturnType<typeof vi.fn>;
  updateClientAddress: ReturnType<typeof vi.fn>;
  deleteClientAddress: ReturnType<typeof vi.fn>;
  getClientAddresses: ReturnType<typeof vi.fn>;
  archiveClientAddress: ReturnType<typeof vi.fn>;
  restoreClientAddress: ReturnType<typeof vi.fn>;
};

const addr = (over: Partial<any> & { id: string }) => ({
  clientId: 'client-1',
  type: 'BEYAN',
  street: `Sokak ${over.id}`,
  city: 'İstanbul',
  district: 'Kadıköy',
  region: null,
  postalCode: null,
  isPrimary: false,
  isCurrent: true,
  ...over,
});

const PRIMARY = addr({ id: 'a1', isPrimary: true, street: 'Birincil Cadde' });
const SECOND = addr({ id: 'a2', street: 'İkinci Cadde' });
const ARCHIVED = addr({ id: 'a9', isCurrent: false, street: 'Arşiv Cadde', type: 'FATURA' });

function renderSection(addresses: any[], onChanged = vi.fn()) {
  render(
    <ClientAddressSection
      clientId="client-1"
      addresses={addresses}
      fallbackAddress={null}
      onChanged={onChanged}
    />,
  );
  return { onChanged };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.getClientAddresses.mockResolvedValue([]);
});

// ————————————————————————————————————————————————————————————————————————
// AKTİF LİSTE
// ————————————————————————————————————————————————————————————————————————

describe('ARC-07 I03 — aktif adres listesi', () => {
  it('[10] aktif adresler "Aktif Adresler" başlığı altında listelenir', async () => {
    renderSection([PRIMARY, SECOND]);
    expect(screen.getByText('Aktif Adresler')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Birincil Cadde/)).toBeTruthy());
    expect(screen.getByText(/İkinci Cadde/)).toBeTruthy();
  });

  it('[11] arşiv satırı AKTİF listeye RENDER EDİLMEZ (props arşiv içerse bile filtrelenir)', async () => {
    // Backend zaten isCurrent:true filtreler; bileşen ikinci savunma katmanı uygular.
    renderSection([PRIMARY, ARCHIVED]);
    await waitFor(() => expect(screen.getByText(/Birincil Cadde/)).toBeTruthy());
    expect(screen.queryByText(/Arşiv Cadde/)).toBeNull();
  });

  it('[12] birincil adres görsel olarak işaretlenir (★) ve yalnız bir tane', async () => {
    renderSection([PRIMARY, SECOND]);
    await waitFor(() => expect(screen.getByText(/Birincil Cadde/)).toBeTruthy());
    expect(screen.getAllByText(/★/)).toHaveLength(1);
    // Birincil satırda "Birincil Yap" SUNULMAZ.
    expect(screen.getAllByText('Birincil Yap')).toHaveLength(1);
  });

  it('[13/14] her aktif satırda "Arşivle" vardır; "Sil" HİÇ SUNULMAZ', async () => {
    renderSection([PRIMARY, SECOND]);
    await waitFor(() => expect(screen.getAllByText('Arşivle')).toHaveLength(2));
    expect(screen.queryByText('Sil')).toBeNull();
    expect(apiMock.deleteClientAddress).not.toHaveBeenCalled();
  });
});

// ————————————————————————————————————————————————————————————————————————
// ARŞİVLEME
// ————————————————————————————————————————————————————————————————————————

describe('ARC-07 I03 — arşivleme', () => {
  const confirmArchive = () =>
    fireEvent.click(screen.getAllByRole('button', { name: 'Arşivle' }).slice(-1)[0]);

  it('[15] non-primary arşivleme replacement İSTEMEZ ve boş payload gönderir', async () => {
    apiMock.archiveClientAddress.mockResolvedValue({});
    renderSection([PRIMARY, SECOND]);
    await waitFor(() => expect(screen.getAllByText('Arşivle')).toHaveLength(2));

    fireEvent.click(screen.getAllByText('Arşivle')[1]); // a2 = non-primary
    await waitFor(() => expect(screen.getByText('Adresi Arşivle')).toBeTruthy());
    expect(screen.queryByLabelText('Yeni birincil adres')).toBeNull();

    confirmArchive();
    await waitFor(() =>
      expect(apiMock.archiveClientAddress).toHaveBeenCalledWith('client-1', 'a2', {}),
    );
  });

  it('[16] TEK güncel adres (birincil) replacement OLMADAN arşivlenebilir', async () => {
    apiMock.archiveClientAddress.mockResolvedValue({});
    renderSection([PRIMARY]);
    await waitFor(() => expect(screen.getAllByText('Arşivle')).toHaveLength(1));

    fireEvent.click(screen.getAllByText('Arşivle')[0]);
    await waitFor(() => expect(screen.getByText('Adresi Arşivle')).toBeTruthy());
    expect(screen.queryByLabelText('Yeni birincil adres')).toBeNull();
    expect(screen.getByText(/tek güncel adresi/)).toBeTruthy();

    confirmArchive();
    await waitFor(() =>
      expect(apiMock.archiveClientAddress).toHaveBeenCalledWith('client-1', 'a1', {}),
    );
  });

  it('[17/20] birincil + kardeş varsa replacement ZORUNLU; seçilen kimlik gönderilir', async () => {
    apiMock.archiveClientAddress.mockResolvedValue({});
    renderSection([PRIMARY, SECOND]);
    await waitFor(() => expect(screen.getAllByText('Arşivle')).toHaveLength(2));

    fireEvent.click(screen.getAllByText('Arşivle')[0]); // a1 = birincil
    const select = (await screen.findByLabelText('Yeni birincil adres')) as HTMLSelectElement;
    const confirm = screen.getAllByRole('button', { name: 'Arşivle' }).slice(-1)[0] as HTMLButtonElement;

    // Seçim yapılmadan onay DEVRE DIŞI — UI sessizce aday SEÇMEZ.
    expect(confirm.disabled).toBe(true);
    fireEvent.change(select, { target: { value: 'a2' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Arşivle' }).slice(-1)[0]);

    await waitFor(() =>
      expect(apiMock.archiveClientAddress).toHaveBeenCalledWith('client-1', 'a1', {
        replacementPrimaryAddressId: 'a2',
      }),
    );
  });

  it('[18/19] aday listesi HEDEFİ ve ARŞİV satırlarını DIŞLAR', async () => {
    apiMock.getClientAddresses.mockResolvedValue([ARCHIVED]);
    renderSection([PRIMARY, SECOND]);
    await waitFor(() => expect(screen.getByText('Arşivlenmiş Adresler')).toBeTruthy());

    fireEvent.click(screen.getAllByText('Arşivle')[0]);
    const select = (await screen.findByLabelText('Yeni birincil adres')) as HTMLSelectElement;

    // "Seçiniz" + yalnız a2 → 2 option. Hedef (a1) ve arşiv (a9) YOK.
    expect(select.querySelectorAll('option')).toHaveLength(2);
    expect(select.querySelector('option[value="a1"]')).toBeNull();
    expect(select.querySelector('option[value="a9"]')).toBeNull();
    expect(select.querySelector('option[value="a2"]')).toBeTruthy();
  });

  it('[21] backend hatası aynen gösterilir (stabil mesaj)', async () => {
    apiMock.archiveClientAddress.mockRejectedValue(
      new Error('Birincil adres arşivlenmeden önce yerine geçecek birincil adres açıkça seçilmelidir.'),
    );
    renderSection([PRIMARY, SECOND]);
    await waitFor(() => expect(screen.getAllByText('Arşivle')).toHaveLength(2));

    fireEvent.click(screen.getAllByText('Arşivle')[1]);
    await waitFor(() => expect(screen.getByText('Adresi Arşivle')).toBeTruthy());
    confirmArchive();

    await waitFor(() =>
      expect(
        screen.getByText(
          'Birincil adres arşivlenmeden önce yerine geçecek birincil adres açıkça seçilmelidir.',
        ),
      ).toBeTruthy(),
    );
  });

  it('[22] başarıdan sonra HER İKİ liste tazelenir (arşiv yeniden çekilir + parent bildirilir)', async () => {
    apiMock.archiveClientAddress.mockResolvedValue({});
    const { onChanged } = renderSection([PRIMARY, SECOND]);
    await waitFor(() => expect(apiMock.getClientAddresses).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getAllByText('Arşivle')[1]);
    await waitFor(() => expect(screen.getByText('Adresi Arşivle')).toBeTruthy());
    confirmArchive();

    await waitFor(() => expect(apiMock.getClientAddresses).toHaveBeenCalledTimes(2));
    expect(onChanged).toHaveBeenCalled();
    // Tazeleme, ARŞİVLEME aksiyonuna bağlıdır — fiziksel silme yolu ile tetiklenemez.
    expect(apiMock.archiveClientAddress).toHaveBeenCalled();
    expect(apiMock.deleteClientAddress).not.toHaveBeenCalled();
  });
});

// ————————————————————————————————————————————————————————————————————————
// ARŞİV LİSTESİ VE GERİ ALMA
// ————————————————————————————————————————————————————————————————————————

describe('ARC-07 I03 — arşiv listesi ve geri alma', () => {
  const confirmRestore = () =>
    fireEvent.click(screen.getAllByRole('button', { name: 'Geri Al' }).slice(-1)[0]);

  it('[23] arşiv satırı AYRI başlık altında, arşiv rozetiyle ve birincil GÖSTERİLMEDEN listelenir', async () => {
    apiMock.getClientAddresses.mockResolvedValue([ARCHIVED]);
    renderSection([PRIMARY]);

    await waitFor(() => expect(screen.getByText('Arşivlenmiş Adresler')).toBeTruthy());
    expect(screen.getByText(/Arşiv Cadde/)).toBeTruthy();
    expect(screen.getByText('Arşivlendi')).toBeTruthy();
    expect(apiMock.getClientAddresses).toHaveBeenCalledWith('client-1', 'archived');
    // Arşiv satırında ★ ve "Birincil Yap" YOK.
    expect(screen.getAllByText(/★/)).toHaveLength(1); // yalnız aktif birincil
    expect(screen.queryByText('Birincil Yap')).toBeNull(); // aktif listede tek satır ve o birincil
  });

  it('[24] VARSAYILAN geri alma birincil YAPMAZ — boş payload gider', async () => {
    apiMock.getClientAddresses.mockResolvedValue([ARCHIVED]);
    apiMock.restoreClientAddress.mockResolvedValue({});
    renderSection([PRIMARY]);
    await waitFor(() => expect(screen.getByText('Geri Al')).toBeTruthy());

    fireEvent.click(screen.getByText('Geri Al'));
    await waitFor(() => expect(screen.getByText('Adresi Geri Al')).toBeTruthy());
    confirmRestore();

    await waitFor(() =>
      expect(apiMock.restoreClientAddress).toHaveBeenCalledWith('client-1', 'a9', {}),
    );
  });

  it('[25] AÇIK birincil yapma seçeneği vardır ve mevcut birincilin değişeceği belirtilir', async () => {
    apiMock.getClientAddresses.mockResolvedValue([ARCHIVED]);
    apiMock.restoreClientAddress.mockResolvedValue({});
    renderSection([PRIMARY]);
    await waitFor(() => expect(screen.getByText('Geri Al')).toBeTruthy());

    fireEvent.click(screen.getByText('Geri Al'));
    const checkbox = (await screen.findByRole('checkbox')) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);
    // Uyarı, kaybedilecek birinciyi ADIYLA anmalı — genel bir "birincil değişecek" cümlesi
    // yeterli değildir (owner §6: "clearly state that the existing primary will be replaced").
    const warning = await screen.findByText(/birincil olmaktan çıkacak/);
    expect(warning.textContent).toContain('Birincil Cadde');
    expect(warning.textContent).toContain('Mevcut birincil adres');

    confirmRestore();
    await waitFor(() =>
      expect(apiMock.restoreClientAddress).toHaveBeenCalledWith('client-1', 'a9', { makePrimary: true }),
    );
  });

  it('[26/27] geri alma sonrası listeler tazelenir — satır arşivden çıkar', async () => {
    apiMock.getClientAddresses.mockResolvedValueOnce([ARCHIVED]).mockResolvedValueOnce([]);
    apiMock.restoreClientAddress.mockResolvedValue({});
    const { onChanged } = renderSection([PRIMARY]);
    await waitFor(() => expect(screen.getByText('Geri Al')).toBeTruthy());

    fireEvent.click(screen.getByText('Geri Al'));
    await waitFor(() => expect(screen.getByText('Adresi Geri Al')).toBeTruthy());
    confirmRestore();

    // Arşiv listesi yeniden çekildi ve boşaldı → arşiv bölümü kayboldu.
    await waitFor(() => expect(screen.queryByText('Arşivlenmiş Adresler')).toBeNull());
    expect(screen.queryByText(/Arşiv Cadde/)).toBeNull();
    // Aktif liste parent tarafından tazelenir (props kaynağı).
    expect(onChanged).toHaveBeenCalled();
  });

  it('[28] geri alma hatası aynen gösterilir', async () => {
    apiMock.getClientAddresses.mockResolvedValue([ARCHIVED]);
    apiMock.restoreClientAddress.mockRejectedValue(new Error('Bu adres zaten güncel — arşivde değil.'));
    renderSection([PRIMARY]);
    await waitFor(() => expect(screen.getByText('Geri Al')).toBeTruthy());

    fireEvent.click(screen.getByText('Geri Al'));
    await waitFor(() => expect(screen.getByText('Adresi Geri Al')).toBeTruthy());
    confirmRestore();

    await waitFor(() => expect(screen.getByText('Bu adres zaten güncel — arşivde değil.')).toBeTruthy());
  });

  it('[28b] arşiv listesi çekilemezse bölüm SESSİZCE boş görünmez — hata gösterilir', async () => {
    apiMock.getClientAddresses.mockRejectedValue(new Error('Arşiv okunamadı.'));
    renderSection([PRIMARY]);
    await waitFor(() => expect(screen.getByText('Arşiv okunamadı.')).toBeTruthy());
  });
});
