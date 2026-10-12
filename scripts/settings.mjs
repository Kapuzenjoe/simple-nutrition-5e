import { CALENDAR_MODES, MODULE_ID, SETTING_KEYS } from "./config.mjs";

const { BooleanField, StringField } = foundry.data.fields;

/**
 * Settings definitions for Simple Nutrition 5e.
 * These entries are registered under {@link MODULE_ID} by {@link registerSettings}.
 */
const SETTINGS = [
  {
    config: true,
    name: "SIMPLE_NUTRITION.Settings.CalendarMode.Name",
    hint: "SIMPLE_NUTRITION.Settings.CalendarMode.Hint",
    key: SETTING_KEYS.CALENDAR_MODE,
    scope: "world",
    type: new StringField({
      initial: "default",
      required: true,
      choices: Object.fromEntries(Object.entries(CALENDAR_MODES).map(([key, mode]) => [key, mode.label]))
    })
  },
  {
    config: true,
    name: "SIMPLE_NUTRITION.Settings.DisableGroupSheet.Name",
    hint: "SIMPLE_NUTRITION.Settings.DisableGroupSheet.Hint",
    key: SETTING_KEYS.DISABLE_GROUP_SHEET,
    scope: "world",
    type: new BooleanField({ initial: false })
  },
  {
    config: true,
    name: "SIMPLE_NUTRITION.Settings.DisableActivityNutrition.Name",
    hint: "SIMPLE_NUTRITION.Settings.DisableActivityNutrition.Hint",
    key: SETTING_KEYS.DISABLE_ACTIVITY_NUTRITION,
    scope: "world",
    type: new BooleanField({ initial: false })
  }
];

/* -------------------------------------------- */

/**
 * Register all module settings.
 *
 * @returns {void}
 */
export function registerSettings() {
  for ( const { key, ...data } of SETTINGS ) {
    game.settings.register(MODULE_ID, key, data);
  }
}
