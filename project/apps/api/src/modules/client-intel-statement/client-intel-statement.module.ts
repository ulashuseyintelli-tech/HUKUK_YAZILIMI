import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ClientIntelStatementController } from './client-intel-statement.controller';
import { ClientIntelStatementService } from './client-intel-statement.service';

/**
 * Müvekkil İstihbarat Beyanı modülü (Faz 4.0).
 * Bağımsız modül — mevcut debtor/intelligence hattına dokunmaz (yalnız yumuşak istihbarat beyanı).
 * Faz 4 dış-form promote bu servisi reuse edecek.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ClientIntelStatementController],
  providers: [ClientIntelStatementService],
  exports: [ClientIntelStatementService],
})
export class ClientIntelStatementModule {}
