import { Recipe } from '../../types/recipe.types';

/**
 * QUERY BANK ACCOUNTS
 * 
 * Banka hesap sorgusu.
 * Borçlunun banka hesaplarını ve menkul kıymetlerini sorgular.
 */
export const QUERY_BANK_ACCOUNTS: Recipe = {
  recipeId: 'QueryBankAccounts',
  version: 1,
  name: 'Banka Hesap Sorgusu',
  description: 'Borçlunun banka hesaplarını ve menkul kıymetlerini sorgular',
  
  stageTags: ['KESINLESME', 'VARLIK', 'HACIZ'],
  
  trigger: {
    type: 'event',
    when: [
      'event:ASSET_QUERY_BANK_REQUESTED',
      'event:RUN_ASSET_QUERIES_BATCH',
    ],
  },
  
  preconditions: [
    { field: 'debtor.identityNo', operator: 'isNotNull' },
    { field: 'case.isFinalized', operator: 'eq', value: true },
  ],
  
  uyapNavPath: {
    menu: ['Sorgular', 'Banka Sorguları', 'Hesap Bilgisi Sorgusu'],
    screenId: 'BANK_QUERY',
  },
  
  read: {
    source: 'uyap',
    fields: [
      { name: 'hesapSayisi', type: 'number' },
      { name: 'hesaplar', type: 'text' }, // JSON array
      { name: 'bankaAdi', type: 'text' },
      { name: 'subeAdi', type: 'text' },
      { name: 'hesapNo', type: 'text' },
      { name: 'iban', type: 'text' },
      { name: 'hesapTuru', type: 'enum', enumValues: ['VADESIZ', 'VADELI', 'YATIRIM', 'KREDI'] },
      { name: 'bakiye', type: 'number' },
      { name: 'paraBirimi', type: 'text' },
      { name: 'blokajVar', type: 'boolean' },
    ],
  },
  
  decisions: [
    {
      // Hesap bulundu ve bakiye var → Haciz talebi hazırla
      if: 'hesapSayisi > 0 AND toplamBakiye > 0',
      thenUpdate: {
        hasBankAccount: true,
        bankAccountCount: '${hesapSayisi}',
        totalBalance: '${toplamBakiye}',
      },
      thenEnqueue: ['PrepareBankSeizure'],
    },
    {
      // Hesap var ama bakiye yok
      if: 'hesapSayisi > 0 AND toplamBakiye == 0',
      thenUpdate: {
        hasBankAccount: true,
        bankAccountCount: '${hesapSayisi}',
        bankStatus: 'ACCOUNTS_EMPTY',
      },
    },
    {
      // Blokajlı hesap var → Uyarı
      if: 'blokajVar == true',
      thenAction: 'CREATE_WARNING',
      thenUpdate: {
        warningType: 'BANK_ACCOUNT_BLOCKED',
        warningMessage: 'Hesap üzerinde blokaj mevcut',
      },
    },
    {
      // Hesap bulunamadı
      if: 'hesapSayisi == 0',
      thenUpdate: {
        hasBankAccount: false,
        bankStatus: 'NO_ACCOUNT_FOUND',
      },
    },
  ],
  
  actions: [
    { type: 'input', target: 'KimlikNo', value: '${debtor.identityNo}' },
    { type: 'click', target: 'Sorgula' },
    { type: 'wait', timeout: 5000 },
  ],
  
  postconditions: [
    'debtor.lastBankQueryAt = now()',
    'case.events += BANK_QUERY_COMPLETED',
  ],
  
  proof: {
    store: ['hesapSayisi', 'toplamBakiye', 'hesaplar', 'queryTimestamp'],
    screenshot: true,
  },
  
  audit: {
    level: 'high',
    retainDays: 3650,
  },
  
  retry: {
    maxAttempts: 3,
    backoffMs: 300000,
  },
  
  priority: 'MEDIUM',
  isActive: true,
};
