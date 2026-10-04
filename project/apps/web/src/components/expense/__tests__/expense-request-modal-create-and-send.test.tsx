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
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    // talep oluştu: dosya verisi yenilensin
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
    fireEvent.click(button);
    fireEvent.click(button); // ilk istek sürerken ikinci tıklama
    fireEvent.click(button);
    releaseCreate({ id: "talep-elle" });
    await screen.findByTestId("expense-send-result");

    expect(mocked.createExpenseRequest).toHaveBeenCalledTimes(1);
    expect(mocked.sendExpenseEmail).toHaveBeenCalledTimes(1);
  });

  it("gönderim sürerken (yanıtsız SMTP) ikinci tıklama ikinci gönderim üretmez", async () => {
    let releaseSend: (v: unknown) => void = () => undefined;
    mocked.sendExpenseEmail.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseSend = resolve;
        }),
    );
    renderModal();
    await fillManualAndCheckSend();

    fireEvent.click(sendButton());
    await waitFor(() => {
      expect(mocked.sendExpenseEmail).toHaveBeenCalledTimes(1);
    });
    // sürerken düğme devre dışı; zorla tıklansa da ikinci istek gitmez
    const pending = screen.getAllByRole("button").find((b) => (b as HTMLButtonElement).disabled && /\S/.test(b.textContent ?? "") === false);
    if (pending) fireEvent.click(pending);
    expect(mocked.sendExpenseEmail).toHaveBeenCalledTimes(1);
    releaseSend(ACCEPTED);
    await screen.findByTestId("expense-send-result");
    expect(mocked.createExpenseRequest).toHaveBeenCalledTimes(1);
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

  it("paket kipi: talep gönderimsiz oluşturulur (sendEmail:false), sonra gerçek gönderim aynı talepte çağrılır", async () => {
    mocked.sendExpenseEmail.mockResolvedValue(ACCEPTED);
    renderModal({ initialPackageCode: "UYAP_PRE" });
    await screen.findByText("Başvurma Harcı");
    fireEvent.click(screen.getByLabelText("Oluşturduktan sonra müvekkile e-posta gönder"));

    fireEvent.click(sendButton());
    await screen.findByTestId("expense-send-result");

    expect(mocked.createExpenseRequestFromPackage).toHaveBeenCalledTimes(1);
    expect(mocked.createExpenseRequestFromPackage.mock.calls[0][0]).toMatchObject({ packageCode: "UYAP_PRE", sendEmail: false });
    expect(mocked.sendExpenseEmail).toHaveBeenCalledWith("talep-paket");
    expect(mocked.sendExpenseRequest).not.toHaveBeenCalled();
  });

  it("paket kipi: gönderim başarısızsa talep kaybolmaz, yeniden deneme paket talebini bir daha oluşturmaz", async () => {
    mocked.sendExpenseEmail.mockResolvedValueOnce(NOT_SENT_NO_SMTP).mockResolvedValueOnce(ACCEPTED);
    renderModal({ initialPackageCode: "UYAP_PRE" });
    await screen.findByText("Başvurma Harcı");
    fireEvent.click(screen.getByLabelText("Oluşturduktan sonra müvekkile e-posta gönder"));

    fireEvent.click(sendButton());
    await screen.findByTestId("expense-send-result");
    fireEvent.click(screen.getByRole("button", { name: "Yeniden Dene" }));
    await waitFor(() => {
      expect(resultBox().getAttribute("data-state")).toBe("accepted");
    });

    expect(mocked.createExpenseRequestFromPackage).toHaveBeenCalledTimes(1);
    expect(mocked.sendExpenseEmail.mock.calls.map((c) => c[0])).toEqual(["talep-paket", "talep-paket"]);
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
