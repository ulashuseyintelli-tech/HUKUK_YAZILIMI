import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { create } from 'xmlbuilder2';

/**
 * UYAP e-Takip XML Generator Service
 * 
 * Resmi UYAP exchange.dtd formatına uygun XML oluşturur.
 * Kaynak: https://uyap.gov.tr/e-takip-tanitimi-ve-programlari
 * DTD: exchange.dtd (etakipkurulum paketi)
 * 
 * XML Yapısı:
 * exchangeData -> dosyalar -> dosya (attributes: dosyaTipi, takipTuru, takipYolu, takipSekli, mahiyetKodu)
 *   -> cek | senet | taraf | VekilKisi | police | kontratKefil | digerAlacak | evrak | ilam
 *   -> alacakKalemi (with faiz children)
 */

// ==================== UYAP KODLARI (KodluBilgilerData.xml) ====================

/** Faiz türleri - UYAP faizIsmi kodları */
export const UYAP_FAIZ_KODLARI = {
  YASAL: { kod: '1', isim: 'Yasal Faiz' },
  TICARI_TEMERRUT: { kod: '2', isim: 'Ticari Temerrüt Faizi' },
  REESKONT: { kod: '3', isim: 'Reeskont Faizi' },
  AVANS: { kod: '4', isim: 'Avans Faizi' },
  MEVDUAT: { kod: '5', isim: 'Mevduat Faizi' },
  AKIT: { kod: '6', isim: 'Akit Faizi' },
  DIGER: { kod: '99', isim: 'Diğer' },
} as const;

/** Para birimi kodları - UYAP tutarTur */
export const UYAP_PARA_BIRIMLERI = {
  TRY: { kod: 'TL', isim: 'Türk Lirası' },
  USD: { kod: 'USD', isim: 'Amerikan Doları' },
  EUR: { kod: 'EUR', isim: 'Euro' },
  GBP: { kod: 'GBP', isim: 'İngiliz Sterlini' },
  CHF: { kod: 'CHF', isim: 'İsviçre Frangı' },
} as const;

/** Adres türleri - UYAP adresTuru */
export const UYAP_ADRES_TURLERI = {
  EV: { kod: '1', isim: 'Ev Adresi' },
  IS: { kod: '2', isim: 'İş Adresi' },
  DIGER: { kod: '3', isim: 'Diğer' },
} as const;

/** Süre birimleri - UYAP sureBirimi */
export const UYAP_SURE_BIRIMLERI = {
  GUN: { kod: '1', isim: 'Gün' },
  HAFTA: { kod: '2', isim: 'Hafta' },
  AY: { kod: '3', isim: 'Ay' },
  YIL: { kod: '4', isim: 'Yıl' },
} as const;

/** Takip mahiyeti kodları - UYAP mahiyetKodu */
export const UYAP_MAHIYET_KODLARI = {
  // İlamsız Takip
  GENEL_HACIZ: { kod: '1007', isim: 'Genel Haciz Yoluyla Takip' },
  KAMBIYO_CEK: { kod: '1107', isim: 'Kambiyo Senetlerine Özgü Haciz Yoluyla Takip (Çek)' },
  KAMBIYO_SENET: { kod: '1207', isim: 'Kambiyo Senetlerine Özgü Haciz Yoluyla Takip (Senet)' },
  KAMBIYO_POLICE: { kod: '1307', isim: 'Kambiyo Senetlerine Özgü Haciz Yoluyla Takip (Poliçe)' },
  KIRA_ALACAGI: { kod: '1407', isim: 'Kira Alacağı Takibi' },
  
  // İlamlı Takip
  ILAMLI_GENEL: { kod: '2007', isim: 'İlamlı Takip' },
  NAFAKA: { kod: '3007', isim: 'Nafaka Alacağı Takibi' },
  
  // Rehin/İpotek
  REHIN_PARAYA_CEVIRME: { kod: '4007', isim: 'Rehnin Paraya Çevrilmesi Yoluyla Takip' },
  IPOTEK_PARAYA_CEVIRME: { kod: '5007', isim: 'İpoteğin Paraya Çevrilmesi Yoluyla Takip' },
  
  // Tahliye
  TAHLIYE: { kod: '6007', isim: 'Tahliye Takibi' },
  HACIZ_TAHLIYE: { kod: '7007', isim: 'Haciz ve Tahliye Takibi' },
  
  // İflas
  IFLAS: { kod: '8008', isim: 'İflas Yoluyla Takip' },
  
  // Diğer
  DIGER: { kod: '9009', isim: 'Diğer Takip' },
  
  // Özel Mahiyetler
  FATURA: { kod: '1045', isim: 'Fatura Alacağı' },
  SOZLESME: { kod: '2045', isim: 'Sözleşme Alacağı' },
  KREDI: { kod: '3045', isim: 'Kredi Alacağı' },
  TEMINAT_MEKTUBU: { kod: '4045', isim: 'Teminat Mektubu Alacağı' },
} as const;

/** Taraf rol türleri - UYAP rolTur */
export const UYAP_ROL_TURLERI = {
  ALACAKLI: { kod: '1', isim: 'Alacaklı' },
  BORCLU: { kod: '2', isim: 'Borçlu' },
  KEFIL: { kod: '3', isim: 'Kefil' },
  MUSTEREN_BORCLU: { kod: '4', isim: 'Müşterek Borçlu' },
  MIRASCI: { kod: '5', isim: 'Mirasçı' },
  KESIDECI: { kod: '6', isim: 'Keşideci' },
  CIRANTA: { kod: '7', isim: 'Ciranta' },
  AVALCI: { kod: '8', isim: 'Avalci' },
  LEHTAR: { kod: '9', isim: 'Lehtar' },
  MUHATAP: { kod: '10', isim: 'Muhatap' },
} as const;

// ==================== INTERFACE TANIMLARI ====================

/** UYAP exchange.dtd formatına uygun dosya verisi */
export interface UyapExchangeData {
  /** Dosya tipi: 1=İcra, 2=İflas */
  dosyaTipi: '1' | '2';
  
  /** Takip türü: 1=İlamsız, 2=İlamlı, 3=Kambiyo, 4=Rehin, 5=İpotek, 6=İflas */
  takipTuru: '1' | '2' | '3' | '4' | '5' | '6';
  
