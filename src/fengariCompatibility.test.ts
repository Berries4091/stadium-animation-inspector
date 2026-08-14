import { describe, expect, it } from "vitest";
import { lauxlib, lua, lualib, to_jsstring, to_luastring } from "fengari";
import { STADIUM_LUA_COMPATIBILITY } from "./luaCompatibility";
import stadiumFragmentSource from "./vendor/stadium/StadiumFragment.lua?raw";
import stadiumRomSource from "./vendor/stadium/StadiumRom.lua?raw";

describe("Fengari Stadium compatibility", () => {
  it("provides the frexp function required by the Stadium packer", () => {
    const state = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(state);
    expect(lauxlib.luaL_dostring(state, to_luastring(STADIUM_LUA_COMPATIBILITY))).toBe(lua.LUA_OK);
    const status = lauxlib.luaL_dostring(
      state,
      to_luastring(`
        assert(math.frexp ~= nil, "math.frexp is required by StadiumBuild")
        local mantissa, exponent = math.frexp(8)
        assert(mantissa == 0.5 and exponent == 4, "math.frexp returned the wrong result")
      `),
    );
    expect(status).toBe(lua.LUA_OK);
  });

  it("keeps Yay0 mask arithmetic working with Fengari's signed integers", () => {
    const state = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(state);
    expect(lauxlib.luaL_loadstring(state, to_luastring(stadiumRomSource))).toBe(lua.LUA_OK);
    expect(lua.lua_pcall(state, 0, 1, 0)).toBe(lua.LUA_OK);
    lua.lua_getfield(state, -1, to_luastring("yay0"));
    lua.lua_pushlstring(
      state,
      Uint8Array.from([
        0x59, 0x61, 0x79, 0x30,
        0x00, 0x00, 0x00, 0x04,
        0x00, 0x00, 0x00, 0x14,
        0x00, 0x00, 0x00, 0x14,
        0xf0, 0x00, 0x00, 0x00,
        0x74, 0x65, 0x73, 0x74,
      ]),
      24,
    );
    expect(lua.lua_pcall(state, 1, 1, 0)).toBe(lua.LUA_OK);
    const result = lua.lua_tolstring(state, -1);
    expect(result instanceof Uint8Array ? to_jsstring(result) : result).toBe("test");
  });

  it("uses the previous byte as the origin of a Yay0 backreference", () => {
    const state = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(state);
    expect(lauxlib.luaL_loadstring(state, to_luastring(stadiumRomSource))).toBe(lua.LUA_OK);
    expect(lua.lua_pcall(state, 0, 1, 0)).toBe(lua.LUA_OK);
    lua.lua_getfield(state, -1, to_luastring("yay0"));
    lua.lua_pushlstring(
      state,
      Uint8Array.from([
        0x59, 0x61, 0x79, 0x30,
        0x00, 0x00, 0x00, 0x04,
        0x00, 0x00, 0x00, 0x14,
        0x00, 0x00, 0x00, 0x16,
        0x80, 0x00, 0x00, 0x00,
        0x10, 0x00,
        0x61,
      ]),
      23,
    );
    expect(lua.lua_pcall(state, 1, 1, 0)).toBe(lua.LUA_OK);
    const result = lua.lua_tolstring(state, -1);
    expect(result instanceof Uint8Array ? to_jsstring(result) : result).toBe("aaaa");
  });

  it("resolves segmented display-list pointers in Stadium fragments", () => {
    const state = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(state);
    expect(lauxlib.luaL_loadstring(state, to_luastring(stadiumFragmentSource))).toBe(lua.LUA_OK);
    expect(lua.lua_pcall(state, 0, 1, 0)).toBe(lua.LUA_OK);
    lua.lua_setglobal(state, to_luastring("StadiumFragment"));
    const status = lauxlib.luaL_dostring(
      state,
      to_luastring(`
        local data = string.rep("\\0", 8) .. "FRAGMENT" .. string.rep("\\0", 8)
          .. string.char(0xdf, 0, 0, 0) .. string.rep("\\0", 4)
        local frag = assert(StadiumFragment.open(data, "test.bin"))
        assert(frag:off(0x00900c00) == 0x0c00, "segmented pointer was not resolved")
        assert(frag:off(0x01300100) == 0x0100, "segment 0x13 pointer was not resolved")
        assert(frag:off(2 ^ 31 + 0x0ff18340) == 0x18340, "virtual pointer was not resolved")
        assert(frag:u32(24) == 3741319168, "u32 did not stay unsigned")
      `),
    );
    expect(status).toBe(lua.LUA_OK);
  });
});
