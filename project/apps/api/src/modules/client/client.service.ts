import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { buildClientFieldDiff, buildContactsDiff, buildClientRemoveSnapshot } from './client-audit.util';
import { assertCreateIdentityChecksum } from './client-identity-checksum.util';

/** C0-a: audit actor — YALNIZ auth context'ten (req.user.id); body/data'dan ASLA türetilmez. */
export interface AuditActor {
  userId?: string;
}

// ── Operasyonel iletişim eksiği takibi (PR-1, saf yardımcılar) ──

export const CONTACT_TASK_DEDUPE_PREFIX = 'OPCOMP:CONTACT:';

/** Müvekkil için contact-task dedupe anahtarı (tek aktif görev garantisi). */
export function contactTaskDedupeKey(clientId: string): string {
  return `${CONTACT_TASK_DEDUPE_PREFIX}${clientId}`;
}

/**
 * Müvekkilde eksik iletişim alanlarını hesaplar. PR-1: yalnız telefon + e-posta.
 * Generic dizi döner → ileride IBAN/vergi levhası/kimlik aynı makineyle eklenebilir (yeni tablo yok).
 */
export function computeMissingContactFields(client: { phone?: string | null; email?: string | null }): string[] {
  const missing: string[] = [];
  if (!client.phone || !String(client.phone).trim()) missing.push('phone');
  if (!client.email || !String(client.email).trim()) missing.push('email');
  return missing;
}

