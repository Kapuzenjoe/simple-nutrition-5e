import { promptNutritionSave, postNutritionSummary } from "../chat/messages.mjs";
import { EXHAUSTION_PATH } from "../config.mjs";
import { isCalendarModeActive } from "../utils.mjs";

import { getNutritionSaveDC } from "./actor.mjs";
import { computeNutrition, applyNutrition } from "./rest.mjs";

let dayChangeQueue = Promise.resolve();

/**
 * React to calendar-driven day changes and apply nutrition tracking outside of the rest workflow.
 *
 * @param {number} worldTime The new world time.
 * @param {number} deltaTime The elapsed time delta.
 * @returns {void}
 */
export function onUpdateWorldTime(worldTime, deltaTime) {
  if ( !game.user.isActiveGM ) return;
  if ( !isCalendarModeActive() ) return;
  const { hoursPerDay, minutesPerHour, secondsPerMinute } = game.time.calendar.days;
  const secondsPerDay = hoursPerDay * minutesPerHour * secondsPerMinute;
  const midnights = Math.floor(worldTime / secondsPerDay) - Math.floor((worldTime - deltaTime) / secondsPerDay);
  if ( midnights <= 0 ) return;
  dayChangeQueue = dayChangeQueue.then(applyDayChanges)
    .catch(err => Hooks.onError("onUpdateWorldTime", err, { log: "error" }));
}

/* -------------------------------------------- */

/**
 * Apply the nutrition day-change workflow to every tracked character, isolating failures per actor.
 *
 * @returns {Promise<void>} A promise that resolves once all character actors have been processed.
 */
async function applyDayChanges() {
  // Track the primary party's characters when one is configured; fall back to every character actor otherwise.
  const actors = game.actors.party?.system.playerCharacters ?? game.actors.filter(a => a.type === "character");
  for ( const actor of actors ) {
    try {
      await applyDayChange(actor);
    } catch (err) {
      Hooks.onError("applyDayChanges", err, {
        msg: _loc("SIMPLE_NUTRITION.Calendar.DayChangeFailed", { actor: actor.name }),
        log: "error",
        notify: "error"
      });
    }
  }
}

/* -------------------------------------------- */

/**
 * Apply the nutrition day-change workflow for a single actor outside of the rest flow.
 *
 * @param {Actor5e} actor The actor to evaluate.
 * @returns {Promise<void>} A promise that resolves once the actor and chat messages have been updated.
 */
async function applyDayChange(actor) {
  const { nutritionConfig, trackFood, trackWater, previous, state } = computeNutrition(actor);
  if ( !trackFood && !trackWater ) return;

  if ( state.penalty ) {
    const exhaustion = actor.system.attributes.exhaustion ?? 0;
    const max = CONFIG.DND5E.conditionTypes.exhaustion.levels;
    await actor.update({ [EXHAUSTION_PATH]: Math.clamp(exhaustion + state.penalty, 0, max) });
  }

  await applyNutrition(actor, state);

  await postNutritionSummary(actor, {
    food: previous.food,
    water: previous.water,
    trackFood,
    trackWater,
    starvation: state.starvation,
    dehydrated: state.dehydrated,
    malnourished: state.malnourished,
    penalty: state.penalty
  });

  const dc = getNutritionSaveDC(actor, nutritionConfig);
  if ( state.saveRequired ) await promptNutritionSave(actor, state.saveType, dc, state.exhaustionBefore);
}
