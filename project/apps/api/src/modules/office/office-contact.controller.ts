import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { getRequestId } from '../../common/request-id.middleware';
import { OfficeContactService } from './office-contact.service';
import { OfficeContactGrantDto, OfficeContactRevokeDto, UpdateOfficeContactDto, UpdateStaffContactDto } from './dto/office-contact.dto';

@Controller('office-contact')
@UseGuards(JwtAuthGuard)
export class OfficeContactController {
  constructor(private readonly contacts: OfficeContactService) {}
  private actor(req: any) { return { tenantId: req.user.tenantId, userId: req.user.id, requestId: getRequestId(req) }; }
  @Get('capabilities')
  async capabilities(@Request() req: any) { return { data: await this.contacts.capabilities(this.actor(req)) }; }
  @Get('office')
  async office(@Request() req: any) { return { data: await this.contacts.readOffice(this.actor(req)) }; }
  @Patch('office')
  async updateOffice(@Request() req: any, @Body() body: UpdateOfficeContactDto) { return { data: await this.contacts.updateOffice(this.actor(req), body) }; }
  @Get('staff')
  async staff(@Request() req: any, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return { data: await this.contacts.listStaff(this.actor(req), false, cursor, limit) };
  }
  @Patch('staff/:id')
  async updateStaff(@Request() req: any, @Param('id') id: string, @Body() body: UpdateStaffContactDto) {
    return { data: await this.contacts.updateStaff(this.actor(req), id, body) };
  }
  @Get('permissions/subjects')
  async subjects(@Request() req: any, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return { data: await this.contacts.listStaff(this.actor(req), true, cursor, limit) };
  }
  @Get('permissions/staff/:id')
  async permissions(@Request() req: any, @Param('id') id: string) { return { data: await this.contacts.permissionState(this.actor(req), id) }; }
  @Post('permissions/staff/:id')
  async grant(@Request() req: any, @Param('id') id: string, @Body() body: OfficeContactGrantDto) {
    return { data: await this.contacts.grant(this.actor(req), id, body) };
  }
  @Post('permissions/staff/:id/revoke')
  async revoke(@Request() req: any, @Param('id') id: string, @Body() body: OfficeContactRevokeDto) {
    return { data: await this.contacts.revoke(this.actor(req), id, body) };
  }
}
