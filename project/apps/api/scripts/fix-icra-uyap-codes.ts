/**
 * İcra Dairesi UYAP Kodlarını Düzelt
 * 
 * Sorun: Import sırasında sütunlar ters kaydedilmiş
 * - TXT'de 1. sütun (1048808) = Gerçek UYAP kodu (7 haneli)
 * - TXT'de 3. sütun (1.04.021.000.6003) = Organizasyon kodu
 * 
 * Mevcut durumda:
 * - uyapCode = Organizasyon kodu (yanlış)
 * - officeCode = UYAP kodu (yanlış)
 * 
 * Düzeltme: uyapCode ve officeCode değerlerini değiştir
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TENANT_ID = 'cmj4m2jek0000mvu2om5rcjv2';

async function fixIcraUyapCodes() {
  console.log('İcra dairesi UYAP kodları düzeltiliyor...\n');
  
  // Tüm icra dairelerini al
  const offices = await prisma.executionOffice.findMany({
    where: { tenantId: TENANT_ID },
  });
  
  console.log(`${offices.length} icra dairesi bulundu.\n`);
  
  // Örnek göster (düzeltme öncesi)
  console.log('=== Düzeltme Öncesi (Batman) ===');
  const batmanBefore = offices.filter(o => o.city === 'Batman');
  batmanBefore.forEach(o => {
    console.log(`${o.name} | uyapCode: ${o.uyapCode} | officeCode: ${o.officeCode}`);
  });
  
  // Değerleri değiştir
  let updated = 0;
  for (const office of offices) {
    // uyapCode ve officeCode'u değiştir
    const newUyapCode = office.officeCode; // 7 haneli kod
    const newOfficeCode = office.uyapCode; // Organizasyon kodu
    
    await prisma.executionOffice.update({
      where: { id: office.id },
      data: {
        uyapCode: newUyapCode,
        officeCode: newOfficeCode,
      },
    });
    updated++;
  }
  
  console.log(`\n${updated} icra dairesi güncellendi.\n`);
  
  // Örnek göster (düzeltme sonrası)
  console.log('=== Düzeltme Sonrası (Batman) ===');
  const batmanAfter = await prisma.executionOffice.findMany({
    where: { tenantId: TENANT_ID, city: 'Batman' },
  });
  batmanAfter.forEach(o => {
    console.log(`${o.name} | uyapCode: ${o.uyapCode} | officeCode: ${o.officeCode}`);
  });
}

fixIcraUyapCodes()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
