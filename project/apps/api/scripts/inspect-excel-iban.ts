import * as XLSX from 'xlsx';

const EXCEL_PATH = 'C:\\Users\\ulas.htelli\\Desktop\\excel icra müd\\icra daireleri vergi no ve ıban bilgileri.xlsx';

const workbook = XLSX.readFile(EXCEL_PATH);
console.log('Sheet isimleri:', workbook.SheetNames);

const sheet = workbook.Sheets[workbook.SheetNames[0]];

// Ham veri olarak oku
const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

console.log('\nİlk 15 satır (ham):');
for (let i = 0; i < 15 && i < rawData.length; i++) {
  console.log(`Satır ${i}:`, rawData[i]?.slice(0, 10));
}

// Range bilgisi
console.log('\nSheet range:', sheet['!ref']);
