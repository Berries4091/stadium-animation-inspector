import { describe, expect, it } from "vitest";
import { detectFileKind } from "./romImport";

describe("detectFileKind", () => {
  it("recognizes DSM/PVDZ model files by their payload magic", () => {
    expect(detectFileKind("model.bin", bytes("DSM3"))).toBe("model");
    expect(detectFileKind("model.bin", bytes("PVDZ"))).toBe("model");
  });

  it("recognizes all supported N64 byte orders", () => {
    expect(detectFileKind("stadium.z64", bytes("\x80\x37\x12\x40"))).toBe("rom");
    expect(detectFileKind("stadium.v64", bytes("\x37\x80\x40\x12"))).toBe("rom");
    expect(detectFileKind("stadium.n64", bytes("\x40\x12\x37\x80"))).toBe("rom");
  });

  it("uses the extension for a ROM before bytes are available", () => {
    expect(detectFileKind("Pokemon Stadium (US).z64", new Uint8Array())).toBe("rom");
    expect(detectFileKind("notes.txt", new Uint8Array())).toBe("unknown");
  });
});

function bytes(value: string) {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}
