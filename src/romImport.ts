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
  worker: Worker;
  packs: Map<number, ArrayBuffer>;
  pending: Map<number, { resolve: (bytes: ArrayBuffer) => void; reject: (cause: unknown) => void }>;
  nextRequestId: number;
};

type RomWorkerResponse =
  | { type: "ready"; species: number[] }
  | { type: "built"; requestId: number; species: number; bytes: ArrayBuffer }
  | { type: "error"; requestId?: number; message?: string };

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
    let session: BrowserSession | null = null;
    let settled = false;

    const fail = (cause: unknown) => {
      const error = cause instanceof Error ? cause : new Error("ROM extraction failed.");
      if (!settled) {
        settled = true;
        worker.terminate();
        reject(error);
      }
      if (session) {
        for (const pending of session.pending.values()) pending.reject(error);
        session.pending.clear();
      }
    };

    worker.onmessage = (event: MessageEvent<RomWorkerResponse>) => {
      if (event.data.type === "ready") {
        const species = event.data.species || [];
        const models = species
          .map((value) => ({ species: value, filename: `${String(value).padStart(3, "0")}.dsm` }))
          .sort((a, b) => a.species - b.species);
        session = {
          sessionId: newSessionId(),
          models,
          worker,
          packs: new Map(),
          pending: new Map(),
          nextRequestId: 1,
        };
        browserSessions.set(session.sessionId, session);
        settled = true;
        onProgress?.(0, models.length || 151);
        resolve({ sessionId: session.sessionId, models });
        return;
      }

      if (event.data.type === "built") {
        if (!session) return;
        const pending = session.pending.get(event.data.requestId);
        if (!pending) return;
        session.pending.delete(event.data.requestId);
        session.packs.set(event.data.species, event.data.bytes);
        pending.resolve(event.data.bytes.slice(0));
        return;
      }

      if (event.data.requestId !== undefined && session) {
        const pending = session.pending.get(event.data.requestId);
        if (pending) {
          session.pending.delete(event.data.requestId);
          pending.reject(new Error(event.data.message || "ROM model build failed."));
        }
        return;
      }

      fail(new Error(event.data.message || "ROM extraction failed."));
    };
    worker.onerror = (event) => {
      fail(new Error(event.message || "ROM extraction failed."));
    };
    worker.postMessage({ type: "open", bytes }, [bytes]);
  });
}

export async function fetchImportedModel(sessionId: string, species: number) {
  const session = browserSessions.get(sessionId);
  if (!session) throw new Error("The imported ROM session is no longer available.");
  const pack = session.packs.get(species);
  if (pack) return pack.slice(0);

  const requestId = session.nextRequestId++;
  return new Promise<ArrayBuffer>((resolve, reject) => {
    session.pending.set(requestId, { resolve, reject });
    try {
      session.worker.postMessage({ type: "build", requestId, species });
    } catch (cause) {
      session.pending.delete(requestId);
      reject(cause);
    }
  });
}

export function closeImportedSession(sessionId: string) {
  const session = browserSessions.get(sessionId);
  if (!session) return;
  const error = new Error("The imported ROM session was closed.");
  for (const pending of session.pending.values()) pending.reject(error);
  session.pending.clear();
  session.worker.terminate();
  browserSessions.delete(sessionId);
}
