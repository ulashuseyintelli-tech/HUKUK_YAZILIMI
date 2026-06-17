import { Module } from "@nestjs/common";
import { ExportImportController } from "./export-import.controller";
import { ExportImportService } from "./export-import.service";
import { PrismaModule } from "@/prisma/prisma.module";
// RFA-017: Excel client import artık guard'lı ClientService.create kullanır (duplicate bypass kapatma).
import { ClientModule } from "../client/client.module";

@Module({
  imports: [PrismaModule, ClientModule],
  controllers: [ExportImportController],
  providers: [ExportImportService],
  exports: [ExportImportService],
})
export class ExportImportModule {}
