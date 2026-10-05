/**
 * Masraf talebi penceresi — "Oluştur ve Gönder": gerçek gönderim, sonucun pencerede gösterilmesi, aynı talep üzerinden yeniden deneme.
 *
 * Ölçülen kusur (main adaa773f; gerçek tarayıcı + derlenmiş API + yerel yakalayıcı): kutu işaretliyken pencere
 * `POST /expense-requests/:id/send {channel:"EMAIL"}` çağırıyordu — bu uç yalnız talep satırını "gönderildi / EMAIL" yapıyor,
 * e-posta GÖNDERMİYORDU; pencere hiçbir sonuç göstermeden kapanıyordu.
 *
 * Owner kararı (2026-10-05, karar 3): gerçek gönderim ve sonucun pencerede gösterilmesi; gönderim başarısızsa oluşturulmuş talep
 * kaybolmaz, yeniden deneme AYNI talep üzerinden yapılır (ikinci talep yok); sağlayıcı kabulü ile alıcıya teslim ayrı ifade edilir;
 * belirsiz sonuç başarı sayılmaz. Sonuç metni / kararı sunucudandır; yalnız ağ katmanı (`@/lib/api`) taklit edilir.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExpenseRequestModal } from "../ExpenseRequestModal";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    getCostPackages: vi.fn(),
    getExpenseCatalog: vi.fn(),
    computeExpenseRequest: vi.fn(),
    createExpenseRequestFromPackage: vi.fn(),
    createExpenseRequest: vi.fn(),
    sendExpenseRequest: vi.fn(),
    sendExpenseEmail: vi.fn(),
  },
}));

type Fn = ReturnType<typeof vi.fn>;
const mocked = api as unknown as Record<
  | "getCostPackages"
  | "getExpenseCatalog"
  | "computeExpenseRequest"
  | "createExpenseRequestFromPackage"
  | "createExpenseRequest"
  | "sendExpenseRequest"
  | "sendExpenseEmail",
  Fn
>;

const ACCEPTED = {
  success: true,
  notificationId: "bildirim-1",
  status: "EMAIL_ACCEPTED",
  deliveryConfirmed: false,
  message: "E-posta gönderim sunucusu tarafından kabul edildi. Alıcıya teslim edildiği doğrulanmaz.",
};
const NOT_SENT_NO_SMTP = {
  success: false,
  status: "EMAIL_NOT_SENT",
  reasonCode: "SMTP_NOT_CONFIGURED",
  message: "Büronun e-posta gönderim (SMTP) ayarları yapılmamış; masraf e-postası gönderilmedi. Bu e-posta kendiliğinden yeniden gönderilmez.",
  requiredInfo: ["Büro Ayarları → SMTP ayarları"],
  retryable: true,
};
const NOT_SENT_REJECTED = {
  success: false,
  status: "EMAIL_NOT_SENT",
  reasonCode: "DELIVERY_REJECTED",
  message: "E-posta sunucusu iletiyi reddetti; masraf e-postası gönderilmedi. Bu e-posta kendiliğinden yeniden gönderilmez.",
  requiredInfo: ["Müvekkilin e-posta adresinin ve büro SMTP ayarlarının doğruluğu"],
  retryable: true,
};
const UNCERTAIN_TIMEOUT = {
  success: false,
  status: "EMAIL_NOT_SENT",
  reasonCode: "DELIVERY_UNCERTAIN",
  message: "E-posta sunucusundan yanıt alınamadı; masraf e-postasının gönderildiği doğrulanamadı. Bu e-posta kendiliğinden yeniden gönderilmez.",
  requiredInfo: ["Büro SMTP ayarlarının ve e-posta sunucusuna erişimin doğruluğu"],
  retryable: false,
};

const PACKAGE = { code: "UYAP_PRE", name: "UYAP Öncesi / Takip Açılış Masrafları", items: [] };
const PACKAGE_SUGGESTION = {
  packageCode: "UYAP_PRE",
  packageName: PACKAGE.name,
  items: [
    { itemCode: "BASVURMA_HARCI", label: "Başvurma Harcı", suggestedAmount: 615.4, finalAmount: 615.4, isEditable: false, sortOrder: 1 },
    { itemCode: "TEBLIGAT_GIDERI", label: "Tebligat Gideri", suggestedAmount: 15, finalAmount: 15, isEditable: true, sortOrder: 2 },
  ],
  totalSuggested: 630.4,
  messageTemplateCode: null,
};

const renderModal = (props: { initialPackageCode?: string; onClose?: () => void; onSuccess?: () => void } = {}) =>
  render(
    <ExpenseRequestModal
      isOpen
      onClose={props.onClose ?? (() => undefined)}
      onSuccess={props.onSuccess}
      caseId="case-1"
      clientId="client-1"
      clientName="Müvekkil A.Ş."
      caseFileNumber="2026/1"
      initialPackageCode={props.initialPackageCode}
    />,
  );

/** Elle kip: tutarı gir, e-posta kutusunu işaretle. */
async function fillManualAndCheckSend() {
  await waitFor(() => {
    expect(mocked.getExpenseCatalog).toHaveBeenCalled();
  });
  const amount = screen.getAllByRole("spinbutton")[0] as HTMLInputElement;
  fireEvent.change(amount, { target: { value: "252" } });
  fireEvent.click(screen.getByLabelText("Oluşturduktan sonra müvekkile e-posta gönder"));
}

