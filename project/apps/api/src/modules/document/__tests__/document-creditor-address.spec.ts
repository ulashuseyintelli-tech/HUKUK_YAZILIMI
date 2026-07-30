import { DocumentService } from '../document.service';
import { TemplateService } from '../template.service';

/**
 * CLIENT-DOCUMENT-ADDRESS-OUTPUT-DEFECT-R01 — alacaklı adresinin hukuki çıktıya ULAŞTIĞI kanıtı.
 *
 * DEFEKT (onarıldı): `prepareDocumentData()` alacaklı adresini
 * `(caseData.client?.address as any)?.text` ile okuyordu. `Client.address` şemada `String?`
 * olduğu için `.text` HER ZAMAN `undefined` dönüyordu → UYAP XML `<Adres>` elementi ve
 * ödeme emri / haciz müzekkeresi / satış talebi / 89-1-2-3 ihbarname PDF'lerinde alacaklı
 * adresi SESSİZCE BOŞ çıkıyordu. `as any` cast'i tip sisteminin bunu yakalamasını engelledi.
 *
 * NEDEN FARK EDİLMEDİ: mevcut iki document testinin fixture'ı `address: { text: 'Adres' }`
 * (obje) besliyordu — Prisma'nın asla üretmediği bir şekil. Fixture hatalı kodun şeklini
 * kodladığı için `.text` "çalışıyor" görünüyordu. Ayrıca repoda `creditor.address` değerini
 * assert eden HİÇBİR test yoktu. Bu dosya o boşluğu kapatır.
 *
 * KAPSAM SINIRI: yalnız legacy flat `Client.address` kolonu. ClientAddress (çok-adres)
 * retarget'ı ARC-07'nin ayrı dilimidir — burada NE yapılır NE varsayılır.
 */
