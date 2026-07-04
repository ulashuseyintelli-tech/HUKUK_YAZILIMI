import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ResolveErrorLogDto } from "../dto/resolve-error-log.dto";

// Global ValidationPipe (transform:true) ile aynı sıra: önce @Transform (trim), sonra validate.
async function run(input: any) {
  const dto = plainToInstance(ResolveErrorLogDto, input);
  const errors = await validate(dto);
  return { dto, errors };
}

describe("ResolveErrorLogDto (PR-6A)", () => {
  it("resolution EKSİK → hata", async () => {
    const { errors } = await run({});
    expect(errors.length).toBeGreaterThan(0);
  });

  it("boş string → hata", async () => {
    const { errors } = await run({ resolution: "" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("yalnız boşluk → hata (trim sonrası boş)", async () => {
    const { errors } = await run({ resolution: "              " });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("trim sonrası 10'dan KISA → hata", async () => {
    const { errors } = await run({ resolution: "   kısa   " });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("string olmayan (number) → hata", async () => {
    const { errors } = await run({ resolution: 1234567890 as any });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("geçerli (çevre boşluklu) → hata YOK + TRIMMED saklanır", async () => {
    const { dto, errors } = await run({ resolution: "   yeterince uzun açıklama   " });
    expect(errors).toHaveLength(0);
    expect(dto.resolution).toBe("yeterince uzun açıklama");
  });

  it("tam 10 karakter (trim sonrası) → geçerli (sınır)", async () => {
    const { errors } = await run({ resolution: "0123456789" });
    expect(errors).toHaveLength(0);
  });
});
