import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ClientNotificationModule } from '../client-notification/client-notification.module';
import { AddressTaskService } from './address-task.service';
import { AddressTaskController } from './address-task.controller';

@Module({
  imports: [PrismaModule, ClientNotificationModule],
  controllers: [AddressTaskController],
  providers: [AddressTaskService],
  exports: [AddressTaskService],
})
export class AddressTaskModule {}
