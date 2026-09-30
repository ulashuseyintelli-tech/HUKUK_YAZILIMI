/**
 * K3-L Faz 2b — TASLAK çek tazminatı önizlemesi (saf fonksiyon). Sunucu hesabı; girdi eksikse tutar ÜRETİLMEZ
 * (kör "asıl alacak × %10" yok); sorumlu kümesi yalnız keşideci + keşideci lehine aval; hash sıradan bağımsız.
 */
import { CEK_FORMATION_PREVIEW_DRAFT_NOTICE, previewCekFormation } from '../formation-cek/cek-formation-preview';
import { computeCheckPenaltyMinor } from '../formation-cek/cek-penalty';

const bounced = (amount: number | string, over: Record<string, unknown> = {}) => ({
  amount,
  currency: 'TRY',
  isBounced: true,
  bounceDate: '2026-09-01',
  ...over,
});
const kesideci = { tempId: 'd-kesideci', role: 'KESIDECI' };
const ciranta = { tempId: 'd-ciranta', role: 'CIRANTA' };

describe('previewCekFormation (K3-L Faz 2b taslak önizleme)', () => {
  it('karşılıksız çek + keşideci + ciranta → tazminat sunucuda hesaplanır; sorumlu yalnız keşideci; TASLAK işaretli', () => {
    const result = previewCekFormation({ instruments: [bounced(12345.67)], debtors: [kesideci, ciranta] });
    expect(result).toMatchObject({
      taslak: true,
      uyari: CEK_FORMATION_PREVIEW_DRAFT_NOTICE,
      durum: 'HESAPLANDI',
      kod: null,
      tazminat: {
        tutar: Number(computeCheckPenaltyMinor(1234567n, 1000)) / 100,
        paraBirimi: 'TRY',
        basisPoints: 1000,
        sorumluTempIds: ['d-kesideci'],
        bedelSorumluTempIds: ['d-ciranta', 'd-kesideci'],
      },
      girdiOzeti: { cekSayisi: 1, karsiliksizCekSayisi: 1, takipEdilenBorcluSayisi: 2 },
    });
    expect(result.tazminat?.tutar).toBe(1234.57); // 1234.567 → yarıdan yukarı
    expect(result.previewHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.aciklama).toContain('TASLAK');
  });

  it('keşideci lehine aval veren tazminattan sorumlu; ciranta lehine aval veren değil', () => {
    const result = previewCekFormation({
      instruments: [bounced(1000)],
      debtors: [
        kesideci,
        ciranta,
        { tempId: 'd-aval-k', role: 'AVAL', avalForTempId: 'd-kesideci' },
        { tempId: 'd-aval-c', role: 'AVAL', avalForTempId: 'd-ciranta' },
      ],
    });
    expect(result.tazminat?.sorumluTempIds).toEqual(['d-aval-k', 'd-kesideci']);
    expect(result.tazminat?.bedelSorumluTempIds).toEqual(['d-aval-c', 'd-aval-k', 'd-ciranta', 'd-kesideci']);
    expect(result.tazminat?.tutar).toBe(100);
  });

  it.each([
    ['çek yok', { instruments: [], debtors: [kesideci] }, 'CHECK_RECORD_REQUIRED'],
    ['karşılıksız işareti yok', { instruments: [{ amount: 1000, currency: 'TRY' }], debtors: [kesideci] }, 'CHECK_NOT_DISHONOURED'],
    ['karşılıksız tarihi yok', { instruments: [{ amount: 1000, currency: 'TRY', isBounced: true }], debtors: [kesideci] }, 'CHECK_BOUNCE_DATE_REQUIRED'],
    ['geçersiz tarih', { instruments: [bounced(1000, { bounceDate: 'dün' })], debtors: [kesideci] }, 'CHECK_BOUNCE_DATE_REQUIRED'],
    ['kuruşa kesin olmayan tutar', { instruments: [bounced('1000.005')], debtors: [kesideci] }, 'CHECK_AMOUNT_NOT_EXACT'],
    ['sıfır tutar', { instruments: [bounced(0)], debtors: [kesideci] }, 'CHECK_AMOUNT_NOT_EXACT'],
    ['karışık para birimi', { instruments: [bounced(1000), bounced(500, { currency: 'USD' })], debtors: [kesideci] }, 'CHECK_CURRENCY_MIXED'],
    ['takip edilen borçlu yok', { instruments: [bounced(1000)], debtors: [{ ...kesideci, pursued: false }] }, 'LIABLE_DEBTORS_REQUIRED'],
    ['rol asıl borçlu (çek rolü değil)', { instruments: [bounced(1000)], debtors: [{ tempId: 'd1', role: 'ASIL_BORCLU' }] }, 'CHECK_DEBTOR_ROLE_REQUIRED'],
    ['aval lehine bilgisi yok', { instruments: [bounced(1000)], debtors: [kesideci, { tempId: 'd-aval', role: 'AVAL' }] }, 'AVAL_BENEFICIARY_REQUIRED'],
    ['tazminattan sorumlu yok (yalnız ciranta)', { instruments: [bounced(1000)], debtors: [ciranta] }, 'CHECK_PENALTY_NO_LIABLE_DEBTOR'],
  ])('VERI_EKSIK — %s → tutar ÜRETİLMEZ (%s)', (_label, input, kod) => {
    const result = previewCekFormation(input as any);
    expect(result).toMatchObject({ durum: 'VERI_EKSIK', kod, tazminat: null, taslak: true });
    expect(result.aciklama).toContain('Hesaplanamadı — veri eksik');
  });

  it('karşılıksız olmayan çek tazminat hesabına girmez; birden çok karşılıksız çek ayrı ayrı yuvarlanır', () => {
    const result = previewCekFormation({
      instruments: [bounced('100.05'), bounced('100.05'), { amount: 99999, currency: 'TRY', isBounced: false }],
      debtors: [kesideci],
    });
    // 100.05 × %10 = 10.005 → 10.01 (çek başına); toplam 20.02 (toplam üzerinden 20.01 DEĞİL)
    expect(result.tazminat?.tutar).toBe(20.02);
    expect(result.girdiOzeti).toEqual({ cekSayisi: 3, karsiliksizCekSayisi: 2, takipEdilenBorcluSayisi: 1 });
  });

  it('previewHash kanonik: sıra, tutar biçimi (1000 / "1000.00"), büyük-küçük harf ve tarih saati hash\'i değiştirmez', () => {
    const a = previewCekFormation({
      instruments: [bounced(1000), bounced('250.5', { bounceDate: '2026-09-02' })],
      debtors: [kesideci, ciranta],
    });
    const b = previewCekFormation({
      instruments: [bounced('250.50', { bounceDate: '2026-09-02T00:00:00.000Z', currency: 'try' }), bounced('1000.00')],
      debtors: [{ tempId: 'd-ciranta', role: 'ciranta', pursued: true }, { tempId: 'd-kesideci', role: 'kesideci' }],
    });
    expect(b.previewHash).toBe(a.previewHash);
  });

  it('girdi değişince hash değişir (tutar, karşılıksız tarihi, rol, takip edilen küme)', () => {
    const base = previewCekFormation({ instruments: [bounced(1000)], debtors: [kesideci, ciranta] }).previewHash;
    expect(previewCekFormation({ instruments: [bounced(1001)], debtors: [kesideci, ciranta] }).previewHash).not.toBe(base);
    expect(previewCekFormation({ instruments: [bounced(1000, { bounceDate: '2026-09-02' })], debtors: [kesideci, ciranta] }).previewHash).not.toBe(base);
    expect(previewCekFormation({ instruments: [bounced(1000)], debtors: [kesideci, { ...ciranta, role: 'AVAL', avalForTempId: 'd-kesideci' }] }).previewHash).not.toBe(base);
    expect(previewCekFormation({ instruments: [bounced(1000)], debtors: [kesideci, { ...ciranta, pursued: false }] }).previewHash).not.toBe(base);
  });
});

