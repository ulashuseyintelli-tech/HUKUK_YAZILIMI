import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ExecutionOfficeService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string, city?: string) {
    const where: any = { tenantId, isActive: true };
    if (city) where.city = city;

    return this.prisma.executionOffice.findMany({
      where,
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(tenantId: string, id: string) {
    return this.prisma.executionOffice.findFirst({
      where: { id, tenantId },
    });
  }

  async getCities(tenantId: string) {
    const offices = await this.prisma.executionOffice.findMany({
      where: { tenantId, isActive: true },
      select: { city: true },
      distinct: ['city'],
      orderBy: { city: 'asc' },
    });
    return offices.map((o) => o.city);
  }

  async create(tenantId: string, data: any) {
    return this.prisma.executionOffice.create({
      data: {
        tenantId,
        name: data.name,
        city: data.city,
        district: data.district,
        officeCode: data.officeCode,
        uyapCode: data.uyapCode,
        taxNumber: data.taxNumber,
        bankName: data.bankName,
        branchName: data.branchName,
        iban: data.iban,
        address: data.address,
        phone: data.phone,
        fax: data.fax,
      },
    });
  }

  /**
   * Tenant-scoped icra dairesi guncellemesi. Request sahiplik/sistem alanlarini
   * tasiyamaz; updateMany predicate'i hedefi atomik olarak id + trusted tenantId
   * ile sinirlar, boylece read-before-write/TOCTOU araligi olusmaz.
   *
   * Cagrildigi yerler:
   * - ExecutionOfficeController.update() -> PUT /execution-offices/:id
   */
  async update(tenantId: string, id: string, data: any) {
    const updateData = {
      name: data.name,
      city: data.city,
      district: data.district,
      officeCode: data.officeCode,
      uyapCode: data.uyapCode,
      taxNumber: data.taxNumber,
      bankName: data.bankName,
      branchName: data.branchName,
      iban: data.iban,
      ibanHarc: data.ibanHarc,
      ibanCezaevi: data.ibanCezaevi,
      address: data.address,
      phone: data.phone,
      fax: data.fax,
    };
    if (Object.values(updateData).every((value) => value === undefined)) {
      throw new BadRequestException('Guncellenecek izinli bir icra dairesi alani bulunamadi.');
    }

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.executionOffice.updateMany({
        where: { id, tenantId },
        data: updateData,
      });
      if (count === 0) {
        throw new NotFoundException('Icra dairesi bulunamadi.');
      }
      return tx.executionOffice.findFirstOrThrow({
        where: { id, tenantId },
      });
    });
  }

  // Seed default offices
  async seedDefaultOffices(tenantId: string) {
    const defaultOffices = [
      { name: 'İstanbul 1. İcra Dairesi', city: 'İstanbul', district: 'Çağlayan', uyapCode: '1001' },
      { name: 'İstanbul 2. İcra Dairesi', city: 'İstanbul', district: 'Çağlayan', uyapCode: '1002' },
      { name: 'İstanbul 3. İcra Dairesi', city: 'İstanbul', district: 'Çağlayan', uyapCode: '1003' },
      { name: 'Ankara 1. İcra Dairesi', city: 'Ankara', district: 'Merkez', uyapCode: '2001' },
      { name: 'Ankara 2. İcra Dairesi', city: 'Ankara', district: 'Merkez', uyapCode: '2002' },
      { name: 'İzmir 1. İcra Dairesi', city: 'İzmir', district: 'Konak', uyapCode: '3001' },
      { name: 'İzmir 2. İcra Dairesi', city: 'İzmir', district: 'Konak', uyapCode: '3002' },
      { name: 'Bursa 1. İcra Dairesi', city: 'Bursa', district: 'Osmangazi', uyapCode: '4001' },
      { name: 'Antalya 1. İcra Dairesi', city: 'Antalya', district: 'Muratpaşa', uyapCode: '5001' },
      { name: 'Adana 1. İcra Dairesi', city: 'Adana', district: 'Seyhan', uyapCode: '6001' },
    ];

    for (const office of defaultOffices) {
      const exists = await this.prisma.executionOffice.findFirst({
        where: { tenantId, name: office.name },
      });
      if (!exists) {
        await this.create(tenantId, office);
      }
    }
  }
}
