export interface CareerTextPort {
  edit(
    title: string,
    fields: Readonly<Record<string, string>>,
    submit: (fields: Readonly<Record<string, string>>) => void,
  ): void;
  close(): void;
}

/** Player-facing labels for the archive's filter keys. Unknown keys fall back to a readable form. */
const FIELD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  search: "Search",
  date: "Date (YYYY-MM-DD..YYYY-MM-DD)",
  mode: "Mode",
  difficulty: "Difficulty",
  weapon: "Weapon",
  wave: "Wave reached (e.g. 5..20)",
  result: "Result (victory / defeat)",
  archetype: "Build style",
  ability: "Ability used",
  boss: "Boss fought",
  score: "Score (e.g. 1000..50000)",
  damage: "Damage taken (min..max)",
  tags: "Tags (comma-separated)",
  pinned: "Pinned (true / false)",
  shared: "Shared (public / unlisted / private)",
  resumed: "Continued from a replay (true / false)",
  verified: "Checked recording (receipts / integrity / unavailable)",
  actor: "Played by (human / bot)",
  version: "Game version",
  title: "Title",
  notes: "Notes",
  retention: "Keep (recent / pinned)",
  code: "Code",
});

const DIALOG_CSS = `
.tear-dialog{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);margin:0;width:min(880px,92vw);max-height:min(88vh,760px);
  box-sizing:border-box;overflow:auto;overscroll-behavior:contain;padding:22px 24px;background:#0e1017;color:#f1eff9;
  border:2px solid #13c4d6;border-top-width:4px;box-shadow:0 18px 48px rgba(0,0,0,.55);
  font:15px/1.45 'Courier New','Nimbus Mono PS','Liberation Mono',monospace;cursor:default}
.tear-dialog::backdrop{background:rgba(6,7,12,.72)}
.tear-dialog *{cursor:default}
.tear-dialog form{display:grid;gap:12px 16px;align-items:end;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}
.tear-dialog h2{grid-column:1/-1;margin:0 0 4px;font-family:inherit;font-size:24px;font-weight:bold;letter-spacing:.06em}
.tear-dialog label{display:grid;gap:5px;font-size:13px;font-weight:bold;letter-spacing:.04em;color:#c9ccd6;text-transform:uppercase}
.tear-dialog input{width:100%;box-sizing:border-box;padding:9px 10px;font-family:inherit;font-size:15px;color:#f1eff9;
  background:#171a24;border:1.5px solid #3a3f52;border-radius:0;outline:none;cursor:text;text-transform:none}
.tear-dialog input:focus{border-color:#13c4d6;box-shadow:0 0 0 2px rgba(19,196,214,.35)}
.tear-dialog p{grid-column:1/-1;margin:2px 0;font-size:13px;color:#b4b8c8}
.tear-dialog .actions{grid-column:1/-1;display:flex;gap:12px;justify-content:flex-end;position:sticky;bottom:-22px;padding:12px 0 2px;background:#0e1017}
.tear-dialog button{font-family:inherit;font-size:15px;font-weight:bold;letter-spacing:.08em;padding:11px 22px;border-radius:0;cursor:pointer}
.tear-dialog button[type=submit]{background:#13c4d6;color:#08131a;border:2px solid #13c4d6}
.tear-dialog button[type=button]{background:transparent;color:#f1eff9;border:1.5px solid rgba(241,239,249,.55)}
.tear-dialog button:focus-visible{outline:2px solid #f1eff9;outline-offset:3px}
`;

function ensureStyles(document: Document): void {
  if (document.getElementById("tear-dialog-style") !== null) return;
  const style = document.createElement("style");
  style.id = "tear-dialog-style";
  style.textContent = DIALOG_CSS;
  document.head.append(style);
}

/** Explicit, accessible local text editing in the game's own look. Nothing is submitted to a server. */
export function createCareerTextPort(
  document: Document,
  hintText = "Leave a box blank to match anything. Ranges use min..max (for example 5..20). Dates use YYYY-MM-DD. Separate tags with commas.",
): CareerTextPort {
  let remove: (() => void) | undefined;
  return {
    close() {
      remove?.();
      remove = undefined;
    },
    edit(title, fields, submit) {
      remove?.();
      ensureStyles(document);
      const focus = document.activeElement,
        layer = document.createElement("dialog"),
        form = document.createElement("form");
      layer.className = "tear-dialog";
      layer.addEventListener("cancel", (event) => {
        event.preventDefault();
        remove?.();
      });
      layer.setAttribute("role", "dialog");
      layer.setAttribute("aria-modal", "true");
      layer.setAttribute("aria-label", title);
      const heading = document.createElement("h2");
      heading.textContent = title;
      const hint = document.createElement("p");
      hint.textContent = hintText;
      form.append(heading, hint);
      const inputs = new Map<string, HTMLInputElement>();
      for (const [key, value] of Object.entries(fields)) {
        const label = document.createElement("label"),
          input = document.createElement("input");
        label.textContent = FIELD_LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2");
        input.type = "text";
        input.name = key;
        input.value = value;
        input.maxLength = key === "code" ? 32768 : key === "tags" ? 1024 : 256;
        input.autocomplete = "off";
        label.append(input);
        form.append(label);
        inputs.set(key, input);
      }
      const actions = document.createElement("div");
      actions.className = "actions";
      const save = document.createElement("button"),
        cancel = document.createElement("button");
      save.type = "submit";
      save.textContent = "APPLY";
      cancel.type = "button";
      cancel.textContent = "CANCEL";
      actions.append(cancel, save);
      form.append(actions);
      const close = () => {
        layer.close();
        layer.remove();
        if (focus instanceof HTMLElement && focus.isConnected) focus.focus();
        if (remove === close) remove = undefined;
      };
      remove = close;
      cancel.onclick = close;
      form.onsubmit = (event) => {
        event.preventDefault();
        const next = Object.fromEntries([...inputs].map(([key, input]) => [key, input.value.trim()]));
        close();
        submit(next);
      };
      layer.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
      });
      for (const name of ["keyup", "pointerdown", "pointerup", "click"] as const)
        layer.addEventListener(name, (event) => {
          event.stopPropagation();
        });
      layer.append(form);
      document.body.append(layer);
      layer.showModal();
      inputs.values().next().value?.focus();
    },
  };
}
