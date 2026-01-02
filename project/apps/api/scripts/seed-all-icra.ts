import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const tenantId = "cmj4m2jek0000mvu2om5rcjv2";

// Türkiye İcra Müdürlükleri - Kapsamlı Liste
interface IcraDairesi {
  name: string;
  city: string;
  district?: string;
  uyapCode: string;
  bankName?: string;
  branchName?: string;
  iban?: string;
}

const icraDaireleri: IcraDairesi[] = [
  // ==================== İSTANBUL ====================
  // Çağlayan (Merkez) - 35 daire
  ...Array.from({ length: 35 }, (_, i) => ({
    name: `İstanbul ${i + 1}. İcra Dairesi`,
    city: "İSTANBUL",
    district: "Çağlayan",
    uyapCode: `1001${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Çağlayan Adliye",
  })),
  // İstanbul Anadolu - 25 daire
  ...Array.from({ length: 25 }, (_, i) => ({
    name: `İstanbul Anadolu ${i + 1}. İcra Dairesi`,
    city: "İSTANBUL",
    district: "Kartal",
    uyapCode: `1002${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Kartal Adliye",
  })),
  // Bakırköy - 15 daire
  ...Array.from({ length: 15 }, (_, i) => ({
    name: `Bakırköy ${i + 1}. İcra Dairesi`,
    city: "İSTANBUL",
    district: "Bakırköy",
    uyapCode: `1003${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Bakırköy Adliye",
  })),
  // Küçükçekmece - 5 daire
  ...Array.from({ length: 5 }, (_, i) => ({
    name: `Küçükçekmece ${i + 1}. İcra Dairesi`,
    city: "İSTANBUL",
    district: "Küçükçekmece",
    uyapCode: `1004${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Küçükçekmece Adliye",
  })),
  // Büyükçekmece - 3 daire
  ...Array.from({ length: 3 }, (_, i) => ({
    name: `Büyükçekmece ${i + 1}. İcra Dairesi`,
    city: "İSTANBUL",
    district: "Büyükçekmece",
    uyapCode: `1005${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Büyükçekmece Adliye",
  })),
  // Gaziosmanpaşa - 3 daire
  ...Array.from({ length: 3 }, (_, i) => ({
    name: `Gaziosmanpaşa ${i + 1}. İcra Dairesi`,
    city: "İSTANBUL",
    district: "Gaziosmanpaşa",
    uyapCode: `1006${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Gaziosmanpaşa Adliye",
  })),
  // Şişli - 5 daire
  ...Array.from({ length: 5 }, (_, i) => ({
    name: `Şişli ${i + 1}. İcra Dairesi`,
    city: "İSTANBUL",
    district: "Şişli",
    uyapCode: `1007${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Şişli Adliye",
  })),
  // Beyoğlu - 3 daire
  ...Array.from({ length: 3 }, (_, i) => ({
    name: `Beyoğlu ${i + 1}. İcra Dairesi`,
    city: "İSTANBUL",
    district: "Beyoğlu",
    uyapCode: `1008${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Beyoğlu Adliye",
  })),
  // Fatih - 5 daire
  ...Array.from({ length: 5 }, (_, i) => ({
    name: `Fatih ${i + 1}. İcra Dairesi`,
    city: "İSTANBUL",
    district: "Fatih",
    uyapCode: `1009${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Fatih Adliye",
  })),
  // Kadıköy - 10 daire
  ...Array.from({ length: 10 }, (_, i) => ({
    name: `Kadıköy ${i + 1}. İcra Dairesi`,
    city: "İSTANBUL",
    district: "Kadıköy",
    uyapCode: `1010${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Kadıköy Adliye",
  })),
  // Üsküdar - 5 daire
  ...Array.from({ length: 5 }, (_, i) => ({
    name: `Üsküdar ${i + 1}. İcra Dairesi`,
    city: "İSTANBUL",
    district: "Üsküdar",
    uyapCode: `1011${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Üsküdar Adliye",
  })),
  // Pendik - 5 daire
  ...Array.from({ length: 5 }, (_, i) => ({
    name: `Pendik ${i + 1}. İcra Dairesi`,
    city: "İSTANBUL",
    district: "Pendik",
    uyapCode: `1012${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Pendik Adliye",
  })),
  // Ümraniye - 5 daire
  ...Array.from({ length: 5 }, (_, i) => ({
    name: `Ümraniye ${i + 1}. İcra Dairesi`,
    city: "İSTANBUL",
    district: "Ümraniye",
    uyapCode: `1013${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Ümraniye Adliye",
  })),
  // Beykoz - 2 daire
  ...Array.from({ length: 2 }, (_, i) => ({
    name: `Beykoz ${i + 1}. İcra Dairesi`,
    city: "İSTANBUL",
    district: "Beykoz",
    uyapCode: `1014${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Beykoz Adliye",
  })),
  // Sarıyer - 2 daire
  ...Array.from({ length: 2 }, (_, i) => ({
    name: `Sarıyer ${i + 1}. İcra Dairesi`,
    city: "İSTANBUL",
    district: "Sarıyer",
    uyapCode: `1015${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Sarıyer Adliye",
  })),
  // Eyüpsultan - 3 daire
  ...Array.from({ length: 3 }, (_, i) => ({
    name: `Eyüpsultan ${i + 1}. İcra Dairesi`,
    city: "İSTANBUL",
    district: "Eyüpsultan",
    uyapCode: `1016${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Eyüpsultan Adliye",
  })),
  // Silivri - 2 daire
  ...Array.from({ length: 2 }, (_, i) => ({
    name: `Silivri ${i + 1}. İcra Dairesi`,
    city: "İSTANBUL",
    district: "Silivri",
    uyapCode: `1017${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Silivri Adliye",
  })),
  // Çatalca - 1 daire
  { name: "Çatalca İcra Dairesi", city: "İSTANBUL", district: "Çatalca", uyapCode: "1018001", bankName: "Vakıfbank", branchName: "Çatalca" },
  // Şile - 1 daire
  { name: "Şile İcra Dairesi", city: "İSTANBUL", district: "Şile", uyapCode: "1019001", bankName: "Vakıfbank", branchName: "Şile" },
  // Adalar - 1 daire
  { name: "Adalar İcra Dairesi", city: "İSTANBUL", district: "Adalar", uyapCode: "1020001", bankName: "Vakıfbank", branchName: "Adalar" },
  // Sultanbeyli - 2 daire
  ...Array.from({ length: 2 }, (_, i) => ({
    name: `Sultanbeyli ${i + 1}. İcra Dairesi`,
    city: "İSTANBUL",
    district: "Sultanbeyli",
    uyapCode: `1021${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Sultanbeyli Adliye",
  })),
  // Tuzla - 3 daire
  ...Array.from({ length: 3 }, (_, i) => ({
    name: `Tuzla ${i + 1}. İcra Dairesi`,
    city: "İSTANBUL",
    district: "Tuzla",
    uyapCode: `1022${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Tuzla Adliye",
  })),

  // ==================== ANKARA ====================
  // Ankara Merkez - 30 daire
  ...Array.from({ length: 30 }, (_, i) => ({
    name: `Ankara ${i + 1}. İcra Dairesi`,
    city: "ANKARA",
    district: "Sıhhiye",
    uyapCode: `0600${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Ankara Adliye",
  })),
  // Ankara Batı - 10 daire
  ...Array.from({ length: 10 }, (_, i) => ({
    name: `Ankara Batı ${i + 1}. İcra Dairesi`,
    city: "ANKARA",
    district: "Sincan",
    uyapCode: `0601${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Sincan Adliye",
  })),
  // Çankaya - 5 daire
  ...Array.from({ length: 5 }, (_, i) => ({
    name: `Çankaya ${i + 1}. İcra Dairesi`,
    city: "ANKARA",
    district: "Çankaya",
    uyapCode: `0602${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Çankaya Adliye",
  })),
  // Keçiören - 3 daire
  ...Array.from({ length: 3 }, (_, i) => ({
    name: `Keçiören ${i + 1}. İcra Dairesi`,
    city: "ANKARA",
    district: "Keçiören",
    uyapCode: `0603${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Keçiören Adliye",
  })),
  // Mamak - 2 daire
  ...Array.from({ length: 2 }, (_, i) => ({
    name: `Mamak ${i + 1}. İcra Dairesi`,
    city: "ANKARA",
    district: "Mamak",
    uyapCode: `0604${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Mamak Adliye",
  })),
  // Etimesgut - 2 daire
  ...Array.from({ length: 2 }, (_, i) => ({
    name: `Etimesgut ${i + 1}. İcra Dairesi`,
    city: "ANKARA",
    district: "Etimesgut",
    uyapCode: `0605${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Etimesgut Adliye",
  })),
  // Polatlı - 2 daire
  ...Array.from({ length: 2 }, (_, i) => ({
    name: `Polatlı ${i + 1}. İcra Dairesi`,
    city: "ANKARA",
    district: "Polatlı",
    uyapCode: `0606${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Polatlı Adliye",
  })),

  // ==================== İZMİR ====================
  // İzmir Merkez - 25 daire
  ...Array.from({ length: 25 }, (_, i) => ({
    name: `İzmir ${i + 1}. İcra Dairesi`,
    city: "İZMİR",
    district: "Konak",
    uyapCode: `3500${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "İzmir Adliye",
  })),
  // Karşıyaka - 5 daire
  ...Array.from({ length: 5 }, (_, i) => ({
    name: `Karşıyaka ${i + 1}. İcra Dairesi`,
    city: "İZMİR",
    district: "Karşıyaka",
    uyapCode: `3501${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Karşıyaka Adliye",
  })),
  // Bornova - 3 daire
  ...Array.from({ length: 3 }, (_, i) => ({
    name: `Bornova ${i + 1}. İcra Dairesi`,
    city: "İZMİR",
    district: "Bornova",
    uyapCode: `3502${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Bornova Adliye",
  })),
  // Buca - 3 daire
  ...Array.from({ length: 3 }, (_, i) => ({
    name: `Buca ${i + 1}. İcra Dairesi`,
    city: "İZMİR",
    district: "Buca",
    uyapCode: `3503${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Buca Adliye",
  })),
  // Çiğli - 2 daire
  ...Array.from({ length: 2 }, (_, i) => ({
    name: `Çiğli ${i + 1}. İcra Dairesi`,
    city: "İZMİR",
    district: "Çiğli",
    uyapCode: `3504${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Çiğli Adliye",
  })),
  // Menemen - 2 daire
  ...Array.from({ length: 2 }, (_, i) => ({
    name: `Menemen ${i + 1}. İcra Dairesi`,
    city: "İZMİR",
    district: "Menemen",
    uyapCode: `3505${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Menemen Adliye",
  })),
  // Torbalı - 2 daire
  ...Array.from({ length: 2 }, (_, i) => ({
    name: `Torbalı ${i + 1}. İcra Dairesi`,
    city: "İZMİR",
    district: "Torbalı",
    uyapCode: `3506${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Torbalı Adliye",
  })),
  // Ödemiş - 2 daire
  ...Array.from({ length: 2 }, (_, i) => ({
    name: `Ödemiş ${i + 1}. İcra Dairesi`,
    city: "İZMİR",
    district: "Ödemiş",
    uyapCode: `3507${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Ödemiş Adliye",
  })),
  // Aliağa - 2 daire
  ...Array.from({ length: 2 }, (_, i) => ({
    name: `Aliağa ${i + 1}. İcra Dairesi`,
    city: "İZMİR",
    district: "Aliağa",
    uyapCode: `3508${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Aliağa Adliye",
  })),

  // ==================== BURSA ====================
  // Bursa Merkez - 15 daire
  ...Array.from({ length: 15 }, (_, i) => ({
    name: `Bursa ${i + 1}. İcra Dairesi`,
    city: "BURSA",
    district: "Osmangazi",
    uyapCode: `1600${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Bursa Adliye",
  })),
  // Nilüfer - 3 daire
  ...Array.from({ length: 3 }, (_, i) => ({
    name: `Nilüfer ${i + 1}. İcra Dairesi`,
    city: "BURSA",
    district: "Nilüfer",
    uyapCode: `1601${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Nilüfer Adliye",
  })),
  // İnegöl - 3 daire
  ...Array.from({ length: 3 }, (_, i) => ({
    name: `İnegöl ${i + 1}. İcra Dairesi`,
    city: "BURSA",
    district: "İnegöl",
    uyapCode: `1602${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "İnegöl Adliye",
  })),
  // Gemlik - 2 daire
  ...Array.from({ length: 2 }, (_, i) => ({
    name: `Gemlik ${i + 1}. İcra Dairesi`,
    city: "BURSA",
    district: "Gemlik",
    uyapCode: `1603${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Gemlik Adliye",
  })),

  // ==================== ANTALYA ====================
  // Antalya Merkez - 15 daire
  ...Array.from({ length: 15 }, (_, i) => ({
    name: `Antalya ${i + 1}. İcra Dairesi`,
    city: "ANTALYA",
    district: "Muratpaşa",
    uyapCode: `0700${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Antalya Adliye",
  })),
  // Alanya - 5 daire
  ...Array.from({ length: 5 }, (_, i) => ({
    name: `Alanya ${i + 1}. İcra Dairesi`,
    city: "ANTALYA",
    district: "Alanya",
    uyapCode: `0701${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Alanya Adliye",
  })),
  // Manavgat - 3 daire
  ...Array.from({ length: 3 }, (_, i) => ({
    name: `Manavgat ${i + 1}. İcra Dairesi`,
    city: "ANTALYA",
    district: "Manavgat",
    uyapCode: `0702${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Manavgat Adliye",
  })),
  // Serik - 2 daire
  ...Array.from({ length: 2 }, (_, i) => ({
    name: `Serik ${i + 1}. İcra Dairesi`,
    city: "ANTALYA",
    district: "Serik",
    uyapCode: `0703${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Serik Adliye",
  })),

  // ==================== ADANA ====================
  // Adana Merkez - 15 daire
  ...Array.from({ length: 15 }, (_, i) => ({
    name: `Adana ${i + 1}. İcra Dairesi`,
    city: "ADANA",
    district: "Seyhan",
    uyapCode: `0100${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Adana Adliye",
  })),
  // Ceyhan - 2 daire
  ...Array.from({ length: 2 }, (_, i) => ({
    name: `Ceyhan ${i + 1}. İcra Dairesi`,
    city: "ADANA",
    district: "Ceyhan",
    uyapCode: `0101${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Ceyhan Adliye",
  })),

  // ==================== KOCAELİ ====================
  // Kocaeli Merkez - 10 daire
  ...Array.from({ length: 10 }, (_, i) => ({
    name: `Kocaeli ${i + 1}. İcra Dairesi`,
    city: "KOCAELİ",
    district: "İzmit",
    uyapCode: `4100${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Kocaeli Adliye",
  })),
  // Gebze - 5 daire
  ...Array.from({ length: 5 }, (_, i) => ({
    name: `Gebze ${i + 1}. İcra Dairesi`,
    city: "KOCAELİ",
    district: "Gebze",
    uyapCode: `4101${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Gebze Adliye",
  })),
  // Darıca - 2 daire
  ...Array.from({ length: 2 }, (_, i) => ({
    name: `Darıca ${i + 1}. İcra Dairesi`,
    city: "KOCAELİ",
    district: "Darıca",
    uyapCode: `4102${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Darıca Adliye",
  })),

  // ==================== GAZİANTEP ====================
  // Gaziantep Merkez - 15 daire
  ...Array.from({ length: 15 }, (_, i) => ({
    name: `Gaziantep ${i + 1}. İcra Dairesi`,
    city: "GAZİANTEP",
    district: "Şahinbey",
    uyapCode: `2700${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Gaziantep Adliye",
  })),
  // Nizip - 2 daire
  ...Array.from({ length: 2 }, (_, i) => ({
    name: `Nizip ${i + 1}. İcra Dairesi`,
    city: "GAZİANTEP",
    district: "Nizip",
    uyapCode: `2701${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Nizip Adliye",
  })),

  // ==================== KONYA ====================
  // Konya Merkez - 15 daire
  ...Array.from({ length: 15 }, (_, i) => ({
    name: `Konya ${i + 1}. İcra Dairesi`,
    city: "KONYA",
    district: "Selçuklu",
    uyapCode: `4200${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Konya Adliye",
  })),
  // Ereğli - 2 daire
  ...Array.from({ length: 2 }, (_, i) => ({
    name: `Ereğli ${i + 1}. İcra Dairesi`,
    city: "KONYA",
    district: "Ereğli",
    uyapCode: `4201${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Ereğli Adliye",
  })),
  // Akşehir - 2 daire
  ...Array.from({ length: 2 }, (_, i) => ({
    name: `Akşehir ${i + 1}. İcra Dairesi`,
    city: "KONYA",
    district: "Akşehir",
    uyapCode: `4202${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Akşehir Adliye",
  })),

  // ==================== MERSİN ====================
  // Mersin Merkez - 10 daire
  ...Array.from({ length: 10 }, (_, i) => ({
    name: `Mersin ${i + 1}. İcra Dairesi`,
    city: "MERSİN",
    district: "Akdeniz",
    uyapCode: `3300${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Mersin Adliye",
  })),
  // Tarsus - 3 daire
  ...Array.from({ length: 3 }, (_, i) => ({
    name: `Tarsus ${i + 1}. İcra Dairesi`,
    city: "MERSİN",
    district: "Tarsus",
    uyapCode: `3301${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Tarsus Adliye",
  })),

  // ==================== KAYSERİ ====================
  // Kayseri Merkez - 10 daire
  ...Array.from({ length: 10 }, (_, i) => ({
    name: `Kayseri ${i + 1}. İcra Dairesi`,
    city: "KAYSERİ",
    district: "Melikgazi",
    uyapCode: `3800${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Kayseri Adliye",
  })),

  // ==================== ESKİŞEHİR ====================
  // Eskişehir Merkez - 8 daire
  ...Array.from({ length: 8 }, (_, i) => ({
    name: `Eskişehir ${i + 1}. İcra Dairesi`,
    city: "ESKİŞEHİR",
    district: "Odunpazarı",
    uyapCode: `2600${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Eskişehir Adliye",
  })),

  // ==================== DİĞER BÜYÜK İLLER ====================
  // Samsun - 8 daire
  ...Array.from({ length: 8 }, (_, i) => ({
    name: `Samsun ${i + 1}. İcra Dairesi`,
    city: "SAMSUN",
    district: "İlkadım",
    uyapCode: `5500${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Samsun Adliye",
  })),
  // Denizli - 8 daire
  ...Array.from({ length: 8 }, (_, i) => ({
    name: `Denizli ${i + 1}. İcra Dairesi`,
    city: "DENİZLİ",
    district: "Pamukkale",
    uyapCode: `2000${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Denizli Adliye",
  })),
  // Sakarya - 6 daire
  ...Array.from({ length: 6 }, (_, i) => ({
    name: `Sakarya ${i + 1}. İcra Dairesi`,
    city: "SAKARYA",
    district: "Adapazarı",
    uyapCode: `5400${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Sakarya Adliye",
  })),
  // Tekirdağ - 6 daire
  ...Array.from({ length: 6 }, (_, i) => ({
    name: `Tekirdağ ${i + 1}. İcra Dairesi`,
    city: "TEKİRDAĞ",
    district: "Süleymanpaşa",
    uyapCode: `5900${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Tekirdağ Adliye",
  })),
  // Çorlu - 3 daire
  ...Array.from({ length: 3 }, (_, i) => ({
    name: `Çorlu ${i + 1}. İcra Dairesi`,
    city: "TEKİRDAĞ",
    district: "Çorlu",
    uyapCode: `5901${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Çorlu Adliye",
  })),
  // Muğla - 5 daire
  ...Array.from({ length: 5 }, (_, i) => ({
    name: `Muğla ${i + 1}. İcra Dairesi`,
    city: "MUĞLA",
    district: "Menteşe",
    uyapCode: `4800${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Muğla Adliye",
  })),
  // Bodrum - 3 daire
  ...Array.from({ length: 3 }, (_, i) => ({
    name: `Bodrum ${i + 1}. İcra Dairesi`,
    city: "MUĞLA",
    district: "Bodrum",
    uyapCode: `4801${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Bodrum Adliye",
  })),
  // Fethiye - 3 daire
  ...Array.from({ length: 3 }, (_, i) => ({
    name: `Fethiye ${i + 1}. İcra Dairesi`,
    city: "MUĞLA",
    district: "Fethiye",
    uyapCode: `4802${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Fethiye Adliye",
  })),
  // Marmaris - 2 daire
  ...Array.from({ length: 2 }, (_, i) => ({
    name: `Marmaris ${i + 1}. İcra Dairesi`,
    city: "MUĞLA",
    district: "Marmaris",
    uyapCode: `4803${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Marmaris Adliye",
  })),

  // ==================== DİĞER İLLER ====================
  // Aydın - 5 daire
  ...Array.from({ length: 5 }, (_, i) => ({
    name: `Aydın ${i + 1}. İcra Dairesi`,
    city: "AYDIN",
    district: "Efeler",
    uyapCode: `0900${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Aydın Adliye",
  })),
  // Balıkesir - 5 daire
  ...Array.from({ length: 5 }, (_, i) => ({
    name: `Balıkesir ${i + 1}. İcra Dairesi`,
    city: "BALIKESİR",
    district: "Altıeylül",
    uyapCode: `1000${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Balıkesir Adliye",
  })),
  // Manisa - 5 daire
  ...Array.from({ length: 5 }, (_, i) => ({
    name: `Manisa ${i + 1}. İcra Dairesi`,
    city: "MANİSA",
    district: "Şehzadeler",
    uyapCode: `4500${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Manisa Adliye",
  })),
  // Hatay - 5 daire
  ...Array.from({ length: 5 }, (_, i) => ({
    name: `Hatay ${i + 1}. İcra Dairesi`,
    city: "HATAY",
    district: "Antakya",
    uyapCode: `3100${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Hatay Adliye",
  })),
  // Kahramanmaraş - 5 daire
  ...Array.from({ length: 5 }, (_, i) => ({
    name: `Kahramanmaraş ${i + 1}. İcra Dairesi`,
    city: "KAHRAMANMARAŞ",
    district: "Onikişubat",
    uyapCode: `4600${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Kahramanmaraş Adliye",
  })),
  // Şanlıurfa - 5 daire
  ...Array.from({ length: 5 }, (_, i) => ({
    name: `Şanlıurfa ${i + 1}. İcra Dairesi`,
    city: "ŞANLIURFA",
    district: "Haliliye",
    uyapCode: `6300${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Şanlıurfa Adliye",
  })),
  // Diyarbakır - 5 daire
  ...Array.from({ length: 5 }, (_, i) => ({
    name: `Diyarbakır ${i + 1}. İcra Dairesi`,
    city: "DİYARBAKIR",
    district: "Bağlar",
    uyapCode: `2100${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Diyarbakır Adliye",
  })),
  // Malatya - 5 daire
  ...Array.from({ length: 5 }, (_, i) => ({
    name: `Malatya ${i + 1}. İcra Dairesi`,
    city: "MALATYA",
    district: "Battalgazi",
    uyapCode: `4400${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Malatya Adliye",
  })),
  // Trabzon - 5 daire
  ...Array.from({ length: 5 }, (_, i) => ({
    name: `Trabzon ${i + 1}. İcra Dairesi`,
    city: "TRABZON",
    district: "Ortahisar",
    uyapCode: `6100${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Trabzon Adliye",
  })),
  // Erzurum - 5 daire
  ...Array.from({ length: 5 }, (_, i) => ({
    name: `Erzurum ${i + 1}. İcra Dairesi`,
    city: "ERZURUM",
    district: "Yakutiye",
    uyapCode: `2500${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Erzurum Adliye",
  })),
  // Van - 3 daire
  ...Array.from({ length: 3 }, (_, i) => ({
    name: `Van ${i + 1}. İcra Dairesi`,
    city: "VAN",
    district: "İpekyolu",
    uyapCode: `6500${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Van Adliye",
  })),
  // Elazığ - 3 daire
  ...Array.from({ length: 3 }, (_, i) => ({
    name: `Elazığ ${i + 1}. İcra Dairesi`,
    city: "ELAZIĞ",
    district: "Merkez",
    uyapCode: `2300${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Elazığ Adliye",
  })),
  // Sivas - 3 daire
  ...Array.from({ length: 3 }, (_, i) => ({
    name: `Sivas ${i + 1}. İcra Dairesi`,
    city: "SİVAS",
    district: "Merkez",
    uyapCode: `5800${String(i + 1).padStart(3, '0')}`,
    bankName: "Vakıfbank",
    branchName: "Sivas Adliye",
  })),
];


async function main() {
  console.log("Mevcut icra müdürlükleri siliniyor...");
  await prisma.executionOffice.deleteMany({});
  
  console.log(`${icraDaireleri.length} icra müdürlüğü ekleniyor...`);
  
  let count = 0;
  for (const daire of icraDaireleri) {
    await prisma.executionOffice.create({
      data: {
        tenantId,
        name: daire.name,
        city: daire.city,
        district: daire.district,
        uyapCode: daire.uyapCode,
        bankName: daire.bankName,
        branchName: daire.branchName,
        iban: daire.iban,
        isActive: true,
      },
    });
    count++;
    if (count % 50 === 0) {
      console.log(`${count} icra müdürlüğü eklendi...`);
    }
  }
  
  console.log(`\n✅ Toplam ${count} icra müdürlüğü başarıyla eklendi!`);
  
  // İl bazında özet
  const summary = await prisma.executionOffice.groupBy({
    by: ['city'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });
  
  console.log("\nİl bazında dağılım:");
  for (const s of summary) {
    console.log(`  ${s.city}: ${s._count.id} daire`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
