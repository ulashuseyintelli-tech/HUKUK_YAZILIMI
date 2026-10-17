import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { UyapPanel } from '../UyapPanel';
import { api } from '@/lib/api';

/**
 * Güvenlik paketi 01 / DV-198/e (owner Ek 94) — UYAP paneli arayüz doğruluğu.
 *
 *  1. Genel evrak türü listesinde Haciz Talebi ve Takip Talebi YOK; varsayılan geçerli bir tür.
 *  2. Başarı metni sunucu sonucuna dayanır: yerel simülasyona "İLETİLDİ / gönderildi" denmez;
 *     belirsiz yanıtta ve tazeleme başarısız (stale) yolunda iletim iddia edilmez.
 *  3. Haciz sekmesi kısıtı açıkça gösterir; kullanıcı çalışan bir yol varmış gibi yönlendirilmez;
 *     aşama kuralı istemcide kodlanmaz, sunucunun ret iletisi gösterilir.
 */

vi.mock('@/lib/api', () => ({
  api: {
    getUyapStatus: vi.fn(),
    validateUyapCasePoa: vi.fn(),
    getUyapRequestHistory: vi.fn(),
    getCaseDebtors: vi.fn(),
    getPreHacizIntelligence: vi.fn(),
    sendUyapHacizRequest: vi.fn(),
    submitUyapDocument: vi.fn(),
    retryUyapFailedRequests: vi.fn(),
  },
}));

// Dosya okuma bu spec'in konusu değil (ayrı spec'lerde ölçülür); deterministik base64.
vi.mock('@/lib/read-file-base64', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/read-file-base64')>();
  return { ...actual, readFileAsBase64: vi.fn(async () => 'QkFTRTY0') };
});

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

/** İletim iddiası taşıyan ifadeler (Türkçe büyük İ harfi `i` bayrağıyla eşleşmediği için açık yazılır). */
const DISPATCH_CLAIM = /İLETİLDİ|iletildi|İletildi|GÖNDERİLDİ|gönderildi|Gönderildi|KESİNLEŞTİ/;

const SIMULATED_OK = {
  success: true,
  requestId: 'req-1',
  data: {
    simulated: true,
    dispatched: false,
    providerAccepted: false,
    legalEffectConfirmed: false,
    stubReference: 'DOC-1',
    message: 'Evrak için yerel UYAP gönderim simülasyonu oluşturuldu; gerçek UYAP gönderimi yapılmadı.',
  },
};

function primeReads() {
  mocked.getUyapStatus.mockResolvedValue({ connected: true, mode: 'STUB', message: 'ok' });
  mocked.validateUyapCasePoa.mockResolvedValue({ isValid: true, errors: [], canProceedToUyap: true });
  mocked.getUyapRequestHistory.mockResolvedValue([]);
  mocked.getCaseDebtors.mockResolvedValue({
    items: [{ caseDebtorId: 'cd-1', displayName: 'Ahmet Yılmaz', role: 'ASIL_BORCLU' }],
  });
  mocked.getPreHacizIntelligence.mockResolvedValue({ debtors: [], overallLevel: 'YOK' });
}

async function openTab(name: 'Evrak Gönder' | 'Haciz Talebi') {
  render(<UyapPanel caseId="case-1" />);
  fireEvent.click(await screen.findByRole('tab', { name }));
  return screen.findByRole('tabpanel');
}

async function fillAndSubmitDocument() {
  const panel = await openTab('Evrak Gönder');
  fireEvent.change(within(panel).getByPlaceholderText(/Örn:/), { target: { value: 'Dilekçe - 2026/1' } });
  const file = new File(['%PDF-1.4'], 'dilekce.pdf', { type: 'application/pdf' });
  fireEvent.change(panel.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
  fireEvent.click(within(panel).getByRole('button', { name: "UYAP'a Gönder" }));
  return panel;
}

/**
 * Gönderimden sonra tazeleme sırasında panel yükleme iskeletine döner ve sekme paneli YENİDEN oluşturulur;
 * önceki `panel` referansı DOM'dan kopar. Form durumu sorguları tazeleme bittikten sonra CANLI panelde yapılır.
 */
async function livePanelAfterRefresh() {
  await waitFor(() => expect(mocked.getUyapStatus).toHaveBeenCalledTimes(2));
  const live = await screen.findByRole('tabpanel');
  expect(live.isConnected).toBe(true);
  return live;
}

async function fillAndSubmitHaciz() {
  const panel = await openTab('Haciz Talebi');
  await within(panel).findByText('Ahmet Yılmaz');
  fireEvent.change(within(panel).getByPlaceholderText('0.00'), { target: { value: '1000' } });
  fireEvent.click(within(panel).getByRole('button', { name: 'Haciz Talebi Gönder' }));
  return panel;
}

beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  primeReads();
});

