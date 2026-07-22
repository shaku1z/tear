const CHAPTER_FONT_PROBES = Object.freeze([
  "600 40px 'Barlow Condensed'",
  "400 20px 'IBM Plex Mono'",
  "500 20px 'IBM Plex Mono'",
] as const);

/** Best-effort font warming; canvas rendering keeps its CSS fallbacks on failure. */
interface FontDocument {
  readonly fonts?: Pick<FontFaceSet, "load" | "ready">;
}

export async function warmChapterFonts(documentObject: FontDocument): Promise<boolean> {
  const fonts = documentObject.fonts;
  if (fonts === undefined) return false;
  try {
    await Promise.all(CHAPTER_FONT_PROBES.map(async (probe) => fonts.load(probe)));
    await fonts.ready;
    return true;
  } catch {
    return false;
  }
}
