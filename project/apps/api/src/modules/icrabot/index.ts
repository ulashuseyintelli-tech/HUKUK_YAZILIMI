/**
 * ICRABOT MODULE
 * 
 * UYAP entegrasyonlu otomasyon sistemi.
 * 
 * Katmanlar:
 * - Katman 0: Case Digital Twin (mevcut Case modeli)
 * - Katman 2: Task Orchestrator (TaskOrchestratorService)
 * - Katman 3: Rules Engine (RecipeService)
 * - Katman 5: Scheduler (mevcut SchedulerService ile entegre)
 * - Katman 6: Audit/Evidence (EvidenceService)
 */

export * from './icrabot.module';
export * from './icrabot.service';
export * from './recipe.service';
export * from './task-orchestrator.service';
export * from './evidence.service';
export * from './types/recipe.types';
