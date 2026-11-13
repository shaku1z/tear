import type { UiPalette } from "./ui-contracts";

export function createUiState(colors: UiPalette) {
  return {
    ink: "#000", // live foreground colour (flipped to light on dark biomes by the game)
    // ---- TOKENS -------------------------------------------------------------
    t: {
      // Type scale. Barlow Condensed owns hierarchy/actions; IBM Plex Mono owns
      // prose and data. Names describe ROLE, not size, so screens
      // stay consistent: every screen title is `type.h1`, every tagline `type.caption`.
      type: {
        wordmark: 80, // the "T E A R" logo only
        display: 52, // full-screen splash headers (PAUSED, VICTORY, stage banner)
        h1: 40, // primary screen title (SHOP, ABILITIES, SELECT RUN, ...)
        h2: 30, // secondary title / dialog heading
        title: 24, // section / card name
        lead: 20, // buttons, emphasised values
        body: 16, // standard copy
        label: 15, // list rows, secondary copy
        caption: 14, // taglines, hints
        // Legibility floor: the smallest text a player must read. 13 logical px
        // renders at 10.4 CSS px in a 1280×720 window (×0.8 layout scale).
        micro: 13, // tags, pips, fine print
      },
      // spacing scale (px) — vertical rhythm + paddings
      space: { xs: 6, sm: 10, md: 16, lg: 24, xl: 40 },
      // Chapter typography roles (Pantheon VI). Bundled families with deterministic
      // Courier/Arial fallbacks; never hardcode these strings at call sites.
      font: {
        brand: "'Courier New', 'Nimbus Mono PS', 'Liberation Mono', monospace", // established Tear interface + wordmark
        display: "'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif", // condensed display titles
        body: "'IBM Plex Mono', 'Courier New', monospace", // readable mono lore
        displayWeight: 600,
        bodyWeight: 400,
        bodyMediumWeight: 500,
      },
      // letter-spacing roles (px, applied by manual tracking since canvas has no
      // letter-spacing before recent specs) and line-height roles (multipliers).
      track: { label: 3.2, title: 0.5, body: 0.2 },
      lineH: { title: 1.02, body: 1.5 },
      // Living-biome chapter composition (authored at 1600×900; see chapter-layout.ts).
      // The text block lives in the upper sky of one side, above every stage's
      // platforms, on the main-menu rail's soft dark fade (never a panel).
      chapter: {
        safeMargin: 48,
        safeVW: 0.06, // max(48, 6vw)
        bodyColW: 580,
        titleMaxW: 860, // ~50 mono chars per line; titles may run wider
        labelY: 92,
        titleGap: 20,
        ruleGap: 12,
        captionGap: 34,
        bodyGap: 34,
        bodyMaxLines: 4, // longer pages step the body size down to `bodyFloor`
        floorY: 800, // the arena floor (CONFIG.world.groundY): the fade never paints below it
        promptY: 855, // prompt baseline, centred in the floor band under the arena
        ruleW: 72,
        tickW: 7,
        tickActiveW: 18,
        tickGap: 6,
        tickLead: 18,
        // the sky haze: an ellipse from the upper corner whose radius puts the text's far
        // edge (+ `fadeHold`) and `hazeDepth` at `hazeReach`; dense to `hazeCore`, clear at 1
        fadeHold: 40,
        hazeDepth: 270,
        hazeReach: 0.78,
        hazeCore: 0.5,
        fadeTail: 640, // the finale epilogue's rail fade clears this far past its text
        skyInk: "#12131a", // chapter ink on a light sky (the biome ink of the light stages)
        revealRest: 0.55, // how much fade remains once the biome name has resolved
      },
      // chapter type roles (logical px at desktop density; touch raises them to the floor)
      chapterType: {
        label: 15,
        title: 64,
        titleFloor: 44,
        caption: 14,
        body: 19,
        bodyFloor: 17,
        line: 17,
        prompt: 14,
        bodyLineHeight: 1.55,
        titleLineHeight: 1.0,
      },
      // component metrics
      metric: {
        // HUD: the vitals bar width, group padding, and how many abilities list
        // before the HUD collapses them into one summary line (full list: pause)
        hudBarW: 320,
        hudPad: 10,
        hudAbilityRows: 4,
        // main-menu rail fade: its width from the screen's left edge (desktop rail)
        // and where the mid stop sits along it (fraction of the width)
        railFadeW: 800,
        railFadeMid: 0.56,
        btnH: 48,
        btnW: 300,
        btnGap: 12,
        btnRound: 0,
        panelPad: 14,
        chipH: 28,
        chipW: 96,
        barH: 14,
        cardRound: 0,
        // boss theater: shared HUD + cinematic proportions. Ratios remain tokens so
        // callers can resize the surfaces without rebuilding their internal layout.
        bossHudH: 16,
        bossSegments: 10,
        bossNotchH: 6,
        bossBorderW: 2,
        bossGlow: 8,
        bossGuardH: 6,
        bossGuardGap: 10,
        bossGuardScale: 0.6,
        bossShimmerW: 112,
        bossCrackJut: 10,
        bossIntroBarH: 96,
        bossIntroAccentHalfW: 150,
        bossIntroAccentH: 3,
        // every line of the card sits inside its letterbox bar (96): the name and
        // epithet in the lower bar, the spoken opening line in the upper bar
        bossIntroTitleBottom: 48,
        bossIntroAccentBottom: 37,
        bossIntroEpithetBottom: 14,
        bossIntroOpeningTop: 58,
        bossVignetteFocusY: 0.46,
        bossVignetteInner: 0.18,
        bossVignetteOuter: 0.72,
        // phase banner centre (fraction of the view height): below the boss header, never over its bar
        bossPhaseBannerW: 760,
        bossPhaseBannerH: 72,
        bossPhaseBannerY: 0.34,
        bossPhaseAccentH: 3,
        cinemaBarH: 74,
        cinemaDialogueW: 780,
        cinemaDialogueH: 104,
        cinemaDialogueBottom: 96,
        cinemaDialoguePad: 18,
        cinemaProgressH: 3,
        cinematicPromptBottom: 54,
        finalRewardW: 760,
        finalRewardH: 390,
        finalRewardSigilR: 54,
        finalRewardRuleW: 310,
        finalRewardPromptBottom: 34,
        finalFractureW: 680,
        finalFractureH: 12,
        rallyInset: 2,
        settingsTop: 182,
        settingsContentInset: 40,
        settingsColumnGap: 40,
        settingsRowH: 58,
        settingsControlW: 252,
        settingsControlH: 42,
        settingsStepperW: 54,
        // keyboard/controller focus ring: stroke width and gap outside the control
        focusRing: 2,
        focusGap: 3,
        // smallest interactive control; touch raises it to the 44 CSS px floor
        minTarget: 32,
        // the shared page pattern (sheet-relative, see screen-primitives `page`)
        pageTitleY: 92,
        pageBodyTop: 156,
        pageFooterH: 84,
        backW: 220,
      },
      // opacity roles for de-emphasised text
      alpha: {
        // Text roles are measured on their real surfaces: muted (secondary) ≥ 4.5:1
        // and faint (tertiary) ≥ 3:1 on the solid sheet and on the dark rail.
        full: 1,
        soft: 0.78,
        muted: 0.66,
        faint: 0.52,
        ghost: 0.25,
        // content surfaces: the sheet is effectively solid; the main-menu rail is a
        // soft fade (rail at the screen edge, railMid at the mid stop, then clear)
        // and each dark-surface ghost control adds its own fill (railControl)
        sheet: 0.96,
        rail: 0.9,
        railMid: 0.6,
        railControl: 0.42,
        modalDim: 0.9,
        bossTrack: 0.2,
        bossGuardTrack: 0.16,
        bossNotch: 0.9,
        bossFlash: 0.85,
        cinemaBar: 0.88,
        cinemaVignette: 0.3,
        cinemaSubtitle: 0.75,
        bossPhasePanel: 0.82,
        // cinematic prompts read at ≥ 7:1 on the cinema field (0.58 measured ~4.3:1)
        cinemaPanel: 0.9,
        cinemaHint: 0.8,
        // chapter text roles on the chapter fade: caption, intro line and prompt
        chapterCaption: 0.72,
        chapterLine: 0.86,
        chapterPrompt: 0.86,
        chapterHaze: 0.6,
        finalRewardDim: 0.78,
        finalRewardPanel: 0.96,
        finalRewardGhost: 0.18,
        rallyBase: 0.72,
        rallyPulse: 0.18,
        // In-run teaching card surface (tutorial lesson, playground help); the HUD
        // itself has no plates: its text sits directly on the scene in the biome ink
        hudPlate: 0.8,
      },
      // colour ROLES (semantic). `ink`/`paper` are the fg/bg pair; the rest pull
      // from the game palette so the system and the game never drift apart.
      color: {
        paper: "#fff",
        muted: "#62646f", // de-emphasised text / hairlines (5.9:1 on paper)
        disabled: "#bbb", // disabled controls
        cinema: "#06070c", // fixed dark field for cinematic boss chrome
        cinemaInk: "#f1eff9", // title ink on the cinematic field
        cinemaMuted: "#c9ccd6",
        // guaranteed-contrast modal pair: a dark scrim and the light ink drawn on it
        scrim: "#06070c",
        scrimInk: "#f1eff9",
        // main-menu rail fade colour and its foreground
        rail: "#06070c",
        railInk: "#f1eff9",
        guard: "#e0a326", // posture / guard-break meter
        get rally() {
          return colors.bomber;
        },
        get accent() {
          return colors.perfect;
        },
        get danger() {
          return colors.charger;
        },
        get unique() {
          return colors.perfect;
        },
      },
      motion: {
        bossPhaseFlash: 0.7,
        bossShimmerCycle: 2.4,
        bossGuardPulse: 14,
        bossIntroIn: 0.25,
        bossIntroOutAt: 0.82,
        bossIntroOutSpan: 0.18,
        bossIntroAccentDelay: 0.15,
        bossIntroAccentGrow: 0.5,
        cinemaFrameIn: 0.45,
        cinemaDialogueIn: 0.22,
        chapterIn: 0.6, // the chapter header and its fade breathe in
        // Living-biome chapter timings. Pages hold for a reading dwell computed
        // from their words (chapter-controller.ts); these are the transitions.
        chapterPageCross: 0.35,
        loreReveal: 0.6,
        loreExit: 0.45,
        biomeRevealFull: 1.8,
        biomeRevealBrief: 1.1,
        readyFull: 1.5,
        readyBrief: 1.0,
        finalRewardIn: 0.34,
        rallyPulse: 9,
      },
    },
  };
}

export type UiTokens = ReturnType<typeof createUiState>["t"];
