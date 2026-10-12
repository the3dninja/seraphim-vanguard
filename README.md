# Seraphim Vanguard

A retro NES-style vertical space shooter for phone browsers. Built with Phaser 3, TypeScript and Vite.

**Play:** https://the3dninja.github.io/seraphim-vanguard/

## How to play

- **Drag anywhere** to move the ship. It follows your finger's movement, so your thumb never covers it.
- Your ship **fires on its own**.
- Shoot enemies to drop **credits**, then spend them at the **vendor** stations between segments.
- Tap the **item button** (bottom right) to use the item in your slot.
- On a computer: arrow keys or WASD to move, Space to use your item.

Progress saves automatically in your browser each time you reach Base.

Playtest helper: add `?god` to the end of the link and your ship can't be destroyed.

## What's in this first version

- Title screen with Continue / New Game
- Level 1 (the tutorial): three action segments with Darts and Weavers, two vendor stops, and a final wave
- Vendor stop arrival sequence and a shop with Buy and Sell tabs
- Base menu: Vendor and Ship screens work; Star Map is a placeholder
- Ship screen: drag weapons and items from Base Storage onto the ship's slots (or tap one, then tap a slot; arrow keys and Enter work too). Extra slots show as locked until they can be bought at the Base vendor
- Placeholder pixel art drawn in code (`src/art.ts`), placeholder prices (`src/data/items.ts`)

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
| `src/scenes/` | Title, Game (the level), Vendor, Base, Ship |
| `src/data/levels.ts` | Wave scripts for each level segment |
| `src/data/items.ts` | Weapons and consumables, prices and stats |
| `src/art.ts` | Pixel sprites as text grids |
| `src/save.ts` | Autosave to browser storage |
