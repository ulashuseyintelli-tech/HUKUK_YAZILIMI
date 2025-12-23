import { Controller, Post, Get, Query, UseGuards, Request } from '@nestjs/common';
import { SeedService } from './seed.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @UseGuards(JwtAuthGuard)
  @Post('all')
  async seedAll(@Request() req: any) {
    return this.seedService.seedAll(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('lookups')
  async seedLookups(@Request() req: any) {
    return this.seedService.seedLookups(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('lawyers')
  async seedLawyers(@Request() req: any) {
    return this.seedService.seedLawyers(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('clients')
  async seedClients(@Request() req: any) {
    return this.seedService.seedClients(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('debtors')
  async seedDebtors(@Request() req: any) {
    return this.seedService.seedDebtors(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('cases')
  async seedCases(@Request() req: any) {
    return this.seedService.seedCases(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('execution-offices')
  async seedExecutionOffices(@Request() req: any) {
    return this.seedService.seedExecutionOffices(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('staff')
  async seedStaff(@Request() req: any) {
    return this.seedService.seedStaff(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('status')
  async getStatus(@Request() req: any) {
    return this.seedService.getDataStatus(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('fix-clients')
  async fixClients(@Request() req: any) {
    return this.seedService.fixExistingClients(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('fix-lawyers')
  async fixLawyers(@Request() req: any) {
    return this.seedService.fixExistingLawyers(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('office')
  async seedOffice(@Request() req: any) {
    return this.seedService.seedOffice(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('bank-accounts')
  async seedBankAccounts(@Request() req: any) {
    return this.seedService.seedBankAccounts(req.user.tenantId);
  }

  // Public endpoint - kamu kurumları + icra daireleri seed (auth gerektirmez)
  @Post('public-institutions')
  async seedPublicInstitutions() {
    return this.seedService.seedPublicInstitutions();
  }

  // Kamu kurumlarını borçlu olarak ekle
  @UseGuards(JwtAuthGuard)
  @Post('public-institution-debtors')
  async seedPublicInstitutionDebtors(@Request() req: any) {
    return this.seedService.seedPublicInstitutionDebtors(req.user.tenantId);
  }
}
