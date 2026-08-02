import { Module } from '@nestjs/common';
import { SeedService } from './seed.service';
import { SeedController } from './seed.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { ClientModule } from '../client/client.module';

@Module({
  imports: [PrismaModule, ClientModule],
  controllers: [SeedController],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
