import { Module } from "@nestjs/common";
import { CalendarController } from "./calendar.controller";
import { CalendarService } from "./calendar.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { CaseViewScopeModule } from "../case/case-view-scope.module";

@Module({
  imports: [CaseViewScopeModule, PrismaModule],
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
