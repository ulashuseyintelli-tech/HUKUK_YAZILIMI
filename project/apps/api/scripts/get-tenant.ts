import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany();
  console.log("Tenants:", tenants);
  
  const offices = await prisma.executionOffice.findFirst();
  console.log("Sample office tenantId:", offices?.tenantId);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
