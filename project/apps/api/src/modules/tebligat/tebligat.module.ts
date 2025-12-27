import { Module } from "@nestjs/common";
import { TebligatController } from "./tebligat.controller";
import { TebligatService } from "./tebligat.service";
import { PttTrackingService } from "./ptt-tracking.service";
import { UetsService } from "./uets.service";
import { PrismaModule } from "../../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [TebligatController],
  providers: [TebligatService, PttTrackingService, UetsService],
  exports: [TebligatService, PttTrackingService, UetsService],
})
export class TebligatModule {}