  /** Takip yolu: 1=Haciz, 2=İflas, 3=Rehin, 4=Tahliye */
  takipYolu: '1' | '2' | '3' | '4';
  
  /** Takip şekli: 1=Adi, 2=Kambiyo */
  takipSekli: '1' | '2';
  
  /** Mahiyet kodu (UYAP_MAHIYET_KODLARI) */
  mahiyetKodu: string;
  
  /** İcra dairesi birim kodu */
  birimKodu: string;
  
  /** Takip tarihi (YYYY-MM-DD) */
  takipTarihi: string;
  
  /** Para birimi kodu */
  paraBirimi: string;
  
  /** Taraflar (alacaklı, borçlu, kefil vb.) */
  taraflar: UyapTaraf[];
  
  /** Vekiller */
  vekiller?: UyapVekil[];
  
  /** Çekler */
  cekler?: UyapCek[];
  
  /** Senetler (bono) */
  senetler?: UyapSenet[];
  
  /** Poliçeler */
  policeler?: UyapPolice[];
  
  /** Alacak kalemleri */
  alacakKalemleri: UyapAlacakKalemi[];
  
  /** İlam bilgileri */
  ilam?: UyapIlam;
  
  /** Diğer alacaklar */
  digerAlacaklar?: UyapDigerAlacak[];
  
  /** Evraklar */
  evraklar?: UyapEvrak[];
}

/** UYAP Taraf (kişi/kurum) */
export interface UyapTaraf {
  /** Rol türü kodu */
  rolTur: string;
  
  /** Kişi mi kurum mu: 1=Gerçek Kişi, 2=Tüzel Kişi */
  kisiKurumTipi: '1' | '2';
  
  /** Gerçek kişi bilgileri */
  kisi?: {
    tcKimlikNo?: string;
    ad: string;
    soyad: string;
    babaAdi?: string;
    anaAdi?: string;
    dogumTarihi?: string;
    dogumYeri?: string;
  };
  
  /** Tüzel kişi bilgileri */
  kurum?: {
    vergiNo?: string;
    mersisNo?: string;
    unvan: string;
    ticariSicilNo?: string;
  };
  
  /** Adres bilgileri */
  adres?: UyapAdres;
  
  /** IBAN */
  iban?: string;
  
  /** Telefon */
  telefon?: string;
  
  /** E-posta */
  eposta?: string;
}

/** UYAP Adres */
export interface UyapAdres {
  /** Adres türü kodu */
  adresTuru: string;
  
  /** İl kodu */
  ilKodu: string;
  
  /** İlçe kodu */
  ilceKodu?: string;
  
  /** Mahalle */
  mahalle?: string;
  
  /** Cadde/Sokak */
  caddeSokak?: string;
  
  /** Kapı no */
  kapiNo?: string;
  
  /** Daire no */
  daireNo?: string;
  
  /** Posta kodu */
  postaKodu?: string;
  
  /** Tam adres metni */
  tamAdres: string;
}

/** UYAP Vekil */
export interface UyapVekil {
  /** TC Kimlik No */
  tcKimlikNo: string;
  
  /** Ad Soyad */
  adSoyad: string;
  
  /** Baro sicil no */
  baroSicilNo: string;
  
  /** Baro adı */
  baroAdi: string;
  
  /** Adres */
  adres?: UyapAdres;
  
  /** Telefon */
  telefon?: string;
  
  /** Faks */
  faks?: string;
  
  /** E-posta */
  eposta?: string;
  
  /** IBAN */
  iban?: string;
  
  /** Banka adı */
  bankaAdi?: string;
  
  /** İmza yetkisi var mı */
  imzaYetkili?: boolean;
  
  /** Hangi tarafların vekili (taraf indeksleri) */
  tarafIndeksleri?: number[];
}

/** UYAP Çek */
export interface UyapCek {
  /** Çek seri no */
  seriNo: string;
  
  /** Çek no */
  cekNo: string;
  
  /** Tutar */
  tutar: number;
  
  /** Para birimi kodu */
  paraBirimi: string;
  
  /** Keşide tarihi (YYYY-MM-DD) */
  kesideTarihi: string;
  
  /** Vade tarihi (YYYY-MM-DD) */
  vadeTarihi?: string;
  
  /** İbraz tarihi (YYYY-MM-DD) */
  ibrazTarihi?: string;
  
  /** Keşide yeri */
  kesideYeri?: string;
  
  /** Ödeme yeri */
  odemeYeri?: string;
  
  /** Banka adı */
  bankaAdi?: string;
  
  /** Şube adı */
  subeAdi?: string;
  
  /** Hesap no */
  hesapNo?: string;
  
  /** Keşideci (taraf indeksi) */
  kesideciIndeks?: number;
  
  /** Ciranta indeksleri */
  cirantaIndeksleri?: number[];
  
  /** Karşılıksız şerhi var mı */
  karsiliksiz?: boolean;
  
  /** Karşılıksız tarihi */
  karsiliksizTarihi?: string;
}

/** UYAP Senet (Bono) */
export interface UyapSenet {
  /** Senet no */
  senetNo: string;
  
  /** Tutar */
  tutar: number;
  
  /** Para birimi kodu */
  paraBirimi: string;
  
  /** Düzenleme tarihi (YYYY-MM-DD) */
  duzenlenmeTarihi: string;
  
  /** Vade tarihi (YYYY-MM-DD) */
  vadeTarihi: string;
  
  /** Düzenleme yeri */
  duzenlenmeYeri?: string;
  
  /** Ödeme yeri */
  odemeYeri?: string;
  
  /** Borçlu (taraf indeksi) */
  borcluIndeks?: number;
  
  /** Lehtar (taraf indeksi) */
  lehtarIndeks?: number;
  
  /** Ciranta indeksleri */
  cirantaIndeksleri?: number[];
}

/** UYAP Poliçe */
export interface UyapPolice {
  /** Poliçe no */
  policeNo: string;
  
  /** Tutar */
  tutar: number;
  
  /** Para birimi kodu */
  paraBirimi: string;
  
  /** Düzenleme tarihi */
  duzenlenmeTarihi: string;
  
  /** Vade tarihi */
  vadeTarihi: string;
  
  /** Keşideci indeksi */
  kesideciIndeks?: number;
  
