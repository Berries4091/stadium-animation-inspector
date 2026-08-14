export type FileKind = "model" | "rom" | "unknown";

export type ImportedModel = {
  species: number;
  filename: string;
};

export type ImportedSession = {
  sessionId: string;
  models: ImportedModel[];
};

const MODEL_MAGICS = ["DSM3", "PVDZ"];
const ROM_MAGICS = [
  new Uint8Array([0x80, 0x37, 0x12, 0x40]),
  new Uint8Array([0x37, 0x80, 0x40, 0x12]),
  new Uint8Array([0x40, 0x12, 0x37, 0x80]),
];

type BrowserSession = ImportedSession & {
  packs: Map<number, ArrayBuffer>;
};

const browserSessions = new Map<string, BrowserSession>();

function startsWithText(bytes: Uint8Array, text: string) {
  return text.split("").every((character, index) => bytes[index] === character.charCodeAt(0));
}

function startsWithBytes(bytes: Uint8Array, prefix: Uint8Array) {
  return prefix.every((value, index) => bytes[index] === value);
}

export function detectFileKind(filename: string, bytes: Uint8Array): FileKind {
  if (MODEL_MAGICS.some((magic) => startsWithText(bytes, magic))) return "model";
  if (ROM_MAGICS.some((magic) => startsWithBytes(bytes, magic))) return "rom";
  if (/\.(z64|n64|v64)$/i.test(filename)) return "rom";
  return "unknown";
}

function newSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `stadium-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function importStadiumRom(bytes: ArrayBuffer, onProgress?: (done: number, total: number) => void) {
  return new Promise<ImportedSession>((resolve, reject) => {
    const worker = new Worker(new URL("./romWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{
      type: "progress" | "done" | "error";
      done?: number;
      total?: number;
      message?: string;
      packs?: Array<{ species: number; bytes: ArrayBuffer }>;
    }>) => {
      if (event.data.type === "progress") {
        onProgress?.(event.data.done || 0, event.data.total || 151);
        return;
      }
      worker.terminate();
      if (event.data.type === "error") {
        reject(new Error(event.data.message || "ROM extraction failed."));
        return;
      }
      const packs = event.data.packs || [];
      const sessionId = newSessionId();
      const models = packs
        .map(({ species }) => ({ species, filename: `${String(species).padStart(3, "0")}.dsm` }))
        .sort((a, b) => a.species - b.species);
      browserSessions.set(sessionId, {
        sessionId,
        models,
        packs: new Map(packs.map(({ species, bytes: pack }) => [species, pack])),
      });
      resolve({ sessionId, models });
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "ROM extraction failed."));
    };
    worker.postMessage({ bytes }, [bytes]);
  });
}

export async function fetchImportedModel(sessionId: string, species: number) {
  const session = browserSessions.get(sessionId);
  const pack = session?.packs.get(species);
  if (!pack) throw new Error(`Could not load model #${String(species).padStart(3, "0")}.`);
  return pack.slice(0);
}
