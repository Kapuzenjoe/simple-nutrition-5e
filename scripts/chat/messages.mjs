/**
 * @import { NutritionType } from "../_types.mjs";
 */

import {
  CONDITION_DEHYDRATION,
  CONDITION_MALNUTRITION,
  EXHAUSTION_PATH,
  MODULE_ID
} from "../config.mjs";
import { getNutritionConfig, setNutritionState } from "../nutrition/actor.mjs";

/**
 * Render the saving throw summaries and the failed-save button on a nutrition save chat message.
 *
 * @param {ChatMessage5e} message The rendered chat message.
 * @param {HTMLElement} html The rendered message HTML.
 * @returns {Promise<void>} A promise that resolves when the message has been rendered.
 */
export async function onRenderNutritionSaveMessage(message, html) {
  const flag = message.getFlag(MODULE_ID, "nutritionSave");
  if ( !flag || (message.type !== "prompt") ) return;

  const card = html.querySelector(".request-card");
  if ( !card || (card.dataset.nutritionRendered !== undefined) ) return;
  card.dataset.nutritionRendered = "";

  const rolls = message.getAssociatedRolls("save").filter(roll => roll.visible);
  if ( game.settings.get("dnd5e", "chatCardSummary") ) {
    const summaries = await Promise.all(rolls.map(renderSaveSummary));
    card.append(...summaries);
    rolls.forEach((roll, i) => roll.system._onRender(summaries[i], { summary: true }));
  }

  const latest = rolls.at(-1);
  if ( flag.applied || !latest || (latest.shouldDisplayChallenge && !latest.rolls[0]?.isFailure) ) return;
  card.insertAdjacentHTML(
    "beforeend", renderApplyTray("applyNutritionFailure", _loc("SIMPLE_NUTRITION.Rest.ApplyExhaustion"))
  );
  const applyButton = card.querySelector("[data-action='applyNutritionFailure']");
  applyButton.addEventListener("click", () => onApplyNutritionFailure(message, flag, applyButton));
}

/* -------------------------------------------- */

/**
 * Hide a saving throw result that is shown as a summary on its nutrition save card, like the system does for
 * its own cards when Summary Chat Cards is on.
 *
 * @param {ChatMessage5e} message The rendered chat message.
 * @param {HTMLElement} html The rendered message HTML.
 * @returns {void}
 */
export function onRenderNutritionSaveResult(message, html) {
  if ( message.type !== "save" ) return;
  const origin = message.system.origin;
  if ( !origin?.getFlag(MODULE_ID, "nutritionSave") || !origin.visible ) return;
  if ( game.settings.get("dnd5e", "chatCardSummary") ) html.hidden = true;
}

/* -------------------------------------------- */

/**
 * Render a saving throw result as a summary item of a chat card.
 *
 * @param {ChatMessage5e} roll The saving throw message.
 * @returns {Promise<HTMLElement>} A promise that resolves to the summary element.
 */
async function renderSaveSummary(roll) {
  const summary = document.createElement("div");
  summary.className = "card-summary";
  summary.dataset.messageId = roll.id;
  summary.dataset.targetUuid = roll.getAssociatedToken()?.uuid ?? "";
  summary.innerHTML = await roll.system.render({ summary: true });
  return summary;
}

/* -------------------------------------------- */

/**
 * Render nutrition controls on a rest chat card.
 *
 * @param {ChatMessage5e} message The rendered chat message.
 * @param {HTMLElement} html The rendered message HTML.
 * @returns {Promise<void>} A promise that resolves when the summary has been rendered.
 */
export async function onRenderRestChatMessage(message, html) {
  const chat = message.getFlag(MODULE_ID, "nutritionChat");
  if ( !chat ) return;

  const actor = message.getAssociatedActor();
  if ( !actor?.testUserPermission(game.user, "OWNER") ) return;

  const card = html.querySelector(".rest-card");
  if ( !card || card.querySelector(".simple-nutrition-chat") ) return;

  const content = await renderNutritionRows(chat);
  if ( content ) card.insertAdjacentHTML("beforeend", content);
}

/* -------------------------------------------- */

/**
 * Apply the system's compact chat styling to the standalone nutrition summary card, since it uses no dnd5e
 * chat message data model.
 *
 * @param {ChatMessage5e} message The rendered chat message.
 * @param {HTMLElement} html The rendered message HTML.
 * @returns {void}
 */
export function onRenderNutritionSummaryMessage(message, html) {
  if ( !message.getFlag(MODULE_ID, "nutritionSummary") ) return;
  html.classList.add("compact");
}

/* -------------------------------------------- */

/**
 * Create a chat message summarizing nutrition intake for a new day, outside of the rest workflow.
 *
 * @param {Actor5e} actor The actor the summary applies to.
 * @param {object} chat The nutrition summary data.
 * @returns {Promise<ChatMessage5e|null>} A promise that resolves to the message, or null if there is nothing to report.
 */
export async function postNutritionSummary(actor, chat) {
  const content = await renderNutritionRows(chat);
  if ( !content ) return null;

  return ChatMessage.implementation.create({
    content,
    whisper: game.users.filter(user => actor.testUserPermission(user, "OWNER")),
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    flags: { [MODULE_ID]: { nutritionSummary: true } }
  });
}

/* -------------------------------------------- */

/**
 * Create a chat message asking a GM to apply the nutrition of a new day.
 *
 * @param {Actor5e} actor The actor the new day applies to.
 * @param {number} exhaustionBefore The actor's Exhaustion level before the new day, for legacy water doubling.
 * @returns {Promise<ChatMessage5e|null>} A promise that resolves to the message, or null if nothing is tracked.
 */
