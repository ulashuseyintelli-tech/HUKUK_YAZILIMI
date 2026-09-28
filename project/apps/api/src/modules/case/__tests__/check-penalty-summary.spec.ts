import { buildCheckPenaltySummary, type CheckPenaltySummaryInput } from '../check-penalty-summary';

const names = new Map([
  ['kesideci', 'Keşideci Ali'],
  ['ciranta', 'Ciranta Ayşe'],
]);
const bounced = { amount: '12345.67', currency: 'TRY', isBounced: true, bounceDate: new Date('2026-09-01T00:00:00.000Z') };
const input = (over: Partial<CheckPenaltySummaryInput> = {}): CheckPenaltySummaryInput => ({
  isCheckCase: true,
  penaltyItems: [],
  checkInstruments: [bounced],
  debtorNames: names,
  pendingApproval: false,
  ...over,
});

describe('K3-L hesap özeti çek tazminatı (owner kararı 2026-09-28: kesin tutar yalnız kalemden)', () => {
  it('kalem varsa tutar/kalan/sorumlular kalemden; tüm borçlulara yayılmaz; tahmin yok', () => {
    const summary = buildCheckPenaltySummary(
      input({
        penaltyItems: [
          {
            id: 'ci-1',
            demandedAmount: '1234.57',
            collectedAmount: '200.00',
            currency: 'TRY',
            isAllDebtorsLiable: false,
            liableDebtorIds: ['kesideci'],
          },
        ],
      }),
    );
    expect(summary).toEqual({
      tutar: 1234.57,
      durum: 'KALEM_VAR',
      mesaj: null,
      kalemler: [
        {
          claimItemId: 'ci-1',
          tutar: 1234.57,
          tahsilEdilen: 200,
          kalan: 1034.57,
          paraBirimi: 'TRY',
          sorumluBorclular: [{ debtorId: 'kesideci', ad: 'Keşideci Ali' }],
          sorumlulukBelirsiz: false,
        },
      ],
      tahmin: null,
    });
  });

  it('sorumluluğu kayıtta belirlenmemiş kalem borçlulara DAĞITILMAZ ve işaretlenir', () => {
    const summary = buildCheckPenaltySummary(
      input({
        penaltyItems: [
          { id: 'ci-2', demandedAmount: 500, collectedAmount: null, currency: 'TRY', isAllDebtorsLiable: true, liableDebtorIds: [] },
        ],
      }),
    );
    expect(summary.kalemler[0]).toMatchObject({ sorumluBorclular: [], sorumlulukBelirsiz: true });
    expect(summary.mesaj).toMatch(/sorumlu borçlular belirlenmemiş/);
    expect(summary.tutar).toBe(500);
  });

  it('birden çok kalem mükerrer toplanmaz: kesin tutar = kalem tutarları toplamı', () => {
    const item = (id: string, amount: string) => ({
      id,
      demandedAmount: amount,
      collectedAmount: '0',
      currency: 'TRY',
      isAllDebtorsLiable: false,
      liableDebtorIds: ['kesideci'],
    });
    expect(buildCheckPenaltySummary(input({ penaltyItems: [item('a', '100.10'), item('b', '200.20')] })).tutar).toBe(300.3);
  });

  it('kalem yok + onay bekleyen talep → ONAY_BEKLIYOR, kesin tutar 0, tahmin yalnız bilgi', () => {
    const summary = buildCheckPenaltySummary(input({ pendingApproval: true }));
    expect(summary).toMatchObject({ tutar: 0, durum: 'ONAY_BEKLIYOR', kalemler: [] });
    expect(summary.mesaj).toMatch(/onay bekliyor/);
    expect(summary.tahmin).toMatchObject({ durum: 'HESAPLANDI', tutar: 1234.57 });
    expect(summary.tahmin?.aciklama).toMatch(/DAHİL DEĞİL/);
  });

  it('kalem yok → OLUSTURULMAMIS; mesaj hakkın yokluğu/vazgeçme olmadığını söyler', () => {
    const summary = buildCheckPenaltySummary(input());
    expect(summary).toMatchObject({ tutar: 0, durum: 'OLUSTURULMAMIS' });
    expect(summary.mesaj).toMatch(/vazgeçildiği anlamına gelmez/);
  });

  it.each([
    ['karşılıksız işaretli çek yok', [{ ...bounced, isBounced: false }]],
    ['karşılıksız tarihi eksik', [{ ...bounced, bounceDate: null }]],
    ['kuruştan fazla ondalık', [{ ...bounced, amount: '100.005' }]],
    ['farklı para birimleri', [bounced, { ...bounced, currency: 'USD' }]],
    ['çek kaydı yok', []],
  ])('doğrulanmış matrah yok (%s) → tutar ÜRETİLMEZ, "hesaplanamadı — veri eksik"', (_name, instruments) => {
    const summary = buildCheckPenaltySummary(input({ checkInstruments: instruments as never }));
    expect(summary.tutar).toBe(0);
    expect(summary.tahmin).toMatchObject({ durum: 'VERI_EKSIK', tutar: null });
    expect(summary.tahmin?.aciklama).toMatch(/^Hesaplanamadı — veri eksik/);
  });

  it('çek dosyası değil ve kalem yok → UYGULANMAZ (hiçbir satır/tahmin yok)', () => {
    expect(buildCheckPenaltySummary(input({ isCheckCase: false, checkInstruments: [] }))).toEqual({
      tutar: 0,
      durum: 'UYGULANMAZ',
      mesaj: null,
      kalemler: [],
      tahmin: null,
    });
  });
});
