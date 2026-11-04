import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("application document", () => {
  it("sends the Kunini auth cookie when the browser loads the web app manifest", () => {
    const document = readFileSync(new URL("../index.html", import.meta.url), "utf8");

    expect(document).toMatch(
      /<link\s+rel="manifest"\s+href="\/manifest\.webmanifest"\s+crossorigin="use-credentials"\s*\/>/,
    );
  });
});
