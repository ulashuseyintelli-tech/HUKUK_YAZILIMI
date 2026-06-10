/**
 * DomainEventIngestModule — Phase 2 Sprint 1
 *
 * Provides DomainEventIngestService for same-tx event append.
 * No external dependencies beyond Prisma (injected via tx parameter).
 */
import { Module } from '@nestjs/common';
import { DomainEventIngestService } from './domain-event-ingest.service';
import { AggregateVersionAllocator } from './aggregate-version-allocator';

@Module({
  providers: [DomainEventIngestService, AggregateVersionAllocator],
  exports: [DomainEventIngestService, AggregateVersionAllocator],
})
export class DomainEventIngestModule {}
