/**
 * @import { NutritionCandidate, NutritionConfig, NutritionState, NutritionType } from "../_types.mjs";
 */

import {
  BASE_NEEDS,
  EMPTY_NUTRITION_CONFIG,
  EMPTY_NUTRITION_STATE,
  LITERS_PER_GALLON,
  MAGICAL_BERRIES_IDENTIFIER,
  MODULE_ID,
  NUTRITION_FLAG,
  SAVE_DC_LEGACY,
  SAVE_DC_MODERN,
  SETTING_KEYS,
  WATER_GALLONS_PER_POUND
} from "../config.mjs";

/**
 * Format a nutrition amount using the active display units.
 *
 * @param {NutritionType} type The nutrition type.
 * @param {number} value The nutrition amount.
 * @param {{ withUnit?: boolean }} [options]
 * @returns {string} The formatted amount.
 */
export function formatNutritionAmount(type, value, { withUnit = true }={}) {
  if ( type === "food" ) {
    const unit = game.dnd5e.utils.defaultUnits("weight");
    const converted = game.dnd5e.utils.convertWeight(value, "lb", unit);
    return withUnit
      ? game.dnd5e.utils.formatWeight(converted, unit, { maximumFractionDigits: 3, unitDisplay: "short" })
      : converted.toLocaleString(game.i18n.lang, { maximumFractionDigits: 3 });
  }
  if ( game.settings.get("dnd5e", "metricVolumeUnits") ) {
    const liters = value * LITERS_PER_GALLON;
    return withUnit
      ? game.dnd5e.utils.formatVolume(liters, "liter", { maximumFractionDigits: 3, unitDisplay: "short" })
      : liters.toLocaleString(game.i18n.lang, { maximumFractionDigits: 3 });
  }
  return withUnit
    ? game.dnd5e.utils.formatVolume(value, "gallon", { maximumFractionDigits: 3, unitDisplay: "short" })
    : value.toLocaleString(game.i18n.lang, { maximumFractionDigits: 3 });
}

/* -------------------------------------------- */

/**
 * Get the localized short abbreviation for a US gallon, matching what Intl's unit formatting produces.
 *
 * @returns {string} The localized gallon abbreviation.
 */
export function getGallonAbbreviation() {
  const parts = new Intl.NumberFormat(game.i18n.lang, { style: "unit", unit: "gallon", unitDisplay: "short" }).formatToParts(1);
  return parts.find(part => part.type === "unit")?.value ?? "gal";
}

/* -------------------------------------------- */

/**
 * Get the nutrition amount provided by one item.
 *
 * @param {Actor5e} actor The owning actor.
 * @param {NutritionType} type The nutrition type.
 * @param {Item5e} item The item being consumed.
 * @returns {number} The nutrition amount provided by one item.
 */
export function getNutritionAmount(actor, type, item) {
  if ( type !== "food" ) {
    const weight = game.dnd5e.utils.convertWeight(item.system.weight.value, item.system.weight.units, "lb");
    return weight * WATER_GALLONS_PER_POUND;
  }
  if ( item.system.identifier === MAGICAL_BERRIES_IDENTIFIER ) return getNutritionNeeds(actor).food;
  return game.dnd5e.utils.convertWeight(item.system.weight.value, item.system.weight.units, "lb");
}

/* -------------------------------------------- */

/**
 * Get the first usable activity that consumes the item itself, if nutrition can be recorded for its use.
 *
 * @param {Item5e} item The item being consumed.
 * @returns {Activity|null} The activity that consumes the item, or null if there is none.
 */
export function getConsumeActivity(item) {
  if ( game.settings.get(MODULE_ID, SETTING_KEYS.DISABLE_ACTIVITY_NUTRITION) ) return null;
  if ( (item.actor?.type !== "character") || (item.system.type.value !== "food") ) return null;
  return item.system.activities.find(activity => {
    return activity.canUse && activity.consumption.targets.some(target => consumesItem(item, target));
  }) ?? null;
}

/* -------------------------------------------- */

/**
 * Check whether a consumption target spends the item that owns the activity.
 *
 * @param {Item5e} item The item owning the activity.
 * @param {ConsumptionTargetData} target The consumption target to inspect.
 * @returns {boolean} True if the target spends the uses or quantity of the item itself.
 */
function consumesItem(item, target) {
  if ( target.type === "itemUses" ) return !target.target || (target.target === item.id);
  return (target.type === "material") && (target.target === item.id);
}

