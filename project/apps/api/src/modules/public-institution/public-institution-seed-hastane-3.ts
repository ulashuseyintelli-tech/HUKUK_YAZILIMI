// Devlet Hastaneleri - 81 İl
// Sağlık Bakanlığı verileri

export const DEVLET_HASTANE_DATA = [
  // İzmir
  { detsisNo: 'HAST-300', name: 'İzmir Tepecik Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'İzmir', district: 'Konak' },
  { detsisNo: 'HAST-301', name: 'İzmir Bozyaka Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'İzmir', district: 'Karabağlar' },
  { detsisNo: 'HAST-302', name: 'İzmir Dr. Behçet Uz Çocuk Hastalıkları ve Cerrahisi Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'İzmir', district: 'Konak' },
  { detsisNo: 'HAST-303', name: 'İzmir Menemen Devlet Hastanesi', category: 'HASTANE' as const, city: 'İzmir', district: 'Menemen' },
  { detsisNo: 'HAST-304', name: 'İzmir Torbalı Devlet Hastanesi', category: 'HASTANE' as const, city: 'İzmir', district: 'Torbalı' },
  
  // Bursa
  { detsisNo: 'HAST-310', name: 'Bursa Yüksek İhtisas Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'Bursa', district: 'Yıldırım' },
  { detsisNo: 'HAST-311', name: 'Bursa Çekirge Devlet Hastanesi', category: 'HASTANE' as const, city: 'Bursa', district: 'Osmangazi' },
  { detsisNo: 'HAST-312', name: 'Bursa İnegöl Devlet Hastanesi', category: 'HASTANE' as const, city: 'Bursa', district: 'İnegöl' },
  
  // Antalya
  { detsisNo: 'HAST-320', name: 'Antalya Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'Antalya', district: 'Muratpaşa' },
  { detsisNo: 'HAST-321', name: 'Antalya Atatürk Devlet Hastanesi', category: 'HASTANE' as const, city: 'Antalya', district: 'Muratpaşa' },
  { detsisNo: 'HAST-322', name: 'Antalya Alanya Devlet Hastanesi', category: 'HASTANE' as const, city: 'Antalya', district: 'Alanya' },
  { detsisNo: 'HAST-323', name: 'Antalya Manavgat Devlet Hastanesi', category: 'HASTANE' as const, city: 'Antalya', district: 'Manavgat' },
  
  // Adana
  { detsisNo: 'HAST-330', name: 'Adana Numune Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'Adana', district: 'Seyhan' },
  { detsisNo: 'HAST-331', name: 'Adana Dr. Aşkım Tüfekçi Devlet Hastanesi', category: 'HASTANE' as const, city: 'Adana', district: 'Seyhan' },
  
  // Konya
  { detsisNo: 'HAST-340', name: 'Konya Numune Hastanesi', category: 'HASTANE' as const, city: 'Konya', district: 'Selçuklu' },
  { detsisNo: 'HAST-341', name: 'Konya Beyhekim Devlet Hastanesi', category: 'HASTANE' as const, city: 'Konya', district: 'Selçuklu' },
  
  // Gaziantep
  { detsisNo: 'HAST-350', name: 'Gaziantep Dr. Ersin Arslan Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'Gaziantep', district: 'Şahinbey' },
  { detsisNo: 'HAST-351', name: 'Gaziantep 25 Aralık Devlet Hastanesi', category: 'HASTANE' as const, city: 'Gaziantep', district: 'Şehitkamil' },
  
  // Şanlıurfa
  { detsisNo: 'HAST-360', name: 'Şanlıurfa Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'Şanlıurfa', district: 'Haliliye' },
  { detsisNo: 'HAST-361', name: 'Şanlıurfa Mehmet Akif İnan Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'Şanlıurfa', district: 'Eyyübiye' },
  
  // Diyarbakır
  { detsisNo: 'HAST-370', name: 'Diyarbakır Gazi Yaşargil Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'Diyarbakır', district: 'Kayapınar' },
  { detsisNo: 'HAST-371', name: 'Diyarbakır Selahaddin Eyyubi Devlet Hastanesi', category: 'HASTANE' as const, city: 'Diyarbakır', district: 'Bağlar' },
  
  // Kocaeli
  { detsisNo: 'HAST-380', name: 'Kocaeli Derince Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'Kocaeli', district: 'Derince' },
  { detsisNo: 'HAST-381', name: 'Kocaeli Gebze Fatih Devlet Hastanesi', category: 'HASTANE' as const, city: 'Kocaeli', district: 'Gebze' },
  
  // Samsun
  { detsisNo: 'HAST-390', name: 'Samsun Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'Samsun', district: 'İlkadım' },
  { detsisNo: 'HAST-391', name: 'Samsun Gazi Devlet Hastanesi', category: 'HASTANE' as const, city: 'Samsun', district: 'İlkadım' },
  
  // Trabzon
  { detsisNo: 'HAST-400', name: 'Trabzon Kanuni Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'Trabzon', district: 'Ortahisar' },
  { detsisNo: 'HAST-401', name: 'Trabzon Fatih Devlet Hastanesi', category: 'HASTANE' as const, city: 'Trabzon', district: 'Ortahisar' },
  
  // Erzurum
  { detsisNo: 'HAST-410', name: 'Erzurum Bölge Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'Erzurum', district: 'Palandöken' },
  { detsisNo: 'HAST-411', name: 'Erzurum Nenehatun Kadın Doğum Hastanesi', category: 'HASTANE' as const, city: 'Erzurum', district: 'Yakutiye' },
  
  // Van
  { detsisNo: 'HAST-420', name: 'Van Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'Van', district: 'İpekyolu' },
  { detsisNo: 'HAST-421', name: 'Van Bölge Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'Van', district: 'Edremit' },
  
  // Malatya
  { detsisNo: 'HAST-430', name: 'Malatya Eğitim ve Araştırma Hastanesi', category: 'HASTANE' as const, city: 'Malatya', district: 'Yeşilyurt' },
  
  // Denizli
  { detsisNo: 'HAST-440', name: 'Denizli Devlet Hastanesi', category: 'HASTANE' as const, city: 'Denizli', district: 'Merkezefendi' },
  { detsisNo: 'HAST-441', name: 'Denizli Servergazi Devlet Hastanesi', category: 'HASTANE' as const, city: 'Denizli', district: 'Pamukkale' },
  
  // Hatay
  { detsisNo: 'HAST-450', name: 'Hatay Devlet Hastanesi', category: 'HASTANE' as const, city: 'Hatay', district: 'Antakya' },
  { detsisNo: 'HAST-451', name: 'Hatay İskenderun Devlet Hastanesi', category: 'HASTANE' as const, city: 'Hatay', district: 'İskenderun' },
  
  // Kahramanmaraş
  { detsisNo: 'HAST-460', name: 'Kahramanmaraş Necip Fazıl Şehir Hastanesi', category: 'HASTANE' as const, city: 'Kahramanmaraş', district: 'Onikişubat' },
  
  // Sakarya
  { detsisNo: 'HAST-470', name: 'Sakarya Yenikent Devlet Hastanesi', category: 'HASTANE' as const, city: 'Sakarya', district: 'Adapazarı' },
  
  // Balıkesir
  { detsisNo: 'HAST-480', name: 'Balıkesir Devlet Hastanesi', category: 'HASTANE' as const, city: 'Balıkesir', district: 'Altıeylül' },
  { detsisNo: 'HAST-481', name: 'Balıkesir Atatürk Şehir Hastanesi', category: 'HASTANE' as const, city: 'Balıkesir', district: 'Altıeylül' },
  
  // Aydın
  { detsisNo: 'HAST-490', name: 'Aydın Devlet Hastanesi', category: 'HASTANE' as const, city: 'Aydın', district: 'Efeler' },
  { detsisNo: 'HAST-491', name: 'Aydın Atatürk Devlet Hastanesi', category: 'HASTANE' as const, city: 'Aydın', district: 'Efeler' },
];
