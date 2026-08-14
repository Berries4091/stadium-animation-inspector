import { lauxlib, lua, lualib, to_jsstring, to_luastring } from "fengari";
import noiseSource from "./vendor/stadium/Noise.lua?raw";
import stadiumBuildSource from "./vendor/stadium/StadiumBuild.lua?raw";
import stadiumFragmentSource from "./vendor/stadium/StadiumFragment.lua?raw";
import stadiumFxSource from "./vendor/stadium/StadiumFx.lua?raw";
import stadiumRomSource from "./vendor/stadium/StadiumRom.lua?raw";
import { STADIUM_LUA_COMPATIBILITY } from "./luaCompatibility";

type WorkerMessage =
  | { type: "open"; bytes: ArrayBuffer }
  | { type: "build"; requestId: number; species: number };

type PackedModel = { species: number; bytes: ArrayBuffer };

type WorkerResponse =
  | { type: "ready"; species: number[] }
  | { type: "built"; requestId: number; species: number; bytes: ArrayBuffer }
  | { type: "error"; requestId?: number; message: string };

type Runtime = {
  build(species: number): PackedModel;
  close(): void;
};

const N_POKEMON = 151;
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

function createRuntime(bytes: Uint8Array): Runtime {
  const packs: PackedModel[] = [];
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);

  const noop = () => 0;
  const requireModule = (current: any) => {
    const nameBytes = lua.lua_tostring(current, 1);
    const name = nameBytes instanceof Uint8Array ? to_jsstring(nameBytes) : "";
    const source = sources[name];
    if (!source) return lauxlib.luaL_error(current, to_luastring(`unknown Stadium module ${name}`));
    if (lauxlib.luaL_loadstring(current, to_luastring(source)) !== lua.LUA_OK) return lua.lua_error(current);
    lua.lua_getglobal(current, to_luastring("V"));
    if (lua.lua_pcall(current, 1, 1, 0) !== lua.LUA_OK) return lua.lua_error(current);
    return 1;
  };
  const writePack = (current: any) => {
    const species = lua.lua_tointeger(current, 1);
    const packed = lua.lua_tolstring(current, 2);
    if (!(packed instanceof Uint8Array)) {
      return lauxlib.luaL_error(current, to_luastring("extractor returned invalid DSM bytes"));
    }
    packs.push({ species, bytes: packed.slice().buffer });
    lua.lua_pushboolean(current, true);
    return 1;
  };

  lua.lua_newtable(state);
  lua.lua_pushjsfunction(state, requireModule);
  lua.lua_setfield(state, -2, to_luastring("require"));
  lua.lua_pushjsfunction(state, writePack);
  lua.lua_setfield(state, -2, to_luastring("write"));

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

  const initialize = `${STADIUM_LUA_COMPATIBILITY}
    local StadiumRom = V.require("StadiumRom")
    local StadiumBuild = V.require("StadiumBuild")
    local rom, err = StadiumRom.open(ROM_BYTES)
    if not rom then error(err or "not an N64 ROM") end
    if rom:modelCount() < StadiumRom.N_POKEMON then
      error("needs Pokemon Stadium US 1.0")
    end
    function V.build(species)
      local result, buildErr = StadiumBuild.species(rom, species - 1)
      if not result then error(buildErr or ("could not build species " .. species)) end
      if not V.write(result.species, result.bytes) then
        error("could not write species " .. result.species)
      end
      return true
    end
  `;

  try {
    const status = lauxlib.luaL_dostring(state, to_luastring(initialize));
    if (status !== lua.LUA_OK) throw new Error(errorMessage(state));
  } catch (cause) {
    lua.lua_close(state);
    throw cause;
  }

  return {
    build(species) {
      packs.length = 0;
      lua.lua_settop(state, 0);
      lua.lua_getglobal(state, to_luastring("V"));
      lua.lua_getfield(state, -1, to_luastring("build"));
      lua.lua_pushinteger(state, species);
      const status = lua.lua_pcall(state, 1, 1, 0);
      if (status !== lua.LUA_OK) {
        const message = errorMessage(state);
        lua.lua_settop(state, 0);
        throw new Error(message);
      }
      lua.lua_settop(state, 0);
      const pack = packs[0];
      if (!pack || packs.length !== 1) throw new Error("extractor returned an unexpected number of DSM packs");
      return pack;
    },
    close() {
      lua.lua_close(state);
    },
  };
}

let runtime: Runtime | null = null;

workerScope.onmessage = (event) => {
  const message = event.data;
  try {
    if (message.type === "open") {
      runtime?.close();
      runtime = createRuntime(new Uint8Array(message.bytes));
      workerScope.postMessage({
        type: "ready",
        species: Array.from({ length: N_POKEMON }, (_, index) => index + 1),
      });
      return;
    }

    if (!runtime) throw new Error("ROM is not open");
    if (!Number.isInteger(message.species) || message.species < 1 || message.species > N_POKEMON) {
      throw new Error(`invalid Pokemon species ${String(message.species)}`);
    }
    const pack = runtime.build(message.species);
    workerScope.postMessage(
      { type: "built", requestId: message.requestId, species: pack.species, bytes: pack.bytes },
      [pack.bytes],
    );
  } catch (cause) {
    workerScope.postMessage({
      type: "error",
      ...(message.type === "build" ? { requestId: message.requestId } : {}),
      message: cause instanceof Error ? cause.message : "ROM extraction failed.",
    });
  }
};
