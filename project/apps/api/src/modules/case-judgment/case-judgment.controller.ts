import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CaseJudgmentService, CreateJudgmentDto, UpdateJudgmentDto } from './case-judgment.service';

@Controller('case-judgments')
@UseGuards(JwtAuthGuard)
export class CaseJudgmentController {
  constructor(private readonly service: CaseJudgmentService) {}

  /**
   * Yeni ilam ekle
   * POST /api/case-judgments
   */
  @Post()
  async create(@Request() req: any, @Body() dto: CreateJudgmentDto) {
    return this.service.create(req.user.tenantId, req.user.id, dto);
  }

  /**
   * Dosyaya ait ilami getir
   * GET /api/case-judgments/case/:caseId
   */
  @Get('case/:caseId')
  async findByCase(@Request() req: any, @Param('caseId') caseId: string) {
    return this.service.findByCase(req.user.tenantId, caseId);
  }

  /**
   * Tek ilam getir
   * GET /api/case-judgments/:id
   */
  @Get(':id')
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.service.findOne(req.user.tenantId, id);
  }

  /**
   * Ilam guncelle
   * PUT /api/case-judgments/:id
   */
  @Put(':id')
  async update(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateJudgmentDto) {
    return this.service.update(req.user.tenantId, id, dto);
  }

  /**
   * Ilam sil
   * DELETE /api/case-judgments/:id
   */
  @Delete(':id')
  async remove(@Request() req: any, @Param('id') id: string) {
    return this.service.remove(req.user.tenantId, id);
  }

  /**
   * Toplam ilam tutari
   * GET /api/case-judgments/case/:caseId/total
   */
  @Get('case/:caseId/total')
  async calculateTotalAmount(@Request() req: any, @Param('caseId') caseId: string) {
    return this.service.calculateTotalAmount(req.user.tenantId, caseId);
  }
}
