// Where an editor playtest got to, so the scroll view can open there again.
// Kept apart from the editor so the game can set it without importing it.
export const playtestReached: { at: { segment: number; wave: number } | null } = { at: null };
