/**
 * OFFICE-P5-SECURITY-COMPLETION-R01 / P5-B04 — StaffController guard/DTO wiring kilidi.
 *
 * P5-B03 ölçümü StaffController için guard-metadata spec'inin HİÇ olmadığını buldu
 * (SeedController emsali vardı). Bu spec mevcut sözleşmeyi regresyona karşı kilitler:
 *  - class-level JwtAuthGuard (authentication)
 *  - 4 mutasyon ucunda method-level OfficeF01AuthorizationGuard (#2076 — DEĞİŞMEDİ;
 *    owner yasağı: blanket AdminGuard dönüşümü YOK, PARTNER/AUTHORIZED akışları korunur)
 *  - GET uçlarında kapı YOK (S3: kapı değil alan-daraltma — staff-read-projection.spec)
 *  - mutasyon gövdeleri typed DTO (ValidationPipe artık gerçekten çalışır)
 */
import "reflect-metadata";
import { StaffController } from "../staff.controller";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { OfficeF01AuthorizationGuard } from "../../office-approval/office-f01-authorization.guard";
import { CreateStaffDto, UpdateStaffDto, UpdateStaffOrderDto } from "../dto/staff.dto";

const GUARDS_METADATA = "__guards__";
const classGuards = (): any[] => Reflect.getMetadata(GUARDS_METADATA, StaffController) || [];
const methodGuards = (method: string): any[] =>
  Reflect.getMetadata(GUARDS_METADATA, (StaffController.prototype as any)[method]) || [];
const paramTypes = (method: string): any[] =>
  Reflect.getMetadata("design:paramtypes", StaffController.prototype, method) || [];

describe("P5-B04 — StaffController guard wiring", () => {
  it("class-level JwtAuthGuard korunur", () => {
    expect(classGuards()).toContain(JwtAuthGuard);
  });

  it.each(["create", "update", "remove", "updateOrder"])(
    "%s → OfficeF01AuthorizationGuard ile korunur (#2076 sözleşmesi DEĞİŞMEDİ)",
    (method) => {
      expect(methodGuards(method)).toContain(OfficeF01AuthorizationGuard);
    },
  );

  it.each(["findAll", "findOne"])(
    "%s → method-level kapı YOK (S3: erişim kapısı değil alan-daraltma uygulanır)",
    (method) => {
      expect(methodGuards(method)).toEqual([]);
    },
  );

  it("mutasyon gövdeleri typed DTO ile bağlı (metatype Object DEĞİL → global ValidationPipe çalışır)", () => {
    expect(paramTypes("create")).toContain(CreateStaffDto);
    expect(paramTypes("update")).toContain(UpdateStaffDto);
    expect(paramTypes("updateOrder")).toContain(UpdateStaffOrderDto);
  });
});
