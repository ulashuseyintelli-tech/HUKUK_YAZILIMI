import * as XLSX from 'xlsx';

const excelPath = 'C:\\Users\\ulas.htelli\\Desktop\\Ek-5_Birim_Kodlari_Tablosu.xlsx';
const workbook = XLSX.readFile(excelPath);

// İstanbul sayfasından icra içeren birimleri ara
const sheet = workbook.Sheets['istanbul'];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

console.log('İstanbul - İCRA içeren birimler:');
data.forEach((row, i) => {
  if (row[1]) {
    const birimAdi = String(row[1]);
    // Türkçe karakterleri de dikkate al
    if (birimAdi.toLocaleLowerCase('tr-TR').includes('icra') || 
        birimAdi.includes('İCRA') || birimAdi.includes('İcra')) {
      console.log(`${row[0]}: ${birimAdi}`);
    }
  }
});