  /** Muhatap indeksi */
  muhatabIndeks?: number;
  
  /** Lehtar indeksi */
  lehtarIndeks?: number;
}

/** UYAP Alacak Kalemi */
export interface UyapAlacakKalemi {
  /** Kalem sıra no */
  siraNo: number;
  
  /** Açıklama */
  aciklama: string;
  
  /** Tutar */
  tutar: number;
  
  /** Para birimi kodu */
  paraBirimi: string;
  
  /** Vade tarihi (YYYY-MM-DD) */
  vadeTarihi?: string;
  
  /** Faiz bilgileri */
  faiz?: UyapFaiz;
}

/** UYAP Faiz */
export interface UyapFaiz {
  /** Faiz türü kodu (UYAP_FAIZ_KODLARI) */
  faizTuru: string;
  
  /** Faiz oranı (yıllık %) */
  faizOrani?: number;
  
  /** Faiz başlangıç tarihi (YYYY-MM-DD) */
  baslangicTarihi: string;
  
  /** İşlemiş faiz tutarı */
  islemisFaiz?: number;
}

/** UYAP İlam */
export interface UyapIlam {
  /** Mahkeme adı */
  mahkemeAdi: string;
  
  /** Mahkeme birim kodu */
  mahkemeBirimKodu?: string;
  
  /** Esas no */
  esasNo: string;
  
  /** Karar no */
  kararNo: string;
  
  /** Karar tarihi (YYYY-MM-DD) */
  kararTarihi: string;
  
  /** Kesinleşme tarihi (YYYY-MM-DD) */
  kesinlesmeTarihi?: string;
  
  /** İlam özeti */
  ilamOzeti?: string;
}

/** UYAP Diğer Alacak */
export interface UyapDigerAlacak {
  /** Alacak türü */
  alacakTuru: string;
  
  /** Açıklama */
  aciklama: string;
  
  /** Tutar */
  tutar: number;
  
  /** Para birimi */
  paraBirimi: string;
}

/** UYAP Evrak */
export interface UyapEvrak {
  /** Evrak türü */
  evrakTuru: string;
  
  /** Evrak adı */
  evrakAdi: string;
  
  /** Evrak içeriği (Base64) */
  icerik?: string;
}

// ==================== SERVICE ====================

