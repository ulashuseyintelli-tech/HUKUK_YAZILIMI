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
  /// - ClientAddressController.update() -> PUT /clients/:clientId/addresses/:addressId (id-bazlı update; payload'da olmayan adresler etkilenmez)
  ///
  /// Route nested (bare /addresses/:addressId DEĞİL): eskiden debtor AddressController ile aynı bare
  /// path'i paylaşıyordu; DebtorModule ClientModule'den önce import edildiği için bu route hiç
  /// tetiklenmiyordu (route collision, DBND-D6A-1). clientId path'te zorunlu kılınıp service'te
  /// addressId'nin o clientId'ye ait olduğu doğrulanarak hem çakışma hem üstü kapalı IDOR ihtimali kapatıldı.
  /// </remarks>
  @Put('clients/:clientId/addresses/:addressId')
  update(
    @Request() req: any,
    @Param('clientId') clientId: string,
    @Param('addressId') addressId: string,
    @Body() dto: UpdateClientAddressDto,
  ) {
    return this.clientAddressService.update(req.user.tenantId, clientId, addressId, dto);
  }

  /// <remarks>
  /// Cagrildigi yerler:
  /// - ClientAddressController.remove() -> DELETE /clients/:clientId/addresses/:addressId (primary adres reddedilir)
  ///
  /// Route nested (bare /addresses/:addressId DEĞİL) — bkz update() remarks (DBND-D6A-1 route collision fix).
  /// </remarks>
  @Delete('clients/:clientId/addresses/:addressId')
  remove(@Request() req: any, @Param('clientId') clientId: string, @Param('addressId') addressId: string) {
    return this.clientAddressService.remove(req.user.tenantId, clientId, addressId);
  }
}
