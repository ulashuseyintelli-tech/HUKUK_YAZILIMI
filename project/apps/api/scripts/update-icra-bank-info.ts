/**
 * İcra Daireleri Banka Bilgileri Güncelleme Script
 * Kaynak: C:\Users\ulas.htelli\Desktop\excel icra müd\icra daireleri vergi no ve ıban bilgileri.xlsx
 * 
 * Excel formatı:
 * - Başlıklar 9. satırda (A9: İCRA DAİRESİ ADI, B9: VERGİ NO, C9: IBAN/HESAP NO, D9: ŞUBE KODU, E9: ŞUBE ADI)
 * - Veriler 10. satırdan başlıyor
 */

import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();

const TENANT_ID = 'cmj4m2jek0000mvu2om5rcjv2';
const EXCEL_FILE_PATH = 'C:\\Users\\ulas.htelli\\Desktop\\excel icra müd\\icra daireleri vergi no ve ıban bilgileri.xlsx';

// İsim normalizasyonu
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/müdürlüğü/g, '')
    .replace(/müd\.?lüğü/g, '')
    .replace(/müd\.?/g, '')
    .replace(/md\.?/g, '')
    .replace(/icra dairesi/g, 'icra')
    .replace(/icra daires/g, 'icra')
    .replace(/\s+/g, ' ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\//g, ' ')
    .trim();
}

// Şehir adını çıkar
function extractCity(name: string): string | null {
  const cityMatch = name.match(/\/\s*([A-ZÇĞİÖŞÜa-zçğıöşü]+)\s*$/);
  if (cityMatch) return cityMatch[1].toLowerCase();
  return null;
}

// Numara çıkar
function extractNumber(name: string): string | null {
  const numMatch = name.match(/(\d+)\s*\./);
  if (numMatch) return numMatch[1];
  return null;
}

async function updateBankInfo() {
  console.log('İcra daireleri banka bilgileri güncelleme başlıyor...');
  console.log(`Kaynak dosya: ${EXCEL_FILE_PATH}`);
  
  // Excel dosyasını oku
  const workbook = XLSX.readFile(EXCEL_FILE_PATH);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // Mevcut icra dairelerini al
  const existingOffices = await prisma.executionOffice.findMany({
    where: { tenantId: TENANT_ID },
    select: { id: true, name: true, uyapCode: true, officeCode: true }
  });
  
  console.log(`Veritabanında ${existingOffices.length} icra dairesi var.`);
  
  // İsim ile eşleştirme haritası oluştur (normalize edilmiş)
  const officeByNormalizedName = new Map<string, typeof existingOffices[0]>();
  const officeByExactName = new Map<string, typeof existingOffices[0]>();
  
  existingOffices.forEach(office => {
    const normalized = normalizeName(office.name);
    officeByNormalizedName.set(normalized, office);
    officeByExactName.set(office.name.toLowerCase().trim(), office);
    
    // Alternatif isimler de ekle
    const altName = office.name.toLowerCase()
      .replace('icra dairesi', 'icra')
      .replace(/\s+/g, ' ')
      .trim();
    officeByNormalizedName.set(altName, office);
  });
  
  // Excel'den verileri oku (10. satırdan başla)
  let updated = 0;
  let notFound = 0;
  const notFoundList: string[] = [];
  const matchedList: string[] = [];
  
  // Satır satır oku
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  
  for (let r = 9; r <= range.e.r; r++) { // 10. satırdan başla (0-indexed: 9)
    const nameCell = sheet[XLSX.utils.encode_cell({ r, c: 0 })]; // A sütunu
    const taxCell = sheet[XLSX.utils.encode_cell({ r, c: 1 })];  // B sütunu
    const ibanCell = sheet[XLSX.utils.encode_cell({ r, c: 2 })]; // C sütunu
    const branchCodeCell = sheet[XLSX.utils.encode_cell({ r, c: 3 })]; // D sütunu
    const branchNameCell = sheet[XLSX.utils.encode_cell({ r, c: 4 })]; // E sütunu
    
    if (!nameCell || !nameCell.v) continue;
    
    const name = nameCell.v.toString().trim();
    const taxNumber = taxCell?.v?.toString().trim();
    const iban = ibanCell?.v?.toString().trim();
    const branchName = branchNameCell?.v?.toString().trim();
    
    // Eşleştirme yap
    const normalizedName = normalizeName(name);
    let office = officeByNormalizedName.get(normalizedName);
    
    // Tam isim eşleşmesi dene
    if (!office) {
      office = officeByExactName.get(name.toLowerCase().trim());
    }
    
    // Eşleşme bulunamadıysa daha esnek ara
    if (!office) {
      // İsmin ana kısmını al (şehir ve numara)
      const excelNum = extractNumber(name);
      const excelCity = extractCity(name);
      const excelBase = name.toLowerCase()
        .replace(/\d+\s*\./g, '')
        .replace(/\/.*$/, '')
        .replace(/müdürlüğü/g, '')
        .replace(/müd\.?lüğü/g, '')
        .replace(/müd\.?/g, '')
        .replace(/md\.?/g, '')
        .replace(/icra/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      for (const [key, value] of officeByNormalizedName.entries()) {
        const dbNum = extractNumber(value.name);
        const dbBase = value.name.toLowerCase()
          .replace(/\d+\s*\./g, '')
          .replace(/icra dairesi/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        
        // Ana isim eşleşiyor mu?
        const baseMatch = excelBase.includes(dbBase) || dbBase.includes(excelBase);
        
        // Numara eşleşiyor mu?
        const numMatch = (!excelNum && !dbNum) || (excelNum === dbNum);
        
        if (baseMatch && numMatch && excelBase.length > 2 && dbBase.length > 2) {
          office = value;
          break;
        }
      }
    }
    
    if (office) {
      // Güncelle
      await prisma.executionOffice.update({
        where: { id: office.id },
        data: {
          taxNumber: taxNumber || undefined,
          iban: iban || undefined,
          branchName: branchName || undefined,
        }
      });
      updated++;
      if (matchedList.length < 10) {
        matchedList.push(`${name} -> ${office.name}`);
      }
    } else {
      notFound++;
      if (notFoundList.length < 30) {
        notFoundList.push(name);
      }
    }
    
    if ((r - 9) % 100 === 0 && r > 9) {
      console.log(`İlerleme: ${r - 9}/${range.e.r - 9}`);
    }
  }
  
  console.log('\n=== Güncelleme Tamamlandı ===');
  console.log(`Güncellenen: ${updated}`);
  console.log(`Bulunamayan: ${notFound}`);
  
  if (matchedList.length > 0) {
    console.log('\nEşleşen ilk 10 kayıt:');
    matchedList.forEach(m => console.log(`  ✓ ${m}`));
  }
  
  if (notFoundList.length > 0) {
    console.log('\nBulunamayan ilk 30 kayıt:');
    notFoundList.forEach(n => console.log(`  ✗ ${n}`));
  }
  
  // IBAN'ı olan kayıtları say
  const withIban = await prisma.executionOffice.count({
    where: { 
      tenantId: TENANT_ID,
      iban: { not: null }
    }
  });
  
  const withTaxNumber = await prisma.executionOffice.count({
    where: { 
      tenantId: TENANT_ID,
      taxNumber: { not: null }
    }
  });
  
  console.log(`\nIBAN bilgisi olan: ${withIban}`);
  console.log(`Vergi no bilgisi olan: ${withTaxNumber}`);
}

updateBankInfo()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
