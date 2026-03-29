/**
 * @import { NutritionCandidate, NutritionType } from "./types/shared.types.mjs";
 */

const { convertWeight, formatWeight } = game.dnd5e.utils;

const FOOD_NEEDS = { tiny: 0.25, sm: 1, med: 1, lg: 4, huge: 16, grg: 64 };
const WATER_NEEDS = { tiny: 0.25, sm: 1, med: 1, lg: 4, huge: 16, grg: 64 };
const MAGICAL_BERRIES_IDENTIFIER = "magical-berries";
const WATER_ITEM_AMOUNT = 0.125;

/**
 * Get the daily food and water requirements for an actor.
 *
 * @param {Actor5e} actor The actor to inspect.
 * @returns {{ food: number, water: number }} The required food and water amounts.
 */
export function getNutritionNeeds(actor) {
  const size = actor.system.traits.size;
  return {
    food: FOOD_NEEDS[size] ?? FOOD_NEEDS.med,
    water: WATER_NEEDS[size] ?? WATER_NEEDS.med
  };
}

/**
 * Format a numeric nutrition value.
 *
 * @param {number} value The numeric value to format.
 * @returns {string} The formatted value.
 */
function formatNutritionValue(value) {
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
  if (type === "food") return formatWeight(value, "lb", { maximumFractionDigits: 3, unitDisplay: "short" });
  return game.i18n.format("SIMPLE_NUTRITION.Dialog.AmountWater", { value: formatNutritionValue(value) });
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
  if (type !== "food") return null;
  if (item.system.identifier === MAGICAL_BERRIES_IDENTIFIER) {
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
