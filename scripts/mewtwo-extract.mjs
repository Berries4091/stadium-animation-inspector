import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const processRef = globalThis.process;
const romPath = processRef.argv[2];
const outputPath = resolve(processRef.argv[3] ?? "mewtwo-150.dsm");
if (!romPath) {
  console.error("Usage: node scripts/mewtwo-extract.mjs /path/to/Stadium.z64 [output.dsm]");
  processRef.exit(2);
}
const rom = await readFile(romPath);
const workerAsset = (await readdir("./dist/assets")).find(
  (name) => name.startsWith("romWorker-") && name.endsWith(".js"),
);
if (!workerAsset) throw new Error("No ROM worker. Run npm ci && npm run build first.");
let response;
globalThis.self = { postMessage(message) { response = message; } };
globalThis.process = undefined;
try {
  await import(pathToFileURL(resolve("./dist/assets", workerAsset)).href);
  function send(data) {
    response = undefined;
    self.onmessage({ data });
    if (response?.type === "error") throw new Error(response.message);
    return response;
  }
  const ready = send({
    type: "open",
    bytes: rom.buffer.slice(rom.byteOffset, rom.byteOffset + rom.byteLength),
  });
  if (ready?.type !== "ready" || !ready.species.includes(150)) {
    throw new Error("ROM was not accepted by Stadium worker");
  }
  const built = send({ type: "build", requestId: 150, species: 150 });
  if (built?.type !== "built" || built.species !== 150 || built.requestId !== 150) {
    throw new Error("Unexpected model response");
  }
  const bytes = new Uint8Array(built.bytes);
  if (bytes.length < 20 || new TextDecoder().decode(bytes.subarray(0, 4)) !== "DSM3") {
    throw new Error("Invalid DSM3 header");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(4, true) !== 150) throw new Error("Unexpected DSM3 species ID");
  if (view.getUint16(6, true) === 0 || view.getUint16(8, true) === 0) {
    throw new Error("No bones or geometry primitives in DSM3");
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes, { flag: "wx" });
  processRef.stdout.write(JSON.stringify({
    file: outputPath,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    species: 150,
    boneCount: view.getUint16(6, true),
    primitiveCount: view.getUint16(8, true),
  }, null, 2) + "\n");
} finally {
  globalThis.process = processRef;
}
