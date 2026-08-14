import { lauxlib, lua, lualib, to_jsstring, to_luastring } from "fengari";
import noiseSource from "./vendor/stadium/Noise.lua?raw";
import stadiumBuildSource from "./vendor/stadium/StadiumBuild.lua?raw";
import stadiumFragmentSource from "./vendor/stadium/StadiumFragment.lua?raw";
import stadiumFxSource from "./vendor/stadium/StadiumFx.lua?raw";
import stadiumRomSource from "./vendor/stadium/StadiumRom.lua?raw";
import { STADIUM_LUA_COMPATIBILITY } from "./luaCompatibility";
import { formatModelBuildFailure } from "./romErrors";

type WorkerMessage = { bytes: ArrayBuffer };
type WorkerResponse =
  | { type: "progress"; done: number; total: number }
  | { type: "done"; packs: Array<{ species: number; bytes: ArrayBuffer }> }
  | { type: "error"; message: string };

const sources: Record<string, string> = {
  Noise: noiseSource,
  StadiumRom: stadiumRomSource,
  StadiumFragment: stadiumFragmentSource,
  StadiumFx: stadiumFxSource,
  StadiumBuild: stadiumBuildSource,
};

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
};

function errorMessage(state: any) {
  const message = lua.lua_tostring(state, -1);
  return message instanceof Uint8Array ? to_jsstring(message) : String(message || "Lua extraction failed.");
}

function runExtraction(bytes: Uint8Array) {
  const packs: Array<{ species: number; bytes: ArrayBuffer }> = [];
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);

  const noop = () => 0;
  const requireModule = (current: any) => {
    const nameBytes = lua.lua_tostring(current, 1);
    const name = nameBytes instanceof Uint8Array ? to_jsstring(nameBytes) : "";
    const source = sources[name];
    if (!source) return lauxlib.luaL_error(current, to_luastring(`unknown Stadium module ${name}`));
    if (lauxlib.luaL_loadstring(current, to_luastring(source)) !== lua.LUA_OK) return lauxlib.lua_error(current);
    lua.lua_getglobal(current, to_luastring("V"));
    if (lua.lua_pcall(current, 1, 1, 0) !== lua.LUA_OK) return lauxlib.lua_error(current);
    return 1;
  };
  const writePack = (current: any) => {
    const species = lua.lua_tointeger(current, 1);
    const packed = lua.lua_tolstring(current, 2);
    if (!(packed instanceof Uint8Array)) return lauxlib.luaL_error(current, to_luastring("extractor returned invalid DSM bytes"));
    packs.push({ species, bytes: packed.slice().buffer });
    return 0;
  };
  const reportProgress = (current: any) => {
    const done = lua.lua_tointeger(current, 1);
    const total = lua.lua_tointeger(current, 2);
    workerScope.postMessage({ type: "progress", done, total });
    return 0;
  };
  const reportFailure = (current: any) => {
    const failed = lua.lua_tointeger(current, 1);
    const total = lua.lua_tointeger(current, 2);
    const detailBytes = lua.lua_tostring(current, 3);
    const detail = detailBytes instanceof Uint8Array ? to_jsstring(detailBytes) : undefined;
    const message = formatModelBuildFailure(failed, total, detail);
    return lauxlib.luaL_error(current, to_luastring("%s"), to_luastring(message));
  };

  lua.lua_newtable(state);
  lua.lua_pushjsfunction(state, requireModule);
  lua.lua_setfield(state, -2, to_luastring("require"));
  lua.lua_pushjsfunction(state, writePack);
  lua.lua_setfield(state, -2, to_luastring("write"));
  lua.lua_pushjsfunction(state, reportProgress);
  lua.lua_setfield(state, -2, to_luastring("progress"));
  lua.lua_pushjsfunction(state, reportFailure);
  lua.lua_setfield(state, -2, to_luastring("reportFailure"));

  lua.lua_newtable(state);
  lua.lua_newtable(state);
  lua.lua_pushjsfunction(state, noop);
  lua.lua_setfield(state, -2, to_luastring("warn"));
  lua.lua_pushjsfunction(state, noop);
  lua.lua_setfield(state, -2, to_luastring("info"));
  lua.lua_setfield(state, -2, to_luastring("log"));
  lua.lua_setfield(state, -2, to_luastring("mod"));
  lua.lua_setglobal(state, to_luastring("V"));

  lua.lua_pushlstring(state, bytes, bytes.length);
  lua.lua_setglobal(state, to_luastring("ROM_BYTES"));

  const script = `${STADIUM_LUA_COMPATIBILITY}
    local StadiumRom = V.require("StadiumRom")
    local StadiumBuild = V.require("StadiumBuild")
    local rom, err = StadiumRom.open(ROM_BYTES)
    if not rom then error(err or "not an N64 ROM") end
    if rom:modelCount() < StadiumRom.N_POKEMON then
      error("needs Pokemon Stadium US 1.0")
    end
    local job = StadiumBuild.job(rom, V.write, StadiumRom.N_POKEMON)
    while job:step() do V.progress(job.done, job.total) end
    V.progress(job.done, job.total)
    if #job.failed > 0 then V.reportFailure(#job.failed, job.total, job.lastError) end
  `;
  const status = lauxlib.luaL_dostring(state, to_luastring(script));
  if (status !== lua.LUA_OK) throw new Error(errorMessage(state));
  return packs;
}

workerScope.onmessage = (event) => {
  try {
    const packs = runExtraction(new Uint8Array(event.data.bytes));
    workerScope.postMessage(
      { type: "done", packs },
      packs.map((pack) => pack.bytes),
    );
  } catch (cause) {
    workerScope.postMessage({ type: "error", message: cause instanceof Error ? cause.message : "ROM extraction failed." });
  }
};
