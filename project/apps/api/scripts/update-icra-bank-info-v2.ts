/**
 * İcra Daireleri Banka Bilgileri Güncelleme Script v2
 * Daha akıllı eşleştirme algoritması
 */

import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();

const TENANT_ID = 'cmj4m2jek0000mvu2om5rcjv2';
const EXCEL_FILE_PATH = 'C:\\Users\\ulas.htelli\\Desktop\\excel icra müd\\icra daireleri vergi no ve ıban bilgileri.xlsx';

// Türkçe karakter normalizasyonu
function turkishLower(str: string): string {
  return str
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .replace(/Ğ/g, 'ğ')
    .replace(/Ü/g, 'ü')
    .replace(/Ş/g, 'ş')
    .replace(/Ö/g, 'ö')
    .replace(/Ç/g, 'ç')
    .toLowerCase();
}

// İsmi anahtar kelimelerine ayır
function extractKeywords(name: string): { city: string; number: string | null; base: string } {
  const lower = turkishLower(name);
  
  // Numara çıkar
  const numMatch = lower.match(/(\d+)\s*\./);
  const number = numMatch ? numMatch[1] : null;
  
  // Şehir çıkar (/ sonrası veya parantez içi)
  let city = '';
  const slashMatch = lower.match(/\/\s*([a-zçğıöşü]+)/);
  const parenMatch = lower.match(/\(([a-zçğıöşü]+)\)/);
  if (slashMatch) city = slashMatch[1];
  else if (parenMatch) city = parenMatch[1];
  
  // Ana isim (şehir + ilçe)
  let base = lower
    .replace(/\d+\s*\./g, '')
    .replace(/\/.*$/, '')
    .replace(/\(.*\)/g, '')
    .replace(/müdürlüğü/g, '')
    .replace(/müd\.?lüğü/g, '')
    .replace(/müd\.?/g, '')
    .replace(/md\.?/g, '')
    .replace(/icra dairesi/g, '')
    .replace(/icra/g, '')
    .replace(/genel/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Şehir yoksa base'den çıkar
  if (!city && base) {
    city = base.split(' ')[0];
  }
  
  return { city, number, base };
}

async function updateBankInfo() {
  console.log('İcra daireleri banka bilgileri güncelleme v2 başlıyor...');

  // Excel dosyasını oku
  const workbook = XLSX.readFile(EXCEL_FILE_PATH);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  
  // Mevcut icra dairelerini al
  const existingOffices = await prisma.executionOffice.findMany({
    where: { tenantId: TENANT_ID },
    select: { id: true, name: true, city: true, uyapCode: true }
  });
  
  console.log(`Veritabanında ${existingOffices.length} icra dairesi var.`);
  
  // Eşleştirme haritaları oluştur
  const officeMap = new Map<string, typeof existingOffices[0]>();
  
  existingOffices.forEach(office => {
    const kw = extractKeywords(office.name);
    
    // Şehir + numara kombinasyonu
    if (kw.number) {
      const key = `${kw.city}_${kw.number}`;
      officeMap.set(key, office);
    }
    
    // Sadece base isim (numarasız)
    if (kw.base) {
      officeMap.set(kw.base, office);
    }
    
    // Tam normalize isim
    const fullKey = turkishLower(office.name)
      .replace(/icra dairesi/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    officeMap.set(fullKey, office);
  });
  
  // Excel'den verileri oku
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  
  let updated = 0;
  let notFound = 0;
  const matchedList: string[] = [];
  const notFoundList: string[] = [];
  
  for (let r = 9; r <= range.e.r; r++) {
    const nameCell = sheet[XLSX.utils.encode_cell({ r, c: 0 })];
    const taxCell = sheet[XLSX.utils.encode_cell({ r, c: 1 })];
    const ibanCell = sheet[XLSX.utils.encode_cell({ r, c: 2 })];
    const branchNameCell = sheet[XLSX.utils.encode_cell({ r, c: 4 })];
    
    if (!nameCell || !nameCell.v) continue;
    
    const name = nameCell.v.toString().trim();
    const taxNumber = taxCell?.v?.toString().trim();
    const iban = ibanCell?.v?.toString().trim();
    const branchName = branchNameCell?.v?.toString().trim();
    
    const kw = extractKeywords(name);
    
    // Eşleştirme dene
    let office: typeof existingOffices[0] | undefined;
    
    // 1. Şehir + numara
    if (kw.number) {
      office = officeMap.get(`${kw.city}_${kw.number}`);
    }
    
    // 2. Base isim
    if (!office && kw.base) {
      office = officeMap.get(kw.base);
    }
    
    // 3. Tam isim araması
    if (!office) {
      const searchKey = turkishLower(name)
        .replace(/müdürlüğü/g, '')
        .replace(/müd\.?/g, '')
        .replace(/md\.?/g, '')
        .replace(/icra/g, '')
        .replace(/\/.*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      for (const [key, value] of officeMap.entries()) {
        if (key.includes(searchKey) || searchKey.includes(key)) {
          office = value;
          break;
        }
      }
    }
    
    if (office) {
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
      if (notFoundList.length < 20) {
        notFoundList.push(name);
      }
    }
  }
  
  console.log(`\n=== Güncelleme Tamamlandı ===`);
  console.log(`Güncellenen: ${updated}`);
  console.log(`Bulunamayan: ${notFound}`);
  
  if (matchedList.length > 0) {
    console.log('\nEşleşen ilk 10:');
    matchedList.forEach(m => console.log(`  ✓ ${m}`));
  }
  
  if (notFoundList.length > 0) {
    console.log('\nBulunamayan ilk 20:');
    notFoundList.forEach(n => console.log(`  ✗ ${n}`));
  }
  
  const withIban = await prisma.executionOffice.count({
    where: { tenantId: TENANT_ID, iban: { not: null } }
  });
  console.log(`\nIBAN bilgisi olan: ${withIban}`);
}

updateBankInfo()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