/* -------------------------------------------- */

/**
 * Get a localized amount hint for one consumable item.
 *
 * @param {Actor5e} actor The owning actor.
 * @param {NutritionType} type The nutrition type.
 * @param {Item5e} item The item being consumed.
 * @returns {string|null} A localized amount hint for one item.
 */
function getNutritionAmountLabel(actor, type, item) {
  if ( (type === "food") && (item.system.identifier === MAGICAL_BERRIES_IDENTIFIER) ) {
    return _loc("SIMPLE_NUTRITION.Dialog.AmountFullDay");
  }
  return formatNutritionAmount(type, getNutritionAmount(actor, type, item));
}

/* -------------------------------------------- */

/**
 * Build a nutrition candidate from an item.
 *
 * @param {Actor5e} actor The owning actor.
 * @param {NutritionType} type The nutrition type.
 * @param {Item5e} item The item being consumed.
 * @returns {NutritionCandidate} The constructed nutrition candidate.
 */
export function getNutritionCandidate(actor, type, item) {
  return {
    id: item.id,
    name: item.name,
    img: item.img,
    quantity: item.system.quantity,
    container: item.container?.name ?? null,
    amount: getNutritionAmountLabel(actor, type, item),
    value: getNutritionAmount(actor, type, item),
    noActivity: !game.settings.get(MODULE_ID, SETTING_KEYS.DISABLE_ACTIVITY_NUTRITION) && !getConsumeActivity(item)
  };
}

/* -------------------------------------------- */

/**
 * Get the actor-specific nutrition config.
 *
 * @param {Actor5e} actor The actor to inspect.
 * @returns {NutritionConfig} The stored nutrition config.
 */
export function getNutritionConfig(actor) {
  return getNutritionFlag(actor).config;
}

/* -------------------------------------------- */

/**
 * Get the stored nutrition flag for an actor.
 *
 * @param {Actor5e} actor The actor to inspect.
 * @returns {NutritionState & { config: NutritionConfig }} The stored nutrition flag.
 */
export function getNutritionFlag(actor) {
  const flag = actor.getFlag(MODULE_ID, NUTRITION_FLAG) ?? {};
  const { config, ...state } = flag;
  return {
    ...EMPTY_NUTRITION_STATE,
    ...state,
    config: { ...EMPTY_NUTRITION_CONFIG, ...(config ?? {}) }
  };
}

/* -------------------------------------------- */

/**
 * Get the daily food and water requirements for an actor.
 *
 * @param {Actor5e} actor The actor to inspect.
 * @returns {{ food: number, water: number }} The required food and water amounts.
 */
export function getNutritionNeeds(actor) {
  const size = actor.system.traits.size;
  const config = getNutritionConfig(actor);
  return {
    food: config.foodPerDay ?? BASE_NEEDS[size] ?? BASE_NEEDS.med,
    water: config.waterPerDay ?? BASE_NEEDS[size] ?? BASE_NEEDS.med
  };
}

/* -------------------------------------------- */

/**
 * Get the malnutrition/dehydration saving throw DC for an actor.
 *
 * @param {Actor5e} actor The actor to inspect.
 * @param {NutritionConfig} nutritionConfig The actor's nutrition config.
 * @returns {number} The saving throw DC.
 */
export function getNutritionSaveDC(actor, nutritionConfig) {
  const legacy = game.dnd5e.settings.rulesVersion === "legacy";
  return game.dnd5e.utils.simplifyBonus(
    nutritionConfig.malnutritionDC ?? (legacy ? SAVE_DC_LEGACY : SAVE_DC_MODERN),
    actor.getRollData()
  );
}

/* -------------------------------------------- */

/**
 * Get the current nutrition state for an actor.
 *
 * @param {Actor5e} actor The actor to inspect.
 * @returns {NutritionState} The stored nutrition state.
 */
export function getNutritionState(actor) {
  const state = getNutritionFlag(actor);
  delete state.config;
  return state;
}

/* -------------------------------------------- */

/**
 * Persist nutrition state while keeping actor-specific config.
 *
 * @param {Actor5e} actor The actor to update.
 * @param {Partial<NutritionState>} state The state changes to apply.
 * @returns {Promise<Actor5e>} A promise that resolves to the updated actor.
 */
export function setNutritionState(actor, state) {
  const current = getNutritionFlag(actor);
  return actor.setFlag(MODULE_ID, NUTRITION_FLAG, {
    ...current,
    ...state,
    config: current.config
  });
}
