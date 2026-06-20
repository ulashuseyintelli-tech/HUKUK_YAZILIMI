import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { OcrService } from "./ocr.service";
import { OcrFeedbackService } from "./ocr-feedback.service";
import { OcrController } from "./ocr.controller";
import { ClaimEngineModule } from "../claim-engine/claim-engine.module";

// AuditService @Global (AuditModule) üzerinden gelir → ayrıca import gerekmez.
@Module({
  imports: [ConfigModule, ClaimEngineModule],
  controllers: [OcrController],
  providers: [OcrService, OcrFeedbackService],
  exports: [OcrService],
})
export class OcrModule {}
