/**
 * @import { NutritionCandidate, NutritionConsumption, NutritionRestState, NutritionState, NutritionType } from "./types/shared.types.mjs";
 */

import { createRollLabel } from "/systems/dnd5e/module/enrichers.mjs";
import { MODULE_ID } from "./constants.mjs";
import {
  formatNutritionAmount,
  getNutritionAmount,
  getNutritionCandidate,
  getNutritionNeeds
} from "./nutrition.mjs";
import NutritionConsumeDialog from "./consume-dialog.mjs";

const FLAG = "nutrition";
const CONDITION_DEHYDRATION = "dehydration";
const CONDITION_MALNUTRITION = "malnutrition";
const EXHAUSTION_PATH = "system.attributes.exhaustion";
const WATER_IDENTIFIER = "water-pint";
const WATERSKIN_IDENTIFIER = "waterskin";

/**
 * Register all nutrition hooks.
 *
 * @returns {void}
 */
export function initNutrition() {
  // Calendar-driven day changes are intentionally deferred pending dnd5e PR #6233:
  // https://github.com/foundryvtt/dnd5e/pull/6233
  Hooks.on("renderCharacterActorSheet", onRenderCharacterActorSheet);
  Hooks.on("dnd5e.preRestCompleted", onPreRestCompleted);
  Hooks.on("dnd5e.restCompleted", onRestCompleted);
  Hooks.on("renderChatMessageHTML", onRenderRestChatMessage);
}

/**
 * Get the current nutrition state for an actor.
 *
 * @param {Actor5e} actor The actor to inspect.
 * @returns {NutritionState} The stored nutrition state.
 */
