import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClientAddressDto, UpdateClientAddressDto } from './dto/client-address.dto';

type ClientAddressRow = {
  id: string;
  clientId: string;
  type: string;
  street: string | null;
  city: string | null;
  district: string | null;
  region: string | null;
  postalCode: string | null;
  isPrimary: boolean;
  isCurrent: boolean;
};

@Injectable()
export class ClientAddressService {
  constructor(private readonly prisma: PrismaService) {}

  /// <remarks>
  /// Cagrildigi yerler:
  /// - ClientAddressController.create() -> POST /clients/:clientId/addresses (JWT-only, tenant-scoped)
  /// </remarks>
  async create(tenantId: string, clientId: string, dto: CreateClientAddressDto): Promise<ClientAddressRow> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId },
      select: { id: true },
    });
    if (!client) throw new NotFoundException('Müvekkil bulunamadı');

    return this.prisma.$transaction(async (tx) => {
      const existingCount = await tx.clientAddress.count({ where: { clientId } });
      const isPrimary = dto.isPrimary === true || existingCount === 0;

      if (isPrimary) {
        await tx.clientAddress.updateMany({
          where: { clientId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      return tx.clientAddress.create({
        data: {
          clientId,
          type: dto.type,
          street: dto.street,
          city: dto.city,
          district: dto.district,
          region: dto.region,
          postalCode: dto.postalCode,
          isPrimary,
          // isCurrent payload'dan alınmaz — yeni adres her zaman güncel.
        },
      });
    });
  }

  /// <remarks>
  /// Cagrildigi yerler:
  /// - ClientAddressController.update() -> PUT /addresses/:addressId (JWT-only, tenant-scoped)
  /// </remarks>
  async update(tenantId: string, addressId: string, dto: UpdateClientAddressDto): Promise<ClientAddressRow> {
    const address = await this.findAddressInTenant(tenantId, addressId);

    return this.prisma.$transaction(async (tx) => {
      // isPrimary yalnız true geldiğinde ele alınır (promote + sibling'leri unset). false/undefined
      // bu satırın isPrimary alanına dokunmaz — "primary'siz bırak" burada YOK, ayrı bir aksiyon
      // (varsa) gerektirir; bu, delete-reddet ile aynı invariant-koruma ilkesidir.
      if (dto.isPrimary === true && !address.isPrimary) {
        await tx.clientAddress.updateMany({
          where: { clientId: address.clientId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      return tx.clientAddress.update({
        where: { id: addressId },
        data: {
          type: dto.type,
          street: dto.street,
          city: dto.city,
          district: dto.district,
          region: dto.region,
          postalCode: dto.postalCode,
          isPrimary: dto.isPrimary === true ? true : undefined,
        },
      });
    });
  }

  /// <remarks>
  /// Cagrildigi yerler:
  /// - ClientAddressController.remove() -> DELETE /addresses/:addressId (JWT-only, tenant-scoped)
  /// </remarks>
  async remove(tenantId: string, addressId: string): Promise<void> {
    const address = await this.findAddressInTenant(tenantId, addressId);

    if (address.isPrimary) {
      throw new BadRequestException({
        code: 'CLIENT_ADDRESS_PRIMARY_DELETE_FORBIDDEN',
        message: 'Bu adres birincil (primary) — silmeden önce başka bir adresi birincil yapın.',
      });
    }

    await this.prisma.clientAddress.delete({ where: { id: addressId } });
  }

  private async findAddressInTenant(tenantId: string, addressId: string): Promise<ClientAddressRow> {
    const address = await this.prisma.clientAddress.findFirst({
      where: { id: addressId, client: { tenantId } },
      select: {
        id: true,
        clientId: true,
        type: true,
        street: true,
        city: true,
        district: true,
        region: true,
        postalCode: true,
        isPrimary: true,
        isCurrent: true,
      },
    });
    if (!address) throw new NotFoundException('Adres bulunamadı');
    return address;
  }
}
