import * as XLSX from 'xlsx';
import * as path from 'path';

const filePath = path.join(__dirname, 'icra-daireleri.xlsx');
const workbook = XLSX.readFile(filePath);

// İlk sheet'i al
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

// JSON'a çevir
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

// İlk 20 satırı göster
console.log('Sheet adı:', sheetName);
console.log('Toplam satır:', data.length);
console.log('\nİlk 20 satır (boş olmayanlar):');
let count = 0;
for (let i = 0; i < data.length && count < 20; i++) {
  const row = data[i] as any[];
  if (row && row.length > 0 && row.some(cell => cell !== undefined && cell !== null && cell !== '')) {
    console.log(`Satır ${i}:`, row);
    count++;
  }
}
