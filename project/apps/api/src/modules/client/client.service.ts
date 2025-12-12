import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ClientService {
  constructor(private prisma: PrismaService) {}

  // Tüm müvekkilleri listele
  async findAll(tenantId: string, type?: string) {
    return this.prisma.client.findMany({
      where: { 
        tenantId, 
        isActive: true,
        ...(type && { type: type as any })
      },
      include: {
        contacts: true,
        _count: {
          select: { cases: true }
        }
      },
      orderBy: [{ name: 'asc' }],
    });
  }

  // Tek müvekkil getir
  async findOne(id: string, tenantId: string) {
    return this.prisma.client.findFirst({
      where: { id, tenantId },
      include: {
        contacts: true,
        bankAccounts: true,
        powerOfAttorneys: true,
      },
    });
  }

  // Yeni müvekkil oluştur
  async create(tenantId: string, data: any) {
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

    const client = await this.prisma.client.create({
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
      await this.prisma.clientContact.createMany({
        data: data.phones.map((p: any, idx: number) => ({
          clientId: client.id,
          type: p.type || 'MOBILE',
          value: p.value,
          label: p.label,
          isPrimary: p.isPrimary || idx === 0,
        })),
      });
    }

    // Çoklu email kaydet
    if (data.emails?.length > 0) {
      await this.prisma.clientContact.createMany({
        data: data.emails.map((e: any, idx: number) => ({
          clientId: client.id,
          type: 'EMAIL',
          value: e.value,
          label: e.label,
          isPrimary: e.isPrimary || idx === 0,
        })),
      });
    }

    return this.findOne(client.id, tenantId);
  }

  // Müvekkil güncelle
  async update(id: string, tenantId: string, data: any) {
    const existing = await this.prisma.client.findFirst({ where: { id, tenantId } });
    if (!existing) throw new Error('Müvekkil bulunamadı');

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

    await this.prisma.client.update({
      where: { id },
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

    // Contacts güncelle (sil ve yeniden oluştur)
    if (data.phones || data.emails) {
      await this.prisma.clientContact.deleteMany({ where: { clientId: id } });
      
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
        await this.prisma.clientContact.createMany({ data: contacts });
      }
    }

    return this.findOne(id, tenantId);
  }

  // Müvekkil sil (soft delete)
  async remove(id: string, tenantId: string) {
    const existing = await this.prisma.client.findFirst({ where: { id, tenantId } });
    if (!existing) throw new Error('Müvekkil bulunamadı');
    return this.prisma.client.update({ where: { id }, data: { isActive: false } });
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
