-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('PROFESSIONAL', 'CORPORATE', 'PUBLIC', 'CITIZEN');

-- CreateEnum
CREATE TYPE "PoaStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'PENDING');

-- CreateEnum
CREATE TYPE "PoaScopeType" AS ENUM ('GENEL', 'ICRA_TAKIP', 'BU_DOSYA', 'OZEL');

-- CreateEnum
CREATE TYPE "ExternalCaseStatus" AS ENUM ('HACIZ_TALEP', 'HACIZ_KONDU', 'CEVAP_BEKLENIYOR', 'TAHSIL_BASLADI', 'KAPANDI');

-- CreateEnum
CREATE TYPE "LawyerRank" AS ENUM ('PARTNER', 'MANAGER', 'AUTHORIZED', 'LAWYER', 'INTERN');

-- CreateEnum
CREATE TYPE "LawyerRole" AS ENUM ('OWNER', 'PARTNER', 'EMPLOYEE', 'INTERN');

-- CreateEnum
CREATE TYPE "CaseLawyerRole" AS ENUM ('RESPONSIBLE', 'ASSIGNED', 'ASSISTANT', 'INTERN');

-- CreateEnum
CREATE TYPE "PowerOfAttorneyType" AS ENUM ('GENEL', 'OZEL', 'ICRA', 'DAVA');

-- CreateEnum
CREATE TYPE "CollectionChannel" AS ENUM ('NAKIT', 'BANKA', 'CEK', 'SENET', 'KREDI_KARTI', 'ICRA_DAIRESI', 'HACIZ', 'DIGER');

-- CreateEnum
CREATE TYPE "CollectionSource" AS ENUM ('MANUAL', 'EXTERNAL_CASE', 'THIRD_PARTY', 'BANK_SEIZURE', 'SALARY_SEIZURE', 'AUCTION', 'SETTLEMENT');

