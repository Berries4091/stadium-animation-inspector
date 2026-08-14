import { readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const nodeProcess = globalThis.process;
const romPath = nodeProcess.argv[2];

if (!romPath) {
  console.error("Usage: npm run self-test -- /path/to/Pokemon-Stadium.z64");
  nodeProcess.exitCode = 2;
} else {
  const rom = await readFile(romPath);
  const workerAsset = (await readdir("./dist/assets")).find(
    (name) => name.startsWith("romWorker-") && name.endsWith(".js"),
  );

  if (!workerAsset) {
    throw new Error("No built ROM worker found. Run npm run build first.");
  }

  let response;
  let lastProgress = 0;
  globalThis.self = {
    postMessage(message) {
      if (message.type === "progress") {
        lastProgress = message.done;
        if (message.done === message.total || message.done % 25 === 0) {
          nodeProcess.stdout.write(`ROM self-test: ${message.done}/${message.total}\n`);
        }
      } else {
        response = message;
      }
    },
  };

  // Match the browser runtime that previously exposed the Fengari failure.
  globalThis.process = undefined;
  await import(pathToFileURL(`./dist/assets/${workerAsset}`).href);
  self.onmessage({
    data: {
      bytes: rom.buffer.slice(rom.byteOffset, rom.byteOffset + rom.byteLength),
    },
  });

  if (response?.type === "error") {
    throw new Error(response.message);
  }
  if (response?.type !== "done" || response.packs.length !== 151 || lastProgress !== 151) {
    throw new Error(`ROM self-test produced an unexpected result: ${JSON.stringify(response)}`);
  }

  nodeProcess.stdout.write(`ROM self-test passed: ${response.packs.length} model packs built.\n`);
}
