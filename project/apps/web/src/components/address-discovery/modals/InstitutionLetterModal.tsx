'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Spinner } from '@hukuk/ui';
import { Building2, X } from 'lucide-react';
import { api, InstitutionType, InstitutionTemplateInfo } from '@/lib/api';
import { toActionErrorMessage } from '@/lib/action-error';

interface InstitutionLetterModalProps {
  open: boolean;
  onClose: () => void;
  caseDebtorId: string;
  onSuccess?: () => void;
}

const INSTITUTION_ICONS: Record<InstitutionType, string> = {
  SGK: '🏥',
  VERGI_DAIRESI: '💰',
  TICARET_SICILI: '📋',
  BELEDIYE: '🏛️',
  TAPU: '🏠',
  NUFUS: '👤',
};

const INSTITUTION_NAMES: Record<InstitutionType, string> = {
  SGK: 'SGK',
  VERGI_DAIRESI: 'Vergi Dairesi',
  TICARET_SICILI: 'Ticaret Sicili',
  BELEDIYE: 'Belediye',
  TAPU: 'Tapu',
  NUFUS: 'Nüfus',
};

export function InstitutionLetterModal({
  open,
  onClose,
  caseDebtorId,
  onSuccess,
}: InstitutionLetterModalProps) {
  const [templates, setTemplates] = useState<InstitutionTemplateInfo[]>([]);
  const [selectedInstitution, setSelectedInstitution] = useState<InstitutionType | null>(null);
  const [selectedLetterType, setSelectedLetterType] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // WSMR-A4-AC-02: eskiden hata durumunda hiçbir state dokunulmuyordu (yalnız
  // console.error) — açıklamasız boş bir kurum ızgarası "şablon yok" (gerçek
  // boşlukla AYNI) görünüyordu. Ayrıca bu modal örneği açık/kapalı arası
  // UNMOUNT OLMUYOR (yalnız `open` prop'u değişir) — kimlik değişim koruması
  // olmadan, ÖNCEKİ borçlunun seçimi/taslak metni YENİ borçlunun bağlamında
  // sessizce kalıp YANLIŞ borçluya gönderilebiliyordu (UyapQueryModal,
  // WSMR-A4-AB-20 ile birebir aynı anti-pattern — bu onun ikizi).
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const fetchTokenRef = useRef(0);
  const fetchInFlightRef = useRef(false);
  const prevCaseDebtorIdRef = useRef<string | null>(null);

  const loadTemplates = useCallback(async () => {
    if (fetchInFlightRef.current) return; // çift-tetik -> tek aktif istek
    fetchInFlightRef.current = true;
    const token = ++fetchTokenRef.current;
    setLoading(true);
    try {
      const data = await api.getInstitutionTemplates();
      if (!isMountedRef.current || token !== fetchTokenRef.current) return; // bayat/unmount
      if (!Array.isArray(data)) {
        throw new Error('MALFORMED_INSTITUTION_TEMPLATES_RESPONSE');
      }
      setTemplates(data);
      setLoadError(null);
    } catch (err) {
      if (!isMountedRef.current || token !== fetchTokenRef.current) return;
      console.error('Şablonlar yüklenemedi:', err);
      // templates BİLEREK dokunulmaz — önceki başarıyla yüklenmiş liste
      // (varsa) SİLİNMEZ; yalnız bayat olduğu bantta görünür olur. "Şablon
      // yok" ile ASLA KARIŞTIRILMAZ.
      setLoadError(toActionErrorMessage(err, 'Kurum yazısı şablonları yüklenemedi.'));
    } finally {
      if (token === fetchTokenRef.current) {
        fetchInFlightRef.current = false;
        if (isMountedRef.current) setLoading(false);
      }
    }
  }, []);

  const retryLoad = useCallback(async () => {
    setRetrying(true);
    fetchInFlightRef.current = false; // manuel retry -> in-flight bayrağını sıfırla
    try {
      await loadTemplates();
    } finally {
      if (isMountedRef.current) setRetrying(false);
    }
  }, [loadTemplates]);

  useEffect(() => {
    if (open) {
      if (prevCaseDebtorIdRef.current !== caseDebtorId) {
        // Borçlu KİMLİĞİ değişti (bu modal örneği açık/kapalı arası UNMOUNT
        // OLMADIĞI için farklı bir borçlu için yeniden kullanılabilir) —
        // ÖNCEKİ borçlunun seçimi/taslak metni YENİ borçlunun bağlamında
        // YANLIŞLIKLA görünmez veya YANLIŞ borçluya gönderilmez. (Şablon
        // listesinin kendisi caseDebtorId'e bağlı DEĞİL — API sözleşmesi
        // parametre almıyor — bu yüzden `templates` burada TEMİZLENMEZ,
        // yalnız borçluya özgü seçim/taslak state'i temizlenir.)
        prevCaseDebtorIdRef.current = caseDebtorId;
        setSelectedInstitution(null);
        setSelectedLetterType('');
        setSubject('');
        setBody('');
        setLoadError(null);
      }
      // Modal (yeniden) açıldı — ÖNCEKİ, belki hâlâ in-flight bir denemenin
      // bayrağı YENİ denemeyi ENGELLEMEMELİ; jenerasyon token'ı ESKİ
      // denemenin GEÇ gelen yanıtını zaten atlar (A4-AB-8/12/14/20 ile aynı
      // tasarım deseni).
      fetchInFlightRef.current = false;
      loadTemplates();
    }
  }, [open, caseDebtorId, loadTemplates]);

  useEffect(() => {
    if (selectedInstitution) {
      const template = templates.find(t => t.institution === selectedInstitution);
      if (template) {
        setSubject(template.defaultSubject);
        setSelectedLetterType(template.letterTypes[0] || '');
      }
    }
  }, [selectedInstitution, templates]);

  const handleSubmit = async () => {
    if (!selectedInstitution || !selectedLetterType) return;

    try {
      setSubmitting(true);
      await api.createInstitutionLetter({
        caseDebtorId,
        institution: selectedInstitution,
        letterType: selectedLetterType,
        subject: subject || undefined,
        body: body || undefined,
      });
      onSuccess?.();
      onClose();
    } catch (error: any) {
      alert(error.message || 'Yazı oluşturulamadı');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedTemplate = templates.find(t => t.institution === selectedInstitution);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Yeni Kurum Yazısı
            </h2>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 overflow-y-auto max-h-[60vh]">
            {loadError && (
              // WSMR-A4-AC-02: okuma hatası açıklamasız boş bir kurum ızgarasıyla
              // ("şablon yok" gerçek boşluğu) ASLA KARIŞTIRILMAZ. Önceki başarıyla
              // yüklenmiş liste (varsa) aşağıda GÖRÜNMEYE devam eder — yalnız bayat
              // olabileceği belirtilir.
              <div role="alert" className="mb-3 flex items-start justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                <span>
                  {loadError}
                  {templates.length > 0 ? ' Gösterilen liste bayat olabilir.' : ''}
                </span>
                <button
                  type="button"
                  onClick={retryLoad}
                  disabled={retrying}
                  className="shrink-0 rounded bg-red-100 px-2 py-1 text-red-800 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {retrying ? 'Deneniyor…' : 'Tekrar dene'}
                </button>
              </div>
            )}
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size="md" />
              </div>
            ) : loadError && templates.length === 0 ? null : (
              <div className="space-y-4">
                {/* Institution Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Kurum</label>
                  <div className="grid grid-cols-3 gap-2">
                    {templates.map((template) => {
                      const isSelected = selectedInstitution === template.institution;
                      return (
                        <button
                          key={template.institution}
                          type="button"
                          className={`p-3 rounded-lg border text-center transition-colors ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-blue-300'
                          }`}
                          onClick={() => setSelectedInstitution(template.institution)}
                        >
                          <span className="text-2xl block mb-1">
                            {INSTITUTION_ICONS[template.institution]}
                          </span>
                          <span className="text-xs font-medium">{template.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Letter Type */}
                {selectedTemplate && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Yazı Türü</label>
                    <select
                      value={selectedLetterType}
                      onChange={(e) => setSelectedLetterType(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Yazı türü seçin</option>
                      {selectedTemplate.letterTypes.map((type) => (
                        <option key={type} value={type}>
                          {type.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Subject */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Konu</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Yazı konusu..."
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Body (Optional) */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">İçerik (Opsiyonel)</label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Özel içerik eklemek isterseniz buraya yazın..."
                    rows={4}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  />
                  <p className="text-xs text-gray-500">
                    Boş bırakırsanız seçilen kurum ve yazı türüne göre otomatik içerik oluşturulur.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              İptal
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!selectedInstitution || !selectedLetterType || submitting}
            >
              {submitting ? <Spinner size="sm" /> : 'Yazı Oluştur'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
