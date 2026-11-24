// Which of Muse Ember's scores the game plays: the default, or the one this browser picked on the music page.

export const DEFAULT_SCORE = "music-box";
const KEY = "tbmbc.score";

export function scorePref(): string {
  try {
    return localStorage.getItem(KEY) || DEFAULT_SCORE;
  } catch {
    return DEFAULT_SCORE;
  }
}

export function setScorePref(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {}
}
