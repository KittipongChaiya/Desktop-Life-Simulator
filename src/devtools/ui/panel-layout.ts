/**
 * Panel geometry, and where it is remembered. Phase-07.8n.
 *
 * Nine tools accumulated over this phase, each pinned to a hardcoded corner,
 * and with more than three open they overlap. This is the model behind letting
 * the developer move and size them, and behind those choices surviving a
 * reload — a layout you rebuild every session is not a layout.
 *
 * STORED IN `localStorage`, NOT IN SETTINGS. The game's settings travel over
 * IPC to a file the main process owns; putting debug geometry there would add
 * production surface for a debug feature (ADR-018 §1). `localStorage` is
 * renderer-only, costs no IPC, and disappears with the profile — which is the
 * right lifetime for where a developer happened to drag a panel.
 *
 * WHAT COMES BACK IS VALIDATED, NOT TRUSTED. Stored JSON is input from outside
 * the program (`AI_RULES.md` §2.4): it may be absent, truncated, hand-edited,
 * or written by an older build. Anything that fails to parse is discarded in
 * favour of defaults rather than throwing — a corrupt layout must never stop
 * the tooling from opening.
 */

export interface PanelGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PanelLayout {
  /** Geometry per panel id. Absent means "wherever the panel defaults to". */
  readonly panels: Readonly<Record<string, PanelGeometry>>;
  /** Panel ids the developer had open. */
  readonly open: readonly string[];
}

export const EMPTY_LAYOUT: PanelLayout = { panels: {}, open: [] };

const STORAGE_KEY = 'devtools.layout.v1';

/** Nothing smaller is usable; nothing larger is a panel. */
const MIN_WIDTH = 180;
const MIN_HEIGHT = 80;
const MAX_SIZE = 4_000;

/** Keeps a panel reachable: a title bar dragged off-screen cannot be dragged back. */
const MIN_VISIBLE = 32;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseGeometry(value: unknown): PanelGeometry | null {
  if (typeof value !== 'object' || value === null) return null;

  const candidate = value as Partial<Record<keyof PanelGeometry, unknown>>;
  if (
    !isFiniteNumber(candidate.x) ||
    !isFiniteNumber(candidate.y) ||
    !isFiniteNumber(candidate.width) ||
    !isFiniteNumber(candidate.height)
  ) {
    return null;
  }

  return {
    x: candidate.x,
    y: candidate.y,
    width: candidate.width,
    height: candidate.height,
  };
}

/** Reads a layout from stored JSON, discarding anything that is not one. */
export function parseLayout(raw: string | null): PanelLayout {
  if (raw === null || raw === '') return EMPTY_LAYOUT;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_LAYOUT;
  }

  if (typeof parsed !== 'object' || parsed === null) return EMPTY_LAYOUT;
  const candidate = parsed as { panels?: unknown; open?: unknown };

  const panels: Record<string, PanelGeometry> = {};
  if (typeof candidate.panels === 'object' && candidate.panels !== null) {
    for (const [id, value] of Object.entries(candidate.panels)) {
      const geometry = parseGeometry(value);
      // One unreadable panel loses its own position, not everyone else's.
      if (geometry !== null) panels[id] = geometry;
    }
  }

  const open = Array.isArray(candidate.open)
    ? candidate.open.filter((id): id is string => typeof id === 'string')
    : [];

  return { panels, open };
}

/**
 * Clamps geometry to something usable on this viewport.
 *
 * Applied on the way OUT as well as on the way in, because a layout saved on a
 * second monitor and reopened on a laptop would otherwise put half the panels
 * where the pointer cannot reach them.
 *
 * SIZE IS BOUNDED BY THE VIEWPORT, not merely by a maximum. This overlay is a
 * DESKTOP STRIP — measured at 1920×220 — so a panel 210 tall opened at y=150
 * hangs its bottom two thirds, and its resize grip, off the screen entirely.
 * The E2E found that by trying to grab a grip the mouse could not reach.
 */
export function clampGeometry(
  geometry: PanelGeometry,
  viewport: { readonly width: number; readonly height: number },
): PanelGeometry {
  const width = Math.min(MAX_SIZE, viewport.width, Math.max(MIN_WIDTH, geometry.width));
  const height = Math.min(MAX_SIZE, viewport.height, Math.max(MIN_HEIGHT, geometry.height));

  // Then the position, so the whole panel fits rather than only its title bar.
  const x = Math.min(Math.max(geometry.x, MIN_VISIBLE - width), viewport.width - MIN_VISIBLE);
  const y = Math.min(Math.max(geometry.y, 0), Math.max(0, viewport.height - height));

  return { x, y, width, height };
}

export function withPanel(layout: PanelLayout, id: string, geometry: PanelGeometry): PanelLayout {
  return { ...layout, panels: { ...layout.panels, [id]: geometry } };
}

export function withOpen(layout: PanelLayout, id: string, open: boolean): PanelLayout {
  const without = layout.open.filter((entry) => entry !== id);
  return { ...layout, open: open ? [...without, id] : without };
}

export interface LayoutStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The browser's, when there is one. Absent in a test environment that has none. */
function defaultStorage(): LayoutStorage | null {
  try {
    return globalThis.localStorage;
  } catch {
    // Access itself can throw where storage is disabled by policy.
    return null;
  }
}

export function loadLayout(storage: LayoutStorage | null = defaultStorage()): PanelLayout {
  if (storage === null) return EMPTY_LAYOUT;

  try {
    return parseLayout(storage.getItem(STORAGE_KEY));
  } catch {
    return EMPTY_LAYOUT;
  }
}

/**
 * Persists a layout, and never lets failing to do so break anything.
 *
 * Storage throws when it is full or disabled. Losing a remembered position is a
 * nuisance; a debug panel that throws while being dragged is a defect.
 */
export function saveLayout(
  layout: PanelLayout,
  storage: LayoutStorage | null = defaultStorage(),
): void {
  if (storage === null) return;

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Deliberately swallowed, and the only place in this phase that is: there
    // is no user to tell, no retry that would help, and nothing downstream
    // depends on it (AI_RULES.md §2.2's "never silently" is about errors that
    // hide a defect — this one hides a preference).
  }
}
