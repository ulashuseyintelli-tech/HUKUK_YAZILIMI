import { Module } from '@nestjs/common';
import { SeedService } from './seed.service';
import { SeedController } from './seed.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { ClientModule } from '../client/client.module';
import { StaffModule } from '../staff/staff.module';
import { LawyerModule } from '../lawyer/lawyer.module';

@Module({
  // P5-B02: staff/lawyer seed'i kanonik StaffService/LawyerService üzerinden yazar.
  imports: [PrismaModule, ClientModule, StaffModule, LawyerModule],
  controllers: [SeedController],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
