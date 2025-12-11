import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  // JSON dosyasını oku
  const jsonPath = path.join(__dirname, '..', 'data', 'uyap-icra-birimleri.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  
  console.log(`Toplam ${data.length} icra birimi bulundu.`);
  
  // Default tenant'ı bul veya oluştur
  let tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { name: 'Varsayılan Büro', slug: 'varsayilan' }
    });
    console.log('Varsayılan tenant oluşturuldu:', tenant.id);
  }
  
  // Birim türlerine göre filtrele
  const icraDaireleri = data.filter((d: any) => 
    d.name.includes('İcra Dairesi') || d.name.includes('İcra Müdürlüğü')
  );
  const icraHukukMahkemeleri = data.filter((d: any) => d.name.includes('İcra Hukuk'));
  const icraCezaMahkemeleri = data.filter((d: any) => d.name.includes('İcra Ceza'));
  
  console.log(`İcra Daireleri: ${icraDaireleri.length}`);
  console.log(`İcra Hukuk Mahkemeleri: ${icraHukukMahkemeleri.length}`);
  console.log(`İcra Ceza Mahkemeleri: ${icraCezaMahkemeleri.length}`);
  
  // Sadece İcra Dairelerini ekle (mahkemeler ayrı tablo olabilir)
  let created = 0, updated = 0, skipped = 0;
  
  for (const office of icraDaireleri) {
    try {
      // Önce uyapCode ile kontrol et
      const existing = await prisma.executionOffice.findFirst({
        where: { uyapCode: office.uyapCode, tenantId: tenant.id }
      });
      
      if (existing) {
        // Güncelle
        await prisma.executionOffice.update({
          where: { id: existing.id },
          data: { name: office.name, city: office.city }
        });
        updated++;
      } else {
        // Yeni ekle
        await prisma.executionOffice.create({
          data: {
            tenantId: tenant.id,
            name: office.name,
            city: office.city,
            district: office.district || null,
            uyapCode: office.uyapCode,
            isActive: !office.name.includes('Kapatılan')
          }
        });
        created++;
      }
    } catch (err: any) {
      console.error(`Hata (${office.uyapCode}): ${err.message}`);
      skipped++;
    }
  }
  
  console.log(`\nSonuç: ${created} eklendi, ${updated} güncellendi, ${skipped} atlandı`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
