/**
 * Mahkemeler Import Script
 * Kaynak: C:\Users\ulas.htelli\Desktop\Ek-5_Birim_Kodlari_Tablosu.xlsx
 * 
 * Bu script tüm Türkiye'deki mahkemeleri veritabanına ekler.
 */

import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();

const TENANT_ID = 'cmj4m2jek0000mvu2om5rcjv2';
const EXCEL_FILE_PATH = 'C:\\Users\\ulas.htelli\\Desktop\\Ek-5_Birim_Kodlari_Tablosu.xlsx';

// Mahkeme türlerini belirle
const COURT_TYPES = [
  'Ağır Ceza Mahkemesi',
  'Asliye Ceza Mahkemesi',
  'Asliye Hukuk Mahkemesi',
  'Sulh Hukuk Mahkemesi',
  'Sulh Ceza Hakimliği',
  'İcra Mahkemesi',
  'İcra Hukuk Mahkemesi',
  'İcra Ceza Mahkemesi',
  'Aile Mahkemesi',
  'İş Mahkemesi',
  'Tüketici Mahkemesi',
  'Kadastro Mahkemesi',
  'Ticaret Mahkemesi',
  'Fikri ve Sınai Haklar Mahkemesi',
  'Çocuk Mahkemesi',
  'Çocuk Ağır Ceza Mahkemesi',
  'İdare Mahkemesi',
  'Vergi Mahkemesi',
  'Bölge Adliye Mahkemesi',
  'Bölge İdare Mahkemesi',
];

// İl adı düzeltmeleri
const cityNameFixes: Record<string, string> = {
  'zonuldak': 'Zonguldak',
  'ığdır': 'Iğdır',
  'ısparta': 'Isparta',
};

function isCourt(name: string): boolean {
  const lowerName = name.toLowerCase();
  return lowerName.includes('mahkemesi') || lowerName.includes('hakimliği');
}

function getCourtType(name: string): string {
  for (const type of COURT_TYPES) {
    if (name.includes(type)) {
      return type;
    }
  }
  return 'Diğer';
}

async function importCourts() {
  console.log('Mahkemeler import işlemi başlıyor...');
  
  const workbook = XLSX.readFile(EXCEL_FILE_PATH);
  console.log(`${workbook.SheetNames.length} il bulundu.`);
  
  // Mevcut mahkemeleri sil
  console.log('Mevcut mahkemeler siliniyor...');
  const deleteResult = await prisma.court.deleteMany({
    where: { tenantId: TENANT_ID }
  });
  console.log(`${deleteResult.count} kayıt silindi.`);
  
  const courts: any[] = [];
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
    
    // İl adını düzelt
    let city = sheetName.charAt(0).toUpperCase() + sheetName.slice(1);
    city = cityNameFixes[sheetName] || city;
    
    // Satırları işle (başlık satırını atla)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length < 3) continue;
      
      const birimId = row[0]?.toString().trim();
      const name = row[1]?.toString().trim();
      const uyapCode = row[2]?.toString().trim();
      
      if (!name || !isCourt(name)) continue;
      
      courts.push({
        tenantId: TENANT_ID,
        name: name,
        city: city,
        uyapCode: uyapCode,
        courtCode: birimId,
        courtType: getCourtType(name),
        isActive: !name.toLowerCase().includes('kapatılan'),
      });
    }
  }

  console.log(`${courts.length} mahkeme hazırlandı.`);
  
  // Batch insert
  const batchSize = 100;
  let inserted = 0;
  
  for (let i = 0; i < courts.length; i += batchSize) {
    const batch = courts.slice(i, i + batchSize);
    await prisma.court.createMany({
      data: batch,
      skipDuplicates: true,
    });
    inserted += batch.length;
    if (inserted % 500 === 0 || inserted === courts.length) {
      console.log(`İlerleme: ${inserted}/${courts.length}`);
    }
  }
  
  console.log('\n=== Import Tamamlandı ===');
  
  // İstatistikler
  const total = await prisma.court.count({ where: { tenantId: TENANT_ID } });
  console.log(`Toplam mahkeme: ${total}`);
  
  // Türe göre dağılım
  const byType = await prisma.court.groupBy({
    by: ['courtType'],
    where: { tenantId: TENANT_ID },
    _count: true,
    orderBy: { _count: { courtType: 'desc' } },
    take: 15,
  });
  
  console.log('\nMahkeme türlerine göre dağılım:');
  byType.forEach((t: any) => console.log(`  ${t.courtType}: ${t._count}`));
  
  // İl bazında
  const byCity = await prisma.court.groupBy({
    by: ['city'],
    where: { tenantId: TENANT_ID },
    _count: true,
    orderBy: { _count: { city: 'desc' } },
    take: 10,
  });
  
  console.log('\nEn çok mahkeme olan 10 il:');
  byCity.forEach((c: any) => console.log(`  ${c.city}: ${c._count}`));
}

importCourts()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