afterEach(() => {
  cleanup();
});

describe('DV-198/e — genel evrak türü listesi', () => {
  it('Haciz Talebi ve Takip Talebi listede YOK; varsayılan DILEKCE ve istek bu türü taşır', async () => {
    mocked.submitUyapDocument.mockResolvedValue(SIMULATED_OK);
    const panel = await openTab('Evrak Gönder');

    const select = within(panel).getByRole('combobox', { name: 'Evrak Türü' }) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => [o.value, o.textContent]);
    expect(options).toEqual([
      ['DILEKCE', 'Dilekçe'],
      ['BEYAN', 'Beyan'],
      ['ITIRAZ', 'İtiraz'],
      ['DIGER', 'Diğer'],
    ]);
    expect(options.flat()).not.toContain('HACIZ_TALEBI');
    expect(options.flat()).not.toContain('TAKIP_TALEBI');
    expect(select.value).toBe('DILEKCE');

    fireEvent.change(within(panel).getByPlaceholderText(/Örn:/), { target: { value: 'Dilekçe - 2026/1' } });
    const file = new File(['%PDF-1.4'], 'dilekce.pdf', { type: 'application/pdf' });
    fireEvent.change(panel.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
    fireEvent.click(within(panel).getByRole('button', { name: "UYAP'a Gönder" }));

    await waitFor(() => expect(mocked.submitUyapDocument).toHaveBeenCalledTimes(1));
    expect(mocked.submitUyapDocument.mock.calls[0][0]).toMatchObject({ caseId: 'case-1', documentType: 'DILEKCE' });
  });

  it('evrak formu kullanıcıyı Haciz sekmesine YÖNLENDİRMEZ', async () => {
    const panel = await openTab('Evrak Gönder');
    expect(panel.textContent).not.toMatch(/Haciz sekme/i);
  });
});

