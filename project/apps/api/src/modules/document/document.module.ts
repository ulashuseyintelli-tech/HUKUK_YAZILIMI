import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { DocumentService } from "./document.service";
import { DocumentController } from "./document.controller";
import { TemplateService } from "./template.service";
import { DocumentTemplateService } from "./document-template.service";
// F02 P3-D2: dosya görünüm kapsamı kapısı (CaseViewScopeGuard → CaseViewScopeService).
import { CaseViewScopeModule } from "../case/case-view-scope.module";

@Module({
  imports: [PrismaModule, CaseViewScopeModule],
  controllers: [DocumentController],
  providers: [DocumentService, TemplateService, DocumentTemplateService],
  exports: [DocumentService, DocumentTemplateService],
})
export class DocumentModule {}
