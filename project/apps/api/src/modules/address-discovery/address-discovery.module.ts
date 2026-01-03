import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';
import { AddressDiscoveryController } from './address-discovery.controller';
import { AddressDiscoveryService } from './address-discovery.service';
import { ClientInfoRequestService } from './client-info-request.service';
import { ConfidenceScoreService } from './confidence-score.service';
import { CrossFileService } from './cross-file.service';
import { UyapQueryService } from './uyap-query.service';
import { InstitutionLetterService } from './institution-letter.service';

@Module({
  imports: [PrismaModule, NotificationModule],
  controllers: [AddressDiscoveryController],
  providers: [
    AddressDiscoveryService,
    ClientInfoRequestService,
    ConfidenceScoreService,
    CrossFileService,
    UyapQueryService,
    InstitutionLetterService,
  ],
  exports: [
    AddressDiscoveryService,
    ClientInfoRequestService,
    ConfidenceScoreService,
    CrossFileService,
    UyapQueryService,
    InstitutionLetterService,
  ],
})
export class AddressDiscoveryModule {}
