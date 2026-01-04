import { Injectable } from '@nestjs/common';
import { create } from 'xmlbuilder2';
import {
  UyapETakipDosyasi,
  UyapTakipTalebi,
  UyapTaraf,
  UyapVekil,
  UyapKisi,
  UyapAdres,
  UyapAlacakKalemi,
  UyapCekBilgisi,
  UyapSenetBilgisi,
  UyapIlamBilgisi,
  UyapEvrak,
} from './uyap-xml.types';

/**
 * UYAP e-Takip XML Builder Service
 * 
 * Case verilerini UYAP XML formatına dönüştürür.
 */
@Injectable()
export class UyapXmlBuilderService {
  
  /**
   * e-Takip dosyasını XML string'e dönüştür
   */
  buildXml(etakip: UyapETakipDosyasi): string {
    const doc = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('eTakipDosyasi', {
        versiyon: etakip.versiyon,
        olusturmaTarihi: etakip.olusturmaTarihi,
        olusturanSistem: etakip.olusturanSistem,
      });

    // Ortak Vekiller
    if (etakip.ortakVekiller?.length) {
      const ortakVekillerNode = doc.ele('ortakVekiller');
      for (const vekil of etakip.ortakVekiller) {
        this.addVekilNode(ortakVekillerNode, vekil);
      }
    }

    // Ortak Taraflar
    if (etakip.ortakTaraflar?.length) {
      const ortakTaraflarNode = doc.ele('ortakTaraflar');
      for (const taraf of etakip.ortakTaraflar) {
        this.addTarafNode(ortakTaraflarNode, taraf);
      }
    }

    // Takip Talepleri
    const takipTalepleriNode = doc.ele('takipTalepleri');
    for (const talep of etakip.takipTalepleri) {
      this.addTakipTalebiNode(takipTalepleriNode, talep);
    }

    return doc.end({ prettyPrint: true });
  }


  private addVekilNode(parent: any, vekil: UyapVekil): void {
    const node = parent.ele('vekil');
    node.ele('baroSicilNo').txt(vekil.baroSicilNo);
    node.ele('ad').txt(vekil.ad);
    node.ele('soyad').txt(vekil.soyad);
    if (vekil.tckn) node.ele('tckn').txt(vekil.tckn);
    if (vekil.vergiNo) node.ele('vergiNo').txt(vekil.vergiNo);
    if (vekil.baroAdi) node.ele('baroAdi').txt(vekil.baroAdi);
    if (vekil.telefon) node.ele('telefon').txt(vekil.telefon);
    if (vekil.email) node.ele('email').txt(vekil.email);
    if (vekil.adres) this.addAdresNode(node, vekil.adres);
  }

  private addAdresNode(parent: any, adres: UyapAdres): void {
    const node = parent.ele('adres');
    node.ele('il').txt(adres.il);
    node.ele('ilce').txt(adres.ilce);
    if (adres.mahalle) node.ele('mahalle').txt(adres.mahalle);
    if (adres.cadde) node.ele('cadde').txt(adres.cadde);
    if (adres.sokak) node.ele('sokak').txt(adres.sokak);
    if (adres.apartman) node.ele('apartman').txt(adres.apartman);
    if (adres.kapiNo) node.ele('kapiNo').txt(adres.kapiNo);
    if (adres.postaKodu) node.ele('postaKodu').txt(adres.postaKodu);
    node.ele('tamAdres').txt(adres.tamAdres);
  }

  private addKisiNode(parent: any, kisi: UyapKisi): void {
    const node = parent.ele('kisi');
    node.ele('kimlikNo').txt(kisi.kimlikNo);
    node.ele('kisiTipi').txt(kisi.kisiTipi);
    
    if (kisi.kisiTipi === 'GERCEK_KISI') {
      if (kisi.ad) node.ele('ad').txt(kisi.ad);
      if (kisi.soyad) node.ele('soyad').txt(kisi.soyad);
      if (kisi.babaAdi) node.ele('babaAdi').txt(kisi.babaAdi);
      if (kisi.anneAdi) node.ele('anneAdi').txt(kisi.anneAdi);
      if (kisi.dogumTarihi) node.ele('dogumTarihi').txt(kisi.dogumTarihi);
      if (kisi.dogumYeri) node.ele('dogumYeri').txt(kisi.dogumYeri);
    } else {
      if (kisi.unvan) node.ele('unvan').txt(kisi.unvan);
    }
    
    if (kisi.telefon) node.ele('telefon').txt(kisi.telefon);
    if (kisi.email) node.ele('email').txt(kisi.email);
    if (kisi.adres) this.addAdresNode(node, kisi.adres);
  }

