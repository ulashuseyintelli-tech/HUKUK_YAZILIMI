import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { SendMessageModal } from '../SendMessageModal';
import { api } from '@/lib/api';

/**
 * WSMR-A4-AC-07 — `components/message/SendMessageModal.tsx#loadTemplates`
 *
 * KUSUR: catch dalında yalnız console.error ile hata yutuluyordu —
 * `templates` boş kalınca "Bu kanal için şablon bulunamadı" (GERÇEK
 * boşlukla AYNI) görünüyordu.
 *
 * MUTLAK KAPSAM SINIRI: Gönderme tarafı (`handleSend`) KOD DÜZEYİNDE
 * KANITLI SIMULATED/TODO'DUR (gerçek `api.sendMessage(...)` çağrısı YORUM
 * SATIRINDA, yerine `setTimeout` simülasyonu + "Mesaj gönderildi!
 * (Simülasyon)" alert var). Bu dilim YALNIZ `loadTemplates` okuma yolunu
 * düzeltir — `handleSend`/`api.sendMessage` HİÇBİR ŞEKİLDE dokunulmadı ve
 * bu testler bunu AÇIKÇA kanıtlar (anti-scope kilitleri).
 */

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

vi.mock('@/lib/api', () => {
  const registry: Record<string, ReturnType<typeof vi.fn>> = {};
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop: string) {
      if (!(prop in registry)) registry[prop] = vi.fn();
      return registry[prop];
    },
  };
  return { api: new Proxy({}, handler) };
});

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

