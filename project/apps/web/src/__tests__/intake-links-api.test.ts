import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "@/lib/api";

/**
 * Staff intake-link metodları AUTHED olmalı (PR-A public intake-api'nin AYNASI:
 * orada Authorization YOK; burada Authorization VAR).
 */
describe("intake link api (staff, AUTH VAR)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    api.setToken("test-token");
  });

  function mockFetch(ok: boolean, body: any) {
    const fn = vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) });
    (global as unknown as { fetch: unknown }).fetch = fn;
    return fn;
  }

  it("createIntakeLink → POST doğru URL + Authorization Bearer + gövde scope", async () => {
    const fn = mockFetch(true, { link: { id: "l1" }, rawToken: "r", intakeUrl: "u" });
    await api.createIntakeLink("c1", { clientId: "cl1", scope: ["ADDRESS", "INCOME_SOURCE"] });
    const [url, opts] = fn.mock.calls[0];
    expect(String(url)).toContain("/api/client-intake-links/case/c1");
    expect(opts.method).toBe("POST");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    const body = JSON.parse(opts.body);
    expect(body.clientId).toBe("cl1");
    expect(body.scope).toEqual(["ADDRESS", "INCOME_SOURCE"]);
  });
  it("createClientWorkspaceIntakeLink → POST workspace URL + Authorization Bearer + gövdede clientId yok", async () => {
    const fn = mockFetch(true, { data: { link: { id: "l2" }, rawToken: "r2", intakeUrl: "u2" } });
    const result = await api.createClientWorkspaceIntakeLink("cl1", "c1", { scope: ["ADDRESS"] });
    const [url, opts] = fn.mock.calls[0];
    expect(String(url)).toContain("/api/clients/cl1/cases/c1/intake-links");
    expect(opts.method).toBe("POST");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    const body = JSON.parse(opts.body);
    expect(body).toEqual({ scope: ["ADDRESS"] });
    expect(body.clientId).toBeUndefined();
    expect(result.intakeUrl).toBe("u2");
  });

  it("createClientWorkspaceIntakeLinkAndDeliver -> POST workspace create-and-deliver URL + Idempotency-Key header + safe body", async () => {
    const fn = mockFetch(true, {
      data: {
        link: { id: "l3" },
        delivery: { id: "d1", status: "sent", channel: "EMAIL", notificationId: "n1", attemptCount: 1 },
      },
    });

    const result = await api.createClientWorkspaceIntakeLinkAndDeliver("cl1", "c1", { scope: ["ADDRESS"] });

    const [url, opts] = fn.mock.calls[0];
    expect(String(url)).toContain("/api/clients/cl1/cases/c1/intake-links/create-and-deliver");
    expect(opts.method).toBe("POST");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    expect((opts.headers as Record<string, string>)["Idempotency-Key"]).toEqual(expect.any(String));
    const body = JSON.parse(opts.body);
    expect(body).toEqual({ scope: ["ADDRESS"] });
    expect(body.clientId).toBeUndefined();
    expect(body.tenantId).toBeUndefined();
    expect(body.rawToken).toBeUndefined();
    expect(body.intakeUrl).toBeUndefined();
    expect(body.idempotencyKey).toBeUndefined();
    expect(result.delivery.status).toBe("sent");
    expect(JSON.stringify(result)).not.toContain("intake/raw");
  });

  it("sendClientWorkspacePoaReminder -> POST workspace POA reminder URL + Authorization Bearer + no unsafe body", async () => {
    const fn = mockFetch(true, {
      data: { clientId: "cl1", status: "sent", scanned: 1, recipients: 1, sent: 1, failed: 0, skipped: 0 },
    });

    const result = await api.sendClientWorkspacePoaReminder("cl1");

    const [url, opts] = fn.mock.calls[0];
    expect(String(url)).toContain("/api/clients/cl1/poa-reminders/send");
    expect(opts.method).toBe("POST");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    expect(opts.body).toBeUndefined();
    expect(result.status).toBe("sent");
    expect(JSON.stringify(result)).not.toContain("dedupe");
    expect(JSON.stringify(result)).not.toContain("@example");
  });



  it("uploadClientWorkspacePoaFile -> POST workspace POA file URL + multipart file + safe response", async () => {
    const fn = mockFetch(true, {
      data: {
        clientId: "cl1",
        poaId: "poa1",
        hasFile: true,
        fileSize: 2048,
        mimeType: "application/pdf",
        filePath: "C:/secret/storage/tenant/poa.pdf",
      },
    });
    const file = new File(["poa"], "poa.pdf", { type: "application/pdf" });

    const result = await api.uploadClientWorkspacePoaFile("cl1", "poa1", file);

    const [url, opts] = fn.mock.calls[0];
    expect(String(url)).toContain("/api/clients/cl1/poas/poa1/file");
    expect(opts.method).toBe("POST");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    expect((opts.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    expect(opts.body).toBeInstanceOf(FormData);
    expect((opts.body as FormData).get("file")).toBe(file);
    expect(result).toEqual({
      clientId: "cl1",
      poaId: "poa1",
      hasFile: true,
      fileSize: 2048,
      mimeType: "application/pdf",
    });
    expect(JSON.stringify(result)).not.toContain("filePath");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("storage");
  });
  it("sendClientWorkspaceTemplateNotification -> POST workspace template URL + Idempotency-Key + safe allowlist body", async () => {
    const fn = mockFetch(true, {
      data: { clientId: "cl1", caseId: "case-1", templateCode: "DOSYA_DURUMU", status: "sent", notificationId: "n1" },
    });

    const result = await api.sendClientWorkspaceTemplateNotification("cl1", {
      templateCode: "DOSYA_DURUMU",
      caseId: "case-1",
    });

    const [url, opts] = fn.mock.calls[0];
    expect(String(url)).toContain("/api/clients/cl1/template-notifications/send");
    expect(opts.method).toBe("POST");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    expect((opts.headers as Record<string, string>)["Idempotency-Key"]).toEqual(expect.any(String));
    const body = JSON.parse(opts.body);
    expect(body).toEqual({ templateCode: "DOSYA_DURUMU", caseId: "case-1" });
    expect(body.clientId).toBeUndefined();
    expect(body.tenantId).toBeUndefined();
    expect(body.rawToken).toBeUndefined();
    expect(body.intakeUrl).toBeUndefined();
    expect(body.idempotencyKey).toBeUndefined();
    expect(body.recipient).toBeUndefined();
    expect(body.body).toBeUndefined();
    expect(body.tokens).toBeUndefined();
    expect(body.dedupeKey).toBeUndefined();
    expect(result.status).toBe("sent");
    expect(JSON.stringify(result)).not.toContain("dedupe");
    expect(JSON.stringify(result)).not.toContain("@example");
    expect(JSON.stringify(result)).not.toContain("rendered");
    expect(JSON.stringify(result)).not.toContain("provider");
  });

  it("sendClientWorkspaceDocumentRequest -> POST workspace document request URL + Idempotency-Key + safe allowlist body", async () => {
    const fn = mockFetch(true, {
      data: { clientId: "cl1", caseId: "case-1", documentCodes: ["GENEL_BELGE"], status: "sent", documentRequestId: "dr1", notificationId: "n1" },
    });

    const result = await api.sendClientWorkspaceDocumentRequest("cl1", {
      documentCodes: ["GENEL_BELGE"],
      caseId: "case-1",
    });

    const [url, opts] = fn.mock.calls[0];
    expect(String(url)).toContain("/api/clients/cl1/document-requests/send");
    expect(opts.method).toBe("POST");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    expect((opts.headers as Record<string, string>)["Idempotency-Key"]).toEqual(expect.any(String));
    const body = JSON.parse(opts.body);
    expect(body).toEqual({ documentCodes: ["GENEL_BELGE"], caseId: "case-1" });
    expect(body.clientId).toBeUndefined();
    expect(body.tenantId).toBeUndefined();
    expect(body.rawToken).toBeUndefined();
    expect(body.intakeUrl).toBeUndefined();
    expect(body.idempotencyKey).toBeUndefined();
    expect(body.recipient).toBeUndefined();
    expect(body.body).toBeUndefined();
    expect(body.tokens).toBeUndefined();
    expect(body.dedupeKey).toBeUndefined();
    expect(body.providerPayload).toBeUndefined();
    expect(result.status).toBe("sent");
    expect(JSON.stringify(result)).not.toContain("dedupe");
    expect(JSON.stringify(result)).not.toContain("@example");
    expect(JSON.stringify(result)).not.toContain("rendered");
    expect(JSON.stringify(result)).not.toContain("provider");
  });

  it("sendClientWorkspaceDocumentRequest calls use a fresh Idempotency-Key", async () => {
    const fn = mockFetch(true, {
      data: { clientId: "cl1", caseId: "case-1", documentCodes: ["GENEL_BELGE"], status: "sent", documentRequestId: "dr1", notificationId: "n1" },
    });

    await api.sendClientWorkspaceDocumentRequest("cl1", { documentCodes: ["GENEL_BELGE"], caseId: "case-1" });
    await api.sendClientWorkspaceDocumentRequest("cl1", { documentCodes: ["GENEL_BELGE"], caseId: "case-1" });

    const firstKey = (fn.mock.calls[0][1].headers as Record<string, string>)["Idempotency-Key"];
    const secondKey = (fn.mock.calls[1][1].headers as Record<string, string>)["Idempotency-Key"];
    expect(firstKey).toEqual(expect.any(String));
    expect(secondKey).toEqual(expect.any(String));
    expect(secondKey).not.toBe(firstKey);
  });

  it("sendClientWorkspaceTemplateNotification calls use a fresh Idempotency-Key", async () => {
    const fn = mockFetch(true, {
      data: { clientId: "cl1", caseId: null, templateCode: "GENEL_BILGILENDIRME", status: "sent", notificationId: "n1" },
    });

    await api.sendClientWorkspaceTemplateNotification("cl1", { templateCode: "GENEL_BILGILENDIRME" });
    await api.sendClientWorkspaceTemplateNotification("cl1", { templateCode: "GENEL_BILGILENDIRME" });

    const firstKey = (fn.mock.calls[0][1].headers as Record<string, string>)["Idempotency-Key"];
    const secondKey = (fn.mock.calls[1][1].headers as Record<string, string>)["Idempotency-Key"];
    expect(firstKey).toEqual(expect.any(String));
    expect(secondKey).toEqual(expect.any(String));
    expect(secondKey).not.toBe(firstKey);
  });

  it("createClientWorkspaceIntakeLinkAndDeliver retry-as-new calls use a fresh Idempotency-Key", async () => {
    const fn = mockFetch(true, {
      data: {
        link: { id: "l3" },
        delivery: { id: "d1", status: "sent", channel: "EMAIL", notificationId: "n1", attemptCount: 1 },
      },
    });

    await api.createClientWorkspaceIntakeLinkAndDeliver("cl1", "c1", { scope: ["ADDRESS"] });
    await api.createClientWorkspaceIntakeLinkAndDeliver("cl1", "c1", { scope: ["ADDRESS"] });

    const firstKey = (fn.mock.calls[0][1].headers as Record<string, string>)["Idempotency-Key"];
    const secondKey = (fn.mock.calls[1][1].headers as Record<string, string>)["Idempotency-Key"];
    expect(firstKey).toEqual(expect.any(String));
    expect(secondKey).toEqual(expect.any(String));
    expect(secondKey).not.toBe(firstKey);
  });
  it("listIntakeLinks → GET + Authorization Bearer + status query", async () => {
    const fn = mockFetch(true, []);
    await api.listIntakeLinks("c1", "ACTIVE");
    const [url, opts] = fn.mock.calls[0];
    expect(String(url)).toContain("/api/client-intake-links/case/c1?status=ACTIVE");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });

  it("revokeIntakeLink → POST :id/revoke + Authorization Bearer", async () => {
    const fn = mockFetch(true, { id: "l1", status: "REVOKED" });
    await api.revokeIntakeLink("l1");
    const [url, opts] = fn.mock.calls[0];
    expect(String(url)).toContain("/api/client-intake-links/l1/revoke");
    expect(opts.method).toBe("POST");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });
});
