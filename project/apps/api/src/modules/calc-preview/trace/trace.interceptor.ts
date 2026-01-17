/**
 * Phase 5.1 - Trace Interceptor
 * 
 * Response'a X-Trace-Id header ekler.
 * Gerektiğinde trace'i storage'a yazar.
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 5.1
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Response, Request } from 'express';
import { TraceContext } from './trace-context';
import { TraceCollectorService } from './trace-collector.service';
import { DEFAULT_SAMPLING_POLICY } from './trace.types';

// ============================================================================
// TRACE INTERCEPTOR
// ============================================================================

@Injectable()
export class TraceInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TraceInterceptor.name);

  constructor(
    private readonly traceCollector: TraceCollectorService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();
    
    // Create trace context
    const traceContext = this.traceCollector.createContext();
    
    // Initialize with request info
    traceContext.init({
      requestId: request.headers['x-request-id'] as string,
      tenantId: (request.headers['x-tenant-id'] as string) || 'default',
      clientId: request.headers['x-client-id'] as string,
      endpoint: request.path,
    });
    
    // Check force trace header
    const forceTrace = request.headers[DEFAULT_SAMPLING_POLICY.forceHeader.toLowerCase()] === 'true';
    
    // Attach trace context to request for use in service
    (request as RequestWithTrace).traceContext = traceContext;
    
    // Set X-Trace-Id header immediately
    response.setHeader('X-Trace-Id', traceContext.getTraceId());
    
    return next.handle().pipe(
      tap({
        next: () => {
          // Finalize and store trace
          this.traceCollector.finalizeAndStore(traceContext, forceTrace);
        },
        error: (error) => {
          // Record error and store trace (force store on error)
          traceContext.addWarning({
            code: 'UNHANDLED_ERROR',
            severity: 'ERROR',
            message: error?.message || 'Unknown error',
          });
          traceContext.setResult({
            status: 'UNAVAILABLE',
          });
          this.traceCollector.finalizeAndStore(traceContext, true);
        },
      }),
    );
  }
}

// ============================================================================
// REQUEST TYPE EXTENSION
// ============================================================================

export interface RequestWithTrace extends Request {
  traceContext?: TraceContext;
}
