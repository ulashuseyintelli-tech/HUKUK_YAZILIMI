import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { OcrService } from "./ocr.service";
import { OcrController } from "./ocr.controller";
import { ClaimEngineModule } from "../claim-engine/claim-engine.module";

@Module({
  imports: [ConfigModule, ClaimEngineModule],
  controllers: [OcrController],
  providers: [OcrService],
  exports: [OcrService],
})
export class OcrModule {}