function getNutritionState(actor) {
  return foundry.utils.mergeObject(
    { food: 0, water: 0, starvation: 0, foodConditionRemoved: false, waterConditionRemoved: false },
    actor.getFlag(MODULE_ID, FLAG) ?? {},
    { inplace: false }
  );
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
 * Get the total nutrition amount contributed by a consumption selection.
 *
 * @param {Actor5e} actor The consuming actor.
 * @param {NutritionConsumption} consumption The selected consumption data.
 * @returns {number} The consumed nutrition amount.
 */
function getConsumedNutrition(actor, consumption) {
  return consumption.entries.reduce((total, entry) => {
    const item = actor.items.get(entry.itemId);
    return total + (getNutritionAmount(actor, consumption.type, item) * entry.quantity);
  }, 0);
}

/**
 * Consume nutrition for the current day.
 *
 * @param {Actor5e} actor The actor consuming nutrition.
 * @param {NutritionType} nutrition The nutrition type being consumed.
 * @returns {Promise<boolean>} True if consumption was applied.
 */
async function consumeNutrition(actor, nutrition) {
  const state = getNutritionState(actor);
  const items = getConsumableItems(actor, nutrition);
  const needs = getNutritionNeeds(actor);
  const condition = nutrition === "food" ? CONDITION_MALNUTRITION : CONDITION_DEHYDRATION;
  const marker = nutrition === "food" ? "foodConditionRemoved" : "waterConditionRemoved";

  /** @type {NutritionConsumption|null} */
  const consumption = await NutritionConsumeDialog.consume(actor, {
    type: nutrition,
    daysWithoutFood: nutrition === "food" ? state.starvation : 0,
    items,
    required: formatNutritionAmount(nutrition, needs[nutrition]),
    requiredValue: needs[nutrition]
  });
  if ( !consumption ) return false;

  if ( consumption.entries.length && !consumption.freshWater ) await consumeSelectedItems(actor, consumption);

  const amount = state[nutrition] + (consumption.freshWater ? needs.water : getConsumedNutrition(actor, consumption));
  const conditionRemoved = (amount >= needs[nutrition]) && actor.hasConditionEffect(condition);

  await actor.setFlag(MODULE_ID, FLAG, {
    ...state,
    [nutrition]: amount,
    [marker]: state[marker] || conditionRemoved
  });

  if ( conditionRemoved ) await actor.toggleStatusEffect(condition, { active: false });

  return true;
}

/**
 * Create a chat message prompting a malnutrition saving throw.
 *
 * @param {Actor5e} actor The actor that must roll the save.
 * @returns {Promise<ChatMessage5e>} A promise that resolves to the created chat message.
 */
async function promptMalnutritionSave(actor) {
  const dataset = {
    action: "rollRequest",
    type: "save",
    ability: "con",
    dc: 10,
    visibility: "all"
  };
  const config = {
    type: "save",
    ability: "con",
    dc: 10,
    format: "short",
    icon: true
  };
  const guidance = await TextEditor.enrichHTML(
    game.i18n.localize("SIMPLE_NUTRITION.Rest.MalnutritionSaveHint"),
    { async: true }
  );
  const request = await foundry.applications.handlebars.renderTemplate(
    "systems/dnd5e/templates/chat/roll-request-card.hbs",
    {
      buttons: [{
        dataset,
        buttonLabel: createRollLabel(config),
        hiddenLabel: createRollLabel({ ...config, hideDC: true })
      }]
    }
  );

  return ChatMessage.implementation.create({
    content: `<div class="card-content">${guidance}</div>${request}`,
    flavor: game.i18n.localize("SIMPLE_NUTRITION.Rest.MalnutritionSave"),
    whisper: game.users.filter(user => actor.testUserPermission(user, "OWNER")),
    speaker: ChatMessage.implementation.getSpeaker({ actor })
  });
}

/**
 * Determine whether a chat message represents a rest that starts a new day.
 *
 * @param {ChatMessage5e} message The chat message to inspect.
 * @returns {boolean} True if the message is a new-day rest message.
 */
function isNewDayRestMessage(message) {
  if ( message.type !== "rest" ) return false;
  const label = game.i18n.localize("DND5E.REST.NewDay.Label").toLowerCase();
  return message.flavor?.toLowerCase().includes(label) ?? false;
}

/**
 * Render the nutrition tracker markup.
 *
 * @param {Actor5e} actor The actor being rendered.
 * @param {boolean} editable Whether the tracker can be interacted with.
 * @returns {string} The rendered tracker markup.
 */
function trackerHTML(actor, editable) {
  const state = getNutritionState(actor);
  const needs = getNutritionNeeds(actor);
  const foodProgress = game.i18n.format("SIMPLE_NUTRITION.Tracker.Progress", {
    current: formatNutritionValue(state.food),
    required: formatNutritionValue(needs.food)
  });
  const waterProgress = game.i18n.format("SIMPLE_NUTRITION.Tracker.Progress", {
    current: formatNutritionValue(state.water),
    required: formatNutritionValue(needs.water)
  });
  const foodTooltip = game.i18n.format("SIMPLE_NUTRITION.Tracker.FoodTooltip", {
    current: formatNutritionAmount("food", state.food),
    required: formatNutritionAmount("food", needs.food)
  });
  const waterTooltip = game.i18n.format("SIMPLE_NUTRITION.Tracker.WaterTooltip", {
    current: formatNutritionAmount("water", state.water),
    required: formatNutritionAmount("water", needs.water)
  });

  return `
    <div class="meter-group simple-nutrition">
      <div class="label roboto-condensed-upper">
        <span>${game.i18n.localize("SIMPLE_NUTRITION.Tracker.Title")}</span>
      </div>

      <div class="simple-nutrition__row">
        <button
          type="button"
          class="unbutton simple-nutrition__button ${(state.food >= needs.food) ? "is-active" : "is-inactive"}"
          data-nutrition="food"
          data-tooltip="${foodTooltip}"
          aria-label="${foodTooltip}"
          ${editable ? "" : "disabled"}
        >
          <i class="fas fa-drumstick-bite" inert></i>
          <span class="simple-nutrition__label">${game.i18n.localize("SIMPLE_NUTRITION.Tracker.Food")}</span>
          <span class="simple-nutrition__state" aria-hidden="true">${foodProgress}</span>
        </button>

        <button
          type="button"
          class="unbutton simple-nutrition__button ${(state.water >= needs.water) ? "is-active" : "is-inactive"}"
          data-nutrition="water"
          data-tooltip="${waterTooltip}"
          aria-label="${waterTooltip}"
          ${editable ? "" : "disabled"}
        >
          <i class="fas fa-glass-water" inert></i>
          <span class="simple-nutrition__label">${game.i18n.localize("SIMPLE_NUTRITION.Tracker.Water")}</span>
          <span class="simple-nutrition__state" aria-hidden="true">${waterProgress}</span>
        </button>
      </div>
    </div>
  `;
}

/**
 * Inject the nutrition tracker into the character sheet.
 *
 * @param {CharacterActorSheet} app The rendered character sheet application.
 * @param {HTMLElement} html The rendered sheet HTML.
 * @returns {void}
 */
function onRenderCharacterActorSheet(app, html) {
  const actor = app.actor;
  if ( actor.type !== "character" ) return;
  if ( html.querySelector(".simple-nutrition") ) return;

  const anchor = html.querySelector(".stats .meter-group:last-of-type");
  if ( !anchor ) return;

  anchor.insertAdjacentHTML("afterend", trackerHTML(actor, app.isEditable));

  for ( const button of html.querySelectorAll(".simple-nutrition [data-nutrition]") ) {
    button.addEventListener("click", event => onToggleNutrition(actor, event));
  }
}

/**
 * Open the nutrition consumption dialog and record consumed nutrition on success.
 *
 * @param {Actor5e} actor The actor consuming nutrition.
 * @param {PointerEvent} event The originating click event.
 * @returns {Promise<void>} A promise that resolves when the workflow completes.
 */
async function onToggleNutrition(actor, event) {
  const { nutrition } = event.currentTarget.dataset;
  const state = getNutritionState(actor);
  const condition = nutrition === "food" ? CONDITION_MALNUTRITION : CONDITION_DEHYDRATION;
  const marker = nutrition === "food" ? "foodConditionRemoved" : "waterConditionRemoved";

  if ( state[nutrition] > 0 ) {
    const action = await foundry.applications.api.DialogV2.confirm({
      content: `
        <p><strong>${foundry.utils.escapeHTML(game.i18n.format("SIMPLE_NUTRITION.Dialog.ManageCurrent", {
          amount: formatNutritionAmount(nutrition, state[nutrition])
        }))}</strong></p>
        <p class="hint">${foundry.utils.escapeHTML(game.i18n.localize(
          nutrition === "food"
            ? "SIMPLE_NUTRITION.Dialog.ManageHintFood"
            : "SIMPLE_NUTRITION.Dialog.ManageHintWater"
        ))}</p>
      `,
      window: {
        icon: nutrition === "food" ? "fa-solid fa-drumstick-bite" : "fa-solid fa-glass-water",
        title: nutrition === "food"
          ? "SIMPLE_NUTRITION.Dialog.ManageTitleFood"
          : "SIMPLE_NUTRITION.Dialog.ManageTitleWater"
      },
      yes: {
        icon: "fa-solid fa-plus",
        label: "SIMPLE_NUTRITION.Dialog.ConsumeMore"
      },
      no: {
        icon: "fa-solid fa-rotate-left",
        label: nutrition === "food"
          ? "SIMPLE_NUTRITION.Dialog.ClearFood"
          : "SIMPLE_NUTRITION.Dialog.ClearWater"
      },
      position: {
        width: 420
      }
    }, { rejectClose: false });

    if ( action === null ) return;
    if ( action === false ) {
      await actor.setFlag(MODULE_ID, FLAG, {
        ...state,
        [nutrition]: 0,
        [marker]: false
      });
      if ( state[marker] ) await actor.toggleStatusEffect(condition, { active: true });
      return;
    }
  }

  await consumeNutrition(actor, nutrition);
}

/**
 * Get all valid consumable items for a nutrition type.
 *
 * @param {Actor5e} actor The actor to inspect.
 * @param {NutritionType} type The nutrition type to collect.
 * @returns {NutritionCandidate[]} The available consumable candidates.
 */
function getConsumableItems(actor, type) {
  const items = (type === "food") ? getFoodCandidates(actor) : getWaterCandidates(actor);
  return items.map(item => getNutritionCandidate(actor, type, item));
}

/**
 * Get all valid food items on an actor.
 *
 * @param {Actor5e} actor The actor to inspect.
 * @returns {Item5e[]} The actor's valid food items.
 */
function getFoodCandidates(actor) {
  return actor.items.filter(item => {
    return (item.type === "consumable")
      && (item.system.type.value === "food")
      && (item.system.identifier !== WATER_IDENTIFIER)
      && (item.system.identifier !== WATERSKIN_IDENTIFIER)
      && item.system.quantity
      && (getNutritionAmount(actor, "food", item) > 0);
  });
}

/**
 * Get all valid water items on an actor.
 *
 * @param {Actor5e} actor The actor to inspect.
 * @returns {Item5e[]} The actor's valid water items.
 */
function getWaterCandidates(actor) {
  return actor.items.filter(item => {
    if ( item.system.identifier !== WATER_IDENTIFIER ) return false;
    if ( !item.system.quantity ) return false;
    return (item.container?.type === "container")
      && (item.container.system.identifier === WATERSKIN_IDENTIFIER);
  });
}

/**
 * Consume the selected nutrition items from the actor.
 *
 * @param {Actor5e} actor The actor to update.
 * @param {NutritionConsumption} consumption The selected consumption data.
 * @returns {Promise<void>} A promise that resolves when item updates finish.
 */
async function consumeSelectedItems(actor, consumption) {
  const updates = [];
  const deletions = [];

  for ( const entry of consumption.entries ) {
    const item = actor.items.get(entry.itemId);
    const quantity = Math.max(0, item.system.quantity - entry.quantity);

    if ( (quantity === 0) && item.system.uses?.autoDestroy ) deletions.push(item.id);
    else updates.push({ _id: item.id, "system.quantity": quantity });
  }

  if ( deletions.length ) await actor.deleteEmbeddedDocuments("Item", deletions);
  if ( updates.length ) await actor.updateEmbeddedDocuments("Item", updates);
}

/**
 * Apply nutrition penalties during rest completion before the system updates the actor.
 *
 * @param {Actor5e} actor The actor completing the rest.
 * @param {RestResult} result The pending rest result data.
 * @param {RestConfiguration} config The rest configuration.
 * @returns {void}
 */
function onPreRestCompleted(actor, result, config) {
  if ( (actor.type !== "character") || !config.newDay ) return;

  const current = getNutritionState(actor);
  const needs = getNutritionNeeds(actor);
  const starvation = current.food > 0 ? 0 : (current.starvation + 1);
  const foodHalf = current.food >= (needs.food / 2);
  const foodFull = current.food >= needs.food;
  const waterHalf = current.water >= (needs.water / 2);
  const waterFull = current.water >= needs.water;

  let penalty = 0;
  let dehydrated = actor.hasConditionEffect("dehydrated") && !waterFull;
  let malnourished = actor.hasConditionEffect("malnourished") && !foodFull;

  if ( !waterHalf ) {
    penalty += 1;
    dehydrated = true;
  }

  if ( (current.food === 0) && (starvation >= 5) ) {
    penalty += 1;
    malnourished = true;
  }

  /** @type {NutritionRestState} */
  const state = {
    starvation,
    dehydrated,
    malnourished,
    penalty,
    recoverExhaustion: !(dehydrated || malnourished),
    saveRequired: !foodHalf && ((current.food > 0) || (starvation < 5))
  };

  const exhaustion = foundry.utils.getProperty(result.clone, EXHAUSTION_PATH) ?? 0;
  const recovery = state.recoverExhaustion ? (config.exhaustionDelta ?? 0) : 0;
  const max = CONFIG.DND5E.conditionTypes.exhaustion.levels ?? 6;

  foundry.utils.mergeObject(result.updateData, {
    [EXHAUSTION_PATH]: Math.clamp(exhaustion + recovery + state.penalty, 0, max)
  });

  result[MODULE_ID] = state;
}

/**
 * Persist the new nutrition state after the rest has completed.
 *
 * @param {Actor5e} actor The actor that completed the rest.
 * @param {RestResult} result The completed rest result data.
 * @param {RestConfiguration} config The rest configuration.
 * @returns {Promise<void>} A promise that resolves when nutrition updates finish.
 */
async function onRestCompleted(actor, result, config) {
  if ( (actor.type !== "character") || !config.newDay ) return;

  const state = result[MODULE_ID];
  if ( !state ) return;
  const previous = getNutritionState(actor);
  const needs = getNutritionNeeds(actor);

  await actor.setFlag(MODULE_ID, FLAG, {
    food: 0,
    water: 0,
    starvation: state.starvation,
    foodConditionRemoved: false,
    waterConditionRemoved: false
  });

  await actor.toggleStatusEffect(CONDITION_DEHYDRATION, { active: state.dehydrated });
  await actor.toggleStatusEffect(CONDITION_MALNUTRITION, { active: state.malnourished });
  if ( result.message ) await result.message.setFlag(MODULE_ID, "restChat", {
    previous: {
      food: previous.food,
      water: previous.water,
      foodRequired: needs.food,
      waterRequired: needs.water
    },
    starvation: state.starvation,
    dehydrated: state.dehydrated,
    malnourished: state.malnourished
  });
  if ( state.saveRequired ) await promptMalnutritionSave(actor);
}

/**
 * Render nutrition controls on a rest chat card.
 *
 * @param {ChatMessage5e} message The rendered chat message.
 * @param {HTMLElement} html The rendered message HTML.
 * @returns {void}
 */
function onRenderRestChatMessage(message, html) {
  if ( !(html instanceof HTMLElement) ) return;
  if ( !isNewDayRestMessage(message) ) return;

  const actor = message.getAssociatedActor();
  if ( !actor?.testUserPermission(game.user, "OWNER") ) return;
  const content = html.querySelector(".message-content");
  if ( !content ) return;

  const render = () => {
    const card = html.querySelector(".rest-card");
    if ( !card || card.querySelector(".simple-nutrition-chat") ) return false;

    const chat = message.getFlag(MODULE_ID, "restChat");
    if ( !chat?.previous ) return false;

    const statuses = [];
    if ( chat.dehydrated ) statuses.push(game.i18n.localize("SIMPLE_NUTRITION.Chat.StatusDehydrated"));
    if ( chat.malnourished ) statuses.push(game.i18n.localize("SIMPLE_NUTRITION.Chat.StatusMalnourished"));
    const rows = [
      {
        label: game.i18n.localize("SIMPLE_NUTRITION.Tracker.Food"),
        complete: chat.previous.food >= chat.previous.foodRequired
      },
      {
        label: game.i18n.localize("SIMPLE_NUTRITION.Tracker.Water"),
        complete: chat.previous.water >= chat.previous.waterRequired
      }
    ];

    if ( chat.starvation > 0 ) {
      rows.push({
        label: game.i18n.localize("SIMPLE_NUTRITION.Chat.StarvationLabel"),
        value: game.i18n.format("SIMPLE_NUTRITION.Chat.StarvationValue", { days: chat.starvation })
      });
    }

    if ( statuses.length ) {
      rows.push({
        label: game.i18n.localize("SIMPLE_NUTRITION.Chat.ConditionsLabel"),
        value: statuses.join(", ")
      });
    }

    card.insertAdjacentHTML("beforeend", `
      <section class="deltas simple-nutrition-chat">
        <strong class="roboto-condensed-upper">${game.i18n.localize("SIMPLE_NUTRITION.Chat.Title")}</strong>
        <ul class="unlist">
          ${rows.map(row => `
            <li class="delta operation-update">
              <span class="label">${foundry.utils.escapeHTML(row.label)}</span>
              <span class="value">
                ${typeof row.complete === "boolean" ? `
                  <i class="fa-solid ${row.complete ? "fa-check" : "fa-xmark"}" aria-hidden="true"></i>
                ` : foundry.utils.escapeHTML(row.value)}
              </span>
            </li>
          `).join("")}
        </ul>
      </section>
    `);

    return true;
  };

  if ( render() ) return;

  const observer = new MutationObserver(() => {
    if ( render() ) observer.disconnect();
  });
  observer.observe(content, { childList: true, subtree: true });
}
