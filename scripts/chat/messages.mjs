import {
  CONDITION_DEHYDRATION,
  CONDITION_MALNUTRITION,
  EXHAUSTION_PATH,
  MODULE_ID
} from "../config.mjs";

/**
 * Create a chat message prompting a malnutrition saving throw.
 *
 * @param {Actor5e} actor The actor that must roll the save.
 * @param {number} dc The save DC.
 * @returns {Promise<ChatMessage5e>} A promise that resolves to the created chat message.
 */
export async function promptMalnutritionSave(actor, dc) {
  const { createRollLabel } = game.dnd5e.enrichers;
  const config = { type: "save", ability: "con", dc, format: "short", icon: true };
  const guidance = await foundry.applications.ux.TextEditor.enrichHTML(
    game.i18n.localize("SIMPLE_NUTRITION.Rest.MalnutritionSaveHint"), { async: true }
  );
  const applyLabel = `<i class="fa-solid fa-heart-circle-exclamation"></i> ${game.i18n.localize("SIMPLE_NUTRITION.Rest.MalnutritionApply")}`;
  const request = await foundry.applications.handlebars.renderTemplate(
    "systems/dnd5e/templates/chat/roll-request-card.hbs",
    {
      buttons: [
        {
          dataset: { action: "rollMalnutritionSave", dc },
          buttonLabel: createRollLabel(config),
          hiddenLabel: createRollLabel({ ...config, hideDC: true })
        },
        { dataset: { action: "applyMalnutritionFailure" }, buttonLabel: applyLabel, hiddenLabel: applyLabel }
      ]
    }
  );

  const owners = game.users.filter(user => actor.testUserPermission(user, "OWNER"));
  return ChatMessage.implementation.create({
    content: `<div class="card-content">${guidance}</div>${request}`,
    whisper: owners,
    author: owners.find(user => !user.isGM)?.id,
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    flags: { [MODULE_ID]: { malnutritionSave: { actorUuid: actor.uuid } } }
  });
}

/**
 * Attach the failed-save button handler on a malnutrition save chat message.
 *
 * @param {ChatMessage5e} message The rendered chat message.
 * @param {HTMLElement} html The rendered message HTML.
 * @returns {void}
 */
export function onRenderMalnutritionSaveMessage(message, html) {
  const flag = message.getFlag(MODULE_ID, "malnutritionSave");
  if (!flag) return;

  const rollButton = html.querySelector("[data-action='rollMalnutritionSave']");
  if (rollButton) {
    if (flag.success !== undefined) markRollResult(rollButton, flag.success);
    rollButton.addEventListener("click", () => onRollMalnutritionSave(message, flag, rollButton));
  }

  const applyButton = html.querySelector("[data-action='applyMalnutritionFailure']");
  if (applyButton) {
    if (flag.applied) applyButton.disabled = true;
    else applyButton.addEventListener("click", () => onApplyMalnutritionFailure(message, flag, applyButton));
  }
}

/**
 * Roll the malnutrition saving throw for the actor bound to the message and record the result.
 * Targets the actor explicitly instead of relying on token selection, unlike the system's generic
 * roll-request dispatch (`dnd5e.enrichers.handleRoll`).
 *
 * @param {ChatMessage5e} message The originating chat message.
 * @param {{ actorUuid: string }} flag The malnutrition save flag data.
 * @param {HTMLElement} button The roll button that was clicked.
 * @returns {Promise<void>}
 */
async function onRollMalnutritionSave(message, flag, button) {
  const actor = await fromUuid(flag.actorUuid);
  if (!actor?.testUserPermission(game.user, "OWNER")) return;

  const rolls = await actor.rollSavingThrow({ ability: "con", target: Number(button.dataset.dc) });
  if (!rolls) return;

  markRollResult(button, rolls[0].isSuccess);
  await message.setFlag(MODULE_ID, "malnutritionSave", { ...flag, success: rolls[0].isSuccess });
}

/**
 * Mark the roll button with a pass/fail icon and color, matching the system's save-result styling.
 *
 * @param {HTMLElement} button The roll button.
 * @param {boolean} success Whether the save succeeded.
 * @returns {void}
 */
