/**
 * @import { NutritionConsumption, NutritionType } from "../_types.mjs";
 */

import NutritionConsumeDialog from "../applications/consume-dialog.mjs";
import {
  CONDITION_DEHYDRATION,
  CONDITION_EFFECT_DEHYDRATED,
  CONDITION_EFFECT_MALNOURISHED,
  CONDITION_MALNUTRITION,
  MAGICAL_BERRIES_IDENTIFIER,
  MODULE_ID,
  RATIONS_IDENTIFIER,
  WATER_IDENTIFIERS,
  WATERSKIN_IDENTIFIER
} from "../config.mjs";

import {
  formatNutritionAmount,
  getConsumeActivities,
  getNutritionAmount,
  getNutritionCandidate,
  getNutritionConfig,
  getNutritionNeeds,
  getNutritionState,
  setNutritionState
} from "./actor.mjs";

/**
 * Consume nutrition for the current day.
 *
 * @param {Actor5e} actor The actor consuming nutrition.
 * @param {NutritionType} nutrition The nutrition type being consumed.
 * @returns {Promise<boolean>} True if consumption was applied.
 */
export async function consumeNutrition(actor, nutrition) {
  const isFood = nutrition === "food";
  const items = getCandidates(actor, nutrition).map(item => getNutritionCandidate(actor, nutrition, item));
  const needs = getNutritionNeeds(actor);

  /**
   * @type {NutritionConsumption|null}
   */
  const consumption = await NutritionConsumeDialog.consume(actor, {
    type: nutrition,
    items,
    required: formatNutritionAmount(nutrition, needs[nutrition]),
    requiredValue: needs[nutrition],
    starvation: isFood ? getNutritionState(actor).starvation : 0
  });
  if ( !consumption ) return false;

  const free = consumption.freshWater || consumption.freeFood;
  const entries = consumption.entries.flatMap(entry => {
    const item = actor.items.get(entry.itemId);
    return item ? [{ item, quantity: entry.quantity }] : [];
  });
  const activityEntries = free ? [] : entries.filter(entry => getConsumeActivities(entry.item).length);
  const quantityEntries = free ? [] : entries.filter(entry => !activityEntries.includes(entry));
  const consumed = free ? 1
    : quantityEntries.reduce((total, entry) => {
      return total + (getNutritionAmount(actor, nutrition, entry.item) * entry.quantity);
    }, 0) / needs[nutrition];
  if ( quantityEntries.length ) await consumeSelectedItems(actor, quantityEntries);
  if ( consumed > 0 ) await applyConsumption(actor, nutrition, consumed);
  await useConsumeActivities(nutrition, activityEntries);

  return true;
}

/* -------------------------------------------- */

/**
 * Record a full day of free food or water for every given actor that still needs it.
 *
 * @param {Actor5e[]} actors The actors consuming nutrition.
 * @param {NutritionType} nutrition The nutrition type being consumed.
 * @returns {Promise<void>} A promise that resolves when all actors have been updated.
 */
export async function consumeGroupNutrition(actors, nutrition) {
  const track = nutrition === "food" ? "trackFood" : "trackWater";
  const pending = actors.filter(actor => {
    return (getNutritionConfig(actor)[track] !== false) && (getNutritionState(actor)[nutrition] < 1);
  });
  await Promise.all(pending.map(actor => applyConsumption(actor, nutrition, 1)));
}

/* -------------------------------------------- */

/**
 * Add consumed nutrition to the actor's current day, capped at the daily requirement, and lift the matching
 * condition once the requirement is met.
 *
 * @param {Actor5e} actor The actor consuming nutrition.
 * @param {NutritionType} nutrition The nutrition type being consumed.
 * @param {number} consumed The fraction of the daily requirement consumed.
 * @returns {Promise<void>} A promise that resolves when the actor has been updated.
 */
export async function applyConsumption(actor, nutrition, consumed) {
  const isFood = nutrition === "food";
  const condition = isFood ? CONDITION_MALNUTRITION : CONDITION_DEHYDRATION;
  const conditionEffect = isFood ? CONDITION_EFFECT_MALNOURISHED : CONDITION_EFFECT_DEHYDRATED;
  const marker = isFood ? "foodConditionRemoved" : "waterConditionRemoved";

  const state = getNutritionState(actor);
  const amount = Math.min(state[nutrition] + consumed, 1).toNearest(0.000001);
  const conditionRemoved = (amount >= 1) && actor.hasConditionEffect(conditionEffect);

  await setNutritionState(actor, {
    [nutrition]: amount,
    [marker]: state[marker] || conditionRemoved
  });

  if ( conditionRemoved ) await actor.toggleStatusEffect(condition, { active: false });
}