  private addTarafNode(parent: any, taraf: UyapTaraf): void {
    const node = parent.ele('taraf');
    node.ele('rol').txt(taraf.rol);
    this.addKisiNode(node, taraf.kisi);
    if (taraf.vekil) this.addVekilNode(node, taraf.vekil);
  }


  private addAlacakKalemiNode(parent: any, kalem: UyapAlacakKalemi): void {
    const node = parent.ele('alacakKalemi');
    node.ele('tur').txt(kalem.tur);
    node.ele('aciklama').txt(kalem.aciklama);
    node.ele('tutar').txt(kalem.tutar.toString());
    node.ele('paraBirimi').txt(kalem.paraBirimi);
    
    if (kalem.faiz) {
      const faizNode = node.ele('faiz');
      faizNode.ele('baslangicTarihi').txt(kalem.faiz.baslangicTarihi);
      faizNode.ele('faizTuruKodu').txt(kalem.faiz.faizTuruKodu);
      faizNode.ele('faizTuruAciklama').txt(kalem.faiz.faizTuruAciklama);
      if (kalem.faiz.faizOrani) {
        faizNode.ele('faizOrani').txt(kalem.faiz.faizOrani.toString());
      }
      faizNode.ele('faizSureTipi').txt(kalem.faiz.faizSureTipi);
    }
  }

  private addCekNode(parent: any, cek: UyapCekBilgisi): void {
    const node = parent.ele('cek');
    node.ele('seriNo').txt(cek.seriNo);
    node.ele('bankaAdi').txt(cek.bankaAdi);
    if (cek.subeAdi) node.ele('subeAdi').txt(cek.subeAdi);
    node.ele('kesideTarihi').txt(cek.kesideTarihi);
    if (cek.ibrazTarihi) node.ele('ibrazTarihi').txt(cek.ibrazTarihi);
    node.ele('tutar').txt(cek.tutar.toString());
    node.ele('paraBirimi').txt(cek.paraBirimi);
    if (cek.kesideci) this.addKisiNode(node, cek.kesideci);
    
    if (cek.alacakKalemleri?.length) {
      const kalemlerNode = node.ele('alacakKalemleri');
      for (const kalem of cek.alacakKalemleri) {
        this.addAlacakKalemiNode(kalemlerNode, kalem);
      }
    }
  }

  private addSenetNode(parent: any, senet: UyapSenetBilgisi): void {
    const node = parent.ele('senet');
    if (senet.senetNo) node.ele('senetNo').txt(senet.senetNo);
    node.ele('duzenlemeTarihi').txt(senet.duzenlemeTarihi);
    node.ele('vadeTarihi').txt(senet.vadeTarihi);
    if (senet.duzenlemeYeri) node.ele('duzenlemeYeri').txt(senet.duzenlemeYeri);
    if (senet.odemeYeri) node.ele('odemeYeri').txt(senet.odemeYeri);
    node.ele('tutar').txt(senet.tutar.toString());
    node.ele('paraBirimi').txt(senet.paraBirimi);
    if (senet.borclu) this.addKisiNode(node, senet.borclu);
    
    if (senet.alacakKalemleri?.length) {
      const kalemlerNode = node.ele('alacakKalemleri');
      for (const kalem of senet.alacakKalemleri) {
        this.addAlacakKalemiNode(kalemlerNode, kalem);
      }
    }
  }


