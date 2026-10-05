import { describe, it, expect } from "@jest/globals";
import { listenHost } from "../../src/config/listen";

describe("listenHost", () => {
  it("ecoute partout par defaut (le conteneur de prod en a besoin)", () => {
    expect(listenHost({})).toBe("0.0.0.0");
    expect(listenHost({ LISTEN_HOST: "  " })).toBe("0.0.0.0");
  });

  it("suit LISTEN_HOST (backend de dev : boucle locale seulement)", () => {
    expect(listenHost({ LISTEN_HOST: "127.0.0.1" })).toBe("127.0.0.1");
    expect(listenHost({ LISTEN_HOST: " ::1 " })).toBe("::1");
  });
});
