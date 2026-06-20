// ------- minimal black-on-white canvas UI primitives -------
const UI = {
  ink: "#000",   // foreground colour; the game flips this to light on dark biomes

  font(size, bold) { return (bold ? "bold " : "") + size + "px 'Courier New', monospace"; },

  text(ctx, str, x, y, size, align, alpha) {
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = this.ink;
    ctx.font = this.font(size, false);
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(str, x, y);
    ctx.globalAlpha = 1;
  },

  title(ctx, str, x, y, size) {
    ctx.fillStyle = this.ink;
    ctx.font = this.font(size, true);
    ctx.textAlign = "center";
    ctx.fillText(str, x, y);
  },

  pointIn(b, x, y) {
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  },

  // b: {x,y,w,h,label,enabled} ; hovered: bool
  button(ctx, b, hovered) {
    const on = b.enabled !== false;
    const fill = on && hovered;
    ctx.lineWidth = 2;
    ctx.strokeStyle = on ? "#000" : "#bbb";
    ctx.fillStyle = fill ? "#000" : "#fff";
    ctx.beginPath();
    ctx.rect(b.x, b.y, b.w, b.h);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = fill ? "#fff" : (on ? "#000" : "#bbb");
    ctx.font = this.font(b.size || 20, true);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.textBaseline = "alphabetic";
  },

  // a bordered panel
  panel(ctx, x, y, w, h) {
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  },

  // dim the whole screen (for overlays over the frozen world)
  dim(ctx, w, h, a) {
    ctx.globalAlpha = a == null ? 0.78 : a;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  },

  cursor(ctx, x, y) {
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + 14, y + 4);
    ctx.lineTo(x + 5, y + 6); ctx.lineTo(x + 8, y + 15);
    ctx.lineTo(x + 4, y + 16); ctx.lineTo(x + 1, y + 7);
    ctx.closePath();
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.stroke();
  },
};
