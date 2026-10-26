/**
 * @import { NutritionCandidate, NutritionConfig, NutritionState, NutritionType } from "../_types.mjs";
 */

import {
  BASE_NEEDS,
  EMPTY_NUTRITION_CONFIG,
  EMPTY_NUTRITION_STATE,
  LITERS_PER_GALLON,
  MODULE_ID,
  NUTRITION_FLAG,
  SAVE_DC_LEGACY,
  SAVE_DC_MODERN,
  SETTING_KEYS,
  WATER_GALLONS_PER_POUND,
  WATERSKIN_IDENTIFIER
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
 * Get the nutrition amount provided by one use of an item.
 *
 * @param {Actor5e} actor The owning actor.
 * @param {NutritionType} type The nutrition type.
 * @param {Item5e} item The item being consumed.
 * @param {Activity} [activity] The activity used, by default the first consuming activity of the item.
 * @returns {number} The nutrition amount provided by one use of the item.
 */
export function getNutritionAmount(actor, type, item, activity=getConsumeActivities(item)[0]) {
  const weight = getNutritionWeight(actor, item, activity);
  if ( !weight ) return getNutritionNeeds(actor)[type];
  return weight * ((type === "food") ? 1 : WATER_GALLONS_PER_POUND);
}

/* -------------------------------------------- */

/**
 * Get the weight in pounds that one use of an item provides nutrition from. It is the weight of the item itself,
 * or of the other item whose quantity the activity spends, divided by the maximum uses of the item.
 * The unmodified legacy Waterskin does not count the one pound of its skin.
 *
 * @param {Actor5e} actor The owning actor.
 * @param {Item5e} item The item being consumed.
 * @param {Activity|undefined} activity The activity used, if any.
 * @returns {number} The weight in pounds provided by one use.
 */
function getNutritionWeight(actor, item, activity) {
  const target = getConsumeTarget(activity);
  const { value, units } = (getMaterialItem(actor, item, target) ?? item).system.weight;
  const weight = game.dnd5e.utils.convertWeight(value, units, "lb");
  const max = (target?.type === "itemUses") ? (item.system.uses.max || 1) : 1;
  const legacy = (item.system.identifier === WATERSKIN_IDENTIFIER) && (item.system.source.rules === "2014");
  const skin = (legacy && (weight === max + 1)) ? 1 : 0;
  return (weight - skin) / max;
}

/* -------------------------------------------- */

/**
 * Get the usable activities of a food item that consume a resource, if nutrition can be recorded for their use.
 *
 * @param {Item5e} item The item being consumed.
 * @returns {Activity[]} The activities with a consumption target.
 */
export function getConsumeActivities(item) {
  if ( game.settings.get(MODULE_ID, SETTING_KEYS.DISABLE_ACTIVITY_NUTRITION) ) return [];
  if ( (item.actor?.type !== "character") || (item.system.type.value !== "food") ) return [];
  return item.system.activities.filter(activity => activity.canUse && activity.consumption.targets.length);
}

/* -------------------------------------------- */

/**
 * Get the first consumption target of an activity that spends uses or quantity.
 *
 * @param {Activity|null} activity The activity to inspect.
 * @returns {ConsumptionTargetData|undefined} The consumption target, if there is one.
 */
function getConsumeTarget(activity) {
  return activity?.consumption.targets.find(target => ["itemUses", "material"].includes(target.type));
}

/* -------------------------------------------- */

/**
 * Get the other item whose quantity a consumption target spends.
 *
 * @param {Actor5e} actor The owning actor.
 * @param {Item5e} item The item being consumed.
 * @param {ConsumptionTargetData|undefined} target The consumption target to inspect.
 * @returns {Item5e|null} The spent item, or null if the target spends no other item.
 */
function getMaterialItem(actor, item, target) {
  const material = (target?.type === "material") ? actor.items.get(target.target) : null;
  return (material && (material.id !== item.id) && material.system.weight) ? material : null;
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
  if ( !getNutritionWeight(actor, item, getConsumeActivities(item)[0]) ) {
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
  const [activity] = getConsumeActivities(item);
  const target = getConsumeTarget(activity);
  const material = getMaterialItem(actor, item, target);
  const used = actor.items.get(target?.target) ?? item;
  const uses = (target?.type === "itemUses") ? used.system.uses : null;
  let units = item.system.quantity;
  if ( material ) units = material.system.quantity;
  else if ( uses ) units = uses.autoDestroy ? Math.max(0, (uses.max * used.system.quantity) - uses.spent) : uses.value;
  return {
    id: item.id,
    name: item.name,
    img: item.img,
    units,
    container: item.container?.name ?? null,
    consumes: material ? { name: material.name, container: material.container?.name ?? null } : null,
    amount: getNutritionAmountLabel(actor, type, item),
    value: getNutritionAmount(actor, type, item),
    noActivity: !game.settings.get(MODULE_ID, SETTING_KEYS.DISABLE_ACTIVITY_NUTRITION) && !activity,
    noUses: !!uses && !uses.value
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
