export { DomainEventIngestModule } from './domain-event-ingest.module';
export { DomainEventIngestService } from './domain-event-ingest.service';
export { AggregateVersionAllocator } from './aggregate-version-allocator';
export {
  DomainEvent,
  DomainEventHeader,
  EventActor,
  OccurredAtConfidence,
  ActorType,
  RetroactiveOverride,
} from './domain-event-ingest.types';
export {
  DomainEventValidationError,
  CausedByRequiredError,
  HumanActorRequiredError,
  ConfidenceMissingError,
  EvidenceMissingError,
  RetroactiveOverrideRequiredError,
  AggregateVersionGapError,
} from './domain-event-ingest.errors';
