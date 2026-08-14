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
  globalThis.self = {
    postMessage(message) {
      response = message;
    },
  };

  // Match the browser runtime that previously exposed the Fengari failure.
  globalThis.process = undefined;
  await import(pathToFileURL(`./dist/assets/${workerAsset}`).href);

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
  if (ready?.type !== "ready" || ready.species.length !== 151) {
    throw new Error(`ROM self-test did not produce a 151-species ready response: ${JSON.stringify(ready)}`);
  }

  for (const species of [1, 25, 151]) {
    const built = send({ type: "build", requestId: species, species });
    if (built?.type !== "built" || built.requestId !== species || built.species !== species) {
      throw new Error(`ROM self-test produced an unexpected build response: ${JSON.stringify(built)}`);
    }
    const magic = new TextDecoder().decode(new Uint8Array(built.bytes, 0, 4));
    if (magic !== "DSM3") throw new Error(`ROM self-test produced an invalid DSM for species ${species}`);
    nodeProcess.stdout.write(`ROM self-test: built ${String(species).padStart(3, "0")}\n`);
  }

  nodeProcess.stdout.write("ROM self-test passed: ROM opened and three models built on demand.\n");
}