@Injectable()
export class ClientService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // Tüm müvekkilleri listele
  async findAll(tenantId: string, type?: string) {
    const clients = await this.prisma.client.findMany({
      where: { 
        tenantId, 
        isActive: true,
        ...(type && { type: type as any })
      },
      include: {
        contacts: true,
        // FIX B (PR-1): Vekalet sütunu için aktif vekaletleri getir (liste eskiden POA join etmiyordu
        // → sütun daima "+Ekle" gösteriyordu, aktif vekaleti olan müvekkilde bile).
        powerOfAttorneys: { where: { isActive: true }, orderBy: { createdAt: 'desc' } },
        _count: {
          select: { cases: true }
        }
      },
      orderBy: [{ createdAt: 'desc' }],
    });
    console.log(`[ClientService] Found ${clients.length} clients for tenant ${tenantId}`);
    return clients;
  }

  // Tek müvekkil getir
  // Task 4A (owner-locked karar #2): findOne VARSAYILAN olarak soft-deleted (isActive:false)
  // DÖNDÜRMEZ → GET /clients/:id arşivlenmiş müvekkili göstermez (findAll ile tutarlı). İç çağıranlar
  // (create reactivate dönüşü, update dönüşü) mutasyon sonrası kaydı her durumda almak için
  // includeInactive:true geçer → mevcut davranış korunur. Tek dış çağıran = ClientController GET (default).
  async findOne(id: string, tenantId: string, opts: { includeInactive?: boolean } = {}) {
    return this.prisma.client.findFirst({
      where: { id, tenantId, ...(opts.includeInactive ? {} : { isActive: true }) },
      include: {
        contacts: true,
        bankAccounts: true,
        powerOfAttorneys: true,
      },
    });
  }

  // Yeni müvekkil oluştur
  async create(tenantId: string, data: any, actor?: AuditActor) {
    // TCKN veya VKN ile duplicate kontrolü
    const identityNo = data.tckn || data.vkn;
    if (identityNo) {
      const existing = await this.prisma.client.findFirst({
        where: {
          tenantId,
          OR: [
            { tckn: identityNo },
            { vkn: identityNo },
            { identityNo: identityNo },
          ],
        },
      });
      
      if (existing) {
        // FIX A (PR-1): duplicate eşleşme SOFT-DELETED ise GERİ GETİR (reactivate).
        // Silme = soft-delete (isActive=false). Silinmiş müvekkili yeniden ekleme/yeniden tarama
        // eskiden kaydı isActive=false bırakıyordu → findAll (isActive=true) gizliyordu (vekaletleri olsa da).
        const wasReactivated = existing.isActive === false;
        if (wasReactivated) {
          // C0-a: reaktivasyon mutation + audit AYNI transaction; CLIENT_CREATE'ten ayrı action.
          await this.prisma.$transaction(async (tx) => {
            await tx.client.update({ where: { id: existing.id }, data: { isActive: true } });
            await this.audit.logInTransaction(tx, {
              tenantId,
              action: 'CLIENT_REACTIVATE',
              entityType: 'CLIENT',
              entityId: existing.id,
              userId: actor?.userId,
              metadata: { reactivatedFromDedupe: true },
            });
          });
          console.log(`[ClientService] Soft-deleted müvekkil reaktive edildi: ${existing.id} (${existing.displayName})`);
        } else {
          console.log(`[ClientService] Duplicate müvekkil bulundu: ${existing.id} (${existing.displayName})`);
        }
        // PR-AUDIT-1: duplicate'te SESSİZ döndürme yerine UX sinyali (POA deseni). Transient alanlar
        // (persist EDİLMEZ, kontrat bozulmaz) → frontend "zaten kayıtlı / geri getirildi" bildirir.
        // includeInactive: dedup hedefi (reactivate edilmemiş duplicate) soft-deleted olabilir;
        // mutasyon-sonrası dönüş davranışı korunur (Task 4A findOne default-exclude'dan etkilenmez).
        const result = await this.findOne(existing.id, tenantId, { includeInactive: true });
        return { ...(result as any), _existingReturned: true, _reactivated: wasReactivated };
      }
    }

    // Task A/Faz 1 (owner-locked 2026-06-30): GERÇEKTEN YENİ kayıt için TCKN/VKN mod-10/11 checksum zorunlu.
    // Dedup/reactivate'TEN SONRA → legacy (geçersiz-checksum) müvekkilin yeniden-eklenmesi/reactivate'i
    // KİLİTLENMEZ (eski veri dokunulmaz). Domain katmanı → tüm create yolları (modal·cases/new·Excel·seed)
    // tutarlı. update() ETKİLENMEZ (Faz 4). Boş kimlik serbest; identityNo doğrulanmaz (util'e bkz).
    assertCreateIdentityChecksum(data);

    const displayName = data.type === 'COMPANY' || data.type === 'PUBLIC'
      ? data.companyName
      : `${data.firstName || ''} ${data.lastName || ''}`.trim();

    // Birincil telefon ve email (geriye uyumluluk)
    const primaryPhone = data.phones?.find((p: any) => p.isPrimary)?.value || data.phones?.[0]?.value || data.phone;
    const primaryEmail = data.emails?.find((e: any) => e.isPrimary)?.value || data.emails?.[0]?.value || data.email;
    
    // Birincil adres
    const primaryAddress = data.addresses?.find((a: any) => a.isPrimary) || data.addresses?.[0];
    const addressStr = primaryAddress 
      ? [primaryAddress.street, primaryAddress.district, primaryAddress.city].filter(Boolean).join(', ')
      : [data.address, data.district, data.city].filter(Boolean).join(', ') || undefined;

    // C0-a: client + contact yazımı + audit AYNI transaction (audit yazılamazsa create rollback).
    const client = await this.prisma.$transaction(async (tx) => {
      const createdClient = await tx.client.create({
      data: {
        tenantId,
        type: data.type || 'PERSON',
        displayName: displayName,
        name: displayName || data.name,
        firstName: data.firstName,
        lastName: data.lastName,
        tckn: data.tckn,
        companyName: data.companyName,
        vkn: data.vkn,
        identityNo: data.tckn || data.vkn || data.identityNo,
        taxOffice: data.taxOffice,
        email: primaryEmail,
        phone: primaryPhone,
        address: addressStr,
        city: primaryAddress?.city || data.city,
        district: primaryAddress?.district || data.district,
        region: primaryAddress?.region || data.region,
        // RFA-017: mevcut Client kolonları (additive). Önceden map'lenmiyordu → Excel import
        // (ve normal create) bu alanları sessizce DÜŞÜRÜYORDU. Yeni kolon/migration YOK.
        postalCode: data.postalCode,
        isForeigner: data.isForeigner ?? undefined,
        nationality: data.nationality,
        companyType: data.companyType,
        mersisNo: data.mersisNo,
        ticaretSicilNo: data.ticaretSicilNo,
        // P0.7: gender (Excel import row 5 gönderiyor) + detsisNo create'te map'lenmiyordu → sessiz veri kaybı.
        gender: data.gender,
        detsisNo: data.detsisNo,
        canCollect: data.canCollect ?? true,
        canWaive: data.canWaive ?? false,
        canSettle: data.canSettle ?? false,
        canRelease: data.canRelease ?? false,
        notes: data.notes,
        // Tebrik alanları
        birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
        foundingDate: data.foundingDate ? new Date(data.foundingDate) : undefined,
        poaStartDate: data.poaStartDate ? new Date(data.poaStartDate) : undefined,
        sendBirthdayGreeting: data.sendBirthdayGreeting ?? true,
        sendAnniversaryGreeting: data.sendAnniversaryGreeting ?? true,
        sendHolidayGreeting: data.sendHolidayGreeting ?? true,
        greetingChannel: data.greetingChannel || 'EMAIL',
      },
    });

    // Çoklu telefon kaydet
    if (data.phones?.length > 0) {
      await tx.clientContact.createMany({
        data: data.phones.map((p: any, idx: number) => ({
          clientId: createdClient.id,
          type: p.type || 'MOBILE',
          value: p.value,
          label: p.label,
          isPrimary: p.isPrimary || idx === 0,
        })),
      });
    }

    // Çoklu email kaydet
    if (data.emails?.length > 0) {
      await tx.clientContact.createMany({
        data: data.emails.map((e: any, idx: number) => ({
          clientId: createdClient.id,
          type: 'EMAIL',
          value: e.value,
          label: e.label,
          isPrimary: e.isPrimary || idx === 0,
        })),
      });
    }

      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CLIENT_CREATE',
        entityType: 'CLIENT',
        entityId: createdClient.id,
        userId: actor?.userId,
        metadata: {
          fieldDiff: buildClientFieldDiff(null, createdClient),
          contactsDiff: buildContactsDiff([], data.phones, data.emails),
        },
      });

      return createdClient;
    });

    // PR-1: operasyonel iletişim eksiği görevini senkronla (YAN ETKİ → transaction DIŞINDA)
    await this.syncContactFollowUpTaskSafe(tenantId, {
      id: client.id,
      phone: primaryPhone,
      email: primaryEmail,
      contactFollowUpStatus: null,
    });

    return this.findOne(client.id, tenantId, { includeInactive: true });
  }

  // Müvekkil güncelle
  async update(id: string, tenantId: string, data: any, actor?: AuditActor) {
    // C0-a (acceptance #2): contacts diff için old snapshot CONTACTS ile alınır.
    const existing = await this.prisma.client.findFirst({
      where: { id, tenantId },
      include: { contacts: true },
    });
    if (!existing) throw new NotFoundException('Müvekkil bulunamadı');

    // PR-U4: UPDATE-PATH kimlik-block (önce guard YOKTU). Müvekkilde TCKN zorunlu/kesin ayrıştırıcı →
    // isim-review YOK (false-positive riski); yalnız kesin kimlik (TCKN/VKN) collision block.
    // Self (id) HARİÇ, yalnız AKTİF kayıtlar, yalnız kimlik GERÇEKTEN değişince.
    const tcknChanged = data.tckn !== undefined && data.tckn !== existing.tckn;
    const vknChanged = data.vkn !== undefined && data.vkn !== existing.vkn;
    if (tcknChanged || vknChanged) {
      const orConds: any[] = [];
      if (data.tckn) orConds.push({ tckn: data.tckn }, { identityNo: data.tckn });
      if (data.vkn) orConds.push({ vkn: data.vkn }, { identityNo: data.vkn });
      if (orConds.length > 0) {
        const dup = await this.prisma.client.findFirst({
          where: { tenantId, isActive: true, id: { not: id }, OR: orConds },
        });
        if (dup) {
          throw new ConflictException({
            code: 'DUPLICATE_IDENTITY',
            message: 'Bu kimlik numarasına sahip başka bir müvekkil mevcut',
            existingClient: { id: dup.id, name: (dup as any).displayName || (dup as any).name },
          });
        }
      }
    }

    const displayName = data.type === 'COMPANY' || data.type === 'PUBLIC'
      ? data.companyName
      : `${data.firstName || ''} ${data.lastName || ''}`.trim();

    // Birincil telefon ve email
    const primaryPhone = data.phones?.find((p: any) => p.isPrimary)?.value || data.phones?.[0]?.value || data.phone;
    const primaryEmail = data.emails?.find((e: any) => e.isPrimary)?.value || data.emails?.[0]?.value || data.email;
    
    // Birincil adres
    const primaryAddress = data.addresses?.find((a: any) => a.isPrimary) || data.addresses?.[0];
    const addressStr = primaryAddress 
      ? [primaryAddress.street, primaryAddress.district, primaryAddress.city].filter(Boolean).join(', ')
      : [data.address, data.district, data.city].filter(Boolean).join(', ') || undefined;

    // C0-a: client + contact yazımı + audit AYNI transaction.
    await this.prisma.$transaction(async (tx) => {
      // P0.5: tenant-scoped write — update() whereUnique tenantId taşıyamaz; updateMany {id,tenantId} guard.
      const { count } = await tx.client.updateMany({
      where: { id, tenantId },
      data: {
        type: data.type,
        displayName: displayName,
        name: displayName || data.name || existing.name,
        firstName: data.firstName,
        lastName: data.lastName,
        tckn: data.tckn,
        companyName: data.companyName,
        vkn: data.vkn,
        identityNo: data.tckn || data.vkn || data.identityNo,
        taxOffice: data.taxOffice,
        email: primaryEmail,
        phone: primaryPhone,
        address: addressStr,
        city: primaryAddress?.city || data.city,
        district: primaryAddress?.district || data.district,
        region: primaryAddress?.region || data.region,
        canCollect: data.canCollect,
        canWaive: data.canWaive,
        canSettle: data.canSettle,
        canRelease: data.canRelease,
        notes: data.notes,
        isActive: data.isActive,
        // P0.7: create paritesi — create'te map'lenip update'te DÜŞEN alanlar (sessiz veri kaybı önlenir).
        postalCode: data.postalCode,
        isForeigner: data.isForeigner ?? undefined,
        nationality: data.nationality,
        companyType: data.companyType,
        mersisNo: data.mersisNo,
        ticaretSicilNo: data.ticaretSicilNo,
        gender: data.gender,
        detsisNo: data.detsisNo,
        // Tebrik alanları
        birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
        foundingDate: data.foundingDate ? new Date(data.foundingDate) : undefined,
        poaStartDate: data.poaStartDate ? new Date(data.poaStartDate) : undefined,
        sendBirthdayGreeting: data.sendBirthdayGreeting,
        sendAnniversaryGreeting: data.sendAnniversaryGreeting,
        sendHolidayGreeting: data.sendHolidayGreeting,
        greetingChannel: data.greetingChannel,
      },
    });
      if (count === 0) throw new NotFoundException('Müvekkil bulunamadı');
      const updated = await tx.client.findFirst({ where: { id, tenantId } });
      if (!updated) throw new NotFoundException('Müvekkil bulunamadı');

    // Contacts güncelle (sil ve yeniden oluştur)
    if (data.phones || data.emails) {
      await tx.clientContact.deleteMany({ where: { clientId: id } });
      
      const contacts: any[] = [];
      if (data.phones?.length > 0) {
        data.phones.forEach((p: any, idx: number) => {
          contacts.push({
            clientId: id,
            type: p.type || 'MOBILE',
            value: p.value,
            label: p.label,
            isPrimary: p.isPrimary || idx === 0,
          });
        });
      }
      if (data.emails?.length > 0) {
        data.emails.forEach((e: any, idx: number) => {
          contacts.push({
            clientId: id,
            type: 'EMAIL',
            value: e.value,
            label: e.label,
            isPrimary: e.isPrimary || idx === 0,
          });
        });
      }
      if (contacts.length > 0) {
        await tx.clientContact.createMany({ data: contacts });
      }
    }

      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CLIENT_UPDATE',
        entityType: 'CLIENT',
        entityId: id,
        userId: actor?.userId,
        metadata: {
          fieldDiff: buildClientFieldDiff(existing, updated),
          contactsDiff: (data.phones || data.emails)
            ? buildContactsDiff((existing as any).contacts, data.phones, data.emails)
            : { changed: false },
        },
      });
    });

    // PR-1: operasyonel iletişim eksiği görevini senkronla (WAIVED kararı 'existing'ten gelir)
    await this.syncContactFollowUpTaskSafe(tenantId, {
      id,
      phone: primaryPhone,
      email: primaryEmail,
      contactFollowUpStatus: (existing as any).contactFollowUpStatus ?? null,
    });

    // includeInactive: update isActive:false yapmış olabilir (arşivleme); güncellenen kaydı yine döndür.
    return this.findOne(id, tenantId, { includeInactive: true });
  }

  /**
   * Operasyonel iletişim eksiği görevini müvekkilin GERÇEK alan durumuna göre senkronlar.
   * Hata client akışını BOZMAZ (safe wrapper).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientService.create() → vekalet "Bilgileri Kullan" + Manuel Ekle (POST /clients)
   * - ClientService.update() → müvekkil düzenleme (PUT /clients/:id)
   * NOT: Excel import (prisma.client.create, service bypass) çağırmaz (bilinçli).
   * </remarks>
   */
  private async syncContactFollowUpTaskSafe(
    tenantId: string,
    client: { id: string; phone?: string | null; email?: string | null; contactFollowUpStatus?: string | null }
  ): Promise<void> {
    try {
      await this.syncContactFollowUpTask(tenantId, client);
    } catch (e: any) {
      console.error(`[ClientService] contact follow-up sync hatası (client ${client.id}): ${e?.message}`);
    }
  }

  private async syncContactFollowUpTask(
    tenantId: string,
    client: { id: string; phone?: string | null; email?: string | null; contactFollowUpStatus?: string | null }
  ): Promise<void> {
    const dedupeKey = contactTaskDedupeKey(client.id);
    const existing = await this.prisma.task.findUnique({ where: { dedupeKey } });

    // WAIVED: kalıcı karar → görev üretme; açık görev varsa iptal et.
    if (client.contactFollowUpStatus === 'WAIVED') {
      if (existing && existing.status !== 'CANCELLED' && existing.status !== 'COMPLETED') {
        await this.prisma.task.update({ where: { id: existing.id }, data: { status: 'CANCELLED' } });
      }
      return;
    }

    const missing = computeMissingContactFields(client);

    // Eksik yok → tamamlandı.
    if (missing.length === 0) {
      if (existing && existing.status !== 'COMPLETED' && existing.status !== 'CANCELLED') {
        await this.prisma.task.update({
          where: { id: existing.id },
          // PR-PERF-1: sistem kapanışı → AUTO_SYSTEM + completedByUserId null (insan kapanışından ayrılır).
          data: { status: 'COMPLETED', completedAt: new Date(), resolutionType: 'AUTO_SYSTEM', completedByUserId: null },
        });
      }
      if (client.contactFollowUpStatus === 'ACTIVE') {
        await this.prisma.client.update({
          where: { id: client.id },
          data: { contactFollowUpStatus: 'COMPLETED' },
        });
      }
      return;
    }

    // Eksik var, WAIVED değil → tek satır upsert (dedupe ile tek aktif görev).
    const now = new Date();
    const due = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // +3 gün SLA
    const description = `Eksik iletişim bilgisi: ${missing.join(', ')}`;
    const reopening = !!existing && (existing.status === 'COMPLETED' || existing.status === 'CANCELLED');

    if (existing) {
      await this.prisma.task.update({
        where: { id: existing.id },
        data: {
          missingFields: missing,
          description,
          // Kapalı görevi yeniden aç + SLA/eskalasyonu sıfırla; açık görevse sadece eksik listesini güncelle.
          // PR-PERF-1: yeniden açılışta eski kapanış izini de temizle (stale atıf bırakmaz).
          ...(reopening
            ? { status: 'PENDING', completedAt: null, completedByUserId: null, resolutionType: null, dueDate: due, escalationLevel: 'STAFF', nextFollowUpAt: due }
            : {}),
        },
      });
    } else {
      await this.prisma.task.create({
        data: {
          tenantId,
          clientId: client.id,
          title: 'Müvekkil iletişim bilgilerini tamamla',
          description,
          status: 'PENDING',
          priority: 'MEDIUM',
          taskCategory: 'OPERATIONAL_COMPLETENESS',
          dedupeKey,
          missingFields: missing,
          dueDate: due,
          escalationLevel: 'STAFF',
          nextFollowUpAt: due,
        },
      });
    }

    if (client.contactFollowUpStatus !== 'ACTIVE') {
      await this.prisma.client.update({
        where: { id: client.id },
        data: { contactFollowUpStatus: 'ACTIVE' },
      });
    }
  }

  /**
   * TEK SEFERLİK BAKIM: özellik canlıya inmeden ÖNCE oluşmuş, iletişim bilgisi eksik
   * müvekkiller için görev/rozet üretir (yeni kayıtlar sync'ten geçiyor; eskiler geçmedi).
   * - WAIVED'a DOKUNMAZ · ACTIVE zaten var · COMPLETED'ı yeniden aktive ETMEZ (şimdilik)
   * - Yalnız contactFollowUpStatus=null & eksik olanlara görev üretir (dedupeKey ile mükerrer yok)
   * Idempotent: tekrar çalıştırmak güvenli.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientController.backfillContactFollowUp() → POST /clients/backfill-contact-followup (admin)
   * </remarks>
   */
  async backfillContactFollowUp(
    tenantId: string
  ): Promise<{ scanned: number; createdOrUpdated: number; skippedWaived: number; alreadyActive: number }> {
    const clients = await this.prisma.client.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, phone: true, email: true, contactFollowUpStatus: true },
    });

    let scanned = 0;
    let createdOrUpdated = 0;
    let skippedWaived = 0;
    let alreadyActive = 0;

    for (const c of clients) {
      scanned++;
      const missing = computeMissingContactFields(c);
      if (missing.length === 0) continue; // tam → dokunma
      if (c.contactFollowUpStatus === 'WAIVED') { skippedWaived++; continue; }
      if (c.contactFollowUpStatus === 'ACTIVE') { alreadyActive++; continue; }
      if (c.contactFollowUpStatus === 'COMPLETED') continue; // şimdilik dokunma
      // status === null & eksik → görev üret + ACTIVE (dedupe'lu)
      await this.syncContactFollowUpTaskSafe(tenantId, {
        id: c.id,
        phone: c.phone,
        email: c.email,
        contactFollowUpStatus: null,
      });
      createdOrUpdated++;
    }

    return { scanned, createdOrUpdated, skippedWaived, alreadyActive };
  }

  // Müvekkil sil (soft delete)
  async remove(id: string, tenantId: string, actor?: AuditActor) {
    const existing = await this.prisma.client.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Müvekkil bulunamadı');
    // C0-a: soft-delete + audit AYNI transaction (old snapshot delete ÖNCESİ alındı).
    return this.prisma.$transaction(async (tx) => {
      // P0.5: tenant-scoped soft-delete (updateMany {id,tenantId}).
      const { count } = await tx.client.updateMany({ where: { id, tenantId }, data: { isActive: false } });
      if (count === 0) throw new NotFoundException('Müvekkil bulunamadı');
      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CLIENT_DELETE',
        entityType: 'CLIENT',
        entityId: id,
        userId: actor?.userId,
        metadata: { softDelete: true, oldSnapshot: buildClientRemoveSnapshot(existing) },
      });
      return { ...existing, isActive: false };
    });
  }

  // Arama
  async search(tenantId: string, query: string) {
    return this.prisma.client.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { identityNo: { contains: query } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { name: 'asc' },
      take: 20,
    });
  }
}
