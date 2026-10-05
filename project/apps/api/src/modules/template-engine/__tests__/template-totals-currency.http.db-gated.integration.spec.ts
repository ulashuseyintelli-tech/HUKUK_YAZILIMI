// CaseModule grafiği `pdf-poppler`'ı yükler; paket Linux'ta yükleme anında process.exit(1) verir
// (CI emsali: case-create-classification.http.db-gated.integration.spec.ts).
jest.mock('pdf-poppler', () => ({
  convert: async () => {
    throw new Error('pdf-poppler is stubbed in unit tests');
  },
}));

import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as AdmZip from 'adm-zip';
import { createHash, randomUUID } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { StorageModule } from '../../../common/storage/storage.module';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CaseModule } from '../../case/case.module';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { FeeEngineService } from '../../fee-engine/fee-engine.service';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { PdfModule } from '../../pdf/pdf.module';
import { TemplateEngineModule } from '../template-engine.module';

/**
 * Belge şablonu toplamı — para birimi bağlamı ve RESMÎ ÇIKTI RET KAPISI. GERÇEK HTTP + disposable PostgreSQL.
 *
 * Ölçülen kusur (main 6681b1d5): dosya kaydından üretilen belgelerde toplam, alacak kalemlerinin tutarı para birimine
 * bakılmadan toplanarak bulunuyor ve DOSYA para birimiyle etiketleniyordu. USD dosyada 10.000 USD + 5.000 EUR + 2.000 TRY
 * anapara → takip talebi / ödeme emri / icra emri / Word / PDF "17.000,00 $", XML `<Total>17000</Total><Currency>USD</Currency>`,
 * UDF `total: 17000, currency: "USD"`; aynı kalemler TRY dosyada "17.000,00 TL". Kalemleri TRY kayıtlı USD dosyada
 * satırlar "TL", toplam "10.250,00 $". Dava dilekçeleri tutarı sabit "TL" ile yazıyordu (USD dosyada "10.250 TL").
 *
 * OWNER KARARI (2026-10-03, "KARMA PARA BİRİMLİ BELGE: B"): yanlış tek toplam üreten resmî çıktı akışı REDDEDİLİR; PDF /
 * Word / XML / UDF / metin / merkezi uç gibi format seçerek atlanamaz; hata belgenin neden üretilemediğini söyler.
 * GEÇİCİ korumadır — para birimi bazında doğru resmî belge tasarımının tamamlandığı anlamına GELMEZ; tutar ÇEVRİLMEZ, kur
 * yoktur. Tek para birimli geçerli akışlar (TL ve dövizli) değişmez.
 *
 * ALTIN DEĞERLER: tek para birimli dosyaların `GOLDEN` parmak izleri bu değişiklikten ÖNCEKİ kodla (main 6681b1d5) üretildi;
 * yani "aynı" iddiası düzeltmesiz kodla da geçer. Belge şablonu bilinçli olarak değiştirilirse düşen karşılaştırmadaki alınan
 * değerlerle güncellenir. Parmak izine girmeyenler: üretim zamanı (XML `CreatedAt`, UDF `createdAt` / imza zamanı, DOCX
 * PDF PARMAK İZLERİ (`pdf:*` ve `MERKEZI_*.pdf`) 2026-10-05'te bilinçli olarak güncellendi (PR: belge PDF'lerinde Türkçe harfler):
 * standart Courier yerine gömülü Roboto → PDF içerik akışı değişti. Aynı koşuda metin / XML / UDF / Word / dilekçe parmak izleri
 * ve yanıt biçimi DEĞİŞMEDİ (düşen 4 testte yalnız `pdf` anahtarları farklıydı). Yeni değerler yerelde ve CI'da bağımsız olarak
 * aynı çıktı (Windows = Linux). PDF metninin doğruluğu template-engine-pdf-turkish.spec.ts'te ayrıca sınanır.
 * `docProps/core.xml`, PDF bilgi sözlüğü) ve dilekçelerdeki günün tarihi. Faiz oranı tarifeden ve günden bağımsız
 * sabitlendi (TRY %24, döviz %9 — ölçüm günündeki değerler); belge üretim yolunun geri kalanı gerçektir.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('TEMPLATE-TOTALS-CURRENCY DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;

/** JwtStrategy → validateUser sözleşmesi: req.user DB'den okunan tam User satırı; pasif kullanıcı reddedilir. */
class DbUserIdentityGuard implements CanActivate {
  constructor(private readonly db: () => PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = await this.db().user.findUnique({
      where: { id: String(req.headers['x-test-user-id']) },
      include: { tenant: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');

/** PDF içerik akışları (sıkıştırması açılmış). Üretim zamanı ve belge kimliği akışların DIŞINDA (bilgi sözlüğünde) durur. */
function pdfContentStreams(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  const streams: string[] = [];
  const marker = /(?<!end)stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(raw))) {
    const start = match.index + match[0].length;
    const dictionary = raw.slice(raw.lastIndexOf('<<', match.index), match.index);
    const length = /\/Length (\d+)/.exec(dictionary);
    if (!length || !dictionary.includes('/FlateDecode')) throw new Error(`Beklenmeyen PDF akış sözlüğü: ${dictionary}`);
    const end = start + Number(length[1]);
    streams.push(inflateSync(pdf.subarray(start, end)).toString('latin1'));
    marker.lastIndex = end;
  }
  if (streams.length === 0) throw new Error('PDF içerik akışı bulunamadı');
  return streams.join('\n--akis--\n');
}

/** DOCX girdileri: `docProps/core.xml` (oluşturma / değiştirme zamanı) dışındaki HER girdi, adıyla birlikte. */
function docxEntries(docx: Buffer, normalize: (text: string) => string = (text) => text): string {
  const entries = new AdmZip(docx)
    .getEntries()
    .filter((entry) => !entry.isDirectory && entry.entryName !== 'docProps/core.xml')
    .map((entry) => `${entry.entryName}\n${normalize(entry.getData().toString('utf8'))}`)
    .sort();
  if (!entries.some((entry) => entry.startsWith('word/document.xml\n'))) throw new Error('DOCX gövdesi bulunamadı');
  return entries.join('\n--girdi--\n');
}

const normalizeXml = (xml: string): string => xml.replace(/<CreatedAt>[^<]*<\/CreatedAt>/g, '<CreatedAt>ZAMAN</CreatedAt>');

const normalizeUdf = (udf: Record<string, any>): string =>
  JSON.stringify({ ...udf, createdAt: 'ZAMAN', signature: udf.signature ? { ...udf.signature, timestamp: 'ZAMAN' } : udf.signature });

const DOCUMENT_KINDS = ['takip-talebi', 'odeme-emri', 'icra-emri'] as const;
const PETITION_KINDS = ['itirazin-iptali', 'tasarrufun-iptali', 'dolandiricilik'] as const;
const REJECTION_CODE = 'BELGE_TOPLAMI_PARA_BIRIMI_GECERSIZ';

type Fingerprints = Record<string, string>;

// Bu değişiklikten ÖNCEKİ kodla (main 6681b1d5) üretilen parmak izleri — bkz. dosya başındaki not.
const GOLDEN: Record<string, Fingerprints> = {
  TRY: {
    'metin:takip-talebi': 'f2ee2ef82cb9cd4e7a0e59956f6357c546e0b5209f8cdcff3491af83e72e2ae9',
    'xml:takip-talebi': 'e145e7ea83cfa74a89b035f042145b559bb55b7049f173241460f977a1bdf21d',
    'udf:takip-talebi': '2cdc5791a1158791a2375803cd15e037a6769b89996ce57f18928b654e96398c',
    'word:takip-talebi': 'e08bd8413607bef9d101393b57ecd7553c8e049499d2c31190d3a0d6c0738619',
    'pdf:takip-talebi': '49c75e73554eed4c179e6c41b2b93c98752d71074d20ef96a4891626119f9b1b',
    'metin:odeme-emri': '6591c2be5b2c039d231e93ca4a9cfffd671a42e72bfaf12ae184044b6cfa43e0',
    'xml:odeme-emri': '5ee9f4915d0c2740610b62377f5f6ed93375ed48d81d4f63dad8e0c5ad462e07',
    'udf:odeme-emri': '0d24f8786d6aa545b1c47e613b5daea09a78259e99c746d4da7707a0c7f3486e',
    'word:odeme-emri': '3d1312465b3376f6ed762b7f089003c5d1beb4796a6995525a0babbdb48e8548',
    'pdf:odeme-emri': '54ea96798fae82be15f207e382c777f0cfa999e882ed61f361db94cf793aa4f6',
    'metin:icra-emri': '4955095f14914c49477346d1554940092f97573817a360bdaf85d6de6df37af6',
    'xml:icra-emri': '3ed0c759185a532f5469bb4d5645e5c305aa4ea1c0e720dd6cd0aa9601f6201a',
    'udf:icra-emri': '1468e301efbadac9214927104034b3aa8f9a985723a54a298ba414b6dc6d8fa9',
    'word:icra-emri': 'e9429dc8f888fb2893a9c5c62a46d48c856b1de484b23dd6ad82fdb9a9c6af54',
    'pdf:icra-emri': '5871ea5d4a66afc046428e40cb83f78f942dbf3f467876cf5430a8d3965f2899',
    'dilekce:itirazin-iptali': '4b99d48c12b168d5a2c1c7ee6692405fc606e2b398fefd6a88f7a7da298c95bb',
    'dilekce-word:itirazin-iptali': 'c1e9ca87149b327a84c4d2b439f14230db336077cfd37dd0480b4826f2ea1e6a',
    'dilekce:tasarrufun-iptali': '4128d2a923c85caee93154fff48ceea03b67c8b2e5ff703b108f32ab1a31e24c',
    'dilekce-word:tasarrufun-iptali': '98c46543abc6bfcf9de5ddaa8888d678d7dfe8566098f72e6d9c9f8b3204d64e',
    'dilekce:dolandiricilik': '8939fa661d51811d09d9931dc03a7179a45f0ee84f4b0b19a3ab6e499868e6f4',
    'dilekce-word:dolandiricilik': '4043761f4b0b7eb6e520ddf87758bbaac18c93e69e91f0476de063d3cf407c2e',
  },
  USD: {
    'metin:takip-talebi': 'd08dbd19426295a43349f965fc5283c414ee862229e7ee0723287a951569bb05',
    'xml:takip-talebi': '265de0a7764b548a431a39efee1b54afcc02a366e7b28fc067940bd24637f7fc',
    'udf:takip-talebi': '726d469c8014c8c6984200595875ae4d08bb829df2b25292927016c5e270a2eb',
    'word:takip-talebi': 'c6210bbc137e94b548eb21720845dece86eaf179a2a7357dce226638576ee859',
    'pdf:takip-talebi': '35519e5d2bf64df5aaa0aae87a32a7828dd32ebe12c48c5e85d91c3de204cfa6',
    'metin:odeme-emri': '70b7e88967903eae740c6cc7339f97f0e8069e6457f13027ef2d5dd8bf560617',
    'xml:odeme-emri': '2683cde64fdf8179e9f24c78a2e6e20a980bd09730f6e0ade9a4be0e6b05962c',
    'udf:odeme-emri': 'f429761c988079efa6c0d959d746f70e0fb515f0191243b46dc47a95cf9ebf7c',
    'word:odeme-emri': '5a753daf621589dca102e5cf2bf077c6fa5cc87ea302be2c8b738347020fba4e',
    'pdf:odeme-emri': 'e35d3a08c38f54dceaa8df1586ce3619731982e60377715693f3cdc800adf43e',
    'metin:icra-emri': '55302895b065eb5f4d82c1d5dda5cbec48d9051895fc5d34e1d7692abc584c5d',
    'xml:icra-emri': 'decc9b07ad5a29a354c4da44f5c74b4295d9f75918598a8a3fc75c436a17c777',
    'udf:icra-emri': '1f3683933d456203722b849bb3d10b55da1cce587452e18b9427b1b8487b4486',
    'word:icra-emri': '3d967d77159f0fef49b895418b3fe99f2ba567ebf8ad4971513b9eb3381ede22',
    'pdf:icra-emri': '20fdaee1537aa96e930572d4d182e44bb492e07edc3d82e21fbeaeb0700b770b',
  },
  MERKEZI_TRY: {
    'xml': 'ce388662b8af1e6e09e044dbfb15bd7cddaf133dae657632e25fb6a47c2d67b3',
    'docx': 'e08bd8413607bef9d101393b57ecd7553c8e049499d2c31190d3a0d6c0738619',
    'pdf': '49c75e73554eed4c179e6c41b2b93c98752d71074d20ef96a4891626119f9b1b',
    'dataHash': '059909485d151caf',
  },
  MERKEZI_USD: {
    'xml': '00cfc25fec8a18815b79a380b130f9b200acddd4bcefc81151688801b5e88c37',
    'docx': 'c6210bbc137e94b548eb21720845dece86eaf179a2a7357dce226638576ee859',
    'pdf': '35519e5d2bf64df5aaa0aae87a32a7828dd32ebe12c48c5e85d91c3de204cfa6',
    'dataHash': '0267e081cb2136a4',
  },
};

describeWithDisposableDb('Belge şablonu toplamı — resmî çıktı ret kapısı (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(300_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let tenantId: string;
  let adminId: string;
  let otherAdminId: string;
  let otherTenantId: string;
  let debtorId: string;
  let executionOfficeId: string;
  let clientId: string;
  let lawyerId: string;
  const suffix = randomUUID().slice(0, 8);

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        StorageModule,
        ErrorLogModule,
        MetricsRegistryModule,
        CaseModule,
        TemplateEngineModule,
        PdfModule,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new DbUserIdentityGuard(() => prisma))
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();

    // Faiz oranı tarifeye ve güne bağlıdır; altın değerler zamanla kaymasın diye sabitlenir (ölçüm günündeki değerler).
    jest
      .spyOn(app.get(FeeEngineService, { strict: false }), 'getInterestRate')
      .mockImplementation((currency: string) => (currency === 'TRY' ? 24 : 9));

    tenantId = `test-ci-tpltot-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: 'CI TPLTOT', slug: tenantId } });
    const admin = await prisma.user.create({
      data: { tenantId, email: `admin-${suffix}@example.test`, name: 'admin', surname: 'TPLTOT', role: 'ADMIN' },
    });
    adminId = admin.id;
    debtorId = (await prisma.debtor.create({ data: { tenantId, type: 'COMPANY', name: 'Borçlu Ticaret A.Ş.' } as never })).id;
    executionOfficeId = (
      await prisma.executionOffice.create({ data: { tenantId, name: 'İstanbul 5. İcra Dairesi', city: 'İstanbul', uyapCode: '1055' } })
    ).id;
    clientId = (
      await prisma.client.create({
        data: { tenantId, type: 'INDIVIDUAL', displayName: 'Ayşe Alacaklı', firstName: 'Ayşe', lastName: 'Alacaklı', address: 'Bahariye Cad. No:1', district: 'Kadıköy', city: 'İstanbul' } as never,
      })
    ).id;
    lawyerId = (
      await prisma.lawyer.create({
        data: { tenantId, name: 'Ada', surname: 'Vekil', barNumber: '12345', barCity: 'İstanbul', address: 'Moda Cad. No:2 Kadıköy / İstanbul', phone: '02160000000' } as never,
      })
    ).id;

    otherTenantId = `test-ci-tpltot-diger-${suffix}`;
    await prisma.tenant.create({ data: { id: otherTenantId, name: 'CI TPLTOT DIGER', slug: otherTenantId } });
    const otherAdmin = await prisma.user.create({
      data: { tenantId: otherTenantId, email: `diger-${suffix}@example.test`, name: 'diger', surname: 'TPLTOT', role: 'ADMIN' },
    });
    otherAdminId = otherAdmin.id;
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
    for (const id of [tenantId, otherTenantId]) {
      await prisma.auditLog.deleteMany({ where: { tenantId: id } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());
  const post = (path: string, body: object, userId: string = adminId) => http().post(path).set('x-test-user-id', userId).send(body);
  const get = (path: string, userId: string = adminId) => http().get(path).set('x-test-user-id', userId);
  /** İkili gövde (PDF / DOCX) — hata yanıtı JSON olduğundan gövde Buffer'dan çözülür. */
  const getBinary = (path: string, userId: string = adminId) => get(path, userId).responseType('blob');
  /** Metin gövdeli yanıt (XML): superagent bu içerik türünü kendiliğinden metne çevirmez. */
  const getText = (path: string, userId: string = adminId) =>
    get(path, userId)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks).toString('utf8')));
      });

  const principal = (amount: number) => ({ type: 'PRINCIPAL', description: 'Asıl alacak', amount, dueDate: '2026-01-15' });
  const expense = (amount: number) => ({ type: 'EXPENSE', description: 'Masraf', amount, dueDate: '2026-01-15' });

  /** Dosya numarası büro içinde tekildir; belgeye girdiği için sabittir (büro her koşuda yenidir). */
  const openCase = async (fileNumber: string, body: Record<string, unknown>): Promise<string> => {
    const res = await post('/cases', {
      fileNumber,
      type: 'GENERAL_EXECUTION',
      interestType: 'YASAL',
      startDate: '2026-02-01',
      executionOfficeId,
      creditors: [{ id: clientId, type: 'INDIVIDUAL', name: 'Ayşe Alacaklı' }],
      lawyers: [{ id: lawyerId, name: 'Ada', surname: 'Vekil' }],
      caseDebtors: [{ debtorId, role: 'ASIL_BORCLU' }],
      ...body,
    });
    expect({ fileNumber, status: res.status, message: res.body?.message }).toEqual({ fileNumber, status: 201, message: undefined });
    return res.body.id as string;
  };

  /** Sonradan kalem ekleme: para birimi açıkça verilir (bugün kabul edilen yol). */
  const addDue = async (caseId: string, due: Record<string, unknown>, currency: string) => {
    const res = await post(`/cases/${caseId}/dues`, { ...due, description: `${currency} kalem`, currency });
    expect(res.status).toBe(201);
  };

  /** Dilekçeler günün tarihini basar; parmak izinden çıkarılır. */
  const withoutToday = (text: string): string => text.split(new Date().toLocaleDateString('tr-TR')).join('BUGUN');

  /** Dosya kaydından üretilen HER belgenin parmak izi (belge çıktısının değişmediğinin ölçüm birimi). */
  async function fingerprintsOf(caseId: string, withPetitions: boolean): Promise<Fingerprints> {
    const fp: Fingerprints = {};
    for (const kind of DOCUMENT_KINDS) {
      const text = await get(`/template-engine/${kind}/case/${caseId}`);
      expect(text.status).toBe(200);
      fp[`metin:${kind}`] = sha256(JSON.stringify(text.body));
      const xml = await getText(`/template-engine/case/${caseId}/xml?type=${kind}`);
      expect(xml.status).toBe(200);
      fp[`xml:${kind}`] = sha256(normalizeXml(String(xml.body)));
      const udf = await get(`/template-engine/case/${caseId}/udf?type=${kind}`);
      expect(udf.status).toBe(200);
      fp[`udf:${kind}`] = sha256(normalizeUdf(udf.body));
      const word = await getBinary(`/template-engine/case/${caseId}/word?type=${kind}`);
      expect(word.status).toBe(200);
      fp[`word:${kind}`] = sha256(docxEntries(word.body as Buffer));
      const pdf = await getBinary(`/template-engine/case/${caseId}/pdf?type=${kind}`);
      expect(pdf.status).toBe(200);
      fp[`pdf:${kind}`] = sha256(pdfContentStreams(pdf.body as Buffer));
    }
    for (const kind of withPetitions ? PETITION_KINDS : []) {
      const text = await get(`/template-engine/${kind}/case/${caseId}`);
      expect(text.status).toBe(200);
      fp[`dilekce:${kind}`] = sha256(withoutToday(JSON.stringify(text.body)));
      const word = await getBinary(`/template-engine/${kind}/case/${caseId}/word`);
      expect(word.status).toBe(200);
      fp[`dilekce-word:${kind}`] = sha256(docxEntries(word.body as Buffer, withoutToday));
    }
    return fp;
  }

  const contentOf = async (caseId: string, kind: string) => {
    const res = await get(`/template-engine/${kind}/case/${caseId}`);
    expect(res.status).toBe(200);
    return String(res.body.content);
  };

  /** Belgedeki tutar satırları (kalem satırları + toplam); talep cümlesi "tutarındaki" sözcüğünde kesilir. */
  const amountLines = (content: string): string[] =>
    content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^(\d+\. .*: )?\d{1,3}(\.\d{3})*,\d{2} (TL|\$|EUR)( |$)/.test(line) || line.startsWith('TOPLAM'))
      .map((line) => (line.includes(' tutarındaki ') ? `${line.split(' tutarındaki ')[0]} tutarındaki …` : line));

  /**
   * Dosya kaydından belge üreten HER HTTP yolu — "format seçerek atlanamaz" iddiasının ölçüm birimi.
   * [ad, yöntem, adres]: icra belgeleri 3 türde × (metin, PDF, Word, XML, UDF, UDF indirme, merkezi DOCX / PDF / XML),
   * eski PDF ucu, dava dilekçeleri (JSON, önizleme, Word).
   */
  const officialPaths = (caseId: string): Array<[string, 'GET' | 'POST', string]> => [
    ...DOCUMENT_KINDS.flatMap((kind): Array<[string, 'GET' | 'POST', string]> => [
      [`metin ${kind}`, 'GET', `/template-engine/${kind}/case/${caseId}`],
      [`PDF ${kind}`, 'GET', `/template-engine/case/${caseId}/pdf?type=${kind}`],
      [`Word ${kind}`, 'GET', `/template-engine/case/${caseId}/word?type=${kind}`],
      [`XML ${kind}`, 'GET', `/template-engine/case/${caseId}/xml?type=${kind}`],
      [`UDF ${kind}`, 'GET', `/template-engine/case/${caseId}/udf?type=${kind}`],
      [`UDF indir ${kind}`, 'GET', `/template-engine/case/${caseId}/udf/download?type=${kind}`],
      [`merkezi DOCX ${kind}`, 'POST', `/template-engine/cases/${caseId}/documents/docx?type=${kind}`],
      [`merkezi PDF ${kind}`, 'POST', `/template-engine/cases/${caseId}/documents/pdf?type=${kind}`],
      [`merkezi XML ${kind}`, 'POST', `/template-engine/cases/${caseId}/documents/xml?type=${kind}`],
    ]),
    ['eski PDF ucu', 'GET', `/pdf/takip-talebi/${caseId}`],
    ...PETITION_KINDS.flatMap((kind): Array<[string, 'GET' | 'POST', string]> => [
      [`dilekçe ${kind}`, 'GET', `/template-engine/${kind}/case/${caseId}`],
      [`dilekçe önizleme ${kind}`, 'GET', `/template-engine/${kind}/case/${caseId}/preview`],
      [`dilekçe Word ${kind}`, 'GET', `/template-engine/${kind}/case/${caseId}/word`],
    ]),
  ];

  const callOfficial = (method: 'GET' | 'POST', path: string, userId: string = adminId) =>
    (method === 'GET' ? get(path, userId) : post(path, {}, userId)).responseType('blob');

  /** Hata yanıtı: JSON gövde (ikili beklenen uçlarda da Buffer olarak gelir). */
  const jsonBody = (res: { body: unknown }): Record<string, any> => {
    const body = res.body as unknown;
    return Buffer.isBuffer(body) ? JSON.parse(body.toString('utf8')) : (body as Record<string, any>);
  };

  const writeCounts = async (caseId: string) => ({
    claimItems: await prisma.claimItem.count({ where: { tenantId, caseId } }),
    dues: await prisma.due.count({ where: { caseId } }),
    artifacts: await prisma.documentArtifact.count({ where: { tenantId } }),
    audits: await prisma.auditLog.count({ where: { tenantId } }),
  });

  /** Reddedilen dosyada HER yol 400 + neden kodu + para birimi dökümü verir; hiçbir kayıt yazılmaz. */
  async function expectEveryPathRejected(
    caseId: string,
    expectedDurum: string,
    expectedCurrencies: string[],
    reasonText: string,
    petitions: 'REJECTED' | 'VALID',
  ) {
    const before = await writeCounts(caseId);
    expect(before.claimItems).toBeGreaterThan(0); // bakıldığının kanıtı: sayaçlar bu dosyanın kayıtlarını görüyor
    const all = officialPaths(caseId);
    expect(all).toHaveLength(3 * 9 + 1 + 3 * 3); // 37 yol
    const paths = all.filter(([name]) => !name.startsWith('dilekçe'));
    const petitionPaths = all.filter(([name]) => name.startsWith('dilekçe'));
    for (const [name, method, path] of petitions === 'REJECTED' ? all : paths) {
      const res = await callOfficial(method, path);
      const body = jsonBody(res);
      expect({ name, status: res.status, code: body.code ?? body.message }).toEqual({ name, status: 400, code: REJECTION_CODE });
      expect(body.message).toContain('Resmî belge üretilemedi');
      expect(body.message).toContain(reasonText);
      expect(body.paraBirimiDurumu.toplamGosterilebilir).toBe(false);
      expect(body.paraBirimiDurumu.paraBirimleri).toEqual(expectedCurrencies);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      // Gövdede çapraz para birimi toplamı yok
      expect(JSON.stringify(body)).not.toMatch(/17\.?000|10\.?550|10\.?250,00/);
      if (!name.startsWith('dilekçe')) expect({ name, durum: body.paraBirimiDurumu.durum }).toEqual({ name, durum: expectedDurum });
    }
    // Dilekçe etiketi sabit "TL": kalemler TRY ise dilekçe geçerlidir, üretilir
    if (petitions === 'VALID') {
      for (const [name, method, path] of petitionPaths) {
        const res = await callOfficial(method, path);
        expect({ name, status: res.status }).toEqual({ name, status: 200 });
      }
    }
    // Reddedilen üretim hiçbir kayıt yazmaz (kalem, üretim kaydı, denetim)
    expect(await writeCounts(caseId)).toEqual(before);
    expect(await prisma.documentArtifact.count({ where: { tenantId, caseId } })).toBe(0);
  }

  describe('tek para birimli geçerli dosya — belge çıktısı AYNEN (reddedilmez)', () => {
    it.each([
      ['TRY', 'TL'],
      ['USD', '$'],
    ])('%s dosya (10.000 anapara + 250 masraf): her belge bu değişiklikten önceki çıktıyla AYNI; yanıt şekli aynı, ek alan / başlık yok', async (currency, symbol) => {
      const caseId = await openCase(`2026/TEK-${currency}`, { currency, dues: [principal(10_000), expense(250)] });

      // Dilekçe sabit "TL" yazar: yalnız TRY dosyada geçerlidir (döviz dosyada reddedilir — aşağıdaki testte)
      const fp = await fingerprintsOf(caseId, currency === 'TRY');
      expect(fp).toEqual(GOLDEN[currency]);

      // Okunur karşılık: tutar satırları kalemin para birimiyle, toplam dosya para birimiyle
      expect(amountLines(await contentOf(caseId, 'takip-talebi'))).toEqual([
        `10.000,00 ${symbol} Asıl alacak (15.01.2026)`,
        `250,00 ${symbol} Masraf (15.01.2026)`,
        `10.250,00 ${symbol}`,
        `10.250,00 ${symbol} tutarındaki …`,
        `10.000,00 ${symbol} Asıl alacak (Tarih:15.01.2026)`,
        `250,00 ${symbol} Masraf (Tarih:15.01.2026)`,
      ]);
      expect(amountLines(await contentOf(caseId, 'odeme-emri'))).toEqual([
        `1. Asıl alacak: 10.000,00 ${symbol}`,
        `2. Masraf: 250,00 ${symbol}`,
        `TOPLAM          : 10.250,00 ${symbol}`,
      ]);
      for (const kind of DOCUMENT_KINDS) {
        const res = await get(`/template-engine/${kind}/case/${caseId}`);
        expect(Object.keys(res.body)).toEqual(['title', 'content', 'format', 'templateCode', 'selection']);
      }
      for (const kind of PETITION_KINDS) {
        const res = await get(`/template-engine/${kind}/case/${caseId}`);
        // Dilekçe sabit "TL" yazar: TRY dosyada geçerli; döviz dosyada aşağıdaki testte reddedilir
        if (currency === 'TRY') expect(Object.keys(res.body)).toEqual(['title', 'content']);
      }
    });

    it.each(['TRY', 'USD'])('%s dosya: eski PDF ucu (2 kalem) 200 ve PDF döner', async (currency) => {
      const caseId = await openCase(`2026/ESKIPDF-${currency}`, { currency, dues: [principal(10_000), expense(250)] });

      const res = await getBinary(`/pdf/takip-talebi/${caseId}`);

      expect({ status: res.status, magic: (res.body as Buffer).subarray(0, 5).toString('latin1') }).toEqual({ status: 200, magic: '%PDF-' });
    });

    it('iptal edilmiş başka para birimindeki kalem belgeye girmez: iptalden önce reddedilir, iptalden sonra üretilir', async () => {
      const caseId = await openCase('2026/IPTAL', { currency: 'USD', dues: [principal(10_000)] });
      await addDue(caseId, expense(300), 'EUR');
      const before = await get(`/template-engine/odeme-emri/case/${caseId}`);
      expect({ status: before.status, code: before.body.code }).toEqual({ status: 400, code: REJECTION_CODE }); // kontrol: iptalden önce karma

      const cancelled = await prisma.claimItem.updateMany({ where: { tenantId, caseId, currency: 'EUR' }, data: { status: 'CANCELLED' } });
      expect(cancelled.count).toBe(1);

      expect(amountLines(await contentOf(caseId, 'odeme-emri'))).toEqual(['1. Asıl alacak: 10.000,00 $', 'TOPLAM          : 10.000,00 $']);
    });

    it('kalemsiz dosya reddedilmez (toplam 0, para birimi çelişkisi yok)', async () => {
      const caseId = await openCase('2026/KALEMSIZ', { currency: 'USD' });

      const res = await get(`/template-engine/odeme-emri/case/${caseId}`);

      expect(res.status).toBe(200);
    });
  });

  describe('karma dosya — resmî çıktı HER yolda reddedilir (owner kararı B)', () => {
    it('USD dosya + USD 10.000 + EUR 5.000 + TRY 2.000: 37 yolun HEPSİ 400 + neden + para birimi dökümü; kayıt yazılmaz', async () => {
      const caseId = await openCase('2026/KARMA-USD', { currency: 'USD', dues: [principal(10_000)] });
      await addDue(caseId, principal(5_000), 'EUR');
      await addDue(caseId, principal(2_000), 'TRY');

      await expectEveryPathRejected(caseId, 'KARMA_PARA_BIRIMI', ['EUR', 'TRY', 'USD'], 'birden fazla para biriminde alacak kalemi var (EUR, TRY, USD)', 'REJECTED');

      // Hata gövdesi: para birimi bazında döküm, çevrilmeden
      const res = await get(`/template-engine/odeme-emri/case/${caseId}`);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        code: REJECTION_CODE,
        message: expect.stringContaining('Tutarlar çevrilmedi ve belge üretilmedi; hiçbir biçimde (PDF, Word, XML, UDF, metin) üretilmez.'),
        paraBirimiDurumu: expect.objectContaining({
          durum: 'KARMA_PARA_BIRIMI',
          gerekce: 'FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ',
          toplamEtiketi: { paraBirimi: 'USD', kaynak: 'DOSYA_PARA_BIRIMI' },
          alacakParaBirimi: null,
          toplamlarParaBirimiBazinda: [
            { paraBirimi: 'EUR', kalemSayisi: 1, totals: { principal: 5_000, interest: 0, fees: 0, total: 5_000, currency: 'EUR' } },
            { paraBirimi: 'TRY', kalemSayisi: 1, totals: { principal: 2_000, interest: 0, fees: 0, total: 2_000, currency: 'TRY' } },
            { paraBirimi: 'USD', kalemSayisi: 1, totals: { principal: 10_000, interest: 0, fees: 0, total: 10_000, currency: 'USD' } },
          ],
        }),
      });
      expect(res.body.message).toContain('geçici bir korumadır');
    });

    it('TRY dosya + TRY 2.000 + USD 10.000 + EUR 5.000 ve ekleme sırası ters: aynı sonuç (kalem sırası ya da dosya para birimi kapıyı açmaz)', async () => {
      const tryCase = await openCase('2026/KARMA-TRY', { dues: [principal(2_000)] });
      await addDue(tryCase, principal(10_000), 'USD');
      await addDue(tryCase, principal(5_000), 'EUR');
      const reversed = await openCase('2026/KARMA-SIRA', { currency: 'USD', dues: [principal(10_000)] });
      await addDue(reversed, principal(2_000), 'TRY');
      await addDue(reversed, principal(5_000), 'EUR');

      for (const caseId of [tryCase, reversed]) {
        const res = await get(`/template-engine/takip-talebi/case/${caseId}`);
        expect(res.status).toBe(400);
        expect(res.body.paraBirimiDurumu).toMatchObject({ durum: 'KARMA_PARA_BIRIMI', paraBirimleri: ['EUR', 'TRY', 'USD'] });
      }
    });

    it('aynı kategoride farklı para birimi (USD 250 + EUR 300 masraf): reddedilir (fer\'iler 550 diye basılmaz)', async () => {
      const caseId = await openCase('2026/KARMA-MASRAF', { currency: 'USD', dues: [principal(10_000), expense(250)] });
      await addDue(caseId, expense(300), 'EUR');

      const res = await getText(`/template-engine/case/${caseId}/xml?type=takip-talebi`);

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).not.toMatch(/550|10550/);
      expect(JSON.parse(String(res.body)).paraBirimiDurumu).toMatchObject({ paraBirimleri: ['EUR', 'USD'] });
    });
  });

  it('dosya dövizli, kalem kaydı TRY (eski kayıt): icra belgeleri HER yolda ETIKET_UYUSMUYOR ile reddedilir (dilekçe etiketi TL = kalemler TRY → üretilir); kayıt DEĞİŞTİRİLMEZ', async () => {
    const caseId = await openCase('2026/ESKI', { currency: 'USD', dues: [principal(10_000), expense(250)] });
    // Eski dosyadaki durumun kurulumu: kalem para birimi TRY damgalı (dosya açılışı düzeltmesinden önceki kayıt)
    await prisma.claimItem.updateMany({ where: { tenantId, caseId }, data: { currency: 'TRY' } });
    const stored = () =>
      prisma.claimItem.findMany({ where: { tenantId, caseId }, select: { id: true, amount: true, currency: true, status: true, updatedAt: true }, orderBy: { id: 'asc' } });
    const before = await stored();
    expect(before).toHaveLength(2);

    await expectEveryPathRejected(caseId, 'ETIKET_UYUSMUYOR', ['TRY'], 'Alacak kalemleri TRY para biriminde kayıtlı', 'VALID');

    const res = await get(`/template-engine/odeme-emri/case/${caseId}`);
    expect(res.body.message).toContain('dosya para birimiyle (USD) etiketlenecek');
    // Reddetme salt okumadır: geçmiş kayıt düzeltilmedi
    expect(await stored()).toEqual(before);
  });

  describe('dava dilekçeleri — tutar sabit "TL" ile yazılır', () => {
    it('TRY dosya: üretilir ("10.250 TL" geçerli)', async () => {
      const caseId = await openCase('2026/DILEKCE-TRY', { dues: [principal(10_000), expense(250)] });

      const doc = await get(`/template-engine/itirazin-iptali/case/${caseId}`);

      expect(doc.status).toBe(200);
      expect(doc.body.content).toContain('DAVA DEĞERİ     : 10.250 TL');
    });

    it('USD dosya (tek para birimli bile): dilekçe "10.250 TL" yazacağı için reddedilir; AYNI dosyanın icra belgeleri üretilir', async () => {
      const caseId = await openCase('2026/DILEKCE-USD', { currency: 'USD', dues: [principal(10_000), expense(250)] });

      for (const kind of PETITION_KINDS) {
        for (const suffixPath of ['', '/preview', '/word']) {
          const res = await callOfficial('GET', `/template-engine/${kind}/case/${caseId}${suffixPath}`);
          const body = jsonBody(res);
          expect({ kind, suffixPath, status: res.status, code: body.code }).toEqual({ kind, suffixPath, status: 400, code: REJECTION_CODE });
          expect(body.paraBirimiDurumu).toMatchObject({ durum: 'ETIKET_UYUSMUYOR', toplamEtiketi: { paraBirimi: 'TRY', kaynak: 'SABIT_TL' }, alacakParaBirimi: 'USD' });
          expect(body.message).toContain('dilekçe ise tutarı sabit "TL" ile yazıyor');
        }
      }
      expect((await get(`/template-engine/odeme-emri/case/${caseId}`)).status).toBe(200);
      expect((await getText(`/template-engine/case/${caseId}/xml?type=takip-talebi`)).status).toBe(200);
    });
  });

  describe('merkezi üretim ucu (POST /template-engine/cases/:caseId/documents/:format)', () => {
    const postDocument = (caseId: string, format: string, userId: string = adminId) =>
      http().post(`/template-engine/cases/${caseId}/documents/${format}?type=takip-talebi`).set('x-test-user-id', userId).send({}).responseType('blob');

    const generatedAudits = (caseId: string) =>
      prisma.auditLog.findMany({ where: { tenantId, action: 'DOCUMENT_GENERATED', metadata: { path: ['caseId'], equals: caseId } }, orderBy: { createdAt: 'asc' } });

    it.each(['TRY', 'USD'])(
      '%s dosya: üretilen belge, üretim kaydı anahtarı ve denetim kaydı bu değişiklikten önceki ile AYNI; ek başlık / alan yok',
      async (currency) => {
        const caseId = await openCase(`2026/MERKEZI-${currency}`, { currency, dues: [principal(10_000), expense(250)] });

        const xml = await postDocument(caseId, 'xml');
        const docx = await postDocument(caseId, 'docx');
        const pdf = await postDocument(caseId, 'pdf');
        expect([xml.status, docx.status, pdf.status]).toEqual([201, 201, 201]);

        // Üretilen belge + üretim kaydının anahtarı (veri parmak izi): bu değişiklikten önceki ile aynı
        const artifacts = await prisma.documentArtifact.findMany({ where: { tenantId, caseId }, orderBy: { format: 'asc' } });
        expect(artifacts.map((a) => [a.format, a.status])).toEqual([['DOCX', 'READY'], ['PDF', 'READY'], ['XML', 'READY']]);
        const produced = {
          xml: sha256(normalizeXml((xml.body as Buffer).toString('utf8'))),
          docx: sha256(docxEntries(docx.body as Buffer)),
          pdf: sha256(pdfContentStreams(pdf.body as Buffer)),
          dataHash: [...new Set(artifacts.map((a) => a.dataHash))].join(','),
        };
        expect(produced).toEqual(GOLDEN[`MERKEZI_${currency}`]);

        for (const res of [xml, docx, pdf]) {
          expect(res.headers['x-takip-yolu-secimi']).toBe('ILAMSIZ;basis=NOT_SELECTED;explicit=false');
          expect(res.headers['x-from-cache']).toBe('false');
          expect(Object.keys(res.headers).filter((name) => name.includes('para-birimi'))).toEqual([]);
        }
        const audits = await generatedAudits(caseId);
        expect(audits).toHaveLength(3);
        for (const audit of audits) {
          expect(audit.metadata).toMatchObject({ caseId, documentType: 'TAKIP_TALEBI', adliyeKabulu: 'DOGRULANMADI' });
          expect(audit.metadata).not.toHaveProperty('paraBirimiDurumu');
        }
      },
    );

    it('karma dosya: üç biçimin HEPSİ 400 (JSON gövde, 500 DEĞİL); üretim kaydı ve denetim kaydı YOK; önbellekten de dönmez', async () => {
      const caseId = await openCase('2026/MERKEZI-KARMA', { currency: 'USD', dues: [principal(10_000)] });
      await addDue(caseId, principal(5_000), 'EUR');
      await addDue(caseId, principal(2_000), 'TRY');

      for (const format of ['xml', 'docx', 'pdf']) {
        const res = await postDocument(caseId, format);
        const body = jsonBody(res);
        expect({ format, status: res.status, code: body.code }).toEqual({ format, status: 400, code: REJECTION_CODE });
        expect(res.headers['content-disposition']).toBeUndefined();
        expect(res.headers['x-from-cache']).toBeUndefined();
      }
      expect(await prisma.documentArtifact.count({ where: { tenantId, caseId } })).toBe(0);
      expect(await generatedAudits(caseId)).toHaveLength(0);
    });
  });

  it('GET belge uçları büro sınırını korur: başka büro karma dosyanın belgesini de para birimi dökümünü de GÖRMEZ (404, 400 değil)', async () => {
    const caseId = await openCase('2026/SINIR', { currency: 'USD', dues: [principal(10_000)] });
    await addDue(caseId, principal(5_000), 'EUR');
    expect((await get(`/template-engine/odeme-emri/case/${caseId}`)).status).toBe(400); // kontrol: kendi bürosu nedeni görüyor

    for (const [name, method, path] of officialPaths(caseId)) {
      const foreign = await callOfficial(method, path, otherAdminId);
      expect({ name, status: foreign.status }).toEqual({ name, status: 404 });
      expect(JSON.stringify(jsonBody(foreign))).not.toMatch(/paraBirimi|EUR|USD|BELGE_TOPLAMI/);
    }
  });
});
