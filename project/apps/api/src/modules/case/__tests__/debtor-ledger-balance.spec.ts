import { buildDebtorLedgerBalances, type DebtorLedgerItemRow } from '../debtor-ledger-balance';

const cd = (id: string, debtorId: string, role: string, lifecycleStatus = 'ACTIVE') => ({
  id,
  debtorId,
  role,
  lifecycleStatus,
  name: `${role} ${debtorId}`,
});
const item = (over: Partial<DebtorLedgerItemRow> & { id: string; itemType: string }): DebtorLedgerItemRow => ({
  description: null,
  currency: 'TRY',
  amount: null,
  demandedAmount: 0,
  collectedAmount: 0,
  isAllDebtorsLiable: true,
  liableDebtorIds: [],
  ...over,
});

describe('K3-L Faz 1c borçlu bazlı bakiye (kalıcı defterden, işleyen faiz hariç)', () => {
  const debtors = [cd('cd-k', 'k', 'KESIDECI'), cd('cd-c', 'c', 'CIRANTA')];
  const items = [
    item({ id: 'p', itemType: 'PRINCIPAL', demandedAmount: '10000.00', collectedAmount: '500.00' }),
    item({ id: 't', itemType: 'CHECK_PENALTY', demandedAmount: '1000.00', collectedAmount: '0', isAllDebtorsLiable: false, liableDebtorIds: ['k'] }),
  ];

  it('keşideci: ortak bedel + kendi tazminatı; ciranta: yalnız ortak bedel; ortak tahsilat herkes için düşer', () => {
    const result = buildDebtorLedgerBalances({ caseDebtors: debtors, items });
    expect(result).toMatchObject({ kaynak: 'KALICI_DEFTER', isleyenFaizDahil: false, sorumlusuBulunamayanKalemler: [] });
    const [kesideci, ciranta] = result.borclular;
    expect(kesideci.kalemler.map((l) => [l.claimItemId, l.kalan, l.ortak])).toEqual([
      ['p', 9500, true],
      ['t', 1000, false],
    ]);
    expect(kesideci.toplamlar).toEqual([{ paraBirimi: 'TRY', tutar: 11000, tahsilEdilen: 500, kalan: 10500 }]);
    expect(ciranta.kalemler.map((l) => l.claimItemId)).toEqual(['p']);
    expect(ciranta.toplamlar).toEqual([{ paraBirimi: 'TRY', tutar: 10000, tahsilEdilen: 500, kalan: 9500 }]);
  });

  it('pasif borçlu listelenmez; sorumlusu etkin borçlu olmayan kısıtlı kalem kimseye yazılmaz, ayrıca raporlanır', () => {
    const result = buildDebtorLedgerBalances({
      caseDebtors: [cd('cd-k', 'k', 'KESIDECI', 'PASSIVE'), cd('cd-c', 'c', 'CIRANTA')],
      items: [...items, item({ id: 'x', itemType: 'OTHER', demandedAmount: 50, isAllDebtorsLiable: false, liableDebtorIds: [] })],
    });
    expect(result.borclular.map((b) => b.caseDebtorId)).toEqual(['cd-c']);
    expect(result.sorumlusuBulunamayanKalemler.map((l) => l.claimItemId).sort()).toEqual(['t', 'x']);
  });

  it('fazla tahsilat kalanı eksiye düşürmez; para birimleri ayrı toplanır; demandedAmount yoksa amount', () => {
    const result = buildDebtorLedgerBalances({
      caseDebtors: [cd('cd-k', 'k', 'KESIDECI')],
      items: [
        item({ id: 'a', itemType: 'PRINCIPAL', demandedAmount: '100.00', collectedAmount: '150.00' }),
        item({ id: 'b', itemType: 'PRINCIPAL', currency: 'USD', demandedAmount: null, amount: '20.005' }),
      ],
    });
    expect(result.borclular[0].toplamlar).toEqual([
      { paraBirimi: 'TRY', tutar: 100, tahsilEdilen: 150, kalan: 0 },
      { paraBirimi: 'USD', tutar: 20.01, tahsilEdilen: 0, kalan: 20.01 },
    ]);
  });
});