/* -------------------------------------------- */

/**
 * Remove recorded nutrition from the actor's current day and restore the matching condition if meeting the
 * requirement had lifted it.
 * @param {Actor5e} actor            Actor whose nutrition is reverted.
 * @param {NutritionType} nutrition  Nutrition type being reverted.
 * @param {number} amount            Fraction of the daily requirement to remove.
 * @returns {Promise<void>}
 */
export async function revertConsumption(actor, nutrition, amount) {
  const isFood = nutrition === "food";
  const condition = isFood ? CONDITION_MALNUTRITION : CONDITION_DEHYDRATION;
  const marker = isFood ? "foodConditionRemoved" : "waterConditionRemoved";

  const state = getNutritionState(actor);
  const value = Math.max(state[nutrition] - amount, 0).toNearest(0.000001);
  const conditionRestored = state[marker] && (value < 1);

  await setNutritionState(actor, {
    [nutrition]: value,
    [marker]: state[marker] && !conditionRestored
  });

  if ( conditionRestored ) await actor.toggleStatusEffect(condition, { active: true });
}

/* -------------------------------------------- */

/**
 * Consume the selected nutrition items from the actor.
 *
 * @param {Actor5e} actor The actor to update.
 * @param {{ item: Item5e, quantity: number }[]} entries The selected consumption entries.
 * @returns {Promise<void>} A promise that resolves when item updates finish.
 */
async function consumeSelectedItems(actor, entries) {
  const updates = [];
  const deletions = [];

  for ( const entry of entries ) {
    const quantity = Math.max(0, entry.item.system.quantity - entry.quantity);

    if ( (quantity === 0) && entry.item.system.uses?.autoDestroy ) deletions.push(entry.item.id);
    else updates.push({ _id: entry.item.id, "system.quantity": quantity });
  }

  if ( deletions.length ) await actor.deleteEmbeddedDocuments("Item", deletions);
  if ( updates.length ) await actor.updateEmbeddedDocuments("Item", updates);
}

/* -------------------------------------------- */

/**
 * Use each selected item through its consuming activity, without the usage dialog. A single utility activity is
 * used once for all selected units. Any other activity is used once per unit, as the system triggers its follow-up
 * actions for each usage. The system asks which activity to use if the item has several consuming ones.
 *
 * @param {NutritionType} nutrition The nutrition type recorded for the usage.
 * @param {{ item: Item5e, quantity: number }[]} entries The selected consumption entries.
 * @returns {Promise<void>} A promise that resolves when all usages finish. A canceled usage skips only its item.
 */
async function useConsumeActivities(nutrition, entries) {
  for ( const entry of entries ) {
    const activities = getConsumeActivities(entry.item);
    const bundled = (activities.length === 1) && (activities[0].type === "utility");
    const used = (activities.length === 1) ? activities[0] : entry.item;
    const config = { [MODULE_ID]: { nutrition, units: bundled ? entry.quantity : 1 } };
    for ( let count = bundled ? 1 : entry.quantity; count > 0; count-- ) {
      if ( !await used.use(config, { configure: false }) ) break;
    }
  }
}

/* -------------------------------------------- */

/**
 * Get all valid items on an actor for a nutrition type. Rations and magical berries are only listed as food, water
 * items and the Waterskin only as water.
 *
 * @param {Actor5e} actor The actor to inspect.
 * @param {NutritionType} nutrition The nutrition type being consumed.
 * @returns {Item5e[]} The actor's valid items.
 */
function getCandidates(actor, nutrition) {
  const excluded = (nutrition === "food")
    ? [...WATER_IDENTIFIERS, WATERSKIN_IDENTIFIER]
    : [RATIONS_IDENTIFIER, MAGICAL_BERRIES_IDENTIFIER];
  return actor.items.filter(item => {
    if ( item.type !== "consumable" ) return false;
    if ( !item.system.quantity ) return false;
    if ( item.system.type.value !== "food" ) return false;
    return !excluded.includes(item.system.identifier);
  });
}
