/**
 * @import { NutritionCandidate, NutritionConfig, NutritionState, NutritionType } from "./types/shared.types.mjs";
 */

import {
  EMPTY_NUTRITION_CONFIG,
  EMPTY_NUTRITION_STATE,
  FOOD_NEEDS,
  LITERS_PER_GALLON,
  MAGICAL_BERRIES_IDENTIFIER,
  MODULE_ID,
  NUTRITION_FLAG,
  STARVATION_LIMIT,
  WATER_ITEM_AMOUNT,
  WATER_NEEDS
} from "./constants.mjs";

const { convertWeight, formatVolume, formatWeight } = game.dnd5e.utils;

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
    ...foundry.utils.mergeObject(EMPTY_NUTRITION_STATE, state, { inplace: false }),
    config: foundry.utils.mergeObject(EMPTY_NUTRITION_CONFIG, config ?? {}, { inplace: false })
  };
}

/**
 * Get the current nutrition state for an actor.
 *
 * @param {Actor5e} actor The actor to inspect.
 * @returns {NutritionState} The stored nutrition state.
 */
export function getNutritionState(actor) {
  const { config, ...state } = getNutritionFlag(actor);
  return state;
}

/**
 * Get the actor-specific nutrition config.
 *
 * @param {Actor5e} actor The actor to inspect.
 * @returns {NutritionConfig} The stored nutrition config.
 */
export function getNutritionConfig(actor) {
  return getNutritionFlag(actor).config;
}

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

/**
 * Persist nutrition config while keeping current runtime state.
 *
 * @param {Actor5e} actor The actor to update.
 * @param {Partial<NutritionConfig>} config The config changes to apply.
 * @returns {Promise<Actor5e>} A promise that resolves to the updated actor.
 */
export function setNutritionConfig(actor, config) {
  const current = getNutritionFlag(actor);
  return actor.setFlag(MODULE_ID, NUTRITION_FLAG, {
    ...current,
    config: foundry.utils.mergeObject(current.config, config, { inplace: false })
  });
}

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
    food: config.foodPerDay ?? FOOD_NEEDS[size] ?? FOOD_NEEDS.med,
    water: config.waterPerDay ?? WATER_NEEDS[size] ?? WATER_NEEDS.med
  };
}

/**
 * Get the default daily food and water requirements for an actor's size.
 *
 * @param {Actor5e} actor The actor to inspect.
 * @returns {{ food: number, water: number }} The default food and water amounts.
 */
export function getDefaultNutritionNeeds(actor) {
  const size = actor.system.traits.size;
  return {
    food: FOOD_NEEDS[size] ?? FOOD_NEEDS.med,
    water: WATER_NEEDS[size] ?? WATER_NEEDS.med
  };
}

/**
 * Get the starvation limit for an actor.
 *
 * @param {Actor5e} actor The actor to inspect.
 * @returns {number} The number of days without food before penalties apply.
 */
export function getStarvationLimit(actor) {
  return getNutritionConfig(actor).starvationLimit ?? STARVATION_LIMIT;
}

/**
 * Format a nutrition amount using the active display units without appending the unit label.
 *
 * @param {NutritionType} type The nutrition type.
 * @param {number} value The nutrition amount.
 * @returns {string} The formatted amount.
 */
export function formatNutritionValue(type, value) {
  if (type === "food") {
    const unit = game.dnd5e.utils.defaultUnits("weight");
    return convertWeight(value, "lb", unit).toLocaleString(game.i18n.lang, { maximumFractionDigits: 3 });
  }
  if (game.settings.get("dnd5e", "metricVolumeUnits")) {
    return (value * LITERS_PER_GALLON).toLocaleString(game.i18n.lang, { maximumFractionDigits: 3 });
  }
  return value.toLocaleString(game.i18n.lang, { maximumFractionDigits: 3 });
}

/**
 * Format a nutrition amount with its unit.
 *
 * @param {NutritionType} type The nutrition type.
 * @param {number} value The nutrition amount.
 * @returns {string} The formatted amount.
 */
export function formatNutritionAmount(type, value) {
  if (type === "food") {
    const unit = game.dnd5e.utils.defaultUnits("weight");
    return formatWeight(convertWeight(value, "lb", unit), unit, {
      maximumFractionDigits: 3,
      unitDisplay: "short"
    });
  }
  if (game.settings.get("dnd5e", "metricVolumeUnits")) {
    return formatVolume(value * LITERS_PER_GALLON, "liter", {
      maximumFractionDigits: 3,
      unitDisplay: "short"
    });
  }
  return game.i18n.format("SIMPLE_NUTRITION.Dialog.AmountWater", {
    value: value.toLocaleString(game.i18n.lang, { maximumFractionDigits: 3 })
  });
}

/**
 * Get the food amount provided by one item.
 *
 * @param {Actor5e} actor The owning actor.
 * @param {Item5e} item The item being consumed.
 * @returns {number} The food amount provided by one item in pounds.
 */
function getFoodItemAmount(actor, item) {
  if (item.system.identifier === MAGICAL_BERRIES_IDENTIFIER) return getNutritionNeeds(actor).food;
  return convertWeight(item.system.weight.value, item.system.weight.units, "lb");
}

/**
 * Get the nutrition amount provided by one item.
 *
 * @param {Actor5e} actor The owning actor.
 * @param {NutritionType} type The nutrition type.
 * @param {Item5e} item The item being consumed.
 * @returns {number} The nutrition amount provided by one item.
 */
export function getNutritionAmount(actor, type, item) {
  return type === "food" ? getFoodItemAmount(actor, item) : WATER_ITEM_AMOUNT;
}

/**
 * Get a localized amount hint for one consumable item.
 *
 * @param {Actor5e} actor The owning actor.
 * @param {NutritionType} type The nutrition type.
 * @param {Item5e} item The item being consumed.
 * @returns {string|null} A localized amount hint for one item.
 */
export function getNutritionAmountLabel(actor, type, item) {
  if ((type === "food") && (item.system.identifier === MAGICAL_BERRIES_IDENTIFIER)) {
    return game.i18n.localize("SIMPLE_NUTRITION.Dialog.AmountFullDay");
  }
  return formatNutritionAmount(type, getNutritionAmount(actor, type, item));
}

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
    value: getNutritionAmount(actor, type, item)
  };
}