@Injectable()
export class UyapXmlService {
  private readonly logger = new Logger(UyapXmlService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Case ID'den UYAP e-Takip XML'i oluştur (exchange.dtd formatında)
   */
  async generateFromCase(caseId: string): Promise<string> {
    const data = await this.getCaseDataForExchange(caseId);
    return this.generateExchangeXml(data);
  }

  /**
   * UyapExchangeData'dan exchange.dtd formatında XML oluştur
   */
  generateExchangeXml(data: UyapExchangeData): string {
    const doc = create({ version: '1.0', encoding: 'UTF-8' })
      .dtd({ name: 'exchangeData', sysID: 'exchange.dtd' })
      .ele('exchangeData');

    // dosyalar -> dosya
    const dosyalar = doc.ele('dosyalar');
    const dosya = dosyalar.ele('dosya', {
      dosyaTipi: data.dosyaTipi,
      takipTuru: data.takipTuru,
      takipYolu: data.takipYolu,
      takipSekli: data.takipSekli,
      mahiyetKodu: data.mahiyetKodu,
      birimKodu: data.birimKodu,
      takipTarihi: data.takipTarihi,
      paraBirimi: data.paraBirimi,
    });

    // Taraflar
    data.taraflar.forEach((taraf, index) => {
      this.addTaraf(dosya, taraf, index + 1);
    });

    // Vekiller
    if (data.vekiller && data.vekiller.length > 0) {
      data.vekiller.forEach((vekil) => {
        this.addVekilKisi(dosya, vekil);
      });
    }

    // Çekler
    if (data.cekler && data.cekler.length > 0) {
      data.cekler.forEach((cek, index) => {
        this.addCek(dosya, cek, index + 1);
      });
    }

    // Senetler
    if (data.senetler && data.senetler.length > 0) {
      data.senetler.forEach((senet, index) => {
        this.addSenet(dosya, senet, index + 1);
      });
    }

    // Poliçeler
    if (data.policeler && data.policeler.length > 0) {
      data.policeler.forEach((police, index) => {
        this.addPolice(dosya, police, index + 1);
      });
    }

    // Alacak Kalemleri
    data.alacakKalemleri.forEach((kalem) => {
      this.addAlacakKalemi(dosya, kalem);
    });

    // İlam
    if (data.ilam) {
      this.addIlam(dosya, data.ilam);
    }

    // Diğer Alacaklar
    if (data.digerAlacaklar && data.digerAlacaklar.length > 0) {
      data.digerAlacaklar.forEach((alacak) => {
        this.addDigerAlacak(dosya, alacak);
      });
    }

    return doc.end({ prettyPrint: true });
  }

  // ==================== XML ELEMENT BUILDERS ====================

  private addTaraf(parent: any, taraf: UyapTaraf, sira: number): void {
    const tarafEl = parent.ele('taraf', { sira, rolTur: taraf.rolTur });

    // kisiKurumBilgileri
    const kkb = tarafEl.ele('kisiKurumBilgileri', { tip: taraf.kisiKurumTipi });

    if (taraf.kisiKurumTipi === '1' && taraf.kisi) {
      // Gerçek kişi
      const kisiEl = kkb.ele('kisiTumBilgileri');
      if (taraf.kisi.tcKimlikNo) kisiEl.ele('tcKimlikNo').txt(taraf.kisi.tcKimlikNo);
      kisiEl.ele('ad').txt(taraf.kisi.ad);
      kisiEl.ele('soyad').txt(taraf.kisi.soyad);
      if (taraf.kisi.babaAdi) kisiEl.ele('babaAdi').txt(taraf.kisi.babaAdi);
      if (taraf.kisi.anaAdi) kisiEl.ele('anaAdi').txt(taraf.kisi.anaAdi);
      if (taraf.kisi.dogumTarihi) kisiEl.ele('dogumTarihi').txt(taraf.kisi.dogumTarihi);
      if (taraf.kisi.dogumYeri) kisiEl.ele('dogumYeri').txt(taraf.kisi.dogumYeri);
    } else if (taraf.kisiKurumTipi === '2' && taraf.kurum) {
      // Tüzel kişi
      const kurumEl = kkb.ele('kurum');
      if (taraf.kurum.vergiNo) kurumEl.ele('vergiNo').txt(taraf.kurum.vergiNo);
      if (taraf.kurum.mersisNo) kurumEl.ele('mersisNo').txt(taraf.kurum.mersisNo);
      kurumEl.ele('unvan').txt(taraf.kurum.unvan);
      if (taraf.kurum.ticariSicilNo) kurumEl.ele('ticariSicilNo').txt(taraf.kurum.ticariSicilNo);
    }

    // Adres
    if (taraf.adres) {
      this.addAdres(tarafEl, taraf.adres);
    }

    // İletişim bilgileri
    if (taraf.iban) tarafEl.ele('iban').txt(taraf.iban);
    if (taraf.telefon) tarafEl.ele('telefon').txt(taraf.telefon);
    if (taraf.eposta) tarafEl.ele('eposta').txt(taraf.eposta);
  }

  private addAdres(parent: any, adres: UyapAdres): void {
    const adresEl = parent.ele('adres', { adresTuru: adres.adresTuru });
    adresEl.ele('ilKodu').txt(adres.ilKodu);
    if (adres.ilceKodu) adresEl.ele('ilceKodu').txt(adres.ilceKodu);
    if (adres.mahalle) adresEl.ele('mahalle').txt(adres.mahalle);
    if (adres.caddeSokak) adresEl.ele('caddeSokak').txt(adres.caddeSokak);
    if (adres.kapiNo) adresEl.ele('kapiNo').txt(adres.kapiNo);
    if (adres.daireNo) adresEl.ele('daireNo').txt(adres.daireNo);
    if (adres.postaKodu) adresEl.ele('postaKodu').txt(adres.postaKodu);
    adresEl.ele('tamAdres').txt(adres.tamAdres);
  }

  private addVekilKisi(parent: any, vekil: UyapVekil): void {
    const vekilEl = parent.ele('VekilKisi', { imzaYetkili: vekil.imzaYetkili ? '1' : '0' });
    vekilEl.ele('tcKimlikNo').txt(vekil.tcKimlikNo);
    vekilEl.ele('adSoyad').txt(vekil.adSoyad);
    vekilEl.ele('baroSicilNo').txt(vekil.baroSicilNo);
    vekilEl.ele('baroAdi').txt(vekil.baroAdi);
    
    if (vekil.adres) this.addAdres(vekilEl, vekil.adres);
    if (vekil.telefon) vekilEl.ele('telefon').txt(vekil.telefon);
    if (vekil.faks) vekilEl.ele('faks').txt(vekil.faks);
    if (vekil.eposta) vekilEl.ele('eposta').txt(vekil.eposta);
    if (vekil.iban) vekilEl.ele('iban').txt(vekil.iban);
    if (vekil.bankaAdi) vekilEl.ele('bankaAdi').txt(vekil.bankaAdi);
    
    // Hangi tarafların vekili
    if (vekil.tarafIndeksleri && vekil.tarafIndeksleri.length > 0) {
      vekil.tarafIndeksleri.forEach(idx => {
        vekilEl.ele('tarafRef', { sira: idx });
      });
    }
  }

  private addCek(parent: any, cek: UyapCek, sira: number): void {
    const cekEl = parent.ele('cek', { sira });
    cekEl.ele('seriNo').txt(cek.seriNo);
    cekEl.ele('cekNo').txt(cek.cekNo);
    cekEl.ele('tutar').txt(cek.tutar.toFixed(2));
    cekEl.ele('paraBirimi').txt(cek.paraBirimi);
    cekEl.ele('kesideTarihi').txt(cek.kesideTarihi);
    if (cek.vadeTarihi) cekEl.ele('vadeTarihi').txt(cek.vadeTarihi);
    if (cek.ibrazTarihi) cekEl.ele('ibrazTarihi').txt(cek.ibrazTarihi);
    if (cek.kesideYeri) cekEl.ele('kesideYeri').txt(cek.kesideYeri);
    if (cek.odemeYeri) cekEl.ele('odemeYeri').txt(cek.odemeYeri);
    if (cek.bankaAdi) cekEl.ele('bankaAdi').txt(cek.bankaAdi);
    if (cek.subeAdi) cekEl.ele('subeAdi').txt(cek.subeAdi);
    if (cek.hesapNo) cekEl.ele('hesapNo').txt(cek.hesapNo);
    if (cek.kesideciIndeks) cekEl.ele('kesideciRef', { sira: cek.kesideciIndeks });
    if (cek.cirantaIndeksleri) {
      cek.cirantaIndeksleri.forEach(idx => cekEl.ele('cirantaRef', { sira: idx }));
    }
    if (cek.karsiliksiz) {
      cekEl.ele('karsiliksiz').txt('1');
      if (cek.karsiliksizTarihi) cekEl.ele('karsiliksizTarihi').txt(cek.karsiliksizTarihi);
    }
  }

  private addSenet(parent: any, senet: UyapSenet, sira: number): void {
    const senetEl = parent.ele('senet', { sira });
    senetEl.ele('senetNo').txt(senet.senetNo);
    senetEl.ele('tutar').txt(senet.tutar.toFixed(2));
    senetEl.ele('paraBirimi').txt(senet.paraBirimi);
    senetEl.ele('duzenlenmeTarihi').txt(senet.duzenlenmeTarihi);
    senetEl.ele('vadeTarihi').txt(senet.vadeTarihi);
    if (senet.duzenlenmeYeri) senetEl.ele('duzenlenmeYeri').txt(senet.duzenlenmeYeri);
    if (senet.odemeYeri) senetEl.ele('odemeYeri').txt(senet.odemeYeri);
    if (senet.borcluIndeks) senetEl.ele('borcluRef', { sira: senet.borcluIndeks });
    if (senet.lehtarIndeks) senetEl.ele('lehtarRef', { sira: senet.lehtarIndeks });
    if (senet.cirantaIndeksleri) {
      senet.cirantaIndeksleri.forEach(idx => senetEl.ele('cirantaRef', { sira: idx }));
    }
  }

  private addPolice(parent: any, police: UyapPolice, sira: number): void {
    const policeEl = parent.ele('police', { sira });
    policeEl.ele('policeNo').txt(police.policeNo);
    policeEl.ele('tutar').txt(police.tutar.toFixed(2));
    policeEl.ele('paraBirimi').txt(police.paraBirimi);
    policeEl.ele('duzenlenmeTarihi').txt(police.duzenlenmeTarihi);
    policeEl.ele('vadeTarihi').txt(police.vadeTarihi);
    if (police.kesideciIndeks) policeEl.ele('kesideciRef', { sira: police.kesideciIndeks });
    if (police.muhatabIndeks) policeEl.ele('muhatabRef', { sira: police.muhatabIndeks });
    if (police.lehtarIndeks) policeEl.ele('lehtarRef', { sira: police.lehtarIndeks });
  }

  private addAlacakKalemi(parent: any, kalem: UyapAlacakKalemi): void {
    const kalemEl = parent.ele('alacakKalemi', { sira: kalem.siraNo });
    kalemEl.ele('aciklama').txt(kalem.aciklama);
    kalemEl.ele('tutar').txt(kalem.tutar.toFixed(2));
    kalemEl.ele('paraBirimi').txt(kalem.paraBirimi);
    if (kalem.vadeTarihi) kalemEl.ele('vadeTarihi').txt(kalem.vadeTarihi);
    
    // Faiz
    if (kalem.faiz) {
      const faizEl = kalemEl.ele('faiz');
      faizEl.ele('faizTuru').txt(kalem.faiz.faizTuru);
      if (kalem.faiz.faizOrani) faizEl.ele('faizOrani').txt(kalem.faiz.faizOrani.toFixed(2));
      faizEl.ele('baslangicTarihi').txt(kalem.faiz.baslangicTarihi);
      if (kalem.faiz.islemisFaiz) faizEl.ele('islemisFaiz').txt(kalem.faiz.islemisFaiz.toFixed(2));
    }
  }

  private addIlam(parent: any, ilam: UyapIlam): void {
    const ilamEl = parent.ele('ilam');
    ilamEl.ele('mahkemeAdi').txt(ilam.mahkemeAdi);
    if (ilam.mahkemeBirimKodu) ilamEl.ele('mahkemeBirimKodu').txt(ilam.mahkemeBirimKodu);
    ilamEl.ele('esasNo').txt(ilam.esasNo);
    ilamEl.ele('kararNo').txt(ilam.kararNo);
    ilamEl.ele('kararTarihi').txt(ilam.kararTarihi);
    if (ilam.kesinlesmeTarihi) ilamEl.ele('kesinlesmeTarihi').txt(ilam.kesinlesmeTarihi);
    if (ilam.ilamOzeti) ilamEl.ele('ilamOzeti').txt(ilam.ilamOzeti);
  }

  private addDigerAlacak(parent: any, alacak: UyapDigerAlacak): void {
    const alacakEl = parent.ele('digerAlacak');
    alacakEl.ele('alacakTuru').txt(alacak.alacakTuru);
    alacakEl.ele('aciklama').txt(alacak.aciklama);
    alacakEl.ele('tutar').txt(alacak.tutar.toFixed(2));
    alacakEl.ele('paraBirimi').txt(alacak.paraBirimi);
  }

  // ==================== CASE DATA CONVERTER ====================

  /**
   * Case verilerini UyapExchangeData formatına dönüştür
   */
  private async getCaseDataForExchange(caseId: string): Promise<UyapExchangeData> {
    const caseRecord = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: {
        executionOffice: true,
        caseClients: { include: { client: true } },
        lawyers: { include: { lawyer: true } },
        debtors: { 
          include: { 
            debtor: { include: { debtorAddresses: true } },
            selectedAddress: true,
          } 
        },
        claimItems: true,
        formType: true,
        mahiyetTipi: true,
      },
    });

