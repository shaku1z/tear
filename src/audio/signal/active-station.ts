/** THE SIGNAL — which station is programming music ("canonical" = Director mode). */
export const STATION_CHOICES = ["canonical", "descent", "cutline", "still", "echo", "voidcast", "archive"] as const;
export type StationChoice = (typeof STATION_CHOICES)[number];

const LABELS: Readonly<Record<string, string>> = {
  canonical: "DIRECTOR (CANONICAL)", descent: "DESCENT", cutline: "CUTLINE",
  still: "STILL", echo: "ECHO", voidcast: "VOIDCAST", archive: "THE ARCHIVE",
};
const NOTES: Readonly<Record<string, string>> = {
  canonical: "THE GAME CHOOSES — STORY FIRST",
  descent: "CANONICAL TEAR SCORE",
  cutline: "MOMENTUM, PRESSURE, IMPACT",
  still: "CALM AND MELODIC",
  echo: "ALTERNATE AND EXPERIMENTAL",
  voidcast: "DARK AMBIENT AND ATMOSPHERIC",
  archive: "ALBUM VERSIONS — MENUS ONLY",
};
export function stationLabel(id: string): string { return LABELS[id] ?? id.toUpperCase(); }
export function stationNote(id: string): string { return NOTES[id] ?? ""; }
export function isStationChoice(v: unknown): v is StationChoice {
  return typeof v === "string" && (STATION_CHOICES as readonly string[]).includes(v);
}

let active: StationChoice = "canonical";
const listeners = new Set<() => void>();
export function setActiveStation(id: string): void {
  const next = isStationChoice(id) ? id : "canonical";
  if (next === active) return;
  active = next;
  for (const l of listeners) l();
}
export function getActiveStation(): StationChoice { return active; }
export function onStationChange(listener: () => void): () => void {
  listeners.add(listener); return () => listeners.delete(listener);
}
