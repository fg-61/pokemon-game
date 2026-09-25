import type { Difficulty } from '../battle/ai';

export interface Settings {
  difficulty: Difficulty;
  atbMode: 'active' | 'wait';
  animSpeed: 1 | 1.5 | 2;
}

const KEY = 'pba.settings.v1';
const DEFAULTS: Settings = { difficulty: 'normal', atbMode: 'active', animSpeed: 1 };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

export const settings: Settings = load();

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}
