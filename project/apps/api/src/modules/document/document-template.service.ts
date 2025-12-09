import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface TemplateVariables {
  // Dosya Bilgileri
  fileNumber?: string;
  date?: string;
  caseType?: string;
  
  // İcra Dairesi
  executionOffice?: {
    name?: string;
    uyapCode?: string;
    bankName?: string;
    branchName?: string;
    iban?: string;
    taxNumber?: string;
  };
  
  // Alacaklı
  creditor?: {
    name?: string;
    identityNo?: string;
    address?: string;
  };
  
  // Borçlu
  debtor?: {
    name?: string;
    identityNo?: string;
    address?: string;
  };
  
  // Avukat
  lawyer?: {
    name?: string;
    barNumber?: string;
  };
  
  // Tutarlar
  principal?: string;
  interest?: string;
  expenses?: string;
  total?: string;
  currency?: string;
  
  // Faiz
  interestStartDate?: string;
  interestRate?: string;
  
  // Nafaka
  nafakaPeriod?: string;
  monthlyAmount?: string;
  
  // Döviz
  dueDate?: string;
  exchangeRate?: string;
  
  // Diğer
  [key: string]: any;
}

@Injectable()
export class DocumentTemplateService {
  constructor(private prisma: PrismaService) {}

  // Tüm şablonları listele
  async findAll(category?: string, subCategory?: string) {
    const where: any = { isActive: true };
    if (category) where.category = category;
    if (subCategory) where.subCategory = subCategory;

    return this.prisma.documentTemplate.findMany({
      where,
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  // Tek şablon getir
  async findByCode(code: string) {
    const template = await this.prisma.documentTemplate.findUnique({
      where: { code },
    });

    if (!template) {
      throw new NotFoundException(`Şablon bulunamadı: ${code}`);
    }

    return template;
  }

  // Alt kategoriye göre uygun şablon bul
  async findBySubCategory(category: string, subCategory: string, currency?: string) {
    const where: any = {
      category,
      subCategory,
      isActive: true,
    };

    // Döviz için currency kontrolü
    if (currency && currency !== 'TRY') {
      where.OR = [
        { currency: null }, // Tüm dövizler için geçerli
        { currency },
      ];
    }

    return this.prisma.documentTemplate.findFirst({
      where,
      orderBy: { sortOrder: 'asc' },
    });
  }


  // Şablon içeriğini değişkenlerle doldur
  renderTemplate(templateContent: string, variables: TemplateVariables): string {
    let result = templateContent;

    // Nested değişkenleri düzleştir (executionOffice.name -> value)
    const flatVariables = this.flattenVariables(variables);

    // Koşullu ifadeleri işle: {{variable ? 'text' : 'alt'}}
    result = result.replace(
      /\{\{(\w+(?:\.\w+)?)\s*\?\s*['"]([^'"]*)['"]\s*:\s*['"]([^'"]*)['"]\}\}/g,
      (match, varName, trueVal, falseVal) => {
        const value = flatVariables[varName];
        return value ? trueVal.replace(varName, value) : falseVal;
      }
    );

    // Koşullu ifadeleri işle: {{variable ? 'text' + variable : ''}}
    result = result.replace(
      /\{\{(\w+(?:\.\w+)?)\s*\?\s*['"]([^'"]*)['"]\s*\+\s*(\w+(?:\.\w+)?)\s*:\s*['"]([^'"]*)['"]\}\}/g,
      (match, condVar, prefix, valueVar, falseVal) => {
        const condValue = flatVariables[condVar];
        const value = flatVariables[valueVar];
        return condValue ? `${prefix}${value || ''}` : falseVal;
      }
    );

    // Basit değişkenleri değiştir: {{variable}}
    result = result.replace(/\{\{(\w+(?:\.\w+)?)\}\}/g, (match, varName) => {
      return flatVariables[varName] || '';
    });

    return result;
  }

  // Nested objeleri düzleştir
  private flattenVariables(obj: any, prefix = ''): Record<string, string> {
    const result: Record<string, string> = {};

    for (const key in obj) {
      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, this.flattenVariables(value, newKey));
      } else if (value !== null && value !== undefined) {
        result[newKey] = String(value);
      }
    }

    return result;
  }

  // Case'den değişkenleri hazırla
  async prepareVariablesFromCase(caseId: string): Promise<TemplateVariables> {
    const caseData = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: {
        client: true,
        executionOffice: true,
        debtors: { include: { debtor: true } },
        lawyers: { include: { lawyer: true } },
        dues: true,
      },
    });

