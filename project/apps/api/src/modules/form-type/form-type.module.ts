import { Module } from "@nestjs/common";
import { FormTypeController } from "./form-type.controller";
import { FormTypeService } from "./form-type.service";
import { PrismaModule } from "../../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [FormTypeController],
  providers: [FormTypeService],
  exports: [FormTypeService],
})
export class FormTypeModule {}
