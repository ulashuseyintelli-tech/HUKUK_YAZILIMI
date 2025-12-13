'use client';

import { useState } from 'react';
import { Share2, Copy, Check, Link, Mail, Clock, X } from 'lucide-react';

interface ShareCaseModalProps {
  caseId: string;
  fileNumber: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ShareCaseModal({ caseId, fileNumber, isOpen, onClose }: ShareCaseModalProps) {
  const [copied, setCopied] = useState(false);
  const [expiry, setExpiry] = useState('7');
  const [shareLink, setShareLink] = useState('');
  const [generating, setGenerating] = useState(false);

  const generateLink = async () => {
    setGenerating(true);
    // Simüle edilmiş link oluşturma
    await new Promise(resolve => setTimeout(resolve, 500));
    const token = Math.random().toString(36).substring(2, 15);
    const link = `${window.location.origin}/shared/case/${token}`;
    setShareLink(link);
    setGenerating(false);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Kopyalama hatası:', e);
    }
  };

  const sendByEmail = () => {
    const subject = encodeURIComponent(`Dosya Paylaşımı: ${fileNumber}`);
    const body = encodeURIComponent(`Merhaba,\n\nAşağıdaki linkten dosya detaylarına erişebilirsiniz:\n\n${shareLink}\n\nBu link ${expiry} gün geçerlidir.`);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-md mx-4 shadow-xl">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <Share2 className="h-5 w-5 text-blue-600" />
            Dosya Paylaş
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Dosya No:</p>
            <p className="font-semibold">{fileNumber}</p>
          </div>

          {/* Expiry Selection */}
          <div>
            <label className="block text-sm font-medium mb-2 flex items-center gap-2">
              <Clock className="h-4 w-4" /> Link Geçerlilik Süresi
            </label>
            <select
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="1">1 gün</option>
              <option value="7">7 gün</option>
              <option value="30">30 gün</option>
              <option value="90">90 gün</option>
            </select>
          </div>

          {/* Generate Button */}
          {!shareLink && (
            <button
              onClick={generateLink}
              disabled={generating}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Link className="h-4 w-4" />
              {generating ? 'Link Oluşturuluyor...' : 'Paylaşım Linki Oluştur'}
            </button>
          )}

          {/* Share Link */}
          {shareLink && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={shareLink}
                  readOnly
                  className="flex-1 border rounded-lg px-3 py-2 text-sm bg-gray-50"
                />
                <button
                  onClick={copyToClipboard}
                  className={`px-3 py-2 rounded-lg flex items-center gap-1 ${
                    copied ? 'bg-green-100 text-green-700' : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={sendByEmail}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  <Mail className="h-4 w-4" />
                  E-posta ile Gönder
                </button>
              </div>

              <p className="text-xs text-gray-500 text-center">
                Bu link {expiry} gün boyunca geçerli olacaktır.
              </p>
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50 rounded-b-xl">
          <p className="text-xs text-gray-500 text-center">
            Paylaşılan link ile sadece dosya özeti görüntülenebilir.
          </p>
        </div>
      </div>
    </div>
  );
}
