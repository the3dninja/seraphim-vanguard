# Seraphim Vanguard

A retro NES-style vertical space shooter for phone browsers. Built with Phaser 3, TypeScript and Vite.

**Play:** https://the3dninja.github.io/seraphim-vanguard/

## How to play

- **Drag anywhere** to move the ship. It follows your finger's movement, so your thumb never covers it.
- Your ship **fires on its own**.
- Shoot enemies to drop **credits** (bronze, silver and gold bars), then spend them at the **vendor** stations between segments.
- Tap an **item button** (bottom right, one per item slot) to use that item.
- On a computer: arrow keys or WASD to move, Space to use your first item, 1/2/3 for a specific item slot.

Progress saves automatically in your browser each time you reach Base, and whenever you change your ship or buy an upgrade there.

Playtest helpers (add to the end of the link, combine with `&`):

- `?god`: your ship can't be destroyed.
- `?rich`: tops your credits up to 5000 when you reach Base, for trying upgrades.
- `?level=3`: sets your next mission to level 3 (any built level works) when you reach Base.

For example `https://the3dninja.github.io/seraphim-vanguard/?god&rich&level=3`.

## What's in this version

- Title screen with Continue / New Game
- Level 1, Outpost Run (the tutorial): Darts and Weavers, two vendor stops, and a final wave
- Level 2, Scrapyard Belt: Scrap Drone swarms, Gunboats that park and fire spreads, and drifting wrecks that block shots from both sides
- Level 3, Kessel Asteroids: rocks that split when shot, Bombers that lay mines, and the **Rockjaw** mini boss. Break off its three armor plates to expose the core; it throws boulders, and fires spreads once its core is bare. It drops 150 credits
- Vendor stop arrival sequence and a shop with Buy and Sell tabs
- Base menu: Vendor, Ship, View Map and Begin Mission
- Base vendor **Upgrade** tab: Hull plates (+1 max health, up to 10), a second weapon slot (both weapons fire), item slots 2 and 3, and weapon levels 1 to 5 (more damage each level; faster fire at level 3; twin shots or 5-way spread at level 5)
- Star map: all 15 levels on a route. The next level is picked, and you can tap the one after it (or any cleared level) to read about it. Common enemies show as icons with 1 to 3 pips for how many there are; enemies you haven't met show as ?
- Ship screen: drag weapons and items from Base Storage onto the ship's slots (or tap one, then tap a slot; arrow keys and Enter work too). Locked slots show their price
- Placeholder pixel art drawn in code (`src/art.ts`), placeholder prices (`src/data/items.ts`, `src/inventory.ts`)

The full design is in the "Space Shooter Design Spec" doc in the Simple Games project.

## Working on it

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev      # local server; open the printed address on your phone (same Wi-Fi) or computer
npm run build    # production build into dist/
```

Every push to `main` rebuilds the game and publishes it to the play link above (see `.github/workflows/deploy.yml`).

## Where things live

| Path | What it is |
| --- | --- |
| `src/main.ts` | Game setup: resolution, scaling, scene list |
| `src/scenes/` | Title, Game (the level), Vendor, Base, Ship, Map |
| `src/data/levels.ts` | All 15 levels: map info, and wave scripts for the built ones |
| `src/rockjaw.ts` | The level 3 mini boss |
| `src/inventory.ts` | Slots, storage, selling and Base vendor upgrades |
| `src/data/items.ts` | Weapons and consumables, prices and stats |
| `src/art.ts` | Pixel sprites as text grids |
| `src/save.ts` | Autosave to browser storage |