    if (!caseRecord) {
      throw new Error('Dosya bulunamadı');
    }

    // Takip türü ve yolunu belirle
    const { dosyaTipi, takipTuru, takipYolu, takipSekli, mahiyetKodu } = 
      this.determineTakipAttributes(caseRecord.type, caseRecord.subCategory, caseRecord.executionPath);

    // Tarafları oluştur
    const taraflar: UyapTaraf[] = [];
    let tarafIndex = 1;

    // Alacaklılar
    const alacakliIndeksleri: number[] = [];
    for (const cc of caseRecord.caseClients || []) {
      const taraf = this.clientToTaraf(cc.client, UYAP_ROL_TURLERI.ALACAKLI.kod);
      taraflar.push(taraf);
      alacakliIndeksleri.push(tarafIndex++);
    }

    // Borçlular
    for (const cd of caseRecord.debtors || []) {
      const rolKod = this.mapDebtorRoleToUyapKod(cd.role);
      const taraf = this.debtorToTaraf(cd.debtor, cd.selectedAddress, rolKod);
      taraflar.push(taraf);
      tarafIndex++;
    }

    // Vekiller
    const vekiller: UyapVekil[] = (caseRecord.lawyers || []).map(cl => ({
      tcKimlikNo: cl.lawyer?.tckn || '',
      adSoyad: `${cl.lawyer?.name || ''} ${cl.lawyer?.surname || ''}`.trim(),
      baroSicilNo: cl.lawyer?.barNumber || '',
      baroAdi: cl.lawyer?.barCity || '',
      adres: cl.lawyer?.address ? {
        adresTuru: UYAP_ADRES_TURLERI.IS.kod,
        ilKodu: this.getIlKodu(cl.lawyer?.city || 'İSTANBUL'),
        tamAdres: cl.lawyer?.address,
      } : undefined,
      telefon: cl.lawyer?.phone || undefined,
      faks: cl.lawyer?.fax || undefined,
      eposta: cl.lawyer?.email || undefined,
      iban: cl.lawyer?.iban || undefined,
      bankaAdi: cl.lawyer?.bankName || undefined,
      imzaYetkili: cl.canSign,
      tarafIndeksleri: alacakliIndeksleri, // Alacaklıların vekili
    }));

    // Alacak kalemleri
    const alacakKalemleri = this.buildAlacakKalemleri(caseRecord);

    // Çek/Senet bilgileri
    let cekler: UyapCek[] | undefined;
    let senetler: UyapSenet[] | undefined;

