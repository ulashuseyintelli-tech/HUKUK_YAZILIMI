import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from "@nestjs/common";
import { ClientService } from "./client.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("clients")
@UseGuards(JwtAuthGuard)
export class ClientController {
  constructor(private clientService: ClientService) {}

  @Get()
  findAll(@CurrentUser("tenantId") tenantId: string) {
    return this.clientService.findAll(tenantId);
  }

  @Get(":id")
  findOne(@CurrentUser("tenantId") tenantId: string, @Param("id") id: string) {
    return this.clientService.findOne(tenantId, id);
  }

  @Post()
  create(@CurrentUser("tenantId") tenantId: string, @Body() data: any) {
    return this.clientService.create(tenantId, data);
  }

  @Put(":id")
  update(@CurrentUser("tenantId") tenantId: string, @Param("id") id: string, @Body() data: any) {
    return this.clientService.update(tenantId, id, data);
  }

  @Delete(":id")
  delete(@CurrentUser("tenantId") tenantId: string, @Param("id") id: string) {
    return this.clientService.delete(tenantId, id);
  }
}
