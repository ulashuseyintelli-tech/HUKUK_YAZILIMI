-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('PROFESSIONAL', 'CORPORATE', 'PUBLIC', 'CITIZEN');

-- CreateEnum
CREATE TYPE "PoaStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'PENDING');

-- CreateEnum
CREATE TYPE "PoaScopeType" AS ENUM ('GENEL', 'ICRA_TAKIP', 'BU_DOSYA', 'OZEL');

-- CreateEnum
CREATE TYPE "LawyerRole" AS ENUM ('OWNER', 'PARTNER', 'EMPLOYEE', 'INTERN');

-- CreateEnum
CREATE TYPE "CaseLawyerRole" AS ENUM ('RESPONSIBLE', 'ASSIGNED', 'ASSISTANT', 'INTERN');

-- CreateEnum
CREATE TYPE "PowerOfAttorneyType" AS ENUM ('GENEL', 'OZEL', 'ICRA', 'DAVA');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('TAKIP_TALEBI', 'ODEME_EMRI', 'HACIZ_MUZEKKERESI', 'SATIS_ILANI', 'REDDIYAT', 'MTS_DONUS', 'ITIRAZ', 'DIGER');

-- CreateEnum
CREATE TYPE "UyapRequestStatus" AS ENUM ('PENDING', 'SENT', 'SUCCESS', 'FAILED', 'RETRY');

-- CreateEnum
CREATE TYPE "LegalCaseStatus" AS ENUM ('DERDEST', 'ISLEMDE', 'DERKENAR', 'HITAM', 'INFAZ', 'MUVEKKILE_IADE', 'ACIZ', 'BATAK', 'MAHSUP', 'TEMLIK');

-- CreateEnum
CREATE TYPE "ExecutionPath" AS ENUM ('HACIZ', 'IFLAS', 'REHIN', 'IPOTEK', 'TAHLIYE');

-- CreateEnum
CREATE TYPE "CaseSubCategory" AS ENUM ('GENEL', 'NAFAKA', 'DOVIZ', 'KIRA', 'CEZA');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('TRY', 'USD', 'EUR', 'GBP', 'CHF');

