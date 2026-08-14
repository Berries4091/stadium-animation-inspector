import { describe, expect, it } from "vitest";
import { GEN1_POKEMON, pokemonName, pokemonSpriteUrl } from "./pokemon";

describe("Gen 1 Pokemon metadata", () => {
  it("contains the complete National Pokedex range", () => {
    expect(GEN1_POKEMON).toHaveLength(151);
    expect(GEN1_POKEMON[0]).toEqual({ species: 1, name: "Bulbasaur" });
    expect(GEN1_POKEMON[24]).toEqual({ species: 25, name: "Pikachu" });
    expect(GEN1_POKEMON[150]).toEqual({ species: 151, name: "Mew" });
  });

  it("formats matching SpriteCollab idle sprite URLs", () => {
    expect(pokemonSpriteUrl(1)).toBe(
      "https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite/0001/Idle-Anim.png",
    );
    expect(pokemonSpriteUrl(151)).toContain("/0151/Idle-Anim.png");
  });

  it("provides a readable fallback for unknown species", () => {
    expect(pokemonName(25)).toBe("Pikachu");
    expect(pokemonName(999)).toBe("#999");
  });
});
