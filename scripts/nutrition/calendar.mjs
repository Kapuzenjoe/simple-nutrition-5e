import { EXHAUSTION_PATH } from "../config.mjs";
import { computeNutrition, applyNutrition } from "./rest.mjs";
import { promptMalnutritionSave, postNutritionSummary } from "../chat/messages.mjs";

/**
 * React to calendar-driven day changes and apply nutrition tracking outside of the rest workflow.
 *
 * @param {number} worldTime The new world time.
 * @param {number} deltaTime The elapsed time delta.
 * @param {object} options Update options; carries the calendar deltas under `options.dnd5e.deltas`.
 * @returns {Promise<void>} A promise that resolves once all character actors have been processed.
 */
export async function onUpdateWorldTime(worldTime, deltaTime, options) {
  if (!game.user.isActiveGM) return;
  if (game.dnd5e.settings.calendarConfig?.manualRecovery ?? true) return;
  if (!(options.dnd5e?.deltas?.midnights > 0)) return;

  // Track the primary party's characters when one is configured; fall back to every character actor otherwise.
  const actors = game.actors.party?.system.playerCharacters ?? game.actors.filter(a => a.type === "character");
  for (const actor of actors) await applyDayChange(actor);
}

/**
 * Apply the nutrition day-change workflow for a single actor outside of the rest flow.
 *
 * @param {Actor5e} actor The actor to evaluate.
 * @returns {Promise<void>} A promise that resolves once the actor and chat messages have been updated.
 */
async function applyDayChange(actor) {
  const { nutritionConfig, trackFood, trackWater, previous, state, penalty } = computeNutrition(actor);
  if (!trackFood && !trackWater) return;

  if (penalty) {
    const exhaustion = foundry.utils.getProperty(actor, EXHAUSTION_PATH) ?? 0;
    const max = CONFIG.DND5E.conditionTypes.exhaustion.levels ?? 6;
    await actor.update({ [EXHAUSTION_PATH]: Math.clamp(exhaustion + penalty, 0, max) });
  }

  await applyNutrition(actor, state);

  await postNutritionSummary(actor, {
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
