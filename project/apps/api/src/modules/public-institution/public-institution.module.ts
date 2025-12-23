import { Module } from '@nestjs/common';
import { PublicInstitutionController } from './public-institution.controller';
import { PublicInstitutionService } from './public-institution.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PublicInstitutionController],
  providers: [PublicInstitutionService],
  exports: [PublicInstitutionService],
})
export class PublicInstitutionModule {}
