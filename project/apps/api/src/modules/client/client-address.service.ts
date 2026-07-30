import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClientAddressDto, UpdateClientAddressDto } from './dto/client-address.dto';
import {
  evaluateClientAddressLifecycle,
  type ClientAddressLifecycleRow,
} from './client-address-lifecycle';

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

/**
 * CLIENT-ARC-07-LIFECYCLE-INVARIANT-I01 — invariant değerlendirmesi için MİNİMUM kardeş
 * projeksiyonu. Adres İÇERİĞİ (street/city/district/region/postalCode) invariant kararına
 * GİRMEZ, bu yüzden SEÇİLMEZ — gereksiz kişisel veri okunmaz (§5).
 */
const LIFECYCLE_SIBLING_SELECT = {
  id: true,
  clientId: true,
  isPrimary: true,
  isCurrent: true,
} as const;

@Injectable()
export class ClientAddressService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Öngörülen (yazma SONRASI) adres kümesini §49'a karşı doğrular; ihlalde SABİT domain hatası
   * fırlatır. TRANSACTION İÇİNDE çağrılır → ihlalde yazma ROLLBACK olur, geçersiz ara durum
   * COMMIT EDİLMEZ.
   *
   * Hata sözleşmesi: makine-okur kod + sınırlı mesaj. Kişisel veri, kayıt dökümü veya başka
   * tenant/müvekkilin çakışan kaydına dair bilgi SIZDIRMAZ.
   */
  private assertLifecycle(clientId: string, prospective: ClientAddressLifecycleRow[]): void {
    const result = evaluateClientAddressLifecycle(clientId, prospective);
    if (result.valid) return;
    throw new BadRequestException({
      code: 'CLIENT_ADDRESS_LIFECYCLE_VIOLATION',
      violation: result.code,
      invariant: result.invariant,
      message: result.detail ?? 'Adres yaşam döngüsü kuralı ihlal edildi.',
    });
  }

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
      // I01 §5: invariant için gereken okuma YAZMA İLE AYNI transaction'da. Eski `count()`
      // yerine minimum projeksiyonlu kardeş kümesi okunur — hem öngörülen durum kurulabilsin
      // hem INV-07 (arşiv satır primary seçimine katılmaz) uygulanabilsin.
      const siblings = await tx.clientAddress.findMany({
        where: { clientId },
        select: LIFECYCLE_SIBLING_SELECT,
      });
      // INV-07: "ilk adres primary olur" kararı YALNIZ current satırlara bakar. Bugün tüm
      // satırlar current olduğu için davranış eski `count()` ile AYNIDIR; arşiv geldiğinde
      // (I02) doğru kalır.
      const currentSiblingCount = siblings.filter((s) => s.isCurrent).length;
      const isPrimary = dto.isPrimary === true || currentSiblingCount === 0;

      // Yazma SONRASI beklenen küme: primary'ye terfi varsa kardeşlerin primary'si düşer.
      // Yeni satır her zaman current'tır (isCurrent DTO'dan alınmaz, şema default'u true).
      const prospective: ClientAddressLifecycleRow[] = [
        ...siblings.map((s) => ({ ...s, isPrimary: isPrimary ? false : s.isPrimary })),
        { id: null, clientId, isPrimary, isCurrent: true },
      ];
      this.assertLifecycle(clientId, prospective);

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
  /// - ClientAddressController.update() -> PUT /clients/:clientId/addresses/:addressId (JWT-only, tenant+client-scoped)
  /// </remarks>
  async update(tenantId: string, clientId: string, addressId: string, dto: UpdateClientAddressDto): Promise<ClientAddressRow> {
    const address = await this.findAddressInClient(tenantId, clientId, addressId);

    return this.prisma.$transaction(async (tx) => {
      // I01 §5: kardeş durumu YAZMA İLE AYNI transaction'da okunur (count-then-write yarışı yok).
      const siblings = await tx.clientAddress.findMany({
        where: { clientId: address.clientId },
        select: LIFECYCLE_SIBLING_SELECT,
      });
      const promoting = dto.isPrimary === true;
      // Yazma SONRASI beklenen küme. `isCurrent` bu yolda DEĞİŞMEZ (DTO'da isCurrent YOK —
      // arşivleme I02'ye ertelidir), bu yüzden her satırın mevcut isCurrent'ı korunur.
      // Terfi varsa hedef satır primary olur, diğerleri düşer; terfi yoksa hiçbir bayrak
      // değişmez ("primary'siz bırak" bu API'de YOK — delete-reddet ile aynı ilke).
      const prospective: ClientAddressLifecycleRow[] = siblings.map((s) =>
        s.id === addressId
          ? { ...s, isPrimary: promoting ? true : s.isPrimary }
          : { ...s, isPrimary: promoting ? false : s.isPrimary },
      );
      this.assertLifecycle(address.clientId, prospective);

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
  /// - ClientAddressController.remove() -> DELETE /clients/:clientId/addresses/:addressId (JWT-only, tenant+client-scoped)
  /// </remarks>
  async remove(tenantId: string, clientId: string, addressId: string): Promise<void> {
    // Tenant+client sınırı ve 404 sözleşmesi DEĞİŞMEDİ (fail-closed authorization okuması).
    const address = await this.findAddressInClient(tenantId, clientId, addressId);

    // I01 §4C: SİLME YENİDEN TASARLANMADI. Mevcut "primary silinemez" reddi ve kod/mesajı
    // AYNEN korunur; yalnız kontrol + silme AYNI transaction'a alınır (§5, TOCTOU yarışı yok)
    // ve silme SONRASI kümenin §49'u ihlal edemeyeceği doğrulanır.
    // Deterministik primary yeniden-atama UYGULANMADI ve GEREKMEDİ: primary silinemediği için
    // silme, "current var ama primary yok" veya "çok primary" durumunu ÜRETEMEZ. Yeniden-atama
    // gerektiren senaryolar (arşivleme) I02'ye aittir.
    await this.prisma.$transaction(async (tx) => {
      const siblings = await tx.clientAddress.findMany({
        where: { clientId: address.clientId },
        select: LIFECYCLE_SIBLING_SELECT,
      });
      const target = siblings.find((s) => s.id === addressId);
      if (!target) throw new NotFoundException('Adres bulunamadı');

      if (target.isPrimary) {
        throw new BadRequestException({
          code: 'CLIENT_ADDRESS_PRIMARY_DELETE_FORBIDDEN',
          message: 'Bu adres birincil (primary) — silmeden önce başka bir adresi birincil yapın.',
        });
      }

      this.assertLifecycle(
        address.clientId,
        siblings.filter((s) => s.id !== addressId),
      );

      await tx.clientAddress.delete({ where: { id: addressId } });
    });
  }

  private async findAddressInClient(tenantId: string, clientId: string, addressId: string): Promise<ClientAddressRow> {
    const address = await this.prisma.clientAddress.findFirst({
      where: { id: addressId, clientId, client: { tenantId } },
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
