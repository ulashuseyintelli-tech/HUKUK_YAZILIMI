import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CaseService } from "./case.service";
import { CreateCaseDto, UpdateCaseDto } from "./dto/case.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { OcrService } from "../ocr/ocr.service";

@Controller("cases")
@UseGuards(JwtAuthGuard)
export class CaseController {
  constructor(
    private caseService: CaseService,
    private ocrService: OcrService
  ) {}

  @Get()
  findAll(
    @CurrentUser("tenantId") tenantId: string,
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.caseService.findAll(tenantId, {
      status,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get("stats")
  getStats(@CurrentUser("tenantId") tenantId: string) {
    return this.caseService.getStats(tenantId);
  }

  @Get("next-file-number")
  async getNextFileNumber(@CurrentUser("tenantId") tenantId: string) {
    const fileNumber = await this.caseService.getNextFileNumber(tenantId);
    return { fileNumber };
  }

  @Get(":id")
  findOne(@CurrentUser("tenantId") tenantId: string, @Param("id") id: string) {
    return this.caseService.findOne(tenantId, id);
  }

  @Post()
  create(@CurrentUser("tenantId") tenantId: string, @Body() dto: CreateCaseDto) {
    return this.caseService.create(tenantId, dto);
  }

  @Put(":id")
  update(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() dto: UpdateCaseDto
  ) {
    return this.caseService.update(tenantId, id, dto);
  }

  @Delete(":id")
  delete(@CurrentUser("tenantId") tenantId: string, @Param("id") id: string) {
    return this.caseService.delete(tenantId, id);
  }

  @Patch(":id")
  patchFlags(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() dto: Partial<UpdateCaseDto>
  ) {
    return this.caseService.patchFlags(tenantId, id, dto);
  }

  /**
   * Metin içeriğinden takip türü öner
   * POST /cases/suggest-type
   */
  @Post("suggest-type")
  suggestCaseType(@Body() body: { text: string }) {
    const result = this.ocrService.classifyDocument(body.text);
    return {
      success: true,
      suggestion: {
        caseType: result.detectedType,
        subCategory: result.detectedSubCategory,
        confidence: result.confidence,
        matchedKeywords: result.matchedKeywords,
        suggestedFormCode: result.suggestedFormCode,
        explanation: result.explanation,
      },
    };
  }
}