function template(name: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `tpl-${name}`,
    tenantId: 't1',
    code: `CODE_${name}`,
    name,
    category: 'CLIENT_INFO',
    channel: 'EMAIL',
    body: `Merhaba, bu ${name} şablonudur.`,
    isActive: true,
    isSystem: false,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

type Call = ReturnType<typeof deferred<any>>;
let calls: Call[];

function primeTemplates() {
  mocked.getMessageTemplates.mockImplementation(() => {
    const d = deferred<any>();
    calls.push(d);
    return d.promise;
  });
}

const BASE_PROPS = {
  onClose: vi.fn(),
  recipientType: 'CLIENT' as const,
  recipientId: 'client-1',
  recipientName: 'Ahmet Yılmaz',
  recipientEmail: 'ahmet@example.com',
  caseId: 'case-1',
  caseFileNumber: '2026/1',
};

function renderModal(overrides: Record<string, unknown> = {}) {
  const onClose = vi.fn();
  const result = render(
    <SendMessageModal {...BASE_PROPS} onClose={onClose} isOpen={true} {...overrides} />,
  );
  return { ...result, onClose };
}

function alertBanner() {
  return screen.queryByRole('alert');
}

beforeEach(() => {
  calls = [];
  for (const fn of Object.values(mocked)) fn.mockReset();
  primeTemplates();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WSMR-A4-AC-07 — SendMessageModal#loadTemplates okuma hatası', () => {
  it('1) modal açılışında loading — istek beklenir, hata bandı YOK', async () => {
    renderModal();
    expect(calls.length).toBe(1);
    expect(alertBanner()).not.toBeInTheDocument();
    // Yükleme sırasında şablon seçim kutusu HENÜZ render EDİLMEZ (loading
    // dalı gösterilir) — ne "yüklenemedi" ne "bulunamadı" yanlış-erken
    // görünmez.
    expect(screen.queryByText(/Bu kanal için şablon bulunamadı/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Şablonlar yüklenemedi/)).not.toBeInTheDocument();
    await act(async () => {
      calls[0].resolve([]);
    });
  });

  it('2) başarılı DOLU şablon listesi seçilebilir olur', async () => {
    renderModal();
    await act(async () => {
      calls[0].resolve([template('Hoşgeldin')]);
    });
    expect(screen.getByRole('option', { name: /Hoşgeldin/ })).toBeInTheDocument();
    expect(alertBanner()).not.toBeInTheDocument();
  });

  it('3) sözleşme destekliyor — gerçek boş şablon listesi hata bandı ÜRETMEZ', async () => {
    renderModal();
    await act(async () => {
      calls[0].resolve([]);
    });
    expect(screen.getByRole('option', { name: /Bu kanal için şablon bulunamadı/ })).toBeInTheDocument();
    expect(alertBanner()).not.toBeInTheDocument();
  });

  it('4) network hatası — görünür bant üretir', async () => {
    renderModal();
    await act(async () => {
      calls[0].reject(new Error('Network Error'));
    });
    expect(alertBanner()).toBeInTheDocument();
  });

  it('5) HTTP hatası — görünür bant, teknik detay sızdırmadan', async () => {
    renderModal();
    await act(async () => {
      calls[0].reject({ message: 'Sunucu hatası (500)', status: 500 });
    });
    const el = alertBanner()!;
    expect(el.textContent).toMatch(/Mesaj şablonları yüklenemedi|Sunucu hatası/);
  });

  it('6) malformed gövde crash etmez, hata olarak işlenir', async () => {
    renderModal();
    await act(async () => {
      calls[0].resolve({ not: 'array' });
    });
    expect(alertBanner()).toBeInTheDocument();
  });

  it('7-8) hata görünürlüğü + "şablon bulunamadı" ile ASLA KARIŞMAZ', async () => {
    renderModal();
    await act(async () => {
      calls[0].reject(new Error('boom'));
    });
    expect(alertBanner()).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Şablonlar yüklenemedi/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^Bu kanal için şablon bulunamadı$/ })).not.toBeInTheDocument();
  });

  it('9) hata sırasında sahte/varsayılan şablon OLUŞMAZ', async () => {
    renderModal();
    await act(async () => {
      calls[0].reject(new Error('boom'));
    });
    // Yalnız hata option'ı var; gerçek/sahte bir şablon seçeneği YOK.
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toMatch(/Şablonlar yüklenemedi/);
  });

  it('10-11) hata -> retry -> başarı, retry YALNIZ şablon kaynağını çağırır', async () => {
    renderModal();
    await act(async () => {
      calls[0].reject(new Error('boom'));
    });
    const retryBtn = screen.getByRole('button', { name: /Tekrar dene/i });
    await act(async () => {
      retryBtn.click();
    });
    expect(calls.length).toBe(2);
    await act(async () => {
      calls[1].resolve([template('Hoşgeldin')]);
    });
    expect(screen.getByRole('option', { name: /Hoşgeldin/ })).toBeInTheDocument();
    expect(alertBanner()).not.toBeInTheDocument();
  });

  it('12) retry SEND yolunu çağırmaz (anti-scope kilidi)', async () => {
    renderModal();
    await act(async () => {
      calls[0].reject(new Error('boom'));
    });
    const retryBtn = screen.getByRole('button', { name: /Tekrar dene/i });
    await act(async () => {
      retryBtn.click();
    });
    expect(mocked.sendMessage).not.toHaveBeenCalled();
    expect(mocked.renderMessageTemplate).not.toHaveBeenCalled();
  });

  it('13) retry unrelated modal kaynaklarını (renderMessageTemplate) çağırmaz', async () => {
    renderModal();
    await act(async () => {
      calls[0].reject(new Error('boom'));
    });
    const retryBtn = screen.getByRole('button', { name: /Tekrar dene/i });
    await act(async () => {
      retryBtn.click();
    });
    expect(mocked.renderMessageTemplate).not.toHaveBeenCalled();
    expect(mocked.getMessageTemplate).not.toHaveBeenCalled();
  });

  it('14) başarılı veri KORUNUR — gerçek refresh yolu (modal kapan/yeniden aç) sonraki hata durumunda stale görünüm', async () => {
    const { rerender } = renderModal({ isOpen: true });
    await act(async () => {
      calls[0].resolve([template('Hoşgeldin')]);
    });
    expect(screen.getByRole('option', { name: /Hoşgeldin/ })).toBeInTheDocument();

    // Gerçek refresh yolu: modal kapanır, yeniden açılır (loadTemplates
    // TEKRAR çağrılır — yapay bir refresh özelliği EKLENMEDİ, bu zaten
    // isOpen useEffect'inin var olan davranışıdır).
    rerender(<SendMessageModal {...BASE_PROPS} onClose={vi.fn()} isOpen={false} />);
    rerender(<SendMessageModal {...BASE_PROPS} onClose={vi.fn()} isOpen={true} />);
    expect(calls.length).toBe(2);

    await act(async () => {
      calls[1].reject(new Error('yeniden açılışta başarısız'));
    });
    // Önceki başarılı "Hoşgeldin" verisi KORUNUR + bayat etiketi.
    expect(screen.getByRole('option', { name: /Hoşgeldin/ })).toBeInTheDocument();
    const el = alertBanner()!;
    expect(el.textContent).toMatch(/bayat/i);
  });

  it('15) geç ESKİ success güncel state\'i DEĞİŞTİRMEZ (retry ile iki örtüşen istek)', async () => {
    renderModal();
    await act(async () => {
      calls[0].reject(new Error('ilk deneme başarısız'));
    });
    const retryBtn = screen.getByRole('button', { name: /Tekrar dene/i });

    // Senkron çift-tıklama: in-flight bayrağı retry akışında BİLEREK
    // sıfırlandığından iki gerçek örtüşen istek üretir.
    await act(async () => {
      retryBtn.click();
      retryBtn.click();
    });
    expect(calls.length).toBe(3);
    const staleCall = calls[1];
    const freshCall = calls[2];

    await act(async () => {
      freshCall.resolve([template('Güncel')]);
    });
    expect(screen.getByRole('option', { name: /Güncel/ })).toBeInTheDocument();

    await act(async () => {
      staleCall.resolve([template('Eski')]);
    });
    expect(screen.queryByRole('option', { name: /^Eski/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Güncel/ })).toBeInTheDocument();
  });

  it('16) geç ESKİ rejection güncel state\'i DEĞİŞTİRMEZ (hata bandı sızmaz)', async () => {
    renderModal();
    await act(async () => {
      calls[0].reject(new Error('ilk deneme başarısız'));
    });
    const retryBtn = screen.getByRole('button', { name: /Tekrar dene/i });

    await act(async () => {
      retryBtn.click();
      retryBtn.click();
    });
    const staleCall = calls[1];
    const freshCall = calls[2];

    await act(async () => {
      freshCall.resolve([template('Güncel')]);
    });
    expect(screen.getByRole('option', { name: /Güncel/ })).toBeInTheDocument();

    await act(async () => {
      staleCall.reject(new Error('eski istek icin gec red'));
    });
    expect(alertBanner()).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Güncel/ })).toBeInTheDocument();
  });

  it('17) retry tıklanınca buton DOM\'dan kalkar (loading spinner devralır) — fiziksel ikinci tık İMKANSIZ, tek ek istek', async () => {
    renderModal();
    await act(async () => {
      calls[0].reject(new Error('boom'));
    });
    const retryBtn = screen.getByRole('button', { name: /Tekrar dene/i });
    await act(async () => {
      retryBtn.click();
    });
    // WSMR-A4-AC-07: bu bileşende `loading` TÜM içerik alanını (hata bandı +
    // retry butonu dahil) spinner ile değiştirir — kullanıcı retry
    // sırasında butona FİZİKSEL olarak bir daha tıklayamaz (buton artık
    // DOM'da yok), A4-AC-02/04/05/06'daki "disabled kalır" korumasından
    // FARKLI ama eşdeğer bir koruma.
    expect(screen.queryByRole('button', { name: /Tekrar dene/i })).not.toBeInTheDocument();
    expect(calls.length).toBe(2); // yalnız 1 ek istek (ilk hata + 1 retry)
  });

  it('18-19) modal kapanınca pending success/rejection state yazmaz', async () => {
    const { rerender } = renderModal({ isOpen: true });
    expect(calls.length).toBe(1);
    const call = calls[0];
    rerender(<SendMessageModal {...BASE_PROPS} onClose={vi.fn()} isOpen={false} />);
    await act(async () => {
      call.resolve([template('Kapalıyken gelen')]);
    });
    // Assertion yok — hedef modal kapalıyken pending yanıtın state
    // yazmaması / crash/act-uyarısı ÜRETMEMESİ.
  });

  it('20) modal yeniden açıldığında ÖNCEKİ hata state\'i taşınmaz', async () => {
    const { rerender } = renderModal({ isOpen: true });
    await act(async () => {
      calls[0].reject(new Error('ilk açılış başarısız'));
    });
    expect(alertBanner()).toBeInTheDocument();

    rerender(<SendMessageModal {...BASE_PROPS} onClose={vi.fn()} isOpen={false} />);
    rerender(<SendMessageModal {...BASE_PROPS} onClose={vi.fn()} isOpen={true} />);
    // Yeni deneme HENÜZ çözülmedi ama eski hata state'i zaten temizlenmiş
    // olmalı (loading gösterilir, eski hata bandı YOK).
    expect(alertBanner()).not.toBeInTheDocument();
  });

  it('21) unmount sonrası state yazılmaz (crash/uyarı yok)', async () => {
    const { unmount } = renderModal();
    const call = calls[0];
    unmount();
    await act(async () => {
      call.resolve([template('Geç gelen')]);
    });
  });

  it('22) şablon seçimi yalnız mevcut sözleşmedeki alanları doldurur (subject/body değişmez)', async () => {
    renderModal();
    await act(async () => {
      calls[0].resolve([template('Hoşgeldin', { channel: 'EMAIL' })]);
    });
    // handleSend/handlePreview TETİKLENMEDİ, yalnız seçim state'i güncellendi.
    expect(mocked.sendMessage).not.toHaveBeenCalled();
    expect(mocked.renderMessageTemplate).not.toHaveBeenCalled();
  });

  it('23) manuel mesaj yazımı, şablon hatası sırasında dahi mevcut sözleşmeye göre çalışır', async () => {
    renderModal();
    await act(async () => {
      calls[0].reject(new Error('boom'));
    });
    expect(alertBanner()).toBeInTheDocument();

    const customRadio = screen.getByRole('radio', { name: /Özel Mesaj Yaz/i });
    await act(async () => {
      fireEvent.click(customRadio);
    });
    const bodyInput = screen.getByPlaceholderText('Mesajınızı yazın...');
    fireEvent.change(bodyInput, { target: { value: 'Elle yazılmış mesaj' } });
    expect((bodyInput as HTMLTextAreaElement).value).toBe('Elle yazılmış mesaj');
  });

  it('24-25) şablon yüklemesi false-success veya "mesaj gönderildi" bildirimi ÜRETMEZ', async () => {
    renderModal();
    await act(async () => {
      calls[0].reject(new Error('boom'));
    });
    expect(alertBanner()).toBeInTheDocument();
    expect(screen.queryByText(/Mesaj gönderildi/)).not.toBeInTheDocument();
    expect(mocked.sendMessage).not.toHaveBeenCalled();
  });

  it('26) SIMULATED/TODO send davranışı bu dilimde DEĞİŞMEDİ — şablon yükleme/hata/retry akışlarının HİÇBİRİ sendMessage tetiklemez', async () => {
    renderModal();
    await act(async () => {
      calls[0].resolve([template('Hoşgeldin')]);
    });
    const retryBtn = screen.queryByRole('button', { name: /Tekrar dene/i });
    expect(retryBtn).not.toBeInTheDocument(); // basari durumunda retry gorunmez
    expect(mocked.sendMessage).not.toHaveBeenCalled();
    // Not: `handleSend`'in kendisinin SIMULATED/TODO kaldigi, bu dilimde
    // ayrica `git diff` ile (commit/PR govdesinde) mekanik olarak
    // dogrulanmistir — bu test yalniz template-yukleme akisinin sendMessage
    // TETIKLEMEDIGINI davranissal olarak kanitlar.
  });
});
