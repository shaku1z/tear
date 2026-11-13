# What the wiki move removed, and where it is

The wiki used to live in two places: an Astro and Starlight site in the separate repository
`shaku1z/tear-wiki`, and a one-page `tear-wiki/` folder in this repository. Both are replaced by this
`wiki/` folder. Nothing was rewritten out of history.

## Where the old site is

- The old Astro site and all its history stay in the repository `shaku1z/tear-wiki`, which the owner
  archives once a deploy from this repository is live. Its last commit before the rebuild is `7fa35d9`
  (`Sync game-reference for Tear 9e7d6a7`).
- Read any removed file with `git show 7fa35d9:<path>` in a clone of that repository.
- The rebuilt generator was first reviewed there as pull request 27 (`codex/wiki-rebuild`), never merged;
  it is the source of this folder.
- The one-page `tear-wiki/Weapons-and-Abilities.md` in this repository is removed; its content is the
  generated weapon pages.

## What was replaced

| Removed | Why | Now |
| --- | --- | --- |
| 62 hand-kept MDX pages | They repeated game facts by hand and drifted: "Aldric" for the Berserker King, "The Iron Colossus", "Ranged" for Shooter, wrong controls. | Pages generated from the game's export. The advice in them moved to `content/notes/` and `content/guides/`. |
| 35 Astro/Svelte components | They rendered the old reference. | `generator/render.mjs`. |
| The three-file game reference, its receipt and terminology file | No stats, no codex text, no shop, no controls. | The exporter, `pnpm export:wiki`. |
| The wiki dispatch, artifact publication and sync scripts, receipts and workflows | A game deploy dispatched a zip to a bot that promoted three files, the owner merged, then a manual deploy. The repositories are private, so pulling the game ref also failed. | Nothing: the site is built from the game commit it ships with. |
| The loadout builder ("Ability Lab") | Upgrade drafts are random: players are offered options and cannot pick any upgrade at will, so a planner described builds nobody can choose. It also checked no game rule. | `/builder/` redirects to `/upgrades/`, which lists every upgrade with its tiers and stacks. |
| 13 placeholder silhouettes, 2.6 MB of home-page brand art, the Starlight starter art | Not the game's art, and too heavy. | Pictures generated from the game (see README). |
| `public/admin/` (a CMS admin with no backend), unused data dumps, Starlight examples | Unused. | Nothing. |
