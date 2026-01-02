import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ExpenseRequestService, CreateExpenseRequestDto, UpdateExpenseRequestDto } from './expense-request.service';
import { AuthGuard } from '@nestjs/passport';
import { ExpenseRequestStatus } from '@prisma/client';
import { Request } from 'express';

interface AuthRequest extends Request {
  user: { id: string; tenantId: string };
}

@Controller('expense-requests')
@UseGuards(AuthGuard('jwt'))
export class ExpenseRequestController {
  constructor(private readonly service: ExpenseRequestService) {}

  @Get()
  async findAll(
    @Req() req: AuthRequest,
    @Query('caseId') caseId?: string,
    @Query('clientId') clientId?: string,
    @Query('status') status?: ExpenseRequestStatus,
  ) {
    return this.service.findAll(req.user.tenantId, { caseId, clientId, status });
  }

  @Get('stats')
  async getStats(@Req() req: AuthRequest, @Query('caseId') caseId?: string) {
    return this.service.getStats(req.user.tenantId, caseId);
  }

  @Get('by-case/:caseId')
  async findByCaseId(@Req() req: AuthRequest, @Param('caseId') caseId: string) {
    return this.service.findByCaseId(req.user.tenantId, caseId);
  }

  @Get(':id')
  async findOne(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.findOne(req.user.tenantId, id);
  }

  @Post()
  async create(@Req() req: AuthRequest, @Body() dto: CreateExpenseRequestDto) {
    return this.service.create(req.user.tenantId, req.user.id, dto);
  }

  @Post('from-package')
  async createFromPackage(
    @Req() req: AuthRequest,
    @Body() dto: {
      caseId: string;
      clientId: string;
      packageCode: string;
      items: Array<{
        itemCode: string;
        label: string;
        suggestedAmount: number;
        finalAmount: number;
        wasOverridden?: boolean;
      }>;
      dueDate?: string;
      notes?: string;
      sendEmail?: boolean;
      sendSms?: boolean;
      sendWhatsapp?: boolean;
      paidByLawyer?: boolean;
    },
  ) {
    return this.service.createFromPackage(req.user.tenantId, req.user.id, dto);
  }

  @Put(':id')
  async update(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: UpdateExpenseRequestDto) {
    return this.service.update(req.user.tenantId, id, dto);
  }

  @Post(':id/send')
  async markAsSent(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { channel: string; notificationId?: string },
  ) {
    return this.service.markAsSent(req.user.tenantId, id, body.channel, body.notificationId);
  }

  @Post(':id/remind')
  async markAsReminded(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.markAsReminded(req.user.tenantId, id);
  }

  @Post(':id/receive')
  async markAsReceived(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { paidAmount: number; receiptDocId?: string },
  ) {
    return this.service.markAsReceived(req.user.tenantId, id, body.paidAmount, body.receiptDocId, req.user.id);
  }

  @Post(':id/cancel')
  async cancel(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.service.cancel(req.user.tenantId, id, body.reason);
  }

  @Delete(':id')
  async delete(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.delete(req.user.tenantId, id);
  }
}
