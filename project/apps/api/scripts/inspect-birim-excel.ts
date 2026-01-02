import * as XLSX from 'xlsx';

const EXCEL_FILE_PATH = 'C:\\Users\\ulas.htelli\\Desktop\\Ek-5_Birim_Kodlari_Tablosu.xlsx';

const workbook = XLSX.readFile(EXCEL_FILE_PATH);

console.log('Sheet isimleri:', workbook.SheetNames);
console.log('Sheet sayısı:', workbook.SheetNames.length);

// Her sheet için bilgi
workbook.SheetNames.slice(0, 5).forEach(sheetName => {
  console.log(`\n=== Sheet: ${sheetName} ===`);
  const sheet = workbook.Sheets[sheetName];
  console.log(`Range: ${sheet['!ref']}`);
  
  // İlk 5 satırı göster
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  console.log('İlk 3 satır:');
  for (let i = 0; i < Math.min(3, data.length); i++) {
    const row = data[i] as any[];
    console.log(`  ${i}: ${row.slice(0, 5).join(' | ')}`);
  }
});
