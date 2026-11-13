# TEAR: BLADE — Controller & Navigation QA checklist

## Authority metadata

- **Owner:** QA owner
- **Status:** Active
- **Closure condition:** All listed controller and navigation checks pass on the supported standalone and CrazyGames builds, with the exact pad/preset and evidence recorded.
- **Branch policy:** Start each change from protected `main` in a short-lived `codex/*` branch; historical branches are references only and never live development targets.

Manual pass to run with a real controller (DualSense / Xbox / generic XInput) on
the standalone build and inside the CrazyGames iframe. Covers everything shipped
in Controller P1–P7. Tick each; note the preset + pad used.

## 1. Preset gameplay (test each of the 5 presets — Settings ▸ Controls)
For **Default / Standard / Tear / Classic / Split**:
- [ ] Jump, Dash, Throw, Recall, Tighten Tether, Release Tether, Pause all work.
- [ ] Tether tightens while held (Hold mode) and the blade eases in.
- [ ] **Tear**: face buttons do NOTHING in gameplay, but Cross confirms / Circle backs in menus.
- [ ] Movement on both left stick and D-pad; Up jumps; Down drops through; dash steers mid-dash.
- [ ] Right stick aims the blade the whole time (never interrupted by an action button).

## 2. Tether safety (regression-critical)
- [ ] Release the tether button → blade un-tightens immediately.
- [ ] Disconnect the pad while tether held → tether releases (blade not stuck tight).
- [ ] Open a menu while tether held → tether releases.
- [ ] Alt-tab (blur) while tether held → tether releases on return.
- [ ] Switch preset while holding the tether button → no stuck tether, no phantom dash.
- [ ] Mouse left-hold still tethers with a pad connected (channels don't clobber).

## 3. Tether TOGGLE mode (Settings ▸ Controls ▸ Tether behavior = TOGGLE)
- [ ] Press once → tether latches ON; press again → OFF.
- [ ] Throwing releases the latch; pausing releases it; death/disconnect release it.

## 4. Directional double-tap dash (OFF by default; enable to test)
- [ ] Two quick Left taps → dash left; two Right taps → dash right.
- [ ] A single tap or a slow double never dashes; holding a direction never dashes.
- [ ] The bound Dash button still works independently.
- [ ] OFF by default on a fresh profile.

## 5. Menu navigation (every screen, D-pad AND left stick)
- [ ] Up / Down / Left / Right all move focus.
- [ ] Quick tap moves once; hold repeats; neutral resets; direction change is immediate.
- [ ] Analog diagonal resolves to ONE axis (no double-step); stick drift never navigates.
- [ ] Cross confirms after both horizontal and vertical moves; Circle backs from every screen.
- [ ] **Grids** (upgrade draft, tier-up, Codex ability/bestiary cards): Left/Right change column,
      Up/Down change row; edges fall back to a sensible wrap, never a dead end.

## 6. Scroll + tabs + paging
- [ ] Right stick scrolls the active list (Settings, Codex article, Arsenal, Achievements, replays).
- [ ] Scroll is smooth/curved and axis-locked (vertical stick doesn't drift horizontally).
- [ ] L2 / R2 page up / down on long lists.
- [ ] L1 / R1 switch tabs on Codex, Profile, Leaderboards, and Settings — no wraparound at the ends.
- [ ] Each tab restores its own scroll; the "L1 ‹ … › R1" hint shows while a pad owns the UI.

## 7. Input modality / cursor ownership
- [ ] Using the pad hides the mouse cursor; moving the mouse (>5px) brings it back.
- [ ] Resting-stick drift does NOT steal ownership from the mouse.
- [ ] Touch tap is not misread as a mouse click; keyboard shares the strong focus halo with the pad.

## 8. Tabbed Settings + preset selector
- [ ] Five tabs: General, Controls, Audio, Video, Accessibility — reachable with pad only.
- [ ] Controls tab scrolls to reach every row.
- [ ] Controller Preset row cycles all 5, applies instantly, saves, updates the map/pitch line.
- [ ] Deadzones, aim sensitivity, vibration (with preview), glyph style, control mode all take effect.
- [ ] Vibration OFF silences rumble; low/medium/high scale it. Glyphs match the connected pad on Auto.

## 9. Auto-pause on disconnect (Settings ▸ General, default ON)
- [ ] Unplug the active pad mid-run → the game pauses (does not let the player die reconnecting).
- [ ] Turning the setting OFF disables the auto-pause.

## 10. Persistence & fallback
- [ ] Preset + all controller settings survive a reload.
- [ ] Missing/invalid stored preset falls back to Default; existing players are NOT silently migrated.
- [ ] QA passes on DualSense, Xbox, and a generic XInput pad, standalone and in the CG iframe.

## Automated coverage and remaining evidence
- Tutorial action prompts and the Codex controller guide use `PAD.bindingLabel()`;
  setup, tab hints, and Settings previews use `PAD.glyph()`. READ THE CHARGE shows
  the evade control only; FIELD TEST shows the evade-then-punish controls.
- Adapter regressions cover held-trigger preset changes, blur with a released or
  still-held tether button, immediate menu direction changes, and analog-trigger
  input ownership. These checks preserve the five shipped presets and fixed
  keyboard bindings; there is no keyboard-remapping feature.
- Automated and synthetic browser evidence does not close the unchecked hardware
  rows above: DualSense / Xbox / generic XInput × five presets × standalone / the
  CrazyGames iframe remains a 30-combination physical pass. Record the actual
  device, preset, build, target, and result for each combination.
- Real mobile touch usability and human feel/visual acceptance remain separate
  evidence; emulated touch, fullscreen checks, and screenshot capture do not
  establish them.

## Known follow-ups (not in this pass)
- Per-biome chapter motif art and the Source HUD-bar fracture (Pantheon VI deferred visual pass).
