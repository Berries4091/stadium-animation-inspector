import { describe, expect, it } from "vitest";
import {
  closeImportedSession,
  detectFileKind,
  fetchImportedModel,
  importStadiumRom,
} from "./romImport";

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

  it("opens a ROM session immediately and caches built model packs", async () => {
    const originalWorker = globalThis.Worker;
    const workers: FakeWorker[] = [];
    (globalThis as unknown as { Worker: typeof Worker }).Worker = class extends FakeWorker {
      constructor() {
        super();
        workers.push(this);
      }
    } as typeof Worker;

    try {
      const session = await importStadiumRom(new ArrayBuffer(4));
      expect(session.models).toHaveLength(151);
      expect(session.models[24]).toEqual({ species: 25, filename: "025.dsm" });

      const first = await fetchImportedModel(session.sessionId, 25);
      const second = await fetchImportedModel(session.sessionId, 25);
      expect(first).not.toBe(second);
      expect(new Uint8Array(first)).toEqual(new Uint8Array([0x44, 0x53, 0x4d, 0x33]));
      expect(workers[0].messages.filter((message) => message.type === "build")).toHaveLength(1);

      closeImportedSession(session.sessionId);
      expect(workers[0].terminated).toBe(true);
    } finally {
      globalThis.Worker = originalWorker;
    }
  });
});

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  messages: Array<{ type: string; requestId?: number; species?: number }> = [];
  terminated = false;

  postMessage(message: { type: string; requestId?: number; species?: number }) {
    this.messages.push(message);
    if (message.type === "open") {
      this.onmessage?.({ data: { type: "ready", species: Array.from({ length: 151 }, (_, index) => index + 1) } } as MessageEvent);
      return;
    }
    this.onmessage?.({
      data: {
        type: "built",
        requestId: message.requestId,
        species: message.species,
        bytes: Uint8Array.from([0x44, 0x53, 0x4d, 0x33]).buffer,
      },
    } as MessageEvent);
  }

  terminate() {
    this.terminated = true;
  }
}

function bytes(value: string) {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}
