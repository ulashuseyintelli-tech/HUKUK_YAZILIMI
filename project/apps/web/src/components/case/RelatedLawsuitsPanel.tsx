'use client';

import { useState, useEffect } from 'react';
import { 
  Scale, 
  AlertTriangle, 
  Clock, 
  FileText, 
  ChevronRight,
  ChevronDown,
  Loader2,
  Gavel,
  Shield,
  AlertCircle,
  Building2,
  Calendar,
  Download,
  Eye,
  X,
  Check,
} from 'lucide-react';
import { api } from '@/lib/api';

// ============================================
// TİPLER
// ============================================

interface LawsuitType {
  code: string;
  name: string;
  category: 'CEZA' | 'HUKUK';
  uyap_dava_turu: string;
  description: string;
  court_type: string;
  template_code: string;
  optional?: boolean;
  risk_level?: 'LOW' | 'MEDIUM' | 'HIGH';
  risk_note?: string;
}

interface DeadlineStatus {
  expiryDate: string | null;
  daysLeft: number | null;
  isExpired: boolean;
  isApproaching: boolean;
}

interface LawsuitRecommendation {
  lawsuit: LawsuitType;
  priority: number;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  actionButton: string;
  deadlineStatus?: DeadlineStatus;
}

// Açılan dava kaydı
interface OpenedLawsuit {
  id?: string;
  lawsuitCode: string;
  lawsuitName: string;
  courtName?: string;      // Sonradan eklenir
  caseNumber?: string;     // Sonradan eklenir (Esas No)
  filingDate: string;      // Şikayet tarihi
  status: 'DRAFT' | 'FILED' | 'ASSIGNED' | 'PENDING' | 'DECIDED';
  assignedCourt?: string;  // UYAP'tan gelen mahkeme
  assignedNumber?: string; // UYAP'tan gelen esas no
  notes?: string;
}

interface Props {
  caseId: string;
  caseType: string;
  stage: string;
  instrumentType?: string;
  instrumentDates?: {
    presentationDate?: string;
    maturityDate?: string;
    objectionDate?: string;
  };
  onPreparePetition?: (lawsuitCode: string, data: any) => void;
}

// ============================================
// YARDIMCI FONKSİYONLAR
// ============================================

const getUrgencyConfig = (urgency: string) => {
  switch (urgency) {
    case 'CRITICAL':
      return {
        bg: 'bg-red-50',
        border: 'border-red-200',
        text: 'text-red-700',
        badge: 'bg-red-100 text-red-800',
        icon: AlertTriangle,
      };
    case 'HIGH':
      return {
        bg: 'bg-orange-50',
        border: 'border-orange-200',
        text: 'text-orange-700',
        badge: 'bg-orange-100 text-orange-800',
        icon: Clock,
      };
    case 'MEDIUM':
      return {
        bg: 'bg-yellow-50',
        border: 'border-yellow-200',
        text: 'text-yellow-700',
        badge: 'bg-yellow-100 text-yellow-800',
        icon: AlertCircle,
      };
    default:
      return {
        bg: 'bg-gray-50',
        border: 'border-gray-200',
        text: 'text-gray-700',
        badge: 'bg-gray-100 text-gray-800',
        icon: FileText,
      };
  }
};

// ============================================
// ANA COMPONENT
// ============================================

