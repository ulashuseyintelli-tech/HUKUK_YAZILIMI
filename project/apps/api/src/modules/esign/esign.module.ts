import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { ESignService } from './esign.service';
import { ESignController } from './esign.controller';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [ESignController],
  providers: [ESignService],
  exports: [ESignService],
})
export class ESignModule {}
