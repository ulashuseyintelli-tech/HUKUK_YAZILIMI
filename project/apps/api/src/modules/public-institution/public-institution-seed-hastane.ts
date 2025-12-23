// Kamu Hastaneleri ve Üniversite Hastaneleri
// Sağlık Bakanlığı ve YÖK verileri

export const HASTANE_DATA = [
  // ==================== ÜNİVERSİTE HASTANELERİ ====================
  // İstanbul
  { detsisNo: 'HAST-001', name: 'İstanbul Üniversitesi Cerrahpaşa Tıp Fakültesi Hastanesi', category: 'HASTANE' as const, city: 'İstanbul', district: 'Fatih' },
  { detsisNo: 'HAST-002', name: 'İstanbul Üniversitesi İstanbul Tıp Fakültesi Hastanesi', category: 'HASTANE' as const, city: 'İstanbul', district: 'Fatih' },
  { detsisNo: 'HAST-003', name: 'Marmara Üniversitesi Pendik Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'İstanbul', district: 'Pendik' },
  { detsisNo: 'HAST-004', name: 'İstanbul Medeniyet Üniversitesi Göztepe Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'İstanbul', district: 'Kadıköy' },
  { detsisNo: 'HAST-005', name: 'Yeditepe Üniversitesi Hastanesi', category: 'HASTANE' as const, city: 'İstanbul', district: 'Ataşehir' },
  { detsisNo: 'HAST-006', name: 'Koç Üniversitesi Hastanesi', category: 'HASTANE' as const, city: 'İstanbul', district: 'Zeytinburnu' },
  { detsisNo: 'HAST-007', name: 'Acıbadem Üniversitesi Atakent Hastanesi', category: 'HASTANE' as const, city: 'İstanbul', district: 'Küçükçekmece' },
  { detsisNo: 'HAST-008', name: 'Bezmialem Vakıf Üniversitesi Hastanesi', category: 'HASTANE' as const, city: 'İstanbul', district: 'Fatih' },
  { detsisNo: 'HAST-009', name: 'Medipol Üniversitesi Hastanesi', category: 'HASTANE' as const, city: 'İstanbul', district: 'Bağcılar' },
  { detsisNo: 'HAST-010', name: 'Biruni Üniversitesi Hastanesi', category: 'HASTANE' as const, city: 'İstanbul', district: 'Zeytinburnu' },
  
  // Ankara
  { detsisNo: 'HAST-011', name: 'Hacettepe Üniversitesi Hastaneleri', category: 'HASTANE' as const, city: 'Ankara', district: 'Altındağ' },
  { detsisNo: 'HAST-012', name: 'Ankara Üniversitesi Tıp Fakültesi Cebeci Hastanesi', category: 'HASTANE' as const, city: 'Ankara', district: 'Çankaya' },
  { detsisNo: 'HAST-013', name: 'Ankara Üniversitesi Tıp Fakültesi İbni Sina Hastanesi', category: 'HASTANE' as const, city: 'Ankara', district: 'Altındağ' },
  { detsisNo: 'HAST-014', name: 'Gazi Üniversitesi Hastanesi', category: 'HASTANE' as const, city: 'Ankara', district: 'Yenimahalle' },
  { detsisNo: 'HAST-015', name: 'Başkent Üniversitesi Ankara Hastanesi', category: 'HASTANE' as const, city: 'Ankara', district: 'Çankaya' },
  { detsisNo: 'HAST-016', name: 'TOBB ETÜ Hastanesi', category: 'HASTANE' as const, city: 'Ankara', district: 'Çankaya' },
  { detsisNo: 'HAST-017', name: 'Yıldırım Beyazıt Üniversitesi Yenimahalle Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'Ankara', district: 'Yenimahalle' },
  
  // İzmir
  { detsisNo: 'HAST-018', name: 'Ege Üniversitesi Tıp Fakültesi Hastanesi', category: 'HASTANE' as const, city: 'İzmir', district: 'Bornova' },
  { detsisNo: 'HAST-019', name: 'Dokuz Eylül Üniversitesi Hastanesi', category: 'HASTANE' as const, city: 'İzmir', district: 'Balçova' },
  { detsisNo: 'HAST-020', name: 'İzmir Katip Çelebi Üniversitesi Atatürk Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'İzmir', district: 'Karabağlar' },
  
  // Bursa
  { detsisNo: 'HAST-021', name: 'Uludağ Üniversitesi Tıp Fakültesi Hastanesi', category: 'HASTANE' as const, city: 'Bursa', district: 'Görükle' },
  
  // Antalya
  { detsisNo: 'HAST-022', name: 'Akdeniz Üniversitesi Hastanesi', category: 'HASTANE' as const, city: 'Antalya', district: 'Konyaaltı' },
  
  // Adana
  { detsisNo: 'HAST-023', name: 'Çukurova Üniversitesi Tıp Fakültesi Balcalı Hastanesi', category: 'HASTANE' as const, city: 'Adana', district: 'Sarıçam' },
  
  // Konya
  { detsisNo: 'HAST-024', name: 'Selçuk Üniversitesi Tıp Fakültesi Hastanesi', category: 'HASTANE' as const, city: 'Konya', district: 'Selçuklu' },
  { detsisNo: 'HAST-025', name: 'Necmettin Erbakan Üniversitesi Meram Tıp Fakültesi Hastanesi', category: 'HASTANE' as const, city: 'Konya', district: 'Meram' },
  
  // Kayseri
  { detsisNo: 'HAST-026', name: 'Erciyes Üniversitesi Tıp Fakültesi Hastanesi', category: 'HASTANE' as const, city: 'Kayseri', district: 'Melikgazi' },
  
  // Eskişehir
  { detsisNo: 'HAST-027', name: 'Eskişehir Osmangazi Üniversitesi Tıp Fakültesi Hastanesi', category: 'HASTANE' as const, city: 'Eskişehir', district: 'Odunpazarı' },
  
  // Samsun
  { detsisNo: 'HAST-028', name: 'Ondokuz Mayıs Üniversitesi Tıp Fakültesi Hastanesi', category: 'HASTANE' as const, city: 'Samsun', district: 'Atakum' },
  
  // Trabzon
  { detsisNo: 'HAST-029', name: 'Karadeniz Teknik Üniversitesi Farabi Hastanesi', category: 'HASTANE' as const, city: 'Trabzon', district: 'Ortahisar' },
  
  // Erzurum
  { detsisNo: 'HAST-030', name: 'Atatürk Üniversitesi Yakutiye Araştırma Hastanesi', category: 'HASTANE' as const, city: 'Erzurum', district: 'Yakutiye' },
  
  // Diyarbakır
  { detsisNo: 'HAST-031', name: 'Dicle Üniversitesi Tıp Fakültesi Hastanesi', category: 'HASTANE' as const, city: 'Diyarbakır', district: 'Sur' },
  
  // Gaziantep
  { detsisNo: 'HAST-032', name: 'Gaziantep Üniversitesi Şahinbey Araştırma ve Uygulama Hastanesi', category: 'HASTANE' as const, city: 'Gaziantep', district: 'Şahinbey' },
  
  // Malatya
  { detsisNo: 'HAST-033', name: 'İnönü Üniversitesi Turgut Özal Tıp Merkezi', category: 'HASTANE' as const, city: 'Malatya', district: 'Battalgazi' },
  
  // Denizli
  { detsisNo: 'HAST-034', name: 'Pamukkale Üniversitesi Hastanesi', category: 'HASTANE' as const, city: 'Denizli', district: 'Kınıklı' },
  
  // Kocaeli
  { detsisNo: 'HAST-035', name: 'Kocaeli Üniversitesi Araştırma ve Uygulama Hastanesi', category: 'HASTANE' as const, city: 'Kocaeli', district: 'İzmit' },
  
  // Mersin
  { detsisNo: 'HAST-036', name: 'Mersin Üniversitesi Tıp Fakültesi Hastanesi', category: 'HASTANE' as const, city: 'Mersin', district: 'Yenişehir' },
  
  // Edirne
  { detsisNo: 'HAST-037', name: 'Trakya Üniversitesi Tıp Fakültesi Hastanesi', category: 'HASTANE' as const, city: 'Edirne', district: 'Merkez' },
  
  // Elazığ
  { detsisNo: 'HAST-038', name: 'Fırat Üniversitesi Hastanesi', category: 'HASTANE' as const, city: 'Elazığ', district: 'Merkez' },
  
  // Van
  { detsisNo: 'HAST-039', name: 'Van Yüzüncü Yıl Üniversitesi Dursun Odabaş Tıp Merkezi', category: 'HASTANE' as const, city: 'Van', district: 'Tuşba' },
  
  // Manisa
  { detsisNo: 'HAST-040', name: 'Celal Bayar Üniversitesi Hafsa Sultan Hastanesi', category: 'HASTANE' as const, city: 'Manisa', district: 'Yunusemre' },
  
  // Aydın
  { detsisNo: 'HAST-041', name: 'Adnan Menderes Üniversitesi Uygulama ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'Aydın', district: 'Efeler' },
  
  // Sakarya
  { detsisNo: 'HAST-042', name: 'Sakarya Üniversitesi Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'Sakarya', district: 'Adapazarı' },
  
  // Hatay
  { detsisNo: 'HAST-043', name: 'Mustafa Kemal Üniversitesi Tayfur Ata Sökmen Tıp Fakültesi Hastanesi', category: 'HASTANE' as const, city: 'Hatay', district: 'Antakya' },
  
  // Kahramanmaraş
  { detsisNo: 'HAST-044', name: 'Kahramanmaraş Sütçü İmam Üniversitesi Tıp Fakültesi Hastanesi', category: 'HASTANE' as const, city: 'Kahramanmaraş', district: 'Onikişubat' },
  
  // Afyonkarahisar
  { detsisNo: 'HAST-045', name: 'Afyon Kocatepe Üniversitesi Hastanesi', category: 'HASTANE' as const, city: 'Afyonkarahisar', district: 'Merkez' },
  
  // Isparta
  { detsisNo: 'HAST-046', name: 'Süleyman Demirel Üniversitesi Araştırma ve Uygulama Hastanesi', category: 'HASTANE' as const, city: 'Isparta', district: 'Merkez' },
  
  // Zonguldak
  { detsisNo: 'HAST-047', name: 'Bülent Ecevit Üniversitesi Sağlık Uygulama ve Araştırma Merkezi', category: 'HASTANE' as const, city: 'Zonguldak', district: 'Kozlu' },
  
  // Tokat
  { detsisNo: 'HAST-048', name: 'Gaziosmanpaşa Üniversitesi Tıp Fakültesi Hastanesi', category: 'HASTANE' as const, city: 'Tokat', district: 'Merkez' },
  
  // Çanakkale
  { detsisNo: 'HAST-049', name: 'Çanakkale Onsekiz Mart Üniversitesi Sağlık Uygulama ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'Çanakkale', district: 'Merkez' },
  
  // Bolu
  { detsisNo: 'HAST-050', name: 'Abant İzzet Baysal Üniversitesi Tıp Fakültesi Hastanesi', category: 'HASTANE' as const, city: 'Bolu', district: 'Merkez' },
];
