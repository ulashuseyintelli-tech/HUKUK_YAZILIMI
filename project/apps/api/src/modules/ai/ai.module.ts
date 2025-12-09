import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiService } from './ai.service';
import { AiDocumentService } from './ai-document.service';
import { AiController } from './ai.controller';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [AiController],
  providers: [AiService, AiDocumentService],
  exports: [AiService, AiDocumentService],
})
export class AiModule {}
