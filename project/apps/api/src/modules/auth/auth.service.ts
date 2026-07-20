import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "@/prisma/prisma.service";
import { RegisterDto, LoginDto } from "./dto/auth.dto";

export type FindTenantsResult =
  | { status: "NONE" }
  | { status: "SINGLE"; tenantSlug: string; tenantName: string }
  | { status: "MULTIPLE"; tenants: { tenantSlug: string; tenantName: string }[] };
import { seedLookupCatalog } from "../lookup/lookup-seed";

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

    // AUTH-01: global (tenant-scope'suz) email-uniqueness kontrolü KALDIRILDI.
    // register() her zaman YENİ bir tenant yaratır; aynı e-posta başka bir tenant'ta
    // zaten var olabilir (@@unique([tenantId,email]) buna izin verir, bu doğru davranıştır —
    // holding/franchise/aynı kişinin birden fazla firmada yer alması senaryoları).

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

      // PR-B: Yeni tenant kanonik lookup kataloğu ile DOLU doğsun (takip türü/mahiyet vb.).
      // AYNI transaction'daki tx client ile çağrılır (this.prisma DEĞİL): seed başarısız olursa
      // tenant + user da ROLLBACK olur → yarı-kurulu (lookup'suz) tenant oluşmaz.
      // user create'ten SONRA: önce ucuz unique kontrolleri geçsin, ~53 upsert boşa gitmesin.
      await seedLookupCatalog(tx, tenant.id);

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
    // AUTH-01: tenant-aware çözümleme — tenantSlug ZORUNLU girdi. Global (tenant-scope'suz)
    // findFirst({email}) kaldırıldı; aynı e-posta farklı tenant'larda var olabileceği için
    // (@@unique([tenantId,email])) tenantSlug olmadan kullanıcı tekil biçimde belirlenemez.
    // Tenant seçici/keşif akışı burada YOK — bkz. findTenantsForEmail() (ayrı account-recovery ucu).
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, tenant: { slug: dto.tenantSlug } },
      include: { tenant: true },
    });

    if (!user) {
      // Yanlış email / yanlış tenantSlug / hiç yok — hepsi AYNI generic mesaj (enumeration-safe).
      throw new UnauthorizedException("Geçersiz e-posta veya şifre");
    }

    // K1-7: passwordHash artık nullable (pending/davetli kullanıcı parolasız var olabilir).
    // Parolası belirlenmemiş kullanıcı login OLAMAZ; bcrypt.compare(plain, null) crash etmesin.
    if (!user.passwordHash) {
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

  /**
   * AUTH-01 — Account/Tenant Recovery akışı (LOGIN AKIŞININ PARÇASI DEĞİLDİR).
   * Yalnız kullanıcı "kurumumu bilmiyorum" dediğinde, ayrı bir uçtan (find-tenants) çağrılır.
   * Login sırasında ASLA otomatik tetiklenmez — normal girişte enumeration yüzeyi sıfırdır.
   * Yalnız aktif (isActive) kullanıcıların tenant'ları döner (pending/deaktif hesap varlığı sızmaz).
   */
  async findTenantsForEmail(email: string): Promise<FindTenantsResult> {
    const users = await this.prisma.user.findMany({
      where: { email, isActive: true },
      include: { tenant: true },
    });

    if (users.length === 0) {
      return { status: "NONE" };
    }
    if (users.length === 1) {
      return {
        status: "SINGLE",
        tenantSlug: users[0].tenant.slug,
        tenantName: users[0].tenant.name,
      };
    }
    return {
      status: "MULTIPLE",
      tenants: users.map((u) => ({ tenantSlug: u.tenant.slug, tenantName: u.tenant.name })),
    };
  }

  async validateUser(userId: string, tokenVersion?: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    // OFFICE-AUTH-P01: parola değişince tokenVersion artar; claim içermeyen (eski) token
    // 0 kabul edilir. Eşleşmezse önceden geçerli token da artık reddedilir (session revocation).
    if ((tokenVersion ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException();
    }

    return user;
  }

  private generateToken(user: { id: string; tenantId: string; email: string; role: string; tokenVersion: number }) {
    return this.jwtService.sign({
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
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