export function RelatedLawsuitsPanel({
  caseId,
  caseType,
  stage,
  instrumentType,
  instrumentDates,
  onPreparePetition,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<LawsuitRecommendation[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Seçili dava ve form state'leri
  const [selectedLawsuit, setSelectedLawsuit] = useState<LawsuitRecommendation | null>(null);
  const [lawsuitForm, setLawsuitForm] = useState<OpenedLawsuit>({
    lawsuitCode: '',
    lawsuitName: '',
    filingDate: new Date().toISOString().split('T')[0],
    status: 'DRAFT',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [generatingDoc, setGeneratingDoc] = useState(false);
  const [generatedDoc, setGeneratedDoc] = useState<{ title: string; content: string } | null>(null);
  
  // Düzenleme modu - açılmış dava bilgilerini güncelleme
  const [editingLawsuit, setEditingLawsuit] = useState<OpenedLawsuit | null>(null);

  // Açılmış davalar listesi
  const [openedLawsuits, setOpenedLawsuits] = useState<OpenedLawsuit[]>([]);
  const [showOpenedList, setShowOpenedList] = useState(false);

  useEffect(() => {
    fetchRecommendations();
  }, [caseType, stage, instrumentType, instrumentDates]);

  const fetchRecommendations = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.post<{ recommendations: LawsuitRecommendation[] }>(
        '/related-lawsuits/recommendations',
        { caseType, stage, instrumentType, instrumentDates }
      );
      setRecommendations(response.data.recommendations || []);
    } catch (err: any) {
      console.error('İlgili davalar yüklenemedi:', err);
      setError(err.message || 'Yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  // Dava seçildiğinde formu hazırla
  const handleSelectLawsuit = (rec: LawsuitRecommendation) => {
    if (selectedLawsuit?.lawsuit.code === rec.lawsuit.code) {
      setSelectedLawsuit(null);
      setGeneratedDoc(null);
    } else {
      setSelectedLawsuit(rec);
      setLawsuitForm({
        lawsuitCode: rec.lawsuit.code,
        lawsuitName: rec.lawsuit.name,
        filingDate: new Date().toISOString().split('T')[0],
        status: 'DRAFT',
        notes: '',
      });
      setGeneratedDoc(null);
      setEditingLawsuit(null);
    }
  };

  // Dilekçe oluştur
  const handleGenerateDocument = async () => {
    if (!selectedLawsuit) return;
    
    setGeneratingDoc(true);
    try {
      if (selectedLawsuit.lawsuit.code === 'KARSILIKSIZ_CEK') {
        const response = await api.get(`/related-lawsuits/generate/karsiliksiz-cek/${caseId}`);
        setGeneratedDoc(response.data.document);
      } else {
        // Diğer davalar için genel şablon
        setGeneratedDoc({
          title: `${selectedLawsuit.lawsuit.name} Dilekçesi`,
          content: `${selectedLawsuit.lawsuit.court_type.toUpperCase()}'NE\n\n[Dilekçe içeriği hazırlanıyor...]`,
        });
      }
    } catch (err: any) {
      console.error('Dilekçe oluşturulamadı:', err);
      alert('Dilekçe oluşturulurken hata oluştu: ' + (err.message || 'Bilinmeyen hata'));
    } finally {
      setGeneratingDoc(false);
    }
  };

  // Dava kaydını kaydet (şikayet yapıldı olarak işaretle)
  const handleSaveLawsuit = async () => {
    setSaving(true);
    try {
      // TODO: API'ye kaydet
      const newLawsuit: OpenedLawsuit = {
        ...lawsuitForm,
        id: Date.now().toString(),
        status: 'FILED', // Şikayet yapıldı
      };
      setOpenedLawsuits(prev => [...prev, newLawsuit]);
      setSelectedLawsuit(null);
      setGeneratedDoc(null);
      alert('Şikayet kaydı oluşturuldu! UYAP\'tan dosya numarası geldiğinde güncelleyebilirsiniz.');
    } catch (err: any) {
      console.error('Dava kaydedilemedi:', err);
    } finally {
      setSaving(false);
    }
  };

  // Açılmış dava bilgilerini güncelle (UYAP'tan gelen bilgiler)
  const handleUpdateLawsuit = async () => {
    if (!editingLawsuit) return;
    
    setSaving(true);
    try {
      setOpenedLawsuits(prev => prev.map(l => 
        l.id === editingLawsuit.id ? editingLawsuit : l
      ));
      setEditingLawsuit(null);
      alert('Dava bilgileri güncellendi!');
    } catch (err: any) {
      console.error('Güncelleme hatası:', err);
    } finally {
      setSaving(false);
    }
  };

  // Word olarak indir
  const handleDownloadWord = async () => {
    if (!selectedLawsuit) return;
    
    try {
      const response = await api.get(
        `/related-lawsuits/generate/karsiliksiz-cek/${caseId}/word`,
        { responseType: 'blob' }
      );
      
      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedLawsuit.lawsuit.name.replace(/\s+/g, '-')}-${caseId}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Word indirilemedi:', err);
      alert('Word dosyası indirilemedi');
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Davalar yükleniyor...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border p-4">
        <div className="text-center py-4 text-red-600 text-sm">
          <AlertTriangle className="h-5 w-5 mx-auto mb-2" />
          {error}
        </div>
      </div>
    );
  }

  // Kategorilere ayır
  const cezaDavalari = recommendations.filter(r => r.lawsuit.category === 'CEZA');
  const hukukDavalari = recommendations.filter(r => r.lawsuit.category === 'HUKUK');

  return (
    <div className="bg-white rounded-lg border p-4 space-y-3">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Scale className="h-4 w-4 text-purple-600" />
          İlgili Davalar
          <span className="text-xs font-normal text-muted-foreground">
            ({recommendations.length} öneri)
          </span>
        </h3>
        {openedLawsuits.length > 0 && (
          <button
            onClick={() => setShowOpenedList(!showOpenedList)}
            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
          >
            <FileText className="h-3 w-3" />
            Açılan Davalar ({openedLawsuits.length})
          </button>
        )}
      </div>

      {/* Açılan Davalar Listesi */}
      {showOpenedList && openedLawsuits.length > 0 && (
        <div className="bg-blue-50 rounded-lg p-3 space-y-2">
          <h4 className="text-xs font-medium text-blue-800">Açılan Şikayetler / Davalar</h4>
          {openedLawsuits.map((ol) => (
            <div key={ol.id} className="bg-white rounded p-2 text-xs border border-blue-200">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="font-medium">{ol.lawsuitName}</p>
                  <p className="text-gray-500">Şikayet Tarihi: {new Date(ol.filingDate).toLocaleDateString('tr-TR')}</p>
                  {ol.assignedCourt && (
                    <p className="text-green-700 mt-1">
                      📋 {ol.assignedCourt} - Esas No: {ol.assignedNumber || 'Bekleniyor'}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`px-2 py-0.5 rounded text-[10px] ${
                    ol.status === 'FILED' ? 'bg-yellow-100 text-yellow-700' :
                    ol.status === 'ASSIGNED' ? 'bg-green-100 text-green-700' :
                    ol.status === 'PENDING' ? 'bg-blue-100 text-blue-700' :
                    ol.status === 'DECIDED' ? 'bg-purple-100 text-purple-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {ol.status === 'DRAFT' ? 'Taslak' :
                     ol.status === 'FILED' ? 'Şikayet Yapıldı' :
                     ol.status === 'ASSIGNED' ? 'Mahkemeye Düştü' :
                     ol.status === 'PENDING' ? 'Duruşma Bekliyor' : 'Karara Bağlandı'}
                  </span>
                  {!ol.assignedCourt && (
                    <button
                      onClick={() => setEditingLawsuit(ol)}
                      className="text-[10px] text-blue-600 hover:underline"
                    >
                      + Mahkeme Bilgisi Ekle
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Düzenleme Formu - UYAP'tan gelen bilgileri ekle */}
      {editingLawsuit && (
        <div className="bg-green-50 rounded-lg p-3 border border-green-200">
          <h4 className="text-xs font-medium text-green-800 mb-2 flex items-center gap-1">
            <Building2 className="h-3 w-3" />
            UYAP Bilgilerini Güncelle - {editingLawsuit.lawsuitName}
          </h4>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">Mahkeme Adı</label>
              <input
                type="text"
                value={editingLawsuit.assignedCourt || ''}
                onChange={(e) => setEditingLawsuit(prev => prev ? { ...prev, assignedCourt: e.target.value } : null)}
                placeholder="Örn: İstanbul 1. İcra Ceza Mah."
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">Esas Numarası</label>
              <input
                type="text"
                value={editingLawsuit.assignedNumber || ''}
                onChange={(e) => setEditingLawsuit(prev => prev ? { ...prev, assignedNumber: e.target.value } : null)}
                placeholder="Örn: 2025/1234"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">Durum</label>
              <select
                value={editingLawsuit.status}
                onChange={(e) => setEditingLawsuit(prev => prev ? { ...prev, status: e.target.value as any } : null)}
                className="w-full border rounded px-2 py-1 text-xs"
              >
                <option value="FILED">Şikayet Yapıldı</option>
                <option value="ASSIGNED">Mahkemeye Düştü</option>
                <option value="PENDING">Duruşma Bekliyor</option>
                <option value="DECIDED">Karara Bağlandı</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={handleUpdateLawsuit}
                disabled={saving}
                className="flex-1 px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? 'Kaydediliyor...' : 'Güncelle'}
              </button>
              <button
                onClick={() => setEditingLawsuit(null)}
                className="px-3 py-1 text-xs border rounded hover:bg-gray-50"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {recommendations.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          Bu aşamada açılabilecek dava bulunmuyor.
        </p>
      ) : (
        <>
          {/* Öneri Kartları - Kompakt */}
          <div className="space-y-1.5">
            {/* Ceza Davaları */}
            {cezaDavalari.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-gray-500 mb-1 flex items-center gap-1">
                  <Gavel className="h-3 w-3" /> Ceza Davaları
                </p>
                {cezaDavalari.map((rec) => {
                  const config = getUrgencyConfig(rec.urgency);
                  const isSelected = selectedLawsuit?.lawsuit.code === rec.lawsuit.code;
                  
                  return (
                    <div
                      key={rec.lawsuit.code}
                      onClick={() => handleSelectLawsuit(rec)}
                      className={`p-2 rounded-lg border cursor-pointer transition-all ${
                        isSelected 
                          ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500' 
                          : `${config.border} ${config.bg} hover:shadow-sm`
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <config.icon className={`h-4 w-4 ${isSelected ? 'text-purple-600' : config.text}`} />
                          <div>
                            <p className={`text-sm font-medium ${isSelected ? 'text-purple-700' : config.text}`}>
                              {rec.lawsuit.name}
                            </p>
                            <p className="text-[10px] text-gray-500">{rec.message}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${config.badge}`}>
                            {rec.urgency === 'CRITICAL' ? 'ACİL' : 
                             rec.urgency === 'HIGH' ? 'ÖNEMLİ' : 
                             rec.urgency === 'MEDIUM' ? 'ORTA' : 'DÜŞÜK'}
                          </span>
                          {isSelected ? (
                            <ChevronDown className="h-4 w-4 text-purple-600" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-400" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Hukuk Davaları */}
            {hukukDavalari.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-gray-500 mb-1 flex items-center gap-1">
                  <Scale className="h-3 w-3" /> Hukuk Davaları
                </p>
                {hukukDavalari.map((rec) => {
                  const config = getUrgencyConfig(rec.urgency);
                  const isSelected = selectedLawsuit?.lawsuit.code === rec.lawsuit.code;
                  
                  return (
                    <div
                      key={rec.lawsuit.code}
                      onClick={() => handleSelectLawsuit(rec)}
                      className={`p-2 rounded-lg border cursor-pointer transition-all ${
                        isSelected 
                          ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500' 
                          : `${config.border} ${config.bg} hover:shadow-sm`
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <config.icon className={`h-4 w-4 ${isSelected ? 'text-purple-600' : config.text}`} />
                          <div>
                            <p className={`text-sm font-medium ${isSelected ? 'text-purple-700' : config.text}`}>
                              {rec.lawsuit.name}
                            </p>
                            <p className="text-[10px] text-gray-500">{rec.message}</p>
                            {rec.lawsuit.risk_level === 'HIGH' && (
                              <p className="text-[10px] text-red-600 flex items-center gap-1">
                                <Shield className="h-3 w-3" />
                                {rec.lawsuit.risk_note || 'Yüksek riskli'}
                              </p>
                            )}
                          </div>
                        </div>
                        {isSelected ? (
                          <ChevronDown className="h-4 w-4 text-purple-600" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Seçili Dava Detay Formu */}
          {selectedLawsuit && (
            <div className="border-t pt-3 mt-3 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-purple-700 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {selectedLawsuit.lawsuit.name}
                </h4>
                <button
                  onClick={() => { setSelectedLawsuit(null); setGeneratedDoc(null); }}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              </div>

              {/* Bilgi Kutusu */}
              <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs text-blue-800">
                <p className="font-medium mb-1">📋 Şikayet Süreci</p>
                <ol className="list-decimal list-inside space-y-0.5 text-[10px]">
                  <li>Dilekçeyi oluşturun ve UYAP'a yükleyin</li>
                  <li>UYAP tevzi sistemi dosyayı ilgili {selectedLawsuit.lawsuit.court_type}'ne yönlendirir</li>
                  <li>Mahkeme ve esas numarası atandığında buraya ekleyin</li>
                </ol>
              </div>

              {/* Şikayet Tarihi ve Not */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">
                    <Calendar className="h-3 w-3 inline mr-1" />
                    Şikayet Tarihi
                  </label>
                  <input
                    type="date"
                    value={lawsuitForm.filingDate}
                    onChange={(e) => setLawsuitForm(prev => ({ ...prev, filingDate: e.target.value }))}
                    className="w-full border rounded px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">Yetkili Mahkeme Türü</label>
                  <input
                    type="text"
                    value={selectedLawsuit.lawsuit.court_type}
                    disabled
                    className="w-full border rounded px-2 py-1 text-xs bg-gray-50 text-gray-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">Notlar (Opsiyonel)</label>
                <textarea
                  value={lawsuitForm.notes}
                  onChange={(e) => setLawsuitForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Şikayet ile ilgili notlar..."
                  rows={2}
                  className="w-full border rounded px-2 py-1 text-xs"
                />
              </div>

              {/* Aksiyon Butonları */}
              <div className="flex gap-2">
                <button
                  onClick={handleGenerateDocument}
                  disabled={generatingDoc}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                >
                  {generatingDoc ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Eye className="h-3 w-3" />
                  )}
                  Dilekçe Oluştur
                </button>
              </div>

              {/* Oluşturulan Dilekçe */}
              {generatedDoc && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-100 px-3 py-2 flex items-center justify-between">
                    <span className="text-xs font-medium">{generatedDoc.title}</span>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDownloadWord}
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                      >
                        <Download className="h-3 w-3" />
                        Word İndir
                      </button>
                    </div>
                  </div>
                  <div className="p-3 bg-white max-h-60 overflow-y-auto">
                    <pre className="text-[10px] whitespace-pre-wrap font-mono text-gray-700">
                      {generatedDoc.content}
                    </pre>
                  </div>
                  
                  {/* Şikayeti Kaydet Butonu */}
                  <div className="bg-green-50 px-3 py-2 border-t">
                    <button
                      onClick={handleSaveLawsuit}
                      disabled={saving}
                      className="w-full flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                    >
                      {saving ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      Şikayeti Kaydet (UYAP'a Yüklendi)
                    </button>
                    <p className="text-[10px] text-green-700 mt-1 text-center">
                      Mahkeme ve esas numarası UYAP'tan geldiğinde güncelleyebilirsiniz
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Bilgi Notu */}
      <div className="text-[10px] text-gray-500 pt-2 border-t">
        💡 Dava önerisine tıklayarak detayları görün ve dilekçe oluşturun.
      </div>
    </div>
  );
}

export default RelatedLawsuitsPanel;