-- CreateEnum
CREATE TYPE "CollectionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ExpenseRequestStatus" AS ENUM ('PENDING', 'SENT', 'REMINDED', 'PARTIAL', 'RECEIVED', 'PAID', 'LAWYER_PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExpenseGateType" AS ENUM ('BLOCKING', 'NON_BLOCKING');

-- CreateEnum
CREATE TYPE "AllocationType" AS ENUM ('PRINCIPAL', 'INTEREST', 'EXPENSE', 'FEE', 'ATTORNEY_FEE', 'PENALTY', 'OTHER');

-- CreateEnum
CREATE TYPE "TebligatType" AS ENUM ('ODEME_EMRI', 'ICRA_EMRI', 'TAHLIYE_EMRI', 'HACIZ_IHBARNAMESI_89_1', 'HACIZ_IHBARNAMESI_89_2', 'HACIZ_IHBARNAMESI_89_3', 'SATIS_ILANI', 'KIYMET_TAKDIRI', 'DIGER');

-- CreateEnum
CREATE TYPE "TebligatAddressType" AS ENUM ('BILINEN', 'MERNIS', 'TICARET_SICIL', 'KEP', 'VERGI_DAIRESI');

-- CreateEnum
CREATE TYPE "TebligatChannel" AS ENUM ('PTT', 'KEP', 'UETS', 'ILANEN', 'ELDEN');

-- CreateEnum
CREATE TYPE "TebligatStatus" AS ENUM ('HAZIRLANDI', 'GONDERILDI', 'TESLIM_EDILDI', 'IADE_GELDI', 'MUHTARLIGA_BIRAKILDI', 'TEBLIG_EDILMIS_SAYILDI', 'IPTAL');

-- CreateEnum
CREATE TYPE "TebligatPttResult" AS ENUM ('TESLIM_EDILDI', 'AYNI_KONUTTA_TESLIM', 'ISYERINDE_TESLIM', 'ADRESTE_BULUNAMADI', 'TASINMIS', 'ADRES_YETERSIZ', 'BINA_YIKILMIS', 'ADRES_KAPALI', 'IMTINA', 'MUHTARLIGA_BIRAKILDI', 'VEFAT', 'TANIMIYOR', 'DIGER');

-- CreateEnum
CREATE TYPE "Tk21Type" AS ENUM ('TK_21_1', 'TK_21_2');

-- CreateEnum
CREATE TYPE "TebligatNextAction" AS ENUM ('MERNIS_TEBLIGAT', 'ILANEN_TEBLIGAT', 'TEBLIG_TAMAMLANDI', 'YENI_ADRES_ARA', 'BEKLE');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('TAKIP_TALEBI', 'ODEME_EMRI', 'HACIZ_MUZEKKERESI', 'SATIS_ILANI', 'REDDIYAT', 'MTS_DONUS', 'ITIRAZ', 'DIGER');

-- CreateEnum
CREATE TYPE "UyapRequestStatus" AS ENUM ('PENDING', 'SENT', 'SUCCESS', 'FAILED', 'RETRY');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER', 'VIEWER');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('INDIVIDUAL', 'PERSON', 'COMPANY', 'PUBLIC');

-- CreateEnum
CREATE TYPE "DebtorType" AS ENUM ('INDIVIDUAL', 'COMPANY', 'PUBLIC_INSTITUTION', 'ESTATE');

-- CreateEnum
CREATE TYPE "AddressIntakeMode" AS ENUM ('CLIENT_CONFIRMED', 'UNKNOWN', 'NEEDS_CLIENT_REQUEST');

-- CreateEnum
CREATE TYPE "DebtorRole" AS ENUM ('ASIL_BORCLU', 'MUSETEREK_BORCLU', 'ADI_KEFIL', 'MUTESELSIL_KEFIL', 'AVAL', 'CIRANTA', 'LEHDAR', 'KESIDECI', 'MUHATAP', 'MIRASCI', 'TASFIYE_MEMURU', 'IFLAS_MASASI');

-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('MERNIS', 'BUSINESS_HQ', 'BUSINESS_BRANCH', 'LEGAL_CENTER', 'DECLARED', 'KEP');

-- CreateEnum
CREATE TYPE "AddressSubType" AS ENUM ('HQ', 'BRANCH');

-- CreateEnum
CREATE TYPE "AddressSource" AS ENUM ('MERNIS', 'MERSIS', 'TICARET_SICILI', 'CONTRACT', 'USER_INPUT', 'UYAP', 'UYAP_AA', 'UYAP_AB', 'UYAP_AF', 'UYAP_AJ', 'UYAP_AR', 'SGK_LETTER', 'VERGI_LETTER', 'TICARET_SICILI_LETTER', 'BELEDIYE_LETTER', 'CLIENT', 'CROSS_FILE');

-- CreateEnum
CREATE TYPE "AddressRiskFlag" AS ENUM ('ADDRESS_SUSPECT', 'MOVED', 'CLOSED', 'NOT_FOUND', 'REFUSED');

-- CreateEnum
CREATE TYPE "LegalPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "DebtorNotificationMode" AS ENUM ('NORMAL', 'KEP', 'UETS', 'ILANEN');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('NOT_STARTED', 'READY', 'SENT', 'DELIVERED', 'RETURNED', 'MUHTAR', 'ANNOUNCEMENT', 'FAILED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ServiceReturnReason" AS ENUM ('ADDRESS_NOT_FOUND', 'MOVED', 'REFUSED', 'DECEASED', 'COMPANY_CLOSED', 'UNCLAIMED', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetQueryStatus" AS ENUM ('UNKNOWN', 'YES', 'NO', 'PENDING', 'ERROR');

-- CreateEnum
CREATE TYPE "AssetQueryType" AS ENUM ('VEHICLE', 'REAL_ESTATE', 'BANK', 'SGK_WAGE', 'SGK_EMPLOYER', 'TAX', 'TRADE_REGISTRY', 'GSM');

-- CreateEnum
CREATE TYPE "LiabilityType" AS ENUM ('TAM', 'KISMI', 'SINIRLI');

-- CreateEnum
CREATE TYPE "ThirdPartyType" AS ENUM ('ISVEREN', 'BANKA', 'KIRACI', 'BORC_ALACAKLI', 'DIGER');

-- CreateEnum
CREATE TYPE "PublicInstitutionType" AS ENUM ('BAKANLIK', 'BELEDIYE', 'IL_OZEL_IDARESI', 'UNIVERSITE', 'KIT', 'DIGER_KAMU');

-- CreateEnum
CREATE TYPE "DebtorRiskLevel" AS ENUM ('DUSUK', 'ORTA', 'YUKSEK', 'COK_YUKSEK');

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('GENERAL_EXECUTION', 'MORTGAGE', 'PLEDGE', 'BANKRUPTCY', 'CHECK', 'BOND', 'RENTAL', 'OTHER');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('ACTIVE', 'CLOSED', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LegalCaseStatus" AS ENUM ('DERDEST', 'ISLEMDE', 'DERKENAR', 'HITAM', 'INFAZ', 'MUVEKKILE_IADE', 'ACIZ', 'BATAK', 'MAHSUP', 'TEMLIK', 'AZIL', 'FERAGAT', 'SULH');

-- CreateEnum
CREATE TYPE "ExecutionPath" AS ENUM ('HACIZ', 'IFLAS', 'REHIN', 'IPOTEK', 'TAHLIYE');

-- CreateEnum
CREATE TYPE "CaseSubCategory" AS ENUM ('GENEL', 'NAFAKA', 'DOVIZ', 'KIRA', 'CEZA');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('TRY', 'USD', 'EUR', 'GBP', 'CHF');

-- CreateEnum
CREATE TYPE "InterestType" AS ENUM ('YASAL', 'SABIT', 'AVANS', 'TEMERRUT', 'YOKSUN', 'TICARI');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('ARTICLE_4_REQUEST', 'PAYMENT_ORDER', 'SEIZURE_REQUEST', 'SEIZURE_NOTICE', 'BANK_NOTICE', 'VEHICLE_NOTICE', 'PROPERTY_NOTICE', 'SALARY_NOTICE', 'SALE_REQUEST', 'OBJECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "DueType" AS ENUM ('PRINCIPAL', 'INTEREST', 'EXPENSE', 'VEKALET_UCRETI', 'HARC', 'TAZMINAT', 'CEZAI_SART', 'NAFAKA', 'KIRA', 'AIDAT', 'KOMISYON', 'PRIM', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('VEHICLE', 'IMMOVABLE', 'BANK_ACCOUNT', 'SALARY', 'SHARE', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CollectionType" AS ENUM ('TAHSILAT', 'FERAGAT', 'MAHSUP', 'SULH', 'IADE', 'CASH', 'BANK_TRANSFER', 'CHECK', 'OTHER');

-- CreateEnum
CREATE TYPE "FormCategory" AS ENUM ('GENEL_ICRA', 'KAMBIYO', 'IPOTEK_REHIN', 'IFLAS', 'KIRA');

-- CreateEnum
CREATE TYPE "ProcedureType" AS ENUM ('ILAMSIZ', 'ILAMLI', 'KAMBIYO', 'IPOTEK', 'REHIN', 'IFLAS', 'KIRA_ALACAK', 'TAHLIYE');

-- CreateEnum
CREATE TYPE "WorkflowStage" AS ENUM ('INITIAL', 'PAYMENT_ORDER', 'WAITING_RESPONSE', 'OBJECTION', 'ENFORCEMENT', 'SEIZURE', 'SALE_REQUEST', 'AUCTION', 'COLLECTION', 'PARTIAL_PAYMENT', 'FULL_PAYMENT', 'CLOSED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('MANUAL', 'AUTO', 'SYSTEM', 'AI');

-- CreateEnum
CREATE TYPE "EnforcementType" AS ENUM ('BANK_INQUIRY', 'BANK_SEIZURE', 'VEHICLE_INQUIRY', 'VEHICLE_SEIZURE', 'PROPERTY_INQUIRY', 'PROPERTY_SEIZURE', 'SALARY_SEIZURE', 'MOVABLE_SEIZURE', 'TRAVEL_BAN', 'SALE_REQUEST', 'AUCTION');

-- CreateEnum
CREATE TYPE "EnforcementStatus" AS ENUM ('PENDING', 'REQUESTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "DecisionType" AS ENUM ('FORM_SELECTION', 'NEXT_ACTION', 'ENFORCEMENT_TYPE', 'RISK_ASSESSMENT', 'COLLECTION_STRATEGY', 'CASE_CLOSURE', 'STATUS_CHANGE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PAYMENT_ORDER', 'SEIZURE_NOTICE', 'SALE_NOTICE', 'REMINDER', 'INFO', 'WARNING', 'POA_EXPIRING', 'POA_EXPIRED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('E_TEBLIGAT', 'PTT', 'SMS', 'EMAIL', 'PUSH');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SCHEDULED', 'SENT', 'DELIVERED', 'READ', 'RESPONDED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DetectedCaseType" AS ENUM ('ILAMLI', 'ILAMSIZ', 'KAMBIYO', 'KIRA', 'IPOTEK', 'REHIN', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "StaffType" AS ENUM ('STAJYER_AVUKAT', 'OFIS_KATIBI', 'ADLI_KATIP', 'SEKRETER', 'MUHASEBE', 'ARSIV', 'DIGER');

-- CreateEnum
CREATE TYPE "MessageTemplateCategory" AS ENUM ('CLIENT_INFO', 'EXPENSE_REQUEST', 'EXPENSE_REMINDER', 'COLLECTION_INFO', 'DEBTOR_NOTICE', 'GREETING', 'OTHER');

-- CreateEnum
CREATE TYPE "MessageTemplateChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "PublicInstitutionCategory" AS ENUM ('BAKANLIK', 'GENEL_MUDURLUK', 'BASKANLIK', 'KURUL', 'KURUM', 'UNIVERSITE', 'BELEDIYE', 'IL_OZEL_IDARESI', 'VALILIK', 'KAYMAKAMLIK', 'MAHKEME', 'SAVCILIK', 'ICRA_DAIRESI', 'CEZAEVI', 'HASTANE', 'DIGER');

-- CreateEnum
CREATE TYPE "UyapUnitType" AS ENUM ('ICRA_DAIRESI', 'ICRA_MAHKEMESI', 'ASLIYE_HUKUK', 'ASLIYE_CEZA', 'AGIR_CEZA', 'SULH_HUKUK', 'SULH_CEZA', 'AILE_MAHKEMESI', 'IS_MAHKEMESI', 'TUKETICI_MAHKEMESI', 'KADASTRO_MAHKEMESI', 'TICARET_MAHKEMESI', 'IDARE_MAHKEMESI', 'VERGI_MAHKEMESI', 'SAVCILIK', 'CEZA_INFAZ', 'DIGER');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('PAYMENT', 'ADJUSTMENT', 'WAIVER', 'REFUND', 'TRANSFER');

-- CreateEnum
CREATE TYPE "LedgerEntryStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClaimItemType" AS ENUM ('PRINCIPAL', 'INTEREST', 'PRE_INTEREST', 'POST_INTEREST', 'EXPENSE', 'FEE', 'ATTORNEY_FEE', 'PENALTY', 'CHECK_PENALTY', 'CONTRACTUAL_PENALTY', 'TAX_KDV', 'TAX_BSMV', 'TAX_KKDF', 'OTHER');

-- CreateEnum
CREATE TYPE "ClaimSourceProcess" AS ENUM ('MAIN_ENFORCEMENT', 'PRECAUTIONARY');

-- CreateEnum
CREATE TYPE "DocumentSourceType" AS ENUM ('FATURA', 'CEK', 'SENET', 'KIRA', 'SOZLESME', 'ILAM', 'KARAR', 'BORC_SENEDI', 'KREDI', 'DIGER');

-- CreateEnum
CREATE TYPE "ClaimItemStatus" AS ENUM ('ACTIVE', 'COLLECTED', 'WAIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InstrumentType" AS ENUM ('CEK', 'SENET', 'BONO', 'POLICE');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('KONUT', 'ISYERI', 'ARSA', 'TARLA', 'DIGER');

-- CreateEnum
CREATE TYPE "EvictionReason" AS ENUM ('TAAHHUT', 'TEMERRUT', 'SOZLESME_SONU', 'IHTIYAC', 'YENIDEN_INSAAT', 'DIGER');

-- CreateEnum
CREATE TYPE "NafakaType" AS ENUM ('ISTIRAK', 'YOKSULLUK', 'TEDBIR', 'YARDIM');

-- CreateEnum
CREATE TYPE "CollateralType" AS ENUM ('IPOTEK', 'TASIT_REHNI', 'TICARI_REHIN', 'ALACAK_REHNI', 'MENKUL_REHIN', 'DIGER');

-- CreateEnum
CREATE TYPE "ValidationGate" AS ENUM ('GATE_1_CASE_CREATION', 'GATE_2_ORNEK1_GENERATION', 'GATE_3_SERVICE_OF_PROCESS', 'GATE_4_UYAP_INTEGRATION');

-- CreateEnum
CREATE TYPE "AddressTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'WAITING_EXTERNAL', 'OVERDUE', 'RESOLVED', 'DONE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PrecautionaryOrderStatus" AS ENUM ('DRAFT', 'DECIDED', 'APPLIED', 'LIFTED', 'EXPIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SecurityDepositType" AS ENUM ('NAKIT', 'TEMINAT_MEKTUBU', 'GAYRIMENKUL', 'KEFALET', 'DIGER');

-- CreateEnum
CREATE TYPE "PrecautionaryCostType" AS ENUM ('HARC', 'POSTA', 'VEKALET', 'TEMINAT', 'YEDIEMIN', 'BILIRKISI', 'MUHAFAZA', 'DIGER');

-- CreateEnum
CREATE TYPE "LimitationLevel" AS ENUM ('GREEN', 'YELLOW', 'RED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "LimitationAckAction" AS ENUM ('PROCEED', 'BACK');

-- CreateEnum
CREATE TYPE "BalanceLedgerType" AS ENUM ('CREDIT', 'DEBIT', 'ADJUST', 'REFUND');

-- CreateEnum
CREATE TYPE "StageActionType" AS ENUM ('CREATE_EXPENSE_REQUEST', 'DEBIT_FROM_BALANCE', 'SUGGEST_ONLY', 'BLOCK_UNTIL_PAID');

-- CreateEnum
CREATE TYPE "StageEventCode" AS ENUM ('EVT_UYAP_SEND_CLICKED', 'EVT_TEBLIGAT_REQUESTED', 'EVT_TEBLIGAT_RETURNED', 'EVT_NEW_ADDRESS_ADDED', 'EVT_HACIZ_INIT', 'EVT_HACIZ_EXECUTED', 'EVT_SALE_INIT', 'EVT_VALUATION_INIT', 'EVT_BALANCE_LOW');

-- CreateEnum
CREATE TYPE "ClientInfoRequestStatus" AS ENUM ('SENT', 'RESPONDED', 'NO_RESPONSE');

-- CreateEnum
CREATE TYPE "UyapQueryType" AS ENUM ('NUFUS_ADRES', 'SGK', 'TICARET_ODASI', 'VERGI_DAIRESI', 'GSM', 'GUMRUK', 'ORTAKLAR', 'AILE', 'ORTAK_DETAY');

-- CreateEnum
CREATE TYPE "UyapQueryStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'NO_RESULT');

-- CreateEnum
CREATE TYPE "InstitutionType" AS ENUM ('SGK', 'VERGI_DAIRESI', 'TICARET_SICILI', 'BELEDIYE', 'TAPU', 'NUFUS');

-- CreateEnum
CREATE TYPE "InstitutionLetterStatus" AS ENUM ('DRAFT', 'SENT', 'RESPONDED', 'NO_RESPONSE');

-- CreateEnum
CREATE TYPE "AddressResearchStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'EXHAUSTED');

-- CreateEnum
CREATE TYPE "AssetQueryJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BotTaskStatus" AS ENUM ('PENDING', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'RETRY', 'CANCELLED', 'NEEDS_APPROVAL');

-- CreateEnum
CREATE TYPE "BotTaskPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "IcrabotBundleStatus" AS ENUM ('DRAFT', 'APPROVED', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "IcrabotBundleType" AS ENUM ('RECIPE', 'PARAMS', 'UIMAP', 'DECISION_RULES', 'RISK', 'RECOVERY', 'PLAN', 'QUEUE_POLICY', 'SLA_POLICY');

-- CreateEnum
CREATE TYPE "IcrabotJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "IcrabotRiskLevel" AS ENUM ('READ_ONLY', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IcrabotLockType" AS ENUM ('LOCK_EXECUTION_ACTIONS', 'LOCK_COST_ACTIONS', 'LOCK_TEBLIGAT', 'LOCK_HACIZ', 'LOCK_SATIS', 'LOCK_MANUAL');

-- CreateEnum
CREATE TYPE "InterestTypeCode" AS ENUM ('LEGAL_3095', 'COMMERCIAL_AVANS_3095_2_2', 'TTK_1530', 'CONTRACTUAL', 'MEVDUAT_TL_BANKALARCA', 'MEVDUAT_USD_BANKALARCA', 'MEVDUAT_EUR_BANKALARCA', 'MEVDUAT_TL_KAMU', 'MEVDUAT_USD_KAMU', 'MEVDUAT_EUR_KAMU');

-- CreateEnum
CREATE TYPE "RateSource" AS ENUM ('TCMB', 'RESMI_GAZETE', 'CONTRACT');

-- CreateEnum
CREATE TYPE "AddressTaskType" AS ENUM ('DOC_EXTRACT_DEBTOR_ADDRESSES', 'CLIENT_CONTACT_VALIDATE', 'CLIENT_REQUEST_DEBTOR_ADDRESSES', 'CLIENT_REMIND_DEBTOR_ADDRESSES', 'CLIENT_ANNUAL_ADDRESS_REFRESH', 'ASSIGN_MANUAL_CALL_CLIENT', 'MANUAL_CLIENT_FOLLOWUP', 'UYAP_PULL_MERNIS', 'UYAP_PULL_SGK');

-- CreateEnum
CREATE TYPE "AddressTaskResultType" AS ENUM ('POSITIVE', 'NEGATIVE', 'NO_RESPONSE', 'PARTIAL');

-- CreateEnum
CREATE TYPE "AddressTaskCancellationReason" AS ENUM ('CASE_CLOSED', 'MANUAL_CANCEL', 'DUPLICATE_TASK', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "AddressTaskFailureReason" AS ENUM ('UYAP_UNAVAILABLE', 'NO_CONTACT_INFO', 'CLIENT_NO_RESPONSE', 'EMAIL_BOUNCE', 'WHATSAPP_UNDELIVERED', 'INVALID_ADDRESS', 'SYSTEM_ERROR', 'SLA_EXCEEDED');

-- CreateEnum
CREATE TYPE "ManualTaskResolution" AS ENUM ('CLIENT_RESPONDED', 'CONTACT_UPDATED', 'ADDRESS_UPDATED', 'NO_ADDRESS_AVAILABLE', 'CLIENT_UNREACHABLE', 'OTHER');

-- CreateEnum
CREATE TYPE "AddressCategory" AS ENUM ('DECLARED_DOCUMENT', 'DECLARED_CLIENT', 'MERNIS_RESIDENCE', 'SGK_ADDRESS', 'TICARET_SICIL', 'VERGI_DAIRESI', 'GSM_OPERATOR');

-- CreateEnum
CREATE TYPE "AddressSourceDetail" AS ENUM ('DOCUMENT_SCAN', 'MANUAL_ENTRY', 'CLIENT_REPLY_EMAIL', 'CLIENT_REPLY_WHATSAPP', 'UYAP_MERNIS', 'UYAP_SGK', 'UYAP_TICARET', 'INSTITUTION_LETTER');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('DOCUMENT', 'COMMUNICATION', 'UYAP_QUERY');

-- CreateEnum
CREATE TYPE "DocumentFormat" AS ENUM ('DOCX', 'PDF', 'XML', 'UDF', 'TXT');

-- CreateEnum
CREATE TYPE "DocumentArtifactStatus" AS ENUM ('GENERATING', 'READY', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CpeExecutionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'NOOP');

-- CreateEnum
CREATE TYPE "SimulationRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SimulationSnapshotKind" AS ENUM ('BASELINE', 'CURRENT', 'OTHER');

-- CreateEnum
CREATE TYPE "BundleState" AS ENUM ('DRAFT', 'SEALED', 'FAILED', 'ORPHANED');

-- CreateEnum
CREATE TYPE "EvidenceBundleState" AS ENUM ('OPEN', 'SEALED');

-- CreateEnum
CREATE TYPE "ManifestAdminAuditEventType" AS ENUM ('DLQ_RESOLVE', 'DLQ_REDRIVE', 'DLQ_REDRIVE_BULK', 'JOB_FORCE_RETRY', 'CB_OVERRIDE');

-- CreateEnum
CREATE TYPE "ManifestAdminAuditResourceType" AS ENUM ('dlq_entry', 'retry_job', 'circuit_breaker');

-- CreateEnum
CREATE TYPE "ManifestWorkerPauseReason" AS ENUM ('CONSECUTIVE_ERRORS', 'MANUAL_PAUSE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PromoteRequestStatus" AS ENUM ('IN_PROGRESS', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "EscalationLevelEnum" AS ENUM ('NONE', 'L1', 'L2', 'L3');

-- CreateTable
CREATE TABLE "LookupTakipTuru" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "defaultMahiyetTipiId" TEXT,
    "defaultBorcluTipiId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LookupTakipTuru_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LookupAsama" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LookupAsama_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LookupRisk" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LookupRisk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LookupBorcluTipi" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LookupBorcluTipi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LookupDurumEtiketi" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LookupDurumEtiketi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LookupMahiyetTipi" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "uyapCode" TEXT,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LookupMahiyetTipi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupDefinition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isGlobal" BOOLEAN NOT NULL DEFAULT true,
    "clientId" TEXT,
    "color" TEXT,
    "createdById" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseGroup" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseStageHistory" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "asamaId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "changedById" TEXT,
    "notes" TEXT,

    CONSTRAINT "CaseStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "settings" JSONB,
    "accountType" "AccountType" NOT NULL DEFAULT 'PROFESSIONAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "formTypeCode" TEXT,
    "steps" JSONB NOT NULL,
    "triggers" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionOffice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "officeCode" TEXT,
    "uyapCode" TEXT,
    "taxNumber" TEXT,
    "bankName" TEXT,
    "branchName" TEXT,
    "iban" TEXT,
    "ibanHarc" TEXT,
    "ibanCezaevi" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "fax" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutionOffice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "ClientType" NOT NULL,
    "displayName" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "tckn" TEXT,
    "isForeigner" BOOLEAN NOT NULL DEFAULT false,
    "nationality" TEXT,
    "gender" TEXT,
    "birthDate" TIMESTAMP(3),
    "companyName" TEXT,
    "companyType" TEXT,
    "vkn" TEXT,
    "mersisNo" TEXT,
    "detsisNo" TEXT,
    "taxOffice" TEXT,
    "ticaretSicilNo" TEXT,
    "foundingDate" TIMESTAMP(3),
    "poaStartDate" TIMESTAMP(3),
    "sendBirthdayGreeting" BOOLEAN NOT NULL DEFAULT true,
    "sendAnniversaryGreeting" BOOLEAN NOT NULL DEFAULT true,
    "sendHolidayGreeting" BOOLEAN NOT NULL DEFAULT true,
    "greetingChannel" TEXT,
    "address" TEXT,
    "city" TEXT,
    "district" TEXT,
    "postalCode" TEXT,
    "region" TEXT,
    "useMernisAddress" BOOLEAN NOT NULL DEFAULT false,
    "useUyapAddress" BOOLEAN NOT NULL DEFAULT false,
    "canCollect" BOOLEAN NOT NULL DEFAULT true,
    "canWaive" BOOLEAN NOT NULL DEFAULT false,
    "canSettle" BOOLEAN NOT NULL DEFAULT false,
    "canRelease" BOOLEAN NOT NULL DEFAULT false,
    "hasPortalAccess" BOOLEAN NOT NULL DEFAULT false,
    "portalUserId" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT,
    "identityNo" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientPortalUser" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "loginCount" INTEGER NOT NULL DEFAULT 0,
    "resetToken" TEXT,
    "resetTokenExp" TIMESTAMP(3),
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPortalUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientContact" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientBankAccount" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "branchName" TEXT,
    "iban" TEXT NOT NULL,
    "accountHolder" TEXT,
    "showInDocuments" BOOLEAN NOT NULL DEFAULT false,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientPowerOfAttorney" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "notaryName" TEXT,
    "notaryCity" TEXT,
    "journalNo" TEXT,
    "poaNumber" TEXT,
    "dateIssued" TIMESTAMP(3),
    "isLimited" BOOLEAN NOT NULL DEFAULT false,
    "validUntil" TIMESTAMP(3),
    "status" "PoaStatus" NOT NULL DEFAULT 'ACTIVE',
    "scopeType" "PoaScopeType" NOT NULL DEFAULT 'GENEL',
    "scopeDescription" TEXT,
    "canCollect" BOOLEAN NOT NULL DEFAULT true,
    "canWaive" BOOLEAN NOT NULL DEFAULT false,
    "canSettle" BOOLEAN NOT NULL DEFAULT false,
    "canRelease" BOOLEAN NOT NULL DEFAULT false,
    "filePath" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "poaDate" TIMESTAMP(3),
    "scope" TEXT,

    CONSTRAINT "ClientPowerOfAttorney_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoaLawyer" (
    "id" TEXT NOT NULL,
    "poaId" TEXT NOT NULL,
    "lawyerId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PoaLawyer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseClient" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ALACAKLI',
    "showBankInDocuments" BOOLEAN NOT NULL DEFAULT false,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Debtor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "DebtorType" NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "tckn" VARCHAR(11),
    "gender" TEXT,
    "birthDate" TIMESTAMP(3),
    "fatherName" TEXT,
    "motherName" TEXT,
    "birthPlace" TEXT,
    "companyName" TEXT,
    "vkn" VARCHAR(10),
    "taxOffice" TEXT,
    "mersisNo" TEXT,
    "tradeRegisterNo" TEXT,
    "institutionName" TEXT,
    "detsisNo" TEXT,
    "institutionType" "PublicInstitutionType",
    "parentInstitution" TEXT,
    "authorizedPerson" TEXT,
    "deceasedName" TEXT,
    "deceasedTckn" VARCHAR(11),
    "deathDate" TIMESTAMP(3),
    "inheritanceDocPath" TEXT,
    "name" TEXT NOT NULL,
    "identityNo" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "kepAddress" TEXT,
    "riskLevel" "DebtorRiskLevel",
    "riskNotes" TEXT,
    "notes" TEXT,
    "addresses" JSONB,
    "addressIntakeMode" "AddressIntakeMode" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Debtor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstateHeir" (
    "id" TEXT NOT NULL,
    "debtorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tckn" VARCHAR(11),
    "address" TEXT NOT NULL,
    "city" TEXT,
    "district" TEXT,
    "shareRatio" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstateHeir_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtorAddress" (
    "id" TEXT NOT NULL,
    "debtorId" TEXT NOT NULL,
    "type" "AddressType" NOT NULL DEFAULT 'DECLARED',
    "subType" "AddressSubType",
    "source" "AddressSource" NOT NULL DEFAULT 'USER_INPUT',
    "street" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Türkiye',
    "fullText" TEXT,
    "rawAddress" TEXT,
    "legalPriority" "LegalPriority" NOT NULL DEFAULT 'MEDIUM',
    "canApply21_2" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "verifiedSource" TEXT,
    "riskFlags" "AddressRiskFlag"[],
    "riskNotes" TEXT,
    "tk21_2Applied" BOOLEAN NOT NULL DEFAULT false,
    "tk21_2MuhtarDate" TIMESTAMP(3),
    "tk21_2DoorPostDate" TIMESTAMP(3),
    "tk21_2NoticeDate" TIMESTAMP(3),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "confidenceScore" INTEGER,
    "addressCategory" "AddressCategory",
    "sourceDetail" "AddressSourceDetail",
    "evidenceId" TEXT,
    "evidenceType" "EvidenceType",
    "confidenceLevel" "ConfidenceLevel" DEFAULT 'MEDIUM',
    "addressHash" TEXT,
    "priorityScore" INTEGER,
    "isCurrentCandidate" BOOLEAN NOT NULL DEFAULT false,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "retrievedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "addressType" TEXT,
    "isMernis" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DebtorAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fileNumber" TEXT NOT NULL,
    "executionFileNumber" TEXT,
    "type" "CaseType" NOT NULL,
    "formTypeId" TEXT,
    "executionPath" "ExecutionPath" NOT NULL DEFAULT 'HACIZ',
    "subType" TEXT,
    "subCategory" "CaseSubCategory" NOT NULL DEFAULT 'GENEL',
    "currency" "Currency" NOT NULL DEFAULT 'TRY',
    "isMtsCase" BOOLEAN NOT NULL DEFAULT false,
    "mtsReferenceNo" TEXT,
    "mtsReturnDate" TIMESTAMP(3),
    "interestType" "InterestType" NOT NULL DEFAULT 'YASAL',
    "interestStartDate" TIMESTAMP(3),
    "interestDescription" TEXT,
    "exchangeDate" TIMESTAMP(3),
    "exchangeRateType" TEXT,
    "nafakaStartDate" TIMESTAMP(3),
    "monthlyNafakaAmount" DECIMAL(15,2),
    "caseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executionOfficeId" TEXT,
    "uyapDosyaId" TEXT,
    "uyapBirimKodu" TEXT,
    "hasUyapWarning" BOOLEAN NOT NULL DEFAULT false,
    "caseStatus" "LegalCaseStatus" NOT NULL DEFAULT 'DERDEST',
    "hasArticle4Request" BOOLEAN NOT NULL DEFAULT false,
    "article4RequestDate" TIMESTAMP(3),
    "hasPrecautionaryOrder" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "showToClient" BOOLEAN NOT NULL DEFAULT true,
    "allowUyapActions" BOOLEAN NOT NULL DEFAULT true,
    "isAutomationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "nextAutoAction" TEXT,
    "automationConfig" JSONB,
    "daysLeft" INTEGER,
    "nextActionAt" TIMESTAMP(3),
    "riskScore" INTEGER,
    "workflowStage" "WorkflowStage" NOT NULL DEFAULT 'INITIAL',
    "takipTuruId" TEXT,
    "asamaId" TEXT,
    "riskId" TEXT,
    "borcluTipiId" TEXT,
    "durumEtiketiId" TEXT,
    "mahiyetTipiId" TEXT,
    "mahiyetKodu" TEXT,
    "sorumluPersonelId" TEXT,
    "dahiliNot" TEXT,
    "muvekkilNotu" TEXT,
    "sonDegerlendirmeTarihi" TIMESTAMP(3),
    "status" "CaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "clientId" TEXT,
    "courtId" TEXT,
    "principalAmount" DECIMAL(15,2),
    "interestRate" DECIMAL(5,2),
    "startDate" TIMESTAMP(3),
    "notes" TEXT,
    "metadata" JSONB,
    "isAutoMode" BOOLEAN NOT NULL DEFAULT false,
    "autoActionsCount" INTEGER NOT NULL DEFAULT 0,
    "lastAutoActionAt" TIMESTAMP(3),
    "preDetectedCaseType" TEXT,
    "preDetectedSubCategory" TEXT,
    "ocrText" TEXT,
    "isAutoDetected" BOOLEAN NOT NULL DEFAULT false,
    "confidenceScore" INTEGER,
    "sourceDocumentId" TEXT,
    "detectionKeywords" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseStatusHistory" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "fromStatus" "LegalCaseStatus",
    "toStatus" "LegalCaseStatus" NOT NULL,
    "reason" TEXT,
    "changedById" TEXT,
    "automationWasEnabled" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseDocument" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "filePath" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "isGenerated" BOOLEAN NOT NULL DEFAULT false,
    "generatedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "ocrText" TEXT,
    "ocrProcessedAt" TIMESTAMP(3),
    "ocrConfidence" INTEGER,
    "isSourceDocument" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseDebtor" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "debtorId" TEXT NOT NULL,
    "role" "DebtorRole" NOT NULL DEFAULT 'ASIL_BORCLU',
    "liabilityAmount" DECIMAL(15,2),
    "liabilityType" "LiabilityType",
    "notificationMode" "DebtorNotificationMode" NOT NULL DEFAULT 'NORMAL',
    "selectedAddressId" TEXT,
    "prepareNotification" BOOLEAN NOT NULL DEFAULT true,
    "ilanenJustification" TEXT,
    "serviceStatus" "ServiceStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "serviceChannel" "DebtorNotificationMode",
    "trackingNo" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "returnReason" "ServiceReturnReason",
    "muhtarDeliveredAt" TIMESTAMP(3),
    "announcementDate" TIMESTAMP(3),
    "announcementExpiry" TIMESTAMP(3),
    "notification_barcode_old" TEXT,
    "notification_sent_date_old" TIMESTAMP(3),
    "notification_delivered_date_old" TIMESTAMP(3),
    "notification_status_old" TEXT,
    "notificationNote" TEXT,
    "assetVehicle" "AssetQueryStatus" NOT NULL DEFAULT 'UNKNOWN',
    "assetRealEstate" "AssetQueryStatus" NOT NULL DEFAULT 'UNKNOWN',
    "assetBank" "AssetQueryStatus" NOT NULL DEFAULT 'UNKNOWN',
    "assetSgkWage" "AssetQueryStatus" NOT NULL DEFAULT 'UNKNOWN',
    "assetLastQueryAt" TIMESTAMP(3),
    "quickNote" TEXT,
    "quickNoteUpdatedAt" TIMESTAMP(3),
    "quickNoteUpdatedBy" TEXT,
    "debtorLawyerId" TEXT,
    "debtorLawyerName" TEXT,
    "debtorLawyerBarNo" TEXT,
    "caseNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseDebtor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceHistory" (
    "id" TEXT NOT NULL,
    "caseDebtorId" TEXT NOT NULL,
    "fromStatus" "ServiceStatus",
    "toStatus" "ServiceStatus" NOT NULL,
    "channel" "DebtorNotificationMode",
    "trackingNo" TEXT,
    "returnReason" "ServiceReturnReason",
    "addressId" TEXT,
    "addressType" "AddressType",
    "addressText" TEXT,
    "actionDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Due" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" "DueType" NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "interestType" TEXT,
    "interestRate" DECIMAL(5,2),
    "interestStartDate" TIMESTAMP(3),
    "interestEndDate" TIMESTAMP(3),
    "interestDays" INTEGER,
    "accruesInterest" BOOLEAN NOT NULL DEFAULT true,
    "sourceDocumentId" TEXT,
    "sourceDocumentNo" TEXT,
    "hasKdv" BOOLEAN NOT NULL DEFAULT false,
    "kdvRate" DECIMAL(5,2),
    "hasBsmv" BOOLEAN NOT NULL DEFAULT false,
    "hasKkdf" BOOLEAN NOT NULL DEFAULT false,
    "requiresFinalization" BOOLEAN NOT NULL DEFAULT false,
    "isFinalized" BOOLEAN NOT NULL DEFAULT false,
    "finalizationDate" TIMESTAMP(3),
    "finalizationNote" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Due_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "debtorId" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "description" TEXT NOT NULL,
    "value" DECIMAL(15,2),
    "details" JSONB,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThirdParty" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseDebtorId" TEXT NOT NULL,
    "type" "ThirdPartyType" NOT NULL,
    "name" TEXT NOT NULL,
    "identityNo" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "kepAddress" TEXT,
    "relationDesc" TEXT,
    "ihbarname89_1_date" TIMESTAMP(3),
    "ihbarname89_1_status" TEXT,
    "ihbarname89_2_date" TIMESTAMP(3),
    "ihbarname89_2_status" TEXT,
    "ihbarname89_3_date" TIMESTAMP(3),
    "ihbarname89_3_status" TEXT,
    "responseDate" TIMESTAMP(3),
    "responseContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThirdParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalCase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseDebtorId" TEXT NOT NULL,
    "externalOffice" TEXT NOT NULL,
    "externalOfficeId" TEXT,
    "externalCaseNo" TEXT NOT NULL,
    "counterpartyName" TEXT NOT NULL,
    "counterpartyId" TEXT,
    "claimAmount" DECIMAL(15,2) NOT NULL,
    "claimCurrency" TEXT NOT NULL DEFAULT 'TRY',
    "attachmentStatus" "ExternalCaseStatus" NOT NULL DEFAULT 'HACIZ_TALEP',
    "attachedAt" TIMESTAMP(3),
    "receivedAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "lastReceivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "priorityNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtorCommunication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "debtorId" TEXT NOT NULL,
    "caseId" TEXT,
    "channel" TEXT NOT NULL,
    "templateId" TEXT,
    "templateName" TEXT,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failReason" TEXT,
    "callDuration" INTEGER,
    "callNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtorCommunication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "dueDate" TIMESTAMP(3),
    "assigneeId" TEXT,
    "createdById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Court" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "type" TEXT,
    "courtType" TEXT,
    "courtCode" TEXT,
    "uyapCode" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Court_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Office" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "district" TEXT,
    "postalCode" TEXT,
    "phone" TEXT,
    "fax" TEXT,
    "email" TEXT,
    "website" TEXT,
    "barAssociation" TEXT,
    "defaultExecutionOfficeId" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUser" TEXT,
    "smtpPass" TEXT,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
    "smtpFromName" TEXT,
    "smtpFromEmail" TEXT,
    "smsProvider" TEXT,
    "smsApiKey" TEXT,
    "smsApiSecret" TEXT,
    "smsSender" TEXT,
    "autoGreetingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoGreetingTime" TEXT DEFAULT '09:00',
    "inactivityThresholdDays" INTEGER NOT NULL DEFAULT 365,
    "inactivityWarningDays" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Office_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficeBankAccount" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "branchName" TEXT,
    "iban" TEXT NOT NULL,
    "accountName" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficeBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lawyer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "officeId" TEXT,
    "name" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "tckn" TEXT,
    "gender" TEXT,
    "title" TEXT,
    "barNumber" TEXT,
    "barCity" TEXT,
    "tbbNo" TEXT,
    "lawyerType" TEXT,
    "vergiDairesi" TEXT,
    "vergiNo" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "fax" TEXT,
    "address" TEXT,
    "city" TEXT,
    "district" TEXT,
    "bankName" TEXT,
    "branchName" TEXT,
    "iban" TEXT,
    "isInHouseCounsel" BOOLEAN NOT NULL DEFAULT false,
    "isEmployee" BOOLEAN NOT NULL DEFAULT false,
    "lawyerRank" "LawyerRank" NOT NULL DEFAULT 'LAWYER',
    "defaultPermissions" JSONB,
    "permissionsLocked" BOOLEAN NOT NULL DEFAULT false,
    "permissionsLockedBy" TEXT,
    "permissionsLockedAt" TIMESTAMP(3),
    "canModifyOtherPermissions" BOOLEAN NOT NULL DEFAULT false,
    "role" "LawyerRole" NOT NULL DEFAULT 'EMPLOYEE',
    "canSign" BOOLEAN NOT NULL DEFAULT false,
    "canAppearInUyap" BOOLEAN NOT NULL DEFAULT false,
    "canBeResponsible" BOOLEAN NOT NULL DEFAULT true,
    "isDefaultForNewCases" BOOLEAN NOT NULL DEFAULT false,
    "uyapUsername" TEXT,
    "uyapToken" TEXT,
    "eSignatureSerial" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "barName" TEXT,
    "identityNo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lawyer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseLawyer" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "lawyerId" TEXT NOT NULL,
    "role" "CaseLawyerRole" NOT NULL DEFAULT 'ASSIGNED',
    "hasSignatureAuthority" BOOLEAN NOT NULL DEFAULT false,
    "isResponsible" BOOLEAN NOT NULL DEFAULT false,
    "casePermissions" JSONB,
    "permissionSource" TEXT NOT NULL DEFAULT 'DEFAULT',
    "visibleToClient" BOOLEAN NOT NULL DEFAULT true,
    "receiveNotifications" BOOLEAN NOT NULL DEFAULT true,
    "powerOfAttorneyId" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT,
    "notes" TEXT,
    "canSign" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseLawyer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LawyerTemplate" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "lawyers" JSONB NOT NULL,
    "applicableFor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LawyerTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PowerOfAttorney" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT,
    "clientName" TEXT,
    "lawyerId" TEXT NOT NULL,
    "type" "PowerOfAttorneyType" NOT NULL DEFAULT 'GENEL',
    "scope" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "notaryName" TEXT,
    "notaryCity" TEXT,
    "registerNo" TEXT,
    "documentPath" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PowerOfAttorney_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "caseDebtorId" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "type" "CollectionType" NOT NULL,
    "channel" "CollectionChannel" NOT NULL DEFAULT 'BANKA',
    "date" TIMESTAMP(3) NOT NULL,
    "valueDate" TIMESTAMP(3),
    "sourceType" "CollectionSource",
    "sourceId" TEXT,
    "description" TEXT,
    "receiptNo" TEXT,
    "bankName" TEXT,
    "accountNo" TEXT,
    "notes" TEXT,
    "status" "CollectionStatus" NOT NULL DEFAULT 'CONFIRMED',
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionAllocation" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "allocationType" "AllocationType" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseLifecycle" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "stage" "WorkflowStage" NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "triggeredBy" "TriggerType" NOT NULL DEFAULT 'MANUAL',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseLifecycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnforcementAction" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" "EnforcementType" NOT NULL,
    "status" "EnforcementStatus" NOT NULL DEFAULT 'PENDING',
    "targetType" TEXT,
    "targetDetails" JSONB,
    "requestDate" TIMESTAMP(3),
    "responseDate" TIMESTAMP(3),
    "responseDetails" JSONB,
    "amount" DECIMAL(15,2),
    "notes" TEXT,
    "documentPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnforcementAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskReport" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "collectionProb" INTEGER,
    "recommendedAction" TEXT,
    "factors" JSONB,
    "assetAnalysis" JSONB,
    "debtorAnalysis" JSONB,
    "aiSuggestions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionLog" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "decisionType" "DecisionType" NOT NULL,
    "decision" TEXT NOT NULL,
    "reasoning" TEXT,
    "confidence" INTEGER,
    "inputData" JSONB,
    "outcome" TEXT,
    "isAutomatic" BOOLEAN NOT NULL DEFAULT false,
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationQueue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "caseId" TEXT,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "recipientName" TEXT,
    "subject" TEXT,
    "content" TEXT,
    "templateCode" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "responseAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tebligat" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "caseDebtorId" TEXT,
    "tebligatType" "TebligatType" NOT NULL,
    "addressType" "TebligatAddressType" NOT NULL,
    "addressId" TEXT,
    "addressText" TEXT NOT NULL,
    "city" TEXT,
    "district" TEXT,
    "recipientName" TEXT NOT NULL,
    "recipientTcVkn" TEXT,
    "channel" "TebligatChannel" NOT NULL,
    "status" "TebligatStatus" NOT NULL DEFAULT 'HAZIRLANDI',
    "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "pttResult" "TebligatPttResult",
    "pttResultDate" TIMESTAMP(3),
    "pttResultNote" TEXT,
    "tk21Type" "Tk21Type",
    "muhtarlikDate" TIMESTAMP(3),
    "ilanDate" TIMESTAMP(3),
    "tebligSayilmaDate" TIMESTAMP(3),
    "nextAction" "TebligatNextAction",
    "nextActionDate" TIMESTAMP(3),
    "documentId" TEXT,
    "barcodeNo" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tebligat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "DocumentCategory" NOT NULL,
    "subCategory" "CaseSubCategory",
    "currency" "Currency",
    "templateContent" TEXT NOT NULL,
    "headerContent" TEXT,
    "footerContent" TEXT,
    "variables" JSONB,
    "uyapCode" TEXT,
    "iikMaddesi" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UyapRequestLog" (
    "id" TEXT NOT NULL,
    "caseId" TEXT,
    "requestType" TEXT NOT NULL,
    "requestData" JSONB,
    "requestAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responseData" JSONB,
    "responseAt" TIMESTAMP(3),
    "status" "UyapRequestStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "evkNo" TEXT,
    "uyapDosyaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UyapRequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "FormCategory" NOT NULL,
    "procedureType" "ProcedureType" NOT NULL,
    "uyapCode" TEXT,
    "iikMaddesi" TEXT,
    "usageScenario" TEXT,
    "exampleCase" TEXT,
    "hasJudgment" BOOLEAN NOT NULL DEFAULT false,
    "needsMortgage" BOOLEAN NOT NULL DEFAULT false,
    "isKambiyo" BOOLEAN NOT NULL DEFAULT false,
    "isRental" BOOLEAN NOT NULL DEFAULT false,
    "requiredDocuments" JSONB,
    "defaultWorkflow" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormSubType" (
    "id" TEXT NOT NULL,
    "formTypeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "uyapCode" TEXT,
    "usageScenario" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormSubType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "officeId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "tckn" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "staffType" "StaffType" NOT NULL,
    "canCreateCase" BOOLEAN NOT NULL DEFAULT false,
    "canEditCase" BOOLEAN NOT NULL DEFAULT false,
    "canGenerateDocuments" BOOLEAN NOT NULL DEFAULT false,
    "canApproveDocuments" BOOLEAN NOT NULL DEFAULT false,
    "canSeeFinance" BOOLEAN NOT NULL DEFAULT false,
    "canApproveFinance" BOOLEAN NOT NULL DEFAULT false,
    "canSendNotifications" BOOLEAN NOT NULL DEFAULT false,
    "isDefaultForNewCases" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseStaff" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "staffMemberId" TEXT NOT NULL,
    "roleOnCase" TEXT NOT NULL,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canApprove" BOOLEAN NOT NULL DEFAULT false,
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "receiveNotifications" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "caseId" TEXT,
    "channel" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "sentById" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalNotification" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "caseId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "linkUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalDocument" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "caseId" TEXT,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalMessage" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT,
    "content" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "packageCode" TEXT,
    "gateType" "ExpenseGateType" NOT NULL DEFAULT 'BLOCKING',
    "stageCode" TEXT,
    "paidTotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "taskId" TEXT,
    "items" JSONB,
    "totalSuggested" DECIMAL(15,2),
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "dueDate" TIMESTAMP(3),
    "status" "ExpenseRequestStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "sentVia" TEXT,
    "messageTemplateId" TEXT,
    "notificationId" TEXT,
    "sendEmail" BOOLEAN NOT NULL DEFAULT false,
    "sendSms" BOOLEAN NOT NULL DEFAULT false,
    "sendWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "renderedSubject" TEXT,
    "renderedBody" TEXT,
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "lastReminderAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "responseNotes" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidAmount" DECIMAL(15,2),
    "receiptDocId" TEXT,
    "paymentMethod" TEXT,
    "paymentReference" TEXT,
    "createdById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseRequestItem" (
    "id" TEXT NOT NULL,
    "expenseRequestId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "suggestedAmount" DECIMAL(15,2) NOT NULL,
    "finalAmount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "isEditable" BOOLEAN NOT NULL DEFAULT true,
    "wasOverridden" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "overriddenById" TEXT,
    "overriddenAt" TIMESTAMP(3),
    "calcParams" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpensePayment" (
    "id" TEXT NOT NULL,
    "expenseRequestId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "matchedBy" TEXT,
    "matchedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpensePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseAuditLog" (
    "id" TEXT NOT NULL,
    "expenseRequestId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "MessageTemplateCategory" NOT NULL,
    "channel" "MessageTemplateChannel" NOT NULL DEFAULT 'EMAIL',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "availableTokens" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialDay" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "isVariable" BOOLEAN NOT NULL DEFAULT false,
    "year" INTEGER,
    "greetingMessage" TEXT,
    "smsMessage" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sendGreeting" BOOLEAN NOT NULL DEFAULT true,
    "daysBeforeReminder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecialDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GreetingQueue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "specialDayId" TEXT,
    "channel" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "notificationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GreetingQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "time" TEXT,
    "type" TEXT NOT NULL,
    "caseId" TEXT,
    "location" TEXT,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "level" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "endpoint" TEXT,
    "method" TEXT,
    "statusCode" INTEGER,
    "userId" TEXT,
    "userIp" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "userId" TEXT,
    "userName" TEXT,
    "userIp" TEXT,
    "userAgent" TEXT,
    "oldValues" JSONB,
    "newValues" JSONB,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicInstitution" (
    "id" TEXT NOT NULL,
    "detsisNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "category" "PublicInstitutionCategory" NOT NULL,
    "parentId" TEXT,
    "city" TEXT,
    "district" TEXT,
    "address" TEXT,
    "postalCode" TEXT,
    "phone" TEXT,
    "fax" TEXT,
    "email" TEXT,
    "website" TEXT,
    "kepAddress" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicInstitution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UyapUnit" (
    "id" TEXT NOT NULL,
    "birimId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "uyapCode" TEXT,
    "unitType" "UyapUnitType" NOT NULL,
    "city" TEXT,
    "district" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UyapUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "itemType" "ClaimItemType" NOT NULL,
    "sourceProcess" "ClaimSourceProcess" NOT NULL DEFAULT 'MAIN_ENFORCEMENT',
    "sourceProcessId" TEXT,
    "originalAmount" DECIMAL(15,2) NOT NULL,
    "demandedAmount" DECIMAL(15,2) NOT NULL,
    "collectedAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "sourceDocumentId" TEXT,
    "sourceDocumentType" "DocumentSourceType",
    "interestType" "InterestType",
    "interestRate" DECIMAL(5,2),
    "interestStartDate" TIMESTAMP(3),
    "interestEndDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "issueDate" TIMESTAMP(3),
    "description" TEXT,
    "referenceNo" TEXT,
    "label" TEXT,
    "isCalculated" BOOLEAN NOT NULL DEFAULT false,
    "calculatedAt" TIMESTAMP(3),
    "isVirtual" BOOLEAN NOT NULL DEFAULT false,
    "isAllDebtorsLiable" BOOLEAN NOT NULL DEFAULT true,
    "liableDebtorIds" TEXT[],
    "status" "ClaimItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "bucket" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "ClaimItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "entryType" "LedgerEntryType" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveDate" TIMESTAMP(3),
    "description" TEXT,
    "referenceNo" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "status" "LedgerEntryStatus" NOT NULL DEFAULT 'CONFIRMED',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAllocation" (
    "id" TEXT NOT NULL,
    "ledgerEntryId" TEXT NOT NULL,
    "claimItemId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "allocationOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterestRate" (
    "id" TEXT NOT NULL,
    "interestType" "InterestType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "rate" DECIMAL(5,2) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "source" TEXT,
    "sourceDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterestRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseInstrument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "instrumentType" "InstrumentType" NOT NULL,
    "serialNo" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "issueDate" TIMESTAMP(3) NOT NULL,
    "maturityDate" TIMESTAMP(3),
    "presentmentDate" TIMESTAMP(3),
    "bankName" TEXT,
    "bankBranch" TEXT,
    "bankCode" TEXT,
    "accountNo" TEXT,
    "drawerName" TEXT,
    "drawerIdentity" TEXT,
    "payeeName" TEXT,
    "payeeIdentity" TEXT,
    "endorsers" JSONB,
    "avals" JSONB,
    "isProtested" BOOLEAN NOT NULL DEFAULT false,
    "protestDate" TIMESTAMP(3),
    "protestNo" TEXT,
    "isBounced" BOOLEAN NOT NULL DEFAULT false,
    "bounceDate" TIMESTAMP(3),
    "bounceReason" TEXT,
    "documentId" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseInstrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseLease" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "contractDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "monthlyRent" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "paymentDay" INTEGER,
    "propertyType" "PropertyType" NOT NULL DEFAULT 'KONUT',
    "propertyAddress" TEXT NOT NULL,
    "propertyCity" TEXT,
    "propertyDistrict" TEXT,
    "landlordName" TEXT,
    "landlordIdentity" TEXT,
    "tenantName" TEXT,
    "tenantIdentity" TEXT,
    "evictionReason" "EvictionReason",
    "evictionCommitmentDate" TIMESTAMP(3),
    "evictionNoticeDate" TIMESTAMP(3),
    "rentPeriods" JSONB,
    "documentId" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseLease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseJudgment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "courtName" TEXT NOT NULL,
    "courtCity" TEXT,
    "courtType" TEXT,
    "caseNo" TEXT,
    "decisionNo" TEXT,
    "decisionDate" TIMESTAMP(3) NOT NULL,
    "judgmentSummary" TEXT,
    "judgmentAmount" DECIMAL(15,2),
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "interestType" "InterestType",
    "interestRate" DECIMAL(5,2),
    "interestStartDate" TIMESTAMP(3),
    "requiresFinalization" BOOLEAN NOT NULL DEFAULT false,
    "isFinalized" BOOLEAN NOT NULL DEFAULT false,
    "finalizationDate" TIMESTAMP(3),
    "finalizationNote" TEXT,
    "nafakaType" "NafakaType",
    "monthlyNafaka" DECIMAL(15,2),
    "nafakaStartDate" TIMESTAMP(3),
    "documentId" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseJudgment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseCollateral" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "collateralType" "CollateralType" NOT NULL,
    "description" TEXT NOT NULL,
    "propertyType" TEXT,
    "propertyAddress" TEXT,
    "propertyCity" TEXT,
    "propertyDistrict" TEXT,
    "tapuInfo" TEXT,
    "vehiclePlate" TEXT,
    "vehicleType" TEXT,
    "vehicleBrand" TEXT,
    "vehicleModel" TEXT,
    "vehicleYear" INTEGER,
    "collateralAmount" DECIMAL(15,2),
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "pledgorName" TEXT,
    "pledgorIdentity" TEXT,
    "isPledgorDebtor" BOOLEAN NOT NULL DEFAULT true,
    "registrationDate" TIMESTAMP(3),
    "registrationNo" TEXT,
    "registrationOffice" TEXT,
    "rank" INTEGER NOT NULL DEFAULT 1,
    "documentId" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseCollateral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationResult" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "gateId" "ValidationGate" NOT NULL,
    "gateName" TEXT NOT NULL,
    "isValid" BOOLEAN NOT NULL,
    "validatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errors" JSONB,
    "warnings" JSONB,
    "checkedFields" JSONB,
    "missingFields" JSONB,
    "validatedById" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddressMissingTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "debtorId" TEXT NOT NULL,
    "status" "AddressTaskStatus" NOT NULL DEFAULT 'PENDING',
    "suggestedMethods" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionMethod" TEXT,
    "foundAddressId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AddressMissingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EsignLog" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentName" TEXT NOT NULL,
    "signerId" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerTcNo" TEXT NOT NULL,
    "signatureType" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "transactionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "signedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EsignLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "branchCode" TEXT,
    "branchName" TEXT,
    "accountNo" TEXT,
    "iban" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "accountType" TEXT NOT NULL DEFAULT 'VADESIZ',
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT,
    "ownerName" TEXT NOT NULL,
    "isIntegrated" BOOLEAN NOT NULL DEFAULT false,
    "integrationProvider" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "valueDate" TIMESTAMP(3),
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "transactionType" TEXT NOT NULL,
    "counterpartyName" TEXT,
    "counterpartyIban" TEXT,
    "counterpartyBank" TEXT,
    "description" TEXT,
    "referenceNo" TEXT,
    "isMatched" BOOLEAN NOT NULL DEFAULT false,
    "matchedCaseId" TEXT,
    "matchedCollectionId" TEXT,
    "matchedAt" TIMESTAMP(3),
    "matchedById" TEXT,
    "bankReferenceId" TEXT,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankIntegrationLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "action" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "transactionCount" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "requestData" JSONB,
    "responseData" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BankIntegrationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecautionaryOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "orderType" TEXT NOT NULL DEFAULT 'IHTIYATI_HACIZ',
    "courtName" TEXT NOT NULL,
    "courtCity" TEXT,
    "decisionDate" TIMESTAMP(3) NOT NULL,
    "decisionNo" TEXT,
    "scopeNote" TEXT,
    "coveredDebtorIds" TEXT[],
    "securedAmount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "requiresSecurityDeposit" BOOLEAN NOT NULL DEFAULT false,
    "securityDepositAmount" DECIMAL(15,2),
    "securityDepositType" "SecurityDepositType",
    "securityDepositNote" TEXT,
    "securityDepositPaidAt" TIMESTAMP(3),
    "status" "PrecautionaryOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "appliedAt" TIMESTAMP(3),
    "liftedAt" TIMESTAMP(3),
    "liftReason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "decisionDocumentId" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "PrecautionaryOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecautionaryCost" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "precautionaryOrderId" TEXT NOT NULL,
    "costType" "PrecautionaryCostType" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "description" TEXT,
    "label" TEXT,
    "isClaimedInEnforcement" BOOLEAN NOT NULL DEFAULT true,
    "claimItemId" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "paidAmount" DECIMAL(15,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrecautionaryCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LimitationRiskLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT,
    "riskType" TEXT NOT NULL DEFAULT 'LIMITATION',
    "level" "LimitationLevel" NOT NULL,
    "claimTypeCode" TEXT NOT NULL,
    "role" TEXT,
    "startDateInput" TIMESTAMP(3),
    "baseStartUsed" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "daysLeft" INTEGER,
    "ackAction" "LimitationAckAction",
    "ackAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LimitationRiskLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostPackage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "caseTypes" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "messageTemplateCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostPackageItem" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "defaultAmount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "calcRule" JSONB,
    "isEditable" BOOLEAN NOT NULL DEFAULT true,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostPackageItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseBalance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "lowThreshold" DECIMAL(15,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceLedger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseBalanceId" TEXT NOT NULL,
    "type" "BalanceLedgerType" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageEventRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "eventCode" TEXT NOT NULL,
    "packageCode" TEXT,
    "actionType" "StageActionType" NOT NULL,
    "hardBlock" BOOLEAN NOT NULL DEFAULT false,
    "minBalanceRequired" DECIMAL(15,2),
    "messageTemplateCode" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageEventRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientInfoRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "debtorId" TEXT,
    "emailTo" TEXT NOT NULL,
    "emailSubject" TEXT NOT NULL,
    "emailBody" TEXT NOT NULL,
    "status" "ClientInfoRequestStatus" NOT NULL DEFAULT 'SENT',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "responseNotes" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientInfoRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UyapQuery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseDebtorId" TEXT NOT NULL,
    "queryType" "UyapQueryType" NOT NULL,
    "queryCode" TEXT NOT NULL,
    "status" "UyapQueryStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedBy" TEXT NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "triggeredBy" TEXT NOT NULL DEFAULT 'MANUAL',
    "response" JSONB,
    "errorMessage" TEXT,
    "addressesFound" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UyapQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstitutionLetter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseDebtorId" TEXT NOT NULL,
    "institution" "InstitutionType" NOT NULL,
    "letterType" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "documentUrl" TEXT,
    "status" "InstitutionLetterStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "sentMethod" TEXT,
    "respondedAt" TIMESTAMP(3),
    "responseNotes" TEXT,
    "addressesFound" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstitutionLetter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddressResearch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseDebtorId" TEXT NOT NULL,
    "status" "AddressResearchStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "clientInfoRequested" BOOLEAN NOT NULL DEFAULT false,
    "uyapQueriesCompleted" BOOLEAN NOT NULL DEFAULT false,
    "crossFileChecked" BOOLEAN NOT NULL DEFAULT false,
    "institutionLettersSent" BOOLEAN NOT NULL DEFAULT false,
    "totalAddressesFound" INTEGER NOT NULL DEFAULT 0,
    "failedNotifications" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastSuggestion" TEXT,
    "lastSuggestionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AddressResearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetQuery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseDebtorId" TEXT NOT NULL,
    "queryType" "AssetQueryType" NOT NULL,
    "status" "AssetQueryJobStatus" NOT NULL DEFAULT 'QUEUED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedBy" TEXT NOT NULL,
    "reason" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "result" "AssetQueryStatus",
    "resultData" JSONB,
    "errorMessage" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "status" "BotTaskStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "BotTaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "inputData" JSONB,
    "outputData" JSONB,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotEvidence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "caseId" TEXT NOT NULL,
    "taskId" TEXT,
    "recipeId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL DEFAULT 'AUTO',
    "dataSnapshot" JSONB NOT NULL,
    "dataHash" TEXT NOT NULL,
    "screenshotUrl" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotBundle" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "IcrabotBundleType" NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "IcrabotBundleStatus" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "notes" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "activatedAt" TIMESTAMP(3),
    "activatedBy" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IcrabotBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotJobRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "debtorId" TEXT,
    "jobId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "recipeVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "IcrabotJobStatus" NOT NULL DEFAULT 'QUEUED',
    "riskLevel" "IcrabotRiskLevel" NOT NULL DEFAULT 'READ_ONLY',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 4,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "leasedUntil" TIMESTAMP(3),
    "leasedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IcrabotJobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotJobStep" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stepNo" INTEGER NOT NULL,
    "actionType" TEXT NOT NULL,
    "uyapNavPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "snapshotHash" TEXT,
    "proofRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IcrabotJobStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotEvidence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "screenshotUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IcrabotEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotLock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "lockType" "IcrabotLockType" NOT NULL,
    "reason" TEXT,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "openedBy" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "overrideRequestedBy" TEXT,
    "overrideRequestedAt" TIMESTAMP(3),
    "overrideApprovedBy" TEXT,
    "overrideApprovedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IcrabotLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotEvidenceExport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "exportId" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'zip',
    "fileUrl" TEXT,
    "fileSize" INTEGER,
    "snapshotCount" INTEGER NOT NULL DEFAULT 0,
    "factCount" INTEGER NOT NULL DEFAULT 0,
    "jobCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "requestedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "IcrabotEvidenceExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SelectorHealthLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "selectorKey" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SelectorHealthLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseRunLock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "lockType" TEXT NOT NULL DEFAULT 'WRITE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseRunLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotFact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "factType" TEXT NOT NULL,
    "factKey" TEXT NOT NULL,
    "factHash" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "snapshotRef" TEXT,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IcrabotFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotRecipePause" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IcrabotRecipePause_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotUiMapRecording" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "selector" TEXT NOT NULL,
    "alternatives" JSONB NOT NULL DEFAULT '[]',
    "stabilityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "selectorKind" TEXT NOT NULL DEFAULT 'unknown',
    "meta" JSONB NOT NULL DEFAULT '{}',
    "screenshotPath" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IcrabotUiMapRecording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotAuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "prevHash" TEXT NOT NULL,
    "eventHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IcrabotAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotApprovalRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "jobId" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "riskLevel" TEXT,
    "lockId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IcrabotApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotApprovalDecision" (
    "id" TEXT NOT NULL,
    "approvalRequestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IcrabotApprovalDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotCaseFact" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IcrabotCaseFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotCaseFlag" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IcrabotCaseFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotFactAudit" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "kind" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IcrabotFactAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotEngineRun" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "triggerEventId" TEXT,
    "snapshotHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'started',
    "computeSummary" JSONB,
    "error" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "IcrabotEngineRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotTimelineEntry" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "tenantId" TEXT,
    "runId" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "body" JSONB,
    "source" TEXT NOT NULL DEFAULT 'system',
    "aggregateVersion" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IcrabotTimelineEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotOutboxAction" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "runId" TEXT,
    "actionType" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" JSONB,
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IcrabotOutboxAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotRulePack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IcrabotRulePack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotRule" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IcrabotRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotRuleRevision" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IcrabotRuleRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotQueueItem" (
    "id" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IcrabotQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotEmailLog" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "template" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IcrabotEmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotSmsLog" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IcrabotSmsLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotNotification" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "recipient" TEXT NOT NULL DEFAULT 'all',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "IcrabotNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotUyapSubmission" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentId" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "uyapRef" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IcrabotUyapSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcrabotTask" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "assignee" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "IcrabotTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_schedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "interestType" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "annualRate" DECIMAL(10,6) NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT,
    "versionHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "rate_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interest_calculation_log" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "requestJson" JSONB NOT NULL,
    "resultJson" JSONB NOT NULL,
    "totalInterest" DECIMAL(18,2) NOT NULL,
    "totalDue" DECIMAL(18,2) NOT NULL,
    "rateHashes" TEXT[],
    "flaggedForReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewReason" TEXT,
    "createdBy" TEXT,

    CONSTRAINT "interest_calculation_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interest_segment_log" (
    "id" TEXT NOT NULL,
    "calculationLogId" TEXT NOT NULL,
    "principalItemId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "days" INTEGER NOT NULL,
    "rate" DECIMAL(10,6) NOT NULL,
    "rateId" TEXT NOT NULL,
    "principal" DECIMAL(18,2) NOT NULL,
    "segmentInterest" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "interest_segment_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddressTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "debtorId" TEXT NOT NULL,
    "taskType" "AddressTaskType" NOT NULL,
    "scopeKey" TEXT,
    "dedupeKey" TEXT,
    "status" "AddressTaskStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "assignedToId" TEXT,
    "channelUsed" TEXT,
    "correlationId" TEXT,
    "messageIds" JSONB,
    "resultType" "AddressTaskResultType",
    "resultData" JSONB,
    "failureReason" "AddressTaskFailureReason",
    "failureDetails" TEXT,
    "cancellationReason" "AddressTaskCancellationReason",
    "resolution" "ManualTaskResolution",
    "resolutionNotes" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "title" TEXT,
    "description" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AddressTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddressEvidenceRef" (
    "id" TEXT NOT NULL,
    "debtorAddressId" TEXT NOT NULL,
    "evidenceType" "EvidenceType" NOT NULL,
    "documentId" TEXT,
    "communicationId" TEXT,
    "uyapQueryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AddressEvidenceRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddressAuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "debtorId" TEXT,
    "addressTaskId" TEXT,
    "debtorAddressId" TEXT,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "showInNotes" BOOLEAN NOT NULL DEFAULT false,
    "noteText" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AddressAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddressOutboxEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "AddressOutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentArtifact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "format" "DocumentFormat" NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "dataHash" TEXT NOT NULL,
    "status" "DocumentArtifactStatus" NOT NULL DEFAULT 'GENERATING',
    "filePath" TEXT,
    "fileSize" INTEGER,
    "fileName" TEXT,
    "contentHash" TEXT,
    "errorMessage" TEXT,
    "generatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CpeDecisionLog" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "actionCode" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "contextJson" JSONB,
    "allowed" BOOLEAN NOT NULL,
    "code" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "factsUsedKeys" TEXT[],
    "factsSnapshotHash" TEXT,
    "stateSnapshot" JSONB,
    "gateCode" TEXT,
    "gateSeverity" TEXT,
    "warnings" JSONB,
    "traceId" TEXT,
    "ruleVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CpeDecisionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CpeExecutionRecord" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "actionCode" TEXT NOT NULL,
    "contextJson" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "CpeExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "stateBeforeHash" TEXT,
    "stateAfterHash" TEXT,
    "ruleVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CpeExecutionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulation_runs" (
    "run_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "scenario_id" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "simulation_version" TEXT NOT NULL,
    "engine_version" TEXT,
    "status" "SimulationRunStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "current_snapshot_id" TEXT,
    "baseline_snapshot_id" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,

    CONSTRAINT "simulation_runs_pkey" PRIMARY KEY ("run_id")
);

-- CreateTable
CREATE TABLE "simulation_snapshots" (
    "snapshot_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "run_id" TEXT,
    "snapshot_kind" "SimulationSnapshotKind" NOT NULL,
    "is_baseline" BOOLEAN NOT NULL DEFAULT false,
    "verdict" TEXT NOT NULL,
    "drift_score" DECIMAL(10,6) NOT NULL,
    "calc_result" JSONB NOT NULL,
    "calc_result_norm" JSONB NOT NULL,
    "calc_hash" TEXT NOT NULL,
    "retention_policy" TEXT DEFAULT 'STANDARD',
    "expires_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "archived_by" TEXT,
    "archived_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "simulation_snapshots_pkey" PRIMARY KEY ("snapshot_id")
);

-- CreateTable
CREATE TABLE "cleanup_failure_state" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "last_failed_at" TIMESTAMPTZ(6),
    "last_error_code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cleanup_failure_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_bundle_pointers" (
    "id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "manifest_key" TEXT NOT NULL,
    "manifest_sha256" TEXT NOT NULL,
    "bundle_content_hash" TEXT NOT NULL,
    "etag" TEXT,
    "version_id" TEXT,
    "total_size_bytes" BIGINT NOT NULL,
    "item_count" INTEGER NOT NULL,
    "state" "BundleState" NOT NULL DEFAULT 'DRAFT',
    "seal_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_seal_attempt_at" TIMESTAMPTZ(6),
    "last_error_code" TEXT,
    "last_error_detail" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sealed_at" TIMESTAMPTZ(6),

    CONSTRAINT "evidence_bundle_pointers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_bundles" (
    "bundle_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" VARCHAR(64) NOT NULL,
    "incident_id" VARCHAR(128) NOT NULL,
    "state" "EvidenceBundleState" NOT NULL DEFAULT 'OPEN',
    "sealed_hash" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sealed_at" TIMESTAMPTZ(6),

    CONSTRAINT "evidence_bundles_pkey" PRIMARY KEY ("bundle_id")
);

-- CreateTable
CREATE TABLE "evidence_objects" (
    "bundle_id" UUID NOT NULL,
    "object_key" VARCHAR(512) NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "etag" VARCHAR(64) NOT NULL,
    "version_id" VARCHAR(128),
    "content_type" VARCHAR(128) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_objects_pk" PRIMARY KEY ("bundle_id","object_key")
);

-- CreateTable
CREATE TABLE "bundle_seal_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bundle_id" UUID NOT NULL,
    "run_id" VARCHAR(128) NOT NULL,
    "hash" VARCHAR(128) NOT NULL,
    "object_count" INTEGER NOT NULL,
    "total_size_bytes" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bundle_seal_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manifest_admin_audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_type" "ManifestAdminAuditEventType" NOT NULL,
    "actor" VARCHAR(256) NOT NULL,
    "request_id" VARCHAR(256) NOT NULL,
    "ip_hash" VARCHAR(64) NOT NULL,
    "user_agent" TEXT NOT NULL,
    "resource_type" "ManifestAdminAuditResourceType" NOT NULL,
    "resource_id" VARCHAR(256) NOT NULL,
    "target_bundle_id" VARCHAR(256) NOT NULL,
    "before_state" JSONB,
    "after_state" JSONB,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manifest_admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manifest_worker_state" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "is_paused" BOOLEAN NOT NULL DEFAULT false,
    "pause_reason" "ManifestWorkerPauseReason",
    "paused_at" TIMESTAMPTZ(6),
    "paused_by" TEXT,
    "consecutive_errors" INTEGER NOT NULL DEFAULT 0,
    "last_error_code" TEXT,
    "last_error_at" TIMESTAMPTZ(6),
    "owner_instance_id" TEXT,
    "lease_expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manifest_worker_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promote_request" (
    "id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "status" "PromoteRequestStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "result_ref" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "promote_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalation_state" (
    "incident_id" TEXT NOT NULL,
    "current_level" "EscalationLevelEnum" NOT NULL DEFAULT 'NONE',
    "last_transition_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hold_down_until" TIMESTAMPTZ(6),
    "stable_window_counter" INTEGER NOT NULL DEFAULT 0,
    "stable_window_started_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "escalation_state_pkey" PRIMARY KEY ("incident_id")
);

-- CreateIndex
CREATE INDEX "LookupTakipTuru_tenantId_idx" ON "LookupTakipTuru"("tenantId");

-- CreateIndex
CREATE INDEX "LookupTakipTuru_isActive_idx" ON "LookupTakipTuru"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "LookupTakipTuru_tenantId_code_key" ON "LookupTakipTuru"("tenantId", "code");

-- CreateIndex
CREATE INDEX "LookupAsama_tenantId_idx" ON "LookupAsama"("tenantId");

-- CreateIndex
CREATE INDEX "LookupAsama_isActive_idx" ON "LookupAsama"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "LookupAsama_tenantId_code_key" ON "LookupAsama"("tenantId", "code");

-- CreateIndex
CREATE INDEX "LookupRisk_tenantId_idx" ON "LookupRisk"("tenantId");

-- CreateIndex
CREATE INDEX "LookupRisk_isActive_idx" ON "LookupRisk"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "LookupRisk_tenantId_code_key" ON "LookupRisk"("tenantId", "code");

-- CreateIndex
CREATE INDEX "LookupBorcluTipi_tenantId_idx" ON "LookupBorcluTipi"("tenantId");

-- CreateIndex
CREATE INDEX "LookupBorcluTipi_isActive_idx" ON "LookupBorcluTipi"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "LookupBorcluTipi_tenantId_code_key" ON "LookupBorcluTipi"("tenantId", "code");

-- CreateIndex
CREATE INDEX "LookupDurumEtiketi_tenantId_idx" ON "LookupDurumEtiketi"("tenantId");

-- CreateIndex
CREATE INDEX "LookupDurumEtiketi_isActive_idx" ON "LookupDurumEtiketi"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "LookupDurumEtiketi_tenantId_code_key" ON "LookupDurumEtiketi"("tenantId", "code");

-- CreateIndex
CREATE INDEX "LookupMahiyetTipi_tenantId_idx" ON "LookupMahiyetTipi"("tenantId");

-- CreateIndex
CREATE INDEX "LookupMahiyetTipi_isActive_idx" ON "LookupMahiyetTipi"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "LookupMahiyetTipi_tenantId_code_key" ON "LookupMahiyetTipi"("tenantId", "code");

-- CreateIndex
CREATE INDEX "GroupDefinition_tenantId_idx" ON "GroupDefinition"("tenantId");

-- CreateIndex
CREATE INDEX "GroupDefinition_clientId_idx" ON "GroupDefinition"("clientId");

-- CreateIndex
CREATE INDEX "GroupDefinition_isActive_idx" ON "GroupDefinition"("isActive");

-- CreateIndex
CREATE INDEX "CaseGroup_caseId_idx" ON "CaseGroup"("caseId");

-- CreateIndex
CREATE INDEX "CaseGroup_groupId_idx" ON "CaseGroup"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseGroup_caseId_groupId_key" ON "CaseGroup"("caseId", "groupId");

-- CreateIndex
CREATE INDEX "CaseStageHistory_caseId_idx" ON "CaseStageHistory"("caseId");

-- CreateIndex
CREATE INDEX "CaseStageHistory_asamaId_idx" ON "CaseStageHistory"("asamaId");

-- CreateIndex
CREATE INDEX "CaseStageHistory_startedAt_idx" ON "CaseStageHistory"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_slug_idx" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_accountType_idx" ON "Tenant"("accountType");

-- CreateIndex
CREATE INDEX "WorkflowTemplate_tenantId_idx" ON "WorkflowTemplate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTemplate_tenantId_code_key" ON "WorkflowTemplate"("tenantId", "code");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE INDEX "ExecutionOffice_tenantId_idx" ON "ExecutionOffice"("tenantId");

-- CreateIndex
CREATE INDEX "ExecutionOffice_city_idx" ON "ExecutionOffice"("city");

-- CreateIndex
CREATE INDEX "ExecutionOffice_uyapCode_idx" ON "ExecutionOffice"("uyapCode");

-- CreateIndex
CREATE INDEX "Client_tenantId_idx" ON "Client"("tenantId");

-- CreateIndex
CREATE INDEX "Client_tenantId_tckn_idx" ON "Client"("tenantId", "tckn");

-- CreateIndex
CREATE INDEX "Client_tenantId_vkn_idx" ON "Client"("tenantId", "vkn");

-- CreateIndex
CREATE INDEX "Client_type_idx" ON "Client"("type");

-- CreateIndex
CREATE INDEX "Client_isActive_idx" ON "Client"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPortalUser_clientId_key" ON "ClientPortalUser"("clientId");

-- CreateIndex
CREATE INDEX "ClientPortalUser_email_idx" ON "ClientPortalUser"("email");

-- CreateIndex
CREATE INDEX "ClientPortalUser_clientId_idx" ON "ClientPortalUser"("clientId");

-- CreateIndex
CREATE INDEX "ClientContact_clientId_idx" ON "ClientContact"("clientId");

-- CreateIndex
CREATE INDEX "ClientContact_type_idx" ON "ClientContact"("type");

-- CreateIndex
CREATE INDEX "ClientBankAccount_clientId_idx" ON "ClientBankAccount"("clientId");

-- CreateIndex
CREATE INDEX "ClientPowerOfAttorney_clientId_idx" ON "ClientPowerOfAttorney"("clientId");

-- CreateIndex
CREATE INDEX "ClientPowerOfAttorney_isActive_idx" ON "ClientPowerOfAttorney"("isActive");

-- CreateIndex
CREATE INDEX "ClientPowerOfAttorney_status_idx" ON "ClientPowerOfAttorney"("status");

-- CreateIndex
CREATE INDEX "ClientPowerOfAttorney_validUntil_idx" ON "ClientPowerOfAttorney"("validUntil");

-- CreateIndex
CREATE INDEX "PoaLawyer_poaId_idx" ON "PoaLawyer"("poaId");

-- CreateIndex
CREATE INDEX "PoaLawyer_lawyerId_idx" ON "PoaLawyer"("lawyerId");

-- CreateIndex
CREATE UNIQUE INDEX "PoaLawyer_poaId_lawyerId_key" ON "PoaLawyer"("poaId", "lawyerId");

-- CreateIndex
CREATE INDEX "CaseClient_caseId_idx" ON "CaseClient"("caseId");

-- CreateIndex
CREATE INDEX "CaseClient_clientId_idx" ON "CaseClient"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseClient_caseId_clientId_key" ON "CaseClient"("caseId", "clientId");

-- CreateIndex
CREATE INDEX "Debtor_tenantId_idx" ON "Debtor"("tenantId");

-- CreateIndex
CREATE INDEX "Debtor_tenantId_identityNo_idx" ON "Debtor"("tenantId", "identityNo");

-- CreateIndex
CREATE INDEX "Debtor_tenantId_tckn_idx" ON "Debtor"("tenantId", "tckn");

-- CreateIndex
CREATE INDEX "Debtor_tenantId_vkn_idx" ON "Debtor"("tenantId", "vkn");

-- CreateIndex
CREATE INDEX "Debtor_tenantId_detsisNo_idx" ON "Debtor"("tenantId", "detsisNo");

-- CreateIndex
CREATE INDEX "Debtor_tenantId_name_idx" ON "Debtor"("tenantId", "name");

-- CreateIndex
CREATE INDEX "EstateHeir_debtorId_idx" ON "EstateHeir"("debtorId");

-- CreateIndex
CREATE INDEX "DebtorAddress_debtorId_idx" ON "DebtorAddress"("debtorId");

-- CreateIndex
CREATE INDEX "DebtorAddress_type_idx" ON "DebtorAddress"("type");

-- CreateIndex
CREATE INDEX "DebtorAddress_verified_idx" ON "DebtorAddress"("verified");

-- CreateIndex
CREATE INDEX "DebtorAddress_addressCategory_idx" ON "DebtorAddress"("addressCategory");

-- CreateIndex
CREATE INDEX "DebtorAddress_isCurrent_idx" ON "DebtorAddress"("isCurrent");

-- CreateIndex
CREATE INDEX "DebtorAddress_isCurrentCandidate_idx" ON "DebtorAddress"("isCurrentCandidate");

-- CreateIndex
CREATE INDEX "DebtorAddress_priorityScore_idx" ON "DebtorAddress"("priorityScore");

-- CreateIndex
CREATE UNIQUE INDEX "DebtorAddress_debtorId_addressHash_key" ON "DebtorAddress"("debtorId", "addressHash");

-- CreateIndex
CREATE INDEX "Case_tenantId_status_idx" ON "Case"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Case_tenantId_caseStatus_idx" ON "Case"("tenantId", "caseStatus");

-- CreateIndex
CREATE INDEX "Case_tenantId_createdAt_idx" ON "Case"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Case_formTypeId_idx" ON "Case"("formTypeId");

-- CreateIndex
CREATE INDEX "Case_workflowStage_idx" ON "Case"("workflowStage");

-- CreateIndex
CREATE INDEX "Case_nextActionAt_idx" ON "Case"("nextActionAt");

-- CreateIndex
CREATE INDEX "Case_executionOfficeId_idx" ON "Case"("executionOfficeId");

-- CreateIndex
CREATE INDEX "Case_isAutomationEnabled_idx" ON "Case"("isAutomationEnabled");

-- CreateIndex
CREATE INDEX "Case_takipTuruId_idx" ON "Case"("takipTuruId");

-- CreateIndex
CREATE INDEX "Case_asamaId_idx" ON "Case"("asamaId");

-- CreateIndex
CREATE INDEX "Case_riskId_idx" ON "Case"("riskId");

-- CreateIndex
CREATE INDEX "Case_durumEtiketiId_idx" ON "Case"("durumEtiketiId");

-- CreateIndex
CREATE INDEX "Case_mahiyetTipiId_idx" ON "Case"("mahiyetTipiId");

-- CreateIndex
CREATE INDEX "Case_sorumluPersonelId_idx" ON "Case"("sorumluPersonelId");

-- CreateIndex
CREATE INDEX "Case_clientId_idx" ON "Case"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Case_tenantId_fileNumber_key" ON "Case"("tenantId", "fileNumber");

-- CreateIndex
CREATE INDEX "CaseStatusHistory_caseId_idx" ON "CaseStatusHistory"("caseId");

-- CreateIndex
CREATE INDEX "CaseStatusHistory_createdAt_idx" ON "CaseStatusHistory"("createdAt");

-- CreateIndex
CREATE INDEX "CaseDocument_caseId_idx" ON "CaseDocument"("caseId");

-- CreateIndex
CREATE INDEX "CaseDocument_documentType_idx" ON "CaseDocument"("documentType");

-- CreateIndex
CREATE INDEX "CaseDocument_isSourceDocument_idx" ON "CaseDocument"("isSourceDocument");

-- CreateIndex
CREATE INDEX "CaseDebtor_caseId_idx" ON "CaseDebtor"("caseId");

-- CreateIndex
CREATE INDEX "CaseDebtor_debtorId_idx" ON "CaseDebtor"("debtorId");

-- CreateIndex
CREATE INDEX "CaseDebtor_serviceStatus_idx" ON "CaseDebtor"("serviceStatus");

-- CreateIndex
CREATE UNIQUE INDEX "CaseDebtor_caseId_debtorId_role_key" ON "CaseDebtor"("caseId", "debtorId", "role");

-- CreateIndex
CREATE INDEX "ServiceHistory_caseDebtorId_idx" ON "ServiceHistory"("caseDebtorId");

-- CreateIndex
CREATE INDEX "ServiceHistory_toStatus_idx" ON "ServiceHistory"("toStatus");

-- CreateIndex
CREATE INDEX "ServiceHistory_addressId_idx" ON "ServiceHistory"("addressId");

-- CreateIndex
CREATE INDEX "Due_caseId_idx" ON "Due"("caseId");

-- CreateIndex
CREATE INDEX "Due_type_idx" ON "Due"("type");

-- CreateIndex
CREATE INDEX "Asset_debtorId_idx" ON "Asset"("debtorId");

-- CreateIndex
CREATE INDEX "ThirdParty_caseDebtorId_idx" ON "ThirdParty"("caseDebtorId");

-- CreateIndex
CREATE INDEX "ThirdParty_tenantId_idx" ON "ThirdParty"("tenantId");

-- CreateIndex
CREATE INDEX "ExternalCase_caseDebtorId_idx" ON "ExternalCase"("caseDebtorId");

-- CreateIndex
CREATE INDEX "ExternalCase_tenantId_idx" ON "ExternalCase"("tenantId");

-- CreateIndex
CREATE INDEX "ExternalCase_externalCaseNo_idx" ON "ExternalCase"("externalCaseNo");

-- CreateIndex
CREATE INDEX "DebtorCommunication_debtorId_idx" ON "DebtorCommunication"("debtorId");

-- CreateIndex
CREATE INDEX "DebtorCommunication_caseId_idx" ON "DebtorCommunication"("caseId");

-- CreateIndex
CREATE INDEX "DebtorCommunication_tenantId_idx" ON "DebtorCommunication"("tenantId");

-- CreateIndex
CREATE INDEX "Task_tenantId_status_idx" ON "Task"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Task_tenantId_dueDate_idx" ON "Task"("tenantId", "dueDate");

-- CreateIndex
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");

-- CreateIndex
CREATE INDEX "Court_tenantId_idx" ON "Court"("tenantId");

-- CreateIndex
CREATE INDEX "Court_city_idx" ON "Court"("city");

-- CreateIndex
CREATE INDEX "Court_uyapCode_idx" ON "Court"("uyapCode");

-- CreateIndex
CREATE UNIQUE INDEX "Office_tenantId_key" ON "Office"("tenantId");

-- CreateIndex
CREATE INDEX "Office_tenantId_idx" ON "Office"("tenantId");

-- CreateIndex
CREATE INDEX "OfficeBankAccount_officeId_idx" ON "OfficeBankAccount"("officeId");

-- CreateIndex
CREATE INDEX "Lawyer_tenantId_idx" ON "Lawyer"("tenantId");

-- CreateIndex
CREATE INDEX "Lawyer_officeId_idx" ON "Lawyer"("officeId");

-- CreateIndex
CREATE INDEX "Lawyer_isActive_idx" ON "Lawyer"("isActive");

-- CreateIndex
CREATE INDEX "Lawyer_lawyerRank_idx" ON "Lawyer"("lawyerRank");

-- CreateIndex
CREATE INDEX "CaseLawyer_caseId_idx" ON "CaseLawyer"("caseId");

-- CreateIndex
CREATE INDEX "CaseLawyer_lawyerId_idx" ON "CaseLawyer"("lawyerId");

-- CreateIndex
CREATE INDEX "CaseLawyer_isResponsible_idx" ON "CaseLawyer"("isResponsible");

-- CreateIndex
CREATE UNIQUE INDEX "CaseLawyer_caseId_lawyerId_key" ON "CaseLawyer"("caseId", "lawyerId");

-- CreateIndex
CREATE INDEX "LawyerTemplate_officeId_idx" ON "LawyerTemplate"("officeId");

-- CreateIndex
CREATE INDEX "LawyerTemplate_isDefault_idx" ON "LawyerTemplate"("isDefault");

-- CreateIndex
CREATE INDEX "PowerOfAttorney_tenantId_idx" ON "PowerOfAttorney"("tenantId");

-- CreateIndex
CREATE INDEX "PowerOfAttorney_lawyerId_idx" ON "PowerOfAttorney"("lawyerId");

-- CreateIndex
CREATE INDEX "PowerOfAttorney_clientId_idx" ON "PowerOfAttorney"("clientId");

-- CreateIndex
CREATE INDEX "PowerOfAttorney_isActive_idx" ON "PowerOfAttorney"("isActive");

-- CreateIndex
CREATE INDEX "Collection_tenantId_idx" ON "Collection"("tenantId");

-- CreateIndex
CREATE INDEX "Collection_caseId_idx" ON "Collection"("caseId");

-- CreateIndex
CREATE INDEX "Collection_caseDebtorId_idx" ON "Collection"("caseDebtorId");

-- CreateIndex
CREATE INDEX "Collection_date_idx" ON "Collection"("date");

-- CreateIndex
CREATE INDEX "Collection_status_idx" ON "Collection"("status");

-- CreateIndex
CREATE INDEX "Collection_type_idx" ON "Collection"("type");

-- CreateIndex
CREATE INDEX "CollectionAllocation_collectionId_idx" ON "CollectionAllocation"("collectionId");

-- CreateIndex
CREATE INDEX "CaseLifecycle_caseId_idx" ON "CaseLifecycle"("caseId");

-- CreateIndex
CREATE INDEX "CaseLifecycle_stage_idx" ON "CaseLifecycle"("stage");

-- CreateIndex
CREATE INDEX "CaseLifecycle_createdAt_idx" ON "CaseLifecycle"("createdAt");

-- CreateIndex
CREATE INDEX "EnforcementAction_caseId_idx" ON "EnforcementAction"("caseId");

-- CreateIndex
CREATE INDEX "EnforcementAction_type_idx" ON "EnforcementAction"("type");

-- CreateIndex
CREATE INDEX "EnforcementAction_status_idx" ON "EnforcementAction"("status");

-- CreateIndex
CREATE INDEX "RiskReport_caseId_idx" ON "RiskReport"("caseId");

-- CreateIndex
CREATE INDEX "RiskReport_overallScore_idx" ON "RiskReport"("overallScore");

-- CreateIndex
CREATE INDEX "DecisionLog_caseId_idx" ON "DecisionLog"("caseId");

-- CreateIndex
CREATE INDEX "DecisionLog_decisionType_idx" ON "DecisionLog"("decisionType");

-- CreateIndex
CREATE INDEX "DecisionLog_isAutomatic_idx" ON "DecisionLog"("isAutomatic");

-- CreateIndex
CREATE INDEX "NotificationQueue_tenantId_idx" ON "NotificationQueue"("tenantId");

-- CreateIndex
CREATE INDEX "NotificationQueue_caseId_idx" ON "NotificationQueue"("caseId");

-- CreateIndex
CREATE INDEX "NotificationQueue_status_idx" ON "NotificationQueue"("status");

-- CreateIndex
CREATE INDEX "NotificationQueue_scheduledAt_idx" ON "NotificationQueue"("scheduledAt");

-- CreateIndex
CREATE INDEX "NotificationQueue_expiresAt_idx" ON "NotificationQueue"("expiresAt");

-- CreateIndex
CREATE INDEX "Tebligat_tenantId_idx" ON "Tebligat"("tenantId");

-- CreateIndex
CREATE INDEX "Tebligat_caseId_idx" ON "Tebligat"("caseId");

-- CreateIndex
CREATE INDEX "Tebligat_caseDebtorId_idx" ON "Tebligat"("caseDebtorId");

-- CreateIndex
CREATE INDEX "Tebligat_status_idx" ON "Tebligat"("status");

-- CreateIndex
CREATE INDEX "Tebligat_tebligatType_idx" ON "Tebligat"("tebligatType");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplate_code_key" ON "DocumentTemplate"("code");

-- CreateIndex
CREATE INDEX "DocumentTemplate_category_idx" ON "DocumentTemplate"("category");

-- CreateIndex
CREATE INDEX "DocumentTemplate_subCategory_idx" ON "DocumentTemplate"("subCategory");

-- CreateIndex
CREATE INDEX "DocumentTemplate_isActive_idx" ON "DocumentTemplate"("isActive");

-- CreateIndex
CREATE INDEX "UyapRequestLog_caseId_idx" ON "UyapRequestLog"("caseId");

-- CreateIndex
CREATE INDEX "UyapRequestLog_status_idx" ON "UyapRequestLog"("status");

-- CreateIndex
CREATE INDEX "UyapRequestLog_requestType_idx" ON "UyapRequestLog"("requestType");

-- CreateIndex
CREATE UNIQUE INDEX "FormType_code_key" ON "FormType"("code");

-- CreateIndex
CREATE INDEX "FormType_category_idx" ON "FormType"("category");

-- CreateIndex
CREATE INDEX "FormType_isActive_idx" ON "FormType"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "FormSubType_code_key" ON "FormSubType"("code");

-- CreateIndex
CREATE INDEX "FormSubType_formTypeId_idx" ON "FormSubType"("formTypeId");

-- CreateIndex
CREATE INDEX "StaffMember_tenantId_idx" ON "StaffMember"("tenantId");

-- CreateIndex
CREATE INDEX "StaffMember_officeId_idx" ON "StaffMember"("officeId");

-- CreateIndex
CREATE INDEX "StaffMember_staffType_idx" ON "StaffMember"("staffType");

-- CreateIndex
CREATE INDEX "StaffMember_isActive_idx" ON "StaffMember"("isActive");

-- CreateIndex
CREATE INDEX "CaseStaff_caseId_idx" ON "CaseStaff"("caseId");

-- CreateIndex
CREATE INDEX "CaseStaff_staffMemberId_idx" ON "CaseStaff"("staffMemberId");

-- CreateIndex
CREATE INDEX "CaseStaff_roleOnCase_idx" ON "CaseStaff"("roleOnCase");

-- CreateIndex
CREATE UNIQUE INDEX "CaseStaff_caseId_staffMemberId_key" ON "CaseStaff"("caseId", "staffMemberId");

-- CreateIndex
CREATE INDEX "ClientNotification_tenantId_idx" ON "ClientNotification"("tenantId");

-- CreateIndex
CREATE INDEX "ClientNotification_clientId_idx" ON "ClientNotification"("clientId");

-- CreateIndex
CREATE INDEX "ClientNotification_caseId_idx" ON "ClientNotification"("caseId");

-- CreateIndex
CREATE INDEX "ClientNotification_channel_idx" ON "ClientNotification"("channel");

-- CreateIndex
CREATE INDEX "ClientNotification_type_idx" ON "ClientNotification"("type");

-- CreateIndex
CREATE INDEX "ClientNotification_status_idx" ON "ClientNotification"("status");

-- CreateIndex
CREATE INDEX "PortalNotification_clientId_idx" ON "PortalNotification"("clientId");

-- CreateIndex
CREATE INDEX "PortalNotification_caseId_idx" ON "PortalNotification"("caseId");

-- CreateIndex
CREATE INDEX "PortalNotification_isRead_idx" ON "PortalNotification"("isRead");

-- CreateIndex
CREATE INDEX "PortalNotification_createdAt_idx" ON "PortalNotification"("createdAt");

-- CreateIndex
CREATE INDEX "PortalDocument_clientId_idx" ON "PortalDocument"("clientId");

-- CreateIndex
CREATE INDEX "PortalDocument_caseId_idx" ON "PortalDocument"("caseId");

-- CreateIndex
CREATE INDEX "PortalDocument_tenantId_idx" ON "PortalDocument"("tenantId");

-- CreateIndex
CREATE INDEX "PortalDocument_status_idx" ON "PortalDocument"("status");

-- CreateIndex
CREATE INDEX "PortalMessage_clientId_idx" ON "PortalMessage"("clientId");

-- CreateIndex
CREATE INDEX "PortalMessage_tenantId_idx" ON "PortalMessage"("tenantId");

-- CreateIndex
CREATE INDEX "PortalMessage_caseId_idx" ON "PortalMessage"("caseId");

-- CreateIndex
CREATE INDEX "PortalMessage_createdAt_idx" ON "PortalMessage"("createdAt");

-- CreateIndex
CREATE INDEX "ExpenseRequest_tenantId_idx" ON "ExpenseRequest"("tenantId");

-- CreateIndex
CREATE INDEX "ExpenseRequest_caseId_idx" ON "ExpenseRequest"("caseId");

-- CreateIndex
CREATE INDEX "ExpenseRequest_clientId_idx" ON "ExpenseRequest"("clientId");

-- CreateIndex
CREATE INDEX "ExpenseRequest_status_idx" ON "ExpenseRequest"("status");

-- CreateIndex
CREATE INDEX "ExpenseRequest_packageCode_idx" ON "ExpenseRequest"("packageCode");

-- CreateIndex
CREATE INDEX "ExpenseRequest_createdAt_idx" ON "ExpenseRequest"("createdAt");

-- CreateIndex
CREATE INDEX "ExpenseRequest_dueDate_idx" ON "ExpenseRequest"("dueDate");

-- CreateIndex
CREATE INDEX "ExpenseRequestItem_expenseRequestId_idx" ON "ExpenseRequestItem"("expenseRequestId");

-- CreateIndex
CREATE INDEX "ExpenseRequestItem_itemCode_idx" ON "ExpenseRequestItem"("itemCode");

-- CreateIndex
CREATE INDEX "ExpensePayment_expenseRequestId_idx" ON "ExpensePayment"("expenseRequestId");

-- CreateIndex
CREATE INDEX "ExpensePayment_paymentDate_idx" ON "ExpensePayment"("paymentDate");

-- CreateIndex
CREATE INDEX "ExpenseAuditLog_expenseRequestId_idx" ON "ExpenseAuditLog"("expenseRequestId");

-- CreateIndex
CREATE INDEX "ExpenseAuditLog_action_idx" ON "ExpenseAuditLog"("action");

-- CreateIndex
CREATE INDEX "ExpenseAuditLog_createdAt_idx" ON "ExpenseAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "MessageTemplate_tenantId_idx" ON "MessageTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "MessageTemplate_category_idx" ON "MessageTemplate"("category");

-- CreateIndex
CREATE INDEX "MessageTemplate_channel_idx" ON "MessageTemplate"("channel");

-- CreateIndex
CREATE INDEX "MessageTemplate_isActive_idx" ON "MessageTemplate"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_tenantId_code_key" ON "MessageTemplate"("tenantId", "code");

-- CreateIndex
CREATE INDEX "SpecialDay_tenantId_idx" ON "SpecialDay"("tenantId");

-- CreateIndex
CREATE INDEX "SpecialDay_month_day_idx" ON "SpecialDay"("month", "day");

-- CreateIndex
CREATE INDEX "SpecialDay_type_idx" ON "SpecialDay"("type");

-- CreateIndex
CREATE INDEX "SpecialDay_isActive_idx" ON "SpecialDay"("isActive");

-- CreateIndex
CREATE INDEX "GreetingQueue_tenantId_idx" ON "GreetingQueue"("tenantId");

-- CreateIndex
CREATE INDEX "GreetingQueue_clientId_idx" ON "GreetingQueue"("clientId");

-- CreateIndex
CREATE INDEX "GreetingQueue_scheduledAt_idx" ON "GreetingQueue"("scheduledAt");

-- CreateIndex
CREATE INDEX "GreetingQueue_status_idx" ON "GreetingQueue"("status");

-- CreateIndex
CREATE INDEX "GreetingQueue_type_idx" ON "GreetingQueue"("type");

-- CreateIndex
CREATE INDEX "CalendarEvent_tenantId_idx" ON "CalendarEvent"("tenantId");

-- CreateIndex
CREATE INDEX "CalendarEvent_date_idx" ON "CalendarEvent"("date");

-- CreateIndex
CREATE INDEX "CalendarEvent_caseId_idx" ON "CalendarEvent"("caseId");

-- CreateIndex
CREATE INDEX "CalendarEvent_type_idx" ON "CalendarEvent"("type");

-- CreateIndex
CREATE INDEX "CalendarEvent_isCompleted_idx" ON "CalendarEvent"("isCompleted");

-- CreateIndex
CREATE INDEX "ErrorLog_tenantId_idx" ON "ErrorLog"("tenantId");

-- CreateIndex
CREATE INDEX "ErrorLog_level_idx" ON "ErrorLog"("level");

-- CreateIndex
CREATE INDEX "ErrorLog_source_idx" ON "ErrorLog"("source");

-- CreateIndex
CREATE INDEX "ErrorLog_createdAt_idx" ON "ErrorLog"("createdAt");

-- CreateIndex
CREATE INDEX "ErrorLog_isResolved_idx" ON "ErrorLog"("isResolved");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_idx" ON "AuditLog"("entityType");

-- CreateIndex
CREATE INDEX "AuditLog_entityId_idx" ON "AuditLog"("entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PublicInstitution_detsisNo_key" ON "PublicInstitution"("detsisNo");

-- CreateIndex
CREATE INDEX "PublicInstitution_name_idx" ON "PublicInstitution"("name");

-- CreateIndex
CREATE INDEX "PublicInstitution_category_idx" ON "PublicInstitution"("category");

-- CreateIndex
CREATE INDEX "PublicInstitution_city_idx" ON "PublicInstitution"("city");

-- CreateIndex
CREATE INDEX "PublicInstitution_parentId_idx" ON "PublicInstitution"("parentId");

-- CreateIndex
CREATE INDEX "PublicInstitution_isActive_idx" ON "PublicInstitution"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "UyapUnit_birimId_key" ON "UyapUnit"("birimId");

-- CreateIndex
CREATE INDEX "UyapUnit_name_idx" ON "UyapUnit"("name");

-- CreateIndex
CREATE INDEX "UyapUnit_unitType_idx" ON "UyapUnit"("unitType");

-- CreateIndex
CREATE INDEX "UyapUnit_city_idx" ON "UyapUnit"("city");

-- CreateIndex
CREATE INDEX "UyapUnit_isActive_idx" ON "UyapUnit"("isActive");

-- CreateIndex
CREATE INDEX "ClaimItem_tenantId_idx" ON "ClaimItem"("tenantId");

-- CreateIndex
CREATE INDEX "ClaimItem_caseId_idx" ON "ClaimItem"("caseId");

-- CreateIndex
CREATE INDEX "ClaimItem_itemType_idx" ON "ClaimItem"("itemType");

-- CreateIndex
CREATE INDEX "ClaimItem_status_idx" ON "ClaimItem"("status");

-- CreateIndex
CREATE INDEX "ClaimItem_bucket_idx" ON "ClaimItem"("bucket");

-- CreateIndex
CREATE INDEX "LedgerEntry_tenantId_idx" ON "LedgerEntry"("tenantId");

-- CreateIndex
CREATE INDEX "LedgerEntry_caseId_idx" ON "LedgerEntry"("caseId");

-- CreateIndex
CREATE INDEX "LedgerEntry_entryType_idx" ON "LedgerEntry"("entryType");

-- CreateIndex
CREATE INDEX "LedgerEntry_entryDate_idx" ON "LedgerEntry"("entryDate");

-- CreateIndex
CREATE INDEX "LedgerAllocation_ledgerEntryId_idx" ON "LedgerAllocation"("ledgerEntryId");

-- CreateIndex
CREATE INDEX "LedgerAllocation_claimItemId_idx" ON "LedgerAllocation"("claimItemId");

-- CreateIndex
CREATE INDEX "InterestRate_interestType_idx" ON "InterestRate"("interestType");

-- CreateIndex
CREATE INDEX "InterestRate_currency_idx" ON "InterestRate"("currency");

-- CreateIndex
CREATE INDEX "InterestRate_startDate_idx" ON "InterestRate"("startDate");

-- CreateIndex
CREATE INDEX "InterestRate_isActive_idx" ON "InterestRate"("isActive");

-- CreateIndex
CREATE INDEX "CaseInstrument_tenantId_idx" ON "CaseInstrument"("tenantId");

-- CreateIndex
CREATE INDEX "CaseInstrument_caseId_idx" ON "CaseInstrument"("caseId");

-- CreateIndex
CREATE INDEX "CaseInstrument_instrumentType_idx" ON "CaseInstrument"("instrumentType");

-- CreateIndex
CREATE INDEX "CaseInstrument_serialNo_idx" ON "CaseInstrument"("serialNo");

-- CreateIndex
CREATE INDEX "CaseLease_tenantId_idx" ON "CaseLease"("tenantId");

-- CreateIndex
CREATE INDEX "CaseLease_caseId_idx" ON "CaseLease"("caseId");

-- CreateIndex
CREATE INDEX "CaseJudgment_tenantId_idx" ON "CaseJudgment"("tenantId");

-- CreateIndex
CREATE INDEX "CaseJudgment_caseId_idx" ON "CaseJudgment"("caseId");

-- CreateIndex
CREATE INDEX "CaseJudgment_courtName_idx" ON "CaseJudgment"("courtName");

-- CreateIndex
CREATE INDEX "CaseJudgment_decisionDate_idx" ON "CaseJudgment"("decisionDate");

-- CreateIndex
CREATE INDEX "CaseCollateral_tenantId_idx" ON "CaseCollateral"("tenantId");

-- CreateIndex
CREATE INDEX "CaseCollateral_caseId_idx" ON "CaseCollateral"("caseId");

-- CreateIndex
CREATE INDEX "CaseCollateral_collateralType_idx" ON "CaseCollateral"("collateralType");

-- CreateIndex
CREATE INDEX "ValidationResult_tenantId_idx" ON "ValidationResult"("tenantId");

-- CreateIndex
CREATE INDEX "ValidationResult_caseId_idx" ON "ValidationResult"("caseId");

-- CreateIndex
CREATE INDEX "ValidationResult_gateId_idx" ON "ValidationResult"("gateId");

-- CreateIndex
CREATE INDEX "ValidationResult_isValid_idx" ON "ValidationResult"("isValid");

-- CreateIndex
CREATE INDEX "ValidationResult_validatedAt_idx" ON "ValidationResult"("validatedAt");

-- CreateIndex
CREATE INDEX "AddressMissingTask_tenantId_idx" ON "AddressMissingTask"("tenantId");

-- CreateIndex
CREATE INDEX "AddressMissingTask_caseId_idx" ON "AddressMissingTask"("caseId");

-- CreateIndex
CREATE INDEX "AddressMissingTask_debtorId_idx" ON "AddressMissingTask"("debtorId");

-- CreateIndex
CREATE INDEX "AddressMissingTask_status_idx" ON "AddressMissingTask"("status");

-- CreateIndex
CREATE INDEX "EsignLog_documentId_idx" ON "EsignLog"("documentId");

-- CreateIndex
CREATE INDEX "EsignLog_signerId_idx" ON "EsignLog"("signerId");

-- CreateIndex
CREATE INDEX "EsignLog_status_idx" ON "EsignLog"("status");

-- CreateIndex
CREATE INDEX "EsignLog_provider_idx" ON "EsignLog"("provider");

-- CreateIndex
CREATE INDEX "EsignLog_createdAt_idx" ON "EsignLog"("createdAt");

-- CreateIndex
CREATE INDEX "BankAccount_tenantId_idx" ON "BankAccount"("tenantId");

-- CreateIndex
CREATE INDEX "BankAccount_ownerType_ownerId_idx" ON "BankAccount"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "BankAccount_isActive_idx" ON "BankAccount"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_tenantId_iban_key" ON "BankAccount"("tenantId", "iban");

-- CreateIndex
CREATE INDEX "BankTransaction_tenantId_idx" ON "BankTransaction"("tenantId");

-- CreateIndex
CREATE INDEX "BankTransaction_bankAccountId_idx" ON "BankTransaction"("bankAccountId");

-- CreateIndex
CREATE INDEX "BankTransaction_transactionDate_idx" ON "BankTransaction"("transactionDate");

-- CreateIndex
CREATE INDEX "BankTransaction_isMatched_idx" ON "BankTransaction"("isMatched");

-- CreateIndex
CREATE INDEX "BankTransaction_matchedCaseId_idx" ON "BankTransaction"("matchedCaseId");

-- CreateIndex
CREATE INDEX "BankIntegrationLog_tenantId_idx" ON "BankIntegrationLog"("tenantId");

-- CreateIndex
CREATE INDEX "BankIntegrationLog_bankAccountId_idx" ON "BankIntegrationLog"("bankAccountId");

-- CreateIndex
CREATE INDEX "BankIntegrationLog_status_idx" ON "BankIntegrationLog"("status");

-- CreateIndex
CREATE INDEX "BankIntegrationLog_startedAt_idx" ON "BankIntegrationLog"("startedAt");

-- CreateIndex
CREATE INDEX "PrecautionaryOrder_tenantId_idx" ON "PrecautionaryOrder"("tenantId");

-- CreateIndex
CREATE INDEX "PrecautionaryOrder_caseId_idx" ON "PrecautionaryOrder"("caseId");

-- CreateIndex
CREATE INDEX "PrecautionaryOrder_status_idx" ON "PrecautionaryOrder"("status");

-- CreateIndex
CREATE INDEX "PrecautionaryOrder_decisionDate_idx" ON "PrecautionaryOrder"("decisionDate");

-- CreateIndex
CREATE INDEX "PrecautionaryCost_tenantId_idx" ON "PrecautionaryCost"("tenantId");

-- CreateIndex
CREATE INDEX "PrecautionaryCost_precautionaryOrderId_idx" ON "PrecautionaryCost"("precautionaryOrderId");

-- CreateIndex
CREATE INDEX "PrecautionaryCost_costType_idx" ON "PrecautionaryCost"("costType");

-- CreateIndex
CREATE INDEX "LimitationRiskLog_tenantId_idx" ON "LimitationRiskLog"("tenantId");

-- CreateIndex
CREATE INDEX "LimitationRiskLog_caseId_idx" ON "LimitationRiskLog"("caseId");

-- CreateIndex
CREATE INDEX "LimitationRiskLog_userId_idx" ON "LimitationRiskLog"("userId");

-- CreateIndex
CREATE INDEX "LimitationRiskLog_level_idx" ON "LimitationRiskLog"("level");

-- CreateIndex
CREATE INDEX "LimitationRiskLog_createdAt_idx" ON "LimitationRiskLog"("createdAt");

-- CreateIndex
CREATE INDEX "CostPackage_tenantId_idx" ON "CostPackage"("tenantId");

-- CreateIndex
CREATE INDEX "CostPackage_code_idx" ON "CostPackage"("code");

-- CreateIndex
CREATE INDEX "CostPackage_isActive_idx" ON "CostPackage"("isActive");

-- CreateIndex
CREATE INDEX "CostPackageItem_packageId_idx" ON "CostPackageItem"("packageId");

-- CreateIndex
CREATE INDEX "CostPackageItem_itemCode_idx" ON "CostPackageItem"("itemCode");

-- CreateIndex
CREATE UNIQUE INDEX "CaseBalance_caseId_key" ON "CaseBalance"("caseId");

-- CreateIndex
CREATE INDEX "CaseBalance_tenantId_idx" ON "CaseBalance"("tenantId");

-- CreateIndex
CREATE INDEX "CaseBalance_caseId_idx" ON "CaseBalance"("caseId");

-- CreateIndex
CREATE INDEX "BalanceLedger_tenantId_idx" ON "BalanceLedger"("tenantId");

-- CreateIndex
CREATE INDEX "BalanceLedger_caseBalanceId_idx" ON "BalanceLedger"("caseBalanceId");

-- CreateIndex
CREATE INDEX "BalanceLedger_type_idx" ON "BalanceLedger"("type");

-- CreateIndex
CREATE INDEX "BalanceLedger_createdAt_idx" ON "BalanceLedger"("createdAt");

-- CreateIndex
CREATE INDEX "StageEventRule_tenantId_idx" ON "StageEventRule"("tenantId");

-- CreateIndex
CREATE INDEX "StageEventRule_eventCode_idx" ON "StageEventRule"("eventCode");

-- CreateIndex
CREATE INDEX "StageEventRule_isActive_idx" ON "StageEventRule"("isActive");

-- CreateIndex
CREATE INDEX "ClientInfoRequest_tenantId_idx" ON "ClientInfoRequest"("tenantId");

-- CreateIndex
CREATE INDEX "ClientInfoRequest_caseId_idx" ON "ClientInfoRequest"("caseId");

-- CreateIndex
CREATE INDEX "ClientInfoRequest_clientId_idx" ON "ClientInfoRequest"("clientId");

-- CreateIndex
CREATE INDEX "ClientInfoRequest_status_idx" ON "ClientInfoRequest"("status");

-- CreateIndex
CREATE INDEX "ClientInfoRequest_sentAt_idx" ON "ClientInfoRequest"("sentAt");

-- CreateIndex
CREATE INDEX "UyapQuery_tenantId_idx" ON "UyapQuery"("tenantId");

-- CreateIndex
CREATE INDEX "UyapQuery_caseDebtorId_idx" ON "UyapQuery"("caseDebtorId");

-- CreateIndex
CREATE INDEX "UyapQuery_queryType_idx" ON "UyapQuery"("queryType");

-- CreateIndex
CREATE INDEX "UyapQuery_status_idx" ON "UyapQuery"("status");

-- CreateIndex
CREATE INDEX "UyapQuery_requestedAt_idx" ON "UyapQuery"("requestedAt");

-- CreateIndex
CREATE INDEX "InstitutionLetter_tenantId_idx" ON "InstitutionLetter"("tenantId");

-- CreateIndex
CREATE INDEX "InstitutionLetter_caseDebtorId_idx" ON "InstitutionLetter"("caseDebtorId");

-- CreateIndex
CREATE INDEX "InstitutionLetter_institution_idx" ON "InstitutionLetter"("institution");

-- CreateIndex
CREATE INDEX "InstitutionLetter_status_idx" ON "InstitutionLetter"("status");

-- CreateIndex
CREATE INDEX "InstitutionLetter_sentAt_idx" ON "InstitutionLetter"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "AddressResearch_caseDebtorId_key" ON "AddressResearch"("caseDebtorId");

-- CreateIndex
CREATE INDEX "AddressResearch_tenantId_idx" ON "AddressResearch"("tenantId");

-- CreateIndex
CREATE INDEX "AddressResearch_status_idx" ON "AddressResearch"("status");

-- CreateIndex
CREATE INDEX "AddressResearch_startedAt_idx" ON "AddressResearch"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssetQuery_idempotencyKey_key" ON "AssetQuery"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AssetQuery_tenantId_idx" ON "AssetQuery"("tenantId");

-- CreateIndex
CREATE INDEX "AssetQuery_caseDebtorId_idx" ON "AssetQuery"("caseDebtorId");

-- CreateIndex
CREATE INDEX "AssetQuery_queryType_idx" ON "AssetQuery"("queryType");

-- CreateIndex
CREATE INDEX "AssetQuery_status_idx" ON "AssetQuery"("status");

-- CreateIndex
CREATE INDEX "AssetQuery_requestedAt_idx" ON "AssetQuery"("requestedAt");

-- CreateIndex
CREATE INDEX "BotTask_tenantId_idx" ON "BotTask"("tenantId");

-- CreateIndex
CREATE INDEX "BotTask_caseId_idx" ON "BotTask"("caseId");

-- CreateIndex
CREATE INDEX "BotTask_recipeId_idx" ON "BotTask"("recipeId");

-- CreateIndex
CREATE INDEX "BotTask_status_idx" ON "BotTask"("status");

-- CreateIndex
CREATE INDEX "BotTask_priority_idx" ON "BotTask"("priority");

-- CreateIndex
CREATE INDEX "BotTask_scheduledAt_idx" ON "BotTask"("scheduledAt");

-- CreateIndex
CREATE INDEX "BotEvidence_caseId_idx" ON "BotEvidence"("caseId");

-- CreateIndex
CREATE INDEX "BotEvidence_taskId_idx" ON "BotEvidence"("taskId");

-- CreateIndex
CREATE INDEX "BotEvidence_recipeId_idx" ON "BotEvidence"("recipeId");

-- CreateIndex
CREATE INDEX "BotEvidence_action_idx" ON "BotEvidence"("action");

-- CreateIndex
CREATE INDEX "BotEvidence_timestamp_idx" ON "BotEvidence"("timestamp");

-- CreateIndex
CREATE INDEX "IcrabotBundle_tenantId_idx" ON "IcrabotBundle"("tenantId");

-- CreateIndex
CREATE INDEX "IcrabotBundle_type_idx" ON "IcrabotBundle"("type");

-- CreateIndex
CREATE INDEX "IcrabotBundle_status_idx" ON "IcrabotBundle"("status");

-- CreateIndex
CREATE INDEX "IcrabotBundle_name_version_idx" ON "IcrabotBundle"("name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "IcrabotJobRun_jobId_key" ON "IcrabotJobRun"("jobId");

-- CreateIndex
CREATE INDEX "IcrabotJobRun_tenantId_idx" ON "IcrabotJobRun"("tenantId");

-- CreateIndex
CREATE INDEX "IcrabotJobRun_caseId_idx" ON "IcrabotJobRun"("caseId");

-- CreateIndex
CREATE INDEX "IcrabotJobRun_debtorId_idx" ON "IcrabotJobRun"("debtorId");

-- CreateIndex
CREATE INDEX "IcrabotJobRun_jobId_idx" ON "IcrabotJobRun"("jobId");

-- CreateIndex
CREATE INDEX "IcrabotJobRun_recipeId_idx" ON "IcrabotJobRun"("recipeId");

-- CreateIndex
CREATE INDEX "IcrabotJobRun_status_idx" ON "IcrabotJobRun"("status");

-- CreateIndex
CREATE INDEX "IcrabotJobRun_priority_idx" ON "IcrabotJobRun"("priority");

-- CreateIndex
CREATE INDEX "IcrabotJobRun_createdAt_idx" ON "IcrabotJobRun"("createdAt");

-- CreateIndex
CREATE INDEX "IcrabotJobStep_jobId_idx" ON "IcrabotJobStep"("jobId");

-- CreateIndex
CREATE INDEX "IcrabotJobStep_stepNo_idx" ON "IcrabotJobStep"("stepNo");

-- CreateIndex
CREATE INDEX "IcrabotJobStep_actionType_idx" ON "IcrabotJobStep"("actionType");

-- CreateIndex
CREATE UNIQUE INDEX "IcrabotEvidence_snapshotId_key" ON "IcrabotEvidence"("snapshotId");

-- CreateIndex
CREATE INDEX "IcrabotEvidence_tenantId_idx" ON "IcrabotEvidence"("tenantId");

-- CreateIndex
CREATE INDEX "IcrabotEvidence_caseId_idx" ON "IcrabotEvidence"("caseId");

-- CreateIndex
CREATE INDEX "IcrabotEvidence_snapshotId_idx" ON "IcrabotEvidence"("snapshotId");

-- CreateIndex
CREATE INDEX "IcrabotEvidence_createdAt_idx" ON "IcrabotEvidence"("createdAt");

-- CreateIndex
CREATE INDEX "IcrabotLock_tenantId_idx" ON "IcrabotLock"("tenantId");

-- CreateIndex
CREATE INDEX "IcrabotLock_caseId_idx" ON "IcrabotLock"("caseId");

-- CreateIndex
CREATE INDEX "IcrabotLock_lockType_idx" ON "IcrabotLock"("lockType");

-- CreateIndex
CREATE INDEX "IcrabotLock_isOpen_idx" ON "IcrabotLock"("isOpen");

-- CreateIndex
CREATE UNIQUE INDEX "IcrabotEvidenceExport_exportId_key" ON "IcrabotEvidenceExport"("exportId");

-- CreateIndex
CREATE INDEX "IcrabotEvidenceExport_tenantId_idx" ON "IcrabotEvidenceExport"("tenantId");

-- CreateIndex
CREATE INDEX "IcrabotEvidenceExport_caseId_idx" ON "IcrabotEvidenceExport"("caseId");

-- CreateIndex
CREATE INDEX "IcrabotEvidenceExport_exportId_idx" ON "IcrabotEvidenceExport"("exportId");

-- CreateIndex
CREATE INDEX "IcrabotEvidenceExport_status_idx" ON "IcrabotEvidenceExport"("status");

-- CreateIndex
CREATE INDEX "IcrabotEvidenceExport_createdAt_idx" ON "IcrabotEvidenceExport"("createdAt");

-- CreateIndex
CREATE INDEX "SystemConfig_tenantId_idx" ON "SystemConfig"("tenantId");

-- CreateIndex
CREATE INDEX "SystemConfig_key_idx" ON "SystemConfig"("key");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_tenantId_key_key" ON "SystemConfig"("tenantId", "key");

-- CreateIndex
CREATE INDEX "SelectorHealthLog_tenantId_idx" ON "SelectorHealthLog"("tenantId");

-- CreateIndex
CREATE INDEX "SelectorHealthLog_selectorKey_idx" ON "SelectorHealthLog"("selectorKey");

-- CreateIndex
CREATE INDEX "SelectorHealthLog_success_idx" ON "SelectorHealthLog"("success");

-- CreateIndex
CREATE INDEX "SelectorHealthLog_createdAt_idx" ON "SelectorHealthLog"("createdAt");

-- CreateIndex
CREATE INDEX "CaseRunLock_tenantId_idx" ON "CaseRunLock"("tenantId");

-- CreateIndex
CREATE INDEX "CaseRunLock_caseId_idx" ON "CaseRunLock"("caseId");

-- CreateIndex
CREATE INDEX "CaseRunLock_jobId_idx" ON "CaseRunLock"("jobId");

-- CreateIndex
CREATE INDEX "CaseRunLock_isActive_idx" ON "CaseRunLock"("isActive");

-- CreateIndex
CREATE INDEX "CaseRunLock_expiresAt_idx" ON "CaseRunLock"("expiresAt");

-- CreateIndex
CREATE INDEX "IcrabotFact_tenantId_idx" ON "IcrabotFact"("tenantId");

-- CreateIndex
CREATE INDEX "IcrabotFact_caseId_idx" ON "IcrabotFact"("caseId");

-- CreateIndex
CREATE INDEX "IcrabotFact_factType_idx" ON "IcrabotFact"("factType");

-- CreateIndex
CREATE INDEX "IcrabotFact_processed_idx" ON "IcrabotFact"("processed");

-- CreateIndex
CREATE INDEX "IcrabotFact_createdAt_idx" ON "IcrabotFact"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IcrabotFact_tenantId_caseId_factHash_key" ON "IcrabotFact"("tenantId", "caseId", "factHash");

-- CreateIndex
CREATE INDEX "IcrabotRecipePause_tenantId_idx" ON "IcrabotRecipePause"("tenantId");

-- CreateIndex
CREATE INDEX "IcrabotRecipePause_recipeId_idx" ON "IcrabotRecipePause"("recipeId");

-- CreateIndex
CREATE INDEX "IcrabotRecipePause_isPaused_idx" ON "IcrabotRecipePause"("isPaused");

-- CreateIndex
CREATE UNIQUE INDEX "IcrabotRecipePause_tenantId_recipeId_key" ON "IcrabotRecipePause"("tenantId", "recipeId");

-- CreateIndex
CREATE INDEX "IcrabotUiMapRecording_tenantId_idx" ON "IcrabotUiMapRecording"("tenantId");

-- CreateIndex
CREATE INDEX "IcrabotUiMapRecording_label_idx" ON "IcrabotUiMapRecording"("label");

-- CreateIndex
CREATE INDEX "IcrabotUiMapRecording_approved_idx" ON "IcrabotUiMapRecording"("approved");

-- CreateIndex
CREATE INDEX "IcrabotAuditLog_tenantId_idx" ON "IcrabotAuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "IcrabotAuditLog_caseId_idx" ON "IcrabotAuditLog"("caseId");

-- CreateIndex
CREATE INDEX "IcrabotAuditLog_userId_idx" ON "IcrabotAuditLog"("userId");

-- CreateIndex
CREATE INDEX "IcrabotAuditLog_action_idx" ON "IcrabotAuditLog"("action");

-- CreateIndex
CREATE INDEX "IcrabotAuditLog_createdAt_idx" ON "IcrabotAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "IcrabotAuditLog_eventHash_idx" ON "IcrabotAuditLog"("eventHash");

-- CreateIndex
CREATE INDEX "IcrabotApprovalRequest_tenantId_idx" ON "IcrabotApprovalRequest"("tenantId");

-- CreateIndex
CREATE INDEX "IcrabotApprovalRequest_caseId_idx" ON "IcrabotApprovalRequest"("caseId");

-- CreateIndex
CREATE INDEX "IcrabotApprovalRequest_status_idx" ON "IcrabotApprovalRequest"("status");

-- CreateIndex
CREATE INDEX "IcrabotApprovalRequest_createdAt_idx" ON "IcrabotApprovalRequest"("createdAt");

-- CreateIndex
CREATE INDEX "IcrabotApprovalDecision_approvalRequestId_idx" ON "IcrabotApprovalDecision"("approvalRequestId");

-- CreateIndex
CREATE INDEX "IcrabotApprovalDecision_userId_idx" ON "IcrabotApprovalDecision"("userId");

-- CreateIndex
CREATE INDEX "IcrabotCaseFact_caseId_idx" ON "IcrabotCaseFact"("caseId");

-- CreateIndex
CREATE INDEX "IcrabotCaseFact_key_idx" ON "IcrabotCaseFact"("key");

-- CreateIndex
CREATE UNIQUE INDEX "IcrabotCaseFact_caseId_key_key" ON "IcrabotCaseFact"("caseId", "key");

-- CreateIndex
CREATE INDEX "IcrabotCaseFlag_caseId_idx" ON "IcrabotCaseFlag"("caseId");

-- CreateIndex
CREATE INDEX "IcrabotCaseFlag_key_idx" ON "IcrabotCaseFlag"("key");

-- CreateIndex
CREATE INDEX "IcrabotCaseFlag_value_idx" ON "IcrabotCaseFlag"("value");

-- CreateIndex
CREATE UNIQUE INDEX "IcrabotCaseFlag_caseId_key_key" ON "IcrabotCaseFlag"("caseId", "key");

-- CreateIndex
CREATE INDEX "IcrabotFactAudit_caseId_idx" ON "IcrabotFactAudit"("caseId");

-- CreateIndex
CREATE INDEX "IcrabotFactAudit_key_idx" ON "IcrabotFactAudit"("key");

-- CreateIndex
CREATE INDEX "IcrabotFactAudit_kind_idx" ON "IcrabotFactAudit"("kind");

-- CreateIndex
CREATE INDEX "IcrabotFactAudit_createdAt_idx" ON "IcrabotFactAudit"("createdAt");

-- CreateIndex
CREATE INDEX "IcrabotEngineRun_caseId_idx" ON "IcrabotEngineRun"("caseId");

-- CreateIndex
CREATE INDEX "IcrabotEngineRun_ruleId_idx" ON "IcrabotEngineRun"("ruleId");

-- CreateIndex
CREATE INDEX "IcrabotEngineRun_status_idx" ON "IcrabotEngineRun"("status");

-- CreateIndex
CREATE INDEX "IcrabotEngineRun_startedAt_idx" ON "IcrabotEngineRun"("startedAt");

-- CreateIndex
CREATE INDEX "IcrabotTimelineEntry_tenantId_caseId_idx" ON "IcrabotTimelineEntry"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "IcrabotTimelineEntry_caseId_idx" ON "IcrabotTimelineEntry"("caseId");

-- CreateIndex
CREATE INDEX "IcrabotTimelineEntry_runId_idx" ON "IcrabotTimelineEntry"("runId");

-- CreateIndex
CREATE INDEX "IcrabotTimelineEntry_type_idx" ON "IcrabotTimelineEntry"("type");

-- CreateIndex
CREATE INDEX "IcrabotTimelineEntry_severity_idx" ON "IcrabotTimelineEntry"("severity");

-- CreateIndex
CREATE INDEX "IcrabotTimelineEntry_createdAt_idx" ON "IcrabotTimelineEntry"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IcrabotTimelineEntry_caseId_aggregateVersion_key" ON "IcrabotTimelineEntry"("caseId", "aggregateVersion");

-- CreateIndex
CREATE UNIQUE INDEX "IcrabotOutboxAction_idempotencyKey_key" ON "IcrabotOutboxAction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "IcrabotOutboxAction_caseId_idx" ON "IcrabotOutboxAction"("caseId");

-- CreateIndex
CREATE INDEX "IcrabotOutboxAction_runId_idx" ON "IcrabotOutboxAction"("runId");

-- CreateIndex
CREATE INDEX "IcrabotOutboxAction_actionType_idx" ON "IcrabotOutboxAction"("actionType");

-- CreateIndex
CREATE INDEX "IcrabotOutboxAction_status_idx" ON "IcrabotOutboxAction"("status");

-- CreateIndex
CREATE INDEX "IcrabotOutboxAction_nextRetryAt_idx" ON "IcrabotOutboxAction"("nextRetryAt");

-- CreateIndex
CREATE INDEX "IcrabotOutboxAction_createdAt_idx" ON "IcrabotOutboxAction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IcrabotRulePack_name_key" ON "IcrabotRulePack"("name");

-- CreateIndex
CREATE INDEX "IcrabotRulePack_name_idx" ON "IcrabotRulePack"("name");

-- CreateIndex
CREATE INDEX "IcrabotRulePack_isActive_idx" ON "IcrabotRulePack"("isActive");

-- CreateIndex
CREATE INDEX "IcrabotRule_packId_idx" ON "IcrabotRule"("packId");

-- CreateIndex
CREATE INDEX "IcrabotRule_ruleKey_idx" ON "IcrabotRule"("ruleKey");

-- CreateIndex
CREATE INDEX "IcrabotRule_isActive_idx" ON "IcrabotRule"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "IcrabotRule_packId_ruleKey_key" ON "IcrabotRule"("packId", "ruleKey");

-- CreateIndex
CREATE INDEX "IcrabotRuleRevision_ruleId_idx" ON "IcrabotRuleRevision"("ruleId");

-- CreateIndex
CREATE INDEX "IcrabotRuleRevision_version_idx" ON "IcrabotRuleRevision"("version");

-- CreateIndex
CREATE INDEX "IcrabotRuleRevision_isActive_idx" ON "IcrabotRuleRevision"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "IcrabotRuleRevision_ruleId_version_key" ON "IcrabotRuleRevision"("ruleId", "version");

-- CreateIndex
CREATE INDEX "IcrabotQueueItem_queue_idx" ON "IcrabotQueueItem"("queue");

-- CreateIndex
CREATE INDEX "IcrabotQueueItem_caseId_idx" ON "IcrabotQueueItem"("caseId");

-- CreateIndex
CREATE INDEX "IcrabotQueueItem_status_idx" ON "IcrabotQueueItem"("status");

-- CreateIndex
CREATE INDEX "IcrabotQueueItem_createdAt_idx" ON "IcrabotQueueItem"("createdAt");

-- CreateIndex
CREATE INDEX "IcrabotEmailLog_caseId_idx" ON "IcrabotEmailLog"("caseId");

-- CreateIndex
CREATE INDEX "IcrabotEmailLog_status_idx" ON "IcrabotEmailLog"("status");

-- CreateIndex
CREATE INDEX "IcrabotEmailLog_createdAt_idx" ON "IcrabotEmailLog"("createdAt");

-- CreateIndex
CREATE INDEX "IcrabotSmsLog_caseId_idx" ON "IcrabotSmsLog"("caseId");

-- CreateIndex
CREATE INDEX "IcrabotSmsLog_status_idx" ON "IcrabotSmsLog"("status");

-- CreateIndex
CREATE INDEX "IcrabotSmsLog_createdAt_idx" ON "IcrabotSmsLog"("createdAt");

-- CreateIndex
CREATE INDEX "IcrabotNotification_caseId_idx" ON "IcrabotNotification"("caseId");

-- CreateIndex
CREATE INDEX "IcrabotNotification_recipient_idx" ON "IcrabotNotification"("recipient");

-- CreateIndex
CREATE INDEX "IcrabotNotification_isRead_idx" ON "IcrabotNotification"("isRead");

-- CreateIndex
CREATE INDEX "IcrabotNotification_createdAt_idx" ON "IcrabotNotification"("createdAt");

-- CreateIndex
CREATE INDEX "IcrabotUyapSubmission_caseId_idx" ON "IcrabotUyapSubmission"("caseId");

-- CreateIndex
CREATE INDEX "IcrabotUyapSubmission_documentType_idx" ON "IcrabotUyapSubmission"("documentType");

-- CreateIndex
CREATE INDEX "IcrabotUyapSubmission_status_idx" ON "IcrabotUyapSubmission"("status");

-- CreateIndex
CREATE INDEX "IcrabotUyapSubmission_createdAt_idx" ON "IcrabotUyapSubmission"("createdAt");

-- CreateIndex
CREATE INDEX "IcrabotTask_caseId_idx" ON "IcrabotTask"("caseId");

-- CreateIndex
CREATE INDEX "IcrabotTask_assignee_idx" ON "IcrabotTask"("assignee");

-- CreateIndex
CREATE INDEX "IcrabotTask_priority_idx" ON "IcrabotTask"("priority");

-- CreateIndex
CREATE INDEX "IcrabotTask_status_idx" ON "IcrabotTask"("status");

-- CreateIndex
CREATE INDEX "IcrabotTask_dueDate_idx" ON "IcrabotTask"("dueDate");

-- CreateIndex
CREATE INDEX "rate_schedule_tenantId_interestType_validFrom_idx" ON "rate_schedule"("tenantId", "interestType", "validFrom");

-- CreateIndex
CREATE INDEX "rate_schedule_tenantId_interestType_validTo_idx" ON "rate_schedule"("tenantId", "interestType", "validTo");

-- CreateIndex
CREATE INDEX "interest_calculation_log_tenantId_caseId_idx" ON "interest_calculation_log"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "interest_calculation_log_tenantId_calculatedAt_idx" ON "interest_calculation_log"("tenantId", "calculatedAt");

-- CreateIndex
CREATE INDEX "interest_calculation_log_tenantId_flaggedForReview_idx" ON "interest_calculation_log"("tenantId", "flaggedForReview");

-- CreateIndex
CREATE INDEX "interest_segment_log_calculationLogId_idx" ON "interest_segment_log"("calculationLogId");

-- CreateIndex
CREATE INDEX "AddressTask_tenantId_idx" ON "AddressTask"("tenantId");

-- CreateIndex
CREATE INDEX "AddressTask_caseId_idx" ON "AddressTask"("caseId");

-- CreateIndex
CREATE INDEX "AddressTask_debtorId_idx" ON "AddressTask"("debtorId");

-- CreateIndex
CREATE INDEX "AddressTask_status_idx" ON "AddressTask"("status");

-- CreateIndex
CREATE INDEX "AddressTask_taskType_idx" ON "AddressTask"("taskType");

-- CreateIndex
CREATE INDEX "AddressTask_dueAt_idx" ON "AddressTask"("dueAt");

-- CreateIndex
CREATE INDEX "AddressTask_assignedToId_idx" ON "AddressTask"("assignedToId");

-- CreateIndex
CREATE INDEX "AddressTask_nextRunAt_idx" ON "AddressTask"("nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "AddressTask_caseId_debtorId_taskType_scopeKey_key" ON "AddressTask"("caseId", "debtorId", "taskType", "scopeKey");

-- CreateIndex
CREATE INDEX "AddressEvidenceRef_debtorAddressId_idx" ON "AddressEvidenceRef"("debtorAddressId");

-- CreateIndex
CREATE INDEX "AddressEvidenceRef_documentId_idx" ON "AddressEvidenceRef"("documentId");

-- CreateIndex
CREATE INDEX "AddressEvidenceRef_communicationId_idx" ON "AddressEvidenceRef"("communicationId");

-- CreateIndex
CREATE INDEX "AddressEvidenceRef_uyapQueryId_idx" ON "AddressEvidenceRef"("uyapQueryId");

-- CreateIndex
CREATE INDEX "AddressAuditLog_tenantId_idx" ON "AddressAuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "AddressAuditLog_caseId_idx" ON "AddressAuditLog"("caseId");

-- CreateIndex
CREATE INDEX "AddressAuditLog_debtorId_idx" ON "AddressAuditLog"("debtorId");

-- CreateIndex
CREATE INDEX "AddressAuditLog_addressTaskId_idx" ON "AddressAuditLog"("addressTaskId");

-- CreateIndex
CREATE INDEX "AddressAuditLog_action_idx" ON "AddressAuditLog"("action");

-- CreateIndex
CREATE INDEX "AddressAuditLog_showInNotes_idx" ON "AddressAuditLog"("showInNotes");

-- CreateIndex
CREATE INDEX "AddressAuditLog_createdAt_idx" ON "AddressAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AddressOutboxEvent_tenantId_idx" ON "AddressOutboxEvent"("tenantId");

-- CreateIndex
CREATE INDEX "AddressOutboxEvent_eventType_idx" ON "AddressOutboxEvent"("eventType");

-- CreateIndex
CREATE INDEX "AddressOutboxEvent_status_idx" ON "AddressOutboxEvent"("status");

-- CreateIndex
CREATE INDEX "AddressOutboxEvent_createdAt_idx" ON "AddressOutboxEvent"("createdAt");

-- CreateIndex
CREATE INDEX "DocumentArtifact_tenantId_idx" ON "DocumentArtifact"("tenantId");

-- CreateIndex
CREATE INDEX "DocumentArtifact_caseId_idx" ON "DocumentArtifact"("caseId");

-- CreateIndex
CREATE INDEX "DocumentArtifact_documentType_idx" ON "DocumentArtifact"("documentType");

-- CreateIndex
CREATE INDEX "DocumentArtifact_format_idx" ON "DocumentArtifact"("format");

-- CreateIndex
CREATE INDEX "DocumentArtifact_status_idx" ON "DocumentArtifact"("status");

-- CreateIndex
CREATE INDEX "DocumentArtifact_createdAt_idx" ON "DocumentArtifact"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentArtifact_caseId_documentType_format_templateVersion_key" ON "DocumentArtifact"("caseId", "documentType", "format", "templateVersion", "dataHash");

-- CreateIndex
CREATE INDEX "CpeDecisionLog_caseId_idx" ON "CpeDecisionLog"("caseId");

-- CreateIndex
CREATE INDEX "CpeDecisionLog_actionCode_idx" ON "CpeDecisionLog"("actionCode");

-- CreateIndex
CREATE INDEX "CpeDecisionLog_allowed_idx" ON "CpeDecisionLog"("allowed");

-- CreateIndex
CREATE INDEX "CpeDecisionLog_code_idx" ON "CpeDecisionLog"("code");

-- CreateIndex
CREATE INDEX "CpeDecisionLog_createdAt_idx" ON "CpeDecisionLog"("createdAt");

-- CreateIndex
CREATE INDEX "CpeDecisionLog_traceId_idx" ON "CpeDecisionLog"("traceId");

-- CreateIndex
CREATE UNIQUE INDEX "CpeExecutionRecord_executionId_key" ON "CpeExecutionRecord"("executionId");

-- CreateIndex
CREATE INDEX "CpeExecutionRecord_caseId_idx" ON "CpeExecutionRecord"("caseId");

-- CreateIndex
CREATE INDEX "CpeExecutionRecord_executionId_idx" ON "CpeExecutionRecord"("executionId");

-- CreateIndex
CREATE INDEX "CpeExecutionRecord_actionCode_idx" ON "CpeExecutionRecord"("actionCode");

-- CreateIndex
CREATE INDEX "CpeExecutionRecord_status_idx" ON "CpeExecutionRecord"("status");

-- CreateIndex
CREATE INDEX "CpeExecutionRecord_createdAt_idx" ON "CpeExecutionRecord"("createdAt");

-- CreateIndex
CREATE INDEX "ix_sim_runs_tenant_incident" ON "simulation_runs"("tenant_id", "incident_id");

-- CreateIndex
CREATE INDEX "ix_sim_runs_tenant_status" ON "simulation_runs"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "ix_sim_runs_incident_started" ON "simulation_runs"("incident_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "ix_sim_snap_tenant_incident_created" ON "simulation_snapshots"("tenant_id", "incident_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ix_sim_snap_tenant_run" ON "simulation_snapshots"("tenant_id", "run_id");

-- CreateIndex
CREATE INDEX "ix_sim_snap_tenant_isbaseline" ON "simulation_snapshots"("tenant_id", "is_baseline");

-- CreateIndex
CREATE INDEX "ix_sim_snap_expires" ON "simulation_snapshots"("expires_at");

-- CreateIndex
CREATE INDEX "ix_sim_snap_tenant_policy_archived" ON "simulation_snapshots"("tenant_id", "retention_policy", "archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "cleanup_failure_state_tenant_id_key" ON "cleanup_failure_state"("tenant_id");

-- CreateIndex
CREATE INDEX "ix_cleanup_failure_tenant" ON "cleanup_failure_state"("tenant_id");

-- CreateIndex
CREATE INDEX "ix_cleanup_failure_count" ON "cleanup_failure_state"("consecutive_failures");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_bundle_pointers_snapshot_id_key" ON "evidence_bundle_pointers"("snapshot_id");

-- CreateIndex
CREATE INDEX "ix_bundle_ptr_tenant" ON "evidence_bundle_pointers"("tenant_id");

-- CreateIndex
CREATE INDEX "ix_bundle_ptr_manifest_hash" ON "evidence_bundle_pointers"("manifest_sha256");

-- CreateIndex
CREATE INDEX "ix_bundle_ptr_state_created" ON "evidence_bundle_pointers"("state", "created_at");

-- CreateIndex
CREATE INDEX "ix_bundle_ptr_tenant_incident" ON "evidence_bundle_pointers"("tenant_id", "incident_id");

-- CreateIndex
CREATE INDEX "idx_evidence_bundles_tenant_incident" ON "evidence_bundles"("tenant_id", "incident_id");

-- CreateIndex
CREATE INDEX "idx_evidence_bundles_state" ON "evidence_bundles"("state");

-- CreateIndex
CREATE INDEX "idx_evidence_objects_tenant_created" ON "evidence_objects"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_evidence_objects_bundle" ON "evidence_objects"("bundle_id");

-- CreateIndex
CREATE INDEX "idx_bundle_seal_events_bundle_created" ON "bundle_seal_events"("bundle_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "bundle_seal_events_idempotency_uniq" ON "bundle_seal_events"("bundle_id", "run_id");

-- CreateIndex
CREATE UNIQUE INDEX "manifest_admin_audit_log_request_id_key" ON "manifest_admin_audit_log"("request_id");

-- CreateIndex
CREATE INDEX "idx_audit_log_created_at" ON "manifest_admin_audit_log"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_audit_log_actor" ON "manifest_admin_audit_log"("actor", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_audit_log_bundle" ON "manifest_admin_audit_log"("target_bundle_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_audit_log_event_type" ON "manifest_admin_audit_log"("event_type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_audit_log_resource" ON "manifest_admin_audit_log"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "idx_worker_state_lease" ON "manifest_worker_state"("owner_instance_id", "lease_expires_at");

-- CreateIndex
CREATE INDEX "promote_request_created_at_idx" ON "promote_request"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "promote_request_incident_run_unique" ON "promote_request"("incident_id", "run_id");

-- AddForeignKey
ALTER TABLE "CaseGroup" ADD CONSTRAINT "CaseGroup_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseGroup" ADD CONSTRAINT "CaseGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "GroupDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStageHistory" ADD CONSTRAINT "CaseStageHistory_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStageHistory" ADD CONSTRAINT "CaseStageHistory_asamaId_fkey" FOREIGN KEY ("asamaId") REFERENCES "LookupAsama"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTemplate" ADD CONSTRAINT "WorkflowTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionOffice" ADD CONSTRAINT "ExecutionOffice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalUser" ADD CONSTRAINT "ClientPortalUser_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientBankAccount" ADD CONSTRAINT "ClientBankAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPowerOfAttorney" ADD CONSTRAINT "ClientPowerOfAttorney_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoaLawyer" ADD CONSTRAINT "PoaLawyer_poaId_fkey" FOREIGN KEY ("poaId") REFERENCES "ClientPowerOfAttorney"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoaLawyer" ADD CONSTRAINT "PoaLawyer_lawyerId_fkey" FOREIGN KEY ("lawyerId") REFERENCES "Lawyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseClient" ADD CONSTRAINT "CaseClient_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseClient" ADD CONSTRAINT "CaseClient_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debtor" ADD CONSTRAINT "Debtor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstateHeir" ADD CONSTRAINT "EstateHeir_debtorId_fkey" FOREIGN KEY ("debtorId") REFERENCES "Debtor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtorAddress" ADD CONSTRAINT "DebtorAddress_debtorId_fkey" FOREIGN KEY ("debtorId") REFERENCES "Debtor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_formTypeId_fkey" FOREIGN KEY ("formTypeId") REFERENCES "FormType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_executionOfficeId_fkey" FOREIGN KEY ("executionOfficeId") REFERENCES "ExecutionOffice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_takipTuruId_fkey" FOREIGN KEY ("takipTuruId") REFERENCES "LookupTakipTuru"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_asamaId_fkey" FOREIGN KEY ("asamaId") REFERENCES "LookupAsama"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "LookupRisk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_borcluTipiId_fkey" FOREIGN KEY ("borcluTipiId") REFERENCES "LookupBorcluTipi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_durumEtiketiId_fkey" FOREIGN KEY ("durumEtiketiId") REFERENCES "LookupDurumEtiketi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_mahiyetTipiId_fkey" FOREIGN KEY ("mahiyetTipiId") REFERENCES "LookupMahiyetTipi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_sorumluPersonelId_fkey" FOREIGN KEY ("sorumluPersonelId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStatusHistory" ADD CONSTRAINT "CaseStatusHistory_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStatusHistory" ADD CONSTRAINT "CaseStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseDocument" ADD CONSTRAINT "CaseDocument_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseDebtor" ADD CONSTRAINT "CaseDebtor_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseDebtor" ADD CONSTRAINT "CaseDebtor_debtorId_fkey" FOREIGN KEY ("debtorId") REFERENCES "Debtor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseDebtor" ADD CONSTRAINT "CaseDebtor_selectedAddressId_fkey" FOREIGN KEY ("selectedAddressId") REFERENCES "DebtorAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceHistory" ADD CONSTRAINT "ServiceHistory_caseDebtorId_fkey" FOREIGN KEY ("caseDebtorId") REFERENCES "CaseDebtor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceHistory" ADD CONSTRAINT "ServiceHistory_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "DebtorAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Due" ADD CONSTRAINT "Due_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_debtorId_fkey" FOREIGN KEY ("debtorId") REFERENCES "Debtor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThirdParty" ADD CONSTRAINT "ThirdParty_caseDebtorId_fkey" FOREIGN KEY ("caseDebtorId") REFERENCES "CaseDebtor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalCase" ADD CONSTRAINT "ExternalCase_caseDebtorId_fkey" FOREIGN KEY ("caseDebtorId") REFERENCES "CaseDebtor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtorCommunication" ADD CONSTRAINT "DebtorCommunication_debtorId_fkey" FOREIGN KEY ("debtorId") REFERENCES "Debtor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Court" ADD CONSTRAINT "Court_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Office" ADD CONSTRAINT "Office_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeBankAccount" ADD CONSTRAINT "OfficeBankAccount_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lawyer" ADD CONSTRAINT "Lawyer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lawyer" ADD CONSTRAINT "Lawyer_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseLawyer" ADD CONSTRAINT "CaseLawyer_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseLawyer" ADD CONSTRAINT "CaseLawyer_lawyerId_fkey" FOREIGN KEY ("lawyerId") REFERENCES "Lawyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseLawyer" ADD CONSTRAINT "CaseLawyer_powerOfAttorneyId_fkey" FOREIGN KEY ("powerOfAttorneyId") REFERENCES "PowerOfAttorney"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LawyerTemplate" ADD CONSTRAINT "LawyerTemplate_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PowerOfAttorney" ADD CONSTRAINT "PowerOfAttorney_lawyerId_fkey" FOREIGN KEY ("lawyerId") REFERENCES "Lawyer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionAllocation" ADD CONSTRAINT "CollectionAllocation_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseLifecycle" ADD CONSTRAINT "CaseLifecycle_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnforcementAction" ADD CONSTRAINT "EnforcementAction_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskReport" ADD CONSTRAINT "RiskReport_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionLog" ADD CONSTRAINT "DecisionLog_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationQueue" ADD CONSTRAINT "NotificationQueue_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tebligat" ADD CONSTRAINT "Tebligat_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubType" ADD CONSTRAINT "FormSubType_formTypeId_fkey" FOREIGN KEY ("formTypeId") REFERENCES "FormType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStaff" ADD CONSTRAINT "CaseStaff_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStaff" ADD CONSTRAINT "CaseStaff_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientNotification" ADD CONSTRAINT "ClientNotification_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseRequestItem" ADD CONSTRAINT "ExpenseRequestItem_expenseRequestId_fkey" FOREIGN KEY ("expenseRequestId") REFERENCES "ExpenseRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpensePayment" ADD CONSTRAINT "ExpensePayment_expenseRequestId_fkey" FOREIGN KEY ("expenseRequestId") REFERENCES "ExpenseRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseAuditLog" ADD CONSTRAINT "ExpenseAuditLog_expenseRequestId_fkey" FOREIGN KEY ("expenseRequestId") REFERENCES "ExpenseRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicInstitution" ADD CONSTRAINT "PublicInstitution_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PublicInstitution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimItem" ADD CONSTRAINT "ClaimItem_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAllocation" ADD CONSTRAINT "LedgerAllocation_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAllocation" ADD CONSTRAINT "LedgerAllocation_claimItemId_fkey" FOREIGN KEY ("claimItemId") REFERENCES "ClaimItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecautionaryOrder" ADD CONSTRAINT "PrecautionaryOrder_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecautionaryCost" ADD CONSTRAINT "PrecautionaryCost_precautionaryOrderId_fkey" FOREIGN KEY ("precautionaryOrderId") REFERENCES "PrecautionaryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostPackageItem" ADD CONSTRAINT "CostPackageItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "CostPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseBalance" ADD CONSTRAINT "CaseBalance_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceLedger" ADD CONSTRAINT "BalanceLedger_caseBalanceId_fkey" FOREIGN KEY ("caseBalanceId") REFERENCES "CaseBalance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientInfoRequest" ADD CONSTRAINT "ClientInfoRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientInfoRequest" ADD CONSTRAINT "ClientInfoRequest_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientInfoRequest" ADD CONSTRAINT "ClientInfoRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientInfoRequest" ADD CONSTRAINT "ClientInfoRequest_debtorId_fkey" FOREIGN KEY ("debtorId") REFERENCES "Debtor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UyapQuery" ADD CONSTRAINT "UyapQuery_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UyapQuery" ADD CONSTRAINT "UyapQuery_caseDebtorId_fkey" FOREIGN KEY ("caseDebtorId") REFERENCES "CaseDebtor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UyapQuery" ADD CONSTRAINT "UyapQuery_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstitutionLetter" ADD CONSTRAINT "InstitutionLetter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstitutionLetter" ADD CONSTRAINT "InstitutionLetter_caseDebtorId_fkey" FOREIGN KEY ("caseDebtorId") REFERENCES "CaseDebtor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstitutionLetter" ADD CONSTRAINT "InstitutionLetter_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddressResearch" ADD CONSTRAINT "AddressResearch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddressResearch" ADD CONSTRAINT "AddressResearch_caseDebtorId_fkey" FOREIGN KEY ("caseDebtorId") REFERENCES "CaseDebtor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetQuery" ADD CONSTRAINT "AssetQuery_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetQuery" ADD CONSTRAINT "AssetQuery_caseDebtorId_fkey" FOREIGN KEY ("caseDebtorId") REFERENCES "CaseDebtor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetQuery" ADD CONSTRAINT "AssetQuery_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotTask" ADD CONSTRAINT "BotTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotTask" ADD CONSTRAINT "BotTask_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotTask" ADD CONSTRAINT "BotTask_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotEvidence" ADD CONSTRAINT "BotEvidence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotEvidence" ADD CONSTRAINT "BotEvidence_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "BotTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcrabotBundle" ADD CONSTRAINT "IcrabotBundle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcrabotJobRun" ADD CONSTRAINT "IcrabotJobRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcrabotJobRun" ADD CONSTRAINT "IcrabotJobRun_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcrabotJobRun" ADD CONSTRAINT "IcrabotJobRun_debtorId_fkey" FOREIGN KEY ("debtorId") REFERENCES "Debtor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcrabotJobStep" ADD CONSTRAINT "IcrabotJobStep_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "IcrabotJobRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcrabotEvidence" ADD CONSTRAINT "IcrabotEvidence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcrabotEvidence" ADD CONSTRAINT "IcrabotEvidence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcrabotLock" ADD CONSTRAINT "IcrabotLock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcrabotLock" ADD CONSTRAINT "IcrabotLock_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcrabotEvidenceExport" ADD CONSTRAINT "IcrabotEvidenceExport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcrabotEvidenceExport" ADD CONSTRAINT "IcrabotEvidenceExport_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemConfig" ADD CONSTRAINT "SystemConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelectorHealthLog" ADD CONSTRAINT "SelectorHealthLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseRunLock" ADD CONSTRAINT "CaseRunLock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseRunLock" ADD CONSTRAINT "CaseRunLock_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcrabotFact" ADD CONSTRAINT "IcrabotFact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcrabotFact" ADD CONSTRAINT "IcrabotFact_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcrabotRecipePause" ADD CONSTRAINT "IcrabotRecipePause_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcrabotUiMapRecording" ADD CONSTRAINT "IcrabotUiMapRecording_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcrabotAuditLog" ADD CONSTRAINT "IcrabotAuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcrabotAuditLog" ADD CONSTRAINT "IcrabotAuditLog_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcrabotApprovalRequest" ADD CONSTRAINT "IcrabotApprovalRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcrabotApprovalRequest" ADD CONSTRAINT "IcrabotApprovalRequest_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcrabotApprovalDecision" ADD CONSTRAINT "IcrabotApprovalDecision_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "IcrabotApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcrabotTimelineEntry" ADD CONSTRAINT "IcrabotTimelineEntry_runId_fkey" FOREIGN KEY ("runId") REFERENCES "IcrabotEngineRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcrabotOutboxAction" ADD CONSTRAINT "IcrabotOutboxAction_runId_fkey" FOREIGN KEY ("runId") REFERENCES "IcrabotEngineRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcrabotRule" ADD CONSTRAINT "IcrabotRule_packId_fkey" FOREIGN KEY ("packId") REFERENCES "IcrabotRulePack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcrabotRuleRevision" ADD CONSTRAINT "IcrabotRuleRevision_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "IcrabotRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_schedule" ADD CONSTRAINT "rate_schedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interest_calculation_log" ADD CONSTRAINT "interest_calculation_log_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interest_calculation_log" ADD CONSTRAINT "interest_calculation_log_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interest_segment_log" ADD CONSTRAINT "interest_segment_log_calculationLogId_fkey" FOREIGN KEY ("calculationLogId") REFERENCES "interest_calculation_log"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddressTask" ADD CONSTRAINT "AddressTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddressTask" ADD CONSTRAINT "AddressTask_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddressTask" ADD CONSTRAINT "AddressTask_debtorId_fkey" FOREIGN KEY ("debtorId") REFERENCES "Debtor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddressAuditLog" ADD CONSTRAINT "AddressAuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddressAuditLog" ADD CONSTRAINT "AddressAuditLog_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddressOutboxEvent" ADD CONSTRAINT "AddressOutboxEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentArtifact" ADD CONSTRAINT "DocumentArtifact_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CpeDecisionLog" ADD CONSTRAINT "CpeDecisionLog_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CpeExecutionRecord" ADD CONSTRAINT "CpeExecutionRecord_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_snapshots" ADD CONSTRAINT "simulation_snapshots_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "simulation_runs"("run_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_objects" ADD CONSTRAINT "evidence_objects_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "evidence_bundles"("bundle_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_seal_events" ADD CONSTRAINT "bundle_seal_events_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "evidence_bundles"("bundle_id") ON DELETE CASCADE ON UPDATE CASCADE;

