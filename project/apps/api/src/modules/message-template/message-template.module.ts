import { Module } from '@nestjs/common';
import { MessageTemplateController } from './message-template.controller';
import { MessageTemplateService } from './message-template.service';
import { PrismaModule } from '@/prisma/prisma.module';
// Şablon YAZMA uçlarının F01 kapısı (`OfficeF01AuthorizationGuard`) `OfficeApprovalService`'e bağlıdır; guard bu modülün
// bağlamında çözülür (bkz. message-template.controller.ts başlık yorumu).
import { OfficeApprovalModule } from '../office-approval/office-approval.module';

@Module({
  imports: [PrismaModule, OfficeApprovalModule],
  controllers: [MessageTemplateController],
  providers: [MessageTemplateService],
  exports: [MessageTemplateService],
})
export class MessageTemplateModule {}
