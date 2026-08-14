import { describe, expect, it } from "vitest";
import { formatModelBuildFailure } from "./romErrors";

describe("ROM model build errors", () => {
  it("includes the first model error in the browser-facing message", () => {
    expect(formatModelBuildFailure(151, 151, "attempt to call a nil value"))
      .toBe("all 151 model files failed: attempt to call a nil value");
  });

  it("falls back cleanly when Lua does not provide an error detail", () => {
    expect(formatModelBuildFailure(2, 151, undefined))
      .toBe("2 of 151 model files could not be built: unknown model build error");
  });
});
