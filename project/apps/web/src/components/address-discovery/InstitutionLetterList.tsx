'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@hukuk/ui';
import { Badge } from '@hukuk/ui';
import { Button } from '@hukuk/ui';
import { Spinner } from '@hukuk/ui';
import { 
  FileText, 
  Plus, 
  CheckCircle2, 
  Clock, 
  Send,
  AlertTriangle,
  ChevronRight,
  Building2
} from 'lucide-react';
import { 
  api, 
  InstitutionLetterDTO, 
  InstitutionLetterStatus,
  InstitutionType 
} from '@/lib/api';

interface InstitutionLetterListProps {
  caseDebtorId: string;
  readOnly?: boolean;
  onCreateLetter?: () => void;
  onLetterClick?: (letter: InstitutionLetterDTO) => void;
}

const STATUS_CONFIG: Record<InstitutionLetterStatus, {
  label: string;
  color: string;
  icon: React.ReactNode;
}> = {
  DRAFT: {
    label: 'Taslak',
    color: 'bg-gray-100 text-gray-700',
    icon: <FileText className="w-3 h-3" />,
  },
  SENT: {
    label: 'Gönderildi',
    color: 'bg-blue-100 text-blue-700',
    icon: <Send className="w-3 h-3" />,
  },
  RESPONDED: {
    label: 'Yanıt Alındı',
    color: 'bg-green-100 text-green-700',
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  NO_RESPONSE: {
    label: 'Yanıt Yok',
    color: 'bg-orange-100 text-orange-700',
    icon: <AlertTriangle className="w-3 h-3" />,
  },
};

const INSTITUTION_NAMES: Record<InstitutionType, string> = {
  SGK: 'SGK',
  VERGI_DAIRESI: 'Vergi Dairesi',
  TICARET_SICILI: 'Ticaret Sicili',
  BELEDIYE: 'Belediye',
  TAPU: 'Tapu Müdürlüğü',
  NUFUS: 'Nüfus Müdürlüğü',
};

const INSTITUTION_ICONS: Record<InstitutionType, string> = {
  SGK: '🏥',
  VERGI_DAIRESI: '💰',
  TICARET_SICILI: '📋',
  BELEDIYE: '🏛️',
  TAPU: '🏠',
  NUFUS: '👤',
};

export function InstitutionLetterList({ 
  caseDebtorId, 
  readOnly = false,
  onCreateLetter,
  onLetterClick 
}: InstitutionLetterListProps) {
  const [letters, setLetters] = useState<InstitutionLetterDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [caseDebtorId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await api.getInstitutionLettersForDebtor(caseDebtorId);
      setLetters(data);
    } catch (error) {
      console.error('Kurum yazıları yüklenemedi:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            Kurum Yazıları
          </CardTitle>
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={onCreateLetter}>
              <Plus className="w-4 h-4 mr-1" />
              Yeni Yazı
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {readOnly && (
          <div className="p-2 mb-3 rounded bg-gray-50 border border-gray-200 text-xs text-gray-600">
            Pasif kayit: yeni kurum yazisi kapali.
          </div>
        )}
        {letters.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Henüz kurum yazısı oluşturulmamış
          </p>
        ) : (
          <div className="space-y-2">
            {letters.map((letter) => {
              const statusConfig = STATUS_CONFIG[letter.status];
              return (
                <div
                  key={letter.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted cursor-pointer"
                  onClick={() => onLetterClick?.(letter)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-lg">
                      {INSTITUTION_ICONS[letter.institution]}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {INSTITUTION_NAMES[letter.institution]}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {letter.letterType} • {formatDate(letter.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {letter.addressesFound > 0 && (
                      <span className="text-xs text-green-600 font-medium">
                        {letter.addressesFound} adres
                      </span>
                    )}
                    <Badge className={statusConfig.color}>
                      {statusConfig.icon}
                      <span className="ml-1">{statusConfig.label}</span>
                    </Badge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
