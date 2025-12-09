import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Türkiye'nin 81 ili ve örnek icra daireleri
const EXECUTION_OFFICES_DATA = [
  // İSTANBUL (34)
  { city: "İSTANBUL", name: "İstanbul 1. İcra Dairesi", uyapCode: "1001001" },
  { city: "İSTANBUL", name: "İstanbul 2. İcra Dairesi", uyapCode: "1001002" },
  { city: "İSTANBUL", name: "İstanbul 3. İcra Dairesi", uyapCode: "1001003" },
  { city: "İSTANBUL", name: "İstanbul 4. İcra Dairesi", uyapCode: "1001004" },
  { city: "İSTANBUL", name: "İstanbul 5. İcra Dairesi", uyapCode: "1001005" },
  { city: "İSTANBUL", name: "İstanbul 6. İcra Dairesi", uyapCode: "1001006" },
  { city: "İSTANBUL", name: "İstanbul 7. İcra Dairesi", uyapCode: "1001007" },
  { city: "İSTANBUL", name: "İstanbul 8. İcra Dairesi", uyapCode: "1001008" },
  { city: "İSTANBUL", name: "İstanbul 9. İcra Dairesi", uyapCode: "1001009" },
  { city: "İSTANBUL", name: "İstanbul 10. İcra Dairesi", uyapCode: "1001010" },
  { city: "İSTANBUL", name: "İstanbul Anadolu 1. İcra Dairesi", uyapCode: "1002001" },
  { city: "İSTANBUL", name: "İstanbul Anadolu 2. İcra Dairesi", uyapCode: "1002002" },
  { city: "İSTANBUL", name: "İstanbul Anadolu 3. İcra Dairesi", uyapCode: "1002003" },
  { city: "İSTANBUL", name: "İstanbul Anadolu 4. İcra Dairesi", uyapCode: "1002004" },
  { city: "İSTANBUL", name: "İstanbul Anadolu 5. İcra Dairesi", uyapCode: "1002005" },
  { city: "İSTANBUL", name: "Bakırköy 1. İcra Dairesi", uyapCode: "1003001" },
  { city: "İSTANBUL", name: "Bakırköy 2. İcra Dairesi", uyapCode: "1003002" },
  { city: "İSTANBUL", name: "Bakırköy 3. İcra Dairesi", uyapCode: "1003003" },
  { city: "İSTANBUL", name: "Küçükçekmece 1. İcra Dairesi", uyapCode: "1004001" },
  { city: "İSTANBUL", name: "Küçükçekmece 2. İcra Dairesi", uyapCode: "1004002" },
  
  // ANKARA (06)
  { city: "ANKARA", name: "Ankara 1. İcra Dairesi", uyapCode: "0601001" },
  { city: "ANKARA", name: "Ankara 2. İcra Dairesi", uyapCode: "0601002" },
  { city: "ANKARA", name: "Ankara 3. İcra Dairesi", uyapCode: "0601003" },
  { city: "ANKARA", name: "Ankara 4. İcra Dairesi", uyapCode: "0601004" },
  { city: "ANKARA", name: "Ankara 5. İcra Dairesi", uyapCode: "0601005" },
  { city: "ANKARA", name: "Ankara 6. İcra Dairesi", uyapCode: "0601006" },
  { city: "ANKARA", name: "Ankara 7. İcra Dairesi", uyapCode: "0601007" },
  { city: "ANKARA", name: "Ankara 8. İcra Dairesi", uyapCode: "0601008" },
  { city: "ANKARA", name: "Ankara 9. İcra Dairesi", uyapCode: "0601009" },
  { city: "ANKARA", name: "Ankara 10. İcra Dairesi", uyapCode: "0601010" },
  { city: "ANKARA", name: "Sincan 1. İcra Dairesi", uyapCode: "0602001" },
  { city: "ANKARA", name: "Sincan 2. İcra Dairesi", uyapCode: "0602002" },
  
  // İZMİR (35)
  { city: "İZMİR", name: "İzmir 1. İcra Dairesi", uyapCode: "3501001" },
  { city: "İZMİR", name: "İzmir 2. İcra Dairesi", uyapCode: "3501002" },
  { city: "İZMİR", name: "İzmir 3. İcra Dairesi", uyapCode: "3501003" },
  { city: "İZMİR", name: "İzmir 4. İcra Dairesi", uyapCode: "3501004" },
  { city: "İZMİR", name: "İzmir 5. İcra Dairesi", uyapCode: "3501005" },
  { city: "İZMİR", name: "İzmir 6. İcra Dairesi", uyapCode: "3501006" },
  { city: "İZMİR", name: "İzmir 7. İcra Dairesi", uyapCode: "3501007" },
  { city: "İZMİR", name: "İzmir 8. İcra Dairesi", uyapCode: "3501008" },
  { city: "İZMİR", name: "Karşıyaka 1. İcra Dairesi", uyapCode: "3502001" },
  { city: "İZMİR", name: "Karşıyaka 2. İcra Dairesi", uyapCode: "3502002" },
  
  // BURSA (16)
  { city: "BURSA", name: "Bursa 1. İcra Dairesi", uyapCode: "1601001" },
  { city: "BURSA", name: "Bursa 2. İcra Dairesi", uyapCode: "1601002" },
  { city: "BURSA", name: "Bursa 3. İcra Dairesi", uyapCode: "1601003" },
  { city: "BURSA", name: "Bursa 4. İcra Dairesi", uyapCode: "1601004" },
  { city: "BURSA", name: "Bursa 5. İcra Dairesi", uyapCode: "1601005" },

  // ANTALYA (07)
  { city: "ANTALYA", name: "Antalya 1. İcra Dairesi", uyapCode: "0701001" },
  { city: "ANTALYA", name: "Antalya 2. İcra Dairesi", uyapCode: "0701002" },
  { city: "ANTALYA", name: "Antalya 3. İcra Dairesi", uyapCode: "0701003" },
  { city: "ANTALYA", name: "Antalya 4. İcra Dairesi", uyapCode: "0701004" },
  { city: "ANTALYA", name: "Alanya 1. İcra Dairesi", uyapCode: "0702001" },
  { city: "ANTALYA", name: "Alanya 2. İcra Dairesi", uyapCode: "0702002" },
  
  // ADANA (01)
  { city: "ADANA", name: "Adana 1. İcra Dairesi", uyapCode: "0101001" },
  { city: "ADANA", name: "Adana 2. İcra Dairesi", uyapCode: "0101002" },
  { city: "ADANA", name: "Adana 3. İcra Dairesi", uyapCode: "0101003" },
  { city: "ADANA", name: "Adana 4. İcra Dairesi", uyapCode: "0101004" },
  { city: "ADANA", name: "Adana 5. İcra Dairesi", uyapCode: "0101005" },
  
  // KOCAELİ (41)
  { city: "KOCAELİ", name: "Kocaeli 1. İcra Dairesi", uyapCode: "4101001" },
  { city: "KOCAELİ", name: "Kocaeli 2. İcra Dairesi", uyapCode: "4101002" },
  { city: "KOCAELİ", name: "Kocaeli 3. İcra Dairesi", uyapCode: "4101003" },
  { city: "KOCAELİ", name: "Gebze 1. İcra Dairesi", uyapCode: "4102001" },
  { city: "KOCAELİ", name: "Gebze 2. İcra Dairesi", uyapCode: "4102002" },
  
  // GAZİANTEP (27)
  { city: "GAZİANTEP", name: "Gaziantep 1. İcra Dairesi", uyapCode: "2701001" },
  { city: "GAZİANTEP", name: "Gaziantep 2. İcra Dairesi", uyapCode: "2701002" },
  { city: "GAZİANTEP", name: "Gaziantep 3. İcra Dairesi", uyapCode: "2701003" },
  { city: "GAZİANTEP", name: "Gaziantep 4. İcra Dairesi", uyapCode: "2701004" },
  
  // KONYA (42)
  { city: "KONYA", name: "Konya 1. İcra Dairesi", uyapCode: "4201001" },
  { city: "KONYA", name: "Konya 2. İcra Dairesi", uyapCode: "4201002" },
  { city: "KONYA", name: "Konya 3. İcra Dairesi", uyapCode: "4201003" },
  { city: "KONYA", name: "Konya 4. İcra Dairesi", uyapCode: "4201004" },
  
  // MERSİN (33)
  { city: "MERSİN", name: "Mersin 1. İcra Dairesi", uyapCode: "3301001" },
  { city: "MERSİN", name: "Mersin 2. İcra Dairesi", uyapCode: "3301002" },
  { city: "MERSİN", name: "Mersin 3. İcra Dairesi", uyapCode: "3301003" },
  { city: "MERSİN", name: "Tarsus 1. İcra Dairesi", uyapCode: "3302001" },
  
  // DİYARBAKIR (21)
  { city: "DİYARBAKIR", name: "Diyarbakır 1. İcra Dairesi", uyapCode: "2101001" },
  { city: "DİYARBAKIR", name: "Diyarbakır 2. İcra Dairesi", uyapCode: "2101002" },
  { city: "DİYARBAKIR", name: "Diyarbakır 3. İcra Dairesi", uyapCode: "2101003" },
  
  // KAYSERİ (38)
  { city: "KAYSERİ", name: "Kayseri 1. İcra Dairesi", uyapCode: "3801001" },
  { city: "KAYSERİ", name: "Kayseri 2. İcra Dairesi", uyapCode: "3801002" },
  { city: "KAYSERİ", name: "Kayseri 3. İcra Dairesi", uyapCode: "3801003" },
  
  // ESKİŞEHİR (26)
  { city: "ESKİŞEHİR", name: "Eskişehir 1. İcra Dairesi", uyapCode: "2601001" },
  { city: "ESKİŞEHİR", name: "Eskişehir 2. İcra Dairesi", uyapCode: "2601002" },
  { city: "ESKİŞEHİR", name: "Eskişehir 3. İcra Dairesi", uyapCode: "2601003" },
  
  // SAMSUN (55)
  { city: "SAMSUN", name: "Samsun 1. İcra Dairesi", uyapCode: "5501001" },
  { city: "SAMSUN", name: "Samsun 2. İcra Dairesi", uyapCode: "5501002" },
  { city: "SAMSUN", name: "Samsun 3. İcra Dairesi", uyapCode: "5501003" },
  
  // DENİZLİ (20)
  { city: "DENİZLİ", name: "Denizli 1. İcra Dairesi", uyapCode: "2001001" },
  { city: "DENİZLİ", name: "Denizli 2. İcra Dairesi", uyapCode: "2001002" },
  { city: "DENİZLİ", name: "Denizli 3. İcra Dairesi", uyapCode: "2001003" },
  
  // ŞANLIURFA (63)
  { city: "ŞANLIURFA", name: "Şanlıurfa 1. İcra Dairesi", uyapCode: "6301001" },
  { city: "ŞANLIURFA", name: "Şanlıurfa 2. İcra Dairesi", uyapCode: "6301002" },
  
  // MALATYA (44)
  { city: "MALATYA", name: "Malatya 1. İcra Dairesi", uyapCode: "4401001" },
  { city: "MALATYA", name: "Malatya 2. İcra Dairesi", uyapCode: "4401002" },
  
  // KAHRAMANMARAŞ (46)
  { city: "KAHRAMANMARAŞ", name: "Kahramanmaraş 1. İcra Dairesi", uyapCode: "4601001" },
  { city: "KAHRAMANMARAŞ", name: "Kahramanmaraş 2. İcra Dairesi", uyapCode: "4601002" },
  
  // VAN (65)
  { city: "VAN", name: "Van 1. İcra Dairesi", uyapCode: "6501001" },
  { city: "VAN", name: "Van 2. İcra Dairesi", uyapCode: "6501002" },
  
  // BATMAN (72)
  { city: "BATMAN", name: "Batman 1. İcra Dairesi", uyapCode: "7201001" },
  
  // ELAZIĞ (23)
  { city: "ELAZIĞ", name: "Elazığ 1. İcra Dairesi", uyapCode: "2301001" },
  { city: "ELAZIĞ", name: "Elazığ 2. İcra Dairesi", uyapCode: "2301002" },
  
  // ERZURUM (25)
  { city: "ERZURUM", name: "Erzurum 1. İcra Dairesi", uyapCode: "2501001" },
  { city: "ERZURUM", name: "Erzurum 2. İcra Dairesi", uyapCode: "2501002" },
  
  // TRABZON (61)
  { city: "TRABZON", name: "Trabzon 1. İcra Dairesi", uyapCode: "6101001" },
  { city: "TRABZON", name: "Trabzon 2. İcra Dairesi", uyapCode: "6101002" },
  
  // HATAY (31)
  { city: "HATAY", name: "Hatay 1. İcra Dairesi", uyapCode: "3101001" },
  { city: "HATAY", name: "Hatay 2. İcra Dairesi", uyapCode: "3101002" },
  { city: "HATAY", name: "İskenderun 1. İcra Dairesi", uyapCode: "3102001" },
  
  // MANİSA (45)
  { city: "MANİSA", name: "Manisa 1. İcra Dairesi", uyapCode: "4501001" },
  { city: "MANİSA", name: "Manisa 2. İcra Dairesi", uyapCode: "4501002" },
  
  // BALIKESİR (10)
  { city: "BALIKESİR", name: "Balıkesir 1. İcra Dairesi", uyapCode: "1001001" },
  { city: "BALIKESİR", name: "Balıkesir 2. İcra Dairesi", uyapCode: "1001002" },
  
  // AYDIN (09)
  { city: "AYDIN", name: "Aydın 1. İcra Dairesi", uyapCode: "0901001" },
  { city: "AYDIN", name: "Aydın 2. İcra Dairesi", uyapCode: "0901002" },
  { city: "AYDIN", name: "Kuşadası 1. İcra Dairesi", uyapCode: "0902001" },
  
  // TEKİRDAĞ (59)
  { city: "TEKİRDAĞ", name: "Tekirdağ 1. İcra Dairesi", uyapCode: "5901001" },
  { city: "TEKİRDAĞ", name: "Tekirdağ 2. İcra Dairesi", uyapCode: "5901002" },
  { city: "TEKİRDAĞ", name: "Çorlu 1. İcra Dairesi", uyapCode: "5902001" },
  
  // SAKARYA (54)
  { city: "SAKARYA", name: "Sakarya 1. İcra Dairesi", uyapCode: "5401001" },
  { city: "SAKARYA", name: "Sakarya 2. İcra Dairesi", uyapCode: "5401002" },
  
  // MUĞLA (48)
  { city: "MUĞLA", name: "Muğla 1. İcra Dairesi", uyapCode: "4801001" },
  { city: "MUĞLA", name: "Bodrum 1. İcra Dairesi", uyapCode: "4802001" },
  { city: "MUĞLA", name: "Fethiye 1. İcra Dairesi", uyapCode: "4803001" },
  { city: "MUĞLA", name: "Marmaris 1. İcra Dairesi", uyapCode: "4804001" },

  // ORDU (52)
  { city: "ORDU", name: "Ordu 1. İcra Dairesi", uyapCode: "5201001" },
  
  // AFYONKARAHİSAR (03)
  { city: "AFYONKARAHİSAR", name: "Afyonkarahisar 1. İcra Dairesi", uyapCode: "0301001" },
  
  // SİVAS (58)
  { city: "SİVAS", name: "Sivas 1. İcra Dairesi", uyapCode: "5801001" },
  
  // TOKAT (60)
  { city: "TOKAT", name: "Tokat 1. İcra Dairesi", uyapCode: "6001001" },
  
  // ÇORUM (19)
  { city: "ÇORUM", name: "Çorum 1. İcra Dairesi", uyapCode: "1901001" },
  
  // AKSARAY (68)
  { city: "AKSARAY", name: "Aksaray 1. İcra Dairesi", uyapCode: "6801001" },
  
  // GİRESUN (28)
  { city: "GİRESUN", name: "Giresun 1. İcra Dairesi", uyapCode: "2801001" },
  
  // ISPARTA (32)
  { city: "ISPARTA", name: "Isparta 1. İcra Dairesi", uyapCode: "3201001" },
  
  // BOLU (14)
  { city: "BOLU", name: "Bolu 1. İcra Dairesi", uyapCode: "1401001" },
  
  // DÜZCE (81)
  { city: "DÜZCE", name: "Düzce 1. İcra Dairesi", uyapCode: "8101001" },
  
  // YALOVA (77)
  { city: "YALOVA", name: "Yalova 1. İcra Dairesi", uyapCode: "7701001" },
  
  // KARABÜK (78)
  { city: "KARABÜK", name: "Karabük 1. İcra Dairesi", uyapCode: "7801001" },
  
  // ZONGULDAK (67)
  { city: "ZONGULDAK", name: "Zonguldak 1. İcra Dairesi", uyapCode: "6701001" },
  
  // KASTAMONU (37)
  { city: "KASTAMONU", name: "Kastamonu 1. İcra Dairesi", uyapCode: "3701001" },
  
  // ÇANAKKALE (17)
  { city: "ÇANAKKALE", name: "Çanakkale 1. İcra Dairesi", uyapCode: "1701001" },
  
  // EDİRNE (22)
  { city: "EDİRNE", name: "Edirne 1. İcra Dairesi", uyapCode: "2201001" },
  
  // KIRKLARELİ (39)
  { city: "KIRKLARELİ", name: "Kırklareli 1. İcra Dairesi", uyapCode: "3901001" },
  
  // UŞAK (64)
  { city: "UŞAK", name: "Uşak 1. İcra Dairesi", uyapCode: "6401001" },
  
  // KÜTAHYA (43)
  { city: "KÜTAHYA", name: "Kütahya 1. İcra Dairesi", uyapCode: "4301001" },
  
  // BİLECİK (11)
  { city: "BİLECİK", name: "Bilecik 1. İcra Dairesi", uyapCode: "1101001" },
  
  // BURDUR (15)
  { city: "BURDUR", name: "Burdur 1. İcra Dairesi", uyapCode: "1501001" },
  
  // AMASYA (05)
  { city: "AMASYA", name: "Amasya 1. İcra Dairesi", uyapCode: "0501001" },
  
  // KIRIKKALE (71)
  { city: "KIRIKKALE", name: "Kırıkkale 1. İcra Dairesi", uyapCode: "7101001" },
  
  // NEVŞEHİR (50)
  { city: "NEVŞEHİR", name: "Nevşehir 1. İcra Dairesi", uyapCode: "5001001" },
  
  // NİĞDE (51)
  { city: "NİĞDE", name: "Niğde 1. İcra Dairesi", uyapCode: "5101001" },
  
  // YOZGAT (66)
  { city: "YOZGAT", name: "Yozgat 1. İcra Dairesi", uyapCode: "6601001" },
  
  // KIRŞEHİR (40)
  { city: "KIRŞEHİR", name: "Kırşehir 1. İcra Dairesi", uyapCode: "4001001" },
  
  // KARAMAN (70)
  { city: "KARAMAN", name: "Karaman 1. İcra Dairesi", uyapCode: "7001001" },
  
  // OSMANİYE (80)
  { city: "OSMANİYE", name: "Osmaniye 1. İcra Dairesi", uyapCode: "8001001" },
  
  // ADIYAMAN (02)
  { city: "ADIYAMAN", name: "Adıyaman 1. İcra Dairesi", uyapCode: "0201001" },
  
  // AĞRI (04)
  { city: "AĞRI", name: "Ağrı 1. İcra Dairesi", uyapCode: "0401001" },
  
  // ARDAHAN (75)
  { city: "ARDAHAN", name: "Ardahan 1. İcra Dairesi", uyapCode: "7501001" },
  
  // ARTVİN (08)
  { city: "ARTVİN", name: "Artvin 1. İcra Dairesi", uyapCode: "0801001" },
  
  // BARTIN (74)
  { city: "BARTIN", name: "Bartın 1. İcra Dairesi", uyapCode: "7401001" },
  
  // BAYBURT (69)
  { city: "BAYBURT", name: "Bayburt 1. İcra Dairesi", uyapCode: "6901001" },
  
  // BİNGÖL (12)
  { city: "BİNGÖL", name: "Bingöl 1. İcra Dairesi", uyapCode: "1201001" },
  
  // BİTLİS (13)
  { city: "BİTLİS", name: "Bitlis 1. İcra Dairesi", uyapCode: "1301001" },
  
  // ERZİNCAN (24)
  { city: "ERZİNCAN", name: "Erzincan 1. İcra Dairesi", uyapCode: "2401001" },
  
  // GÜMÜŞHANe (29)
  { city: "GÜMÜŞHANE", name: "Gümüşhane 1. İcra Dairesi", uyapCode: "2901001" },
  
  // HAKKARİ (30)
  { city: "HAKKARİ", name: "Hakkari 1. İcra Dairesi", uyapCode: "3001001" },
  
  // IĞDIR (76)
  { city: "IĞDIR", name: "Iğdır 1. İcra Dairesi", uyapCode: "7601001" },
  
  // KARS (36)
  { city: "KARS", name: "Kars 1. İcra Dairesi", uyapCode: "3601001" },
  
  // KİLİS (79)
  { city: "KİLİS", name: "Kilis 1. İcra Dairesi", uyapCode: "7901001" },
  
  // MARDİN (47)
  { city: "MARDİN", name: "Mardin 1. İcra Dairesi", uyapCode: "4701001" },
  
  // MUŞ (49)
  { city: "MUŞ", name: "Muş 1. İcra Dairesi", uyapCode: "4901001" },
  
  // RİZE (53)
  { city: "RİZE", name: "Rize 1. İcra Dairesi", uyapCode: "5301001" },
  
  // SİİRT (56)
  { city: "SİİRT", name: "Siirt 1. İcra Dairesi", uyapCode: "5601001" },
  
  // SİNOP (57)
  { city: "SİNOP", name: "Sinop 1. İcra Dairesi", uyapCode: "5701001" },
  
  // ŞIRNAK (73)
  { city: "ŞIRNAK", name: "Şırnak 1. İcra Dairesi", uyapCode: "7301001" },
  
  // TUNCELİ (62)
  { city: "TUNCELİ", name: "Tunceli 1. İcra Dairesi", uyapCode: "6201001" },
];

