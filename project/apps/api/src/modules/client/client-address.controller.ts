import { Body, Controller, Delete, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClientAddressService } from './client-address.service';
import { CreateClientAddressDto, UpdateClientAddressDto } from './dto/client-address.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class ClientAddressController {
  constructor(private readonly clientAddressService: ClientAddressService) {}

  /// <remarks>
  /// Cagrildigi yerler:
  /// - ClientAddressController.create() -> POST /clients/:clientId/addresses (id-bazlı create; deleteMany+recreate YOK)
  /// </remarks>
  @Post('clients/:clientId/addresses')
  create(@Request() req: any, @Param('clientId') clientId: string, @Body() dto: CreateClientAddressDto) {
    return this.clientAddressService.create(req.user.tenantId, clientId, dto);
  }

  /// <remarks>
  /// Cagrildigi yerler:
  /// - ClientAddressController.update() -> PUT /addresses/:addressId (id-bazlı update; payload'da olmayan adresler etkilenmez)
  /// </remarks>
  @Put('addresses/:addressId')
  update(@Request() req: any, @Param('addressId') addressId: string, @Body() dto: UpdateClientAddressDto) {
    return this.clientAddressService.update(req.user.tenantId, addressId, dto);
  }

  /// <remarks>
  /// Cagrildigi yerler:
  /// - ClientAddressController.remove() -> DELETE /addresses/:addressId (primary adres reddedilir)
  /// </remarks>
  @Delete('addresses/:addressId')
  remove(@Request() req: any, @Param('addressId') addressId: string) {
    return this.clientAddressService.remove(req.user.tenantId, addressId);
  }
}
