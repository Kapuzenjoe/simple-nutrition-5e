/**
 * @import { NutritionConfig, NutritionRestState, NutritionState } from "../_types.mjs";
 */

import { promptNutritionSave } from "../chat/messages.mjs";
import {
  CONDITION_DEHYDRATION,
  CONDITION_EFFECT_DEHYDRATED,
  CONDITION_EFFECT_MALNOURISHED,
  CONDITION_MALNUTRITION,
  EXHAUSTION_PATH,
  MODULE_ID,
  SAVE_DC_LEGACY,
  SAVE_DC_MODERN,
  STARVATION_FORMULA_LEGACY,
  STARVATION_LIMIT
} from "../config.mjs";

import {
  getNutritionFlag,
  setNutritionState
} from "./actor.mjs";

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

/* -------------------------------------------- */

/**
 * Compute the nutrition state transition for a new day, without applying any changes.
 *
 * @param {Actor5e} actor The actor to evaluate.
 * @returns {{ nutritionConfig: NutritionConfig, trackFood: boolean, trackWater: boolean, previous: NutritionState, state: NutritionRestState }}
 */
export function computeNutrition(actor) {
  const { config: nutritionConfig, ...previous } = getNutritionFlag(actor);
  const trackFood = nutritionConfig.trackFood !== false;
  const trackWater = nutritionConfig.trackWater !== false;
  const legacy = game.dnd5e.settings.rulesVersion === "legacy";
  const starvationLimit = game.dnd5e.utils.simplifyBonus(
    nutritionConfig.starvationLimit ?? (legacy ? STARVATION_FORMULA_LEGACY : STARVATION_LIMIT),
    actor.getRollData()
  );
  const foodHalf = !trackFood || (previous.food >= 0.5);
  const foodFull = !trackFood || (previous.food >= 1);
  const waterHalf = !trackWater || (previous.water >= 0.5);
  const waterFull = !trackWater || (previous.water >= 1);

  // Food
  const starvation = !trackFood ? 0
    : legacy ? (foodFull ? 0 : (previous.starvation + (foodHalf ? 0.5 : 1)))
      : (previous.food > 0 ? 0 : (previous.starvation + 1));
  const foodAutomatic = trackFood && (legacy ? (starvation > starvationLimit) : (starvation >= starvationLimit));
  const malnourished = !legacy && trackFood
    && (foodAutomatic || (actor.hasConditionEffect(CONDITION_EFFECT_MALNOURISHED) && !foodFull));

  // Water
  const waterLow = trackWater && !waterHalf;
  const waterDoubled = legacy && waterLow && ((foundry.utils.getProperty(actor, EXHAUSTION_PATH) ?? 0) >= 1);
  const dehydrated = !legacy
    && (waterLow || (trackWater && actor.hasConditionEffect(CONDITION_EFFECT_DEHYDRATED) && !waterFull));

  const penalty = (foodAutomatic ? 1 : 0) + (waterLow ? (waterDoubled ? 2 : 1) : 0);
  const saveRequired = legacy ? (trackWater && waterHalf && !waterFull) : (trackFood && !foodHalf);

  /**
   * @type {NutritionRestState}
   */
  const state = {
    starvation,
    dehydrated,
    malnourished,
    saveRequired,
    saveType: legacy ? "water" : "food",
    penalty,
    foodFull,
    waterFull
  };

  return { nutritionConfig, trackFood, trackWater, previous, state };
}

/* -------------------------------------------- */

/**
 * Apply nutrition penalties during rest completion before the system updates the actor.
 *
 * @param {Actor5e} actor The actor completing the rest.
 * @param {RestResult} result The pending rest result data.
 * @param {RestConfiguration} config The rest configuration.
 * @returns {void}
 */
export function onPreRestCompleted(actor, result, config) {
  if ( (actor.type !== "character") || !config.newDay || !(game.dnd5e.settings.calendarConfig?.manualRecovery ?? true) ) return;

  const { state } = computeNutrition(actor);
  const legacy = game.dnd5e.settings.rulesVersion === "legacy";
  const recoveryBlocked = legacy && (!state.foodFull || !state.waterFull);

  if ( recoveryBlocked || state.penalty ) {
    const clone = foundry.utils.getProperty(result.clone, EXHAUSTION_PATH) ?? 0;
    const exhaustion = recoveryBlocked ? clone : (foundry.utils.getProperty(result.updateData, EXHAUSTION_PATH) ?? clone);
    const max = CONFIG.DND5E.conditionTypes.exhaustion.levels;

    foundry.utils.mergeObject(result.updateData, {
      [EXHAUSTION_PATH]: Math.clamp(exhaustion + state.penalty, 0, max)
    });
  }

  result[MODULE_ID] = state;
}

/* -------------------------------------------- */

/**
 * Persist the new nutrition state after the rest has completed.
 *
 * @param {Actor5e} actor The actor that completed the rest.
 * @param {RestResult} result The completed rest result data.
 * @param {RestConfiguration} config The rest configuration.
 * @returns {Promise<void>} A promise that resolves when nutrition updates finish.
 */
export async function onRestCompleted(actor, result, config) {
  if ( (actor.type !== "character") || !config.newDay || !(game.dnd5e.settings.calendarConfig?.manualRecovery ?? true) ) return;

  const state = result[MODULE_ID];
  if ( !state ) return;
  const { config: nutritionConfig, ...previous } = getNutritionFlag(actor);
  const trackFood = nutritionConfig.trackFood !== false;
  const trackWater = nutritionConfig.trackWater !== false;

  await applyNutrition(actor, state);

  if ( result.message && (trackFood || trackWater) ) {await result.message.setFlag(MODULE_ID, "nutritionChat", {
    food: previous.food,
    water: previous.water,
    trackFood,
    trackWater,
    starvation: state.starvation,
    dehydrated: state.dehydrated,
    malnourished: state.malnourished,
    penalty: state.penalty
  });}

  const legacy = game.dnd5e.settings.rulesVersion === "legacy";
  const dc = game.dnd5e.utils.simplifyBonus(
    nutritionConfig.malnutritionDC ?? (legacy ? SAVE_DC_LEGACY : SAVE_DC_MODERN),
    actor.getRollData()
  );
  if ( state.saveRequired ) await promptNutritionSave(actor, state.saveType, dc);
}
