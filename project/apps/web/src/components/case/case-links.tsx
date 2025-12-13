'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Link2, Plus, Trash2, Search, X, Loader2, ExternalLink, ArrowRight } from 'lucide-react';

interface LinkedCase {
  id: string;
  caseId: string;
  fileNumber: string;
  clientName?: string;
  linkType: 'parent' | 'child' | 'related';
  notes?: string;
}

interface CaseLinksProps {
  caseId: string;
  caseNumber: string;
}

const LINK_TYPES = [
  { id: 'parent', name: 'Ana Dosya', description: 'Bu dosya seçilen dosyanın alt dosyasıdır' },
  { id: 'child', name: 'Alt Dosya', description: 'Seçilen dosya bu dosyanın alt dosyasıdır' },
  { id: 'related', name: 'İlişkili', description: 'Dosyalar birbiriyle ilişkilidir' },
];

export function CaseLinks({ caseId, caseNumber }: CaseLinksProps) {
  const [links, setLinks] = useState<LinkedCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCase, setSelectedCase] = useState<any>(null);
  const [linkType, setLinkType] = useState<string>('related');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadLinks();
  }, [caseId]);

  const loadLinks = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/cases/${caseId}/links`);
      setLinks(res.data?.data || []);
    } catch (e) {
      // Demo data
      setLinks([
        {
          id: '1',
          caseId: 'case-2',
          fileNumber: '2024/1002',
          clientName: 'ABC Şirketi',
          linkType: 'related',
          notes: 'Aynı borçlu ile ilgili dosya',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await api.get(`/cases?search=${encodeURIComponent(searchQuery)}&limit=5`);
      const results = (res.data?.data || []).filter((c: any) => c.id !== caseId);
      setSearchResults(results);
    } catch (e) {
      console.error(e);
    } finally {
      setSearching(false);
    }
  };

  const handleAddLink = async () => {
    if (!selectedCase) return;
    setSaving(true);
    
    try {
      await api.post(`/cases/${caseId}/links`, {
        linkedCaseId: selectedCase.id,
        linkType,
        notes,
      });
      loadLinks();
    } catch (e) {
      // Demo: add locally
      const newLink: LinkedCase = {
        id: Date.now().toString(),
        caseId: selectedCase.id,
        fileNumber: selectedCase.fileNumber,
        clientName: selectedCase.client?.displayName || selectedCase.client?.name,
        linkType: linkType as LinkedCase['linkType'],
        notes,
      };
      setLinks(prev => [...prev, newLink]);
    } finally {
      setSaving(false);
      resetModal();
    }
  };

  const handleRemoveLink = async (linkId: string) => {
    if (!confirm('Bu bağlantıyı kaldırmak istediğinize emin misiniz?')) return;
    
    try {
      await api.delete(`/cases/${caseId}/links/${linkId}`);
    } catch (e) {
      // Demo: remove locally
    }
    setLinks(prev => prev.filter(l => l.id !== linkId));
  };

  const resetModal = () => {
    setShowAddModal(false);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedCase(null);
    setLinkType('related');
    setNotes('');
  };

  const getLinkTypeInfo = (type: string) => {
    return LINK_TYPES.find(t => t.id === type) || LINK_TYPES[2];
  };

  const getLinkTypeColor = (type: string) => {
    switch (type) {
      case 'parent': return 'bg-purple-100 text-purple-700';
      case 'child': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add Button */}
      <button
        onClick={() => setShowAddModal(true)}
        className="w-full p-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-600 flex items-center justify-center gap-2"
      >
        <Plus className="h-4 w-4" />
        Dosya Bağla
      </button>

      {/* Links List */}
      {links.length === 0 ? (
        <div className="text-center py-6 text-gray-500">
          <Link2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Bağlı dosya yok</p>
        </div>
      ) : (
        <div className="space-y-2">
          {links.map((link) => (
            <div key={link.id} className="p-3 border rounded-lg hover:bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Link2 className="h-5 w-5 text-gray-400" />
                <div>
                  <div className="flex items-center gap-2">
                    <a
                      href={`/cases/${link.caseId}`}
                      className="font-medium text-blue-600 hover:underline flex items-center gap-1"
                    >
                      {link.fileNumber}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <span className={`px-2 py-0.5 rounded text-xs ${getLinkTypeColor(link.linkType)}`}>
                      {getLinkTypeInfo(link.linkType).name}
                    </span>
                  </div>
                  {link.clientName && (
                    <p className="text-sm text-gray-500">{link.clientName}</p>
                  )}
                  {link.notes && (
                    <p className="text-xs text-gray-400 mt-1">{link.notes}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleRemoveLink(link.id)}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl w-full max-w-md mx-4 max-h-[80vh] overflow-auto">
            <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
              <h3 className="font-semibold flex items-center gap-2">
                <Link2 className="h-5 w-5 text-blue-600" />
                Dosya Bağla
              </h3>
              <button onClick={resetModal} className="text-gray-500 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Current Case */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-600 mb-1">Mevcut Dosya</p>
                <p className="font-semibold text-blue-800">{caseNumber}</p>
              </div>

              {/* Search */}
              {!selectedCase ? (
                <div>
                  <label className="block text-sm font-medium mb-2">Bağlanacak Dosya</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="Dosya no veya müvekkil ara..."
                        className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm"
                      />
                    </div>
                    <button
                      onClick={handleSearch}
                      disabled={searching}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ara'}
                    </button>
                  </div>

                  {searchResults.length > 0 && (
                    <div className="mt-2 border rounded-lg divide-y max-h-40 overflow-auto">
                      {searchResults.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setSelectedCase(c);
                            setSearchResults([]);
                          }}
                          className="w-full p-3 text-left hover:bg-gray-50 flex items-center justify-between"
                        >
                          <div>
                            <p className="font-medium">{c.fileNumber}</p>
                            <p className="text-sm text-gray-500">{c.client?.displayName || c.client?.name}</p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-gray-400" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">Seçilen Dosya</label>
                    <button
                      onClick={() => setSelectedCase(null)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Değiştir
                    </button>
                  </div>
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="font-semibold text-green-800">{selectedCase.fileNumber}</p>
                    <p className="text-sm text-green-600">{selectedCase.client?.displayName || selectedCase.client?.name}</p>
                  </div>
                </div>
              )}

              {/* Link Type */}
              {selectedCase && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2">Bağlantı Türü</label>
                    <div className="space-y-2">
                      {LINK_TYPES.map((type) => (
                        <label
                          key={type.id}
                          className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer ${
                            linkType === type.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="linkType"
                            value={type.id}
                            checked={linkType === type.id}
                            onChange={(e) => setLinkType(e.target.value)}
                            className="mt-1"
                          />
                          <div>
                            <p className="font-medium text-sm">{type.name}</p>
                            <p className="text-xs text-gray-500">{type.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Not (Opsiyonel)</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Bağlantı hakkında not..."
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
              <button
                onClick={resetModal}
                className="px-4 py-2 border rounded-lg hover:bg-gray-100"
              >
                İptal
              </button>
              <button
                onClick={handleAddLink}
                disabled={!selectedCase || saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Bağlanıyor...
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4" />
                    Bağla
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
