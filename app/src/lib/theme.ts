// Preferencia de tema (Automático/Claro/Oscuro), local a este dispositivo.

export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'chill-duck-theme';

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Aplica la preferencia al documento (data-theme), sin tocar localStorage. */
export function applyTheme(pref: ThemePref): void {
  if (pref === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = pref;
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // localStorage bloqueado (navegación privada): el tema se aplica igual, solo no persiste.
  }
  applyTheme(pref);
}
