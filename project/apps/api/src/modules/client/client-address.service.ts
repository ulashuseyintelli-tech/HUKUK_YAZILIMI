import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  ArchiveClientAddressDto,
  CreateClientAddressDto,
  RestoreClientAddressDto,
  UpdateClientAddressDto,
} from './dto/client-address.dto';
import {
  evaluateClientAddressLifecycle,
  type ClientAddressLifecycleRow,
} from './client-address-lifecycle';
// Tip-only import (runtime'da silinir → döngü YOK): audit actor tipi CLIENT modülünde zaten
// kanoniktir, paralel bir tip ÜRETİLMEZ.
import type { ClientMutationActorContext } from './client.service';
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import {
  CLIENT_MUTATION_REASON,
  decideClientAddressMutation,
  type ClientAddressMutationInput,
  type ClientMutationDecision,
} from './client-mutation-policy';

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

/**
 * CLIENT-ARC-07-STAFF-HISTORY-I03 — STAFF okuma projeksiyonu (charter §49.7 / ARC-07-D06).
 *
 * YALNIZ personel adres yönetimi için gereken alanlar. Bilerek DIŞARIDA: `client` ilişkisi ve
 * diğer müvekkil verisi · audit iç yapıları · actor kimlikleri · ham request metadata'sı ·
 * tenant-içi teşhis alanları. Yeni bir audit veri deposu OLUŞTURULMAZ.
 */
