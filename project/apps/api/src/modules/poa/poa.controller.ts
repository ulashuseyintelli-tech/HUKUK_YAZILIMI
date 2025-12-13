import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PoaService, CreatePoaDto, UpdatePoaDto } from "./poa.service";
import * as fs from "fs";
import * as path from "path";

@Controller("poa")
@UseGuards(JwtAuthGuard)
export class PoaController {
  constructor(private readonly poaService: PoaService) {}

  // ==================== SPESİFİK ROUTE'LAR ÖNCE ====================
  // NestJS'de parametreli route'lar (:id) spesifik route'lardan sonra gelmeli

  /**
   * Müvekkil + Avukat için geçerli vekalet kontrolü
   * GET /api/poa/check/valid?clientId=xxx&lawyerId=yyy
   */
  @Get("check/valid")
  async checkValidPoa(
    @Query("clientId") clientId: string,
    @Query("lawyerId") lawyerId: string,
    @Request() req: any
  ) {
    return this.poaService.checkValidPoa(clientId, lawyerId, req.user.tenantId);
  }

  /**
   * Süresi dolmak üzere olan vekaletler
   * GET /api/poa/expiring/list?days=30
   */
  @Get("expiring/list")
  async getExpiringPoas(
    @Query("days") days: string = "30",
    @Request() req: any
  ) {
    return this.poaService.getExpiringPoas(req.user.tenantId, parseInt(days));
  }

  /**
   * Müvekkilin vekaletlerini getir
   * GET /api/poa/client/:clientId
   */
  @Get("client/:clientId")
  async findByClient(@Param("clientId") clientId: string, @Request() req: any) {
    return this.poaService.findByClient(clientId, req.user.tenantId);
  }

  // ==================== PARAMETRELİ ROUTE'LAR ====================

  /**
   * Tek bir vekalet getir
   * GET /api/poa/:id
   */
  @Get(":id")
  async findOne(@Param("id") id: string, @Request() req: any) {
    return this.poaService.findOne(id, req.user.tenantId);
  }

  /**
   * Yeni vekalet oluştur
   * POST /api/poa
   */
  @Post()
  async create(@Body() dto: CreatePoaDto, @Request() req: any) {
    return this.poaService.create(dto, req.user.tenantId);
  }

  /**
   * Vekalet güncelle
   * PUT /api/poa/:id
   */
  @Put(":id")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdatePoaDto,
    @Request() req: any
  ) {
    return this.poaService.update(id, dto, req.user.tenantId);
  }

  /**
   * Vekalet sil
   * DELETE /api/poa/:id
   */
  @Delete(":id")
  async delete(@Param("id") id: string, @Request() req: any) {
    return this.poaService.delete(id, req.user.tenantId);
  }

  /**
   * Vekalete avukat ekle
   * POST /api/poa/:id/lawyers
   */
  @Post(":id/lawyers")
  async addLawyers(
    @Param("id") id: string,
    @Body() body: { lawyerIds: string[] },
    @Request() req: any
  ) {
    return this.poaService.addLawyers(id, body.lawyerIds, req.user.tenantId);
  }

  /**
   * Vekaletten avukat çıkar
   * DELETE /api/poa/:id/lawyers/:lawyerId
   */
  @Delete(":id/lawyers/:lawyerId")
  async removeLawyer(
    @Param("id") id: string,
    @Param("lawyerId") lawyerId: string,
    @Request() req: any
  ) {
    return this.poaService.removeLawyer(id, lawyerId, req.user.tenantId);
  }

  /**
   * Vekalete dosya yükle
   * POST /api/poa/:id/upload
   */
  @Post(":id/upload")
  @UseInterceptors(FileInterceptor("file"))
  async uploadFile(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any
  ) {
    if (!file) {
      throw new BadRequestException("Dosya yüklenmedi");
    }

    // Dosya türü kontrolü
    const allowedMimes = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException("Sadece PDF ve görüntü dosyaları (JPG, PNG) yüklenebilir");
    }

    // Dosya boyutu kontrolü (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException("Dosya boyutu 10MB'dan büyük olamaz");
    }

    return this.poaService.uploadFile(id, file, req.user.tenantId);
  }

  /**
   * Vekalet dosyasını indir
   * GET /api/poa/:id/download
   */
  @Get(":id/download")
  async downloadFile(
    @Param("id") id: string,
    @Request() req: any,
    @Res() res: Response
  ) {
    const result = await this.poaService.getFile(id, req.user.tenantId);
    
    res.setHeader("Content-Type", result.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  }

  /**
   * Vekalet dosyasını sil
   * DELETE /api/poa/:id/file
   */
  @Delete(":id/file")
  async deleteFile(
    @Param("id") id: string,
    @Request() req: any
  ) {
    return this.poaService.deleteFile(id, req.user.tenantId);
  }
}
