/**
 * Excel dosyasını incele
 */

import * as XLSX from 'xlsx';

const EXCEL_FILE_PATH = 'C:\\Users\\ulas.htelli\\Desktop\\excel icra müd\\icra daireleri vergi no ve ıban bilgileri.xlsx';

const workbook = XLSX.readFile(EXCEL_FILE_PATH, { cellStyles: true, cellFormula: true });

console.log('Sheet isimleri:', workbook.SheetNames);

workbook.SheetNames.forEach(sheetName => {
  console.log(`\n=== Sheet: ${sheetName} ===`);
  const sheet = workbook.Sheets[sheetName];
  
  // Range bilgisi
  console.log(`Range: ${sheet['!ref']}`);
  
  // Hücreleri doğrudan kontrol et
  console.log('\nİlk hücreler:');
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 19; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[cellRef];
      if (cell && cell.v !== undefined && cell.v !== '') {
        console.log(`  ${cellRef}: ${cell.v}`);
      }
    }
  }
  
  // Tüm dolu hücreleri say
  let filledCells = 0;
  Object.keys(sheet).forEach(key => {
    if (!key.startsWith('!') && sheet[key].v !== undefined && sheet[key].v !== '') {
      filledCells++;
    }
  });
  console.log(`\nToplam dolu hücre: ${filledCells}`);
  
  // İlk dolu hücreleri göster
  console.log('\nİlk 20 dolu hücre:');
  let count = 0;
  Object.keys(sheet).sort().forEach(key => {
    if (!key.startsWith('!') && sheet[key].v !== undefined && sheet[key].v !== '' && count < 20) {
      console.log(`  ${key}: ${sheet[key].v}`);
      count++;
    }
  });
});
