/**
 * Dosyadaki avukatların lawyerRank ve defaultPermissions değerlerini kontrol et
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Dosya Avukatları Kontrolü ===\n');

  // Son 5 dosyayı al
  const cases = await prisma.case.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      fileNumber: true,
      lawyers: {
        include: {
          lawyer: {
            select: {
              id: true,
              name: true,
              surname: true,
              lawyerRank: true,
              defaultPermissions: true,
            },
          },
        },
      },
    },
  });

  for (const c of cases) {
    console.log(`\n📁 Dosya: ${c.fileNumber} (${c.id})`);
    console.log('   Avukatlar:');
    
    for (const cl of c.lawyers) {
      console.log(`   - ${cl.lawyer.name} ${cl.lawyer.surname}`);
      console.log(`     lawyerRank: ${cl.lawyer.lawyerRank}`);
      console.log(`     defaultPermissions: ${cl.lawyer.defaultPermissions ? JSON.stringify(cl.lawyer.defaultPermissions) : 'NULL'}`);
      console.log(`     CaseLawyer role: ${cl.role}`);
      console.log(`     CaseLawyer casePermissions: ${cl.casePermissions ? JSON.stringify(cl.casePermissions) : 'NULL'}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
