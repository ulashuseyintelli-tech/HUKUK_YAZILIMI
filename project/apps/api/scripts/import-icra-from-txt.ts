/**
 * İcra Daireleri Import Script
 * Kaynak: C:\Users\ulas.htelli\Desktop\WORD MASA ÜSTÜ\icra_daireleri.txt
 * Format: UYAP_ID|İcra Dairesi Adı|UYAP Kodu|İl
 * 
 * Bu script mevcut tüm icra dairelerini siler ve txt dosyasından yeniden import eder.
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const TENANT_ID = 'cmj4m2jek0000mvu2om5rcjv2';
const TXT_FILE_PATH = 'C:\\Users\\ulas.htelli\\Desktop\\WORD MASA ÜSTÜ\\icra_daireleri.txt';

// İl adı düzeltmeleri
const cityNameFixes: Record<string, string> = {
  'Istanbul': 'İstanbul',
  'Izmir': 'İzmir',
  'Zonuldak': 'Zonguldak',
};

// UYAP kodundan il kodu çıkarma (1.04.XXX.YYY.ZZZZ formatı)
function extractCityCodeFromUyap(uyapCode: string): string | null {
  const parts = uyapCode.split('.');
  if (parts.length >= 3) {
    return parts[2]; // İl kodu
  }
  return null;
}

// İl adından ilçe çıkarma (parantez içindeki)
function extractDistrictFromName(name: string): string | null {
  const match = name.match(/\(([^)]+)\)/);
  if (match) {
    return match[1];
  }
  return null;
}

async function importIcraDaireleri() {
  console.log('İcra daireleri import işlemi başlıyor...');
  console.log(`Kaynak dosya: ${TXT_FILE_PATH}`);
  
  // Dosyayı oku
  if (!fs.existsSync(TXT_FILE_PATH)) {
    console.error('Dosya bulunamadı:', TXT_FILE_PATH);
    process.exit(1);
  }
  
  const content = fs.readFileSync(TXT_FILE_PATH, 'utf-8');
  
  // \n literal string olarak ayrılmış
  const lines = content.split('\\n').filter(line => line.trim());
  
  console.log(`Toplam ${lines.length} icra dairesi bulundu.`);
  
  // Test kayıtlarını filtrele
  const validLines = lines.filter(line => {
    const parts = line.split('|');
    if (parts.length < 4) return false;
    const name = parts[1];
    // Test kayıtlarını atla
    if (name.toLowerCase().includes('test')) return false;
    return true;
  });
  
  console.log(`Test kayıtları filtrelendi. Geçerli kayıt sayısı: ${validLines.length}`);
  
  // Mevcut kayıtları sil
  console.log('Mevcut icra daireleri siliniyor...');
  const deleteResult = await prisma.executionOffice.deleteMany({
    where: { tenantId: TENANT_ID }
  });
  console.log(`${deleteResult.count} kayıt silindi.`);
  
  // Yeni kayıtları ekle
  const records: any[] = [];
  const errors: string[] = [];
  
  for (const line of validLines) {
    const parts = line.split('|');
    if (parts.length < 4) {
      errors.push(`Geçersiz format: ${line}`);
      continue;
    }
    
    const [uyapId, name, uyapCode, city] = parts;
    
    // İl adını düzelt
    const fixedCity = cityNameFixes[city] || city;
    
    // İlçe bilgisini çıkar
    const district = extractDistrictFromName(name);
    
    records.push({
      tenantId: TENANT_ID,
      name: name.trim(),
      city: fixedCity.trim(),
      district: district,
      uyapCode: uyapCode.trim(),
      officeCode: uyapId.trim(),
      isActive: !name.toLowerCase().includes('kapatılan'),
    });
  }
  
  console.log(`${records.length} kayıt hazırlandı.`);
  
  // Batch insert
  const batchSize = 100;
  let inserted = 0;
  
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    await prisma.executionOffice.createMany({
      data: batch,
      skipDuplicates: true,
    });
    inserted += batch.length;
    console.log(`İlerleme: ${inserted}/${records.length}`);
  }
  
  console.log('\n=== Import Tamamlandı ===');
  console.log(`Toplam eklenen: ${inserted}`);
  
  if (errors.length > 0) {
    console.log('\nHatalar:');
    errors.forEach(e => console.log(`  - ${e}`));
  }
  
  // İstatistikler
  const stats = await prisma.executionOffice.groupBy({
    by: ['city'],
    where: { tenantId: TENANT_ID },
    _count: true,
    orderBy: { _count: { city: 'desc' } },
    take: 10,
  });
  
  console.log('\nEn çok icra dairesi olan 10 il:');
  stats.forEach((s: any) => {
    console.log(`  ${s.city}: ${s._count} adet`);
  });
  
  const total = await prisma.executionOffice.count({
    where: { tenantId: TENANT_ID }
  });
  console.log(`\nToplam icra dairesi: ${total}`);
}

importIcraDaireleri()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
