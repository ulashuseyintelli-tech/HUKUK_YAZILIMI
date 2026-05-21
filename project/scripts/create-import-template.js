const ExcelJS = require('../apps/api/node_modules/exceljs');
const path = require('path');

async function createTemplate() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hukuk Platform';
  wb.created = new Date();

  // ===== SAYFA 1: TOPLU İMPORT ŞABLONU =====
  const ws = wb.addWorksheet('Toplu Import', {
    properties: { defaultColWidth: 18 },
  });

  const columns = [
    // A) DOSYA BİLGİLERİ
    { header: 'Dosya No (*)', key: 'dosya_no', width: 15 },
    { header: 'İcra Dosya No', key: 'icra_dosya_no', width: 18 },
    { header: 'İcra Dairesi', key: 'icra_dairesi', width: 28 },
    { header: 'Takip Tarihi', key: 'takip_tarihi', width: 14 },
    { header: 'Takip Türü (*)', key: 'takip_turu', width: 22 },
    { header: 'Takip Yolu', key: 'takip_yolu', width: 14 },
    { header: 'Alt Kategori', key: 'alt_kategori', width: 14 },
    { header: 'Para Birimi', key: 'para_birimi', width: 12 },
    { header: 'Dosya Durumu', key: 'dosya_durumu', width: 16 },
    // B) ALACAKLI
    { header: 'Alacaklı Tipi (*)', key: 'alacakli_tipi', width: 16 },
    { header: 'Alacaklı Ad', key: 'alacakli_ad', width: 16 },
    { header: 'Alacaklı Soyad', key: 'alacakli_soyad', width: 16 },
    { header: 'Alacaklı TCKN', key: 'alacakli_tckn', width: 14 },
    { header: 'Alacaklı Ünvan', key: 'alacakli_unvan', width: 24 },
    { header: 'Alacaklı VKN', key: 'alacakli_vkn', width: 14 },
    { header: 'Alacaklı Vergi Dairesi', key: 'alacakli_vergi_dairesi', width: 20 },
    { header: 'Alacaklı Telefon', key: 'alacakli_telefon', width: 16 },
    { header: 'Alacaklı Email', key: 'alacakli_email', width: 22 },
    { header: 'Alacaklı Adres', key: 'alacakli_adres', width: 30 },
    { header: 'Alacaklı İl', key: 'alacakli_il', width: 14 },
    { header: 'Alacaklı İlçe', key: 'alacakli_ilce', width: 14 },
    // C) BORÇLU
    { header: 'Borçlu Tipi (*)', key: 'borclu_tipi', width: 16 },
    { header: 'Borçlu Ad', key: 'borclu_ad', width: 16 },
    { header: 'Borçlu Soyad', key: 'borclu_soyad', width: 16 },
    { header: 'Borçlu TCKN', key: 'borclu_tckn', width: 14 },
    { header: 'Borçlu Ünvan', key: 'borclu_unvan', width: 24 },
    { header: 'Borçlu VKN', key: 'borclu_vkn', width: 14 },
    { header: 'Borçlu Vergi Dairesi', key: 'borclu_vergi_dairesi', width: 20 },
    { header: 'Borçlu Telefon', key: 'borclu_telefon', width: 16 },
    { header: 'Borçlu Email', key: 'borclu_email', width: 22 },
    { header: 'Borçlu Adres', key: 'borclu_adres', width: 30 },
    { header: 'Borçlu İl', key: 'borclu_il', width: 14 },
    { header: 'Borçlu İlçe', key: 'borclu_ilce', width: 14 },
    // D) AVUKAT
    { header: 'Avukat Ad', key: 'avukat_ad', width: 14 },
    { header: 'Avukat Soyad', key: 'avukat_soyad', width: 14 },
    { header: 'Avukat TCKN', key: 'avukat_tckn', width: 14 },
    { header: 'Avukat Baro No', key: 'avukat_baro_no', width: 14 },
    { header: 'Avukat Baro İl', key: 'avukat_baro_il', width: 14 },
    // E) ALACAK
    { header: 'Asıl Alacak', key: 'asil_alacak', width: 16 },
    { header: 'Faiz Türü', key: 'faiz_turu', width: 14 },
    { header: 'Faiz Başlangıç', key: 'faiz_baslangic', width: 14 },
    { header: 'Notlar', key: 'notlar', width: 30 },
  ];

  ws.columns = columns;

  // Header stilini ayarla
  const headerRow = ws.getRow(1);
  headerRow.height = 30;
  headerRow.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  // Renk grupları
  const colorMap = {
    dosya: 'FF2563EB',      // mavi - dosya bilgileri
    alacakli: 'FF16A34A',   // yeşil - alacaklı
    borclu: 'FFDC2626',     // kırmızı - borçlu
    avukat: 'FF9333EA',     // mor - avukat
    alacak: 'FFF59E0B',     // turuncu - alacak
  };

  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    let fill;
    if (idx < 9) fill = colorMap.dosya;
    else if (idx < 21) fill = colorMap.alacakli;
    else if (idx < 33) fill = colorMap.borclu;
    else if (idx < 38) fill = colorMap.avukat;
    else fill = colorMap.alacak;

    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    cell.border = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    };
  });

  // Dropdown validasyonları
  const takipTuruList = '"Genel İcra (İlamsız),Çek,Senet (Bono),Kira,İpotek,Rehin,İflas,Diğer"';
  const takipYoluList = '"Haciz,İflas,Rehin"';
  const altKategoriList = '"Genel,Nafaka,Döviz,Kira"';
  const paraBirimiList = '"TRY,USD,EUR,GBP,CHF"';
  const durumList = '"Derdest,İşlemde,Derkenar,Hitam,İnfaz,Müvekkile İade,Aciz,Batak"';
  const tipList = '"Şahıs,Şirket"';
  const borcluTipList = '"Şahıs,Şirket,Kamu Kurumu,Tereke"';
  const faizList = '"Yasal,Ticari,Avans,Temerrüt,Sabit"';

  for (let r = 2; r <= 1001; r++) {
    ws.getCell(`E${r}`).dataValidation = { type: 'list', formulae: [takipTuruList], showErrorMessage: true, errorTitle: 'Hata', error: 'Listeden seçiniz' };
    ws.getCell(`F${r}`).dataValidation = { type: 'list', formulae: [takipYoluList] };
    ws.getCell(`G${r}`).dataValidation = { type: 'list', formulae: [altKategoriList] };
    ws.getCell(`H${r}`).dataValidation = { type: 'list', formulae: [paraBirimiList] };
    ws.getCell(`I${r}`).dataValidation = { type: 'list', formulae: [durumList] };
    ws.getCell(`J${r}`).dataValidation = { type: 'list', formulae: [tipList] };
    ws.getCell(`V${r}`).dataValidation = { type: 'list', formulae: [borcluTipList] };
    ws.getCell(`AN${r}`).dataValidation = { type: 'list', formulae: [faizList] };
  }

  // Tarih formatı
  for (let r = 2; r <= 1001; r++) {
    ws.getCell(`D${r}`).numFmt = 'DD.MM.YYYY';
    ws.getCell(`AO${r}`).numFmt = 'DD.MM.YYYY';
  }

  // Örnek veri satırları
  const examples = [
    {
      dosya_no: '2024/0001', icra_dosya_no: '2024/12345', icra_dairesi: 'İstanbul 5. İcra Dairesi',
      takip_tarihi: '15.03.2024', takip_turu: 'Genel İcra (İlamsız)', takip_yolu: 'Haciz',
      alt_kategori: 'Genel', para_birimi: 'TRY', dosya_durumu: 'Derdest',
      alacakli_tipi: 'Şahıs', alacakli_ad: 'Örnek', alacakli_soyad: 'Alacaklı',
      alacakli_tckn: '11111111111', alacakli_telefon: '05321111111',
      alacakli_adres: 'Atatürk Cad. No:1', alacakli_il: 'İstanbul', alacakli_ilce: 'Kadıköy',
      borclu_tipi: 'Şahıs', borclu_ad: 'Örnek', borclu_soyad: 'Borçlu',
      borclu_tckn: '22222222222', borclu_adres: 'İnönü Cad. No:5',
      borclu_il: 'İstanbul', borclu_ilce: 'Beşiktaş',
      avukat_ad: 'Örnek', avukat_soyad: 'Avukat', avukat_baro_no: '12345', avukat_baro_il: 'İstanbul',
      asil_alacak: 50000, faiz_turu: 'Yasal', faiz_baslangic: '15.03.2024',
      notlar: 'Örnek dosya - silinebilir',
    },
    {
      dosya_no: '2024/0002', icra_dosya_no: '2024/67890', icra_dairesi: 'Ankara 3. İcra Dairesi',
      takip_tarihi: '01.06.2024', takip_turu: 'Çek', takip_yolu: 'Haciz',
      alt_kategori: 'Genel', para_birimi: 'TRY', dosya_durumu: 'Derdest',
      alacakli_tipi: 'Şirket', alacakli_unvan: 'Örnek Ticaret A.Ş.',
      alacakli_vkn: '1234567890', alacakli_vergi_dairesi: 'Çankaya',
      alacakli_adres: 'Kızılay Mah. No:10', alacakli_il: 'Ankara', alacakli_ilce: 'Çankaya',
      borclu_tipi: 'Şirket', borclu_unvan: 'Borçlu İnşaat Ltd. Şti.',
      borclu_vkn: '9876543210', borclu_vergi_dairesi: 'Ulus',
      borclu_adres: 'Sanayi Sitesi No:15', borclu_il: 'Ankara', borclu_ilce: 'Yenimahalle',
      avukat_ad: 'Örnek', avukat_soyad: 'Avukat', avukat_baro_no: '12345', avukat_baro_il: 'İstanbul',
      asil_alacak: 125000, faiz_turu: 'Ticari', faiz_baslangic: '01.06.2024',
      notlar: 'Çek takibi örneği',
    },
    {
      dosya_no: '2024/0002', icra_dosya_no: '2024/67890', icra_dairesi: 'Ankara 3. İcra Dairesi',
      takip_tarihi: '01.06.2024', takip_turu: 'Çek', takip_yolu: 'Haciz',
      alt_kategori: 'Genel', para_birimi: 'TRY', dosya_durumu: 'Derdest',
      alacakli_tipi: 'Şirket', alacakli_unvan: 'Örnek Ticaret A.Ş.',
      alacakli_vkn: '1234567890',
      borclu_tipi: 'Şahıs', borclu_ad: 'İkinci', borclu_soyad: 'Borçlu',
      borclu_tckn: '33333333333', borclu_adres: 'Bahçelievler Mah. No:8',
      borclu_il: 'Ankara', borclu_ilce: 'Etimesgut',
      asil_alacak: 125000,
      notlar: 'Aynı dosyanın 2. borçlusu (dosya_no tekrar eder)',
    },
  ];

  examples.forEach((ex, idx) => {
    const row = ws.getRow(idx + 2);
    columns.forEach((col) => {
      if (ex[col.key] !== undefined) {
        row.getCell(col.key).value = ex[col.key];
      }
    });
    // Örnek satırları açık sarı ile işaretle
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFDE7' } };
      cell.font = { italic: true, color: { argb: 'FF666666' }, size: 10 };
    });
  });

  // ===== SAYFA 2: AÇIKLAMALAR =====
  const wsHelp = wb.addWorksheet('Açıklamalar', { properties: { defaultColWidth: 30 } });
  wsHelp.columns = [
    { header: 'Sütun', key: 'col', width: 25 },
    { header: 'Açıklama', key: 'desc', width: 50 },
    { header: 'Geçerli Değerler', key: 'values', width: 40 },
    { header: 'Zorunlu', key: 'required', width: 10 },
  ];

  const helpHeader = wsHelp.getRow(1);
  helpHeader.font = { bold: true, size: 11 };
  helpHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

  const helpData = [
    ['Dosya No', 'Büro dosya numarası (benzersiz)', 'Serbest metin', 'Evet'],
    ['İcra Dosya No', 'İcra dairesi dosya numarası', 'Serbest metin', 'Hayır'],
    ['İcra Dairesi', 'Sistemdeki 860 icra dairesinden biri', 'Tam adı yazın, otomatik eşleşir', 'Hayır'],
    ['Takip Tarihi', 'Takip başlangıç tarihi', 'GG.AA.YYYY', 'Hayır'],
    ['Takip Türü', 'İcra takip türü', 'Dropdown listeden seçin', 'Evet'],
    ['Takip Yolu', 'İcra takip yolu', 'Haciz / İflas / Rehin', 'Hayır'],
    ['Alt Kategori', 'Alacak alt kategorisi', 'Genel / Nafaka / Döviz / Kira', 'Hayır'],
    ['Para Birimi', 'Alacak para birimi', 'TRY / USD / EUR / GBP / CHF', 'Hayır'],
    ['Dosya Durumu', 'Hukuki durum', 'Dropdown listeden seçin', 'Hayır'],
    ['Alacaklı Tipi', 'Müvekkil türü', 'Şahıs / Şirket', 'Evet'],
    ['Alacaklı TCKN/VKN', 'Kimlik veya vergi no', 'Aynı no ile tekrar gelirse mevcut kayıt kullanılır', 'Hayır'],
    ['Borçlu Tipi', 'Borçlu türü', 'Şahıs / Şirket / Kamu Kurumu / Tereke', 'Evet'],
    ['Borçlu TCKN/VKN', 'Kimlik veya vergi no', 'Aynı no ile tekrar gelirse mevcut kayıt kullanılır', 'Hayır'],
    ['Asıl Alacak', 'Ana para tutarı', 'Sayı (50000 veya 50000.50)', 'Hayır'],
    ['Faiz Türü', 'Uygulanacak faiz türü', 'Yasal / Ticari / Avans / Temerrüt / Sabit', 'Hayır'],
    ['', '', '', ''],
    ['*** ÖNEMLİ KURALLAR ***', '', '', ''],
    ['Aynı dosyada birden fazla borçlu', 'Her borçlu için ayrı satır yazın, dosya bilgileri tekrar eder', 'Bkz. 3. örnek satır', ''],
    ['Duplicate kontrolü', 'Aynı TCKN/VKN ile müvekkil veya borçlu tekrar gelirse yeni kayıt oluşmaz', '', ''],
    ['İcra dairesi eşleşme', 'Tam adı yazın, sistem fuzzy match ile eşleştirir', '', ''],
    ['Örnek satırlar', 'İlk 3 satır örnektir, import öncesi siliniz', '', ''],
  ];

  helpData.forEach((d) => wsHelp.addRow(d));

  // Freeze panes
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
  wsHelp.views = [{ state: 'frozen', ySplit: 1 }];

  // Auto-filter
  ws.autoFilter = { from: 'A1', to: `AP1` };

  const outPath = path.join(__dirname, '..', 'icra-dosya-toplu-import-sablonu.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log(`✅ Excel şablonu oluşturuldu: ${outPath}`);
}

createTemplate().catch(console.error);
