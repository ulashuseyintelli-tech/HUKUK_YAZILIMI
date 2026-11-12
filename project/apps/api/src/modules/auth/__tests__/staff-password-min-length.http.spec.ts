/**
 * Personel parola asgari uzunluğu (owner kararı 12.11.2026: 6 karakter) — GERÇEK HTTP doğrulama testi.
 *
 * Gerçek `UserController` (PATCH /users/me/password), `PasswordResetController` (POST /auth/reset-password) ve
 * `UserInviteController` (POST /auth/accept-invite) gerçek bir Nest HTTP adaptöründe, `main.ts` ile AYNI global
 * `ValidationPipe` seçenekleriyle ayağa kalkar. Yalnız servisler sahtelenir ve kimlik / deneme sınırı guard'ları geçirgen
 * yapılır; DTO doğrulaması ve mesajlar tel üzerinden okunur. Kayıt ucu kapalıdır (`auth-register-closed-http.spec.ts`);
 * `RegisterDto` doğrudan class-validator ile sınanır.
 *
 * Ayrıca API tanımı ile web tanımının (`apps/web/src/lib/password-policy.ts`) aynı değeri taşıdığı denetlenir.
 * Parola değerleri SENTETİKTİR.
 */
import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import * as fs from "fs";
import * as path from "path";
import * as request from "supertest";

import { UserController } from "../../user/user.controller";
import { UserService } from "../../user/user.service";
import { PasswordResetController } from "../password-reset/password-reset.controller";
import { PasswordResetService } from "../password-reset/password-reset.service";
import { UserInviteController } from "../invite/user-invite.controller";
import { UserInviteService } from "../invite/user-invite.service";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { AdminGuard } from "../guards/admin.guard";
import { LoginRateLimitGuard } from "../guards/login-rate-limit.guard";
import { OfficeForgotPasswordRateLimitGuard } from "../guards/office-forgot-password-rate-limit.guard";
import { OfficeResetPasswordRateLimitGuard } from "../guards/office-reset-password-rate-limit.guard";
import { RegisterDto } from "../dto/auth.dto";
import {
  STAFF_NEW_PASSWORD_MIN_LENGTH_MESSAGE,
  STAFF_PASSWORD_MIN_LENGTH,
  STAFF_PASSWORD_MIN_LENGTH_MESSAGE,
} from "../password-policy";

const pw = (n: number) => "p".repeat(n);

const allow: CanActivate = { canActivate: () => true };
const asUser: CanActivate = {
  canActivate: (ctx: ExecutionContext) => {
    ctx.switchToHttp().getRequest().user = { id: "u-1", tenantId: "t-1", role: "USER" };
    return true;
  },
};

function messages(body: unknown): string[] {
  const m = (body as { message?: unknown })?.message;
  return Array.isArray(m) ? (m as string[]) : typeof m === "string" ? [m] : [];
}

