import { Module } from "@nestjs/common";
import { TebligatController } from "./tebligat.controller";
import { TebligatService } from "./tebligat.service";
import { PrismaModule } from "../../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [TebligatController],
  providers: [TebligatService],
  exports: [TebligatService],
})
export class TebligatModule {}