describe('CLIENT-DOCUMENT-ADDRESS-OUTPUT-DEFECT-R01 — alacaklı adresi hukuki çıktıya ulaşır', () => {
  const CREDITOR_ADDRESS = 'Atatürk Cad. No:5 Kadıköy/İstanbul';

  // ŞEMA-DOĞRU fixture: Client.address = String? (obje DEĞİL).
  const makeCase = (clientAddress: unknown) => ({
    id: 'case-1',
    fileNumber: '2026/42',
    principalAmount: 1000,
    interestRate: 0,
    createdAt: new Date('2026-01-01'),
    startDate: new Date('2026-01-01'),
    client: { name: 'Alacaklı A.Ş.', identityNo: '1234567890', address: clientAddress },
    // debtor.addresses şemada gerçekten `Json?` — bu alan DEĞİŞTİRİLMEDİ (kapsam dışı).
    debtors: [{ debtor: { name: 'Borçlu', identityNo: '11111111110', addresses: { primary: 'Borçlu Adresi' } } }],
    lawyers: [],
    formType: null,
    collections: [],
    executionOffice: null,
    dues: [],
    notes: null,
  });

  const build = (clientAddress: unknown) => {
    const prisma: any = { case: { findFirst: jest.fn().mockResolvedValue(makeCase(clientAddress)) } };
    return new DocumentService(prisma, new TemplateService());
  };

  it('[1] dolu string adres hazırlanan belge verisinde YER ALIR', async () => {
    const svc = build(CREDITOR_ADDRESS);
    const data = await svc.prepareDocumentData('case-1', 'tenant-A');
    expect(data.creditor.address).toBe(CREDITOR_ADDRESS);
  });

  it('[2] ANA REGRESYON — adres UYAP XML <Adres> elementine YAZILIR (eskiden boştu)', async () => {
    const svc = build(CREDITOR_ADDRESS);
    const xml = await svc.generateUyapXml('case-1', 'tenant-A');

    // Alacaklı bloğundaki <Adres> gerçek değeri taşımalı.
    expect(xml).toContain(`<Adres>${CREDITOR_ADDRESS}</Adres>`);
    // Defektin imzası: alacaklı adresi BOŞ element olarak çıkmamalı.
    const alacakliBlock = xml.slice(xml.indexOf('<Alacakli>'), xml.indexOf('</Alacakli>'));
    expect(alacakliBlock).toContain(CREDITOR_ADDRESS);
    expect(alacakliBlock).not.toContain('<Adres></Adres>');
  });

  it('[3] adres gerçek ödeme emri PDF payload\'ında YER ALIR (paylaşılan hazırlama yolu)', async () => {
    const svc = build(CREDITOR_ADDRESS);
    const buf = await svc.generatePaymentOrder('case-1', 'tenant-A');
    expect(buf.toString('utf-8')).toContain(CREDITOR_ADDRESS);
  });

  it('[4] null adres güvenli — undefined döner, XML boş element yazar, çökme YOK', async () => {
    const svc = build(null);
    const data = await svc.prepareDocumentData('case-1', 'tenant-A');
    expect(data.creditor.address).toBeUndefined();

    const xml = await svc.generateUyapXml('case-1', 'tenant-A');
    expect(xml).toContain('<Adres></Adres>'); // sözleşme: yok → boş
  });

  it('[5] yalnız boşluktan oluşan adres mevcut sözleşmeye göre YOK sayılır (undefined)', async () => {
    const svc = build('   ');
    const data = await svc.prepareDocumentData('case-1', 'tenant-A');
    expect(data.creditor.address).toBeUndefined();
  });

  it('[5b] baş/son boşluk kırpılır, iç boşluk KORUNUR', async () => {
    const svc = build(`  ${CREDITOR_ADDRESS}  `);
    const data = await svc.prepareDocumentData('case-1', 'tenant-A');
    expect(data.creditor.address).toBe(CREDITOR_ADDRESS);
  });

  it('[6] DİŞ — eski `.text` davranışı bu testleri GEÇEMEZ (obje-şekilli okuma undefined üretir)', async () => {
    // Eski ifadenin birebir simülasyonu: düz string üzerinde `?.text`.
    const legacyExpression = (addr: unknown) => (addr as any)?.text;

    // Şema-doğru girdi (string) → eski ifade undefined üretir = defektin kendisi.
    expect(legacyExpression(CREDITOR_ADDRESS)).toBeUndefined();
    // Onarılmış ifade aynı girdide gerçek değeri üretir.
    expect(CREDITOR_ADDRESS.trim() || undefined).toBe(CREDITOR_ADDRESS);

    // Ve uçtan uca: onarılmış servis XML'e adresi yazar; eski ifade yazamazdı.
    const xml = await build(CREDITOR_ADDRESS).generateUyapXml('case-1', 'tenant-A');
    expect(xml).toContain(CREDITOR_ADDRESS);
    expect(legacyExpression(CREDITOR_ADDRESS)).toBeUndefined();
  });

  it('[7] borçlu adresi davranışı DEĞİŞMEDİ (Json? alanı, kapsam dışı)', async () => {
    const svc = build(CREDITOR_ADDRESS);
    const data = await svc.prepareDocumentData('case-1', 'tenant-A');
    // debtor.addresses şemada Json? — `.primary` okuması meşru ve DOKUNULMADI.
    expect(data.debtor.address).toBe('Borçlu Adresi');
  });

  it('[8] I07 KASITLI GÜNCELLEME: ClientAddress artık OKUNUR — I01/I03 ile AYNI sözleşmeyle', async () => {
    // CLIENT-ARC-07-OFFICIAL-CONSUMER-ADAPTER-I07 (owner GO-IMPLEMENT) bu satırın "ClientAddress
    // HİÇ sorgulanmaz" iddiasını KASITLI olarak geçersiz kıldı: resmi çıktı artık yapısal
    // ClientAddress'i (varsa) OKUR — DOĞRUDAN Prisma çağrısıyla DEĞİL, `case.findFirst`'ün
    // `client.addresses` include'u üzerinden (I01/I03'ün kanonik sözleşmesiyle AYNI: yalnız
    // isCurrent=true, isPrimary desc/createdAt asc sıralı). Test GEVŞETİLMEDİ — sınır
    // İLERLETİLDİ: artık HANGİ sözleşmeyle okunduğu pinlenir.
    const prisma: any = { case: { findFirst: jest.fn().mockResolvedValue(makeCase(CREDITOR_ADDRESS)) } };
    const svc = new DocumentService(prisma, new TemplateService());
    await svc.prepareDocumentData('case-1', 'tenant-A');

    const include = prisma.case.findFirst.mock.calls[0][0].include;
    expect(include.client).toEqual({
      include: {
        addresses: {
          where: { isCurrent: true },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
  });

  it('[8b] fixture\'da addresses YOKSA (I01 öncesi şekil) legacy flat kolona AÇIKÇA düşer', async () => {
    // makeCase() fixture'ı `client.addresses` alanı İÇERMEZ (yapısal satır YOK senaryosu).
    // Resolver bunu "yapısal satır yok" olarak yorumlar ve legacy flat kolona düşer — davranış
    // testin ana amacıyla (adres hukuki çıktıya ulaşır) AYNI kalır.
    const svc = build(CREDITOR_ADDRESS);
    const data = await svc.prepareDocumentData('case-1', 'tenant-A');
    expect(data.creditor.address).toBe(CREDITOR_ADDRESS);
  });

  it('[8c] yapısal BİRİNCİL ClientAddress VARSA legacy flat kolonu GÖRMEZDEN GELİR', async () => {
    // Bu test resolver'ın GERÇEKTEN çağrıldığını kanıtlar: yapısal satır legacy'den FARKLI
    // bir değer taşıyor. Resolver bypass edilip ham `client.address` okunsaydı bu test
    // legacy değeri görür ve YANLIŞLIKLA geçerdi — [8]/[8c] birlikte bunu kapatır.
    const prisma: any = {
      case: {
        findFirst: jest.fn().mockResolvedValue({
          ...makeCase('Legacy Cadde'),
          client: {
            name: 'Alacaklı A.Ş.',
            identityNo: '1234567890',
            address: 'Legacy Cadde',
            city: 'LegacyŞehir',
            addresses: [
              { street: 'Yapısal Cadde', city: 'İstanbul', district: 'Kadıköy', isPrimary: true },
            ],
          },
        }),
      },
    };
    const svc = new DocumentService(prisma, new TemplateService());
    const data = await svc.prepareDocumentData('case-1', 'tenant-A');
    expect(data.creditor.address).toBe('Yapısal Cadde, Kadıköy/İstanbul');
    expect(data.creditor.address).not.toContain('Legacy Cadde');
  });

  it('[9] tenant fail-closed korunur — adres onarımı guard\'ı zayıflatmadı', async () => {
    const prisma: any = { case: { findFirst: jest.fn() } };
    const svc = new DocumentService(prisma, new TemplateService());
    await expect(svc.prepareDocumentData('case-1', undefined as any)).rejects.toThrow();
    expect(prisma.case.findFirst).not.toHaveBeenCalled();
  });
});
