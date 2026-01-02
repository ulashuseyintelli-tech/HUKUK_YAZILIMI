/**
 * UYAP Kodlarını Düzelt
 * 
 * Sorun: Import sırasında yanlış sütun UYAP kodu olarak alınmış
 * - Birim id (1. sütun) = Gerçek UYAP kodu (7 haneli: 1001773)
 * - Organizasyon Kodu (3. sütun) = Uzun noktalı kod (1.04.021.000.4001)
 * 
 * Bu script doğru UYAP kodlarını günceller.
 */

import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();

const TENANT_ID = 'cmj4m2jek0000mvu2om5rcjv2';
const EXCEL_FILE_PATH = 'C:\\Users\\ulas.htelli\\Desktop\\Ek-5_Birim_Kodlari_Tablosu.xlsx';

// İl adı düzeltmeleri
const cityNameFixes: Record<string, string> = {
  'zonuldak': 'Zonguldak',
  'ığdır': 'Iğdır',
  'ısparta': 'Isparta',
};

async function fixUyapCodes() {
  console.log('UYAP kodları düzeltme işlemi başlıyor...\n');
  
  const workbook = XLSX.readFile(EXCEL_FILE_PATH);
  console.log(`${workbook.SheetNames.length} il bulundu.`);
  
  // Excel'den tüm birimleri oku
  const excelData: Map<string, { uyapCode: string; orgCode: string }> = new Map();
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length < 3) continue;
      
      const birimId = row[0]?.toString().trim(); // UYAP kodu (7 haneli)
      const name = row[1]?.toString().trim();
      const orgCode = row[2]?.toString().trim(); // Organizasyon kodu (noktalı)
      
      if (!name || !birimId) continue;
      
      // İsme göre eşleştirme için kaydet
      excelData.set(name, { uyapCode: birimId, orgCode: orgCode });
    }
  }
  
  console.log(`Excel'den ${excelData.size} birim okundu.\n`);
  
  // Veritabanındaki mahkemeleri güncelle
  const courts = await prisma.court.findMany({
    where: { tenantId: TENANT_ID },
  });
  
  console.log(`Veritabanında ${courts.length} mahkeme var.\n`);
  
  let updated = 0;
  let notFound = 0;
  
  for (const court of courts) {
    const excelEntry = excelData.get(court.name);
    
    if (excelEntry) {
      // UYAP kodunu düzelt
      await prisma.court.update({
        where: { id: court.id },
        data: {
          uyapCode: excelEntry.uyapCode,
          courtCode: excelEntry.orgCode, // Organizasyon kodunu courtCode'a kaydet
        },
      });
      updated++;
    } else {
      notFound++;
      if (notFound <= 10) {
        console.log(`Bulunamadı: ${court.name}`);
      }
    }
  }
  
  console.log(`\n=== Güncelleme Tamamlandı ===`);
  console.log(`Güncellenen: ${updated}`);
  console.log(`Bulunamayan: ${notFound}`);
  
  // Örnek kontrol
  console.log('\n=== Örnek Kayıtlar (Batman) ===');
  const batmanCourts = await prisma.court.findMany({
    where: { tenantId: TENANT_ID, city: 'Batman' },
    take: 10,
  });
  
  batmanCourts.forEach(c => {
    console.log(`${c.name} | UYAP: ${c.uyapCode} | Org: ${c.courtCode}`);
  });
}

fixUyapCodes()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
