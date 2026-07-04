// PR-2a: HTTP correlation id. Her isteğe x-request-id atar (gelen başlık varsa onu kullanır,
// yoksa üretir) ve yanıt başlığına yazar. ExceptionFilter bunu req.requestId'den okur → kullanıcı
// "şu işlemde hata aldım" dediğinde tekil iz sürülebilir. ŞEMA DEĞİŞİKLİĞİ YOK.
import { Injectable, NestMiddleware } from "@nestjs/common";
import { randomUUID } from "crypto";

export const REQUEST_ID_HEADER = "x-request-id";

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void): void {
    const incoming = req?.headers?.[REQUEST_ID_HEADER];
    const requestId =
      typeof incoming === "string" && incoming.length > 0 && incoming.length <= 200
        ? incoming
        : randomUUID();
    req.requestId = requestId;
    if (res && typeof res.setHeader === "function") {
      res.setHeader(REQUEST_ID_HEADER, requestId);
    }
    next();
  }
}

export function getRequestId(req: any): string | undefined {
  return req?.requestId;
}
