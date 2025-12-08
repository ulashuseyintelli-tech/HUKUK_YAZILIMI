import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "@/prisma/prisma.service";
import { RegisterDto, LoginDto } from "./dto/auth.dto";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService
  ) {}

  async register(dto: RegisterDto) {
    // Check if tenant slug exists
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug: this.generateSlug(dto.firmName) },
    });

    if (existingTenant) {
      throw new ConflictException("Bu firma adı zaten kullanılıyor");
    }

    // Check if email exists
    const existingUser = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException("Bu e-posta adresi zaten kullanılıyor");
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    // Create tenant and admin user in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.firmName,
          slug: this.generateSlug(dto.firmName),
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          passwordHash,
          name: dto.name,
          surname: dto.surname || "",
          role: "ADMIN",
        },
      });

      return { tenant, user };
    });

    const token = this.generateToken(result.user);

    return {
      token,
      user: this.sanitizeUser(result.user),
      tenant: result.tenant,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email },
      include: { tenant: true },
    });

    if (!user) {
      throw new UnauthorizedException("Geçersiz e-posta veya şifre");
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException("Geçersiz e-posta veya şifre");
    }

    if (!user.isActive) {
      throw new UnauthorizedException("Hesabınız devre dışı bırakılmış");
    }

    const token = this.generateToken(user);

    return {
      token,
      user: this.sanitizeUser(user),
      tenant: user.tenant,
    };
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    return user;
  }

  private generateToken(user: { id: string; tenantId: string; email: string; role: string }) {
    return this.jwtService.sign({
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    });
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/ğ/g, "g")
      .replace(/ü/g, "u")
      .replace(/ş/g, "s")
      .replace(/ı/g, "i")
      .replace(/ö/g, "o")
      .replace(/ç/g, "c")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  private sanitizeUser(user: any) {
    const { passwordHash, ...rest } = user;
    return rest;
  }
}