const sendButton = () => screen.getByRole("button", { name: "Oluştur ve Gönder" });
const resultBox = () => screen.getByTestId("expense-send-result");

describe("ExpenseRequestModal — Oluştur ve Gönder", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocked)) fn.mockReset();
    mocked.getCostPackages.mockResolvedValue([PACKAGE]);
    mocked.getExpenseCatalog.mockResolvedValue([
      { code: "TEBLIGAT_GIDERI", officeLabel: "Tebligat Gideri", clientLabel: "Tebligat gideri", group: "ICRA_TAKIP", manualDescriptionRequired: false },
    ]);
    mocked.computeExpenseRequest.mockResolvedValue(PACKAGE_SUGGESTION);
    mocked.createExpenseRequest.mockResolvedValue({ id: "talep-elle" });
    mocked.createExpenseRequestFromPackage.mockResolvedValue({ id: "talep-paket" });
    vi.spyOn(window, "alert").mockImplementation(() => undefined);
    vi.spyOn(window, "confirm").mockImplementation(() => true);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("elle kip: talep BİR kez oluşur, gerçek gönderim ucu çağrılır, ESKİ işaretleme ucu çağrılmaz", async () => {
    mocked.sendExpenseEmail.mockResolvedValue(ACCEPTED);
    renderModal();
    await fillManualAndCheckSend();

    fireEvent.click(sendButton());
    await screen.findByTestId("expense-send-result");

    expect(mocked.createExpenseRequest).toHaveBeenCalledTimes(1);
    expect(mocked.sendExpenseEmail).toHaveBeenCalledTimes(1);
    expect(mocked.sendExpenseEmail).toHaveBeenCalledWith("talep-elle");
    expect(mocked.sendExpenseRequest).not.toHaveBeenCalled();
  });

  it("başarı: sağlayıcı kabulü söylenir, alıcıya teslim DOĞRULANMAZ; pencere sonucu gösterip açık kalır", async () => {
    mocked.sendExpenseEmail.mockResolvedValue(ACCEPTED);
    const onClose = vi.fn();
    renderModal({ onClose });
    await fillManualAndCheckSend();

    fireEvent.click(sendButton());
    const box = await screen.findByTestId("expense-send-result");

    expect(box.getAttribute("data-state")).toBe("accepted");
    expect(box.textContent).toContain("gönderim sunucusuna iletildi");
    expect(box.textContent).toContain("Alıcıya teslim edildiği doğrulanmaz");
    expect(box.textContent).not.toMatch(/müvekkile teslim edildi|alıcıya ulaştı/i);
    expect(onClose).not.toHaveBeenCalled();
    // ikinci gönderim düğmesi yok; yalnız Kapat
    expect(screen.queryByRole("button", { name: "Yeniden Dene" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Oluştur ve Gönder" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("SMTP'si olmayan büro: neden ve gereken bilgi gösterilir; talep kaybolmaz; Yeniden Dene vardır", async () => {
    mocked.sendExpenseEmail.mockResolvedValue(NOT_SENT_NO_SMTP);
    const onSuccess = vi.fn();
    renderModal({ onSuccess });
    await fillManualAndCheckSend();

    fireEvent.click(sendButton());
    const box = await screen.findByTestId("expense-send-result");

    expect(box.getAttribute("data-state")).toBe("not-sent");
    expect(box.textContent).toContain("Masraf talebi oluşturuldu ancak e-posta gönderilemedi.");
    expect(box.textContent).toContain("SMTP");
    expect(box.textContent).toContain("Gereken bilgi: Büro Ayarları → SMTP ayarları");
    expect(box.textContent).toContain("ikinci talep oluşturulmaz");
    expect(screen.getByRole("button", { name: "Yeniden Dene" })).toBeTruthy();
    // dosya verisi yenilemesi pencere AÇIKKEN yapılmaz (sayfa pencereyi yeniden kurup sonucu kaybettiriyordu); kapanışta yapılır
    expect(onSuccess).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("sağlayıcı reddi: kesin başarısızlık gösterilir; yeniden deneme AYNI talepte yapılır, ikinci talep oluşmaz", async () => {
    mocked.sendExpenseEmail.mockResolvedValueOnce(NOT_SENT_REJECTED).mockResolvedValueOnce(ACCEPTED);
    renderModal();
    await fillManualAndCheckSend();

    fireEvent.click(sendButton());
    const first = await screen.findByTestId("expense-send-result");
    expect(first.getAttribute("data-state")).toBe("not-sent");
    expect(first.textContent).toContain("reddetti");

    fireEvent.click(screen.getByRole("button", { name: "Yeniden Dene" }));
    await waitFor(() => {
      expect(resultBox().getAttribute("data-state")).toBe("accepted");
    });

    expect(mocked.createExpenseRequest).toHaveBeenCalledTimes(1);
    expect(mocked.sendExpenseEmail).toHaveBeenCalledTimes(2);
    expect(mocked.sendExpenseEmail.mock.calls.map((c) => c[0])).toEqual(["talep-elle", "talep-elle"]);
  });

  it("zaman aşımı / belirsiz sonuç: BAŞARI sayılmaz, tekrar gönderme düğmesi YOK, 'gönderilemedi' ile karıştırılmaz", async () => {
    mocked.sendExpenseEmail.mockResolvedValue(UNCERTAIN_TIMEOUT);
    renderModal();
    await fillManualAndCheckSend();

    fireEvent.click(sendButton());
    const box = await screen.findByTestId("expense-send-result");

    expect(box.getAttribute("data-state")).toBe("uncertain");
    expect(box.textContent).toContain("doğrulanamadı");
    expect(box.textContent).toContain("Başarılı sayılmadı");
    expect(box.textContent).not.toContain("kabul edildi");
    expect(screen.queryByRole("button", { name: "Yeniden Dene" })).toBeNull();
    expect(mocked.sendExpenseEmail).toHaveBeenCalledTimes(1);
  });

  it("yanıt alınamadı (ağ / sunucu hatası): başarı sayılmaz, aynı talepte yeniden denenebilir", async () => {
    mocked.sendExpenseEmail.mockRejectedValueOnce(new Error("Failed to fetch")).mockResolvedValueOnce(ACCEPTED);
    renderModal();
    await fillManualAndCheckSend();

    fireEvent.click(sendButton());
    const box = await screen.findByTestId("expense-send-result");
    expect(box.getAttribute("data-state")).toBe("error");
    expect(box.textContent).toContain("Gönderim sonucu alınamadı");
    expect(box.textContent).toContain("bilinmiyor");
    // başlık kesin başarısızlık söylemez (sonuç bilinmiyor)
    expect(box.textContent).not.toContain("ancak e-posta gönderilemedi");

    fireEvent.click(screen.getByRole("button", { name: "Yeniden Dene" }));
    await waitFor(() => {
      expect(resultBox().getAttribute("data-state")).toBe("accepted");
    });
    expect(mocked.createExpenseRequest).toHaveBeenCalledTimes(1);
    expect(mocked.sendExpenseEmail).toHaveBeenCalledTimes(2);
  });

  it("beklenmeyen / yapılandırılmamış yanıt (neden yok): tahmin edilmez, belirsiz sayılır", async () => {
    mocked.sendExpenseEmail.mockResolvedValue({ success: false });
    renderModal();
    await fillManualAndCheckSend();

    fireEvent.click(sendButton());
    const box = await screen.findByTestId("expense-send-result");
    expect(box.getAttribute("data-state")).toBe("uncertain");
    expect(screen.queryByRole("button", { name: "Yeniden Dene" })).toBeNull();
  });

  it("çift tıklama: ikinci talep ve ikinci gönderim oluşmaz", async () => {
    let releaseCreate: (v: { id: string }) => void = () => undefined;
    mocked.createExpenseRequest.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseCreate = resolve;
        }),
    );
    mocked.sendExpenseEmail.mockResolvedValue(ACCEPTED);
    renderModal();
    await fillManualAndCheckSend();

    const button = sendButton();
    // Üç tıklama AYNI act içinde: React düğmeyi devre dışı bırakacak yeniden çizimi yapmadan gelir → yalnız ref koruması engeller
    act(() => {
      button.click();
      button.click();
      button.click();
    });
    releaseCreate({ id: "talep-elle" });
    await screen.findByTestId("expense-send-result");

    expect(mocked.createExpenseRequest).toHaveBeenCalledTimes(1);
    expect(mocked.sendExpenseEmail).toHaveBeenCalledTimes(1);
  });

  it("gönderim sürerken (yanıtsız SMTP): düğme 'Gönderiliyor…', kapatma yok sayılır, ikinci gönderim yok", async () => {
    let releaseSend: (v: unknown) => void = () => undefined;
    mocked.sendExpenseEmail.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseSend = resolve;
        }),
    );
    const onClose = vi.fn();
    renderModal({ onClose });
    await fillManualAndCheckSend();

    fireEvent.click(sendButton());
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Gönderiliyor…" })).toBeTruthy();
    });
    // sürerken pencere kapanmaz (sonuç kaybolmasın) ve ikinci gönderim gitmez
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    act(() => {
      (screen.getByRole("button", { name: "Gönderiliyor…" }) as HTMLButtonElement).click();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(mocked.sendExpenseEmail).toHaveBeenCalledTimes(1);

    releaseSend(ACCEPTED);
    await screen.findByTestId("expense-send-result");
    expect(mocked.createExpenseRequest).toHaveBeenCalledTimes(1);
  });

  it("Yeniden Dene'ye art arda tıklama: ikinci gönderim ve ikinci talep yok", async () => {
    let releaseSend: (v: unknown) => void = () => undefined;
    mocked.sendExpenseEmail.mockResolvedValueOnce(NOT_SENT_NO_SMTP).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseSend = resolve;
        }),
    );
    renderModal();
    await fillManualAndCheckSend();
    fireEvent.click(sendButton());
    await screen.findByTestId("expense-send-result");

    const retry = screen.getByRole("button", { name: "Yeniden Dene" });
    act(() => {
      retry.click();
      retry.click();
    });
    releaseSend(ACCEPTED);
    await waitFor(() => {
      expect(resultBox().getAttribute("data-state")).toBe("accepted");
    });
    expect(mocked.sendExpenseEmail).toHaveBeenCalledTimes(2);
    expect(mocked.createExpenseRequest).toHaveBeenCalledTimes(1);
  });

  it("yeniden denenebilir başarısızlıkta kapatma ONAY ister; reddedilirse pencere açık kalır, kabul edilirse kapanır", async () => {
    mocked.sendExpenseEmail.mockResolvedValue(NOT_SENT_NO_SMTP);
    const onClose = vi.fn();
    renderModal({ onClose });
    await fillManualAndCheckSend();
    fireEvent.click(sendButton());
    const box = await screen.findByTestId("expense-send-result");
    expect(box.textContent).toContain("pencereyi kapatırsanız bu talep buradan yeniden gönderilemez");

    (window.confirm as unknown as Fn).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Kapat" })); // onay verildi
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("kabul sonucunda kapatma onay istemez", async () => {
    mocked.sendExpenseEmail.mockResolvedValue(ACCEPTED);
    const onClose = vi.fn();
    renderModal({ onClose });
    await fillManualAndCheckSend();
    fireEvent.click(sendButton());
    await screen.findByTestId("expense-send-result");

    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Yeniden denenemeyen sonuçlar: "bu talep buradan yeniden gönderilemez" uyarısı anlamsızdır (zaten Yeniden Dene yok) → onay istenmez.
  it.each([
    ["belirsiz sonuç (zaman aşımı)", UNCERTAIN_TIMEOUT, "uncertain"],
    [
      "kalemleri e-posta için geçersiz talep",
      {
        success: false,
        status: "EMAIL_NOT_SENT",
        reasonCode: "REQUEST_ITEMS_INVALID",
        message: "Masraf talebinde geçerli kalem ya da tutar yok; masraf e-postası gönderilmedi.",
        requiredInfo: ["Masraf talebinin kalemleri ve tutarları"],
        retryable: false,
      },
      "not-sent",
    ],
  ])("%s: kapatma onay İSTEMEZ (yeniden denenemeyen sonuç)", async (_title, response, state) => {
    mocked.sendExpenseEmail.mockResolvedValue(response);
    const onClose = vi.fn();
    renderModal({ onClose });
    await fillManualAndCheckSend();
    fireEvent.click(sendButton());
    const box = await screen.findByTestId("expense-send-result");
    expect(box.getAttribute("data-state")).toBe(state);
    expect(screen.queryByRole("button", { name: "Yeniden Dene" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe("X düğmesi ve arka plan tıklaması aynı kapatma yolunu kullanır", () => {
    const xButton = () => document.querySelector('button[class~="p-1.5"]') as HTMLButtonElement;
    const backdrop = () => document.querySelector('div[class~="bg-black/40"]') as HTMLElement;

    it("yeniden denenebilir başarısızlıkta X onay ister; reddedilirse açık kalır, kabul edilirse kapanır", async () => {
      mocked.sendExpenseEmail.mockResolvedValue(NOT_SENT_NO_SMTP);
      const onClose = vi.fn();
      renderModal({ onClose });
      await fillManualAndCheckSend();
      fireEvent.click(sendButton());
      await screen.findByTestId("expense-send-result");

      (window.confirm as unknown as Fn).mockReturnValueOnce(false);
      fireEvent.click(xButton());
      expect(window.confirm).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
      fireEvent.click(xButton());
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("yeniden denenebilir başarısızlıkta arka plana tek tıklama onay ister; reddedilirse pencere sessizce kapanmaz", async () => {
      mocked.sendExpenseEmail.mockResolvedValue(NOT_SENT_NO_SMTP);
      const onClose = vi.fn();
      renderModal({ onClose });
      await fillManualAndCheckSend();
      fireEvent.click(sendButton());
      await screen.findByTestId("expense-send-result");

      (window.confirm as unknown as Fn).mockReturnValueOnce(false);
      fireEvent.click(backdrop());
      expect(window.confirm).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
      fireEvent.click(backdrop());
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("gönderim sürerken X ve arka plan tıklaması yok sayılır", async () => {
      let releaseSend: (v: unknown) => void = () => undefined;
      mocked.sendExpenseEmail.mockImplementation(
        () =>
          new Promise((resolve) => {
            releaseSend = resolve;
          }),
      );
      const onClose = vi.fn();
      renderModal({ onClose });
      await fillManualAndCheckSend();
      fireEvent.click(sendButton());
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Gönderiliyor…" })).toBeTruthy();
      });

      fireEvent.click(xButton());
      fireEvent.click(backdrop());
      expect(onClose).not.toHaveBeenCalled();

      releaseSend(ACCEPTED);
      await screen.findByTestId("expense-send-result");
    });

    it("oluşturma isteği sürerken Kapat / X / arka plan yok sayılır (talep kimliği henüz yok; sonuç kaybolmasın)", async () => {
      let releaseCreate: (v: { id: string }) => void = () => undefined;
      mocked.createExpenseRequest.mockImplementation(
        () =>
          new Promise((resolve) => {
            releaseCreate = resolve;
          }),
      );
      mocked.sendExpenseEmail.mockResolvedValue(ACCEPTED);
      const onClose = vi.fn();
      renderModal({ onClose });
      await fillManualAndCheckSend();
      fireEvent.click(sendButton());
      // oluşturma henüz dönmedi: createdRequestId yok, düğme "İptal"
      fireEvent.click(screen.getByRole("button", { name: "İptal" }));
      fireEvent.click(xButton());
      fireEvent.click(backdrop());
      expect(onClose).not.toHaveBeenCalled();

      releaseCreate({ id: "talep-elle" });
      await screen.findByTestId("expense-send-result");
      expect(mocked.createExpenseRequest).toHaveBeenCalledTimes(1);
      expect(mocked.sendExpenseEmail).toHaveBeenCalledWith("talep-elle");
    });
  });

  it("kalemleri e-posta için geçersiz talep: 'belirsiz' DEĞİL, kesin başarısızlık; Yeniden Dene sunulmaz", async () => {
    mocked.sendExpenseEmail.mockResolvedValue({
      success: false,
      status: "EMAIL_NOT_SENT",
      reasonCode: "REQUEST_ITEMS_INVALID",
      message: "Masraf talebinde geçerli kalem ya da tutar yok; masraf e-postası gönderilmedi.",
      requiredInfo: ["Masraf talebinin kalemleri ve tutarları"],
      retryable: false,
    });
    renderModal();
    await fillManualAndCheckSend();
    fireEvent.click(sendButton());
    const box = await screen.findByTestId("expense-send-result");

    expect(box.getAttribute("data-state")).toBe("not-sent");
    expect(box.textContent).toContain("geçerli kalem ya da tutar yok");
    expect(box.textContent).toContain("bu pencereden yeniden denenemez");
    expect(box.textContent).not.toContain("doğrulanamadı");
    expect(screen.queryByRole("button", { name: "Yeniden Dene" })).toBeNull();
  });

  it("talep oluştuktan sonra form alanları kilitlenir (yeniden deneme o talebi gönderir)", async () => {
    mocked.sendExpenseEmail.mockResolvedValue(NOT_SENT_NO_SMTP);
    renderModal();
    await fillManualAndCheckSend();

    fireEvent.click(sendButton());
    await screen.findByTestId("expense-send-result");

    const amount = screen.getAllByRole("spinbutton")[0] as HTMLInputElement;
    expect(amount.closest("fieldset")?.disabled).toBe(true);
  });

  it("paket kipi: e-posta kutusu kapalı ve nedeni yazılı; 'Oluştur' talebi gönderimsiz oluşturur, gönderim denenmez", async () => {
    const onClose = vi.fn();
    renderModal({ initialPackageCode: "UYAP_PRE", onClose });
    await screen.findByText("Başvurma Harcı");

    const box = screen.getByLabelText(/Oluşturduktan sonra müvekkile e-posta gönder/) as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(box.checked).toBe(false);
    expect(screen.getByText(/Paket kipinde e-posta gönderimi bu pencerede henüz yapılamıyor/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Oluştur ve Gönder" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Oluştur" }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(mocked.createExpenseRequestFromPackage).toHaveBeenCalledTimes(1);
    expect(mocked.createExpenseRequestFromPackage.mock.calls[0][0]).toMatchObject({ packageCode: "UYAP_PRE", sendEmail: false });
    expect(mocked.sendExpenseEmail).not.toHaveBeenCalled();
    expect(mocked.sendExpenseRequest).not.toHaveBeenCalled();
  });

  it("elle kipte işaretlenen kutu paket kipine geçince gönderimi AÇMAZ (paket kipinde gönderim yok)", async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    await fillManualAndCheckSend(); // kutu işaretli, elle kip
    fireEvent.click(screen.getByRole("button", { name: "Paket Seç" }));
    await screen.findByText("Başvurma Harcı").catch(() => undefined);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "UYAP_PRE" } });
    await screen.findByText("Başvurma Harcı");

    expect((screen.getByLabelText(/Oluşturduktan sonra müvekkile e-posta gönder/) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Oluştur" }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(mocked.sendExpenseEmail).not.toHaveBeenCalled();
  });

  it("kutu işaretsizken 'Oluştur': gönderim denenmez, pencere eskisi gibi kapanır", async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    await waitFor(() => {
      expect(mocked.getExpenseCatalog).toHaveBeenCalled();
    });
    fireEvent.change(screen.getAllByRole("spinbutton")[0] as HTMLInputElement, { target: { value: "252" } });

    fireEvent.click(screen.getByRole("button", { name: "Oluştur" }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    expect(mocked.createExpenseRequest).toHaveBeenCalledTimes(1);
    expect(mocked.sendExpenseEmail).not.toHaveBeenCalled();
    expect(mocked.sendExpenseRequest).not.toHaveBeenCalled();
  });

  it("'Kendim karşıladım': gönderim denenmez (mevcut davranış)", async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    await waitFor(() => {
      expect(mocked.getExpenseCatalog).toHaveBeenCalled();
    });
    fireEvent.change(screen.getAllByRole("spinbutton")[0] as HTMLInputElement, { target: { value: "252" } });
    fireEvent.click(screen.getByLabelText(/Kendim karşıladım/));

    fireEvent.click(screen.getByRole("button", { name: "Karşıladım & Kaydet" }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(mocked.sendExpenseEmail).not.toHaveBeenCalled();
  });

  it("talep oluşturma başarısızsa uyarı verilir ve gönderim denenmez", async () => {
    mocked.createExpenseRequest.mockRejectedValue(new Error("Takip bulunamadı"));
    renderModal();
    await fillManualAndCheckSend();

    fireEvent.click(sendButton());
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith("Takip bulunamadı");
    });
    expect(mocked.sendExpenseEmail).not.toHaveBeenCalled();
    expect(screen.queryByTestId("expense-send-result")).toBeNull();
  });
});