describe("Personel parola asgari uzunluğu — API (6 karakter)", () => {
  let app: INestApplication;
  const userService = { changeOwnPassword: jest.fn(), findByTenant: jest.fn() };
  const passwordReset = { resetPassword: jest.fn(), forgotPassword: jest.fn() };
  const invites = { accept: jest.fn(), create: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UserController, PasswordResetController, UserInviteController],
      providers: [
        { provide: UserService, useValue: userService },
        { provide: PasswordResetService, useValue: passwordReset },
        { provide: UserInviteService, useValue: invites },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(asUser)
      .overrideGuard(AdminGuard)
      .useValue(allow)
      .overrideGuard(LoginRateLimitGuard)
      .useValue(allow)
      .overrideGuard(OfficeForgotPasswordRateLimitGuard)
      .useValue(allow)
      .overrideGuard(OfficeResetPasswordRateLimitGuard)
      .useValue(allow)
      .compile();

    app = moduleRef.createNestApplication();
    // main.ts ile aynı seçenekler.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    userService.changeOwnPassword.mockReset().mockResolvedValue({ ok: true });
    passwordReset.resetPassword.mockReset().mockResolvedValue({ ok: true });
    invites.accept.mockReset().mockResolvedValue({ ok: true, userId: "u-9" });
  });

  it("tek tanım 6 karakterdir", () => {
    expect(STAFF_PASSWORD_MIN_LENGTH).toBe(6);
  });

  describe("PATCH /users/me/password (self-service değiştirme)", () => {
    const send = (newPassword: string) =>
      request(app.getHttpServer())
        .patch("/users/me/password")
        .send({ currentPassword: "mevcut-sentetik", newPassword, newPasswordConfirmation: newPassword });

    it("5 karakter → 400, Türkçe mesaj, servis çağrılmaz", async () => {
      const res = await send(pw(5));
      expect(res.status).toBe(400);
      expect(messages(res.body)).toContain(STAFF_NEW_PASSWORD_MIN_LENGTH_MESSAGE);
      expect(STAFF_NEW_PASSWORD_MIN_LENGTH_MESSAGE).toBe("Yeni parola en az 6 karakter olmalıdır");
      expect(userService.changeOwnPassword).not.toHaveBeenCalled();
    });

    it.each([6, 12, 20])("%i karakter uzunluk koşulunu karşılar → servise iletilir", async (n) => {
      const res = await send(pw(n));
      expect(res.status).toBe(200);
      expect(userService.changeOwnPassword).toHaveBeenCalledTimes(1);
      const [userId, tenantId, dto] = userService.changeOwnPassword.mock.calls[0];
      expect([userId, tenantId]).toEqual(["u-1", "t-1"]);
      expect(dto.newPassword).toHaveLength(n);
    });
  });

  describe("POST /auth/reset-password (sıfırlama)", () => {
    const send = (password: string) =>
      request(app.getHttpServer())
        .post("/auth/reset-password")
        .send({ token: "sentetik-belirtec", password, passwordConfirmation: password });

    it("5 karakter → 400, Türkçe mesaj, servis çağrılmaz", async () => {
      const res = await send(pw(5));
      expect(res.status).toBe(400);
      expect(messages(res.body)).toContain(STAFF_NEW_PASSWORD_MIN_LENGTH_MESSAGE);
      expect(passwordReset.resetPassword).not.toHaveBeenCalled();
    });

    it.each([6, 12, 20])("%i karakter uzunluk koşulunu karşılar → servise iletilir", async (n) => {
      const res = await send(pw(n));
      expect(res.status).toBe(201);
      expect(passwordReset.resetPassword).toHaveBeenCalledTimes(1);
      expect(passwordReset.resetPassword.mock.calls[0][0].password).toHaveLength(n);
    });
  });

  describe("POST /auth/accept-invite (davet kabulü — ilk parola belirleme)", () => {
    const send = (password: string) =>
      request(app.getHttpServer()).post("/auth/accept-invite").send({ token: "sentetik-davet", password });

    it("5 karakter → 400, Türkçe mesaj, servis çağrılmaz", async () => {
      const res = await send(pw(5));
      expect(res.status).toBe(400);
      expect(messages(res.body)).toContain(STAFF_PASSWORD_MIN_LENGTH_MESSAGE);
      expect(STAFF_PASSWORD_MIN_LENGTH_MESSAGE).toBe("Parola en az 6 karakter olmalıdır");
      expect(invites.accept).not.toHaveBeenCalled();
    });

    it.each([6, 12, 20])("%i karakter uzunluk koşulunu karşılar → servise iletilir", async (n) => {
      const res = await send(pw(n));
      expect(res.status).toBe(201);
      expect(invites.accept).toHaveBeenCalledWith("sentetik-davet", pw(n));
    });
  });

  describe("RegisterDto (kayıt ucu kapalı; DTO kuralı aynı tanımdan)", () => {
    const body = (password: string) => ({
      firmName: "Sentetik Büro",
      name: "Ad",
      email: "sentetik@invalid.example",
      password,
      personType: "LAWYER",
      tckn: "00000000000",
    });
    const minLengthErrors = async (password: string) =>
      (await validate(plainToInstance(RegisterDto, body(password))))
        .filter((e) => e.property === "password")
        .flatMap((e) => Object.entries(e.constraints ?? {}));

    it("5 karakter reddedilir", async () => {
      expect(await minLengthErrors(pw(5))).toEqual([["minLength", STAFF_PASSWORD_MIN_LENGTH_MESSAGE]]);
    });

    it.each([6, 12, 20])("%i karakter uzunluk koşulunu karşılar", async (n) => {
      expect(await minLengthErrors(pw(n))).toEqual([]);
    });
  });

  it("API ve web aynı sınırı taşır (apps/web/src/lib/password-policy.ts)", () => {
    const webFile = path.resolve(__dirname, "../../../../../web/src/lib/password-policy.ts");
    const src = fs.readFileSync(webFile, "utf8");
    const match = src.match(/export const STAFF_PASSWORD_MIN_LENGTH\s*=\s*(\d+)\s*;/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(STAFF_PASSWORD_MIN_LENGTH);
  });
});
