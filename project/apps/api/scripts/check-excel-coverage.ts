/**
 * Excel'deki IBAN bilgilerinin veritabanındaki eksik kayıtları karşılayıp karşılamadığını kontrol et
 */

import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();
const TENANT_ID = 'cmj4m2jek0000mvu2om5rcjv2';
const EXCEL_PATH = 'C:\\Users\\ulas.htelli\\Desktop\\excel icra müd\\icra daireleri vergi no ve ıban bilgileri.xlsx';

async function check() {
  // Excel'i oku
  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet) as any[];
  
  console.log(`Excel'de ${data.length} kayıt var\n`);
  
  // Excel'deki UYAP kodlarını topla
  const excelUyapCodes = new Set<string>();
  data.forEach(row => {
    // Farklı sütun isimlerini dene
    const uyapCode = row['UYAP Kod'] || row['Uyap Kod'] || row['uyap_kod'] || row['UYAP_KOD'];
    if (uyapCode) {
      excelUyapCodes.add(String(uyapCode).trim());
    }
  });
  
  console.log(`Excel'de ${excelUyapCodes.size} benzersiz UYAP kodu var\n`);
  
  // Veritabanındaki IBAN eksik olanları al
  const missingIban = await prisma.executionOffice.findMany({
    where: { 
      tenantId: TENANT_ID,
      OR: [{ iban: null }, { iban: '' }]
    },
    select: { uyapCode: true, name: true, city: true }
  });
  
  console.log(`Veritabanında ${missingIban.length} IBAN eksik kayıt var\n`);
  
  // Excel'de olup veritabanında IBAN eksik olanları bul
  let canFix = 0;
  let cannotFix = 0;
  const cannotFixList: string[] = [];
  
  for (const office of missingIban) {
    if (office.uyapCode && excelUyapCodes.has(office.uyapCode)) {
      canFix++;
    } else {
      cannotFix++;
      if (cannotFixList.length < 20) {
        cannotFixList.push(`${office.uyapCode} | ${office.name} | ${office.city}`);
      }
    }
  }
  
  console.log(`Excel'den düzeltilebilir: ${canFix}`);
  console.log(`Excel'de yok (düzeltilemez): ${cannotFix}\n`);
  
  if (cannotFixList.length > 0) {
    console.log('Excel\'de olmayan kayıtlar (ilk 20):');
    cannotFixList.forEach(item => console.log(`  ${item}`));
  }
  
  // Excel sütun isimlerini göster
  console.log('\nExcel sütun isimleri:');
  if (data.length > 0) {
    console.log(Object.keys(data[0]));
  }
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
