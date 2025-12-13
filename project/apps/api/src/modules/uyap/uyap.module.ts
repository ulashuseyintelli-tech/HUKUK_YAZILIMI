import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PoaModule } from '../poa/poa.module';
import { UyapService } from './uyap.service';
import { UyapController } from './uyap.controller';

@Module({
  imports: [PrismaModule, forwardRef(() => PoaModule)],
  controllers: [UyapController],
  providers: [UyapService],
  exports: [UyapService],
})
export class UyapModule {}
