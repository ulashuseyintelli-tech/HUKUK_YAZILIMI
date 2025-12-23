import { Controller, Get, Param, Query } from '@nestjs/common';
import { PublicInstitutionService } from './public-institution.service';
import { PublicInstitutionCategory } from '@prisma/client';

@Controller('public-institutions')
export class PublicInstitutionController {
  constructor(private readonly service: PublicInstitutionService) {}

  // GET /api/public-institutions/search?q=maliye
  @Get('search')
  async search(@Query('q') query: string, @Query('limit') limit?: string) {
    return this.service.search(query, limit ? parseInt(limit) : 20);
  }

  // GET /api/public-institutions/categories
  @Get('categories')
  getCategories() {
    return this.service.getCategories();
  }

  // GET /api/public-institutions/stats
  @Get('stats')
  async getStats() {
    return this.service.getStats();
  }

  // GET /api/public-institutions/by-category/BAKANLIK
  @Get('by-category/:category')
  async findByCategory(
    @Param('category') category: PublicInstitutionCategory,
    @Query('limit') limit?: string,
  ) {
    return this.service.findByCategory(category, limit ? parseInt(limit) : 100);
  }

  // GET /api/public-institutions/by-city/İstanbul
  @Get('by-city/:city')
  async findByCity(
    @Param('city') city: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findByCity(city, limit ? parseInt(limit) : 100);
  }

  // GET /api/public-institutions/detsis/123456
  @Get('detsis/:detsisNo')
  async findByDetsisNo(@Param('detsisNo') detsisNo: string) {
    return this.service.findByDetsisNo(detsisNo);
  }

  // GET /api/public-institutions/:id
  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.service.findById(id);
  }
}
