import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(private prisma: PrismaService) {}

  async seedAll(tenantId: string) {
    this.logger.log('Tüm seed verileri oluşturuluyor...');
    const results = {
      office: await this.seedOffice(tenantId),
      bankAccounts: await this.seedBankAccounts(tenantId),
      lookups: await this.seedLookups(tenantId),
      lawyers: await this.seedLawyers(tenantId),
      staff: await this.seedStaff(tenantId),
      clients: await this.seedClients(tenantId),
      debtors: await this.seedDebtors(tenantId),
      executionOffices: await this.seedExecutionOffices(tenantId),
      cases: await this.seedCases(tenantId),
    };
    return { success: true, message: 'Tüm veriler oluşturuldu', results };
  }

  async getDataStatus(tenantId: string) {
    const [lawyers, clients, debtors, cases, offices, staff, lookups] = await Promise.all([
      this.prisma.lawyer.count({ where: { tenantId } }),
      this.prisma.client.count({ where: { tenantId } }),
      this.prisma.debtor.count({ where: { tenantId } }),
      this.prisma.case.count({ where: { tenantId } }),
      this.prisma.executionOffice.count({ where: { tenantId } }),
      this.prisma.staffMember.count({ where: { tenantId } }),
      this.prisma.lookupTakipTuru.count({ where: { tenantId } }),
    ]);
    return { lawyers, clients, debtors, cases, offices, staff, lookups };
  }

  async seedLookups(tenantId: string) {
    let created = 0;
    // Takip Türleri
    const takipTurleri = [
      { code: 'ILAMSIZ_GENEL', name: 'İlamsız Genel Haciz', sortOrder: 1 },
      { code: 'ILAMSIZ_KAMBIYO', name: 'İlamsız Kambiyo', sortOrder: 2 },
      { code: 'ILAMLI', name: 'İlamlı İcra', sortOrder: 3 },
      { code: 'NAFAKA', name: 'Nafaka', sortOrder: 4 },
      { code: 'KIRA', name: 'Kira Alacağı', sortOrder: 5 },
      { code: 'REHIN', name: 'Rehin', sortOrder: 6 },
      { code: 'IPOTEKLI', name: 'İpotekli', sortOrder: 7 },
      { code: 'IFLAS', name: 'İflas', sortOrder: 8 },
    ];

    for (const item of takipTurleri) {
      const exists = await this.prisma.lookupTakipTuru.findFirst({ where: { tenantId, code: item.code } });
      if (!exists) {
        await this.prisma.lookupTakipTuru.create({ data: { tenantId, ...item } });
        created++;
      }
    }
    // Risk Seviyeleri
    const riskler = [
      { code: 'DUSUK', name: 'Düşük', color: '#22c55e', sortOrder: 1 },
      { code: 'ORTA', name: 'Orta', color: '#eab308', sortOrder: 2 },
      { code: 'YUKSEK', name: 'Yüksek', color: '#ef4444', sortOrder: 3 },
    ];
    for (const item of riskler) {
      const exists = await this.prisma.lookupRisk.findFirst({ where: { tenantId, code: item.code } });
      if (!exists) {
        await this.prisma.lookupRisk.create({ data: { tenantId, ...item } });
        created++;
      }
    }
    // Aşamalar
    const asamalar = [
      { code: 'DOSYA_ACILDI', name: 'Dosya Açıldı', sortOrder: 1 },
      { code: 'TEBLIG', name: 'Tebligat', sortOrder: 2 },
      { code: 'HACIZ_TALEP', name: 'Haciz Talebi', sortOrder: 3 },
      { code: 'HACIZ', name: 'Haciz', sortOrder: 4 },
      { code: 'SATIS', name: 'Satış', sortOrder: 5 },
      { code: 'TAHSILAT', name: 'Tahsilat', sortOrder: 6 },
      { code: 'KAPALI', name: 'Kapalı', sortOrder: 7 },
    ];
    for (const item of asamalar) {
      const exists = await this.prisma.lookupAsama.findFirst({ where: { tenantId, code: item.code } });
      if (!exists) {
        await this.prisma.lookupAsama.create({ data: { tenantId, ...item } });
        created++;
      }
    }
    // Durum Etiketleri
    const durumlar = [
      { code: 'MASRAF_BEKLIYOR', name: 'Masraf Bekliyor', color: '#f59e0b', sortOrder: 1 },
      { code: 'ADRES_ARASTIRMA', name: 'Adres Araştırma', color: '#3b82f6', sortOrder: 2 },
      { code: 'TEBLIG_BEKLIYOR', name: 'Tebligat Bekliyor', color: '#8b5cf6', sortOrder: 3 },
      { code: 'HACIZ_BEKLIYOR', name: 'Haciz Bekliyor', color: '#ec4899', sortOrder: 4 },
      { code: 'ODEME_PLANI', name: 'Ödeme Planı', color: '#10b981', sortOrder: 5 },
    ];
    for (const item of durumlar) {
      const exists = await this.prisma.lookupDurumEtiketi.findFirst({ where: { tenantId, code: item.code } });
      if (!exists) {
        await this.prisma.lookupDurumEtiketi.create({ data: { tenantId, ...item } });
        created++;
      }
    }
    // Borçlu Tipleri
    const borcluTipleri = [
      { code: 'GERCEK_KISI', name: 'Gerçek Kişi', sortOrder: 1 },
      { code: 'TUZEL_KISI', name: 'Tüzel Kişi', sortOrder: 2 },
      { code: 'KAMU', name: 'Kamu Kurumu', sortOrder: 3 },
    ];
    for (const item of borcluTipleri) {
      const exists = await this.prisma.lookupBorcluTipi.findFirst({ where: { tenantId, code: item.code } });
      if (!exists) {
        await this.prisma.lookupBorcluTipi.create({ data: { tenantId, ...item } });
        created++;
      }
    }
    return { created, message: `${created} lookup kaydı oluşturuldu` };
  }


  async seedOffice(tenantId: string) {
    const exists = await this.prisma.office.findFirst({ where: { tenantId } });
    if (exists) {
      // Mevcut ofisi güncelle
      await this.prisma.office.update({
        where: { id: exists.id },
        data: {
          name: exists.name || 'Demo Hukuk Bürosu',
          address: exists.address || 'Levent Mah. Büyükdere Cad. No:123 Kat:5',
          city: exists.city || 'İstanbul',
          district: exists.district || 'Beşiktaş',
          phone: exists.phone || '0212 123 45 67',
          email: exists.email || 'info@demohukuk.com',
          barAssociation: exists.barAssociation || 'İstanbul Barosu',
        },
      });
      return { created: 0, updated: 1, message: 'Büro bilgileri güncellendi' };
    }
    await this.prisma.office.create({
      data: {
        tenantId,
        name: 'Demo Hukuk Bürosu',
        address: 'Levent Mah. Büyükdere Cad. No:123 Kat:5',
        city: 'İstanbul',
        district: 'Beşiktaş',
        phone: '0212 123 45 67',
        email: 'info@demohukuk.com',
        barAssociation: 'İstanbul Barosu',
      },
    });
    return { created: 1, message: 'Büro bilgileri oluşturuldu' };
  }

  async seedBankAccounts(tenantId: string) {
    const office = await this.prisma.office.findFirst({ where: { tenantId } });
    if (!office) return { created: 0, message: 'Önce büro bilgisi oluşturun' };

    const accounts = [
      { bankName: 'Ziraat Bankası', branchName: 'Levent Şubesi', iban: 'TR12 0001 0012 3456 7890 1234 56', accountName: 'Demo Hukuk Bürosu', isDefault: true },
      { bankName: 'İş Bankası', branchName: 'Beşiktaş Şubesi', iban: 'TR98 0006 4000 0011 2345 6789 01', accountName: 'Demo Hukuk Bürosu', isDefault: false },
      { bankName: 'Garanti BBVA', branchName: 'Mecidiyeköy Şubesi', iban: 'TR33 0006 2000 1234 0006 2987 65', accountName: 'Demo Hukuk Bürosu', isDefault: false },
    ];
    let created = 0;
    for (const acc of accounts) {
      const exists = await this.prisma.officeBankAccount.findFirst({ where: { officeId: office.id, iban: acc.iban } });
      if (!exists) {
        await this.prisma.officeBankAccount.create({ data: { officeId: office.id, ...acc } });
        created++;
      }
    }
    return { created, message: `${created} banka hesabı oluşturuldu` };
  }

  async seedLawyers(tenantId: string) {
    const office = await this.prisma.office.findFirst({ where: { tenantId } });
    const lawyers = [
      { name: 'Mehmet', surname: 'Yılmaz', barNumber: '12345', barCity: 'İstanbul', email: 'mehmet@hukuk.com', phone: '05321234567', title: 'Av.', role: 'PARTNER' },
      { name: 'Ayşe', surname: 'Kaya', barNumber: '12346', barCity: 'İstanbul', email: 'ayse@hukuk.com', phone: '05321234568', title: 'Av.', role: 'PARTNER' },
      { name: 'Ali', surname: 'Demir', barNumber: '12347', barCity: 'İstanbul', email: 'ali@hukuk.com', phone: '05321234569', title: 'Av.', role: 'EMPLOYEE' },
      { name: 'Zeynep', surname: 'Çelik', barNumber: '12348', barCity: 'Ankara', email: 'zeynep@hukuk.com', phone: '05321234570', title: 'Av.', role: 'EMPLOYEE' },
      { name: 'Mustafa', surname: 'Öztürk', barNumber: '12349', barCity: 'İzmir', email: 'mustafa@hukuk.com', phone: '05321234571', title: 'Av.', role: 'EMPLOYEE' },
      { name: 'Fatma', surname: 'Şahin', barNumber: '12350', barCity: 'İstanbul', email: 'fatma@hukuk.com', phone: '05321234572', title: 'Av.', role: 'EMPLOYEE' },
      { name: 'Hasan', surname: 'Yıldız', barNumber: '12351', barCity: 'İstanbul', email: 'hasan@hukuk.com', phone: '05321234573', title: 'Stj. Av.', role: 'INTERN' },
      { name: 'Elif', surname: 'Arslan', barNumber: '12352', barCity: 'İstanbul', email: 'elif@hukuk.com', phone: '05321234574', title: 'Stj. Av.', role: 'INTERN' },
      { name: 'Emre', surname: 'Koç', barNumber: '12353', barCity: 'Bursa', email: 'emre@hukuk.com', phone: '05321234575', title: 'Av.', role: 'EMPLOYEE' },
      { name: 'Selin', surname: 'Aydın', barNumber: '12354', barCity: 'İstanbul', email: 'selin@hukuk.com', phone: '05321234576', title: 'Av.', role: 'EMPLOYEE' },
    ];
    let created = 0;
    for (const l of lawyers) {
      const exists = await this.prisma.lawyer.findFirst({ where: { tenantId, barNumber: l.barNumber } });
      if (!exists) {
        await this.prisma.lawyer.create({ data: { tenantId, officeId: office?.id, ...l, isActive: true } as any });
        created++;
      }
    }
    return { created, message: `${created} avukat oluşturuldu` };
  }

  async seedStaff(tenantId: string) {
    const staff = [
      { firstName: 'Ahmet', lastName: 'Yılmaz', staffType: 'OFIS_KATIBI', email: 'ahmet@hukuk.com', phone: '05331234567' },
      { firstName: 'Merve', lastName: 'Kara', staffType: 'STAJYER_AVUKAT', email: 'merve@hukuk.com', phone: '05331234568' },
      { firstName: 'Burak', lastName: 'Özkan', staffType: 'MUHASEBE', email: 'burak@hukuk.com', phone: '05331234569' },
      { firstName: 'Deniz', lastName: 'Aksoy', staffType: 'STAJYER_AVUKAT', email: 'deniz@hukuk.com', phone: '05331234570' },
      { firstName: 'Canan', lastName: 'Güneş', staffType: 'SEKRETER', email: 'canan@hukuk.com', phone: '05331234571' },
      { firstName: 'Oğuz', lastName: 'Tekin', staffType: 'ADLI_KATIP', email: 'oguz@hukuk.com', phone: '05331234572' },
      { firstName: 'Pınar', lastName: 'Erdoğan', staffType: 'SEKRETER', email: 'pinar@hukuk.com', phone: '05331234573' },
      { firstName: 'Serkan', lastName: 'Polat', staffType: 'STAJYER_AVUKAT', email: 'serkan@hukuk.com', phone: '05331234574' },
      { firstName: 'Gizem', lastName: 'Çetin', staffType: 'MUHASEBE', email: 'gizem@hukuk.com', phone: '05331234575' },
      { firstName: 'Tolga', lastName: 'Yavuz', staffType: 'ARSIV', email: 'tolga@hukuk.com', phone: '05331234576' },
    ];
    let created = 0;
    for (const s of staff) {
      const exists = await this.prisma.staffMember.findFirst({ where: { tenantId, email: s.email } });
      if (!exists) {
        await this.prisma.staffMember.create({ data: { tenantId, ...s, isActive: true } as any });
        created++;
      }
    }
    return { created, message: `${created} personel oluşturuldu` };
  }


  async seedClients(tenantId: string) {
    const clients = [
      { name: 'ABC Holding A.Ş.', displayName: 'ABC Holding A.Ş.', type: 'COMPANY', companyName: 'ABC Holding A.Ş.', vkn: '1234567890', identityNo: '1234567890', email: 'info@abcholding.com', phone: '02121234567', city: 'İstanbul' },
      { name: 'XYZ Tekstil Ltd. Şti.', displayName: 'XYZ Tekstil Ltd. Şti.', type: 'COMPANY', companyName: 'XYZ Tekstil Ltd. Şti.', vkn: '1234567891', identityNo: '1234567891', email: 'info@xyztekstil.com', phone: '02121234568', city: 'Bursa' },
      { name: 'Mehmet Akın', displayName: 'Mehmet Akın', type: 'PERSON', firstName: 'Mehmet', lastName: 'Akın', tckn: '12345678901', identityNo: '12345678901', email: 'mehmet@email.com', phone: '05351234567', city: 'Ankara' },
      { name: 'Ayşe Yıldırım', displayName: 'Ayşe Yıldırım', type: 'PERSON', firstName: 'Ayşe', lastName: 'Yıldırım', tckn: '12345678902', identityNo: '12345678902', email: 'ayse@email.com', phone: '05351234568', city: 'İzmir' },
      { name: 'Delta İnşaat A.Ş.', displayName: 'Delta İnşaat A.Ş.', type: 'COMPANY', companyName: 'Delta İnşaat A.Ş.', vkn: '1234567892', identityNo: '1234567892', email: 'info@deltainsaat.com', phone: '02121234569', city: 'İstanbul' },
      { name: 'Gamma Otomotiv Ltd.', displayName: 'Gamma Otomotiv Ltd.', type: 'COMPANY', companyName: 'Gamma Otomotiv Ltd.', vkn: '1234567893', identityNo: '1234567893', email: 'info@gammaoto.com', phone: '02121234570', city: 'Kocaeli' },
      { name: 'Ali Vural', displayName: 'Ali Vural', type: 'PERSON', firstName: 'Ali', lastName: 'Vural', tckn: '12345678903', identityNo: '12345678903', email: 'ali@email.com', phone: '05351234569', city: 'Antalya' },
      { name: 'Omega Gıda San.', displayName: 'Omega Gıda San.', type: 'COMPANY', companyName: 'Omega Gıda San. Tic. A.Ş.', vkn: '1234567894', identityNo: '1234567894', email: 'info@omegagida.com', phone: '02121234571', city: 'Konya' },
      { name: 'Fatma Demir', displayName: 'Fatma Demir', type: 'PERSON', firstName: 'Fatma', lastName: 'Demir', tckn: '12345678904', identityNo: '12345678904', email: 'fatma@email.com', phone: '05351234570', city: 'Adana' },
      { name: 'Beta Enerji A.Ş.', displayName: 'Beta Enerji A.Ş.', type: 'COMPANY', companyName: 'Beta Enerji A.Ş.', vkn: '1234567895', identityNo: '1234567895', email: 'info@betaenerji.com', phone: '02121234572', city: 'Ankara' },
    ];
    let created = 0;
    for (const c of clients) {
      const exists = await this.prisma.client.findFirst({ 
        where: { tenantId, OR: [{ vkn: c.vkn || undefined }, { tckn: c.tckn || undefined }].filter(x => Object.values(x)[0]) } 
      });
      if (!exists) {
        await this.prisma.client.create({ data: { tenantId, ...c, isActive: true } as any });
        created++;
      }
    }
    return { created, message: `${created} müvekkil oluşturuldu` };
  }

  async seedDebtors(tenantId: string) {
    const debtors = [
      { name: 'Hasan Kara', type: 'INDIVIDUAL', identityNo: '98765432101', email: 'hasan@email.com', phone: '05401234567' },
      { name: 'Veli Yılmaz', type: 'INDIVIDUAL', identityNo: '98765432102', email: 'veli@email.com', phone: '05401234568' },
      { name: 'Sigma Ticaret Ltd.', type: 'COMPANY', identityNo: '9876543210', taxOffice: 'Kadıköy', email: 'info@sigma.com', phone: '02161234567' },
      { name: 'Zehra Özdemir', type: 'INDIVIDUAL', identityNo: '98765432103', email: 'zehra@email.com', phone: '05401234569' },
      { name: 'Kappa İnşaat A.Ş.', type: 'COMPANY', identityNo: '9876543211', taxOffice: 'Beşiktaş', email: 'info@kappa.com', phone: '02121234580' },
      { name: 'Murat Şen', type: 'INDIVIDUAL', identityNo: '98765432104', email: 'murat@email.com', phone: '05401234570' },
      { name: 'Lambda Tekstil', type: 'COMPANY', identityNo: '9876543212', taxOffice: 'Nilüfer', email: 'info@lambda.com', phone: '02241234567' },
      { name: 'Seda Acar', type: 'INDIVIDUAL', identityNo: '98765432105', email: 'seda@email.com', phone: '05401234571' },
      { name: 'Epsilon Gıda Ltd.', type: 'COMPANY', identityNo: '9876543213', taxOffice: 'Çankaya', email: 'info@epsilon.com', phone: '03121234567' },
      { name: 'Kemal Yıldız', type: 'INDIVIDUAL', identityNo: '98765432106', email: 'kemal@email.com', phone: '05401234572' },
    ];
    let created = 0;
    for (const d of debtors) {
      const exists = await this.prisma.debtor.findFirst({ where: { tenantId, identityNo: d.identityNo } });
      if (!exists) {
        await this.prisma.debtor.create({ data: { tenantId, ...d } as any });
        created++;
      }
    }
    return { created, message: `${created} borçlu oluşturuldu` };
  }


  async seedExecutionOffices(tenantId: string) {
    const offices = [
      { name: 'İstanbul 1. İcra Dairesi', city: 'İSTANBUL', uyapCode: '1001001' },
      { name: 'İstanbul 2. İcra Dairesi', city: 'İSTANBUL', uyapCode: '1001002' },
      { name: 'İstanbul 3. İcra Dairesi', city: 'İSTANBUL', uyapCode: '1001003' },
      { name: 'İstanbul Anadolu 1. İcra Dairesi', city: 'İSTANBUL', uyapCode: '1002001' },
      { name: 'Ankara 1. İcra Dairesi', city: 'ANKARA', uyapCode: '0601001' },
      { name: 'Ankara 2. İcra Dairesi', city: 'ANKARA', uyapCode: '0601002' },
      { name: 'İzmir 1. İcra Dairesi', city: 'İZMİR', uyapCode: '3501001' },
      { name: 'İzmir 2. İcra Dairesi', city: 'İZMİR', uyapCode: '3501002' },
      { name: 'Bursa 1. İcra Dairesi', city: 'BURSA', uyapCode: '1601001' },
      { name: 'Antalya 1. İcra Dairesi', city: 'ANTALYA', uyapCode: '0701001' },
    ];
    let created = 0;
    for (const o of offices) {
      const exists = await this.prisma.executionOffice.findFirst({ where: { tenantId, uyapCode: o.uyapCode } });
      if (!exists) {
        await this.prisma.executionOffice.create({ data: { tenantId, ...o, isActive: true } });
        created++;
      }
    }
    return { created, message: `${created} icra dairesi oluşturuldu` };
  }

  async seedCases(tenantId: string) {
    // Önce gerekli verileri al
    const [clients, debtors, lawyers, offices, takipTurleri, riskler] = await Promise.all([
      this.prisma.client.findMany({ where: { tenantId }, take: 10 }),
      this.prisma.debtor.findMany({ where: { tenantId }, take: 10 }),
      this.prisma.lawyer.findMany({ where: { tenantId }, take: 5 }),
      this.prisma.executionOffice.findMany({ where: { tenantId }, take: 5 }),
      this.prisma.lookupTakipTuru.findMany({ where: { tenantId } }),
      this.prisma.lookupRisk.findMany({ where: { tenantId } }),
    ]);

    if (clients.length === 0 || debtors.length === 0) {
      return { created: 0, message: 'Önce müvekkil ve borçlu verisi oluşturun' };
    }

    const caseTypes = ['GENERAL_EXECUTION', 'CHECK', 'BOND', 'RENTAL', 'MORTGAGE'];
    const amounts = [15000, 25000, 50000, 75000, 100000, 150000, 250000, 500000, 750000, 1000000];
    let created = 0;

    for (let i = 0; i < 10; i++) {
      const fileNumber = `2025/${(1000 + i).toString()}`;
      const exists = await this.prisma.case.findFirst({ where: { tenantId, fileNumber } });
      if (exists) continue;

      const client = clients[i % clients.length];
      const debtor = debtors[i % debtors.length];
      const lawyer = lawyers[i % lawyers.length];
      const office = offices[i % offices.length];
      const takipTuru = takipTurleri[i % takipTurleri.length];
      const risk = riskler[i % riskler.length];

      const newCase = await this.prisma.case.create({
        data: {
          tenantId,
          fileNumber,
          executionFileNumber: `2025/${(5000 + i).toString()} E.`,
          type: caseTypes[i % caseTypes.length] as any,
          clientId: client.id,
          principalAmount: amounts[i],
          caseDate: new Date(2025, 0, 1 + i * 10),
          executionOfficeId: office?.id,
          takipTuruId: takipTuru?.id,
          riskId: risk?.id,
          notes: `Örnek dosya ${i + 1}`,
        },
      });

      // Borçlu ekle
      await this.prisma.caseDebtor.create({
        data: { caseId: newCase.id, debtorId: debtor.id },
      });

      // Avukat ekle
      if (lawyer) {
        await this.prisma.caseLawyer.create({
          data: { caseId: newCase.id, lawyerId: lawyer.id },
        });
      }

      created++;
    }
    return { created, message: `${created} dosya oluşturuldu` };
  }

  // Mevcut müvekkillerin name alanını düzelt
  async fixExistingClients(tenantId: string) {
    const clients = await this.prisma.client.findMany({
      where: { tenantId },
    });

    let fixed = 0;
    for (const client of clients) {
      if (!client.name || client.name.trim() === '') {
        const name = client.displayName || client.companyName || 
          `${client.firstName || ''} ${client.lastName || ''}`.trim() || 
          'İsimsiz Müvekkil';
        
        await this.prisma.client.update({
          where: { id: client.id },
          data: { 
            name,
            displayName: client.displayName || name,
            identityNo: client.identityNo || client.tckn || client.vkn,
          },
        });
        fixed++;
      }
    }
    return { fixed, message: `${fixed} müvekkil düzeltildi` };
  }

  // Mevcut avukatları düzelt (officeId, barCity vb.)
  async fixExistingLawyers(tenantId: string) {
    const office = await this.prisma.office.findFirst({ where: { tenantId } });
    const lawyers = await this.prisma.lawyer.findMany({ where: { tenantId } });

    let fixed = 0;
    for (const lawyer of lawyers) {
      const updates: any = {};
      if (!lawyer.officeId && office) updates.officeId = office.id;
      if (!lawyer.barCity) updates.barCity = 'İstanbul';
      if (!lawyer.title) updates.title = lawyer.role === 'INTERN' ? 'Stj. Av.' : 'Av.';
      
      if (Object.keys(updates).length > 0) {
        await this.prisma.lawyer.update({ where: { id: lawyer.id }, data: updates });
        fixed++;
      }
    }
    return { fixed, message: `${fixed} avukat düzeltildi` };
  }
}
