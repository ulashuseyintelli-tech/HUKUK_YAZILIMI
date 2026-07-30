import { Body, Controller, Delete, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClientAddressService } from './client-address.service';
import {
  ArchiveClientAddressDto,
  CreateClientAddressDto,
  RestoreClientAddressDto,
  UpdateClientAddressDto,
} from './dto/client-address.dto';

/**
 * I02: audit actor compile-time şekli — `client.controller.ts` C0-a deseniyle BİREBİR.
 * `id` audit actor'ü, `tenantId` scope'u besler; ikisi de YALNIZ JWT'den gelir.
 */
interface AuthRequest {
  user: { id: string; tenantId: string };
}

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

  /// <remarks>
  /// Cagrildigi yerler:
  /// - ClientAddressController.archive() -> POST /clients/:clientId/addresses/:addressId/archive
  ///
  /// I02: arşivleme AÇIK bir lifecycle aksiyonudur (charter §49.4) — generic PUT üzerinden
  /// `isCurrent` alanı güncellemesi olarak YAPILMAZ, bu yüzden ayrı bir route'tur. Nested path
  /// (bare /addresses/... DEĞİL) create/update/remove ile aynı gerekçeyle: DBND-D6A-1 route
  /// collision + cross-client IDOR kapanışı. STAFF-ONLY: portal route AÇILMADI (§49.7).
  /// </remarks>
  @Post('clients/:clientId/addresses/:addressId/archive')
  archive(
    @Request() req: AuthRequest,
    @Param('clientId') clientId: string,
    @Param('addressId') addressId: string,
    @Body() dto: ArchiveClientAddressDto,
  ) {
    // C0-a: actor YALNIZ req.user.id (auth); body'den userId ASLA okunmaz.
    return this.clientAddressService.archive(req.user.tenantId, clientId, addressId, dto, {
      userId: req.user.id,
    });
  }

  /// <remarks>
  /// Cagrildigi yerler:
  /// - ClientAddressController.restore() -> POST /clients/:clientId/addresses/:addressId/restore
  ///
  /// I02: archive() ile simetrik açık aksiyon. `makePrimary` yalnız AÇIK istekle birinciliği
  /// devreder; aksi halde geri alınan adres non-primary döner.
  /// </remarks>
  @Post('clients/:clientId/addresses/:addressId/restore')
  restore(
    @Request() req: AuthRequest,
    @Param('clientId') clientId: string,
    @Param('addressId') addressId: string,
    @Body() dto: RestoreClientAddressDto,
  ) {
    return this.clientAddressService.restore(req.user.tenantId, clientId, addressId, dto, {
      userId: req.user.id,
    });
  }
}
