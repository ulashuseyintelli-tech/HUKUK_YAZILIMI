import { Controller, Post, Get, Query, UseGuards, Request } from '@nestjs/common';
import { SeedService } from './seed.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('seed')
@UseGuards(JwtAuthGuard)
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Post('all')
  async seedAll(@Request() req: any) {
    return this.seedService.seedAll(req.user.tenantId);
  }

  @Post('lookups')
  async seedLookups(@Request() req: any) {
    return this.seedService.seedLookups(req.user.tenantId);
  }

  @Post('lawyers')
  async seedLawyers(@Request() req: any) {
    return this.seedService.seedLawyers(req.user.tenantId);
  }

  @Post('clients')
  async seedClients(@Request() req: any) {
    return this.seedService.seedClients(req.user.tenantId);
  }

  @Post('debtors')
  async seedDebtors(@Request() req: any) {
    return this.seedService.seedDebtors(req.user.tenantId);
  }

  @Post('cases')
  async seedCases(@Request() req: any) {
    return this.seedService.seedCases(req.user.tenantId);
  }

  @Post('execution-offices')
  async seedExecutionOffices(@Request() req: any) {
    return this.seedService.seedExecutionOffices(req.user.tenantId);
  }

  @Post('staff')
  async seedStaff(@Request() req: any) {
    return this.seedService.seedStaff(req.user.tenantId);
  }

  @Get('status')
  async getStatus(@Request() req: any) {
    return this.seedService.getDataStatus(req.user.tenantId);
  }

  @Post('fix-clients')
  async fixClients(@Request() req: any) {
    return this.seedService.fixExistingClients(req.user.tenantId);
  }

  @Post('fix-lawyers')
  async fixLawyers(@Request() req: any) {
    return this.seedService.fixExistingLawyers(req.user.tenantId);
  }

  @Post('office')
  async seedOffice(@Request() req: any) {
    return this.seedService.seedOffice(req.user.tenantId);
  }

  @Post('bank-accounts')
  async seedBankAccounts(@Request() req: any) {
    return this.seedService.seedBankAccounts(req.user.tenantId);
  }
}
