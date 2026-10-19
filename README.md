# Seraphim Vanguard

A retro NES-style vertical space shooter for phone browsers. Built with Phaser 3, TypeScript and Vite.

**Play:** https://the3dninja.github.io/seraphim-vanguard/

## How to play

- **Drag anywhere** to move the ship. It follows your finger's movement, so your thumb never covers it.
- Your ship **fires on its own**.
- Shoot enemies to drop **credits** (bronze, silver and gold bars), then spend them at the **vendor** station halfway through each level.
- Tap an **item button** (bottom right, one per item slot) to use that item.
- On a computer: arrow keys or WASD to move, Space to use your first item, 1/2/3 for a specific item slot.

Progress saves automatically in your browser each time you reach Base, and whenever you change your ship or buy an upgrade there.

Playtest helpers (add to the end of the link, combine with `&`):

- `?god`: your ship can't be destroyed.
- `?rich`: tops your credits up to 5000 when you reach Base, for trying upgrades.
- `?level=3`: sets your next mission to level 3 (any built level works) when you reach Base.
- `?test`: combat test mode. Tap the gear button at the bottom to pause and switch looping enemy wave sequences on or off (they stack) and to put any weapon in slot 1 or 2. The ship respawns with full health when destroyed, and nothing is saved or added to the Bestiary.

For example `https://the3dninja.github.io/seraphim-vanguard/?god&rich&level=3`.

## What's in this version

