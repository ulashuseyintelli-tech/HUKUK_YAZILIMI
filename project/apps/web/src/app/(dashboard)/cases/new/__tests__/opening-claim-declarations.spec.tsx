import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import NewCasePage from '../page';
import { api } from '@/lib/api';

/**
 * Yeni dosya sihirbazı — açılış kalem beyanları (owner talimatı 2026-11-18).
 *
 * GERÇEK sayfa render edilir (gerçek kalem → due köprüsü, gerçek önizleme isteği kurucusu, gerçek gönderim); yalnız ağ,
 * Next yönlendirme ve borçlu adımının tarama bileşeni mock'tur.
 *
 * Kanıtlanan:
 *  1. Vekâlet ücreti kaynağı, ilam bilgisi (kesinleşme tarihi dahil) ve yargılama gideri türü dosya açılış isteğinde kaleme
 *     yazılacak biçimde gider. "Faiz işler" beyanı ve sorumluluk seçimi kalem gövdesinde DEĞİL, ayrı beyan bloğunda ve
 *     gösterilen önizlemenin özetiyle gider; beyanlı kalemde açılışta faiz tarihi gönderilmez.
 *  2. Önizleme isteği ile açılış isteği AYNI kalemleri ve borçluları taşır (sunucu özeti bu girdiye bağlıdır).
 *  3. Onaya gidecek beyan varken güncel ve uygulanabilir önizleme yoksa dosya açılış isteği gönderilmez.
 *  4. Beyan yoksa açılış bugünkü gibidir: beyan bloğu gönderilmez, önizleme hatası açılışı engellemez.
 *  5. Açılış yanıtındaki talep sonucu kullanıcıya gösterilir (yönlendirmeden önce).
 * Adlar, tutarlar, mahkeme ve tarihler SENTETİKTİR.
 */

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: {
    getLawyers: vi.fn(),
    searchDebtors: vi.fn(),
    getNextFileNumber: vi.fn(),
    createCase: vi.fn(),
    previewCekFormation: vi.fn(),
    previewCaseOpeningClaims: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/cases/new',
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('@/lib/api/interest-engine', () => ({
  interestEngineApi: {
    preview: vi.fn(async () => ({
      success: true,
      data: { estimatedInterest: 0, currentRate: 0, days: 0, interestType: 'LEGAL_3095' },
      cached: false,
    })),
  },
  InterestTypeCode: {
    LEGAL_3095: 'LEGAL_3095',
    COMMERCIAL_AVANS_3095_2_2: 'COMMERCIAL_AVANS_3095_2_2',
    COMMERCIAL_FIXED: 'COMMERCIAL_FIXED',
    CONTRACTUAL: 'CONTRACTUAL',
    MEVDUAT_TL_BANKALARCA: 'MEVDUAT_TL_BANKALARCA',
    MEVDUAT_TL_KAMU: 'MEVDUAT_TL_KAMU',
  },
  requiresFixedRate: () => false,
  formatRate: (r: number) => String(r),
}));

vi.mock('@/lib/api/fee-engine', () => ({
  feeEngineApi: {
    preview: vi.fn(async () => ({ success: false, error: { code: 'UNAVAILABLE', message: 'test' }, cached: false })),
  },
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u1', tenantId: 't1' }, loading: false }),
}));

vi.mock('@/components/debtor', () => ({
  DebtorStep: () => <div data-testid="stub-debtor-step" />,
}));

const mocked = api as unknown as Record<
  'getLawyers' | 'searchDebtors' | 'getNextFileNumber' | 'createCase' | 'previewCaseOpeningClaims' | 'get' | 'post',
  ReturnType<typeof vi.fn>
>;

const LOOKUPS = {
  takipTuru: [{ id: 'tt-ilamli', name: 'İlamlı Takip', code: 'ILAMLI' }],
  asama: [{ id: 'as-1', name: 'Dosya Açıldı', code: 'DOSYA_ACILDI' }],
  risk: [],
  durumEtiketi: [],
  mahiyetTipi: [],
};

function routeApi() {
  mocked.getLawyers.mockResolvedValue([]);
  mocked.searchDebtors.mockResolvedValue([]);
  mocked.getNextFileNumber.mockResolvedValue('2026/1');
  mocked.get.mockImplementation((url: string) => {
    const u = String(url);
    if (u.startsWith('/lookups')) return Promise.resolve({ data: { data: LOOKUPS } });
    if (u.startsWith('/cases/responsible-candidates')) {
      return Promise.resolve({ data: { data: [{ type: 'LAWYER', id: 'l1', displayName: 'Av. Bir', subtitle: '' }] } });
    }
    return Promise.resolve({ data: { data: [] } });
  });
  mocked.post.mockResolvedValue({ data: {} });
}

const DRAFT_KEY = 'case_wizard_draft:t1:u1';
const TAKIP = '2026-10-20';
const KESINLESME = '2025-04-02';
const ILAM = { mahkemeAdi: 'Sentetik 1. Asliye Hukuk Mahkemesi', esasNo: '2024/1', kararNo: '2025/2', ilamTarihi: '2025-02-03', kesinlesmeTarihi: KESINLESME };

const BEYAN = {
  vekaletUcretiKaynagi: 'JUDGMENT_AWARDED',
  ilamKaynakli: true,
  faizIsler: true,
  faizBaslangic: KESINLESME,
  faizDayanak: 'JUDGMENT_FINALIZATION_DATE',
  sorumluluk: {
    mode: 'PROPORTIONAL',
    shareKind: 'EQUAL',
    parties: { d1: { selected: true, percent: '', limit: '', unlimited: false }, d2: { selected: true, percent: '', limit: '', unlimited: false } },
    basis: 'COURT_JUDGMENT',
    basisNote: '',
  },
};

const kalem = (kalemTuru: string, tutar: number, extra: Record<string, unknown> = {}) => ({
  kalemTuru,
  toplamTutar: tutar,
  bakiyeTutar: tutar,
  currency: 'TRY',
  vadeTarihi: KESINLESME,
  takipOncesiFaiz: 'YASAL',
  takipSonrasiFaiz: 'YASAL',
  faizOrani: null,
  faizsizGerekce: '',
  ...extra,
});

/** Gönderime hazır taslak (son adım): iki borçlu, ilamdan doğan vekâlet ücreti (beyanlı / beyansız) ve yargılama gideri. */
const seedDraft = (withDeclarations: boolean) =>
  window.localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({
      currentStep: 5,
      caseData: { fileNumber: '2026/7', takipTuruId: 'tt-ilamli', startDate: TAKIP, currency: 'TRY', interestType: 'YASAL', interestTypeSelected: true },
      formSelection: { formCode: 'FORM_7', subFormCode: null },
      hesapTarihi: '2026-11-01',
      lawyers: [{ id: 'l1', name: 'Bir', surname: 'Avukat', isResponsible: true }],
      creditors: [{ id: 'c1', type: 'COMPANY', name: 'Sentetik Alacaklı A.Ş.' }],
      caseDebtors: [
        { debtorId: 'd1', role: 'ASIL_BORCLU', debtor: { id: 'd1', type: 'INDIVIDUAL', name: 'Sentetik Borçlu Bir' } },
        { debtorId: 'd2', role: 'ASIL_BORCLU', debtor: { id: 'd2', type: 'INDIVIDUAL', name: 'Sentetik Borçlu İki' } },
      ],
      responsiblePerson: { type: 'LAWYER', id: 'l1' },
      claimDraftItems: [
        { id: 'k1', raw: kalem('VEKALET_UCRETI', 4200.01, withDeclarations ? { acilisBeyani: BEYAN, ilamBilgileri: ILAM } : {}) },
        { id: 'k2', raw: kalem('YARGILAMA_GIDERI', 480) },
      ],
      tenantId: 't1',
      userId: 'u1',
      savedAt: new Date().toISOString(),
    }),
  );

