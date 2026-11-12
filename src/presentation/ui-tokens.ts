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
                displayWeight: 600, bodyWeight: 400, bodyMediumWeight: 500,
            },
            // letter-spacing roles (px, applied by manual tracking since canvas has no
            // letter-spacing before recent specs) and line-height roles (multipliers).
            track: { label: 3.2, title: 0.5, body: 0.2 },
            lineH: { title: 1.02, body: 1.5 },
            // Living-biome chapter layout (authored at 1600×900, scaled by the caller).
            chapter: {
                safeMargin: 48, safeVW: 0.06, // max(48, 6vw)
                bodyColW: 580, cpl: [45, 68], // body column + target chars/line
                washDim: 0.26, // world loses ~26% (not 72%) — biome stays legible
                washSpan: 0.52, // fraction of width the ink-wash covers on its side
                washDark: "rgba(6,7,12,0.82)", washLight: "rgba(248,247,244,0.90)",
                labelGap: 34, titleGap: 30, loreGap: 42, progressGap: 22, promptGap: 30,
                fragStagger: 0.05, fragStaggerCap: 0.18,
            },
            // component metrics
            metric: {
                hudTextOutline: 3,
                // HUD: the vitals bar width, plate padding, and how many abilities list
                // before the HUD collapses them into one summary line (full list: pause)
                hudBarW: 320, hudPad: 10, hudAbilityRows: 4,
                btnH: 48, btnW: 300, btnGap: 12, btnRound: 0,
                panelPad: 14, chipH: 28, chipW: 96, barH: 14, cardRound: 0,
                // boss theater: shared HUD + cinematic proportions. Ratios remain tokens so
                // callers can resize the surfaces without rebuilding their internal layout.
                bossHudH: 16, bossSegments: 10, bossNotchH: 6, bossBorderW: 2, bossGlow: 8,
                bossGuardH: 6, bossGuardGap: 10, bossGuardScale: 0.60,
                bossShimmerW: 112, bossCrackJut: 10,
                bossIntroBarH: 96, bossIntroAccentHalfW: 150, bossIntroAccentH: 3,
                bossIntroTitleBottom: 34, bossIntroAccentBottom: 22, bossIntroEpithetBottom: 2, bossIntroOpeningBottom: 76,
                bossVignetteFocusY: 0.46, bossVignetteInner: 0.18, bossVignetteOuter: 0.72,
                bossPhaseBannerW: 760, bossPhaseBannerH: 72, bossPhaseBannerY: 0.24,
                bossPhaseAccentH: 3,
                cinemaBarH: 74, cinemaDialogueW: 780, cinemaDialogueH: 104,
                cinemaDialogueBottom: 96, cinemaDialoguePad: 18, cinemaProgressH: 3,
                cinematicPromptBottom: 54,
                finalRewardW: 760, finalRewardH: 390, finalRewardSigilR: 54,
                finalRewardRuleW: 310, finalRewardPromptBottom: 34, finalFractureW: 680, finalFractureH: 12,
                rallyInset: 2,
                settingsTop: 182, settingsContentInset: 40, settingsColumnGap: 40,
                settingsRowH: 58, settingsControlW: 252, settingsControlH: 42, settingsStepperW: 54,
                // keyboard/controller focus ring: stroke width and gap outside the control
                focusRing: 2, focusGap: 3,
                // smallest interactive control; touch raises it to the 44 CSS px floor
                minTarget: 32,
                // the shared page pattern (sheet-relative, see screen-primitives `page`)
                pageTitleY: 92, pageBodyTop: 156, pageFooterH: 84, backW: 220,
            },
            // opacity roles for de-emphasised text
            alpha: {
                // Text roles are measured on their real surfaces: muted (secondary) ≥ 4.5:1
                // and faint (tertiary) ≥ 3:1 on the solid sheet and on the dark rail.
                full: 1, soft: 0.78, muted: 0.66, faint: 0.52, ghost: 0.25,
                // content surfaces: the sheet and the main-menu rail are effectively solid
                sheet: 0.96, rail: 0.92, modalDim: 0.9,
                bossTrack: 0.20, bossGuardTrack: 0.16, bossNotch: 0.90, bossFlash: 0.85,
                cinemaBar: 0.88, cinemaVignette: 0.30, cinemaSubtitle: 0.75,
                bossPhasePanel: 0.82,
                cinemaPanel: 0.90, cinemaHint: 0.58,
                finalRewardDim: 0.78, finalRewardPanel: 0.96, finalRewardGhost: 0.18,
                rallyBase: 0.72, rallyPulse: 0.18,
                // HUD backing plate: keeps values ≥ 4.5:1 and labels ≥ 3:1 over any biome
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
                scrim: "#06070c", scrimInk: "#f1eff9",
                // main-menu rail backing and its foreground
                rail: "#080a10", railInk: "#f1eff9",
                guard: "#e0a326", // posture / guard-break meter
                get rally() { return colors.bomber; },
                get accent() { return colors.perfect; },
                get danger() { return colors.charger; },
                get unique() { return colors.perfect; },
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
                cinemaFrameIn: 0.45, cinemaDialogueIn: 0.22,
                chapterIn: 0.22,
                // Living-biome chapter timings (Pantheon VI P3)
                chapterPageCross: 0.26, loreReveal: 0.32, loreExit: 0.36,
                biomeRevealFull: 1.6, biomeRevealBrief: 1.0, readyFull: 0.9, readyBrief: 0.65,
                finalRewardIn: 0.34,
                rallyPulse: 9,
            },
        },
  };
}

export type UiTokens = ReturnType<typeof createUiState>["t"];
