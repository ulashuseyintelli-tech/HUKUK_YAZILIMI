import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { UyapService } from './uyap.service';
import { UyapController } from './uyap.controller';

@Module({
  imports: [PrismaModule],
  controllers: [UyapController],
  providers: [UyapService],
  exports: [UyapService],
})
export class UyapModule {}