  private addIlamNode(parent: any, ilam: UyapIlamBilgisi): void {
    const node = parent.ele('ilam');
    node.ele('mahkemeAdi').txt(ilam.mahkemeAdi);
    node.ele('esasNo').txt(ilam.esasNo);
    node.ele('kararNo').txt(ilam.kararNo);
    node.ele('kararTarihi').txt(ilam.kararTarihi);
    if (ilam.kesinlesmeTarihi) node.ele('kesinlesmeTarihi').txt(ilam.kesinlesmeTarihi);
    if (ilam.ilamTuru) node.ele('ilamTuru').txt(ilam.ilamTuru);
    
    if (ilam.alacakKalemleri?.length) {
      const kalemlerNode = node.ele('alacakKalemleri');
      for (const kalem of ilam.alacakKalemleri) {
        this.addAlacakKalemiNode(kalemlerNode, kalem);
      }
    }
    
    if (ilam.paraIleOlculemeyenAlacaklar?.length) {
      const paraDisiNode = node.ele('paraIleOlculemeyenAlacaklar');
      for (const alacak of ilam.paraIleOlculemeyenAlacaklar) {
        paraDisiNode.ele('alacak').txt(alacak);
      }
    }
    
    if (ilam.teminat) {
      const teminatNode = node.ele('teminat');
      teminatNode.ele('tur').txt(ilam.teminat.tur);
      if (ilam.teminat.tutar) teminatNode.ele('tutar').txt(ilam.teminat.tutar.toString());
      if (ilam.teminat.aciklama) teminatNode.ele('aciklama').txt(ilam.teminat.aciklama);
    }
  }

  private addEvrakNode(parent: any, evrak: UyapEvrak): void {
    const node = parent.ele('evrak');
    node.ele('tur').txt(evrak.tur);
    if (evrak.aciklama) node.ele('aciklama').txt(evrak.aciklama);
    node.ele('dosyaAdi').txt(evrak.dosyaAdi);
    node.ele('mimeType').txt(evrak.mimeType);
    node.ele('boyut').txt(evrak.boyut.toString());
    node.ele('icerik').txt(evrak.icerik); // Base64
  }

  private addTakipTalebiNode(parent: any, talep: UyapTakipTalebi): void {
    const node = parent.ele('takipTalebi');
    node.ele('dosyaBelirleyici').txt(talep.dosyaBelirleyici);
    node.ele('dosyaTuru').txt(talep.dosyaTuru);
    node.ele('takipTuru').txt(talep.takipTuru);
    node.ele('takipYolu').txt(talep.takipYolu);
    node.ele('takipSekli').txt(talep.takipSekli);
    node.ele('madde48_4Aciklama').txt(talep.madde48_4Aciklama);
    if (talep.madde48_9Aciklama) node.ele('madde48_9Aciklama').txt(talep.madde48_9Aciklama);
    node.ele('bk84Uygula').txt(talep.bk84Uygula ? 'true' : 'false');
    node.ele('bsmvUygula').txt(talep.bsmvUygula ? 'true' : 'false');
    node.ele('kkdfUygula').txt(talep.kkdfUygula ? 'true' : 'false');

    // Taraflar
    if (talep.taraflar?.length) {
      const taraflarNode = node.ele('taraflar');
      for (const taraf of talep.taraflar) {
        this.addTarafNode(taraflarNode, taraf);
      }
    }

    // Çekler
    if (talep.cekler?.length) {
      const ceklerNode = node.ele('cekler');
      for (const cek of talep.cekler) {
        this.addCekNode(ceklerNode, cek);
      }
    }

    // Senetler
    if (talep.senetler?.length) {
      const senetlerNode = node.ele('senetler');
      for (const senet of talep.senetler) {
        this.addSenetNode(senetlerNode, senet);
      }
    }

    // İlamlar
    if (talep.ilamlar?.length) {
      const ilamlarNode = node.ele('ilamlar');
      for (const ilam of talep.ilamlar) {
        this.addIlamNode(ilamlarNode, ilam);
      }
    }

    // Evraklar
    if (talep.evraklar?.length) {
      const evraklarNode = node.ele('evraklar');
      for (const evrak of talep.evraklar) {
        this.addEvrakNode(evraklarNode, evrak);
      }
    }
  }
}
