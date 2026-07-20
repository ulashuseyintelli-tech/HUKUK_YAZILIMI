import { Injectable, BadRequestException, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "@/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ChangePasswordDto } from "./dto/change-password.dto";

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /**
   * OFFICE-AUTH-P01: authenticated kullanıcının KENDİ parolasını değiştirmesi.
   * Yalnız JWT'deki userId+tenantId ile çözümlenir; admin başka kullanıcı adına çağıramaz
   * (bu metodun hiçbir çağıranı targetUserId parametresi almaz).
   *
   * Çağrıldığı yerler:
   * - UserController.changeMyPassword() -> PATCH /api/users/me/password
   */
  async changeOwnPassword(userId: string, tenantId: string, dto: ChangePasswordDto) {
    if (dto.newPassword !== dto.newPasswordConfirmation) {
      throw new BadRequestException("Yeni parola ve tekrarı eşleşmiyor");
    }

    // bcrypt 72 bayttan sonrasını sessizce keser; belirsizliğe izin verme (owner policy).
    if (Buffer.byteLength(dto.newPassword, "utf8") > 72) {
      throw new BadRequestException("Yeni parola en fazla 72 bayt (UTF-8) olabilir");
    }

    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException();
    }

    const isCurrentValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      throw new BadRequestException("Mevcut parola doğrulanamadı");
    }

    const isSameAsCurrent = await bcrypt.compare(dto.newPassword, user.passwordHash);
    if (isSameAsCurrent) {
      throw new BadRequestException("Yeni parola mevcut parolayla aynı olamaz");
    }

    const newPasswordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        passwordChangedAt: new Date(),
        tokenVersion: { increment: 1 },
      },
    });

    // Ham/parola/hash ASLA audit metadata'ya yazılmaz.
    await this.audit.log({
      tenantId,
      action: "PASSWORD_CHANGED",
      entityType: "USER",
      entityId: userId,
      userId,
      metadata: { result: "CHANGED" },
    });

    return { ok: true };
  }

  async findByTenant(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        email: true,
        name: true,
        surname: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        surname: true,
        role: true,
        isActive: true,
        tenantId: true,
      },
    });
  }
}
