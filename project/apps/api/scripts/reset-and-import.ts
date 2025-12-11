import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();
const excelPath = 'C:\\Users\\ulas.htelli\\Desktop\\Ek-5_Birim_Kodlari_Tablosu.xlsx';

async function main() {
  // Mevcut icra dairelerini sil
  const deleted = await prisma.executionOffice.deleteMany({});
  console.log(`${deleted.count} mevcut kayıt silindi.`);
  
  // Default tenant'ı bul
  let tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { name: 'Varsayılan Büro', slug: 'varsayilan' }
    });
  }
  console.log('Tenant:', tenant.id);
  
  // Excel'i oku
  const workbook = XLSX.readFile(excelPath);
  console.log(`${workbook.SheetNames.length} sayfa bulundu.`);
  
  const allUnits: any[] = [];
  
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    
    if (data.length === 0) return;
    
    // İl adını sayfa adından al ve düzelt
    const cityName = sheetName.charAt(0).toLocaleUpperCase('tr-TR') + sheetName.slice(1);
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length < 2) continue;
      
      const birimId = String(row[0]);
      const birimAdi = String(row[1] || '').trim();
      
      // İcra Dairesi olanları filtrele
      if ((birimAdi.toLocaleLowerCase('tr-TR').includes('icra dairesi') ||
           birimAdi.includes('İcra Dairesi')) &&
          !birimAdi.includes('Başkanlığı')) {
        allUnits.push({
          uyapCode: birimId,
          name: birimAdi,
          city: cityName,
          isActive: !birimAdi.includes('Kapatılan')
        });
      }
    }
  });
  
  console.log(`${allUnits.length} icra dairesi bulundu.`);

  // Veritabanına ekle
  let created = 0;
  for (const unit of allUnits) {
    try {
      await prisma.executionOffice.create({
        data: {
          tenantId: tenant.id,
          name: unit.name,
          city: unit.city,
          uyapCode: unit.uyapCode,
          isActive: unit.isActive
        }
      });
      created++;
    } catch (err: any) {
      console.error(`Hata (${unit.uyapCode}): ${err.message}`);
    }
  }
  
  console.log(`${created} icra dairesi eklendi.`);
  
  // Örnek kayıtları göster
  const samples = await prisma.executionOffice.findMany({
    where: { city: { contains: 'stanbul' } },
    take: 10
  });
  console.log('\nİstanbul örnekleri:');
  samples.forEach(o => console.log(`  [${o.uyapCode}] ${o.name}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