    if (!caseData) {
      throw new NotFoundException('Dosya bulunamadı');
    }

    const debtor = caseData.debtors[0]?.debtor;
    const lawyer = caseData.lawyers[0]?.lawyer;

    // Tutarları hesapla
    const principal = caseData.dues
      ?.filter(d => d.type === 'PRINCIPAL')
      .reduce((sum, d) => sum + Number(d.amount), 0) || Number(caseData.principalAmount || 0);

    const interest = caseData.dues
      ?.filter(d => d.type === 'INTEREST')
      .reduce((sum, d) => sum + Number(d.amount), 0) || 0;

    const expenses = caseData.dues
      ?.filter(d => d.type === 'EXPENSE' || d.type === 'OTHER')
      .reduce((sum, d) => sum + Number(d.amount), 0) || 0;

    return {
      fileNumber: caseData.fileNumber,
      date: new Date().toLocaleDateString('tr-TR'),
      caseType: caseData.type,

      executionOffice: caseData.executionOffice ? {
        name: caseData.executionOffice.name,
        uyapCode: caseData.executionOffice.uyapCode || undefined,
        bankName: caseData.executionOffice.bankName || undefined,
        branchName: caseData.executionOffice.branchName || undefined,
        iban: caseData.executionOffice.iban || undefined,
        taxNumber: caseData.executionOffice.taxNumber || undefined,
      } : undefined,

      creditor: caseData.client ? {
        name: caseData.client.name,
        identityNo: caseData.client.identityNo || undefined,
        address: (caseData.client.address as any)?.text || undefined,
      } : undefined,

      debtor: debtor ? {
        name: debtor.name,
        identityNo: debtor.identityNo || undefined,
        address: (debtor.addresses as any)?.primary || undefined,
      } : undefined,

      lawyer: lawyer ? {
        name: `${lawyer.name} ${lawyer.surname}`,
        barNumber: lawyer.barNumber || undefined,
      } : undefined,

      principal: this.formatCurrency(principal),
      interest: this.formatCurrency(interest),
      expenses: this.formatCurrency(expenses),
      total: this.formatCurrency(principal + interest + expenses),
      currency: (caseData as any).currency || 'TRY',

      // Faiz bilgileri
      interestStartDate: (caseData as any).interestStartDate 
        ? new Date((caseData as any).interestStartDate).toLocaleDateString('tr-TR')
        : undefined,

      // Nafaka bilgileri
      monthlyAmount: (caseData as any).monthlyNafakaAmount 
        ? this.formatCurrency(Number((caseData as any).monthlyNafakaAmount))
        : undefined,
      nafakaPeriod: (caseData as any).nafakaStartDate
        ? this.calculateNafakaPeriod((caseData as any).nafakaStartDate)
        : undefined,
      nafakaStartDate: (caseData as any).nafakaStartDate
        ? new Date((caseData as any).nafakaStartDate).toLocaleDateString('tr-TR')
        : undefined,

      // Döviz bilgileri
      exchangeDate: (caseData as any).exchangeDate
        ? new Date((caseData as any).exchangeDate).toLocaleDateString('tr-TR')
        : undefined,
      exchangeRateType: (caseData as any).exchangeRateType || 'ODEME_TARIHI',

      // Alt kategori
      subCategory: (caseData as any).subCategory || 'GENEL',
    };
  }

  // Nafaka dönemini hesapla
  private calculateNafakaPeriod(startDate: Date): string {
    const start = new Date(startDate);
    const now = new Date();
    const months: string[] = [];
    
    const current = new Date(start);
    while (current <= now) {
      months.push(current.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }));
      current.setMonth(current.getMonth() + 1);
    }
    
    if (months.length === 0) return '';
    if (months.length === 1) return months[0];
    return `${months[0]} - ${months[months.length - 1]} (${months.length} ay)`;
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  // Belge üret
  async generateDocument(caseId: string, templateCode: string): Promise<string> {
    const template = await this.findByCode(templateCode);
    const variables = await this.prepareVariablesFromCase(caseId);
    return this.renderTemplate(template.templateContent, variables);
  }
}
