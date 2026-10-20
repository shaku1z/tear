import { careerRowKey } from "../../ghost/career-archive";
import type { ProfileScreenView, ScreenRenderContext } from "./contracts";
import { ellipsize } from "./screen-primitives";

const labels: Readonly<Record<string, string>> = { history: "ALL RUNS", "personal-best": "PERSONAL BESTS", "first-clear": "FIRST CLEARS", "best-weapon": "BEST BY WEAPON", "boss-change": "BOSS CLEAR TIMES", "favorite-builds": "FAVORITE BUILDS", "near-miss": "BOSS NEAR MISSES", "style-milestones": "STYLE MILESTONES", "longest-survival": "LONGEST SURVIVAL", "dna-evolution": "RUN DNA HISTORY" };
/** Presentation only; text editing and source actions use explicit application ports. */
export function createCareerArchiveRenderer(context: ScreenRenderContext) {
  return (view: NonNullable<ProfileScreenView["career"]>): void => {
    const { ui, canvas, width, height } = context, left = Math.max(24, width / 2 - 550), available = Math.min(1100, width - 48);
    const line = (text: string, y: number, muted = false, size = ui.t.type.caption) => { ui.text(canvas, ellipsize(canvas, text, available), left, y, size, "left", muted ? ui.t.alpha.muted : ui.t.alpha.soft); };
    const button = (label: string, command: string, x: number, y: number, w = 154, enabled = true, id?: string) => { context.enqueue({ x, y, w, h: 32, label, size: ui.t.type.micro, enabled, action: { type: "career.control", command, ...(id ? { id } : {}) } }); };
    ui.title(canvas, "CAREER ARCHIVE", width / 2, 40, ui.t.type.h2);
    context.enqueue({ x: left, y: 12, w: 100, h: 30, label: "PROFILE", action: { type: "profile.selectTab", id: "bests" } });
    if (!view.selected) {
      button("SEARCH / FILTERS", "search", left, 58, 190); button(labels[view.query.view] ?? view.query.view, "view", left + 200, 58, 240);
      button(`SORT: ${view.query.sort.toUpperCase()}`, "sort", left + 450, 58, 180); button("CLEAR", "clear", left + 640, 58, 110);
      line(`${String(view.total)} matches / ${String(view.retained)} retained records · ${String(view.known)} indexed${view.indexing ? " · indexing" : ""}`, 115);
      const rowHeight = Math.max(42, Math.min(100, (height - 238) / 3));
      view.rows.forEach((row, i) => { const e = row.entry, y = 132 + i * rowHeight;
        button(`${e.mode ?? "UNKNOWN MODE"} · ${e.weapon ?? "?"} · ${e.result ?? "NOT CHECKED"}`, "select", left, y, available, true, careerRowKey(row));
        const dnaValue = (key: string) => `${key}: ${e.dna[key] === undefined ? "unavailable" : String(Math.round(e.dna[key] * 10000) / 10000)}`;
        if (rowHeight >= 62) line(view.query.view === "dna-evolution" ? ["aggression", "precision", "mobility"].map(dnaValue).join(" · ") : `${e.date} · wave ${String(e.wave ?? "unknown")} · score ${String(e.score ?? "unknown")} · ${row.notes.retention} · ${e.actor} attribution`, y + 51, true);
        if (rowHeight >= 86) line(view.query.view === "dna-evolution" ? `${["defense", "experimentation"].map(dnaValue).join(" · ")} · ${e.date} · rounded 4dp` : row.detail ?? `Tags: ${row.notes.tags.join(", ") || "none"} · ${e.present ? "source retained" : "source unavailable"}`, y + 74, true);
      });
      if (!view.rows.length) line(view.status === "loading" ? "Reading retained metadata..." : "No matching retained records. Historical unknowns remain unavailable.", 164);
      button("PREVIOUS", "previous", left, height - 76, 154, view.page > 0); button("NEXT", "next", left + 166, height - 76, 154, view.page + 1 < view.pages);
      if (view.usage) line(`Recorded chunks ${String(view.usage.recordedChunkBytes)} B / protected ${String(view.usage.protectedChunkBytes)} B · browser usage/quota ${String(view.usage.browserUsage ?? "unknown")}/${String(view.usage.browserQuota ?? "unknown")} B · pending/profile/asset/analysis usage unavailable`, height - 92, true);
      line(`Page ${String(view.page + 1)} / ${String(view.pages)} · ${view.message || "Select a run for recorded facts and local controls."}`, height - 20, true); return;
    }
    const { entry: e, notes, detail } = view.selected;
    const quantity = (value: number, digits = 2) => String(Number(value.toFixed(digits)));
    const composition = Object.entries(e.composition ?? {}), dominant = composition.filter(([, n]) => n === Math.max(...composition.map(([, count]) => count))).map(([category]) => category).join(", ");
    button("BACK TO RESULTS", "back", left, 58, 190);
    const facts = [detail ?? `${e.kind === "legacy-visual" ? "VISUAL-ONLY LEGACY · " : ""}${e.mode ?? "unknown mode"} / ${e.difficulty ?? "unknown difficulty"} / ${e.weapon ?? "unknown weapon"}`,
      `${e.date} · ${e.result ?? "outcome unavailable"} · wave ${String(e.wave ?? "unknown")} · score ${String(e.score ?? "unknown")}`,
      `Duration ${e.seconds === null ? "unavailable" : `${quantity(e.seconds)} seconds`} · damage ${e.damage === null ? "unavailable" : quantity(e.damage)} · verification ${e.verified}`,
      `Build categories: ${e.categories?.join(", ") ?? "unavailable"} · distinct IDs ${e.composition === null ? "unavailable" : composition.map(([k, v]) => `${k}:${String(v)}`).join(", ") || "none"} · dominant ${dominant || (e.categories?.includes("unupgraded") ? "unupgraded" : "unavailable")} · owned: ${e.loadout === null ? "unavailable" : e.loadout.map((r) => `${r.id} x${String(r.count)} T${String(r.tier)}`).join(", ") || "no upgrades"}`,
      `Accepted uses: ${e.abilities === null ? "unavailable" : e.abilities.join(", ") || "none recorded"} · bosses: ${e.bosses === null ? "unavailable" : e.bosses.join(", ") || "none recorded"}`,
      `Style ${e.style ? `combo ${quantity(e.style.combo)} · x${quantity(e.style.multiplier)} · ${e.style.rank || "unranked"}` : "unavailable"} · near miss ${e.nearMiss === null ? "unavailable" : e.nearMiss.map((b) => `${b.boss}: ${quantity(b.hp)}/${quantity(b.maxHp)} HP, phase 3`).join(", ") || "none under final-phase <=10% rule"}`,
      `Run DNA: ${Object.entries(e.dna).map(([k, v]) => `${k} ${quantity(v, 4)}`).join(" · ") || "unavailable"}`,
      `Tags: ${notes.tags.join(", ") || "none"} · retention ${notes.retention} · recorded actor ${e.actor} · sharing ${e.sharing} · game ${e.gameVersion ?? "unknown"}`,
      e.unavailable.join(" · ") || "Native witness coverage available; observations do not measure human skill."];
    const spacing = Math.max(14, Math.min(30, (height - 220) / facts.length)); facts.forEach((fact, i) => { line(fact, 108 + i * spacing, i === facts.length - 1, ui.t.type.body); });
    const y = height - 100;
    if (view.confirming) { line("Delete local recording, unreferenced chunks, history and tags? Protected holds may refuse. Remote copies remain.", y - 14); button("DELETE LOCAL", "confirm-delete", left, y, 180); button("KEEP", "cancel-delete", left + 192, y); }
    else {
      [["THEATER", "watch"], ["COACH", "coach"], ["CHALLENGE", "challenge"], ["DOWNLOAD", "download"], ["PUBLISH", "publish"]].forEach(([label, command], i) => { button(label ?? "", command ?? "", left + i * (available + 8) / 5, y, (available - 32) / 5, e.present && (e.kind === "capsule" || command === "watch")); });
      [["TAGS", "tags"], [notes.retention === "pinned" ? "UNPIN" : "PIN", "pin"], ["RETENTION", "retention"], ["DELETE LOCAL", "delete"]].forEach(([label, command], i) => { button(label ?? "", command ?? "", left + i * (available + 8) / 4, y + 38, (available - 24) / 4, e.kind === "capsule" || command === "pin" || command === "delete"); });
    }
    line(view.message || "Local annotations are separate from immutable recordings. Other tools retain their own admission and consent gates.", height - 14, true);
  };
}
