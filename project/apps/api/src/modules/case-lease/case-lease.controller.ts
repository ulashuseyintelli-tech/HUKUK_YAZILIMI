import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CaseLeaseService, CreateLeaseDto, UpdateLeaseDto } from './case-lease.service';

@Controller('case-leases')
@UseGuards(JwtAuthGuard)
export class CaseLeaseController {
  constructor(private readonly service: CaseLeaseService) {}

  /**
   * Yeni kira sozlesmesi ekle
   * POST /api/case-leases
   */
  @Post()
  async create(@Request() req: any, @Body() dto: CreateLeaseDto) {
    return this.service.create(req.user.tenantId, req.user.id, dto);
  }

  /**
   * Dosyaya ait kira sozlesmesini getir
   * GET /api/case-leases/case/:caseId
   */
  @Get('case/:caseId')
  async findByCase(@Request() req: any, @Param('caseId') caseId: string) {
    return this.service.findByCase(req.user.tenantId, caseId);
  }

  /**
   * Tek kira sozlesmesi getir
   * GET /api/case-leases/:id
   */
  @Get(':id')
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.service.findOne(req.user.tenantId, id);
  }

  /**
   * Kira sozlesmesi guncelle
   * PUT /api/case-leases/:id
   */
  @Put(':id')
  async update(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateLeaseDto) {
    return this.service.update(req.user.tenantId, id, dto);
  }

  /**
   * Kira sozlesmesi sil
   * DELETE /api/case-leases/:id
   */
  @Delete(':id')
  async remove(@Request() req: any, @Param('id') id: string) {
    return this.service.remove(req.user.tenantId, id);
  }

  /**
   * Toplam kira borcu
   * GET /api/case-leases/case/:caseId/debt
   */
  @Get('case/:caseId/debt')
  async calculateTotalDebt(@Request() req: any, @Param('caseId') caseId: string) {
    return this.service.calculateTotalDebt(req.user.tenantId, caseId);
  }
}
