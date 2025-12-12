import { Module } from "@nestjs/common";
import { ExportImportController } from "./export-import.controller";
import { ExportImportService } from "./export-import.service";
import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [ExportImportController],
  providers: [ExportImportService],
  exports: [ExportImportService],
})
export class ExportImportModule {}