export async function promptNutritionApply(actor, exhaustionBefore) {
  const { trackFood, trackWater } = getNutritionConfig(actor);
  if ( (trackFood === false) && (trackWater === false) ) return null;

  return ChatMessage.implementation.create({
    content: "<div class='chat-card rest-card'></div>",
    whisper: game.users.filter(user => actor.testUserPermission(user, "OWNER")),
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    flags: { [MODULE_ID]: { nutritionApply: { actorUuid: actor.uuid, exhaustionBefore, applied: false } } }
  });
}

/* -------------------------------------------- */

/**
 * Create a chat message prompting a nutrition saving throw.
 *
 * @param {Actor5e} actor The actor that must roll the save.
 * @param {NutritionType} type The nutrition type the save is for (food under modern rules, water under legacy rules).
 * @param {number} dc The save DC.
 * @param {number} exhaustionBefore The actor's Exhaustion level before today's own changes, for legacy water doubling.
 * @returns {Promise<ChatMessage5e>} A promise that resolves to the created chat message.
 */
export function promptNutritionSave(actor, type, dc, exhaustionBefore) {
  const owners = game.users.filter(user => actor.testUserPermission(user, "OWNER"));
  return ChatMessage.implementation.create({
    type: "prompt",
    system: { broadcast: false, buttons: [{ type: "save", ability: "con", dc, format: "short" }] },
    whisper: owners,
    author: game.user.isGM ? owners.find(user => !user.isGM)?.id : game.user.id,
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    flags: { [MODULE_ID]: { nutritionSave: { actorUuid: actor.uuid, type, exhaustionBefore } } }
  });
}

/* -------------------------------------------- */

/**
 * Render the system-styled apply tray of a chat card.
 *
 * @param {string} action The data-action of the button.
 * @param {string} label The localized button label.
 * @returns {string} The tray HTML.
 */
export function renderApplyTray(action, label) {
  return "<div class='card-tray'><div class='collapsible-content'><div class='wrapper'>"
    + `<button type='button' class='apply-button' data-action='${action}'>`
    + "<i class='fa-light fa-reply-all fa-flip-horizontal' inert></i>"
    + `<span>${label}</span>`
    + "</button></div></div></div>";
}

/* -------------------------------------------- */

/**
 * Apply exhaustion (and, for food under modern rules, the malnutrition condition) after a failed saving throw.
 *
 * @param {ChatMessage5e} message The originating chat message.
 * @param {{ actorUuid: string, type: NutritionType, exhaustionBefore: number }} flag The nutrition save flag data.
 * @param {HTMLElement} button The apply button that was clicked.
 * @returns {Promise<void>}
 */
async function onApplyNutritionFailure(message, flag, button) {
  const actor = await fromUuid(flag.actorUuid);
  if ( !actor?.testUserPermission(game.user, "OWNER") ) return;
  button.disabled = true;
  const exhaustion = actor.system.attributes.exhaustion ?? 0;
  const max = CONFIG.DND5E.conditionTypes.exhaustion.levels;
  const amount = ((flag.type === "water") && ((flag.exhaustionBefore ?? exhaustion) >= 1)) ? 2 : 1;
  await actor.update({ [EXHAUSTION_PATH]: Math.clamp(exhaustion + amount, 0, max) });
  if ( flag.type === "food" ) await actor.toggleStatusEffect(CONDITION_MALNUTRITION, { active: true });
  else await setNutritionState(actor, { exhaustionRecoveryBlocked: true });
  await message.setFlag(MODULE_ID, "nutritionSave", { ...flag, applied: true });
}

/* -------------------------------------------- */

/**
 * Render the localized nutrition summary rows for a chat message.
 *
 * @param {object} chat The nutrition summary data.
 * @param {object} [options]
 * @param {boolean} [options.pending] Whether the rows are a preview of a day that has not been applied yet.
 * @param {boolean} [options.always] Whether to report a day without shortfalls instead of skipping it.
 * @returns {Promise<string|null>} The rendered HTML, or null if there is nothing to report.
 */
export async function renderNutritionRows(chat, { pending=false, always=false }={}) {
  const statuses = [];
  if ( chat.dehydrated ) statuses.push(_loc(CONFIG.DND5E.conditionTypes[CONDITION_DEHYDRATION].name));
  if ( chat.malnourished ) statuses.push(_loc(CONFIG.DND5E.conditionTypes[CONDITION_MALNUTRITION].name));

  const rows = [];
  if ( chat.trackFood && (chat.food < 1) ) {
    rows.push({
      label: _loc("SIMPLE_NUTRITION.Tracker.Food"),
      icon: chat.food >= 0.5 ? "fa-minus" : "fa-xmark"
    });
  }
  if ( chat.trackWater && (chat.water < 1) ) {
    rows.push({
      label: _loc("SIMPLE_NUTRITION.Tracker.Water"),
      icon: chat.water >= 0.5 ? "fa-minus" : "fa-xmark"
    });
  }
  if ( chat.starvation > 0 ) rows.push({ label: _loc("SIMPLE_NUTRITION.Chat.StarvationLabel"), value: String(chat.starvation) });
  if ( chat.penalty > 0 ) rows.push({ label: _loc("SIMPLE_NUTRITION.Chat.ExhaustionLabel"), value: `+${chat.penalty}` });
  if ( statuses.length ) rows.push({ label: _loc("DND5E.Conditions"), value: statuses.join(", ") });

  if ( !rows.length && always ) rows.push({ label: _loc("SIMPLE_NUTRITION.Chat.AllMet"), icon: "fa-check" });
  if ( !rows.length ) return null;
  return foundry.applications.handlebars.renderTemplate(
    "modules/simple-nutrition-5e/templates/rest-chat.hbs", { rows, pending }
  );
}
