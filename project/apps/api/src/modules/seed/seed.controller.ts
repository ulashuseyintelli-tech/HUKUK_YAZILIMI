import { Controller, Post, Get, Query, UseGuards, Request } from '@nestjs/common';
import { SeedService } from './seed.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { buildClientMutationActor } from '../client/client.service';

@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @UseGuards(JwtAuthGuard)
  @Post('all')
  async seedAll(@Request() req: any) {
    // OWN-13 I02-R3 (owner D04): seedAll CLIENT üretimini de içerir → AYNI elevated aktör.
    const actor = buildClientMutationActor({ userId: req.user.id, tenantId: req.user.tenantId, role: req.user.role });
    return this.seedService.seedAll(req.user.tenantId, actor);
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
    // OWN-13 I02-R3 (owner D04): CLIENT seed authority — yalnız elevated aktör (ADMIN tek başına yetmez).
    const actor = buildClientMutationActor({ userId: req.user.id, tenantId: req.user.tenantId, role: req.user.role });
    return this.seedService.seedClients(req.user.tenantId, actor);
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
    // OWN-13 I02-R3 (owner D04): identityNo dahil hassas alan yazar — yalnız elevated aktör.
    const actor = buildClientMutationActor({ userId: req.user.id, tenantId: req.user.tenantId, role: req.user.role });
    return this.seedService.fixExistingClients(req.user.tenantId, actor);
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

  // OWN-13 I02-R3 (owner D03): önceden kimliksizdi (auth gerektirmiyordu) — bütün /seed/*
  // yüzeyi en az JwtAuthGuard ister kararı gereği ARTIK KİMLİKSİZ DEĞİL.
  @UseGuards(JwtAuthGuard)
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
