import { describe, it, expect } from "@jest/globals";
import { logDirectory } from "../../src/utils/logger";

describe("logDirectory", () => {
  it("garde logs/ par defaut (dossier monte dans le conteneur de prod)", () => {
    expect(logDirectory({})).toBe("logs");
    expect(logDirectory({ LOG_DIR: "" })).toBe("logs");
  });

  it("suit LOG_DIR (backend de dev : ses journaux a part)", () => {
    expect(logDirectory({ LOG_DIR: "/var/log/blindz-dev-back" })).toBe("/var/log/blindz-dev-back");
  });
});
