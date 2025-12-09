'use client';

import { useState } from 'react';
import { 
  Sparkles, 
  FileText, 
  Download, 
  Loader2, 
  Copy, 
  Check,
  FileDown,
  Wand2,
  ScrollText,
  FileSignature,
  AlertCircle,
  ClipboardList
} from 'lucide-react';
import { api } from '@/lib/api';

type DocumentType = 'DILEKCE' | 'SOZLESME' | 'IHTARNAME' | 'VEKALETNAME' | 'TUTANAK' | 'DIGER';

const documentTypes: { value: DocumentType; label: string; icon: any; description: string }[] = [
  { value: 'DILEKCE', label: 'Dilekçe', icon: FileText, description: 'Mahkeme veya resmi kurumlara dilekçe' },
  { value: 'SOZLESME', label: 'Sözleşme', icon: FileSignature, description: 'Her türlü sözleşme metni' },
  { value: 'IHTARNAME', label: 'İhtarname', icon: AlertCircle, description: 'Noter ihtarnamesi' },
  { value: 'VEKALETNAME', label: 'Vekaletname', icon: ScrollText, description: 'Yetki belgesi' },
  { value: 'TUTANAK', label: 'Tutanak', icon: ClipboardList, description: 'Toplantı veya olay tutanağı' },
  { value: 'DIGER', label: 'Diğer', icon: Wand2, description: 'Özel belge türü' },
];

export default function AiToolsPage() {
  const [prompt, setPrompt] = useState('');
  const [documentType, setDocumentType] = useState<DocumentType>('DILEKCE');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Lütfen bir prompt girin');
      return;
    }

    setLoading(true);
    setError(null);
    setGeneratedContent('');

    try {
      const response = await api.post('/ai/document/generate', {
        prompt,
        documentType,
        outputFormat: 'TEXT',
        metadata: {
          title: title || undefined,
          date: new Date().toLocaleDateString('tr-TR'),
        },
      });

      if (response.data?.data?.content) {
        setGeneratedContent(response.data.data.content);
      }
    } catch (err: any) {
      setError(err.message || 'Belge oluşturulurken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!prompt.trim()) {
      setError('Lütfen önce bir belge oluşturun');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:8080/api/ai/document/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          prompt,
          documentType,
          outputFormat: 'PDF',
          metadata: {
            title: title || undefined,
            date: new Date().toLocaleDateString('tr-TR'),
          },
        }),
      });

      if (!response.ok) throw new Error('PDF oluşturulamadı');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${documentType.toLowerCase()}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (err: any) {
      setError(err.message || 'PDF indirilemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadTxt = () => {
    const blob = new Blob([generatedContent], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${documentType.toLowerCase()}_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-xl">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold">AI Tools</h1>
        </div>
        <p className="text-muted-foreground">
          Yapay zeka destekli belge oluşturma araçları
        </p>
      </div>


      <div className="grid lg:grid-cols-2 gap-6">
        {/* Sol Panel - Input */}
        <div className="space-y-6">
          {/* Belge Türü Seçimi */}
          <div className="bg-white rounded-xl border p-6">
            <h2 className="font-semibold mb-4">Belge Türü</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {documentTypes.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setDocumentType(type.value)}
                  className={`p-3 rounded-lg border-2 transition-all text-left ${
                    documentType === type.value
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <type.icon className={`h-5 w-5 mb-2 ${
                    documentType === type.value ? 'text-indigo-600' : 'text-gray-400'
                  }`} />
                  <p className={`text-sm font-medium ${
                    documentType === type.value ? 'text-indigo-700' : 'text-gray-700'
                  }`}>
                    {type.label}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Başlık */}
          <div className="bg-white rounded-xl border p-6">
            <label className="block font-semibold mb-2">Belge Başlığı (Opsiyonel)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Örn: İcra Takibi İtiraz Dilekçesi"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Prompt */}
          <div className="bg-white rounded-xl border p-6">
            <label className="block font-semibold mb-2">
              Belge İçeriği / Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={`Örnek: "İstanbul 5. İcra Müdürlüğü'ne hitaben, 2024/12345 sayılı dosyada borçlu olarak gösterildiğim takibe itiraz ediyorum. Borcum bulunmamaktadır, alacaklı ile aramda herhangi bir hukuki ilişki yoktur."`}
              rows={8}
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Ne kadar detaylı yazarsanız, o kadar iyi sonuç alırsınız.
            </p>
          </div>

          {/* Butonlar */}
          <div className="flex gap-3">
            <button
              onClick={handleGenerate}
              disabled={loading || !prompt.trim()}
              className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Oluşturuluyor...
                </>
              ) : (
                <>
                  <Wand2 className="h-5 w-5" />
                  Belge Oluştur
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Sağ Panel - Output */}
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Oluşturulan Belge</h2>
            {generatedContent && (
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Kopyala"
                >
                  {copied ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5" />}
                </button>
                <button
                  onClick={handleDownloadTxt}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  title="TXT İndir"
                >
                  <FileDown className="h-5 w-5" />
                </button>
                <button
                  onClick={handleDownloadPDF}
                  disabled={loading}
                  className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2 text-sm disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  PDF İndir
                </button>
              </div>
            )}
          </div>

          {generatedContent ? (
            <div className="bg-gray-50 rounded-lg p-4 min-h-[400px] max-h-[600px] overflow-y-auto">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                {generatedContent}
              </pre>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-8 min-h-[400px] flex flex-col items-center justify-center text-center">
              <Sparkles className="h-12 w-12 text-gray-300 mb-4" />
              <p className="text-gray-500 mb-2">Henüz belge oluşturulmadı</p>
              <p className="text-sm text-gray-400">
                Sol taraftan belge türünü seçin ve prompt girin
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Hazır Şablonlar */}
      <div className="mt-8 bg-white rounded-xl border p-6">
        <h2 className="font-semibold mb-4">Hazır Şablonlar</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { title: 'İcra İtiraz Dilekçesi', prompt: 'İcra takibine itiraz dilekçesi hazırla. Borcun olmadığını, alacaklı ile hukuki ilişki bulunmadığını belirt.' },
            { title: 'Kira Alacağı İhtarname', prompt: 'Kiracıya ödenmeyen kira alacağı için ihtarname hazırla. 30 gün süre ver, aksi halde tahliye davası açılacağını belirt.' },
            { title: 'Haciz İtiraz Dilekçesi', prompt: 'Haczedilen mala itiraz dilekçesi hazırla. Malın 3. kişiye ait olduğunu, istihkak iddiasında bulunulduğunu belirt.' },
            { title: 'Ödeme Taahhüdü', prompt: 'Borçlunun ödeme taahhüdü metni hazırla. Taksitli ödeme planı, gecikme halinde tüm borcun muaccel olacağı belirtilsin.' },
          ].map((template, index) => (
            <button
              key={index}
              onClick={() => {
                setPrompt(template.prompt);
                setDocumentType('DILEKCE');
              }}
              className="p-4 border rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-all text-left"
            >
              <FileText className="h-5 w-5 text-indigo-500 mb-2" />
              <p className="font-medium text-sm">{template.title}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