describe('K3-L Faz 2b inceleme (r2) — önizleme uç durumları', () => {
  const kesideci = { tempId: 'k', role: 'KESIDECI' };
  const cek = (amount: number | string) => ({ amount, currency: 'TRY', isBounced: true, bounceDate: '2026-09-01' });

  it('0,01–0,04 TL çekte tazminat kuruşa yuvarlanınca sıfır: hata YOK, VERI_EKSIK', () => {
    for (const amount of ['0.01', '0.04']) {
      expect(previewCekFormation({ instruments: [cek(amount)], debtors: [kesideci] })).toMatchObject({
        durum: 'VERI_EKSIK',
        kod: 'CHECK_PENALTY_ROUNDS_TO_ZERO',
        tazminat: null,
      });
    }
    expect(previewCekFormation({ instruments: [cek('0.05')], debtors: [kesideci] })).toMatchObject({
      durum: 'HESAPLANDI',
      tazminat: { tutar: 0.01 },
    });
  });

  it.each([
    ['aval olmayan rolde lehine bilgisi', [kesideci, { tempId: 'c', role: 'CIRANTA', avalForTempId: 'k' }], 'AVAL_BENEFICIARY_ROLE_INVALID'],
    ['kendi lehine aval', [kesideci, { tempId: 'a', role: 'AVAL', avalForTempId: 'a' }], 'AVAL_BENEFICIARY_SELF'],
    ['dosyada olmayan borçlu lehine (bayat seçim)', [kesideci, { tempId: 'a', role: 'AVAL', avalForTempId: 'silinen' }], 'AVAL_BENEFICIARY_NOT_IN_CASE'],
  ])('lehine aval tutarsız (%s): sessizce "yalnız bedel" sayılmaz, VERI_EKSIK', (_l, debtors, kod) => {
    expect(previewCekFormation({ instruments: [cek(1000)], debtors })).toMatchObject({ durum: 'VERI_EKSIK', kod, tazminat: null });
  });

  it('K2: birden çok çekte birden çok keşideci ya da lehine aval varsa tutar ÜRETİLMEZ; tek keşideci + avalsız çok çek hesaplanır', () => {
    const iki = [cek(1000), cek(2000)];
    expect(previewCekFormation({ instruments: iki, debtors: [kesideci, { tempId: 'k2', role: 'KESIDECI' }] })).toMatchObject({
      durum: 'VERI_EKSIK',
      kod: 'CHECK_DRAWER_AMBIGUOUS',
    });
    expect(previewCekFormation({ instruments: iki, debtors: [kesideci, { tempId: 'a', role: 'AVAL', avalForTempId: 'k' }] })).toMatchObject({
      durum: 'VERI_EKSIK',
      kod: 'CHECK_DRAWER_AMBIGUOUS',
    });
    // karşılıksız OLMAYAN ikinci çek de sayılır: onun keşidecisi birinci çekin tazminatından sorumlu tutulamaz
    expect(
      previewCekFormation({
        instruments: [cek(1000), { amount: 2000, currency: 'TRY' }],
        debtors: [kesideci, { tempId: 'k2', role: 'KESIDECI' }],
      }),
    ).toMatchObject({ durum: 'VERI_EKSIK', kod: 'CHECK_DRAWER_AMBIGUOUS' });
    expect(previewCekFormation({ instruments: iki, debtors: [kesideci, { tempId: 'c', role: 'CIRANTA' }] })).toMatchObject({
      durum: 'HESAPLANDI',
      tazminat: { tutar: 300, sorumluTempIds: ['k'] },
    });
    // tek çekte birden çok keşideci (müşterek keşide) belirsiz DEĞİL
    expect(previewCekFormation({ instruments: [cek(1000)], debtors: [kesideci, { tempId: 'k2', role: 'KESIDECI' }] })).toMatchObject({
      durum: 'HESAPLANDI',
    });
  });

  it('aynı borçlunun iki rolü sorumlu listelerinde TEKRARLANMAZ', () => {
    const r = previewCekFormation({ instruments: [cek(1000)], debtors: [kesideci, { tempId: 'k', role: 'CIRANTA' }] });
    expect(r.durum).toBe('HESAPLANDI');
    expect(r.tazminat?.sorumluTempIds).toEqual(['k']);
    expect(r.tazminat?.bedelSorumluTempIds).toEqual(['k']);
  });
});
