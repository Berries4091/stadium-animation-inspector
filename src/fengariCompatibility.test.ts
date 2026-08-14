import { describe, expect, it } from "vitest";
import { lauxlib, lua, lualib, to_luastring } from "fengari";
import { STADIUM_LUA_COMPATIBILITY } from "./luaCompatibility";

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
});
