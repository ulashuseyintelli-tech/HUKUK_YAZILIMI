import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { FormCategory } from "@prisma/client";

@Injectable()
export class FormTypeService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.formType.findMany({
      where: { isActive: true },
      include: {
        subForms: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { sortOrder: "asc" },
    });
  }

  async findByCode(code: string) {
    return this.prisma.formType.findUnique({
      where: { code },
      include: {
        subForms: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
  }

  async findByCategory(category: FormCategory) {
    return this.prisma.formType.findMany({
      where: { category, isActive: true },
      include: {
        subForms: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { sortOrder: "asc" },
    });
  }

  async getCategories() {
    const forms = await this.prisma.formType.findMany({
      where: { isActive: true },
      select: { category: true },
      distinct: ["category"],
    });
    return forms.map((f) => f.category);
  }

  async getFrequentForms(limit = 3) {
    // En sık kullanılan formları döndür (şimdilik sabit, ileride kullanım istatistiklerine göre)
    return this.prisma.formType.findMany({
      where: {
        isActive: true,
        code: { in: ["FORM_7", "FORM_10", "FORM_13"] },
      },
      include: {
        subForms: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { sortOrder: "asc" },
      take: limit,
    });
  }
}
