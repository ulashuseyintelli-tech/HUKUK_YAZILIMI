import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PoaModule } from '../poa/poa.module';
import { PolicyEngineModule } from '../policy-engine/policy-engine.module';
import { UyapService } from './uyap.service';
import { UyapXmlService } from './uyap-xml.service';
import { UyapController } from './uyap.controller';

// Re-export UYAP codes for external use
export * from './uyap-codes';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => PoaModule),
    forwardRef(() => PolicyEngineModule), // CPE gate kontrolü için
  ],
  controllers: [UyapController],
  providers: [UyapService, UyapXmlService],
  exports: [UyapService, UyapXmlService],
})
export class UyapModule {}
