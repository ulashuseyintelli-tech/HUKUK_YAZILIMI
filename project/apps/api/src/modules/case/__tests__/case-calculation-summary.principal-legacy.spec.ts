/**
 * F02 kabul K-1 (owner kararı 22.11.2026, seçenek A) — anaparalı dosyada hesap özeti.
 *
 * Kusur (UB-4 / UB-5): eski yol faizi hiç hesaplamaz (sabit 0) ve toplamı yalnız asıl alacak Due'larından kurar; onaylı
 * ilam vekâlet ücreti ve faizi toplamda yoktu, belirlenmemiş faiz "0,00" görünüyordu.
 * Kural: sunucu onaylı kalemlerin KAYITLI tutarlarını eksiksiz döker (`anaparaliKalemDokumu`); bilinen kalem toplamı
 * faizden AYRI; faiz tutarı ÜRETİLMEZ; nihai borç toplamı `null`. Eski alanlar ve kanonik gölge DEĞİŞMEZ (hesap motoru
 * değişmez). Eski toplam güvenilirse (yalnız asıl alacak, faizi kayıtlı olarak işlemez) döküm üretilmez.
 * Değerler sentetik.
 */
import { CaseService } from '../case.service';
import { buildAnaparaliKalemDokumu } from '../case-calculation-summary.principal-legacy';

const stub = {} as any;

const kalem = (over: Record<string, unknown>) => ({
  id: 'ci-x', itemType: 'PRINCIPAL', status: 'ACTIVE', isVirtual: false, amount: '1000', demandedAmount: '1000',
  currency: 'TRY', description: null, interestAccrualStatus: 'UNKNOWN', attorneyFeeBasis: null, ...over,
});

function makePrisma(claimItems: any[]) {
  return {
    case: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'case-1', type: 'GENERAL', currency: 'TRY', principalAmount: null,
        caseDate: new Date('2026-10-01T00:00:00.000Z'),
        dues: [{ id: 'due-1', type: 'PRINCIPAL', amount: 1000, currency: 'TRY' }],
        collections: [], debtors: [], formType: null, claimItems: [], caseInstruments: [],
      }),
    },
    claimItem: { findMany: jest.fn().mockResolvedValue(claimItems) },
    collectionAllocationHold: { findMany: jest.fn().mockResolvedValue([]) },
  };
}
const service = (prisma: any) => new CaseService(prisma, stub, stub, stub, stub, stub, stub, stub, stub, stub, undefined);

