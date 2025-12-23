// Düzce İli UYAP Birim Kodları (Örnek Veri)
// Tüm Türkiye için genişletilebilir

export const UYAP_UNITS_DATA = [
  // ==================== İCRA DAİRELERİ ====================
  { birimId: '1042650', name: 'Düzce İcra Dairesi', uyapCode: '1.04.045.000.6005', unitType: 'ICRA_DAIRESI' as const, city: 'Düzce' },
  { birimId: '1003363', name: 'Akçakoca İcra Dairesi', uyapCode: '1.04.045.001.6001', unitType: 'ICRA_DAIRESI' as const, city: 'Düzce', district: 'Akçakoca' },
  { birimId: '1003382', name: 'Yığılca İcra Dairesi', uyapCode: '1.04.045.004.6001', unitType: 'ICRA_DAIRESI' as const, city: 'Düzce', district: 'Yığılca' },
  { birimId: '1032059', name: 'Düzce İcra Daireleri', uyapCode: '1.04.045.000.6000', unitType: 'ICRA_DAIRESI' as const, city: 'Düzce' },

  // ==================== İCRA MAHKEMELERİ ====================
  { birimId: '1010791', name: 'Düzce İcra Mahkemesi', uyapCode: '1.04.045.000.0351', unitType: 'ICRA_MAHKEMESI' as const, city: 'Düzce' },
  { birimId: '3009568', name: 'Düzce İcra Ceza Mahkemesi', uyapCode: '1.04.045.000.0502', unitType: 'ICRA_MAHKEMESI' as const, city: 'Düzce' },
  { birimId: '3009569', name: 'Düzce İcra Hukuk Mahkemesi', uyapCode: '1.04.045.000.0503', unitType: 'ICRA_MAHKEMESI' as const, city: 'Düzce' },
  { birimId: '3009570', name: 'Akçakoca İcra Ceza Mahkemesi', uyapCode: '1.04.045.001.0275', unitType: 'ICRA_MAHKEMESI' as const, city: 'Düzce', district: 'Akçakoca' },
  { birimId: '3009571', name: 'Akçakoca İcra Hukuk Mahkemesi', uyapCode: '1.04.045.001.0276', unitType: 'ICRA_MAHKEMESI' as const, city: 'Düzce', district: 'Akçakoca' },
  { birimId: '3009576', name: 'Yığılca İcra Ceza Mahkemesi', uyapCode: '1.04.045.004.0275', unitType: 'ICRA_MAHKEMESI' as const, city: 'Düzce', district: 'Yığılca' },
  { birimId: '3009577', name: 'Yığılca İcra Hukuk Mahkemesi', uyapCode: '1.04.045.004.0276', unitType: 'ICRA_MAHKEMESI' as const, city: 'Düzce', district: 'Yığılca' },

  // ==================== AĞIR CEZA MAHKEMELERİ ====================
  { birimId: '1003341', name: 'Düzce 1. Ağır Ceza Mahkemesi', uyapCode: '1.04.045.000.0001', unitType: 'AGIR_CEZA' as const, city: 'Düzce' },
  { birimId: '1064511', name: 'Düzce 3. Ağır Ceza Mahkemesi', uyapCode: '1.04.045.000.0003', unitType: 'AGIR_CEZA' as const, city: 'Düzce' },

  // ==================== ASLİYE HUKUK MAHKEMELERİ ====================
  { birimId: '1060439', name: 'Düzce 5. Asliye Hukuk Mahkemesi', uyapCode: '1.04.045.000.0155', unitType: 'ASLIYE_HUKUK' as const, city: 'Düzce' },

  // ==================== ASLİYE CEZA MAHKEMELERİ ====================
  { birimId: '1036707', name: 'Düzce 4. Asliye Ceza Mahkemesi', uyapCode: '1.04.045.000.0054', unitType: 'ASLIYE_CEZA' as const, city: 'Düzce' },
  { birimId: '1034190', name: 'Düzce 3. Asliye Ceza Mahkemesi', uyapCode: '1.04.045.000.0053', unitType: 'ASLIYE_CEZA' as const, city: 'Düzce' },
  { birimId: '1066975', name: 'Düzce 9. Asliye Ceza Mahkemesi', uyapCode: '1.04.045.000.0059', unitType: 'ASLIYE_CEZA' as const, city: 'Düzce' },
  { birimId: '1066974', name: 'Düzce 8. Asliye Ceza Mahkemesi', uyapCode: '1.04.045.000.0058', unitType: 'ASLIYE_CEZA' as const, city: 'Düzce' },
  { birimId: '1066976', name: 'Düzce 10. Asliye Ceza Mahkemesi', uyapCode: '1.04.045.000.0060', unitType: 'ASLIYE_CEZA' as const, city: 'Düzce' },

  // ==================== SULH HUKUK MAHKEMELERİ ====================
  { birimId: '1066978', name: 'Düzce 3. Sulh Hukuk Mahkemesi', uyapCode: '1.04.045.000.0203', unitType: 'SULH_HUKUK' as const, city: 'Düzce' },
  { birimId: '1066979', name: 'Düzce 4. Sulh Hukuk Mahkemesi', uyapCode: '1.04.045.000.0204', unitType: 'SULH_HUKUK' as const, city: 'Düzce' },
  { birimId: '1066980', name: 'Düzce 5. Sulh Hukuk Mahkemesi', uyapCode: '1.04.045.000.0205', unitType: 'SULH_HUKUK' as const, city: 'Düzce' },

  // ==================== AİLE MAHKEMELERİ ====================
  { birimId: '1054539', name: 'Düzce 3. Aile Mahkemesi', uyapCode: '1.04.045.000.0403', unitType: 'AILE_MAHKEMESI' as const, city: 'Düzce' },
  { birimId: '1037789', name: 'Düzce 2. Aile Mahkemesi', uyapCode: '1.04.045.000.0402', unitType: 'AILE_MAHKEMESI' as const, city: 'Düzce' },
  { birimId: '1066977', name: 'Düzce 4. Aile Mahkemesi', uyapCode: '1.04.045.000.0404', unitType: 'AILE_MAHKEMESI' as const, city: 'Düzce' },

  // ==================== İŞ MAHKEMELERİ ====================
  { birimId: '1060440', name: 'Düzce 3. İş Mahkemesi', uyapCode: '1.04.045.000.0453', unitType: 'IS_MAHKEMESI' as const, city: 'Düzce' },

  // ==================== KADASTRO MAHKEMELERİ ====================
  { birimId: '1003349', name: 'Düzce Kadastro Mahkemesi', uyapCode: '1.04.045.000.0251', unitType: 'KADASTRO_MAHKEMESI' as const, city: 'Düzce' },
];
