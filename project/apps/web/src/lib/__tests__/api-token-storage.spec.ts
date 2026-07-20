import { describe, it, expect, beforeEach } from "vitest";
import { api } from "@/lib/api";

/**
 * OFFICE-AUTH-P01 — merkezi token depolama: "Beni hatırla" işaretsizse yalnız
 * sessionStorage (tarayıcı kapanınca kaybolur), işaretliyse yalnız localStorage
 * (mevcut 7 günlük JWT). Aynı token iki storage'a birden yazılmaz. Logout ikisini
 * de temizler. `api` gerçek üretim singleton'ı — jsdom'un gerçek storage API'lerine
 * karşı test edilir (mock değil).
 */
describe("api token storage — OFFICE-AUTH-P01 Remember Me", () => {
  beforeEach(() => {
    api.clearToken();
  });

  it("[1] persist=false (Beni hatırla işaretsiz) → yalnız sessionStorage'da, localStorage boş", () => {
    api.setToken("session-only-token", false);
    expect(sessionStorage.getItem("token")).toBe("session-only-token");
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("[2] persist=true (Beni hatırla işaretli) → yalnız localStorage'da, sessionStorage boş", () => {
    api.setToken("persistent-token", true);
    expect(localStorage.getItem("token")).toBe("persistent-token");
    expect(sessionStorage.getItem("token")).toBeNull();
  });

  it("[3] persist parametresi verilmezse varsayılan true (mevcut/geri-uyumlu davranış)", () => {
    api.setToken("default-token");
    expect(localStorage.getItem("token")).toBe("default-token");
    expect(sessionStorage.getItem("token")).toBeNull();
  });

  it("[4] aynı token iki storage'a birden yazılmaz — persist=false'tan true'ya geçiş eskiyi temizler", () => {
    api.setToken("first-token", false);
    expect(sessionStorage.getItem("token")).toBe("first-token");
    api.setToken("second-token", true);
    expect(sessionStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("token")).toBe("second-token");
  });

  it("[5] persist=true'dan false'a geçiş de eskiyi temizler (ters yön)", () => {
    api.setToken("first-token", true);
    expect(localStorage.getItem("token")).toBe("first-token");
    api.setToken("second-token", false);
    expect(localStorage.getItem("token")).toBeNull();
    expect(sessionStorage.getItem("token")).toBe("second-token");
  });

  it("[6] clearToken() (logout) her iki storage'ı da temizler", () => {
    api.setToken("to-be-cleared", true);
    expect(localStorage.getItem("token")).toBe("to-be-cleared");
    api.clearToken();
    expect(localStorage.getItem("token")).toBeNull();
    expect(sessionStorage.getItem("token")).toBeNull();
  });

  it("[7] 'Beni hatırla' işaretsiz oturum — tarayıcı kapanma simülasyonu (sessionStorage temizlenir) sonrası kalıcı değil", () => {
    api.setToken("ephemeral-token", false);
    expect(sessionStorage.getItem("token")).toBe("ephemeral-token");
    // Gerçek tarayıcıda sekme/tarayıcı kapanınca sessionStorage otomatik temizlenir;
    // burada bunu doğrudan simüle ediyoruz. localStorage'a HİÇ yazılmadığı için
    // (persist=false), bu "oturum" hiçbir kalıcı depoda hayatta kalmaz.
    sessionStorage.clear();
    expect(sessionStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("token")).toBeNull();
  });
});
