-- Phase 9B: Truth Layer Migration
-- Truth Layer Contract v1.0.0 - 2026-01-18
-- NO FALLBACK: DB down = system down

-- CreateEnum
CREATE TYPE "SimulationRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SimulationSnapshotKind" AS ENUM ('BASELINE', 'CURRENT', 'OTHER');

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
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "simulation_snapshots_pkey" PRIMARY KEY ("snapshot_id")
);

-- CreateIndex: simulation_runs
CREATE INDEX "ix_sim_runs_tenant_incident" ON "simulation_runs"("tenant_id", "incident_id");
CREATE INDEX "ix_sim_runs_tenant_status" ON "simulation_runs"("tenant_id", "status");
CREATE INDEX "ix_sim_runs_incident_started" ON "simulation_runs"("incident_id", "started_at" DESC);

-- CreateIndex: simulation_snapshots
CREATE INDEX "ix_sim_snap_tenant_incident_created" ON "simulation_snapshots"("tenant_id", "incident_id", "created_at" DESC);
CREATE INDEX "ix_sim_snap_tenant_run" ON "simulation_snapshots"("tenant_id", "run_id");
CREATE INDEX "ix_sim_snap_tenant_isbaseline" ON "simulation_snapshots"("tenant_id", "is_baseline");
CREATE INDEX "ix_sim_snap_expires" ON "simulation_snapshots"("expires_at");

-- CRITICAL: Single baseline per (tenant, incident) - Partial Unique Index
-- This is the heart of Phase 9B Truth Layer Contract
CREATE UNIQUE INDEX "ux_sim_snap_one_baseline_per_incident" 
    ON "simulation_snapshots"("tenant_id", "incident_id") 
    WHERE "is_baseline" = true;

-- AddForeignKey: snapshot -> run (optional, SetNull on delete)
ALTER TABLE "simulation_snapshots" 
    ADD CONSTRAINT "simulation_snapshots_run_id_fkey" 
    FOREIGN KEY ("run_id") 
    REFERENCES "simulation_runs"("run_id") 
    ON DELETE SET NULL 
    ON UPDATE CASCADE;
