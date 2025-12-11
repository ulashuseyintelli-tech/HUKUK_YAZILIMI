import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const excelPath = 'C:\\Users\\ulas.htelli\\Desktop\\Ek-5_Birim_Kodlari_Tablosu.xlsx';

console.log('Excel dosyası okunuyor:', excelPath);

const workbook = XLSX.readFile(excelPath);
console.log('Sayfalar:', workbook.SheetNames);

const allIcraUnits: any[] = [];

// Her sayfayı tara
workbook.SheetNames.forEach(sheetName => {
  console.log(`\n--- Sayfa: ${sheetName} ---`);
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  
  if (data.length === 0) return;
  
  // İlk satır başlıklar
  const headers = data[0] as string[];
  console.log('Sütunlar:', headers);
  
  // Birim ID ve Birim Adı sütunlarını bul
  let birimIdIndex = -1;
  let birimAdiIndex = -1;
  let ilIndex = -1;
  let ilceIndex = -1;
  
  headers.forEach((h, i) => {
    const header = String(h || '').toLowerCase().trim();
    if (header.includes('birim') && (header.includes('id') || header.includes('kod'))) birimIdIndex = i;
    if (header.includes('birim') && header.includes('ad')) birimAdiIndex = i;
    if (header === 'il' || header === 'il adı' || header === 'il_adi') ilIndex = i;
    if (header === 'ilçe' || header === 'ilce' || header === 'ilçe adı') ilceIndex = i;
  });
  
  console.log(`Birim ID index: ${birimIdIndex}, Birim Adı index: ${birimAdiIndex}`);
  
  if (birimIdIndex === -1 || birimAdiIndex === -1) {
    console.log('Birim ID veya Birim Adı sütunu bulunamadı, atlanıyor...');
    return;
  }

  // Verileri tara - "icra" içeren birimleri bul
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    
    const birimId = row[birimIdIndex];
    const birimAdi = String(row[birimAdiIndex] || '').trim();
    const il = ilIndex >= 0 ? String(row[ilIndex] || '').trim() : '';
    const ilce = ilceIndex >= 0 ? String(row[ilceIndex] || '').trim() : '';
    
    // "icra" kelimesi geçen birimleri filtrele (Türkçe karakter desteği)
    if (birimAdi.toLocaleLowerCase('tr-TR').includes('icra') || 
        birimAdi.includes('İCRA') || birimAdi.includes('İcra')) {
      // İl bilgisini sayfa adından al (sayfa adı = il adı)
      const cityName = sheetName.charAt(0).toLocaleUpperCase('tr-TR') + sheetName.slice(1).toLocaleLowerCase('tr-TR');
      allIcraUnits.push({
        uyapCode: String(birimId),
        name: birimAdi,
        city: cityName,
        district: ilce,
        sheetName: sheetName
      });
    }
  }
});

console.log(`\n\n========== TOPLAM ${allIcraUnits.length} İCRA BİRİMİ BULUNDU ==========\n`);

// Türlere göre grupla
const icraTypes: Record<string, any[]> = {
  'İcra Dairesi': [],
  'İcra Hukuk Mahkemesi': [],
  'İcra Ceza Mahkemesi': [],
  'Diğer İcra Birimleri': []
};

allIcraUnits.forEach(unit => {
  const name = unit.name.toLowerCase();
  if (name.includes('icra dairesi') || name.includes('icra müdürlüğü')) {
    icraTypes['İcra Dairesi'].push(unit);
  } else if (name.includes('icra hukuk')) {
    icraTypes['İcra Hukuk Mahkemesi'].push(unit);
  } else if (name.includes('icra ceza')) {
    icraTypes['İcra Ceza Mahkemesi'].push(unit);
  } else {
    icraTypes['Diğer İcra Birimleri'].push(unit);
  }
});

Object.entries(icraTypes).forEach(([type, units]) => {
  console.log(`\n${type}: ${units.length} adet`);
  units.slice(0, 5).forEach(u => console.log(`  - [${u.uyapCode}] ${u.name} (${u.city})`));
  if (units.length > 5) console.log(`  ... ve ${units.length - 5} adet daha`);
});

// JSON olarak kaydet
const outputPath = path.join(__dirname, '..', 'data', 'uyap-icra-birimleri.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(allIcraUnits, null, 2), { encoding: 'utf8' });
console.log(`\n\nJSON dosyası kaydedildi: ${outputPath}`);

// SQL insert için de hazırla
const sqlPath = path.join(__dirname, '..', 'data', 'uyap-icra-birimleri.sql');
let sql = '-- UYAP İcra Birimleri\n-- Otomatik oluşturuldu\n\n';
sql += 'INSERT INTO "ExecutionOffice" ("id", "name", "city", "district", "uyapCode") VALUES\n';
const values = allIcraUnits.map((u, i) => {
  const id = `'uyap-${u.uyapCode}'`;
  const name = `'${u.name.replace(/'/g, "''")}'`;
  const city = u.city ? `'${u.city.replace(/'/g, "''")}'` : 'NULL';
  const district = u.district ? `'${u.district.replace(/'/g, "''")}'` : 'NULL';
  const code = `'${u.uyapCode}'`;
  return `(${id}, ${name}, ${city}, ${district}, ${code})`;
});
sql += values.join(',\n') + '\nON CONFLICT ("uyapCode") DO UPDATE SET "name" = EXCLUDED."name", "city" = EXCLUDED."city", "district" = EXCLUDED."district";';
fs.writeFileSync(sqlPath, sql, 'utf-8');
console.log(`SQL dosyası kaydedildi: ${sqlPath}`);