async function seedExecutionOffices(tenantId: string) {
  console.log('🏛️ İcra daireleri seed işlemi başlıyor...');
  
  let created = 0;
  let skipped = 0;
  
  for (const office of EXECUTION_OFFICES_DATA) {
    // Aynı isimde kayıt var mı kontrol et
    const existing = await prisma.executionOffice.findFirst({
      where: {
        tenantId,
        name: office.name,
      },
    });
    
    if (existing) {
      skipped++;
      continue;
    }
    
    await prisma.executionOffice.create({
      data: {
        tenantId,
        name: office.name,
        city: office.city,
        uyapCode: office.uyapCode,
        isActive: true,
      },
    });
    created++;
  }
  
  console.log(`✅ ${created} icra dairesi oluşturuldu, ${skipped} kayıt zaten mevcuttu.`);
  console.log(`📊 Toplam ${EXECUTION_OFFICES_DATA.length} kayıt işlendi.`);
}

async function main() {
  // İlk tenant'ı bul
  const tenant = await prisma.tenant.findFirst();
  
  if (!tenant) {
    console.error('❌ Tenant bulunamadı! Önce bir tenant oluşturun.');
    process.exit(1);
  }
  
  console.log(`🏢 Tenant: ${tenant.name} (${tenant.id})`);
  
  await seedExecutionOffices(tenant.id);
}

main()
  .catch((e) => {
    console.error('❌ Seed hatası:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
