import { useState } from "react";
import { pokemonName, pokemonSpriteUrl } from "./pokemon";
import type { ImportedModel } from "./romImport";

type PokemonSelectorProps = {
  models: ImportedModel[];
  selectedSpecies: number | null;
  loadingSpecies: number | null;
  onSelect: (species: number) => void;
};

export default function PokemonSelector({
  models,
  selectedSpecies,
  loadingSpecies,
  onSelect,
}: PokemonSelectorProps) {
  const [failedImages, setFailedImages] = useState<Record<number, boolean>>({});

  return (
    <section className="pokemon-selector" aria-label="Choose a Pokémon model">
      <div className="pokemon-grid">
        {models.map((model) => {
          const name = pokemonName(model.species);
          const loading = loadingSpecies === model.species;
          const disabled = loadingSpecies !== null && !loading;
          const number = String(model.species).padStart(3, "0");
          return (
            <button
              className={`pokemon-card${selectedSpecies === model.species ? " selected" : ""}${loading ? " loading" : ""}`}
              disabled={disabled}
              key={model.species}
              type="button"
              aria-label={`Load ${name}`}
              aria-pressed={selectedSpecies === model.species}
              onClick={() => onSelect(model.species)}
            >
              <span className="pokemon-sprite">
                {failedImages[model.species] ? (
                  <span className="pokemon-sprite-fallback">#{number}</span>
                ) : (
                  <img
                    alt={`${name} sprite`}
                    loading="lazy"
                    src={pokemonSpriteUrl(model.species)}
                    onError={() => setFailedImages((current) => ({ ...current, [model.species]: true }))}
                  />
                )}
                {loading && <span className="pokemon-card-spinner" aria-hidden="true" />}
              </span>
              <span className="pokemon-card-number">#{number}</span>
              <strong>{name}</strong>
            </button>
          );
        })}
      </div>
      <p className="sprite-attribution">
        Sprites from <a href="https://github.com/PMDCollab/SpriteCollab" target="_blank" rel="noreferrer">SpriteCollab</a>.
      </p>
    </section>
  );
}
