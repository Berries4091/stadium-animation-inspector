import { useMemo, useState } from "react";
import { CONTEXT_NAMES } from "./dsm/format";
import type { DsmModel } from "./dsm/format";
import { parseDsm } from "./dsm/parser";
import { buildAnimationReport } from "./report";
import {
  detectFileKind,
  fetchImportedModel,
  importStadiumRom,
} from "./romImport";
import type { ImportedSession } from "./romImport";
import ModelViewport from "./scene/ModelViewport";

type LoadedPack = {
  model: DsmModel;
  filename: string;
  bytes: number;
};

const SPEEDS = [0.25, 0.5, 1, 2];
const MODEL_ACCEPT = ".dsm,application/octet-stream";
const ROM_ACCEPT = ".z64,.n64,.v64,application/octet-stream";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function animationContextNames(model: DsmModel, animationIndex: number) {
  return CONTEXT_NAMES.filter((_, slot) => model.ctx[slot] === animationIndex);
}

export default function App() {
  const [loaded, setLoaded] = useState<LoadedPack | null>(null);
  const [romSession, setRomSession] = useState<ImportedSession | null>(null);
  const [selectedSpecies, setSelectedSpecies] = useState<number | null>(null);
  const [animationIndex, setAnimationIndex] = useState(0);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [showWireframe, setShowWireframe] = useState(false);
  const [showBones, setShowBones] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [romStatus, setRomStatus] = useState<string | null>(null);
  const [modelLoading, setModelLoading] = useState(false);

  const animation = loaded?.model.anims[animationIndex] ?? null;
  const contexts = loaded ? animationContextNames(loaded.model, animationIndex) : [];
  const mappedMoves = useMemo(() => {
    if (!loaded) return [];
    return loaded.model.moveAnim
      .map((value, index) => value === animationIndex ? index + 1 : null)
      .filter((value): value is number => value !== null);
  }, [loaded, animationIndex]);

  function useParsedModel(buffer: ArrayBuffer, filename: string, bytes: number) {
    const model = parseDsm(buffer);
    setLoaded({ model, filename, bytes });
    setAnimationIndex(model.anims.length > 0 ? 0 : -1);
    setFrame(0);
    setPlaying(false);
  }

  async function loadImportedModel(session: ImportedSession, species: number) {
    setModelLoading(true);
    setError(null);
    try {
      const buffer = await fetchImportedModel(session.sessionId, species);
      useParsedModel(buffer, `${String(species).padStart(3, "0")}.dsm`, buffer.byteLength);
      setSelectedSpecies(species);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The imported model could not be read.");
    } finally {
      setModelLoading(false);
    }
  }

  async function importRom(buffer: ArrayBuffer) {
    setLoaded(null);
    setRomSession(null);
    setSelectedSpecies(null);
    setError(null);
    setCopyStatus(null);
    setPlaying(false);
    setRomStatus("Extracting 151 Stadium models…");
    try {
      const session = await importStadiumRom(buffer, (done, total) => {
        setRomStatus(`Extracting Stadium models… ${done} / ${total}`);
      });
      const first = session.models[0];
      if (!first) throw new Error("The ROM produced no model files.");
      setRomSession(session);
      setRomStatus(`Imported ${session.models.length} model packs.`);
      await loadImportedModel(session, first.species);
    } catch (cause) {
      setRomStatus(null);
      setError(cause instanceof Error ? cause.message : "The Stadium ROM could not be imported.");
    }
  }

  async function loadFile(file: File) {
    setLoaded(null);
    setError(null);
    setCopyStatus(null);
    setPlaying(false);
    try {
      const buffer = await file.arrayBuffer();
      const kind = detectFileKind(file.name, new Uint8Array(buffer));
      if (kind === "rom") {
        await importRom(buffer);
        return;
      }
      if (kind !== "model") {
        throw new Error("Choose a DSM/PVDZ model pack or a Pokemon Stadium .z64/.n64/.v64 ROM.");
      }
      setRomSession(null);
      setSelectedSpecies(null);
      setRomStatus(null);
      useParsedModel(buffer, file.name, file.size);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The selected file could not be read.");
    }
  }

  function chooseAnimation(index: number) {
    setAnimationIndex(index);
    setFrame(0);
    setPlaying(false);
    setCopyStatus(null);
  }

  function moveFrame(amount: number) {
    if (!animation) return;
    setFrame((current) => Math.max(0, Math.min(animation.frames - 1, Math.floor(current) + amount)));
  }

  async function copyReport() {
    if (!loaded || !animation) return;
    const report = [`File: ${loaded.filename}`, buildAnimationReport(loaded.model, animationIndex, frame)].join("\n");
    try {
      await navigator.clipboard.writeText(report);
      setCopyStatus("Copied report");
    } catch {
      setCopyStatus("Clipboard unavailable");
    }
  }

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) void loadFile(file);
  };

  if (!loaded) {
    return (
      <main className="app-shell">
        <header className="app-header">
          <div>
            <p className="eyebrow">POTATO VOXEL / STADIUM TOOLS</p>
            <h1>Animation Inspector</h1>
          </div>
          <span className="header-badge">DSM3</span>
        </header>
        <section
          className={`drop-card${error ? " drop-card-error" : ""}`}
          aria-label="Load a Stadium model or ROM"
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
        >
          <div className="drop-icon">+</div>
          <h2>Drop a model or Stadium ROM here</h2>
          <p>Load a cached model directly, or import your Stadium ROM to build every model automatically.</p>
          <div className="file-actions">
            <label className="file-button">
              Choose model
              <input
                type="file"
                accept={MODEL_ACCEPT}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void loadFile(file);
                }}
              />
            </label>
            <label className="file-button file-button-secondary">
              Import Stadium ROM
              <input
                type="file"
                accept={ROM_ACCEPT}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void loadFile(file);
                }}
              />
            </label>
          </div>
          <p className="drop-hint">Supports DSM3/PVDZ packs and US 1.0 N64 ROM byte orders.</p>
          {romStatus && <p className="import-status">{romStatus}</p>}
          {error && <p className="error-message">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="inspector-shell">
      <header className="inspector-header">
        <div>
          <p className="eyebrow">POTATO VOXEL / STADIUM TOOLS</p>
          <h1>Animation Inspector</h1>
        </div>
        <label className="secondary-button">
          Load another
          <input
            type="file"
            accept={`${MODEL_ACCEPT},${ROM_ACCEPT}`}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void loadFile(file);
            }}
          />
        </label>
      </header>

      <section className="inspector-grid">
        <aside className="panel clip-panel">
          {romSession && (
            <div className="model-library">
              <p className="panel-kicker">IMPORTED MODELS</p>
              <select
                className="model-select"
                value={selectedSpecies ?? ""}
                disabled={modelLoading}
                onChange={(event) => {
                  const species = Number(event.target.value);
                  setRomStatus(null);
                  void loadImportedModel(romSession, species);
                }}
              >
                {romSession.models.map((model) => (
                  <option value={model.species} key={model.filename}>#{String(model.species).padStart(3, "0")}</option>
                ))}
              </select>
              <small>{modelLoading ? "Loading model…" : `${romSession.models.length} packs from imported ROM`}</small>
            </div>
          )}
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">ANIMATIONS</p>
              <h2>{loaded.model.anims.length} clips</h2>
            </div>
            <span className="file-size">{formatBytes(loaded.bytes)}</span>
          </div>
          <div className="file-name" title={loaded.filename}>{loaded.filename}</div>
          <div className="clip-list">
            {loaded.model.anims.map((clip, index) => {
              const roles = animationContextNames(loaded.model, index);
              return (
                <button
                  className={`clip-row${index === animationIndex ? " selected" : ""}`}
                  key={`${index}-${clip.name}`}
                  onClick={() => chooseAnimation(index)}
                >
                  <span className="clip-index">{String(index).padStart(2, "0")}</span>
                  <span className="clip-copy">
                    <strong>{clip.name || "unnamed"}</strong>
                    <small>{clip.frames}f · {clip.seconds.toFixed(2)}s{roles.length ? ` · ${roles.join(", ")}` : ""}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="center-column">
          <div className="viewport-card">
            <ModelViewport
              model={loaded.model}
              animationIndex={animationIndex >= 0 ? animationIndex : null}
              frame={frame}
              playing={playing}
              loop={loop}
              speed={speed}
              showWireframe={showWireframe}
              showBones={showBones}
              onFrameChange={setFrame}
              onPlaybackEnd={() => setPlaying(false)}
            />
            <div className="viewport-controls">
              <button className="control-chip" onClick={() => setShowWireframe((value) => !value)} aria-pressed={showWireframe}>Wireframe</button>
              <button className="control-chip" onClick={() => setShowBones((value) => !value)} aria-pressed={showBones}>Bones</button>
            </div>
          </div>
          <div className="timeline-card">
            <div className="timeline-topline">
              <button className="play-button" onClick={() => setPlaying((value) => !value)} disabled={!animation}>
                {playing ? "Pause" : "Play"}
              </button>
              <button className="icon-button" onClick={() => { setFrame(0); setPlaying(false); }}>Restart</button>
              <button className="icon-button" onClick={() => moveFrame(-1)}>‹ Frame</button>
              <button className="icon-button" onClick={() => moveFrame(1)}>Frame ›</button>
              <label className="speed-control">Speed
                <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
                  {SPEEDS.map((value) => <option value={value} key={value}>{value}×</option>)}
                </select>
              </label>
              <label className="toggle-control"><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} /> Loop</label>
            </div>
            {animation && (
              <>
                <input
                  className="timeline-slider"
                  type="range"
                  min="0"
                  max={Math.max(animation.frames - 1, 0)}
                  step="0.01"
                  value={Math.min(frame, Math.max(animation.frames - 1, 0))}
                  onChange={(event) => setFrame(Number(event.target.value))}
                />
                <div className="timeline-readout">
                  <span>Frame <strong>{frame.toFixed(2)}</strong> / {Math.max(animation.frames - 1, 0)}</span>
                  <span>{(frame / 30).toFixed(3)}s / {animation.seconds.toFixed(3)}s</span>
                </div>
              </>
            )}
          </div>
        </section>

        <aside className="right-column">
          <section className="panel metadata-panel">
            <p className="panel-kicker">MODEL</p>
            <div className="stat-grid">
              <div><span>Species</span><strong>#{String(loaded.model.species).padStart(3, "0")}</strong></div>
              <div><span>Bones</span><strong>{loaded.model.boneCount}</strong></div>
              <div><span>Primitives</span><strong>{loaded.model.primCount}</strong></div>
              <div><span>Textures</span><strong>{loaded.model.texCount}</strong></div>
            </div>
          </section>

          <section className="panel report-panel">
            <div className="panel-heading compact">
              <div>
                <p className="panel-kicker">SELECTED CLIP</p>
                <h2>{animation?.name || "No animation"}</h2>
              </div>
              <span className="clip-number">#{animationIndex}</span>
            </div>
            {animation && (
              <dl className="detail-list">
                <div><dt>Context</dt><dd>{contexts.join(", ") || "unassigned"}</dd></div>
                <div><dt>Loop start</dt><dd>{animation.loopStart}</dd></div>
                <div><dt>Move indexes</dt><dd>{mappedMoves.length ? mappedMoves.join(", ") : "none"}</dd></div>
              </dl>
            )}
            <button className="copy-button" onClick={() => void copyReport()}>Copy report</button>
            {copyStatus && <p className="copy-status">{copyStatus}</p>}
          </section>

          <section className="panel mapping-panel">
            <p className="panel-kicker">CONTEXT SLOTS</p>
            <div className="mapping-list">
              {CONTEXT_NAMES.map((name, index) => (
                <div className="mapping-row" key={name}>
                  <span>{name}</span>
                  <strong>{loaded.model.ctx[index] >= 0 ? loaded.model.ctx[index] : "—"}</strong>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