describe('borçlu adına izlenen fazla ödeme (yalnız gösterim; kalan / toplam hesabına girmez)', () => {
  const debtors = [cd('cd-a', 'a', 'ASIL_BORCLU'), cd('cd-b', 'b', 'ASIL_BORCLU')];
  const items = [item({ id: 'p', itemType: 'PRINCIPAL', demandedAmount: '9000.00', collectedAmount: '5400.00' })];
  const withoutNewFields = (result: ReturnType<typeof buildDebtorLedgerBalances>) => ({
    ...result,
    fazlaOdemeNotu: undefined,
    borclular: result.borclular.map((b) => ({ ...b, borcluAdinaFazlaOdeme: undefined })),
  });

  it('fazla ödeme verilmezse çıktıya hiçbir alan eklenmez (öncesiyle birebir)', () => {
    const result = buildDebtorLedgerBalances({ caseDebtors: debtors, items });
    expect(Object.keys(result)).not.toContain('fazlaOdemeNotu');
    for (const borclu of result.borclular) expect(Object.keys(borclu)).not.toContain('borcluAdinaFazlaOdeme');
    expect(buildDebtorLedgerBalances({ caseDebtors: debtors, items, debtorOverpayments: [] })).toEqual(result);
  });

  it('yalnız atfedildiği borçluda görünür; aynı para birimindeki kayıtlar toplanır, tahsilat sayısı yazılır; not eklenir', () => {
    const base = buildDebtorLedgerBalances({ caseDebtors: debtors, items });
    const result = buildDebtorLedgerBalances({
      caseDebtors: debtors,
      items,
      debtorOverpayments: [
        { caseDebtorId: 'cd-a', remainingAmount: '600.00', currency: 'TRY' },
        { caseDebtorId: 'cd-a', remainingAmount: '150.50', currency: 'TRY' },
      ],
    });
    const [a, b] = result.borclular;
    expect(a.borcluAdinaFazlaOdeme).toEqual([{ paraBirimi: 'TRY', tutar: 750.5, tahsilatSayisi: 2 }]);
    expect(Object.keys(b)).not.toContain('borcluAdinaFazlaOdeme');
    expect(result.fazlaOdemeNotu).toContain('borçtan düşülmez');
    expect(result.fazlaOdemeNotu).toContain('İade ve başka borca mahsup komutları bu sürümde yoktur');
    // Kalan ve toplamlar fazla ödemeden ETKİLENMEZ.
    expect(withoutNewFields(result)).toEqual(withoutNewFields(base));
    expect(a.toplamlar).toEqual([{ paraBirimi: 'TRY', tutar: 9000, tahsilEdilen: 5400, kalan: 3600 }]);
  });

  it('para birimleri ayrı ve sıralı; sıfır ya da negatif kalan yok sayılır', () => {
    const result = buildDebtorLedgerBalances({
      caseDebtors: debtors,
      items,
      debtorOverpayments: [
        { caseDebtorId: 'cd-b', remainingAmount: '10.00', currency: 'USD' },
        { caseDebtorId: 'cd-b', remainingAmount: '20.00', currency: 'EUR' },
        { caseDebtorId: 'cd-b', remainingAmount: '0', currency: 'TRY' },
        { caseDebtorId: 'cd-a', remainingAmount: '-5', currency: 'TRY' },
      ],
    });
    const [a, b] = result.borclular;
    expect(Object.keys(a)).not.toContain('borcluAdinaFazlaOdeme');
    expect(b.borcluAdinaFazlaOdeme).toEqual([
      { paraBirimi: 'EUR', tutar: 20, tahsilatSayisi: 1 },
      { paraBirimi: 'USD', tutar: 10, tahsilatSayisi: 1 },
    ]);
  });

  it('etkin olmayan borçluya atfedilen fazla ödeme kimseye yazılmaz ve not eklenmez', () => {
    const result = buildDebtorLedgerBalances({
      caseDebtors: [cd('cd-a', 'a', 'ASIL_BORCLU', 'PASSIVE'), cd('cd-b', 'b', 'ASIL_BORCLU')],
      items,
      debtorOverpayments: [{ caseDebtorId: 'cd-a', remainingAmount: '600.00', currency: 'TRY' }],
    });
    expect(result.borclular.map((borclu) => borclu.caseDebtorId)).toEqual(['cd-b']);
    expect(Object.keys(result.borclular[0])).not.toContain('borcluAdinaFazlaOdeme');
    expect(Object.keys(result)).not.toContain('fazlaOdemeNotu');
  });
});
