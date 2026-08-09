import type { GhostLabScreenView, ScreenRenderContext } from "./contracts";
import { backControl } from "./screen-primitives";

/** Presentation-only normal Ghost Lab home. No diagnostic/test-only state crosses this boundary. */
export function createGhostLabRenderers(context: ScreenRenderContext) {
  return Object.freeze({
    ghostlab(view: GhostLabScreenView): void {
      const { canvas, ui, width } = context;
      ui.header(canvas, "GHOST LAB", view.subtitle, context.enterAmount, ui.t.color.accent);
      const left = 260, top = 178, cardWidth = 430;
      ui.sectionLabel(canvas, "AVAILABLE LOCALLY", left, top - 28, cardWidth);
      view.routes.forEach((route, index) => {
        const y = top + index * 112;
        ui.card(canvas, left, y, cardWidth, 92);
        ui.text(canvas, route.label, left + 24, y + 33, ui.t.type.label, "left", ui.t.alpha.full);
        ui.wrappedText(canvas, route.detail, left + 24, y + 55, cardWidth - 44, 17, ui.t.type.caption, "left", ui.t.alpha.soft);
        context.enqueue({ x: left, y, w: cardWidth, h: 92, label: route.label,
          sub: route.detail, action: { type: "ghostlab.open", destination: route.id } });
      });
      const right = 760;
      ui.sectionLabel(canvas, "NOT YET PLAYER-SAFE", right, top - 28, 430, ui.t.color.muted);
      view.unavailable.forEach((entry, index) => {
        const y = top + index * 82;
        ui.card(canvas, right, y, 430, 64, false, { dashed: true, edge: ui.t.color.muted });
        ui.text(canvas, `UNAVAILABLE · ${entry.label}`, right + 20, y + 25, ui.t.type.caption, "left", ui.t.alpha.muted);
        ui.wrappedText(canvas, entry.detail, right + 20, y + 44, 390, 15, ui.t.type.micro, "left", ui.t.alpha.faint);
      });
      ui.wrappedText(canvas, "This local home does not expose traffic, promotion, cloud operations, or test-only diagnostic controls.", width / 2, 680, 800, 19, ui.t.type.caption, "center", ui.t.alpha.muted);
      backControl(context);
    },
  });
}
