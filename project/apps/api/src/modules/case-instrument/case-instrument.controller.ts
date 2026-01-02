import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CaseInstrumentService, CreateInstrumentDto, UpdateInstrumentDto } from './case-instrument.service';

@Controller('case-instruments')
@UseGuards(JwtAuthGuard)
export class CaseInstrumentController {
  constructor(private readonly service: CaseInstrumentService) {}

  /**
   * Yeni cek/senet ekle
   * POST /api/case-instruments
   */
  @Post()
  async create(@Request() req: any, @Body() dto: CreateInstrumentDto) {
    return this.service.create(req.user.tenantId, req.user.id, dto);
  }

  /**
   * Dosyaya ait tum cek/senetleri getir
   * GET /api/case-instruments/case/:caseId
   */
  @Get('case/:caseId')
  async findAllByCase(@Request() req: any, @Param('caseId') caseId: string) {
    return this.service.findAllByCase(req.user.tenantId, caseId);
  }

  /**
   * Tek cek/senet getir
   * GET /api/case-instruments/:id
   */
  @Get(':id')
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.service.findOne(req.user.tenantId, id);
  }

  /**
   * Cek/senet guncelle
   * PUT /api/case-instruments/:id
   */
  @Put(':id')
  async update(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateInstrumentDto) {
    return this.service.update(req.user.tenantId, id, dto);
  }

  /**
   * Cek/senet sil
   * DELETE /api/case-instruments/:id
   */
  @Delete(':id')
  async remove(@Request() req: any, @Param('id') id: string) {
    return this.service.remove(req.user.tenantId, id);
  }

  /**
   * Dosyadaki toplam tutar
   * GET /api/case-instruments/case/:caseId/total
   */
  @Get('case/:caseId/total')
  async getTotalAmount(@Request() req: any, @Param('caseId') caseId: string) {
    const total = await this.service.getTotalAmount(req.user.tenantId, caseId);
    return { total };
  }
}