describe('DV-198/e — evrak gönderim sonucu sunucu yanıtına dayanır', () => {
  it('yerel simülasyon yanıtı → simülasyon metni VAR; "İLETİLDİ / gönderildi" YOK', async () => {
    mocked.submitUyapDocument.mockResolvedValue(SIMULATED_OK);
    await fillAndSubmitDocument();

    const notice = await screen.findByTestId('submit-result-notice');
    expect(notice.getAttribute('data-result-kind')).toBe('SIMULATED');
    expect(notice.textContent).toContain('yalnız yerel simülasyon kaydı oluşturuldu');
    expect(notice.textContent).toContain('gerçek UYAP gönderimi YAPILMADI');
    expect(document.body.textContent).not.toMatch(DISPATCH_CLAIM);
    // Sunucu kaydı oluştu → aynı evrak yeniden gönderilmez (form temizlenir).
    expect(screen.queryByDisplayValue('Dilekçe - 2026/1')).toBeNull();
  });

  it.each([
    ['dispatched alanı yok', { success: true, requestId: 'r', data: { simulated: true } }],
    ['data yok', { success: true, requestId: 'r' }],
    ['dispatched dizgi "true"', { success: true, data: { simulated: false, dispatched: 'true' } }],
    ['çelişkili beyan (simulated + dispatched)', { success: true, data: { simulated: true, dispatched: true } }],
    ['success alanı yok', { data: { simulated: true, dispatched: false } }],
    ['gövde null', null],
    ['gövde dizi', [SIMULATED_OK]],
  ])('belirsiz yanıt (%s) → doğrulanamadı; iletim / simülasyon iddiası YOK', async (_label, response) => {
    mocked.submitUyapDocument.mockResolvedValue(response);
    await fillAndSubmitDocument();

    const notice = await screen.findByTestId('submit-result-notice');
    expect(notice.getAttribute('data-result-kind')).toBe('UNVERIFIED');
    expect(notice.textContent).toContain('Sunucu yanıtı doğrulanamadı; UYAP iletimi iddia EDİLMEZ.');
    expect(notice.textContent).not.toContain('simülasyon');
    expect(document.body.textContent).not.toMatch(DISPATCH_CLAIM);
  });

  it.each([
    ['dispatched alanı yok', { success: true, requestId: 'r', data: { simulated: true } }],
    ['gövde null', null],
  ])('Ek 95 / E1 — belirsiz yanıt (%s) → form KORUNUR, mükerrer uyarısı görünür, otomatik ikinci istek YOK', async (_label, response) => {
    mocked.submitUyapDocument.mockResolvedValue(response);
    const stalePanel = await fillAndSubmitDocument();

    const notice = await screen.findByTestId('submit-result-notice');
    expect(notice.textContent).toContain('Sunucu yanıtı doğrulanamadı');
    expect(notice.textContent).toContain('Kayıt oluşmuş olabilir');
    expect(notice.textContent).toContain('mükerrer işlem oluşturabilir');
    expect(notice.textContent).toContain('Geçmiş sekmesini kontrol edin');

    // Form (tür / ad / dosya) korunur; kullanıcı bilerek yeniden gönderebilir.
    const panel = await livePanelAfterRefresh();
    expect(panel).not.toBe(stalePanel);
    const select = within(panel).getByRole('combobox', { name: 'Evrak Türü' }) as HTMLSelectElement;
    expect(select.value).toBe('DILEKCE');
    expect(within(panel).getByDisplayValue('Dilekçe - 2026/1')).toBeTruthy();
    const submit = within(panel).getByRole('button', { name: "UYAP'a Gönder" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false); // dosya state'i korundu (dosya yoksa düğme kapalı olurdu)

    // Otomatik yeniden gönderme YOK: tazeleme tamamlandıktan sonra da tek istek.
    await new Promise((r) => setTimeout(r, 50));
    expect(mocked.submitUyapDocument).toHaveBeenCalledTimes(1);
  });

  it('Ek 95 / E1 — yerel simülasyon yolu önceki gibi: form temizlenir, mükerrer uyarısı YOK, tek istek', async () => {
    mocked.submitUyapDocument.mockResolvedValue(SIMULATED_OK);
    await fillAndSubmitDocument();

    const notice = await screen.findByTestId('submit-result-notice');
    expect(notice.getAttribute('data-result-kind')).toBe('SIMULATED');
    expect(notice.textContent).not.toContain('mükerrer');
    const panel = await livePanelAfterRefresh();
    expect(within(panel).queryByDisplayValue('Dilekçe - 2026/1')).toBeNull();
    expect((within(panel).getByRole('button', { name: "UYAP'a Gönder" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocked.submitUyapDocument).toHaveBeenCalledTimes(1);
  });

  it('yalnız sunucu dispatched:true beyan ederse iletim bildirilir', async () => {
    mocked.submitUyapDocument.mockResolvedValue({ success: true, data: { simulated: false, dispatched: true } });
    await fillAndSubmitDocument();

    const notice = await screen.findByTestId('submit-result-notice');
    expect(notice.getAttribute('data-result-kind')).toBe('DISPATCHED');
    expect(notice.textContent).toBe("Sunucu evrakın UYAP'a iletimini bildirdi.");
    // Ek 95 / E1: doğrulanmış iletim yolu önceki gibi formu temizler; tek istek.
    const panel = await livePanelAfterRefresh();
    expect(within(panel).getByPlaceholderText(/Örn:/)).toBeTruthy();
    expect(within(panel).queryByDisplayValue('Dilekçe - 2026/1')).toBeNull();
    expect(mocked.submitUyapDocument).toHaveBeenCalledTimes(1);
  });

  it('tazeleme başarısız (stale) → bayat uyarısında iletim iddiası YOK; sonuç yine simülasyon', async () => {
    mocked.submitUyapDocument.mockResolvedValue(SIMULATED_OK);
    const panel = await openTab('Evrak Gönder');
    // İlk yükleme bittikten SONRA tazelemeyi boz.
    mocked.getUyapRequestHistory.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fireEvent.change(within(panel).getByPlaceholderText(/Örn:/), { target: { value: 'Dilekçe - 2026/1' } });
    const file = new File(['%PDF-1.4'], 'dilekce.pdf', { type: 'application/pdf' });
    fireEvent.change(panel.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
    fireEvent.click(within(panel).getByRole('button', { name: "UYAP'a Gönder" }));

    const stale = await screen.findByTestId('stale-notice');
    expect(stale.textContent).toContain('panel yenilenemedi');
    expect(stale.textContent).not.toMatch(DISPATCH_CLAIM);
    expect(screen.getByTestId('submit-result-notice').getAttribute('data-result-kind')).toBe('SIMULATED');
    expect(document.body.textContent).not.toMatch(DISPATCH_CLAIM);
  });

  it('gövdede success:false → hata görünür, form KORUNUR, iletim iddiası YOK', async () => {
    mocked.submitUyapDocument.mockResolvedValue({ success: false, errorCode: 'UYAP_DOCUMENT_ERROR', errorMessage: 'iç ayrıntı' });
    await fillAndSubmitDocument();

    await screen.findByText('Evrak gönderilemedi. Evrak UYAP’a İLETİLMEDİ, lütfen tekrar deneyin.');
    expect(screen.queryByTestId('submit-result-notice')).toBeNull();
    expect(screen.getByDisplayValue('Dilekçe - 2026/1')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(DISPATCH_CLAIM);
  });

  it.each([
    [400, 'Takip talebi yalnız XML gönderim yolundan gönderilebilir.', 'UYAP_TAKIP_TALEBI_XML_SUBMIT_REQUIRED'],
    [403, 'Evrak gönderimi yapılamaz: dosyaya atanmış ve vekaletli avukat gerekli.', 'POLICY_DENIED'],
  ])('sunucu %i reddi → sunucu iletisi gösterilir, başarı bildirimi YOK', async (status, message, code) => {
    mocked.submitUyapDocument.mockRejectedValue(
      Object.assign(new Error(message), { status, body: { statusCode: status, code, message } }),
    );
    await fillAndSubmitDocument();

    await screen.findByText(message);
    expect(screen.queryByTestId('submit-result-notice')).toBeNull();
    expect(screen.getByDisplayValue('Dilekçe - 2026/1')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Haciz sekme/i);
  });
});

describe('DV-198/e — Haciz sekmesi kısıtı', () => {
  it('kısıt metni görünür: haciz şu anda gönderilemiyor, aşama kuralı ayrı karar bekliyor', async () => {
    const panel = await openTab('Haciz Talebi');
    const note = within(panel).getByTestId('haciz-kisit-notice');
    expect(note.getAttribute('role')).toBe('note');
    expect(note.textContent).toContain('Haciz talebi şu anda gönderilemiyor.');
    expect(note.textContent).toContain('aşama kuralı ayrı bir karar bekliyor');
    expect(note.textContent).toContain('sunucunun ret iletisi');
  });

  it('aşama mantığı istemcide KODLANMAZ: düğme sunucuya gider, sunucu 400 iletisi gösterilir', async () => {
    const message = 'Bu işlem dosyanın mevcut aşamasında yapılamaz.';
    mocked.sendUyapHacizRequest.mockRejectedValue(
      Object.assign(new Error(message), { status: 400, body: { statusCode: 400, code: 'STAGE_NOT_ALLOWED', message } }),
    );
    const panel = await fillAndSubmitHaciz();

    await within(panel).findByText(message);
    expect(mocked.sendUyapHacizRequest).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('submit-result-notice')).toBeNull();
    expect(within(panel).getByDisplayValue('1000')).toBeTruthy();
  });

  it('sunucu 403 iletisi gösterilir', async () => {
    const message = 'Haciz talebi yapılamaz: yetki doğrulanamadı';
    mocked.sendUyapHacizRequest.mockRejectedValue(
      Object.assign(new Error(message), { status: 403, body: { statusCode: 403, code: 'TRIGGER_HACIZ_AUTHORITY_DENIED', message } }),
    );
    const panel = await fillAndSubmitHaciz();
    await within(panel).findByText(message);
  });

  it('haciz yerel simülasyon yanıtı → simülasyon metni; "İLETİLDİ" YOK (stale yolunda da)', async () => {
    mocked.sendUyapHacizRequest.mockResolvedValue({
      success: true,
      requestId: 'req-h',
      data: { simulated: true, dispatched: false, stubReference: 'HCZ-1', targetType: 'BANK' },
    });
    const panel = await openTab('Haciz Talebi');
    await within(panel).findByText('Ahmet Yılmaz');
    mocked.getUyapRequestHistory.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fireEvent.change(within(panel).getByPlaceholderText('0.00'), { target: { value: '1000' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Haciz Talebi Gönder' }));

    const notice = await screen.findByTestId('submit-result-notice');
    expect(notice.textContent).toBe(
      'Haciz talebi için yalnız yerel simülasyon kaydı oluşturuldu; gerçek UYAP gönderimi YAPILMADI.',
    );
    const stale = await screen.findByTestId('stale-notice');
    expect(stale.textContent).not.toMatch(DISPATCH_CLAIM);
    expect(document.body.textContent).not.toMatch(DISPATCH_CLAIM);
  });

  it('haciz belirsiz yanıt → doğrulanamadı; iletim iddiası YOK', async () => {
    mocked.sendUyapHacizRequest.mockResolvedValue({ success: true, requestId: 'req-h' });
    await fillAndSubmitHaciz();

    const notice = await screen.findByTestId('submit-result-notice');
    expect(notice.getAttribute('data-result-kind')).toBe('UNVERIFIED');
    expect(document.body.textContent).not.toMatch(DISPATCH_CLAIM);
  });

  it('Ek 95 / E1 — haciz belirsiz yanıt → tutar / ayrıntı KORUNUR, mükerrer uyarısı görünür, otomatik ikinci istek YOK', async () => {
    mocked.sendUyapHacizRequest.mockResolvedValue({ success: true, requestId: 'req-h' });
    const panel = await openTab('Haciz Talebi');
    await within(panel).findByText('Ahmet Yılmaz');
    fireEvent.change(within(panel).getByPlaceholderText('0.00'), { target: { value: '1000' } });
    fireEvent.change(within(panel).getByPlaceholderText(/Banka adı/), { target: { value: 'Banka X' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Haciz Talebi Gönder' }));

    const notice = await screen.findByTestId('submit-result-notice');
    expect(notice.textContent).toContain('Kayıt oluşmuş olabilir');
    expect(notice.textContent).toContain('mükerrer işlem oluşturabilir');
    const live = await livePanelAfterRefresh();
    expect(live).not.toBe(panel);
    expect(within(live).getByDisplayValue('1000')).toBeTruthy();
    expect(within(live).getByDisplayValue('Banka X')).toBeTruthy();

    await new Promise((r) => setTimeout(r, 50));
    expect(mocked.sendUyapHacizRequest).toHaveBeenCalledTimes(1);
  });

  it('Ek 95 / E1 — haciz simülasyon yolu önceki gibi: tutar temizlenir, mükerrer uyarısı YOK', async () => {
    mocked.sendUyapHacizRequest.mockResolvedValue({ success: true, data: { simulated: true, dispatched: false } });
    await fillAndSubmitHaciz();

    const notice = await screen.findByTestId('submit-result-notice');
    expect(notice.getAttribute('data-result-kind')).toBe('SIMULATED');
    expect(notice.textContent).not.toContain('mükerrer');
    const panel = await livePanelAfterRefresh();
    expect(within(panel).getByPlaceholderText('0.00')).toBeTruthy();
    expect(within(panel).queryByDisplayValue('1000')).toBeNull();
    expect(mocked.sendUyapHacizRequest).toHaveBeenCalledTimes(1);
  });
});
