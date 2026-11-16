import {
  promptNutritionApply,
  promptNutritionSave,
  postNutritionSummary,
  renderApplyTray,
  renderNutritionRows
} from "../chat/messages.mjs";
import { EXHAUSTION_PATH, MODULE_ID, SETTING_KEYS } from "../config.mjs";
import { isCalendarModeActive } from "../utils.mjs";

import { getNutritionSaveDC } from "./actor.mjs";
import { computeNutrition, applyNutrition, getNutritionChat } from "./rest.mjs";

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
 * Apply the nutrition day-change workflow to every tracked character, isolating failures per actor, or prompt a GM
 * to apply it when the nutrition automation is disabled.
 *
 * @returns {Promise<void>} A promise that resolves once all character actors have been processed.
 */
async function applyDayChanges() {
  // Track the primary party's characters when one is configured; fall back to every character actor otherwise.
  const actors = game.actors.party?.system.playerCharacters ?? game.actors.filter(a => a.type === "character");
  const disabled = game.settings.get(MODULE_ID, SETTING_KEYS.DISABLE_AUTOMATION);
  for ( const actor of actors ) {
    try {
      if ( disabled ) await promptNutritionApply(actor, actor.system.attributes.exhaustion ?? 0);
      else await applyDayChange(actor);
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
 * Apply the nutrition day-change workflow for a single actor.
 *
 * @param {Actor5e} actor The actor to evaluate.
 * @param {number} [exhaustionBefore] The Exhaustion level before the new day, by default the actor's current level.
 * @param {ChatMessage5e} [message] A pending nutrition message to record the result on, instead of posting a summary.
 * @returns {Promise<void>} A promise that resolves once the actor and chat messages have been updated.
 */
async function applyDayChange(actor, exhaustionBefore, message) {
  const computation = computeNutrition(actor, exhaustionBefore);
  const { nutritionConfig, trackFood, trackWater, state } = computation;
  if ( !trackFood && !trackWater ) return;

  if ( state.penalty ) {
    const exhaustion = actor.system.attributes.exhaustion ?? 0;
    const max = CONFIG.DND5E.conditionTypes.exhaustion.levels;
    await actor.update({ [EXHAUSTION_PATH]: Math.clamp(exhaustion + state.penalty, 0, max) });
  }

  await applyNutrition(actor, state);

  const chat = getNutritionChat(computation);
  if ( message ) {
    await message.setFlag(MODULE_ID, "nutritionApply", {
      actorUuid: actor.uuid,
      exhaustionBefore,
      applied: true,
      chat
    });
  } else await postNutritionSummary(actor, chat);

  const dc = getNutritionSaveDC(actor, nutritionConfig);
  if ( state.saveRequired ) await promptNutritionSave(actor, state.saveType, dc, state.exhaustionBefore);
}

/* -------------------------------------------- */

/**
 * Render the nutrition section of a nutrition apply chat message: a live preview with the apply button for GMs
 * while the day is pending, the recorded result once it has been applied.
 *
 * @param {ChatMessage5e} message The rendered chat message.
 * @param {HTMLElement} html The rendered message HTML.
 * @returns {Promise<void>} A promise that resolves when the section has been rendered.
 */
export async function onRenderNutritionApplyMessage(message, html) {
  const flag = message.getFlag(MODULE_ID, "nutritionApply");
  if ( !flag ) return;

  const actor = await fromUuid(flag.actorUuid);
  if ( !actor?.testUserPermission(game.user, "OWNER") ) return;

  if ( message.type !== "rest" ) html.classList.add("compact");
  const container = html.querySelector(".rest-card");
  if ( !container || container.querySelector(".simple-nutrition-chat") ) return;

  const chat = flag.applied ? flag.chat : getNutritionChat(computeNutrition(actor, flag.exhaustionBefore));
  let content = await renderNutritionRows(chat, { pending: !flag.applied, always: true });
  if ( !flag.applied && game.user.isGM ) {
    content += renderApplyTray("applyNutrition", _loc("SIMPLE_NUTRITION.Chat.ApplyNutrition"));
  }
  container.insertAdjacentHTML("beforeend", content);

  const applyButton = container.querySelector("[data-action='applyNutrition']");
  applyButton?.addEventListener("click", () => onApplyNutrition(message, flag, applyButton));
}

/* -------------------------------------------- */

/**
 * Apply the nutrition of a new day for the actor bound to the message.
 *
 * @param {ChatMessage5e} message The originating chat message.
 * @param {{ actorUuid: string, exhaustionBefore: number }} flag The nutrition apply flag data.
 * @param {HTMLElement} button The apply button that was clicked.
 * @returns {void}
 */
function onApplyNutrition(message, flag, button) {
  button.disabled = true;
  dayChangeQueue = dayChangeQueue.then(async () => {
    const actor = await fromUuid(flag.actorUuid);
    if ( !actor ) return;
    await applyDayChange(actor, flag.exhaustionBefore, message);
  }).catch(err => Hooks.onError("onApplyNutrition", err, { log: "error", notify: "error" }));
}
