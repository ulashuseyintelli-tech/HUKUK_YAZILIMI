import { BadRequestException, NotFoundException, HttpException } from "@nestjs/common";
import { AllExceptionsFilter } from "../filters/all-exceptions.filter";
import { ErrorFloodGuard } from "../internal/error-flood-guard";

function mockRes() {
  const res: any = { headersSent: false };
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}
function host(req: any, res: any) {
  return { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as any;
}

describe("AllExceptionsFilter", () => {
  it("4xx (BadRequest) → LOGLANMAZ, gövde passthrough, status 400", () => {
    const svc = { log: jest.fn().mockResolvedValue({}) } as any;
    const filter = new AllExceptionsFilter(svc, new ErrorFloodGuard());
    const res = mockRes();
    filter.catch(new BadRequestException({ statusCode: 400, message: ["x zorunlu"], error: "Bad Request" }), host({ url: "/api/x", method: "POST" }, res));
    expect(svc.log).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ statusCode: 400, message: ["x zorunlu"], error: "Bad Request" });
  });

  it("404 → LOGLANMAZ", () => {
    const svc = { log: jest.fn().mockResolvedValue({}) } as any;
    const filter = new AllExceptionsFilter(svc, new ErrorFloodGuard());
    const res = mockRes();
    filter.catch(new NotFoundException(), host({ url: "/api/yok", method: "GET" }, res));
    expect(svc.log).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("500 (bilinmeyen Error) → LOGLANIR (source API/level ERROR/status 500) + generic gövde", () => {
    const svc = { log: jest.fn().mockResolvedValue({}) } as any;
    const filter = new AllExceptionsFilter(svc, new ErrorFloodGuard());
    const res = mockRes();
    filter.catch(new Error("db patladı"), host({ url: "/api/cases", method: "POST", user: { id: "u1", tenantId: "t1" }, requestId: "r1" }, res));
    expect(svc.log).toHaveBeenCalledTimes(1);
    const entry = svc.log.mock.calls[0][0];
    expect(entry.source).toBe("API");
    expect(entry.level).toBe("ERROR");
    expect(entry.statusCode).toBe(500);
    expect(entry.tenantId).toBe("t1");
    expect(entry.metadata.requestId).toBe("r1");
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ statusCode: 500, message: "Internal server error" });
  });

  it("500 HttpException → gövde passthrough (getResponse) korunur", () => {
    const svc = { log: jest.fn().mockResolvedValue({}) } as any;
    const filter = new AllExceptionsFilter(svc, new ErrorFloodGuard());
    const res = mockRes();
    filter.catch(new HttpException({ statusCode: 500, message: "özel hata" }, 500), host({ url: "/api/x", method: "GET" }, res));
    expect(res.json).toHaveBeenCalledWith({ statusCode: 500, message: "özel hata" });
  });

  it("LOGGING ISOLATION: log() reddedilse bile filter ATMAZ ve yanıtı GÖNDERİR", () => {
    const svc = { log: jest.fn().mockRejectedValue(new Error("db down")) } as any;
    const filter = new AllExceptionsFilter(svc, new ErrorFloodGuard());
    const res = mockRes();
    expect(() =>
      filter.catch(new Error("boom"), host({ url: "/api/x", method: "GET" }, res)),
    ).not.toThrow();
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("PR-2b: aynı 500 iki kez → DB log HER İKİSİNDE çağrılır (dedupe ARTIK serviste, filter yutmaz)", () => {
    const svc = { log: jest.fn().mockResolvedValue({}) } as any;
    const guard = new ErrorFloodGuard();
    guard.setClockForTest(() => 1000);
    const filter = new AllExceptionsFilter(svc, guard);
    const exc = new Error("same error");
    const req = { url: "/api/cases", method: "POST", user: { tenantId: "t1" } };
    filter.catch(exc, host(req, mockRes()));
    filter.catch(exc, host(req, mockRes()));
    // FloodGuard artık yalnız konsol throttle eder; DB persistence kararını VERMEZ.
    expect(svc.log).toHaveBeenCalledTimes(2);
  });

  it("headersSent ise tekrar yanıt göndermez", () => {
    const svc = { log: jest.fn().mockResolvedValue({}) } as any;
    const filter = new AllExceptionsFilter(svc, new ErrorFloodGuard());
    const res = mockRes();
    res.headersSent = true;
    filter.catch(new Error("x"), host({ url: "/api/x", method: "GET" }, res));
    expect(res.status).not.toHaveBeenCalled();
  });
});