- Title screen with Continue / New Game
- Level 1, Outpost Run (the tutorial): Darts and Weavers, a vendor stop halfway, and a final wave
- Level 2, Scrapyard Belt: Scrap Drone swarms, Gunboats that park and fire spreads, and drifting wrecks that block shots from both sides
- Level 3, Kessel Asteroids: rocks that split when shot, Bombers that lay mines, and the **Rockjaw** mini boss. Break off its three armor plates to expose the core; it throws boulders, and fires spreads once its core is bare. Now and then it switches from swaying to a diving figure eight, and it moves 25% faster once the core is bare. Its health bar is the core; a thinner blue bar under it shows the armor (the Sporeheart's petals show the same way). It drops 175 credits
- Level 4, Ice Ring of Halva: falling ice shards, ice sheets that send the ship sliding, Drillers that line up and ram from the sides, and Vossari Lancers that blink a warning line before firing a beam down it
- Level 5, Vossari Blockade: Bulwarks behind shields that soak up shots until they break, capital ship guns that lean in from the screen edges, and **Admiral Kade's Dreadnought**. Destroy its four turrets; then its bridge sweeps two lasers in from the sides (2 damage a hit) and drops its shield while they fire, so hit it from the lane under it. It drops 450 credits
- Level 6, Solar Forge: **Vossari Carriers** park and launch four Darts each, and solar flares sweep down the screen. A shelter rock drifts in before each flare; sit in the dark lane under it
- Level 7, Ember Nebula: **Mine Layers** seed proximity mines that burst when you get close, and lightning strikes down a column after it flashes
- Level 8, Silent Relay: **Phantoms** cloak (shots pass through them) and decloak to fire, laser fences blink on and off as they scroll down (cross while off), and **The Watcher** mini boss. It cloaks, then decloaks beside decoy afterimages; only the real one takes damage (decoys look a shade fainter and flicker). Below two thirds health it brings three decoys that fire too, and seeds mines. Below a third it starts the Hall of Mirrors: four copies sway in a row and swap places, taking turns to lock a beam onto the ship, while the real one fires spreads. It drops 175 credits
- Level 9, Blight Colony: the Hollow appears. **Spore Pods** burst into Seekers when destroyed, mixed in with Vossari ships, and spore clouds drift down the screen
- Level 10, Throne of Voss: **Tendrils** join in, blast doors slide across the screen, and **Emperor Voss, Possessed**. His flagship hides behind a shield that ion breaks fast; when the hull gives out, the Hollow parasite tears free, lunges at the ship and lays Spore Pods. Plasma burns it. It drops 450 credits
- Level 11, The Rift: starts in normal space with Vex's raiders flying as wingmen. Where the vendor would arrive, the station stops above the ship, the rift tears open and pulls both in. A shorter segment inside alien space follows, then the vendor, then the final leg. **Broodlings** swarm, **Husks** split into Seekers, and gravity wells pull the ship and bend shots
- Level 12, Hive Reef: coral walls cut across the screen (shots carve through them), and **Mimics** copy the ship's look
- Level 13, Black Bloom: the screen is dark except a pool of light around the ship and glowing enemies, and the **Brood Queen** mini boss. She lays pods, fires fans, flickers and charges, and heals if you stop hitting her. Plasma hurts her most. It drops 175 credits
- Level 14, Maw Gate: the Vossari fleet fights in the background, three wingmen fly with you, and tentacles sweep in from the sides. Hollow enemies warp in to the top half of the screen, each announced by a forming warp circle that blinks away as it arrives: a third of the way in and just before the vendor, then after the vendor every 15 to 25 s, closing to every 10 to 15 s, until two thirds of the way, and a last warp-in of twice as many, with bigger, brighter circles, at seven eighths
- Level 15, Heart of the Hollow: the longest run, with no vendor, in five legs that flow straight into each other (nothing is cleared and the scenery fades from one to the next). Arteries, tentacles, coral and gravity wells first; then a **living tunnel** that narrows, winds back and forth and opens into chambers (its walls hurt and stop shots); then a **spore haze** and **The Sporeheart** mini boss (shoot off its petals, hit the core while it's open); then **walls of growth** to shoot through, with **eggs** that hatch into **Larvae** if not burned in time, and **The Brood Wyrm** mini boss (only the head can kill it; it lays eggs and dives at you); then **The Hollow Mind**. Shoot its six eyes, break its membrane, burn its core, then it splits open into a maw that makes black holes (they pull the ship and eat shots) and warps space. Between phases it retreats and calls its brood. It ends the campaign
- **Side missions**: ten optional levels on small moons beside levels 2, 4, 7, 8, 9, 12 and 14 (one beside 2, 7, 9 and 14, two beside the others), for extra credits before the boss levels. Each unlocks when you beat its level and stays open until you leave that system of five levels; flying a system's last level with side missions still open asks first. Pick one on the star map and Launch; you return to Base, and the map still shows your ship at the next level. After every mission you land on the star map; a SIDE MISSION UNLOCKED banner flashes near newly unlocked moons, and the first one is picked so its briefing shows. Storm Eye's moon has a stack of three gold bars in its corner until it's cleared. They mix enemies you've met in new ways, run from shorter than level 2 to just longer than level 6 (the description says which), and add their own hazards: scrap presses that slam shut, crosswinds, falling embers, blackouts and sweeping searchlights (hide behind satellite debris). Storm Eye's storm builds over the run, from lightning alone to embers, then a long peak with hot wind and two ember showers, and dies down over the last waves, leaving a little red in the sky. It ends with **treasure**: after a short calm a derelict cargo hauler drifts in; break it open for 225 credits before it gets three quarters of the way down, or it breaks up on its own and the credits are gathered in. Glacier Vault's ice builds as it goes, to twice the ice sheets and three times the shards by the end, and keeps coming through the boss fight. Three end in a mini boss in new colors: Frostjaw (half again Rockjaw's health and fire rate after its 1.8x boost; it sheds ice shards while armored and fires them in fans once its core is bare), the Hollow Watcher and the Brood Matriarch
- Levels 6 to 8 run about 50% longer than levels 1 to 5. Level 11's alien segment is a bit shorter than level 6's first segment and its final leg is 50% longer; levels 12 to 14 use that longer length for both segments, and level 15 is longer than two of them
- **Wingmen** (levels 11 to 14) each have their own gun: Vex fires bursts of three lasers, the Vossari wingman fires ion bolts that stun and jump to two more enemies, and the point ship lobs homing plasma that splashes. They stay with you through vendor stops (rolling down to the station with you) and fly off with you at the end
- **Credits**: at the end of a level, loose credits curve in toward the ship, turning harder the closer they get; a boss's gold bursts out as before and curves in too. The Credit Booster is rare early on (the Base vendor stocks it from level 4)
- **Damage types**: weapons do kinetic, laser, plasma, ion or explosive damage. Enemies and bosses take double from their weakness and half from what they resist (Target Scanner shows weaknesses as dots)
- **Weapons**: Pulse, Spread, Twin, Homing, Plasma, Ion (breaks shields, stuns), Wave, Rail (pierces), Flak (bursts), Side Guns, Rear Gun and Bio Seeker (burns; more damage each level than the others, two spores at level 3 and three at level 5). Hits look heavier as a weapon levels up: more sparks in its damage color, and from level 2 a flash ring that grows each level
- **Items**: Repair, Shield, Overdrive, Cluster Bomb, EMP, Decoy Flare, Credit Booster, Heal Drone, Full Repair, Nova, Time Warp and Rewind Beacon (restarts from the last checkpoint: the level start, the last vendor, or the start of a level 15 leg)
- **Active gear** has its own buttons above the item bar (Q and E on a keyboard): Dodge, Blink, Afterburner, Barrel Roll (reflects shots) and Burst. **Augments** change your shots: Incendiary Ammo, Ion Coating, Shaped Charges, Overcharger and Target Scanner. Anti-Missile shoots down shots near the ship
- **Upgrade kits** (Weapon Kit, Gear Kit) from vendors raise a weapon or gear a level; apply one on the spot or keep it and use it from the vendor's Sell tab or the Ship screen
- **Gear** (from level 6): Hull Plating (+2 max health) and Credit Magnet at the Base vendor; Deflector (absorbs a hit, recharges) and Satellite (an orbiting drone that fires) as in-level vendor exclusives. Gear slots 1 and 2 and gear levels 1 to 5 are in the Base vendor's Upgrade tab
- Item stacks show against their cap, like 1/3, in flight, on the vendor's slot strip and on the Ship screen
- The vendor lists 3 entries a page, each with a colored line saying what kind it is (Weapon, Gear, Augment, Upgrade, Item, Rare Item). The page arrows, the info box and Storage sit at fixed spots below the list, in that order. In-level vendors (the station scrolls in under the ship as it rolls and sinks into it) have Buy, Sell and **Repair** tabs; Repair fixes hearts for a price per heart. In-level stock leans toward stronger gear as the levels go on, with a small chance of something strong early
- Base menu: your ship sits in the middle (tap it for the Ship screen), with picture tiles in the corners for Shop (the vendor), Map, Foes (the Bestiary) and Options (not built yet), and a Launch bar below
- **Bestiary**: every enemy and boss, one faction per page in story order (Raiders, Drone Swarm, Kessel Beasts, Vossari Empire, The Hollow over two pages); swipe left or right, or use the arrows, to turn pages. Pictures fill the top half at their in-game size (only bosses too big for a tile are shrunk); tap one to read its name, weaknesses and resistances, a short description, how many you've destroyed, and whether it's a boss. Enemies you haven't faced show as ? and read UNDISCOVERED, and a faction stays ??? until you've faced one of its members. Kills and sightings are saved, and kept even when the ship is lost
- Base vendor **Upgrade** tab: Hull plates (+1 max health, up to 10), a second weapon slot (both weapons fire), item slots 2 and 3, and weapon levels 1 to 5 (more damage each level; faster fire at level 3; twin shots or 5-way spread at level 5)
- Star map: all 15 levels on a route, with side mission moons beside them. The next level is picked, and you can tap the one after it (or any cleared level, or a side mission) to read about it, then Launch the next level or an open side mission. Common enemies show, unlabeled under the description, as icons with 1 to 3 pips for how many there are; enemies you haven't met show as ?
- Ship screen: drag weapons, gear and items from Base Storage onto the ship's slots (or tap one, then tap a slot; arrow keys and Enter work too). Locked slots show their price
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
| `src/dreadnought.ts` | The level 5 boss |
| `src/watcher.ts` | The level 8 mini boss |
| `src/voss.ts`, `src/broodqueen.ts`, `src/hollowmind.ts` | The level 10 boss, level 13 mini boss and final boss |
| `src/heart.ts`, `src/sporeheart.ts`, `src/wyrm.ts` | Level 15's tunnel and walls of growth, and its two mini bosses |
| `src/data/sides.ts`, `src/sidehaz.ts` | Side missions and their hazards |
| `src/act3.ts` | Hollow hazards for levels 9 to 15 |
| `src/data/enemies.ts` | Enemy health, speed, weaknesses and resistances |
| `src/inventory.ts` | Slots, storage, selling and Base vendor upgrades |
| `src/data/items.ts` | Weapons, gear and consumables, prices and stats |
| `src/art.ts`, `src/art3.ts` | Pixel sprites as text grids (art3 holds levels 9 to 15) |
| `src/save.ts` | Autosave to browser storage |
