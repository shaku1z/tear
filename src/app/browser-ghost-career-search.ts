export interface CareerTextPort { edit(title: string, fields: Readonly<Record<string, string>>, submit: (fields: Readonly<Record<string, string>>) => void): void; close(): void; }

/** Explicit, accessible local text editing. Nothing is submitted to a server. */
export function createCareerTextPort(document: Document): CareerTextPort {
  let remove: (() => void) | undefined;
  return { close() { remove?.(); remove = undefined; }, edit(title, fields, submit) {
    remove?.(); const focus = document.activeElement, layer = document.createElement("dialog"), form = document.createElement("form");
    layer.addEventListener("cancel", (event) => { event.preventDefault(); remove?.(); });
    layer.setAttribute("role", "dialog"); layer.setAttribute("aria-modal", "true"); layer.setAttribute("aria-label", title);
    Object.assign(layer.style, { position: "fixed", inset: "5%", width: "90vw", maxHeight: "90vh", boxSizing: "border-box", zIndex: "10000", overflow: "auto", background: "#161c27", color: "white", padding: "20px", font: "16px sans-serif" });
    form.style.display = "grid"; form.style.gap = "10px"; form.style.gridTemplateColumns = "repeat(auto-fit,minmax(220px,1fr))";
    const heading = document.createElement("h2"); heading.textContent = title; heading.style.gridColumn = "1/-1"; form.append(heading);
    const inputs = new Map<string, HTMLInputElement>();
    for (const [key, value] of Object.entries(fields)) { const label = document.createElement("label"), input = document.createElement("input");
      label.textContent = ({ ability: "Accepted ability / technique ID", archetype: "Build category", actor: "Recorded human / bot attribution", shared: "Sharing: public / unlisted / private / queued / unknown", verified: "Verification: receipts / integrity / unavailable", version: "Game version", pinned: "Pinned: true / false" } as Readonly<Record<string, string>>)[key] ?? key; input.type = "text"; input.name = key; input.value = value; input.maxLength = key === "code" ? 32768 : key === "tags" ? 1024 : 256;
      input.style.width = "100%"; input.style.boxSizing = "border-box"; input.style.padding = "8px"; input.autocomplete = "off"; label.append(input); form.append(label); inputs.set(key, input);
    }
    const hint = document.createElement("p"); hint.style.gridColumn = "1/-1"; hint.textContent = "Blank = any; unknown = unavailable. Numeric ranges: min..max. Dates: YYYY-MM-DD..YYYY-MM-DD. Values use recorded IDs. Tags: comma-separated."; form.append(hint);
    const save = document.createElement("button"), cancel = document.createElement("button"); save.type = "submit"; save.textContent = "APPLY"; cancel.type = "button"; cancel.textContent = "CANCEL"; form.append(save, cancel);
    const close = () => { layer.close(); layer.remove(); if (focus instanceof HTMLElement && focus.isConnected) focus.focus(); if (remove === close) remove = undefined; };
    remove = close; cancel.onclick = close;
    form.onsubmit = (event) => { event.preventDefault(); const next = Object.fromEntries([...inputs].map(([key, input]) => [key, input.value.trim()])); close(); submit(next); };
    layer.addEventListener("keydown", (event) => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); close(); } });
    for (const name of ["keyup", "pointerdown", "pointerup", "click"] as const) layer.addEventListener(name, (event) => { event.stopPropagation(); });
    layer.append(form); document.body.append(layer); layer.showModal(); inputs.values().next().value?.focus();
  } };
}
