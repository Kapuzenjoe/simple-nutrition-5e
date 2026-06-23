/**
 * @import { NutritionConfig, NutritionRestState, NutritionState } from "../_types.mjs";
 */

import {
  CONDITION_DEHYDRATION,
  CONDITION_EFFECT_DEHYDRATED,
  CONDITION_EFFECT_MALNOURISHED,
  CONDITION_MALNUTRITION,
  EXHAUSTION_PATH,
  MODULE_ID,
  STARVATION_LIMIT
} from "../config.mjs";
import {
  getNutritionFlag,
  setNutritionState
} from "./actor.mjs";
import { promptMalnutritionSave } from "../chat/messages.mjs";

/**
 * Apply nutrition penalties during rest completion before the system updates the actor.
 *
 * @param {Actor5e} actor The actor completing the rest.
 * @param {RestResult} result The pending rest result data.
 * @param {RestConfiguration} config The rest configuration.
 * @returns {void}
 */
export function onPreRestCompleted(actor, result, config) {
  if ((actor.type !== "character") || !config.newDay || !(game.dnd5e.settings.calendarConfig?.manualRecovery ?? true)) return;

  const { state, penalty } = computeNutrition(actor);

  if (penalty) {
    const exhaustion = foundry.utils.getProperty(result.updateData, EXHAUSTION_PATH)
      ?? foundry.utils.getProperty(result.clone, EXHAUSTION_PATH)
      ?? 0;
    const max = CONFIG.DND5E.conditionTypes.exhaustion.levels ?? 6;

    foundry.utils.mergeObject(result.updateData, {
      [EXHAUSTION_PATH]: Math.clamp(exhaustion + penalty, 0, max)
    });
  }

  result[MODULE_ID] = state;
}

/**
 * Compute the nutrition state transition for a new day, without applying any changes.
 *
 * @param {Actor5e} actor The actor to evaluate.
 * @returns {{ nutritionConfig: NutritionConfig, trackFood: boolean, trackWater: boolean, previous: NutritionState, state: NutritionRestState, penalty: number }}
 */
export function computeNutrition(actor) {
  const { config: nutritionConfig, ...previous } = getNutritionFlag(actor);
  const trackFood = nutritionConfig.trackFood !== false;
  const trackWater = nutritionConfig.trackWater !== false;
  const starvationLimit = nutritionConfig.starvationLimit ?? STARVATION_LIMIT;
  const starvation = trackFood ? (previous.food >= 1 ? 0 : (previous.starvation + 1)) : 0;
  const foodHalf = !trackFood || (previous.food >= 0.5);
  const foodFull = !trackFood || (previous.food >= 1);
  const waterHalf = !trackWater || (previous.water >= 0.5);
  const waterFull = !trackWater || (previous.water >= 1);

  let penalty = 0;
  let dehydrated = trackWater && actor.hasConditionEffect(CONDITION_EFFECT_DEHYDRATED) && !waterFull;
  let malnourished = trackFood && actor.hasConditionEffect(CONDITION_EFFECT_MALNOURISHED) && !foodFull;

  if (trackWater && !waterHalf) {
    penalty += 1;
    dehydrated = true;
  }

  if (trackFood && (previous.food === 0) && (starvation >= starvationLimit)) {
    penalty += 1;
    malnourished = true;
  }

  /** @type {NutritionRestState} */
  const state = {
    starvation,
    dehydrated,
    malnourished,
    saveRequired: trackFood && !foodHalf && ((previous.food > 0) || (starvation < starvationLimit))
  };

  return { nutritionConfig, trackFood, trackWater, previous, state, penalty };
}

/**
 * Persist the new nutrition state after the rest has completed.
 *
 * @param {Actor5e} actor The actor that completed the rest.
 * @param {RestResult} result The completed rest result data.
 * @param {RestConfiguration} config The rest configuration.
 * @returns {Promise<void>} A promise that resolves when nutrition updates finish.
 */
export async function onRestCompleted(actor, result, config) {
  if ((actor.type !== "character") || !config.newDay || !(game.dnd5e.settings.calendarConfig?.manualRecovery ?? true)) return;

  const state = result[MODULE_ID];
  if (!state) return;
  const { config: nutritionConfig, ...previous } = getNutritionFlag(actor);
  const trackFood = nutritionConfig.trackFood !== false;
  const trackWater = nutritionConfig.trackWater !== false;

  await applyNutrition(actor, state);

  if (result.message && (trackFood || trackWater)) await result.message.setFlag(MODULE_ID, "nutritionChat", {
    food: previous.food,
    water: previous.water,
    trackFood,
    trackWater,
    starvation: state.starvation,
    dehydrated: state.dehydrated,
    malnourished: state.malnourished
  });

  const dc = nutritionConfig.malnutritionDC ?? 10;
  if (state.saveRequired) await promptMalnutritionSave(actor, dc);
}

/**
 * Persist the nutrition state computed for a new day and toggle conditions accordingly.
 *
 * @param {Actor5e} actor The actor to update.
 * @param {NutritionRestState} state The computed nutrition state.
 * @returns {Promise<void>} A promise that resolves when the actor has been updated.
 */
export async function applyNutrition(actor, state) {
  await setNutritionState(actor, {
    food: 0,
    water: 0,
    starvation: state.starvation,
    foodConditionRemoved: false,
    waterConditionRemoved: false
  });

  await actor.toggleStatusEffect(CONDITION_DEHYDRATION, { active: state.dehydrated });
  await actor.toggleStatusEffect(CONDITION_MALNUTRITION, { active: state.malnourished });
}
