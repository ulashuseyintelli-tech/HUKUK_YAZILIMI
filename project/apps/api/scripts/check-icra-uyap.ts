import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();
const TENANT_ID = 'cmj4m2jek0000mvu2om5rcjv2';
const EXCEL_FILE_PATH = 'C:\\Users\\ulas.htelli\\Desktop\\Ek-5_Birim_Kodlari_Tablosu.xlsx';

async function check() {
  // Excel'den Batman icra dairelerini bul
  const wb = XLSX.readFile(EXCEL_FILE_PATH);
  const sheet = wb.Sheets['batman'];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  
  console.log('=== Excel\'den Batman İcra Birimleri ===');
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const name = row[1]?.toString() || '';
    if (name.toLowerCase().includes('icra')) {
      console.log(`Birim ID: ${row[0]} | Ad: ${name} | Org: ${row[2]}`);
    }
  }
  
  // Veritabanındaki Batman icra daireleri
  console.log('\n=== Veritabanındaki Batman İcra Daireleri ===');
  const batmanIcra = await prisma.executionOffice.findMany({
    where: { 
      tenantId: TENANT_ID, 
      OR: [
        { city: 'Batman' },
        { name: { contains: 'BATMAN', mode: 'insensitive' } },
      ]
    },
  });
  
  batmanIcra.forEach(i => {
    console.log(`${i.name} | İl: ${i.city} | UYAP: ${i.uyapCode}`);
  });
  
  // Toplam istatistik
  const total = await prisma.executionOffice.count({ where: { tenantId: TENANT_ID } });
  const withUyap = await prisma.executionOffice.count({ 
    where: { tenantId: TENANT_ID, uyapCode: { not: null } } 
  });
  
  console.log(`\nToplam: ${total} icra dairesi`);
  console.log(`UYAP kodlu: ${withUyap}`);
}

check().finally(() => prisma.$disconnect());
