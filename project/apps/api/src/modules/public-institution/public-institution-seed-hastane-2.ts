// Kamu Hastaneleri - Şehir Hastaneleri ve Devlet Hastaneleri
// Sağlık Bakanlığı verileri

export const KAMU_HASTANE_DATA = [
  // ==================== ŞEHİR HASTANELERİ ====================
  { detsisNo: 'HAST-100', name: 'Ankara Bilkent Şehir Hastanesi', category: 'HASTANE' as const, city: 'Ankara', district: 'Çankaya' },
  { detsisNo: 'HAST-101', name: 'Ankara Etlik Şehir Hastanesi', category: 'HASTANE' as const, city: 'Ankara', district: 'Keçiören' },
  { detsisNo: 'HAST-102', name: 'İstanbul Başakşehir Çam ve Sakura Şehir Hastanesi', category: 'HASTANE' as const, city: 'İstanbul', district: 'Başakşehir' },
  { detsisNo: 'HAST-103', name: 'İstanbul İkitelli Şehir Hastanesi', category: 'HASTANE' as const, city: 'İstanbul', district: 'Başakşehir' },
  { detsisNo: 'HAST-104', name: 'Mersin Şehir Hastanesi', category: 'HASTANE' as const, city: 'Mersin', district: 'Toroslar' },
  { detsisNo: 'HAST-105', name: 'Adana Şehir Hastanesi', category: 'HASTANE' as const, city: 'Adana', district: 'Yüreğir' },
  { detsisNo: 'HAST-106', name: 'Isparta Şehir Hastanesi', category: 'HASTANE' as const, city: 'Isparta', district: 'Merkez' },
  { detsisNo: 'HAST-107', name: 'Yozgat Şehir Hastanesi', category: 'HASTANE' as const, city: 'Yozgat', district: 'Merkez' },
  { detsisNo: 'HAST-108', name: 'Manisa Şehir Hastanesi', category: 'HASTANE' as const, city: 'Manisa', district: 'Yunusemre' },
  { detsisNo: 'HAST-109', name: 'Elazığ Fethi Sekin Şehir Hastanesi', category: 'HASTANE' as const, city: 'Elazığ', district: 'Merkez' },
  { detsisNo: 'HAST-110', name: 'Eskişehir Şehir Hastanesi', category: 'HASTANE' as const, city: 'Eskişehir', district: 'Odunpazarı' },
  { detsisNo: 'HAST-111', name: 'Kayseri Şehir Hastanesi', category: 'HASTANE' as const, city: 'Kayseri', district: 'Kocasinan' },
  { detsisNo: 'HAST-112', name: 'Konya Şehir Hastanesi', category: 'HASTANE' as const, city: 'Konya', district: 'Karatay' },
  { detsisNo: 'HAST-113', name: 'Bursa Şehir Hastanesi', category: 'HASTANE' as const, city: 'Bursa', district: 'Nilüfer' },
  { detsisNo: 'HAST-114', name: 'Tekirdağ Şehir Hastanesi', category: 'HASTANE' as const, city: 'Tekirdağ', district: 'Süleymanpaşa' },
  { detsisNo: 'HAST-115', name: 'Kütahya Şehir Hastanesi', category: 'HASTANE' as const, city: 'Kütahya', district: 'Merkez' },
  { detsisNo: 'HAST-116', name: 'İzmir Bayraklı Şehir Hastanesi', category: 'HASTANE' as const, city: 'İzmir', district: 'Bayraklı' },
  { detsisNo: 'HAST-117', name: 'Gaziantep Şehir Hastanesi', category: 'HASTANE' as const, city: 'Gaziantep', district: 'Şehitkamil' },
  { detsisNo: 'HAST-118', name: 'Kocaeli Şehir Hastanesi', category: 'HASTANE' as const, city: 'Kocaeli', district: 'İzmit' },
  { detsisNo: 'HAST-119', name: 'Samsun Şehir Hastanesi', category: 'HASTANE' as const, city: 'Samsun', district: 'Canik' },
  
  // ==================== EĞİTİM VE ARAŞTIRMA HASTANELERİ ====================
  // İstanbul
  { detsisNo: 'HAST-200', name: 'İstanbul Bakırköy Dr. Sadi Konuk Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'İstanbul', district: 'Bakırköy' },
  { detsisNo: 'HAST-201', name: 'İstanbul Şişli Hamidiye Etfal Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'İstanbul', district: 'Şişli' },
  { detsisNo: 'HAST-202', name: 'İstanbul Haydarpaşa Numune Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'İstanbul', district: 'Üsküdar' },
  { detsisNo: 'HAST-203', name: 'İstanbul Kartal Dr. Lütfi Kırdar Şehir Hastanesi', category: 'HASTANE' as const, city: 'İstanbul', district: 'Kartal' },
  { detsisNo: 'HAST-204', name: 'İstanbul Fatih Sultan Mehmet Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'İstanbul', district: 'Ataşehir' },
  { detsisNo: 'HAST-205', name: 'İstanbul Ümraniye Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'İstanbul', district: 'Ümraniye' },
  { detsisNo: 'HAST-206', name: 'İstanbul Haseki Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'İstanbul', district: 'Fatih' },
  { detsisNo: 'HAST-207', name: 'İstanbul Okmeydanı Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'İstanbul', district: 'Kağıthane' },
  { detsisNo: 'HAST-208', name: 'İstanbul Kanuni Sultan Süleyman Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'İstanbul', district: 'Küçükçekmece' },
  { detsisNo: 'HAST-209', name: 'İstanbul Bağcılar Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'İstanbul', district: 'Bağcılar' },
  { detsisNo: 'HAST-210', name: 'İstanbul Erenköy Ruh ve Sinir Hastalıkları Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'İstanbul', district: 'Kadıköy' },
  { detsisNo: 'HAST-211', name: 'İstanbul Bakırköy Prof. Dr. Mazhar Osman Ruh Sağlığı ve Sinir Hastalıkları Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'İstanbul', district: 'Bakırköy' },
  
  // Ankara
  { detsisNo: 'HAST-220', name: 'Ankara Numune Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'Ankara', district: 'Altındağ' },
  { detsisNo: 'HAST-221', name: 'Ankara Dışkapı Yıldırım Beyazıt Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'Ankara', district: 'Altındağ' },
  { detsisNo: 'HAST-222', name: 'Ankara Atatürk Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'Ankara', district: 'Çankaya' },
  { detsisNo: 'HAST-223', name: 'Ankara Dr. Abdurrahman Yurtaslan Onkoloji Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'Ankara', district: 'Yenimahalle' },
  { detsisNo: 'HAST-224', name: 'Ankara Keçiören Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'Ankara', district: 'Keçiören' },
  { detsisNo: 'HAST-225', name: 'Ankara Zekai Tahir Burak Kadın Sağlığı Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'Ankara', district: 'Altındağ' },
  { detsisNo: 'HAST-226', name: 'Ankara Dr. Sami Ulus Kadın Doğum Çocuk Sağlığı ve Hastalıkları Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'Ankara', district: 'Altındağ' },
];