    if (['CEK', 'KAMBIYO_CEK'].includes(caseRecord.subCategory || '')) {
      cekler = await this.getCeklerFromCase(caseId);
    } else if (['SENET', 'KAMBIYO_SENET'].includes(caseRecord.subCategory || '')) {
      senetler = await this.getSenetlerFromCase(caseId);
    }

    // İlam bilgileri
    let ilam: UyapIlam | undefined;
    if (['ILAMLI', 'NAFAKA'].includes(caseRecord.type || '')) {
      ilam = await this.getIlamFromCase(caseId);
    }

    return {
      dosyaTipi,
      takipTuru,
      takipYolu,
      takipSekli,
      mahiyetKodu,
      birimKodu: caseRecord.executionOffice?.uyapCode || caseRecord.uyapBirimKodu || '',
      takipTarihi: caseRecord.caseDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
      paraBirimi: UYAP_PARA_BIRIMLERI[caseRecord.currency as keyof typeof UYAP_PARA_BIRIMLERI]?.kod || 'TL',
      taraflar,
      vekiller: vekiller.length > 0 ? vekiller : undefined,
      cekler,
      senetler,
      alacakKalemleri,
      ilam,
    };
  }

  // ==================== HELPER METHODS ====================

  private determineTakipAttributes(caseType: string, subCategory?: string, executionPath?: string): {
    dosyaTipi: '1' | '2';
    takipTuru: '1' | '2' | '3' | '4' | '5' | '6';
    takipYolu: '1' | '2' | '3' | '4';
    takipSekli: '1' | '2';
    mahiyetKodu: string;
  } {
    let dosyaTipi: '1' | '2' = '1'; // Default: İcra
    let takipTuru: '1' | '2' | '3' | '4' | '5' | '6' = '1'; // Default: İlamsız
    let takipYolu: '1' | '2' | '3' | '4' = '1'; // Default: Haciz
    let takipSekli: '1' | '2' = '1'; // Default: Adi
    let mahiyetKodu: string = UYAP_MAHIYET_KODLARI.GENEL_HACIZ.kod;

    // Takip türü
    if (['CEK', 'SENET', 'KAMBIYO_CEK', 'KAMBIYO_SENET'].includes(subCategory || '')) {
      takipTuru = '3'; // Kambiyo
      takipSekli = '2'; // Kambiyo
      mahiyetKodu = subCategory?.includes('CEK') 
        ? UYAP_MAHIYET_KODLARI.KAMBIYO_CEK.kod 
        : UYAP_MAHIYET_KODLARI.KAMBIYO_SENET.kod;
    } else if (caseType === 'ILAMLI' || caseType === 'NAFAKA') {
      takipTuru = '2'; // İlamlı
      mahiyetKodu = caseType === 'NAFAKA' 
        ? UYAP_MAHIYET_KODLARI.NAFAKA.kod 
        : UYAP_MAHIYET_KODLARI.ILAMLI_GENEL.kod;
    } else if (caseType === 'REHIN') {
      takipTuru = '4'; // Rehin
      takipYolu = '3'; // Rehin
      mahiyetKodu = UYAP_MAHIYET_KODLARI.REHIN_PARAYA_CEVIRME.kod;
    } else if (caseType === 'IPOTEK') {
      takipTuru = '5'; // İpotek
      takipYolu = '3'; // Rehin
      mahiyetKodu = UYAP_MAHIYET_KODLARI.IPOTEK_PARAYA_CEVIRME.kod;
    } else if (caseType === 'IFLAS') {
      dosyaTipi = '2'; // İflas
      takipTuru = '6'; // İflas
      takipYolu = '2'; // İflas
      mahiyetKodu = UYAP_MAHIYET_KODLARI.IFLAS.kod;
    } else if (subCategory === 'KIRA') {
      mahiyetKodu = UYAP_MAHIYET_KODLARI.KIRA_ALACAGI.kod;
    } else if (subCategory === 'FATURA') {
      mahiyetKodu = UYAP_MAHIYET_KODLARI.FATURA.kod;
    }

    // Takip yolu
    if (executionPath === 'TAHLIYE') {
      takipYolu = '4';
      mahiyetKodu = UYAP_MAHIYET_KODLARI.TAHLIYE.kod;
    } else if (executionPath === 'HACIZ_TAHLIYE') {
      takipYolu = '4';
      mahiyetKodu = UYAP_MAHIYET_KODLARI.HACIZ_TAHLIYE.kod;
    }

    return { dosyaTipi, takipTuru, takipYolu, takipSekli, mahiyetKodu };
  }

  private clientToTaraf(client: any, rolKod: string): UyapTaraf {
    const isIndividual = client?.type === 'INDIVIDUAL';
    
    return {
      rolTur: rolKod,
      kisiKurumTipi: isIndividual ? '1' : '2',
      kisi: isIndividual ? {
        tcKimlikNo: client?.tckn,
        ad: client?.firstName || client?.displayName?.split(' ')[0] || '',
        soyad: client?.lastName || client?.displayName?.split(' ').slice(1).join(' ') || '',
      } : undefined,
      kurum: !isIndividual ? {
        vergiNo: client?.vkn,
        mersisNo: client?.mersisNo,
        unvan: client?.displayName || '',
      } : undefined,
      adres: client?.address ? {
        adresTuru: UYAP_ADRES_TURLERI.IS.kod,
        ilKodu: this.getIlKodu(client?.city || 'İSTANBUL'),
        tamAdres: client?.address,
      } : undefined,
      iban: client?.iban,
      telefon: client?.phone,
      eposta: client?.email,
    };
  }

  private debtorToTaraf(debtor: any, selectedAddress: any, rolKod: string): UyapTaraf {
    const isIndividual = debtor?.type === 'INDIVIDUAL';
    const addr = selectedAddress || debtor?.debtorAddresses?.[0];
    
    return {
      rolTur: rolKod,
      kisiKurumTipi: isIndividual ? '1' : '2',
      kisi: isIndividual ? {
        tcKimlikNo: debtor?.tckn,
        ad: debtor?.firstName || debtor?.displayName?.split(' ')[0] || '',
        soyad: debtor?.lastName || debtor?.displayName?.split(' ').slice(1).join(' ') || '',
        babaAdi: debtor?.fatherName,
        anaAdi: debtor?.motherName,
        dogumTarihi: debtor?.birthDate?.toISOString().split('T')[0],
        dogumYeri: debtor?.birthPlace,
      } : undefined,
      kurum: !isIndividual ? {
        vergiNo: debtor?.vkn,
        mersisNo: debtor?.mersisNo,
        unvan: debtor?.displayName || '',
        ticariSicilNo: debtor?.tradeRegisterNo,
      } : undefined,
      adres: addr ? {
        adresTuru: UYAP_ADRES_TURLERI.EV.kod,
        ilKodu: this.getIlKodu(addr?.city || 'İSTANBUL'),
        ilceKodu: addr?.districtCode,
        mahalle: addr?.neighborhood,
        caddeSokak: addr?.street,
        kapiNo: addr?.buildingNo,
        daireNo: addr?.apartmentNo,
        postaKodu: addr?.postalCode,
        tamAdres: addr?.fullAddress || addr?.street || debtor?.address || '',
      } : undefined,
      telefon: debtor?.phone,
    };
  }

  private mapDebtorRoleToUyapKod(role: string): string {
    const mapping: Record<string, string> = {
      'ASIL_BORCLU': UYAP_ROL_TURLERI.BORCLU.kod,
      'KEFIL': UYAP_ROL_TURLERI.KEFIL.kod,
      'MUSTEREN_BORCLU': UYAP_ROL_TURLERI.MUSTEREN_BORCLU.kod,
      'MIRASCI': UYAP_ROL_TURLERI.MIRASCI.kod,
      'KESIDECI': UYAP_ROL_TURLERI.KESIDECI.kod,
      'CIRANTA': UYAP_ROL_TURLERI.CIRANTA.kod,
      'AVALCI': UYAP_ROL_TURLERI.AVALCI.kod,
    };
    return mapping[role] || UYAP_ROL_TURLERI.BORCLU.kod;
  }

  private buildAlacakKalemleri(caseRecord: any): UyapAlacakKalemi[] {
    const kalemleri: UyapAlacakKalemi[] = [];
    let siraNo = 1;

    // ClaimItems'dan
    for (const ci of caseRecord.claimItems || []) {
      kalemleri.push({
        siraNo: siraNo++,
        aciklama: ci.description || 'Alacak',
        tutar: Number(ci.amount) || 0,
        paraBirimi: UYAP_PARA_BIRIMLERI[ci.currency as keyof typeof UYAP_PARA_BIRIMLERI]?.kod || 'TL',
        vadeTarihi: ci.dueDate?.toISOString().split('T')[0],
        faiz: ci.interestType ? {
          faizTuru: this.mapInterestTypeToUyapKod(ci.interestType),
          faizOrani: ci.interestRate ? Number(ci.interestRate) : undefined,
          baslangicTarihi: ci.interestStartDate?.toISOString().split('T')[0] || ci.dueDate?.toISOString().split('T')[0] || '',
          islemisFaiz: ci.interestAmount ? Number(ci.interestAmount) : undefined,
        } : undefined,
      });
    }

    // Eğer alacak kalemi yoksa, principalAmount'tan oluştur
    if (kalemleri.length === 0 && caseRecord.principalAmount) {
      kalemleri.push({
        siraNo: 1,
        aciklama: 'Asıl Alacak',
        tutar: Number(caseRecord.principalAmount),
        paraBirimi: UYAP_PARA_BIRIMLERI[caseRecord.currency as keyof typeof UYAP_PARA_BIRIMLERI]?.kod || 'TL',
        vadeTarihi: caseRecord.startDate?.toISOString().split('T')[0],
        faiz: caseRecord.interestType ? {
          faizTuru: this.mapInterestTypeToUyapKod(caseRecord.interestType),
          faizOrani: caseRecord.interestRate ? Number(caseRecord.interestRate) : undefined,
          baslangicTarihi: caseRecord.startDate?.toISOString().split('T')[0] || '',
        } : undefined,
      });
    }

    return kalemleri;
  }

  private mapInterestTypeToUyapKod(type: string): string {
    const mapping: Record<string, string> = {
      'YASAL': UYAP_FAIZ_KODLARI.YASAL.kod,
      'TICARI': UYAP_FAIZ_KODLARI.TICARI_TEMERRUT.kod,
      'TEMERRUT': UYAP_FAIZ_KODLARI.TICARI_TEMERRUT.kod,
      'REESKONT': UYAP_FAIZ_KODLARI.REESKONT.kod,
      'AVANS': UYAP_FAIZ_KODLARI.AVANS.kod,
      'MEVDUAT': UYAP_FAIZ_KODLARI.MEVDUAT.kod,
      'AKIT': UYAP_FAIZ_KODLARI.AKIT.kod,
    };
    return mapping[type] || UYAP_FAIZ_KODLARI.DIGER.kod;
  }

  private async getCeklerFromCase(caseId: string): Promise<UyapCek[]> {
    const instruments = await this.prisma.caseInstrument.findMany({
      where: { caseId, instrumentType: 'CEK' },
    });

    return instruments.map((inst) => ({
      seriNo: inst.serialNo || '',
      cekNo: inst.serialNo || '',
      tutar: Number(inst.amount) || 0,
      paraBirimi: UYAP_PARA_BIRIMLERI[inst.currency as keyof typeof UYAP_PARA_BIRIMLERI]?.kod || 'TL',
      kesideTarihi: inst.issueDate?.toISOString().split('T')[0] || '',
      vadeTarihi: inst.maturityDate?.toISOString().split('T')[0],
      ibrazTarihi: inst.presentmentDate?.toISOString().split('T')[0],
      bankaAdi: inst.bankName || undefined,
      subeAdi: inst.bankBranch || undefined,
      hesapNo: inst.accountNo || undefined,
      karsiliksiz: inst.isBounced,
      karsiliksizTarihi: inst.bounceDate?.toISOString().split('T')[0],
    }));
  }

  private async getSenetlerFromCase(caseId: string): Promise<UyapSenet[]> {
    const instruments = await this.prisma.caseInstrument.findMany({
      where: { caseId, instrumentType: 'SENET' },
    });

    return instruments.map((inst) => ({
      senetNo: inst.serialNo || '',
      tutar: Number(inst.amount) || 0,
      paraBirimi: UYAP_PARA_BIRIMLERI[inst.currency as keyof typeof UYAP_PARA_BIRIMLERI]?.kod || 'TL',
      duzenlenmeTarihi: inst.issueDate?.toISOString().split('T')[0] || '',
      vadeTarihi: inst.maturityDate?.toISOString().split('T')[0] || '',
    }));
  }

  private async getIlamFromCase(caseId: string): Promise<UyapIlam | undefined> {
    const judgment = await this.prisma.caseJudgment.findFirst({ where: { caseId } });
    if (!judgment) return undefined;

    return {
      mahkemeAdi: judgment.courtName || '',
      esasNo: judgment.caseNo || '',
      kararNo: judgment.decisionNo || '',
      kararTarihi: judgment.decisionDate?.toISOString().split('T')[0] || '',
      kesinlesmeTarihi: judgment.finalizationDate?.toISOString().split('T')[0],
      ilamOzeti: judgment.judgmentSummary || undefined,
    };
  }

  private getIlKodu(il: string): string {
    const ilKodlari: Record<string, string> = {
      'ADANA': '01', 'ADIYAMAN': '02', 'AFYONKARAHİSAR': '03', 'AĞRI': '04',
      'AMASYA': '05', 'ANKARA': '06', 'ANTALYA': '07', 'ARTVİN': '08',
      'AYDIN': '09', 'BALIKESİR': '10', 'BİLECİK': '11', 'BİNGÖL': '12',
      'BİTLİS': '13', 'BOLU': '14', 'BURDUR': '15', 'BURSA': '16',
      'ÇANAKKALE': '17', 'ÇANKIRI': '18', 'ÇORUM': '19', 'DENİZLİ': '20',
      'DİYARBAKIR': '21', 'EDİRNE': '22', 'ELAZIĞ': '23', 'ERZİNCAN': '24',
      'ERZURUM': '25', 'ESKİŞEHİR': '26', 'GAZİANTEP': '27', 'GİRESUN': '28',
      'GÜMÜŞHANE': '29', 'HAKKARİ': '30', 'HATAY': '31', 'ISPARTA': '32',
      'MERSİN': '33', 'İSTANBUL': '34', 'İZMİR': '35', 'KARS': '36',
      'KASTAMONU': '37', 'KAYSERİ': '38', 'KIRKLARELİ': '39', 'KIRŞEHİR': '40',
      'KOCAELİ': '41', 'KONYA': '42', 'KÜTAHYA': '43', 'MALATYA': '44',
      'MANİSA': '45', 'KAHRAMANMARAŞ': '46', 'MARDİN': '47', 'MUĞLA': '48',
      'MUŞ': '49', 'NEVŞEHİR': '50', 'NİĞDE': '51', 'ORDU': '52',
      'RİZE': '53', 'SAKARYA': '54', 'SAMSUN': '55', 'SİİRT': '56',
      'SİNOP': '57', 'SİVAS': '58', 'TEKİRDAĞ': '59', 'TOKAT': '60',
      'TRABZON': '61', 'TUNCELİ': '62', 'ŞANLIURFA': '63', 'UŞAK': '64',
      'VAN': '65', 'YOZGAT': '66', 'ZONGULDAK': '67', 'AKSARAY': '68',
      'BAYBURT': '69', 'KARAMAN': '70', 'KIRIKKALE': '71', 'BATMAN': '72',
      'ŞIRNAK': '73', 'BARTIN': '74', 'ARDAHAN': '75', 'IĞDIR': '76',
      'YALOVA': '77', 'KARABÜK': '78', 'KİLİS': '79', 'OSMANİYE': '80',
      'DÜZCE': '81',
    };
    return ilKodlari[il.toUpperCase()] || '34'; // Default İstanbul
  }

  // ==================== VALIDATION ====================

  /**
   * XML'i doğrula (exchange.dtd formatına göre)
   */
  validateXml(xml: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!xml.includes('<exchangeData')) {
      errors.push('Kök element <exchangeData> bulunamadı');
    }
    if (!xml.includes('<dosyalar>')) {
      errors.push('<dosyalar> elementi zorunludur');
    }
    if (!xml.includes('<dosya')) {
      errors.push('<dosya> elementi zorunludur');
    }
    if (!xml.includes('<taraf')) {
      errors.push('En az bir <taraf> elementi zorunludur');
    }
    if (!xml.includes('<alacakKalemi')) {
      errors.push('En az bir <alacakKalemi> elementi zorunludur');
    }

    // Attribute kontrolü
    if (!xml.includes('dosyaTipi=')) {
      errors.push('dosya elementi dosyaTipi attribute içermeli');
    }
    if (!xml.includes('takipTuru=')) {
      errors.push('dosya elementi takipTuru attribute içermeli');
    }
    if (!xml.includes('mahiyetKodu=')) {
      errors.push('dosya elementi mahiyetKodu attribute içermeli');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // ==================== LEGACY SUPPORT ====================

  /**
   * Eski format için uyumluluk (IcraTakip formatı)
   * @deprecated Use generateExchangeXml instead
   */
  generateXml(data: any): string {
    this.logger.warn('generateXml is deprecated, use generateExchangeXml instead');
    // Eski formatı yeni formata dönüştür ve oluştur
    return this.generateExchangeXml(this.convertLegacyData(data));
  }

  private convertLegacyData(data: any): UyapExchangeData {
    // Eski ETakipXmlData formatından UyapExchangeData'ya dönüşüm
    const { dosyaTipi, takipTuru, takipYolu, takipSekli, mahiyetKodu } = 
      this.determineTakipAttributes(
        data.takipBilgileri?.takipTuru || 'ILAMSIZ',
        undefined,
        data.takipBilgileri?.takipYolu
      );

    return {
      dosyaTipi,
      takipTuru,
      takipYolu,
      takipSekli,
      mahiyetKodu: data.takipBilgileri?.takipMahiyetiKodu || mahiyetKodu,
      birimKodu: data.takipBilgileri?.icraDairesi?.birimKodu || '',
      takipTarihi: data.takipBilgileri?.takipTarihi || new Date().toISOString().split('T')[0],
      paraBirimi: UYAP_PARA_BIRIMLERI[data.takipBilgileri?.paraBirimi as keyof typeof UYAP_PARA_BIRIMLERI]?.kod || 'TL',
      taraflar: [],
      alacakKalemleri: [],
    };
  }
}