function markRollResult(button, success) {
  const key = success ? "success" : "failure";
  button.style.color = `var(--dnd5e-color-${key})`;
  button.style.backgroundColor = `var(--dnd5e-color-${key}-background)`;
  button.style.borderColor = `var(--dnd5e-color-${key})`;
  button.querySelector(".result-icon")?.remove();
  const icon = document.createElement("i");
  icon.className = `fa-solid result-icon ${success ? "fa-check" : "fa-xmark"}`;
  button.prepend(icon);
}

/**
 * Apply exhaustion and malnutrition condition after a failed saving throw.
 *
 * @param {ChatMessage5e} message The originating chat message.
 * @param {{ actorUuid: string }} flag The malnutrition save flag data.
 * @param {HTMLElement} button The apply button that was clicked.
 * @returns {Promise<void>}
 */
async function onApplyMalnutritionFailure(message, flag, button) {
  const actor = await fromUuid(flag.actorUuid);
  if (!actor?.testUserPermission(game.user, "OWNER")) return;
  button.disabled = true;
  const exhaustion = foundry.utils.getProperty(actor, EXHAUSTION_PATH) ?? 0;
  const max = CONFIG.DND5E.conditionTypes.exhaustion.levels ?? 6;
  await actor.update({ [EXHAUSTION_PATH]: Math.clamp(exhaustion + 1, 0, max) });
  await actor.toggleStatusEffect(CONDITION_MALNUTRITION, { active: true });
  await message.setFlag(MODULE_ID, "malnutritionSave", { ...flag, applied: true });
}

/**
 * Render nutrition controls on a rest chat card.
 *
 * @param {ChatMessage5e} message The rendered chat message.
 * @param {HTMLElement} html The rendered message HTML.
 * @returns {Promise<void>} A promise that resolves when the summary has been rendered.
 */
export async function onRenderRestChatMessage(message, html) {
  const chat = message.getFlag(MODULE_ID, "nutritionChat");
  if (!chat) return;

  const actor = message.getAssociatedActor();
  if (!actor?.testUserPermission(game.user, "OWNER")) return;

  const card = html.querySelector(".rest-card");
  if (!card || card.querySelector(".simple-nutrition-chat")) return;

  const content = await renderNutritionRows(chat);
  if (content) card.insertAdjacentHTML("beforeend", content);
}

/**
 * Render the localized nutrition summary rows for a chat message.
 *
 * @param {object} chat The nutrition summary data.
 * @returns {Promise<string|null>} The rendered HTML, or null if there is nothing to report.
 */
async function renderNutritionRows(chat) {
  const statuses = [];
  if (chat.dehydrated) statuses.push(game.i18n.localize(CONFIG.DND5E.conditionTypes[CONDITION_DEHYDRATION].name));
  if (chat.malnourished) statuses.push(game.i18n.localize(CONFIG.DND5E.conditionTypes[CONDITION_MALNUTRITION].name));

  const rows = [];
  if (chat.trackFood && (chat.food < 1)) rows.push({
    label: game.i18n.localize("SIMPLE_NUTRITION.Tracker.Food"),
    icon: chat.food >= 0.5 ? "fa-minus" : "fa-xmark"
  });
  if (chat.trackWater && (chat.water < 1)) rows.push({
    label: game.i18n.localize("SIMPLE_NUTRITION.Tracker.Water"),
    icon: chat.water >= 0.5 ? "fa-minus" : "fa-xmark"
  });
  if (chat.starvation > 0) rows.push({ label: game.i18n.localize("SIMPLE_NUTRITION.Chat.StarvationLabel"), value: String(chat.starvation) });
  if (statuses.length) rows.push({ label: game.i18n.localize("DND5E.Conditions"), value: statuses.join(", ") });

  if (!rows.length) return null;
  return foundry.applications.handlebars.renderTemplate("modules/simple-nutrition-5e/templates/rest-chat.hbs", { rows });
}

/**
 * Create a chat message summarizing nutrition intake for a new day, outside of the rest workflow.
 *
 * @param {Actor5e} actor The actor the summary applies to.
 * @param {object} chat The nutrition summary data.
 * @returns {Promise<ChatMessage5e|null>} A promise that resolves to the created chat message, or null if there is nothing to report.
 */
export async function postNutritionSummary(actor, chat) {
  const content = await renderNutritionRows(chat);
  if (!content) return null;

  return ChatMessage.implementation.create({
    content,
    whisper: game.users.filter(user => actor.testUserPermission(user, "OWNER")),
    speaker: ChatMessage.implementation.getSpeaker({ actor })
  });
}