-- CreateEnum
CREATE TYPE "InterestType" AS ENUM ('YASAL', 'SABIT', 'AVANS', 'TEMERRUT', 'YOKSUN');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('ARTICLE_4_REQUEST', 'PAYMENT_ORDER', 'SEIZURE_REQUEST', 'SEIZURE_NOTICE', 'BANK_NOTICE', 'VEHICLE_NOTICE', 'PROPERTY_NOTICE', 'SALARY_NOTICE', 'SALE_REQUEST', 'OBJECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "DetectedCaseType" AS ENUM ('ILAMLI', 'ILAMSIZ', 'KAMBIYO', 'KIRA', 'IPOTEK', 'REHIN', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "StaffType" AS ENUM ('STAJYER_AVUKAT', 'OFIS_KATIBI', 'ADLI_KATIP', 'SEKRETER', 'MUHASEBE', 'ARSIV', 'DIGER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ClientType" ADD VALUE 'PERSON';
ALTER TYPE "ClientType" ADD VALUE 'PUBLIC';

-- AlterEnum
ALTER TYPE "DecisionType" ADD VALUE 'STATUS_CHANGE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'POA_EXPIRING';
ALTER TYPE "NotificationType" ADD VALUE 'POA_EXPIRED';

-- DropIndex
DROP INDEX "Client_tenantId_identityNo_idx";

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "allowUyapActions" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "article4RequestDate" TIMESTAMP(3),
ADD COLUMN     "asamaId" TEXT,
ADD COLUMN     "automationConfig" JSONB,
ADD COLUMN     "borcluTipiId" TEXT,
ADD COLUMN     "caseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "caseStatus" "LegalCaseStatus" NOT NULL DEFAULT 'DERDEST',
ADD COLUMN     "confidenceScore" INTEGER,
ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'TRY',
ADD COLUMN     "dahiliNot" TEXT,
ADD COLUMN     "daysLeft" INTEGER,
ADD COLUMN     "detectionKeywords" JSONB,
ADD COLUMN     "durumEtiketiId" TEXT,
ADD COLUMN     "exchangeDate" TIMESTAMP(3),
ADD COLUMN     "exchangeRateType" TEXT,
ADD COLUMN     "executionOfficeId" TEXT,
ADD COLUMN     "executionPath" "ExecutionPath" NOT NULL DEFAULT 'HACIZ',
ADD COLUMN     "hasArticle4Request" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasUyapWarning" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "interestDescription" TEXT,
ADD COLUMN     "interestStartDate" TIMESTAMP(3),
ADD COLUMN     "interestType" "InterestType" NOT NULL DEFAULT 'YASAL',
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isAutoDetected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isAutomationEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isMtsCase" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mahiyetKodu" TEXT,
ADD COLUMN     "mahiyetTipiId" TEXT,
ADD COLUMN     "monthlyNafakaAmount" DECIMAL(15,2),
ADD COLUMN     "mtsReferenceNo" TEXT,
ADD COLUMN     "mtsReturnDate" TIMESTAMP(3),
ADD COLUMN     "muvekkilNotu" TEXT,
ADD COLUMN     "nafakaStartDate" TIMESTAMP(3),
ADD COLUMN     "nextAutoAction" TEXT,
ADD COLUMN     "ocrText" TEXT,
ADD COLUMN     "preDetectedCaseType" TEXT,
ADD COLUMN     "preDetectedSubCategory" TEXT,
ADD COLUMN     "riskId" TEXT,
ADD COLUMN     "showToClient" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sonDegerlendirmeTarihi" TIMESTAMP(3),
ADD COLUMN     "sorumluPersonelId" TEXT,
ADD COLUMN     "sourceDocumentId" TEXT,
ADD COLUMN     "subCategory" "CaseSubCategory" NOT NULL DEFAULT 'GENEL',
ADD COLUMN     "takipTuruId" TEXT,
ADD COLUMN     "uyapBirimKodu" TEXT,
ADD COLUMN     "uyapDosyaId" TEXT;

-- AlterTable
ALTER TABLE "CaseLawyer" ADD COLUMN     "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "assignedById" TEXT,
ADD COLUMN     "hasSignatureAuthority" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isResponsible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "powerOfAttorneyId" TEXT,
ADD COLUMN     "receiveNotifications" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "role" "CaseLawyerRole" NOT NULL DEFAULT 'ASSIGNED',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "visibleToClient" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "canCollect" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "canRelease" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canSettle" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canWaive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "companyType" TEXT,
ADD COLUMN     "detsisNo" TEXT,
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "foundingDate" TIMESTAMP(3),
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "greetingChannel" TEXT,
ADD COLUMN     "hasPortalAccess" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isForeigner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "mersisNo" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "poaStartDate" TIMESTAMP(3),
ADD COLUMN     "portalUserId" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "sendAnniversaryGreeting" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sendBirthdayGreeting" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sendHolidayGreeting" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tckn" TEXT,
ADD COLUMN     "ticaretSicilNo" TEXT,
ADD COLUMN     "useMernisAddress" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "useUyapAddress" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vkn" TEXT,
ALTER COLUMN "name" DROP NOT NULL,
ALTER COLUMN "address" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "Lawyer" ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "barCity" TEXT,
ADD COLUMN     "canAppearInUyap" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canBeResponsible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "canSign" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "eSignatureSerial" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "iban" TEXT,
ADD COLUMN     "isDefaultForNewCases" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isEmployee" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isInHouseCounsel" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lawyerType" TEXT,
ADD COLUMN     "officeId" TEXT,
ADD COLUMN     "role" "LawyerRole" NOT NULL DEFAULT 'EMPLOYEE',
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tbbNo" TEXT,
ADD COLUMN     "tckn" TEXT,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "uyapToken" TEXT,
ADD COLUMN     "uyapUsername" TEXT,
ADD COLUMN     "vergiDairesi" TEXT,
ADD COLUMN     "vergiNo" TEXT;

-- AlterTable
ALTER TABLE "NotificationQueue" ADD COLUMN     "tenantId" TEXT,
ALTER COLUMN "caseId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "accountType" "AccountType" NOT NULL DEFAULT 'PROFESSIONAL';

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
    "address" TEXT,
    "phone" TEXT,
    "fax" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutionOffice_pkey" PRIMARY KEY ("id")
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
    "items" JSONB NOT NULL,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "sentVia" TEXT,
    "notificationId" TEXT,
    "respondedAt" TIMESTAMP(3),
    "responseNotes" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidAmount" DECIMAL(15,2),
    "createdById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "ExecutionOffice_tenantId_idx" ON "ExecutionOffice"("tenantId");

-- CreateIndex
CREATE INDEX "ExecutionOffice_city_idx" ON "ExecutionOffice"("city");

-- CreateIndex
CREATE INDEX "ExecutionOffice_uyapCode_idx" ON "ExecutionOffice"("uyapCode");

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
CREATE UNIQUE INDEX "Office_tenantId_key" ON "Office"("tenantId");

-- CreateIndex
CREATE INDEX "Office_tenantId_idx" ON "Office"("tenantId");

-- CreateIndex
CREATE INDEX "OfficeBankAccount_officeId_idx" ON "OfficeBankAccount"("officeId");

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
CREATE INDEX "ExpenseRequest_createdAt_idx" ON "ExpenseRequest"("createdAt");

-- CreateIndex
CREATE INDEX "EmailTemplate_tenantId_idx" ON "EmailTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "EmailTemplate_category_idx" ON "EmailTemplate"("category");

-- CreateIndex
CREATE INDEX "EmailTemplate_isActive_idx" ON "EmailTemplate"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_tenantId_code_key" ON "EmailTemplate"("tenantId", "code");

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
CREATE INDEX "Case_tenantId_caseStatus_idx" ON "Case"("tenantId", "caseStatus");

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
CREATE INDEX "CaseLawyer_caseId_idx" ON "CaseLawyer"("caseId");

-- CreateIndex
CREATE INDEX "CaseLawyer_lawyerId_idx" ON "CaseLawyer"("lawyerId");

-- CreateIndex
CREATE INDEX "CaseLawyer_isResponsible_idx" ON "CaseLawyer"("isResponsible");

-- CreateIndex
CREATE INDEX "Client_tenantId_tckn_idx" ON "Client"("tenantId", "tckn");

-- CreateIndex
CREATE INDEX "Client_tenantId_vkn_idx" ON "Client"("tenantId", "vkn");

-- CreateIndex
CREATE INDEX "Client_type_idx" ON "Client"("type");

-- CreateIndex
CREATE INDEX "Client_isActive_idx" ON "Client"("isActive");

-- CreateIndex
CREATE INDEX "Lawyer_officeId_idx" ON "Lawyer"("officeId");

-- CreateIndex
CREATE INDEX "Lawyer_isActive_idx" ON "Lawyer"("isActive");

-- CreateIndex
CREATE INDEX "NotificationQueue_tenantId_idx" ON "NotificationQueue"("tenantId");

-- CreateIndex
CREATE INDEX "Tenant_accountType_idx" ON "Tenant"("accountType");

-- AddForeignKey
ALTER TABLE "CaseGroup" ADD CONSTRAINT "CaseGroup_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseGroup" ADD CONSTRAINT "CaseGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "GroupDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStageHistory" ADD CONSTRAINT "CaseStageHistory_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStageHistory" ADD CONSTRAINT "CaseStageHistory_asamaId_fkey" FOREIGN KEY ("asamaId") REFERENCES "LookupAsama"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionOffice" ADD CONSTRAINT "ExecutionOffice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "CaseStatusHistory" ADD CONSTRAINT "CaseStatusHistory_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStatusHistory" ADD CONSTRAINT "CaseStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseDocument" ADD CONSTRAINT "CaseDocument_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Office" ADD CONSTRAINT "Office_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeBankAccount" ADD CONSTRAINT "OfficeBankAccount_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lawyer" ADD CONSTRAINT "Lawyer_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseLawyer" ADD CONSTRAINT "CaseLawyer_powerOfAttorneyId_fkey" FOREIGN KEY ("powerOfAttorneyId") REFERENCES "PowerOfAttorney"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LawyerTemplate" ADD CONSTRAINT "LawyerTemplate_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PowerOfAttorney" ADD CONSTRAINT "PowerOfAttorney_lawyerId_fkey" FOREIGN KEY ("lawyerId") REFERENCES "Lawyer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStaff" ADD CONSTRAINT "CaseStaff_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientNotification" ADD CONSTRAINT "ClientNotification_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
