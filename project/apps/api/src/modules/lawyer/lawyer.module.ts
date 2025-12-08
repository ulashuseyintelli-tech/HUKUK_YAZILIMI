import { Module } from "@nestjs/common";
import { LawyerController } from "./lawyer.controller";
import { LawyerService } from "./lawyer.service";
import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [LawyerController],
  providers: [LawyerService],
  exports: [LawyerService],
})
export class LawyerModule {}
