'use client';

import { useState } from 'react';
import { HelpCircle, Book, Video, MessageCircle, Search, ChevronRight, ExternalLink, FileText, Keyboard, Mail } from 'lucide-react';

interface HelpArticle {
  id: string;
  title: string;
  category: string;
  content: string;
  tags: string[];
}

interface FAQ {
  question: string;
  answer: string;
}

const CATEGORIES = [
  { id: 'getting-started', label: 'Başlangıç', icon: <Book className="h-5 w-5" /> },
  { id: 'cases', label: 'Dosya Yönetimi', icon: <FileText className="h-5 w-5" /> },
  { id: 'shortcuts', label: 'Kısayollar', icon: <Keyboard className="h-5 w-5" /> },
  { id: 'videos', label: 'Video Eğitimler', icon: <Video className="h-5 w-5" /> },
];

const FAQS: FAQ[] = [
  { question: 'Yeni dosya nasıl açılır?', answer: 'Ana menüden "Yeni Takip" butonuna tıklayın veya Ctrl+N kısayolunu kullanın. Sihirbaz sizi adım adım yönlendirecektir.' },
  { question: 'Toplu belge nasıl oluşturulur?', answer: 'Dosya listesinde birden fazla dosya seçin, ardından "Toplu Belge" butonuna tıklayın. Şablon seçerek belgelerinizi oluşturabilirsiniz.' },
  { question: 'Vekalet süresi nasıl takip edilir?', answer: 'Müvekkil sayfasından vekaletleri görüntüleyebilirsiniz. Süresi dolmak üzere olan vekaletler dashboard\'da uyarı olarak gösterilir.' },
  { question: 'Rapor nasıl dışa aktarılır?', answer: 'Raporlar sayfasından istediğiniz raporu seçin, ardından Excel veya PDF formatında dışa aktarabilirsiniz.' },
  { question: 'Klavye kısayolları nelerdir?', answer: 'Ctrl+K: Arama, Ctrl+N: Yeni Takip, Ctrl+D: Dashboard, /: Kısayol yardımı. Tüm kısayollar için / tuşuna basın.' },
];

const SHORTCUTS = [
  { keys: ['Ctrl', 'K'], description: 'Global arama' },
  { keys: ['Ctrl', 'N'], description: 'Yeni takip oluştur' },
  { keys: ['Ctrl', 'D'], description: 'Dashboard\'a git' },
  { keys: ['Ctrl', 'T'], description: 'Takvime git' },
  { keys: ['Ctrl', 'R'], description: 'Raporlara git' },
  { keys: ['/'], description: 'Kısayol yardımını göster' },
  { keys: ['Esc'], description: 'Modal/popup kapat' },
];

export function HelpCenter() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('getting-started');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const filteredFaqs = search
    ? FAQS.filter(f => f.question.toLowerCase().includes(search.toLowerCase()) || f.answer.toLowerCase().includes(search.toLowerCase()))
    : FAQS;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center py-8">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <HelpCircle className="h-8 w-8 text-blue-600" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Yardım Merkezi</h1>
        <p className="text-gray-500">Size nasıl yardımcı olabiliriz?</p>
      </div>

      {/* Search */}
      <div className="relative max-w-xl mx-auto">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Soru veya konu ara..." className="w-full pl-12 pr-4 py-3 border rounded-xl text-lg" />
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {CATEGORIES.map((cat) => (
          <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`p-4 rounded-xl border text-left hover:shadow-md transition-shadow ${activeCategory === cat.id ? 'border-blue-500 bg-blue-50' : 'bg-white'}`}>
            <div className={`p-2 rounded-lg inline-block mb-2 ${activeCategory === cat.id ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>{cat.icon}</div>
            <p className="font-medium">{cat.label}</p>
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* FAQ Section */}
        <div className="md:col-span-2 bg-white rounded-xl border p-6">
          <h2 className="font-semibold mb-4">Sık Sorulan Sorular</h2>
          <div className="space-y-2">
            {filteredFaqs.map((faq, i) => (
              <div key={i} className="border rounded-lg overflow-hidden">
                <button onClick={() => setExpandedFaq(expandedFaq === i ? null : i)} className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50">
                  <span className="font-medium">{faq.question}</span>
                  <ChevronRight className={`h-5 w-5 text-gray-400 transition-transform ${expandedFaq === i ? 'rotate-90' : ''}`} />
                </button>
                {expandedFaq === i && (
                  <div className="px-4 pb-4 text-gray-600 text-sm">{faq.answer}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Shortcuts */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2"><Keyboard className="h-5 w-5" />Klavye Kısayolları</h2>
          <div className="space-y-3">
            {SHORTCUTS.map((s, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{s.description}</span>
                <div className="flex gap-1">
                  {s.keys.map((k, j) => (
                    <kbd key={j} className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">{k}</kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Contact Support */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg mb-1">Hala yardıma mı ihtiyacınız var?</h3>
            <p className="text-blue-100">Destek ekibimiz size yardımcı olmaktan mutluluk duyar.</p>
          </div>
          <div className="flex gap-3">
            <a href="mailto:destek@hukuk.com" className="flex items-center gap-2 px-4 py-2 bg-white text-blue-600 rounded-lg hover:bg-blue-50">
              <Mail className="h-4 w-4" />E-posta Gönder
            </a>
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-400 text-white rounded-lg hover:bg-blue-300">
              <MessageCircle className="h-4 w-4" />Canlı Destek
            </button>
          </div>
        </div>
      </div>

      {/* Documentation Links */}
      <div className="grid md:grid-cols-3 gap-4">
        <a href="#" className="flex items-center gap-3 p-4 bg-white rounded-xl border hover:shadow-md">
          <Book className="h-6 w-6 text-blue-600" />
          <div>
            <p className="font-medium">Kullanım Kılavuzu</p>
            <p className="text-sm text-gray-500">Detaylı dokümantasyon</p>
          </div>
          <ExternalLink className="h-4 w-4 text-gray-400 ml-auto" />
        </a>
        <a href="#" className="flex items-center gap-3 p-4 bg-white rounded-xl border hover:shadow-md">
          <Video className="h-6 w-6 text-purple-600" />
          <div>
            <p className="font-medium">Video Eğitimler</p>
            <p className="text-sm text-gray-500">Adım adım rehberler</p>
          </div>
          <ExternalLink className="h-4 w-4 text-gray-400 ml-auto" />
        </a>
        <a href="#" className="flex items-center gap-3 p-4 bg-white rounded-xl border hover:shadow-md">
          <FileText className="h-6 w-6 text-green-600" />
          <div>
            <p className="font-medium">Sürüm Notları</p>
            <p className="text-sm text-gray-500">Yenilikler ve güncellemeler</p>
          </div>
          <ExternalLink className="h-4 w-4 text-gray-400 ml-auto" />
        </a>
      </div>
    </div>
  );
}
