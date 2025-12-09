import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { DocumentService } from "./document.service";
import { DocumentController } from "./document.controller";
import { TemplateService } from "./template.service";
import { DocumentTemplateService } from "./document-template.service";

@Module({
  imports: [PrismaModule],
  controllers: [DocumentController],
  providers: [DocumentService, TemplateService, DocumentTemplateService],
  exports: [DocumentService, DocumentTemplateService],
})
export class DocumentModule {}
