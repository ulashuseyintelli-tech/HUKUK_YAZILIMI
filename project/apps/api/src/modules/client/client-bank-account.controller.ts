import { Body, Controller, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClientBankAccountService } from './client-bank-account.service';
import { CreateClientBankAccountDto, UpdateClientBankAccountDto } from './dto/client-bank-account.dto';

interface AuthRequest { user: { id: string; tenantId: string } }

@Controller('clients/:clientId/bank-accounts')
@UseGuards(JwtAuthGuard)
export class ClientBankAccountController {
  constructor(private readonly accounts: ClientBankAccountService) {}

  @Get()
  list(@Param('clientId') clientId: string, @Request() req: AuthRequest) {
    return this.accounts.list(clientId, { userId: req.user.id, tenantId: req.user.tenantId });
  }

  @Post()
  create(@Param('clientId') clientId: string, @Body() body: CreateClientBankAccountDto, @Request() req: AuthRequest) {
    return this.accounts.create(clientId, body, { userId: req.user.id, tenantId: req.user.tenantId });
  }

  @Put(':accountId')
  update(@Param('clientId') clientId: string, @Param('accountId') accountId: string,
    @Body() body: UpdateClientBankAccountDto, @Request() req: AuthRequest) {
    return this.accounts.update(clientId, accountId, body, { userId: req.user.id, tenantId: req.user.tenantId });
  }
}
