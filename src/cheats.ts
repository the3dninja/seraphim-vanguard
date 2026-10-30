import { LEVELS } from './data/levels';
import { loadSave, writeSave } from './save';

// The Cheat Menu, at the bottom of the pause menu, for playtesting. It only
// shows in development, or with ?cheats (or ?test, or ?edit) on the link. Cheats last
// until the page is reloaded; ?god starts with God Mode on.
const params = new URLSearchParams(location.search);

export const cheatsEnabled = () => import.meta.env.DEV || params.has('cheats') || params.has('test') || params.has('edit');

export const cheats = {
  god: params.has('god'), // nothing hurts the ship
  demigod: false, // hits hurt, but the ship comes straight back with full health when destroyed
  speed: 1 as 1 | 2 | 4, // how many game steps run each frame
  infiniteItems: false, // using an item doesn't use it up
  unlockAll: false, // every level is open on the star map
};

// The next level is the last one, so every level can be flown from the star
// map and the side missions beside them are open. The save is changed now,
// and Base keeps it for the rest of the session (a mission in flight started
// from the old save).
export function unlockAllLevels() {
  cheats.unlockAll = true;
  const save = loadSave();
  if (save && save.level < LEVELS.length) {
    save.level = LEVELS.length;
    writeSave(save);
  }
}
