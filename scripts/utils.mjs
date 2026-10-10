import { MODULE_ID, SETTING_KEYS } from "./config.mjs";

/**
 * Whether calendar day-change tracking is currently active.
 * @returns {boolean}
 */
export function isCalendarModeActive() {
  const override = game.settings.get(MODULE_ID, SETTING_KEYS.CALENDAR_MODE);
  if ( override !== "default" ) return override === "on";
  return isCalendariaActive() || isEmberActive() || !isManualRecoveryActive();
}

/* -------------------------------------------- */

/**
 * Return whether dnd5e's daily recovery is currently being handled manually rather than by the calendar.
 * @returns {boolean}
 */
function isManualRecoveryActive() {
  if ( !game.settings.settings.has("dnd5e.calendarConfig") ) return true;
  const cfg = game.settings.get("dnd5e", "calendarConfig");
  if ( !("dailyRecovery" in cfg) ) return true;
  return !cfg.enabled || cfg.manualRecovery;
}

/* -------------------------------------------- */

/**
 * Return whether the Ember module is active.
 * @returns {boolean}
 */
function isEmberActive() {
  return game.modules.get("ember")?.active ?? false;
}

/* -------------------------------------------- */

/**
 * Whether the Calendaria module is active.
 * @returns {boolean}
 */
function isCalendariaActive() {
  return game.modules.get("calendaria")?.active ?? false;
}