describe('K-1 — anaparalı dosya hesap özeti dökümü (servis)', () => {
  it('[1] asıl alacak + onaylı ilam vekâlet ücreti: kalemler tutarlarıyla dökülür, bilinen toplam ayrı, faiz ve nihai toplam yok', async () => {
    const prisma = makePrisma([
      kalem({ id: 'ci-vu', itemType: 'ATTORNEY_FEE', amount: '2400', demandedAmount: '2400', interestAccrualStatus: 'ACCRUES', attorneyFeeBasis: 'JUDGMENT_AWARDED' }),
      kalem({ id: 'ci-aa', itemType: 'PRINCIPAL', description: 'Sentetik asıl alacak', interestAccrualStatus: 'UNKNOWN' }),
    ]);
    const r: any = await service(prisma).getCalculationSummary('tenant-1', 'case-1', '2026-11-21');
    const d = r.anaparaliKalemDokumu;
    expect(d).toBeDefined();
    expect(d.durum).toBe('NIHAI_TOPLAM_HESAPLANAMADI');
    expect(d.nihaiBorcToplami).toBeNull();
    expect(d.gerekceler).toEqual(['ESKI_YOL_FAIZ_HESAPLAMAZ', 'ESKI_YOL_KALEM_KAPSAMI_DISI']);
    expect(d.paraBirimleri).toHaveLength(1);
    const pb = d.paraBirimleri[0];
    expect(pb.paraBirimi).toBe('TRY');
    expect(pb.kalemler.map((k: any) => [k.kalemTuru, k.tutar, k.faizDurumu])).toEqual([
      ['ATTORNEY_FEE', 2400, 'HESAPLANMADI'],
      ['PRINCIPAL', 1000, 'BELIRLENEMEDI'],
    ]);
    expect(pb.kalemler[0].etiket).toBe('İlam Vekâlet Ücreti (alacak kalemi)');
    expect(pb.kalemTutarlariToplami).toBe(3400);
    expect(pb.faizToplami).toBeNull();
    expect(pb.kalemVeFaizToplami).toBeNull();
    expect(d.faizDurumu).toBe('BELIRLENEMEDI');
    expect(d.mesaj).toContain('faizi hesaplamaz');
    expect(d.mesaj).toContain('nihai mali hesap değildir');
    // Eski alanlar DEĞİŞMEDİ (hesap motoru değişmez): değerler aynen döner
    expect(r.asilAlacak).toBe(1000);
    expect(typeof r.toplamBorc).toBe('number');
    expect(r.takipSonrasiFaiz).toBe(0);
    expect(r.anaparasizKalemDokumu).toBeUndefined();
    expect(prisma.claimItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { caseId: 'case-1', tenantId: 'tenant-1' } }));
  });

  it('[2] yalnız faizi kayıtlı olarak işlemeyen asıl alacak: eski toplam güvenilir → döküm üretilmez (gerçek sıfır korunur)', async () => {
    const r: any = await service(makePrisma([kalem({ interestAccrualStatus: 'NO_INTEREST' })])).getCalculationSummary('tenant-1', 'case-1', '2026-11-21');
    expect(r.anaparaliKalemDokumu).toBeUndefined();
  });

  it('[3] kalem kaydı yoksa (eski dosya) döküm üretilmez; eski gösterim sürer', async () => {
    const r: any = await service(makePrisma([])).getCalculationSummary('tenant-1', 'case-1', '2026-11-21');
    expect(r.anaparaliKalemDokumu).toBeUndefined();
  });
});

describe('K-1 — buildAnaparaliKalemDokumu (saf)', () => {
  it('[4] iptal / feragat / sanal kalem girmez; tahsil edilmiş kalem talep tutarıyla kalır', () => {
    const d = buildAnaparaliKalemDokumu({
      caseCurrency: 'TRY',
      items: [
        kalem({ id: 'a', itemType: 'PRINCIPAL', interestAccrualStatus: 'NO_INTEREST' }),
        kalem({ id: 'b', itemType: 'YARGILAMA_GIDERI', amount: '480', demandedAmount: '480', status: 'COLLECTED', interestAccrualStatus: 'NO_INTEREST' }),
        kalem({ id: 'c', itemType: 'EXPENSE', status: 'CANCELLED' }),
        kalem({ id: 'd', itemType: 'EXPENSE', status: 'WAIVED' }),
        kalem({ id: 'e', itemType: 'EXPENSE', isVirtual: true }),
      ],
    })!;
    expect(d.paraBirimleri[0].kalemler.map((k) => k.claimItemId)).toEqual(['a', 'b']);
    expect(d.paraBirimleri[0].kalemTutarlariToplami).toBe(1480);
    // her kalemin faizi kayıtlı olarak işlemez → faiz gerçek sıfır; asıl alacak dışı kalem olduğu için nihai toplam yine yok
    expect(d.gerekceler).toEqual(['ESKI_YOL_KALEM_KAPSAMI_DISI']);
    expect(d.faizDurumu).toBe('HESAPLANDI');
    expect(d.paraBirimleri[0].faizToplami).toBe(0);
    expect(d.nihaiBorcToplami).toBeNull();
  });

  it('[5] birden çok para birimi tek toplama dönüşmez; tutarı okunamayan kalemde toplam null (sıfır sayılmaz)', () => {
    const d = buildAnaparaliKalemDokumu({
      caseCurrency: 'TRY',
      items: [
        kalem({ id: 'a', currency: 'USD', amount: '100', demandedAmount: '100' }),
        kalem({ id: 'b', currency: 'TRY', amount: null, demandedAmount: null }),
      ],
    })!;
    expect(d.paraBirimleri.map((pb) => [pb.paraBirimi, pb.kalemTutarlariToplami])).toEqual([['TRY', null], ['USD', 100]]);
  });
});
