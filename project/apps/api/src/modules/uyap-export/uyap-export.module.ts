import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { UyapExportController } from './uyap-export.controller';
import { UyapExportService } from './uyap-export.service';
import { UyapXmlBuilderService } from './uyap-xml-builder.service';
import { UyapCaseMapperService } from './uyap-case-mapper.service';
import { UyapDocumentService } from './uyap-document.service';

@Module({
  imports: [PrismaModule],
  controllers: [UyapExportController],
  providers: [
    UyapExportService,
    UyapXmlBuilderService,
    UyapCaseMapperService,
    UyapDocumentService,
  ],
  exports: [UyapExportService],
})
export class UyapExportModule {}
