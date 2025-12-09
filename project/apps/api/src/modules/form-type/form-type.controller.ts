import { Controller, Get, Param, Query } from "@nestjs/common";
import { FormTypeService } from "./form-type.service";
import { FormCategory } from "@prisma/client";

@Controller("form-types")
export class FormTypeController {
  constructor(private formTypeService: FormTypeService) {}

  @Get()
  async findAll(@Query("category") category?: FormCategory) {
    if (category) {
      return this.formTypeService.findByCategory(category);
    }
    return this.formTypeService.findAll();
  }

  @Get("categories")
  async getCategories() {
    return this.formTypeService.getCategories();
  }

  @Get("frequent")
  async getFrequentForms(@Query("limit") limit?: string) {
    return this.formTypeService.getFrequentForms(limit ? parseInt(limit) : 3);
  }

  @Get(":code")
  async findByCode(@Param("code") code: string) {
    return this.formTypeService.findByCode(code);
  }
}
