/**
 * Return whether dnd5e's daily recovery is currently being handled manually rather than by the calendar.
 * @returns {boolean}
 */
export function isManualRecoveryActive() {
  if ( isEmberActive() ) return false;
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