const STAFF_READ_SELECT = {
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
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * OWN-13 I02-R2 — `ClientAddressRow` ile BİREBİR projeksiyon. Koşullu (`updateMany`) yazımdan
 * sonra satırı geri okumak için kullanılır; response kontratına yeni alan EKLEMEZ.
 */
const ADDRESS_ROW_SELECT = {
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
} as const;

/** I03 okuma filtresi. Bilinmeyen değer SESSİZCE 'active'e düşmez — fail-closed reddedilir. */
export const CLIENT_ADDRESS_LIST_STATUSES = ['active', 'archived', 'all'] as const;
export type ClientAddressListStatus = (typeof CLIENT_ADDRESS_LIST_STATUSES)[number];

/**
 * CLIENT-ARC-07-CREATE-UPDATE-AUDIT-I04A — audit'e girmesine izin verilen DEĞİŞİKLİK
 * KATEGORİLERİ. Buraya YALNIZ ALAN ADI yazılır, ASLA ALAN DEĞERİ.
 *
 * `street`/`city`/`district`/`region`/`postalCode` müvekkilin kişisel adres içeriğidir;
 * audit gövdesine DEĞER olarak konması POL-D/POL-E hijyenini bozar. Hangi alanın
 * değiştiğini bilmek denetim için yeterlidir; ne olduğu adres kaydının kendisindedir.
 */
const AUDITED_ADDRESS_FIELDS = ['type', 'street', 'city', 'district', 'region', 'postalCode'] as const;

/**
 * Payload'da GERÇEKTEN değişen alanların ADLARINI döner. `undefined` alanlar Prisma'da
 * no-op olduğu için sayılmaz; aynı değerin yeniden gönderilmesi de değişiklik SAYILMAZ.
 */
function changedAddressFields(before: ClientAddressRow, dto: UpdateClientAddressDto): string[] {
  return AUDITED_ADDRESS_FIELDS.filter((field) => {
    const next = (dto as Record<string, unknown>)[field];
    if (next === undefined) return false;
    return next !== (before as unknown as Record<string, unknown>)[field];
  });
}

@Injectable()
export class ClientAddressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    // OWN-13 I02-R2 (owner D06): elevated eşiği MEVCUT kanonik kaynaktan gelir; CLIENT
    // kendi eligibility hesabını KURMAZ, ikinci bir capability sistemi de EKLEMEZ.
    private readonly officeApproval: OfficeApprovalService,
  ) {}

  /**
   * OWN-13 I02-R2 — reddedilen adres mutasyonunu stabil `reasonCode` ile 403'e çevirir.
   *
   * PII YASAĞI (owner F): gövde YALNIZ makine-okur kod + sabit mesaj taşır. `street`, `city`,
   * `district`, `postalCode`, `identityNo` veya başka kişisel veri ASLA yazılmaz.
   */
  private denyAddressMutation(decision: ClientMutationDecision): never {
    const messages: Record<string, string> = {
      [CLIENT_MUTATION_REASON.NO_ACTOR]: 'Yetkilendirme bağlamı yok.',
      [CLIENT_MUTATION_REASON.UNKNOWN_ROLE]: 'Kullanıcı rolü tanınmadı.',
      [CLIENT_MUTATION_REASON.VIEWER_DENIED]:
        'Görüntüleyici (VIEWER) rolü müvekkil adresi oluşturamaz veya değiştiremez.',
      [CLIENT_MUTATION_REASON.LIFECYCLE_DENIED]:
        'Bu adres işlemi birincil/güncel adres durumunu değiştirir; yetkilendirilmiş avukat ' +
        '(PARTNER veya onay yetkisi verilmiş) olmanız gerekir.',
      [CLIENT_MUTATION_REASON.TENANT_MISMATCH]: 'İşlem bağlamı ile hedef büro eşleşmiyor.',
    };
    throw new ForbiddenException({
      code: decision.reasonCode,
      message: messages[decision.reasonCode] ?? 'Bu işlem için yetkiniz yok.',
    });
  }

  /**
   * OWN-13 I02-R2 (owner D04) — aktör tenant'ı ile hedef tenant EXACT eşit olmalıdır.
   * Hiçbir sorgu üretilmeden reddeder; varlık sızdırmaz.
   */
  private assertActorTenantMatches(tenantId: string, actor: ClientMutationActorContext): void {
    if (!tenantId || !actor?.tenantId || actor.tenantId !== tenantId) {
      this.denyAddressMutation({
        allowed: false,
        reasonCode: CLIENT_MUTATION_REASON.TENANT_MISMATCH,
      });
    }
  }

  /**
   * OWN-13 I02-R2 — adres mutasyon yetki kapısı. SERVİS SINIRINDA authority'dir; controller
   * de çağırabilir ama tek geçit orası DEĞİLDİR (owner A: controller-only yetmez).
   *
   * `isApproverEligible` YALNIZ gerçekten elevated gerektiren işlemlerde sorgulanır — aksi
   * hâlde gereksiz DB turu yapılmaz. **Owner D07: ADMIN rolü tek başına elevated SAYILMAZ**,
   * bu yüzden `elevatedAuthority` yalnız bu predicate'ten türer.
   */
  private async assertAddressMutationAllowed(
    tenantId: string,
    actor: ClientMutationActorContext,
    input: ClientAddressMutationInput,
  ): Promise<void> {
    // Önce yükseltme YOKmuş gibi karar ver: actor/rol/VIEWER retleri eligibility'den BAĞIMSIZ
    // olduğu için bu durumlarda gereksiz DB turu atılmaz (fail-closed erken).
    const base = decideClientAddressMutation(
      { userId: actor?.userId, role: actor?.role, elevatedAuthority: false },
      input,
    );
    if (base.allowed) return;
    if (base.reasonCode !== CLIENT_MUTATION_REASON.LIFECYCLE_DENIED) {
      this.denyAddressMutation(base);
    }

    // Yalnız sonucu DEĞİŞTİREBİLECEĞİ durumda eligibility sorgulanır.
    const elevatedAuthority = actor?.userId
      ? await this.officeApproval.isApproverEligible(actor.userId, tenantId)
      : false;
    const decision = decideClientAddressMutation(
      { userId: actor?.userId, role: actor?.role, elevatedAuthority },
      input,
    );
    if (!decision.allowed) this.denyAddressMutation(decision);
  }

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

  /**
   * I03 — STAFF-ONLY adres okuma sözleşmesi (charter §49.7 / ARC-07-D06).
   *
   *   status='active'   → YALNIZ `isCurrent=true`
   *   status='archived' → YALNIZ `isCurrent=false`
   *   status='all'      → ikisi birden
   *
   * KAPSAM (fail-closed): müvekkil ÖNCE tenant sınırında çözülür (yoksa/başka tenant'ta ise 404,
   * boş liste DEĞİL — varlık sızdırmamak için tenant dışı ile "hiç adresi yok" AYIRT EDİLEMEZ).
   * Adres sorgusu AYRICA `client: { tenantId }` ile kapsanır: derinlemesine savunma, tek bir
   * predicate'in kaybı okumayı kapsam dışına AÇMASIN diye bilerek yedeklidir.
   *
   * PORTAL EXPOZÜRÜ YOK: bu metot yalnız JWT staff controller'ından çağrılır (§49.7).
   * Yeni audit veri deposu OLUŞTURULMAZ; arşiv/aktif ayrımı `isCurrent` durumundan türer.
   *
   * Cagrildigi yerler:
   * - ClientAddressController.list() -> GET /clients/:clientId/addresses?status=... (JWT-only)
   */
  async findForClient(
    tenantId: string,
    clientId: string,
    status: ClientAddressListStatus = 'active',
  ): Promise<Array<ClientAddressRow & { createdAt: Date; updatedAt: Date }>> {
    if (!CLIENT_ADDRESS_LIST_STATUSES.includes(status)) {
      throw new BadRequestException({
        code: 'CLIENT_ADDRESS_INVALID_STATUS_FILTER',
        message: 'Geçersiz adres durumu filtresi.',
      });
    }

    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId },
      select: { id: true },
    });
    if (!client) throw new NotFoundException('Müvekkil bulunamadı');

    return this.prisma.clientAddress.findMany({
      where: {
        clientId,
        client: { tenantId },
        ...(status === 'all' ? {} : { isCurrent: status === 'active' }),
      },
      select: STAFF_READ_SELECT,
      // Aktif listede birincil önce (mevcut `client.service.ts` findOne sırasıyla AYNI);
      // arşivde en YENİ arşivlenen önce mantıklı olurdu fakat `archivedAt` kolonu YOK
      // (§13 gereği eklenmedi) — bu yüzden deterministik ve mevcut konvansiyonla tutarlı
      // olan createdAt sıralaması korunur.
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /// <remarks>
  /// Cagrildigi yerler:
  /// - ClientAddressController.create() -> POST /clients/:clientId/addresses (JWT-only, tenant-scoped)
  /// </remarks>
  ///
  /// I04A: adres oluşturma ARTIK transaction-bağlı audit yazar (§49.4'ün audit zorunluluğunun
  /// create/update yolundaki kalıntısı kapatıldı). Audit `logInTransaction` ile AYNI
  /// transaction'da yazılır ve hata YUTULMAZ → audit yazılamazsa oluşturma ROLLBACK olur.
  async create(
    tenantId: string,
    clientId: string,
    dto: CreateClientAddressDto,
    actor: ClientMutationActorContext,
  ): Promise<ClientAddressRow> {
    // OWN-13 I02-R2: tenant eşitliği — hiçbir sorgu yapılmadan ÖNCE.
    this.assertActorTenantMatches(tenantId, actor);

    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId },
      select: { id: true },
    });
    if (!client) throw new NotFoundException('Müvekkil bulunamadı');

    // Owner D02/D03: AÇIK birincillik talebi ancak MEVCUT aktif birincili düşürecekse
    // elevated'dır. Hiç aktif birincil yokken ilk adresin otomatik birincil olması STANDARD.
    // Bu okuma yalnız açık talep varken yapılır; aksi hâlde sınıflandırma zaten STANDARD.
    const hasActivePrimary =
      dto.isPrimary === true
        ? (await this.prisma.clientAddress.count({
            where: { clientId, isPrimary: true, isCurrent: true, client: { tenantId } },
          })) > 0
        : false;

    await this.assertAddressMutationAllowed(tenantId, actor, {
      operation: 'CREATE',
      requestsPrimary: dto.isPrimary === true,
      hasActivePrimary,
    });

    return this.prisma.$transaction(async (tx) => {
      // OWN-13 I02-R2 (owner D04): parent Client AYNI transaction içinde tenant-scoped olarak
      // YENİDEN doğrulanır; create yalnız doğrulanan clientId'ye bağlanır.
      const verifiedClient = await tx.client.findFirst({
        where: { id: clientId, tenantId },
        select: { id: true },
      });
      if (!verifiedClient) throw new NotFoundException('Müvekkil bulunamadı');
      const verifiedClientId = verifiedClient.id;

      // I01 §5: invariant için gereken okuma YAZMA İLE AYNI transaction'da. Eski `count()`
      // yerine minimum projeksiyonlu kardeş kümesi okunur — hem öngörülen durum kurulabilsin
      // hem INV-07 (arşiv satır primary seçimine katılmaz) uygulanabilsin.
      const siblings = await tx.clientAddress.findMany({
        where: { clientId: verifiedClientId },
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
        { id: null, clientId: verifiedClientId, isPrimary, isCurrent: true },
      ];
      this.assertLifecycle(verifiedClientId, prospective);

      if (isPrimary) {
        // D04: yazma tenant-scoped parent ilişkisine bağlı.
        await tx.clientAddress.updateMany({
          where: { clientId: verifiedClientId, isPrimary: true, client: { tenantId } },
          data: { isPrimary: false },
        });
      }

      const created = await tx.clientAddress.create({
        data: {
          clientId: verifiedClientId,
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

      // Birincilik gerçekten DEVREDİLDİYSE ayrı yeniden-atama kanıtı yazılır. Terfi eden
      // kardeş YOKSA (ilk adres, ya da zaten birincilsiz küme) yeniden-atama UYDURULMAZ.
      const displacedPrimary = isPrimary
        ? siblings.find((s) => s.isCurrent && s.isPrimary)
        : undefined;
      if (displacedPrimary) {
        await this.audit.logInTransaction(tx, {
          tenantId,
          action: 'CLIENT_ADDRESS_PRIMARY_REASSIGN',
          entityType: 'CLIENT_ADDRESS',
          // I02 ile AYNI kural: entityId = BİRİNCİL OLAN satır; kaybeden metadata'da.
          entityId: created.id,
          userId: actor?.userId,
          oldValues: { isPrimary: false, isCurrent: true },
          newValues: { isPrimary: true, isCurrent: true },
          metadata: {
            clientId: verifiedClientId,
            previousPrimaryAddressId: displacedPrimary.id,
            reason: 'PRIMARY_CREATED',
          },
        });
      }

      // Audit gövdesi YALNIZ kimlik + durum bayrağı + adres TİPİ taşır. Ham adres içeriği
      // (street/city/district/region/postalCode) KASITLI olarak YAZILMAZ.
      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CLIENT_ADDRESS_CREATE',
        entityType: 'CLIENT_ADDRESS',
        entityId: created.id,
        userId: actor?.userId,
        newValues: { isPrimary: created.isPrimary, isCurrent: created.isCurrent },
        metadata: {
          clientId: verifiedClientId,
          type: created.type,
          siblingPrimaryUnset: Boolean(displacedPrimary),
        },
      });

      return created;
    });
  }

  /// <remarks>
  /// Cagrildigi yerler:
  /// - ClientAddressController.update() -> PUT /clients/:clientId/addresses/:addressId (JWT-only, tenant+client-scoped)
  /// </remarks>
  ///
  /// I04A: adres güncelleme ARTIK transaction-bağlı audit yazar. Audit gövdesine DEĞİŞEN ALAN
  /// ADLARI girer, DEĞERLERİ GİRMEZ. Hiçbir şey gerçekten değişmediyse (payload aynı değerleri
  /// taşıyor ya da boş) BAŞARI AUDIT'İ YAZILMAZ — "hiçbir şey olmadı" kaydı hukuki geçmişi kirletir.
  async update(
    tenantId: string,
    clientId: string,
    addressId: string,
    dto: UpdateClientAddressDto,
    actor: ClientMutationActorContext,
  ): Promise<ClientAddressRow> {
    this.assertActorTenantMatches(tenantId, actor);
    const address = await this.findAddressInClient(tenantId, clientId, addressId);

    // Owner D02: MEVCUT birincil kaydın herhangi bir alanını değiştirmek VE birincillik
    // devri elevated'dır; birincil OLMAYAN adresin olağan alanları STANDARD (owner B.2).
    await this.assertAddressMutationAllowed(tenantId, actor, {
      operation: 'UPDATE',
      targetIsPrimary: address.isPrimary === true,
      requestsPrimary: dto.isPrimary === true,
    });

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
        // D04: yazma tenant-scoped parent ilişkisine bağlı.
        await tx.clientAddress.updateMany({
          where: { clientId: address.clientId, isPrimary: true, client: { tenantId } },
          data: { isPrimary: false },
        });
      }

      // OWN-13 I02-R2 (owner D04): final write `updateMany` + `count` ile tenant-scoped parent
      // ilişkisine bağlanır. Unique `update({where:{id}})` bu predicate'i taşıyamaz. `count===0`
      // (kayıt eşzamanlı taşındı/silindi) → SONRAKİ HİÇBİR YAZMA VE AUDİT ÜRETİLMEZ.
      const { count } = await tx.clientAddress.updateMany({
        where: { id: addressId, clientId: address.clientId, client: { tenantId } },
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
      if (count === 0) {
        throw new NotFoundException('Adres bulunamadı');
      }
      // Dönüş şekli DEĞİŞMEDİ: `ClientAddressRow` alanları birebir (createdAt/updatedAt gibi
      // ek alan EKLENMEZ — response kontratı korunur).
      const updated = await tx.clientAddress.findFirstOrThrow({
        where: { id: addressId, client: { tenantId } },
        select: ADDRESS_ROW_SELECT,
      });

      const changedFields = changedAddressFields(address, dto);
      const primaryPromoted = promoting && !address.isPrimary;
      const displacedPrimary = primaryPromoted
        ? siblings.find((s) => s.isCurrent && s.isPrimary && s.id !== addressId)
        : undefined;

      if (displacedPrimary) {
        await this.audit.logInTransaction(tx, {
          tenantId,
          action: 'CLIENT_ADDRESS_PRIMARY_REASSIGN',
          entityType: 'CLIENT_ADDRESS',
          entityId: addressId,
          userId: actor?.userId,
          oldValues: { isPrimary: false, isCurrent: address.isCurrent },
          newValues: { isPrimary: true, isCurrent: address.isCurrent },
          metadata: {
            clientId: address.clientId,
            previousPrimaryAddressId: displacedPrimary.id,
            reason: 'PRIMARY_PROMOTED_BY_UPDATE',
          },
        });
      }

      // GERÇEK değişiklik yoksa başarı audit'i YAZILMAZ (no-op kaydı üretilmez).
      if (changedFields.length > 0 || primaryPromoted) {
        await this.audit.logInTransaction(tx, {
          tenantId,
          action: 'CLIENT_ADDRESS_UPDATE',
          entityType: 'CLIENT_ADDRESS',
          entityId: addressId,
          userId: actor?.userId,
          oldValues: { isPrimary: address.isPrimary, isCurrent: address.isCurrent },
          newValues: { isPrimary: updated.isPrimary, isCurrent: updated.isCurrent },
          metadata: {
            clientId: address.clientId,
            // YALNIZ ALAN ADLARI — değerler ASLA yazılmaz.
            changedFields,
            primaryPromoted,
            previousPrimaryAddressId: displacedPrimary?.id ?? null,
          },
        });
      }

      return updated;
    });
  }

  /**
   * I02 — ARŞİVLEME (charter §49.4 `archive : EXPLICIT lifecycle action`).
   *
   * Arşiv = satır KORUNUR, `isCurrent=false` + `isPrimary=false` olur, adres İÇERİĞİ YOK EDİLMEZ,
   * satır tenant/müvekkil sahipliğinde kalır ve primary seçimine artık KATILMAZ (INV-07).
   * Fiziksel silme DEĞİLDİR ve fiziksel silmenin yerine geçmez.
   *
   * TEK transaction: kardeş okuması + invariant doğrulaması + yeniden-atama + arşivleme + audit.
   * Herhangi biri hata verirse HİÇBİRİ commit edilmez — audit'siz mutasyon KALMAZ (§49.4 "audit:
   * archive + restore icin ZORUNLU").
   *
   * Cagrildigi yerler:
   * - ClientAddressController.archive() -> POST /clients/:clientId/addresses/:addressId/archive
   */
  async archive(
    tenantId: string,
    clientId: string,
    addressId: string,
    dto: ArchiveClientAddressDto = {},
    actor: ClientMutationActorContext,
  ): Promise<ClientAddressRow> {
    this.assertActorTenantMatches(tenantId, actor);
    // Owner D02: arşivleme HER ZAMAN elevated (açık lifecycle aksiyonu).
    await this.assertAddressMutationAllowed(tenantId, actor, { operation: 'ARCHIVE' });
    // Tenant+client sınırı ve 404 sözleşmesi create/update/remove ile AYNI (fail-closed).
    const address = await this.findAddressInClient(tenantId, clientId, addressId);

    return this.prisma.$transaction(async (tx) => {
      const siblings = await tx.clientAddress.findMany({
        where: { clientId: address.clientId },
        select: LIFECYCLE_SIBLING_SELECT,
      });
      const target = siblings.find((s) => s.id === addressId);
      if (!target) throw new NotFoundException('Adres bulunamadı');

      // Zaten arşivli → SABİT HATA (idempotent başarı DEĞİL). Gerekçe: arşiv/restore hukuki
      // kayıt yaşam döngüsü aksiyonlarıdır; sessiz başarı ya yanıltıcı bir audit satırı yazar
      // ya da hiç yazmaz — ikisi de kaydın geçmişini bozar.
      if (!target.isCurrent) {
        throw new BadRequestException({
          code: 'CLIENT_ADDRESS_ALREADY_ARCHIVED',
          message: 'Bu adres zaten arşivlenmiş.',
        });
      }

      // Arşivleme SONRASI geride kalacak güncel adresler (hedef hariç).
      const remainingCurrent = siblings.filter((s) => s.isCurrent && s.id !== addressId);

      let replacement: (typeof siblings)[number] | undefined;
      if (target.isPrimary && remainingCurrent.length > 0) {
        // §49.4: "primary arsiv: deterministik yeniden-atama OLMADAN YAPILAMAZ".
        // Determinizm ÇAĞIRANIN AÇIK seçiminden gelir — servis "ilk satır kazanır" gibi bir
        // sıralama İCAT ETMEZ (owner §3: explicit replacement).
        const requestedId = dto.replacementPrimaryAddressId?.trim();
        if (!requestedId) {
          throw new BadRequestException({
            code: 'CLIENT_ADDRESS_REPLACEMENT_PRIMARY_REQUIRED',
            message:
              'Birincil adres arşivlenmeden önce yerine geçecek birincil adres açıkça seçilmelidir.',
          });
        }
        if (requestedId === addressId) {
          throw new BadRequestException({
            code: 'CLIENT_ADDRESS_REPLACEMENT_PRIMARY_INVALID',
            message: 'Arşivlenen adres kendi yerine birincil seçilemez.',
          });
        }
        // Aday YALNIZ bu müvekkilin kardeş kümesinde aranır. Kapsam-dışı kimlik "bulunamadı"
        // olarak döner: ayrı bir SCOPE_MISMATCH kodu ÜRETİLMEDİ, çünkü onu üretmek kapsamsız
        // bir sorgu gerektirir ve bu, owner §9'un yasakladığı cross-tenant varlık sızıntısıdır.
        replacement = siblings.find((s) => s.id === requestedId);
        if (!replacement) {
          throw new BadRequestException({
            code: 'CLIENT_ADDRESS_REPLACEMENT_PRIMARY_NOT_FOUND',
            message: 'Yerine geçecek birincil adres bu müvekkilde bulunamadı.',
          });
        }
        if (!replacement.isCurrent) {
          throw new BadRequestException({
            code: 'CLIENT_ADDRESS_REPLACEMENT_PRIMARY_NOT_CURRENT',
            message: 'Yerine geçecek birincil adres arşivlenmiş — önce geri alınmalıdır.',
          });
        }
      }

      // Yazma SONRASI beklenen küme. Son güncel adres arşivleniyorsa replacement YOKTUR ve
      // sonuç sıfır current / sıfır primary olur — INV-04 gereği bu GEÇERLİDİR.
      const prospective: ClientAddressLifecycleRow[] = siblings.map((s) => {
        if (s.id === addressId) return { ...s, isPrimary: false, isCurrent: false };
        if (replacement && s.id === replacement.id) return { ...s, isPrimary: true };
        return s;
      });
      this.assertLifecycle(address.clientId, prospective);

      if (replacement) {
        // D04: tenant-scoped parent ilişkisine bağlı koşullu yazma.
        const reassigned = await tx.clientAddress.updateMany({
          where: { id: replacement.id, clientId: address.clientId, client: { tenantId } },
          data: { isPrimary: true },
        });
        if (reassigned.count === 0) throw new NotFoundException('Adres bulunamadı');
      }

      // D04: arşiv yazımı da tenant-scoped; `count===0` → sonraki yazma/audit ÜRETİLMEZ.
      const { count } = await tx.clientAddress.updateMany({
        where: { id: addressId, clientId: address.clientId, client: { tenantId }, isCurrent: true },
        data: { isCurrent: false, isPrimary: false },
      });
      if (count === 0) throw new NotFoundException('Adres bulunamadı');
      const archived = await tx.clientAddress.findFirstOrThrow({
        where: { id: addressId, client: { tenantId } },
        select: ADDRESS_ROW_SELECT,
      });

      if (replacement) {
        await this.audit.logInTransaction(tx, {
          tenantId,
          action: 'CLIENT_ADDRESS_PRIMARY_REASSIGN',
          entityType: 'CLIENT_ADDRESS',
          // entityId = BİRİNCİL OLAN satır (yeniden-atamanın hedefi); kaybeden metadata'da.
          entityId: replacement.id,
          userId: actor?.userId,
          oldValues: { isPrimary: replacement.isPrimary, isCurrent: replacement.isCurrent },
          newValues: { isPrimary: true, isCurrent: replacement.isCurrent },
          metadata: {
            clientId: address.clientId,
            previousPrimaryAddressId: addressId,
            reason: 'PRIMARY_ARCHIVED',
          },
        });
      }

      // Audit gövdesi YALNIZ kimlik + durum bayrağı taşır — ham adres içeriği (street/city/...)
      // KASITLI olarak yazılmaz (owner §8: "Prefer IDs and state flags").
      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CLIENT_ADDRESS_ARCHIVE',
        entityType: 'CLIENT_ADDRESS',
        entityId: addressId,
        userId: actor?.userId,
        oldValues: { isPrimary: target.isPrimary, isCurrent: true },
        newValues: { isPrimary: false, isCurrent: false },
        metadata: {
          clientId: address.clientId,
          replacementPrimaryAddressId: replacement?.id ?? null,
          remainingCurrentCount: remainingCurrent.length,
        },
      });

      return archived;
    });
  }

  /**
   * I02 — ARŞİVDEN GERİ ALMA (charter §49.4 `restore : EXPLICIT lifecycle action`).
   *
   * Geri alınan satır VARSAYILAN olarak `isCurrent=true, isPrimary=false` olur. `makePrimary=true`
   * yalnız AÇIK istekle birincil yapar ve eski birinciyi AYNI transaction'da düşürür.
   *
   * TEK istisna — OTOMATİK BİRİNCİLİK: geri alınan satır tek güncel satır olacaksa (başka current
   * kardeş YOK) birincil OLMAK ZORUNDADIR. Bu bir politika SEÇİMİ değil, INV-03/INV-04'ün
   * ZORLADIĞI tek geçerli durumdur (sıfır alternatif) — "ilk satır kazanır" türü bir sıralama
   * icadı DEĞİLDİR.
   *
   * Cagrildigi yerler:
   * - ClientAddressController.restore() -> POST /clients/:clientId/addresses/:addressId/restore
   */
  async restore(
    tenantId: string,
    clientId: string,
    addressId: string,
    dto: RestoreClientAddressDto = {},
    actor: ClientMutationActorContext,
  ): Promise<ClientAddressRow> {
    this.assertActorTenantMatches(tenantId, actor);
    // Owner D02: restore HER ZAMAN elevated — `makePrimary` değerinden BAĞIMSIZ.
    await this.assertAddressMutationAllowed(tenantId, actor, { operation: 'RESTORE' });
    const address = await this.findAddressInClient(tenantId, clientId, addressId);

    return this.prisma.$transaction(async (tx) => {
      const siblings = await tx.clientAddress.findMany({
        where: { clientId: address.clientId },
        select: LIFECYCLE_SIBLING_SELECT,
      });
      const target = siblings.find((s) => s.id === addressId);
      if (!target) throw new NotFoundException('Adres bulunamadı');

      // Zaten güncel → SABİT HATA (archive ile simetrik gerekçe).
      if (target.isCurrent) {
        throw new BadRequestException({
          code: 'CLIENT_ADDRESS_ALREADY_CURRENT',
          message: 'Bu adres zaten güncel — arşivde değil.',
        });
      }

      const otherCurrent = siblings.filter((s) => s.isCurrent && s.id !== addressId);
      const willBePrimary = dto.makePrimary === true || otherCurrent.length === 0;
      const displaced = willBePrimary
        ? siblings.find((s) => s.isCurrent && s.isPrimary && s.id !== addressId)
        : undefined;

      // Yazma SONRASI beklenen küme. Birinciliği YALNIZ güncel satırlardan düşürürüz: arşivli bir
      // satır (geçersiz legacy veri nedeniyle) birincil görünüyorsa SESSİZCE DÜZELTİLMEZ —
      // öngörülen küme invariant'ı ihlal eder ve işlem fail-closed reddedilir.
      const prospective: ClientAddressLifecycleRow[] = siblings.map((s) => {
        if (s.id === addressId) return { ...s, isCurrent: true, isPrimary: willBePrimary };
        return willBePrimary && s.isCurrent ? { ...s, isPrimary: false } : s;
      });
      this.assertLifecycle(address.clientId, prospective);

      if (willBePrimary) {
        // D04: tenant-scoped parent ilişkisine bağlı.
        await tx.clientAddress.updateMany({
          where: { clientId: address.clientId, isPrimary: true, client: { tenantId } },
          data: { isPrimary: false },
        });
      }

      // D04: geri alma yazımı tenant-scoped + arşivli DURUMA koşullu; `count===0` → sonraki
      // hiçbir yazma ve audit üretilmez.
      const { count } = await tx.clientAddress.updateMany({
        where: { id: addressId, clientId: address.clientId, client: { tenantId }, isCurrent: false },
        data: { isCurrent: true, isPrimary: willBePrimary },
      });
      if (count === 0) throw new NotFoundException('Adres bulunamadı');
      const restored = await tx.clientAddress.findFirstOrThrow({
        where: { id: addressId, client: { tenantId } },
        select: ADDRESS_ROW_SELECT,
      });

      if (displaced) {
        await this.audit.logInTransaction(tx, {
          tenantId,
          action: 'CLIENT_ADDRESS_PRIMARY_REASSIGN',
          entityType: 'CLIENT_ADDRESS',
          entityId: addressId,
          userId: actor?.userId,
          oldValues: { isPrimary: false, isCurrent: false },
          newValues: { isPrimary: true, isCurrent: true },
          metadata: {
            clientId: address.clientId,
            previousPrimaryAddressId: displaced.id,
            reason: 'RESTORED_AS_PRIMARY',
          },
        });
      }

      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CLIENT_ADDRESS_RESTORE',
        entityType: 'CLIENT_ADDRESS',
        entityId: addressId,
        userId: actor?.userId,
        oldValues: { isPrimary: target.isPrimary, isCurrent: false },
        newValues: { isPrimary: willBePrimary, isCurrent: true },
        metadata: {
          clientId: address.clientId,
          becamePrimary: willBePrimary,
          primaryForcedBySoleCurrent: otherCurrent.length === 0,
          previousPrimaryAddressId: displaced?.id ?? null,
        },
      });

      return restored;
    });
  }

  /// <remarks>
  /// Cagrildigi yerler:
  /// - ClientAddressController.remove() -> DELETE /clients/:clientId/addresses/:addressId (JWT-only, tenant+client-scoped)
  /// </remarks>
  ///
  /// I02 DAVRANIŞ DEĞİŞİKLİĞİ — FİZİKSEL SİLME FAIL-CLOSED (charter §49.4 + §49.9 POL-E):
  ///
  ///   fiziksel silme : FAIL-CLOSED
  ///   fiziksel silme, arsivin YERINE KULLANILAMAZ
  ///   hard delete    : POL-E on kosullari acikca karsilanana kadar YETKISIZ
  ///
  /// POL-E'nin sekiz ön koşulu (record-family owner · terminal event · retention basis · evidence
  /// dependency · cross-domain dependency · hold status · reference integrity · authorized deletion
  /// method) runtime'da HİÇ TEMSİL EDİLMEMİŞTİR. Temsil edilmeyen bir koşul "karşılanmış"
  /// SAYILAMAZ — dolayısıyla arşivli satır dahil HİÇBİR adres fiziksel olarak silinemez.
  ///
  /// DELETE, arşivlemeye SESSİZCE ÇEVRİLMEZ (owner §7): arşivleme açık bir aksiyondur ve kendi
  /// audit kaydını yazar; bir silme isteğini arşive dönüştürmek çağıranın niyetini varsaymak olur.
  ///
  /// Bu, I01'de "aynen korunan" `CLIENT_ADDRESS_PRIMARY_DELETE_FORBIDDEN` reddinin YERİNİ ALIR:
  /// artık yalnız birincil değil, HER adres için silme reddedilir. Birincil adresin silinememesi
  /// KORUNUR (daha geniş bir reddin içinde), fakat dönen kod artık fiziksel-silme kodudur.
  async remove(tenantId: string, clientId: string, addressId: string): Promise<never> {
    // Yetkilendirme okuması ÖNCE: var olmayan/başka müvekkilin adresi için 404 sözleşmesi
    // DEĞİŞMEDİ — kapsam-dışı kimliğe "silinemez" demek varlık sızdırırdı.
    await this.findAddressInClient(tenantId, clientId, addressId);

    // Mutasyon YOK → transaction YOK. Audit da YOK: reddedilen bir istek adres yaşam döngüsünü
    // DEĞİŞTİRMEZ, dolayısıyla lifecycle audit kaydı üretmez (audit yalnız archive/restore için
    // ZORUNLUdur, §49.4).
    throw new BadRequestException({
      code: 'CLIENT_ADDRESS_PHYSICAL_DELETE_NOT_AUTHORIZED',
      message:
        'Adresler fiziksel olarak silinemez. Adresi kullanımdan çıkarmak için arşivleme aksiyonunu kullanın.',
      unsatisfiedPolicy: 'POL-E',
      archiveAction: 'POST /clients/:clientId/addresses/:addressId/archive',
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
