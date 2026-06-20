'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@hukuk/ui';
import { Badge } from '@hukuk/ui';
import { Button } from '@hukuk/ui';
import { Spinner } from '@hukuk/ui';
import { 
  FolderSync, 
  Copy, 
  CheckCircle2, 
  MapPin,
  ExternalLink
} from 'lucide-react';
import { api, CrossFileAddressDTO } from '@/lib/api';

interface CrossFileAddressPanelProps {
  debtorId: string;
  currentCaseId: string;
  readOnly?: boolean;
  onAddressCopied?: () => void;
}

export function CrossFileAddressPanel({ 
  debtorId, 
  currentCaseId,
  readOnly = false,
  onAddressCopied 
}: CrossFileAddressPanelProps) {
  const [addresses, setAddresses] = useState<CrossFileAddressDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [copiedIds, setCopiedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, [debtorId, currentCaseId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await api.getCrossFileAddresses(debtorId, currentCaseId);
      setAddresses(data);
    } catch (error) {
      console.error('Cross-file adresler yüklenemedi:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAddress = async (addressId: string) => {
    if (readOnly) return;
    try {
      setCopyingId(addressId);
      await api.copyAddressToCase(addressId, debtorId);
      setCopiedIds(prev => new Set([...prev, addressId]));
      onAddressCopied?.();
    } catch (error) {
      console.error('Adres kopyalanamadı:', error);
    } finally {
      setCopyingId(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Spinner size="sm" />
        </CardContent>
      </Card>
    );
  }

  if (addresses.length === 0) {
    return null; // Gösterilecek adres yoksa panel gizlenir
  }

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <FolderSync className="w-4 h-4 text-blue-600" />
          <span className="text-blue-900">Diğer Dosyalardaki Adresler</span>
          <Badge variant="outline" className="ml-auto bg-blue-100 text-blue-700 border-blue-200">
            {addresses.length} adres
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {addresses.map((addr) => {
          const isCopied = copiedIds.has(addr.id);
          const isCopying = copyingId === addr.id;
          
          return (
            <div
              key={addr.id}
              className="flex items-start justify-between p-3 bg-white rounded-lg border border-blue-100"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  <p className="text-sm font-medium truncate">
                    {addr.city}{addr.district ? ` / ${addr.district}` : ''}
                  </p>
                  {addr.verified && (
                    <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 pl-5">
                  {addr.fullText}
                </p>
                <div className="flex items-center gap-2 mt-2 pl-5">
                  <Badge variant="outline" className="text-xs">
                    {addr.source}
                  </Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" />
                    {addr.fromCase.fileNumber}
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                variant={isCopied ? "ghost" : "outline"}
                className="ml-2 flex-shrink-0"
                onClick={() => handleCopyAddress(addr.id)}
                disabled={isCopying || isCopied || readOnly}
              >
                {isCopying ? (
                  <Spinner size="sm" />
                ) : isCopied ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-1 text-green-500" />
                    Kopyalandı
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-1" />
                    Kopyala
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
