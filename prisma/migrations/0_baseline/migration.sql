-- Baseline da Central de Indicadores.
--
-- Em bancos já existentes, esta migration deve ser marcada como aplicada
-- pelo script APLICAR_CORRECAO_BANCO.ps1, sem executar o SQL abaixo.
-- Em bancos novos e vazios, `prisma migrate deploy` cria toda a estrutura
-- vigente da aplicação a partir deste arquivo.

CREATE TYPE "Role" AS ENUM ('VIEWER', 'ANALYST', 'ADMIN');
CREATE TYPE "ImportStatus" AS ENUM (
  'PENDING',
  'PARSING',
  'PROCESSING',
  'COMPLETED',
  'COMPLETED_WITH_ERRORS',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "image" TEXT,
  "role" "Role" NOT NULL DEFAULT 'VIEWER',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "authProvider" TEXT NOT NULL DEFAULT 'LOCAL',
  "externalUserId" TEXT,
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Account" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMP(3),
  "refreshTokenExpiresAt" TIMESTAMP(3),
  "scope" TEXT,
  "idToken" TEXT,
  "password" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Verification" (
  "id" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportJob" (
  "id" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "referenceYear" INTEGER,
  "referenceMonth" INTEGER,
  "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
  "totalFound" INTEGER NOT NULL DEFAULT 0,
  "totalInserted" INTEGER NOT NULL DEFAULT 0,
  "totalIgnored" INTEGER NOT NULL DEFAULT 0,
  "totalUpdated" INTEGER NOT NULL DEFAULT 0,
  "totalRejected" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "userId" TEXT NOT NULL,
  "errorMessage" TEXT,
  CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportBatch" (
  "id" TEXT NOT NULL,
  "importJobId" TEXT NOT NULL,
  "batchNumber" INTEGER NOT NULL,
  "totalReceived" INTEGER NOT NULL DEFAULT 0,
  "totalInserted" INTEGER NOT NULL DEFAULT 0,
  "totalIgnored" INTEGER NOT NULL DEFAULT 0,
  "totalUpdated" INTEGER NOT NULL DEFAULT 0,
  "totalRejected" INTEGER NOT NULL DEFAULT 0,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportError" (
  "id" TEXT NOT NULL,
  "importJobId" TEXT NOT NULL,
  "batchNumber" INTEGER,
  "rowNumber" INTEGER,
  "field" TEXT,
  "message" TEXT NOT NULL,
  "rawData" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImportError_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IndicatorResult" (
  "id" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "indicator" TEXT NOT NULL,
  "unit" TEXT NOT NULL DEFAULT '__ALL__',
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "value" DOUBLE PRECISION,
  "target" DOUBLE PRECISION,
  "adherence" DOUBLE PRECISION,
  "status" TEXT,
  "details" JSONB,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IndicatorResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IndicatorPublication" (
  "id" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "indicator" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "target" DOUBLE PRECISION,
  "result" DOUBLE PRECISION,
  "status" TEXT,
  "payload" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "publishedById" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IndicatorPublication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT,
  "previousData" JSONB,
  "newData" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppSetting" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "RdoRecord" (
  "id" TEXT NOT NULL,
  "businessKey" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "dataReferencia" TIMESTAMP(3) NOT NULL,
  "empresaNome" TEXT NOT NULL,
  "statusDescricao" TEXT NOT NULL,
  "relatorioId" TEXT,
  "grupo" TEXT,
  "disciplina" TEXT,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "raw" JSONB NOT NULL,
  "editedManually" BOOLEAN NOT NULL DEFAULT false,
  "editedBy" TEXT,
  "editedAt" TIMESTAMP(3),
  "firstImportId" TEXT NOT NULL,
  "lastImportId" TEXT NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RdoRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IdpRecord" (
  "id" TEXT NOT NULL,
  "businessKey" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "disciplina" TEXT NOT NULL,
  "custoLinhaBase" DOUBLE PRECISION NOT NULL,
  "custoReal" DOUBLE PRECISION NOT NULL,
  "raw" JSONB NOT NULL,
  "firstImportId" TEXT NOT NULL,
  "lastImportId" TEXT NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IdpRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RncRecord" (
  "id" TEXT NOT NULL,
  "businessKey" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "statusRnc" TEXT NOT NULL,
  "unidade" TEXT NOT NULL,
  "dataCriacao" TIMESTAMP(3) NOT NULL,
  "dataSolucao" TIMESTAMP(3),
  "tempoTratativa" DOUBLE PRECISION,
  "ofensor" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "raw" JSONB NOT NULL,
  "editedManually" BOOLEAN NOT NULL DEFAULT false,
  "editedBy" TEXT,
  "editedAt" TIMESTAMP(3),
  "firstImportId" TEXT NOT NULL,
  "lastImportId" TEXT NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RncRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FiveSRecord" (
  "id" TEXT NOT NULL,
  "businessKey" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "aderencia" DOUBLE PRECISION NOT NULL,
  "areasCount" INTEGER NOT NULL,
  "raw" JSONB NOT NULL,
  "firstImportId" TEXT NOT NULL,
  "lastImportId" TEXT NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FiveSRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccidentMonthlyRecord" (
  "id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "rate" DOUBLE PRECISION NOT NULL,
  "caf" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccidentMonthlyRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccidentUnitRecord" (
  "id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "unit" TEXT NOT NULL,
  "unitKey" TEXT NOT NULL,
  "saf" INTEGER NOT NULL,
  "caf" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccidentUnitRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScorecardSnapshot" (
  "id" TEXT NOT NULL,
  "businessKey" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "raw" JSONB NOT NULL,
  "firstImportId" TEXT NOT NULL,
  "lastImportId" TEXT NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScorecardSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_email_idx" ON "User"("email");
CREATE INDEX "User_externalUserId_idx" ON "User"("externalUserId");

CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

CREATE INDEX "ImportJob_module_referenceYear_referenceMonth_idx"
  ON "ImportJob"("module", "referenceYear", "referenceMonth");
CREATE INDEX "ImportJob_userId_idx" ON "ImportJob"("userId");
CREATE INDEX "ImportJob_status_idx" ON "ImportJob"("status");

CREATE UNIQUE INDEX "ImportBatch_importJobId_batchNumber_key"
  ON "ImportBatch"("importJobId", "batchNumber");
CREATE INDEX "ImportError_importJobId_idx" ON "ImportError"("importJobId");

CREATE UNIQUE INDEX "IndicatorResult_module_indicator_unit_year_month_key"
  ON "IndicatorResult"("module", "indicator", "unit", "year", "month");
CREATE INDEX "IndicatorResult_module_year_month_idx"
  ON "IndicatorResult"("module", "year", "month");

CREATE UNIQUE INDEX "IndicatorPublication_module_indicator_version_key"
  ON "IndicatorPublication"("module", "indicator", "version");
CREATE INDEX "IndicatorPublication_module_indicator_active_publishedAt_idx"
  ON "IndicatorPublication"("module", "indicator", "active", "publishedAt");
CREATE INDEX "IndicatorPublication_publishedById_idx"
  ON "IndicatorPublication"("publishedById");

CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

CREATE UNIQUE INDEX "RdoRecord_businessKey_key" ON "RdoRecord"("businessKey");
CREATE INDEX "RdoRecord_year_month_idx" ON "RdoRecord"("year", "month");
CREATE INDEX "RdoRecord_empresaNome_idx" ON "RdoRecord"("empresaNome");
CREATE INDEX "RdoRecord_statusDescricao_idx" ON "RdoRecord"("statusDescricao");

CREATE UNIQUE INDEX "IdpRecord_businessKey_key" ON "IdpRecord"("businessKey");
CREATE INDEX "IdpRecord_year_month_idx" ON "IdpRecord"("year", "month");
CREATE INDEX "IdpRecord_unit_idx" ON "IdpRecord"("unit");

CREATE UNIQUE INDEX "RncRecord_businessKey_key" ON "RncRecord"("businessKey");
CREATE INDEX "RncRecord_year_month_idx" ON "RncRecord"("year", "month");
CREATE INDEX "RncRecord_unidade_idx" ON "RncRecord"("unidade");

CREATE UNIQUE INDEX "FiveSRecord_businessKey_key" ON "FiveSRecord"("businessKey");
CREATE INDEX "FiveSRecord_year_month_idx" ON "FiveSRecord"("year", "month");
CREATE INDEX "FiveSRecord_unit_idx" ON "FiveSRecord"("unit");

CREATE UNIQUE INDEX "AccidentMonthlyRecord_year_month_key"
  ON "AccidentMonthlyRecord"("year", "month");
CREATE INDEX "AccidentMonthlyRecord_year_month_idx"
  ON "AccidentMonthlyRecord"("year", "month");

CREATE UNIQUE INDEX "AccidentUnitRecord_year_month_unitKey_key"
  ON "AccidentUnitRecord"("year", "month", "unitKey");
CREATE INDEX "AccidentUnitRecord_year_month_idx"
  ON "AccidentUnitRecord"("year", "month");
CREATE INDEX "AccidentUnitRecord_unit_idx" ON "AccidentUnitRecord"("unit");

CREATE UNIQUE INDEX "ScorecardSnapshot_businessKey_key"
  ON "ScorecardSnapshot"("businessKey");
CREATE INDEX "ScorecardSnapshot_year_month_idx"
  ON "ScorecardSnapshot"("year", "month");

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Account"
  ADD CONSTRAINT "Account_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImportJob"
  ADD CONSTRAINT "ImportJob_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ImportBatch"
  ADD CONSTRAINT "ImportBatch_importJobId_fkey"
  FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImportError"
  ADD CONSTRAINT "ImportError_importJobId_fkey"
  FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IndicatorPublication"
  ADD CONSTRAINT "IndicatorPublication_publishedById_fkey"
  FOREIGN KEY ("publishedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