const NOTES = { onay: 'Onay notu.', kullaniciTercihi: 'Kullanıcı tercihi notu.', toplam: 'Toplam notu.', tavanKapsami: 'Tavan notu.', onaySirasi: 'Sıra notu.' };
const serverPreview = (patch: Record<string, unknown> = {}) => ({
  paraBirimi: 'TRY',
  kalemler: [
    {
      dueIndex: 0,
      kalemTuru: 'ATTORNEY_FEE',
      aciklama: 'Vekalet Ücreti',
      tutar: 4200.01,
      vekaletUcretiKaynagi: 'JUDGMENT_AWARDED',
      faiz: { acilisDurumu: 'UNKNOWN', onayBekleyecekBeyan: { durum: 'ACCRUES', faizTuruKodu: 'LEGAL_3095', baslangic: KESINLESME, dayanak: 'JUDGMENT_FINALIZATION_DATE' } },
      sorumluluk: {
        acilisTuru: 'BELIRLENMEDI',
        onayBekleyecekSecim: {
          tur: 'PAYLI',
          dayanak: 'COURT_JUDGMENT',
          tavanKapsami: null,
          borclular: [
            { debtorId: 'd1', pay: 2100.01, payAgirligi: 1, tavan: null, sinirsiz: false, sorumlulukSiniri: 2100.01 },
            { debtorId: 'd2', pay: 2100, payAgirligi: 1, tavan: null, sinirsiz: false, sorumlulukSiniri: 2100 },
          ],
        },
      },
    },
    {
      dueIndex: 1,
      kalemTuru: 'YARGILAMA_GIDERI',
      aciklama: 'Yargılama Gideri',
      tutar: 480,
      vekaletUcretiKaynagi: null,
      faiz: { acilisDurumu: 'UNKNOWN', onayBekleyecekBeyan: null },
      sorumluluk: { acilisTuru: 'BELIRLENMEDI', onayBekleyecekSecim: null },
    },
  ],
  kalemTutarlariToplami: 4680.01,
  borcluDagilimi: [
    { debtorId: 'd1', kalemler: [{ dueIndex: 0, durum: 'PAYLI', sorumlulukSiniri: 2100.01 }, { dueIndex: 1, durum: 'BELIRLENMEDI', sorumlulukSiniri: null }], belirlenmeyenKalemSayisi: 1, sorumlulukUstSiniri: null },
    { debtorId: 'd2', kalemler: [{ dueIndex: 0, durum: 'PAYLI', sorumlulukSiniri: 2100 }, { dueIndex: 1, durum: 'BELIRLENMEDI', sorumlulukSiniri: null }], belirlenmeyenKalemSayisi: 1, sorumlulukUstSiniri: null },
  ],
  onayaGidecekFaizBeyaniSayisi: 1,
  onayaGidecekSorumlulukSecimiSayisi: 1,
  hatalar: [],
  uygulanabilir: true,
  onizlemeOzeti: 'sunucu-ozeti-1',
  secimYazmaAcik: true,
  aciklamalar: NOTES,
  ...patch,
});

let alertSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/cases/new');
  alertSpy = vi.fn();
  vi.stubGlobal('alert', alertSpy);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

const MODAL_BUTTON = 'Sadece Oluştur (Mail Sonra)';
const clickCreate = async () => fireEvent.click(await screen.findByRole('button', { name: 'Takibi Oluştur' }));

describe('Sihirbaz — açılış kalem beyanları', () => {
  it('beyanlı açılış: kaleme yazılacak alanlar due gövdesinde; faiz beyanı + seçim ayrı blokta ve gösterilen önizlemenin özetiyle', async () => {
    routeApi();
    seedDraft(true);
    mocked.previewCaseOpeningClaims.mockResolvedValue(serverPreview());
    mocked.createCase.mockResolvedValue({
      id: 'case-new',
      openingClaimRequests: {
        requested: true,
        previewHash: 'sunucu-ozeti-1',
        faizBeyanlari: [{ dueIndex: 0, claimItemId: 'ci-0', status: 'REQUESTED', approvalRequestId: 'a-1' }],
        sorumlulukSecimi: { status: 'REQUESTED', kalemSayisi: 1, approvalRequestId: 'a-2' },
        tamami: true,
        onaySirasiNotu: 'Önce faiz talebi onaylanmalıdır.',
        aciklama: '',
      },
    });
    render(<NewCasePage />);

    // Önizleme kartı sunucu yanıtını gösterir: toplam tek rakam, pay sunucudan, onaya gidecek beyan ayrı.
    expect((await screen.findByTestId('opening-preview-total')).textContent).toBe('4.680,01 TRY');
    expect(screen.getByTestId('opening-preview-pending-liability').textContent).toContain('Sentetik Borçlu Bir: pay 2.100,01 TRY');
    expect(screen.getAllByTestId('claim-item-opening-chip').map((chip) => chip.textContent)).toEqual([
      'İlam vekâlet ücreti',
      'İlamdan doğuyor',
      'Faiz işler: onaya gidecek',
      'Paylı sorumluluk: onaya gidecek',
    ]);

    await clickCreate();
    fireEvent.click(await screen.findByRole('button', { name: MODAL_BUTTON }));
    await vi.waitFor(() => expect(mocked.createCase).toHaveBeenCalledTimes(1));
    const payload = mocked.createCase.mock.calls[0][0];

    expect(payload.dues).toHaveLength(2);
    expect(payload.dues[0]).toMatchObject({
      type: 'VEKALET_UCRETI',
      amount: 4200.01,
      attorneyFeeBasis: 'JUDGMENT_AWARDED',
      sourceDocumentType: 'ILAM',
      ilamMahkeme: ILAM.mahkemeAdi,
      ilamEsasNo: '2024/1',
      ilamKararNo: '2025/2',
      issueDate: '2025-02-03',
      ilamKesinlesmeTarihi: KESINLESME,
      interestTypeCode: 'LEGAL_3095',
      interestAccrualStatus: 'UNKNOWN',
    });
    // Beyan edilen başlangıç onaya gider: kaleme açılışta faiz başlangıç / bitiş tarihi YAZILMAZ; geçici veri gövdeye sızmaz.
    expect(payload.dues[0].interestStartDate).toBeUndefined();
    expect(payload.dues[0].interestEndDate).toBeUndefined();
    expect(payload.dues[0]).not.toHaveProperty('opening');
    // Beyansız kalem bugünkü gibi: kendi türüyle (EXPENSE değil), sihirbazın tarihleriyle; ilam / kaynak alanı yok.
    expect(payload.dues[1]).toMatchObject({ type: 'YARGILAMA_GIDERI', amount: 480, interestStartDate: KESINLESME, interestEndDate: TAKIP });
    expect(payload.dues[1].sourceDocumentType).toBeUndefined();
    expect(payload.dues[1].attorneyFeeBasis).toBeUndefined();

    expect(payload.openingClaimRequests).toEqual({
      interestAccruals: [{ dueIndex: 0, interestStartDate: KESINLESME, interestStartDateProvenance: 'JUDGMENT_FINALIZATION_DATE' }],
      liabilitySelections: [
        {
          dueIndex: 0,
          mode: 'PROPORTIONAL',
          basis: 'COURT_JUDGMENT',
          parties: [
            { debtorId: 'd1', shareWeight: 1 },
            { debtorId: 'd2', shareWeight: 1 },
          ],
        },
      ],
      previewHash: 'sunucu-ozeti-1',
    });

    // Önizleme isteği açılış isteğiyle AYNI girdiyi taşır (sunucu özeti bu girdiye bağlıdır).
    const previewRequest = mocked.previewCaseOpeningClaims.mock.calls.at(-1)![0];
    expect(JSON.stringify(previewRequest.dues)).toBe(JSON.stringify(payload.dues));
    expect(previewRequest.caseDebtors).toEqual(payload.caseDebtors.map((cd: { debtorId: string }) => ({ debtorId: cd.debtorId })));
    const { previewHash, ...declarations } = payload.openingClaimRequests;
    expect(previewHash).toBe('sunucu-ozeti-1');
    expect(previewRequest.openingClaimRequests).toEqual(declarations);
    expect(previewRequest.currency).toBe(payload.currency);

    // Sonuç yönlendirmeden ÖNCE gösterilir.
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/cases/case-new?tab=documents'));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toContain('1 kalem için "faiz işler" beyanı onaya gönderildi.');
    expect(alertSpy.mock.calls[0][0]).toContain('Önce faiz talebi onaylanmalıdır.');
    expect(alertSpy.mock.invocationCallOrder[0]).toBeLessThan(push.mock.invocationCallOrder[0]);
  });

  it('önizleme uygulanabilir değilse dosya açılış isteği gönderilmez; hata kalemin altında görünür', async () => {
    routeApi();
    seedDraft(true);
    mocked.previewCaseOpeningClaims.mockResolvedValue(
      serverPreview({ uygulanabilir: false, hatalar: [{ kod: 'BASIS_REQUIRED', alan: 'SORUMLULUK', dueIndex: 0, debtorId: null, mesaj: 'Sorumluluk seçimi için dayanak seçilmelidir.' }] }),
    );
    render(<NewCasePage />);
    expect((await screen.findByTestId('opening-preview-input-error')).textContent).toBe('Sorumluluk seçimi için dayanak seçilmelidir.');

    await clickCreate();
    expect(await screen.findByText(/Açılış beyanlarında düzeltilmesi gereken girdiler var/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: MODAL_BUTTON })).toBeNull();
    expect(mocked.createCase).not.toHaveBeenCalled();
  });

  it('önizleme alınamadıysa beyanlı dosya açılmaz (gösterilmemiş girdiyle talep açılmaz)', async () => {
    routeApi();
    seedDraft(true);
    mocked.previewCaseOpeningClaims.mockRejectedValue(new Error('ağ hatası'));
    render(<NewCasePage />);
    expect((await screen.findByTestId('opening-preview-error')).textContent).toContain('önizleme olmadan dosya oluşturulmaz');

    await clickCreate();
    expect(await screen.findByText(/Açılış önizlemesi güncel değil/)).toBeTruthy();
    expect(mocked.createCase).not.toHaveBeenCalled();
  });

  it('seçim bayrağı kapalıyken seçim içeren dosya açılmaz', async () => {
    routeApi();
    seedDraft(true);
    mocked.previewCaseOpeningClaims.mockResolvedValue(serverPreview({ secimYazmaAcik: false }));
    render(<NewCasePage />);
    expect(await screen.findByTestId('opening-preview-selection-disabled')).toBeTruthy();

    await clickCreate();
    // (Kart uyarısı da aynı konuyu söyler; burada gönderim kapısının iletisi aranır.)
    expect(await screen.findByText(/Seçimi kaldırıp yeniden gönderin/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: MODAL_BUTTON })).toBeNull();
    expect(mocked.createCase).not.toHaveBeenCalled();
  });

  it('beyansız açılış bugünkü gibidir: beyan bloğu gönderilmez ve önizleme hatası açılışı engellemez', async () => {
    routeApi();
    seedDraft(false);
    mocked.previewCaseOpeningClaims.mockRejectedValue(new Error('ağ hatası'));
    mocked.createCase.mockResolvedValue({ id: 'case-plain' });
    render(<NewCasePage />);
    await screen.findByTestId('opening-preview-error');
    expect(screen.queryAllByTestId('claim-item-opening-chip')).toHaveLength(0);

    await clickCreate();
    fireEvent.click(await screen.findByRole('button', { name: MODAL_BUTTON }));
    await vi.waitFor(() => expect(mocked.createCase).toHaveBeenCalledTimes(1));
    const payload = mocked.createCase.mock.calls[0][0];
    expect(payload).not.toHaveProperty('openingClaimRequests');
    expect(payload.dues.map((due: { type: string }) => due.type)).toEqual(['VEKALET_UCRETI', 'YARGILAMA_GIDERI']);
    expect(payload.dues[0]).toMatchObject({ interestStartDate: KESINLESME, interestEndDate: TAKIP });
    expect(payload.dues[0].attorneyFeeBasis).toBeUndefined();
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/cases/case-plain?tab=documents'));
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('yerleşim sözleşmesi: işlem düğmeleri alt satırda birlikte; kalem düğmesi kaydırma alanının dışında; yatay kaydırma yok', async () => {
    // jsdom yerleşim hesaplamaz: bu yalnız yapı / sınıf sözleşmesini korur. Gerçek erişim (düğmelerin en üstte ve yüzen
    // "Hızlı İşlemler" düğmesinin dışında olması, kaydırma alanı yüksekliği) tarayıcıda 1440x900 ve 1366x768'de ölçüldü.
    routeApi();
    seedDraft(true);
    mocked.previewCaseOpeningClaims.mockResolvedValue(serverPreview());
    render(<NewCasePage />);
    const scroll = await screen.findByTestId('wizard-claims-step-scroll');
    const actions = await screen.findByTestId('wizard-final-actions');
    const add = screen.getByRole('button', { name: '+ Kalemi Listeye Ekle' });
    const create = screen.getByRole('button', { name: 'Takibi Oluştur' });
    expect(actions.contains(add)).toBe(true);
    expect(actions.contains(create)).toBe(true);
    expect(scroll.contains(add)).toBe(false);
    expect(scroll.className.split(/\s+/)).toEqual(expect.arrayContaining(['flex-1', 'min-h-0', 'overflow-y-auto', 'overflow-x-hidden']));
    // Son adımda düğme satırı sıkıştırılır ve sağ alttaki yüzen düğmenin altında kalmaması için içeri alınır.
    expect(screen.getByTestId('wizard-footer').className).toContain('sm:pr-24');
    // Önizleme kartı kaydırma alanının içindedir (formdan sonra).
    expect(scroll.contains(await screen.findByTestId('opening-preview-card'))).toBe(true);
    expect((await screen.findByTestId('opening-preview-draft-panel-note')).textContent).toContain('taslak bir ön hesaptır');
  });

  it('sunucu açılışı "önizleme bayat" diye reddederse taslak korunur, okunur neden gösterilir ve önizleme yenilenir', async () => {
    routeApi();
    seedDraft(true);
    mocked.previewCaseOpeningClaims.mockResolvedValue(serverPreview());
    mocked.createCase.mockRejectedValue(Object.assign(new Error('Conflict'), { body: { code: 'OPENING_CLAIM_PREVIEW_STALE' } }));
    render(<NewCasePage />);
    await screen.findByTestId('opening-preview-total');
    const previewCallsBefore = mocked.previewCaseOpeningClaims.mock.calls.length;

    await clickCreate();
    fireEvent.click(await screen.findByRole('button', { name: MODAL_BUTTON }));
    expect(await screen.findByText(/açılış önizlemesinden sonra kalemler, borçlular ya da beyanlar değişmiş/)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull();
    await vi.waitFor(() => expect(mocked.previewCaseOpeningClaims.mock.calls.length).toBeGreaterThan(previewCallsBefore));
  });
});
