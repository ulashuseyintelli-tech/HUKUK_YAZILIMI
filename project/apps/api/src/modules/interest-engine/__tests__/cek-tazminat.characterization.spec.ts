/**
 * CHARACTERIZATION TEST — cek-tazminat.service.ts
 *
 * Amaç: Bu servisin BUGÜNKÜ sayısal davranışını (yuvarlama tutarsızlıkları dahil) kilitlemek.
 * Bu testler "doğru" değeri değil, "şu an üretilen" değeri sabitler.
 *
 * Money Faz 1 (PR-1) safety-net'i: PR-2'de minor-unit/bigint refactor yapıldığında
 * bilinçli düzeltmeler bu testleri KIRACAK — bu beklenen ve faydalı sinyaldir.
 * Kırılan her değer review'da "bilinçli yeni doğru değer" olarak ayrıca onaylanır.
 *
 * Kurallar: snapshot yok. Deterministik dönüşlerde tam obje literal toEqual,
 * para değerlerinde literal exact assert. Değerler gerçek servis çıktısından yakalanmıştır.
 */

import { CekTazminatService } from '../cek-tazminat.service';

describe('CekTazminatService characterization (bugünkü davranış kilidi)', () => {
  const svc = new CekTazminatService();

  describe('calculateKarsilisizCekTazminati — %10 (TTK m.783)', () => {
    it('K1: (10000, 2025-01-15) → tazminatTutari 1000, baslangic=ibraz', () => {
      expect(svc.calculateKarsilisizCekTazminati(10000, '2025-01-15')).toEqual({
        cekBedeli: 10000,
        tazminatOrani: 0.1,
        tazminatTutari: 1000,
        baslangicTarihi: '2025-01-15',
        yasal_dayanak: 'TTK m.783',
        aciklama: 'Çek bedeli üzerinden %10 karşılıksız çek tazminatı',
      });
    });

    /**
     * K2: yarım kuruş — 10000.05 * 0.10 = 1000.005 → round → 1000.01.
     * Bugünkü gerçek davranış; bilinçli kilit.
     */
    it('K2: (10000.05, ...) → tazminatTutari 1000.01 [yarım kuruş, bilinçli kilit]', () => {
      expect(svc.calculateKarsilisizCekTazminati(10000.05, '2025-01-15')).toEqual({
        cekBedeli: 10000.05,
        tazminatOrani: 0.1,
        tazminatTutari: 1000.01,
        baslangicTarihi: '2025-01-15',
        yasal_dayanak: 'TTK m.783',
        aciklama: 'Çek bedeli üzerinden %10 karşılıksız çek tazminatı',
      });
    });

    it('K3: büyük principal (99999999.99) → tazminatTutari 10000000', () => {
      expect(svc.calculateKarsilisizCekTazminati(99999999.99, '2025-01-15')).toEqual({
        cekBedeli: 99999999.99,
        tazminatOrani: 0.1,
        tazminatTutari: 10000000,
        baslangicTarihi: '2025-01-15',
        yasal_dayanak: 'TTK m.783',
        aciklama: 'Çek bedeli üzerinden %10 karşılıksız çek tazminatı',
      });
    });

    it('K4: karşılıksız şerh tarihi → baslangicTarihi = serh tarihi', () => {
      expect(
        svc.calculateKarsilisizCekTazminati(10000, '2025-01-15', '2025-02-01'),
      ).toEqual({
        cekBedeli: 10000,
        tazminatOrani: 0.1,
        tazminatTutari: 1000,
        baslangicTarihi: '2025-02-01',
        yasal_dayanak: 'TTK m.783',
        aciklama: 'Çek bedeli üzerinden %10 karşılıksız çek tazminatı',
      });
    });
  });

  describe('calculateProtestoMasrafi', () => {
    it('P1: protesto yapılmadı → null', () => {
      expect(svc.calculateProtestoMasrafi(false)).toBeNull();
    });

    it('P2: yapıldı, varsayılan masraf → 500', () => {
      expect(svc.calculateProtestoMasrafi(true)).toEqual({
        protestoYapildi: true,
        masrafTutari: 500,
        yasal_dayanak: 'TTK m.714',
        aciklama: 'Çek protestosu masrafı',
      });
    });

    it('P3: yapıldı, özel masraf 750.5 → 750.5', () => {
      expect(svc.calculateProtestoMasrafi(true, 750.5)).toEqual({
        protestoYapildi: true,
        masrafTutari: 750.5,
        yasal_dayanak: 'TTK m.714',
        aciklama: 'Çek protestosu masrafı',
      });
    });
  });

  describe('calculateKomisyon — varsayılan %0.5', () => {
    it('KM1: (10000) → komisyonTutari 50', () => {
      expect(svc.calculateKomisyon(10000)).toEqual({
        cekBedeli: 10000,
        komisyonOrani: 0.005,
        komisyonTutari: 50,
        aciklama: 'Banka komisyonu (%0.5)',
      });
    });

    /**
     * KM2: yarım kuruş — 10000.05 * 0.005 = 50.00025 → round → 50.
     * K2 ile tutarsız yönde yuvarlama (K2 yukarı, burada "aşağı"); bugünkü gerçek davranış, bilinçli kilit.
     */
    it('KM2: (10000.05, 0.005) → komisyonTutari 50 [yarım kuruş, bilinçli kilit]', () => {
      expect(svc.calculateKomisyon(10000.05, 0.005)).toEqual({
        cekBedeli: 10000.05,
        komisyonOrani: 0.005,
        komisyonTutari: 50,
        aciklama: 'Banka komisyonu (%0.5)',
      });
    });

    it('KM3: (33333.33, 0.005) → komisyonTutari 166.67', () => {
      expect(svc.calculateKomisyon(33333.33, 0.005)).toEqual({
        cekBedeli: 33333.33,
        komisyonOrani: 0.005,
        komisyonTutari: 166.67,
        aciklama: 'Banka komisyonu (%0.5)',
      });
    });
  });

  describe('calculateAllCekFerileri — toplam fer\'iler', () => {
    it('A1: full combo (tazminat+protesto+komisyon) → toplamFeriler 1550', () => {
      expect(
        svc.calculateAllCekFerileri({
          cekBedeli: 10000,
          ibrazTarihi: '2025-01-15',
          karsilisiz: true,
          protestoYapildi: true,
          komisyonDahil: true,
        }),
      ).toEqual({
        cekBedeli: 10000,
        items: [
          {
            type: 'KARSILISIZ_CEK_TAZMINATI',
            tutar: 1000,
            oran: 0.1,
            yasal_dayanak: 'TTK m.783',
            aciklama: 'Çek bedeli üzerinden %10 karşılıksız çek tazminatı',
          },
          {
            type: 'PROTESTO_MASRAFI',
            tutar: 500,
            yasal_dayanak: 'TTK m.714',
            aciklama: 'Çek protestosu masrafı',
          },
          {
            type: 'KOMISYON',
            tutar: 50,
            oran: 0.005,
            aciklama: 'Banka komisyonu (%0.5)',
          },
        ],
        toplamFeriler: 1550,
      });
    });

    it('A2: yalnız karşılıksız tazminat → toplamFeriler 1000, 1 kalem', () => {
      expect(
        svc.calculateAllCekFerileri({
          cekBedeli: 10000,
          ibrazTarihi: '2025-01-15',
          karsilisiz: true,
        }),
      ).toEqual({
        cekBedeli: 10000,
        items: [
          {
            type: 'KARSILISIZ_CEK_TAZMINATI',
            tutar: 1000,
            oran: 0.1,
            yasal_dayanak: 'TTK m.783',
            aciklama: 'Çek bedeli üzerinden %10 karşılıksız çek tazminatı',
          },
        ],
        toplamFeriler: 1000,
      });
    });

    it('A3: hiçbir fer\'i yok → toplamFeriler 0, items boş', () => {
      expect(
        svc.calculateAllCekFerileri({
          cekBedeli: 10000,
          ibrazTarihi: '2025-01-15',
          karsilisiz: false,
        }),
      ).toEqual({
        cekBedeli: 10000,
        items: [],
        toplamFeriler: 0,
      });
    });
  });
});
