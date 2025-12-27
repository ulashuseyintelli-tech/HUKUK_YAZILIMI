"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Building2, RefreshCw, ArrowDownLeft, ArrowUpRight, Link2, CheckCircle, Clock, Plus } from "lucide-react";

interface BankPanelProps {
  caseId?: string;
  onTransactionMatched?: (transaction: any, collection: any) => void;
}

interface BankAccount {
  id: string;
  bankCode: string;
  bankName: string;
  branchName?: string;
  iban: string;
  currency: string;
  ownerName: string;
  isIntegrated: boolean;
  isPrimary: boolean;
  lastSyncAt?: string;
}

interface BankTransaction {
  id: string;
  transactionDate: string;
  amount: number;
  currency: string;
  transactionType: "INCOMING" | "OUTGOING";
  counterpartyName?: string;
  counterpartyIban?: string;
  description?: string;
  referenceNo?: string;
  isMatched: boolean;
  matchedCaseId?: string;
  bankAccount?: { bankName: string; iban: string };
}

interface BankStats {
  totalAccounts: number;
  integratedAccounts: number;
  totalTransactions: number;
  unmatchedTransactions: number;
  totalIncoming: number;
  totalOutgoing: number;
}

export function BankPanel({ caseId, onTransactionMatched }: BankPanelProps) {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [unmatchedTransactions, setUnmatchedTransactions] = useState<BankTransaction[]>([]);
  const [stats, setStats] = useState<BankStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"accounts" | "unmatched" | "add">("accounts");
  
  // Add account form
  const [newAccount, setNewAccount] = useState({
    bankCode: "",
    bankName: "",
    iban: "",
    ownerName: "",
    ownerType: "TENANT" as "TENANT" | "CLIENT",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [accountsRes, unmatchedRes, statsRes] = await Promise.all([
        api.get("/bank/accounts"),
        api.get("/bank/transactions/unmatched?limit=20"),
        api.get("/bank/stats"),
      ]);
      
      setAccounts(accountsRes.data || []);
      setUnmatchedTransactions(unmatchedRes.data || []);
      setStats(statsRes.data);
    } catch (error) {
      console.error("Banka verisi yüklenemedi:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async (accountId: string) => {
    setSyncing(accountId);
    try {
      const result = await api.post(`/bank/accounts/${accountId}/sync`, {});
      
      if (result.data?.success) {
        alert(`Senkronizasyon tamamlandı: ${result.data.newTransactions} yeni işlem, ${result.data.matchedTransactions} otomatik eşleşme`);
        loadData();
      } else {
        alert(`Senkronizasyon hatası: ${result.data?.errorMessage || "Bilinmeyen hata"}`);
      }
    } catch (error: any) {
      alert(`Senkronizasyon hatası: ${error.message}`);
    } finally {
      setSyncing(null);
    }
  };

  const handleMatch = async (transactionId: string) => {
    if (!caseId) {
      alert("Eşleştirme için dosya seçilmeli");
      return;
    }

    try {
      const result = await api.post(`/bank/transactions/${transactionId}/match`, { caseId });
      
      if (result.data) {
        alert("İşlem başarıyla eşleştirildi ve tahsilat kaydı oluşturuldu");
        onTransactionMatched?.(result.data.transaction, result.data.collection);
        loadData();
      }
    } catch (error: any) {
      alert(`Eşleştirme hatası: ${error.message}`);
    }
  };

  const handleAddAccount = async () => {
    if (!newAccount.iban || !newAccount.bankName || !newAccount.ownerName) {
      alert("IBAN, banka adı ve hesap sahibi zorunludur");
      return;
    }

    try {
      await api.post("/bank/accounts", newAccount);
      alert("Hesap başarıyla eklendi");
      setNewAccount({ bankCode: "", bankName: "", iban: "", ownerName: "", ownerType: "TENANT" });
      setActiveTab("accounts");
      loadData();
    } catch (error: any) {
      alert(`Hesap ekleme hatası: ${error.message}`);
    }
  };

  const formatCurrency = (amount: number, currency = "TRY") => {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const bankOptions = [
    { code: "0046", name: "Akbank" },
    { code: "0062", name: "Garanti BBVA" },
    { code: "0064", name: "İş Bankası" },
    { code: "0067", name: "Yapı Kredi" },
    { code: "0010", name: "Ziraat Bankası" },
    { code: "0012", name: "Halkbank" },
    { code: "0015", name: "Vakıfbank" },
    { code: "0032", name: "TEB" },
    { code: "0099", name: "ING" },
    { code: "0111", name: "QNB Finansbank" },
    { code: "0134", name: "Denizbank" },
    { code: "0205", name: "Kuveyt Türk" },
  ];

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            Banka Entegrasyonu
          </h3>
          <button onClick={loadData} className="p-1 hover:bg-gray-100 rounded">
            <RefreshCw className="h-4 w-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xl font-bold text-gray-900">{stats.totalAccounts}</div>
              <div className="text-xs text-gray-500">Hesap ({stats.integratedAccounts} entegre)</div>
            </div>
            <div>
              <div className="text-xl font-bold text-green-600">{formatCurrency(stats.totalIncoming)}</div>
              <div className="text-xs text-gray-500">Toplam Gelen</div>
            </div>
            <div>
              <div className="text-xl font-bold text-yellow-600">{stats.unmatchedTransactions}</div>
              <div className="text-xs text-gray-500">Eşleşmemiş</div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex -mb-px">
          {[
            { id: "accounts", label: "Hesaplar" },
            { id: "unmatched", label: `Eşleşmemiş (${unmatchedTransactions.length})` },
            { id: "add", label: "Hesap Ekle" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 text-sm font-medium border-b-2 ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-6">
        {/* Accounts Tab */}
        {activeTab === "accounts" && (
          <div className="space-y-3">
            {accounts.length === 0 ? (
              <p className="text-center text-gray-500 py-8">Henüz banka hesabı eklenmemiş</p>
            ) : (
              accounts.map((account) => (
                <div key={account.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      account.isIntegrated ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-600"
                    }`}>
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 flex items-center gap-2">
                        {account.bankName}
                        {account.isPrimary && (
                          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">Birincil</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">{account.iban}</div>
                      <div className="text-xs text-gray-400">{account.ownerName}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {account.lastSyncAt && (
                      <span className="text-xs text-gray-400">
                        Son: {new Date(account.lastSyncAt).toLocaleString("tr-TR")}
                      </span>
                    )}
                    <button
                      onClick={() => handleSync(account.id)}
                      disabled={syncing === account.id}
                      className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:bg-gray-400 flex items-center gap-1"
                    >
                      <RefreshCw className={`h-3 w-3 ${syncing === account.id ? "animate-spin" : ""}`} />
                      Senkronize Et
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Unmatched Tab */}
        {activeTab === "unmatched" && (
          <div className="space-y-3">
            {unmatchedTransactions.length === 0 ? (
              <p className="text-center text-gray-500 py-8">Eşleşmemiş işlem yok</p>
            ) : (
              unmatchedTransactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      tx.transactionType === "INCOMING" ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                    }`}>
                      {tx.transactionType === "INCOMING" ? (
                        <ArrowDownLeft className="h-5 w-5" />
                      ) : (
                        <ArrowUpRight className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">
                        {formatCurrency(tx.amount, tx.currency)}
                      </div>
                      <div className="text-sm text-gray-500">
                        {tx.counterpartyName || "Bilinmeyen"} • {new Date(tx.transactionDate).toLocaleDateString("tr-TR")}
                      </div>
                      {tx.description && (
                        <div className="text-xs text-gray-400 truncate max-w-xs">{tx.description}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{tx.bankAccount?.bankName}</span>
                    {caseId && tx.transactionType === "INCOMING" && (
                      <button
                        onClick={() => handleMatch(tx.id)}
                        className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 flex items-center gap-1"
                      >
                        <Link2 className="h-3 w-3" />
                        Eşleştir
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Add Account Tab */}
        {activeTab === "add" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Banka *</label>
                <select
                  value={newAccount.bankCode}
                  onChange={(e) => {
                    const bank = bankOptions.find(b => b.code === e.target.value);
                    setNewAccount({
                      ...newAccount,
                      bankCode: e.target.value,
                      bankName: bank?.name || "",
                    });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Banka Seçin</option>
                  {bankOptions.map((bank) => (
                    <option key={bank.code} value={bank.code}>{bank.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hesap Türü</label>
                <select
                  value={newAccount.ownerType}
                  onChange={(e) => setNewAccount({ ...newAccount, ownerType: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="TENANT">Büro Hesabı</option>
                  <option value="CLIENT">Müvekkil Hesabı</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">IBAN *</label>
              <input
                type="text"
                value={newAccount.iban}
                onChange={(e) => setNewAccount({ ...newAccount, iban: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="TR00 0000 0000 0000 0000 0000 00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hesap Sahibi *</label>
              <input
                type="text"
                value={newAccount.ownerName}
                onChange={(e) => setNewAccount({ ...newAccount, ownerName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Hesap sahibi adı"
              />
            </div>

            <button
              onClick={handleAddAccount}
              className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Hesap Ekle
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
