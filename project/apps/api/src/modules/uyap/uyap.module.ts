import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PoaModule } from '../poa/poa.module';
import { UyapService } from './uyap.service';
import { UyapXmlService } from './uyap-xml.service';
import { UyapController } from './uyap.controller';

// Re-export UYAP codes for external use
export * from './uyap-codes';

@Module({
  imports: [PrismaModule, forwardRef(() => PoaModule)],
  controllers: [UyapController],
  providers: [UyapService, UyapXmlService],
  exports: [UyapService, UyapXmlService],
})
export class UyapModule {}
