import { Controller, Get, Post, Body, Query, UseGuards } from "@nestjs/common";
import { LawyerService } from "./lawyer.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("lawyers")
@UseGuards(JwtAuthGuard)
export class LawyerController {
  constructor(private lawyerService: LawyerService) {}

  @Get()
  findAll(
    @CurrentUser("tenantId") tenantId: string,
    @Query("search") search?: string
  ) {
    return this.lawyerService.findAll(tenantId, search);
  }

  @Post()
  create(
    @CurrentUser("tenantId") tenantId: string,
    @Body() data: {
      name: string;
      surname: string;
      barNumber?: string;
      barName?: string;
      email?: string;
      phone?: string;
    }
  ) {
    return this.lawyerService.create(tenantId, data);
  }
}
