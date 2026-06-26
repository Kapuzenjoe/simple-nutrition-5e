/**
 * @import { NutritionConsumption, NutritionType } from "../_types.mjs";
 */

import NutritionConsumeDialog from "../applications/consume-dialog.mjs";
import {
  CONDITION_DEHYDRATION,
  CONDITION_EFFECT_DEHYDRATED,
  CONDITION_EFFECT_MALNOURISHED,
  CONDITION_MALNUTRITION,
  WATER_IDENTIFIERS,
  WATERSKIN_IDENTIFIER
} from "../config.mjs";

import {
  formatNutritionAmount,
  getNutritionAmount,
  getNutritionCandidate,
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
  const state = getNutritionState(actor);
  const items = (nutrition === "food" ? getFoodCandidates(actor) : getWaterCandidates(actor))
    .map(item => getNutritionCandidate(actor, nutrition, item));
  const needs = getNutritionNeeds(actor);
  const condition = isFood ? CONDITION_MALNUTRITION : CONDITION_DEHYDRATION;
  const conditionEffect = isFood ? CONDITION_EFFECT_MALNOURISHED : CONDITION_EFFECT_DEHYDRATED;
  const marker = isFood ? "foodConditionRemoved" : "waterConditionRemoved";

  /**
   * @type {NutritionConsumption|null}
   */
  const consumption = await NutritionConsumeDialog.consume(actor, {
    type: nutrition,
    daysWithoutFood: isFood ? state.starvation : 0,
    items,
    required: formatNutritionAmount(nutrition, needs[nutrition]),
    requiredValue: needs[nutrition]
  });
  if ( !consumption ) return false;

  const entries = consumption.entries.flatMap(entry => {
    const item = actor.items.get(entry.itemId);
    return item ? [{ item, quantity: entry.quantity }] : [];
  });
  const consumed = consumption.freshWater || consumption.freeFood ? 1
    : entries.reduce((total, entry) => {
      return total + (getNutritionAmount(actor, nutrition, entry.item) * entry.quantity);
    }, 0) / needs[nutrition];
  if ( entries.length && !consumption.freshWater && !consumption.freeFood ) await consumeSelectedItems(actor, entries);

  const amount = state[nutrition] + consumed;
  const conditionRemoved = (amount >= 1) && actor.hasConditionEffect(conditionEffect);

  await setNutritionState(actor, {
    ...state,
    [nutrition]: amount,
    [marker]: state[marker] || conditionRemoved
  });

  if ( conditionRemoved ) await actor.toggleStatusEffect(condition, { active: false });

  return true;
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
 * Get all valid food items on an actor.
 *
 * @param {Actor5e} actor The actor to inspect.
 * @returns {Item5e[]} The actor's valid food items.
 */
function getFoodCandidates(actor) {
  return actor.items.filter(item => {
    if ( item.type !== "consumable" ) return false;
    if ( !item.system.quantity ) return false;
    if ( item.system.type.value !== "food" ) return false;
    if ( WATER_IDENTIFIERS.has(item.system.identifier) ) return false;
    if ( item.system.identifier === WATERSKIN_IDENTIFIER ) return false;
    return getNutritionAmount(actor, "food", item) > 0;
  });
}

/* -------------------------------------------- */

/**
 * Get all valid water items on an actor.
 *
 * @param {Actor5e} actor The actor to inspect.
 * @returns {Item5e[]} The actor's valid water items.
 */
function getWaterCandidates(actor) {
  return actor.items.filter(item => {
    if ( item.type !== "consumable" ) return false;
    if ( !item.system.quantity ) return false;
    if ( !WATER_IDENTIFIERS.has(item.system.identifier) ) return false;
    if ( item.system.identifier === "water-pint" ) {
      return (item.container?.type === "container")
        && (item.container.system.identifier === WATERSKIN_IDENTIFIER);
    }
    return true;
  });
}
