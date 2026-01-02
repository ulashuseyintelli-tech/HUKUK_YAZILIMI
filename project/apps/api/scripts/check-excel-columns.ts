import * as XLSX from 'xlsx';

const EXCEL_FILE_PATH = 'C:\\Users\\ulas.htelli\\Desktop\\Ek-5_Birim_Kodlari_Tablosu.xlsx';

const wb = XLSX.readFile(EXCEL_FILE_PATH);
console.log('Sheet isimleri:', wb.SheetNames.slice(0, 5));

// Batman sheet'ini kontrol et
const sheet = wb.Sheets['batman'];
if (sheet) {
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  console.log('\n=== BATMAN ===');
  console.log('Başlık satırı:', data[0]);
  console.log('\nİlk 10 satır:');
  for (let i = 1; i <= 10 && i < data.length; i++) {
    const row = data[i];
    console.log(`${i}: ID=${row[0]} | Ad=${row[1]} | Col3=${row[2]} | Col4=${row[3]}`);
  }
}
