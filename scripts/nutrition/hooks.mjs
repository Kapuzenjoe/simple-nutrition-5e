/**
 * @import { NutritionCandidate, NutritionConsumption, NutritionRestState, NutritionState, NutritionType } from "../_types.mjs";
 */

import {
  CONDITION_DEHYDRATION,
  CONDITION_EFFECT_DEHYDRATED,
  CONDITION_EFFECT_MALNOURISHED,
  CONDITION_MALNUTRITION,
  EXHAUSTION_PATH,
  MODULE_ID,
  WATER_IDENTIFIERS,
  WATERSKIN_IDENTIFIER
} from "../config.mjs";
import {
  formatNutritionAmount,
  formatNutritionValue,
  getNutritionAmount,
  getNutritionCandidate,
  getNutritionNeeds,
  getNutritionState,
  getStarvationLimit,
  setNutritionState
} from "./actor.mjs";
import NutritionConsumeDialog from "../applications/consume-dialog.mjs";
import NutritionConfig from "../applications/nutrition-config.mjs";

const { createRollLabel } = game.dnd5e.enrichers;

/**
 * Register all nutrition hooks.
 *
 * @returns {void}
 */
export function initNutritionHooks() {
  // Calendar-driven day changes are intentionally deferred pending dnd5e PR https://github.com/foundryvtt/dnd5e/pull/6233
  Hooks.on("renderCharacterActorSheet", onRenderCharacterActorSheet);
  if (game.modules.get("tidy5e-sheet")?.active) Hooks.once("tidy5e-sheet.ready", registerTidyNutritionContent);
  Hooks.on("dnd5e.preRestCompleted", onPreRestCompleted);
  Hooks.on("dnd5e.restCompleted", onRestCompleted);
  Hooks.on("dnd5e.renderChatMessage", onRenderRestChatMessage);
}

/**
 * Consume nutrition for the current day.
 *
 * @param {Actor5e} actor The actor consuming nutrition.
 * @param {NutritionType} nutrition The nutrition type being consumed.
 * @returns {Promise<boolean>} True if consumption was applied.
 */
async function consumeNutrition(actor, nutrition) {
  const isFood = nutrition === "food";
  const state = getNutritionState(actor);
  const items = getConsumableItems(actor, nutrition);
  const needs = getNutritionNeeds(actor);
  const condition = isFood ? CONDITION_MALNUTRITION : CONDITION_DEHYDRATION;
  const conditionEffect = isFood ? CONDITION_EFFECT_MALNOURISHED : CONDITION_EFFECT_DEHYDRATED;
  const marker = isFood ? "foodConditionRemoved" : "waterConditionRemoved";

  /** @type {NutritionConsumption|null} */
  const consumption = await NutritionConsumeDialog.consume(actor, {
    type: nutrition,
    daysWithoutFood: isFood ? state.starvation : 0,
    items,
    required: formatNutritionAmount(nutrition, needs[nutrition]),
    requiredValue: needs[nutrition]
  });
  if (!consumption) return false;

  const entries = consumption.entries.reduce((result, entry) => {
    const item = actor.items.get(entry.itemId);
    if (item) result.push({ item, quantity: entry.quantity });
    return result;
  }, []);
  const consumed = consumption.freshWater ? needs.water : entries.reduce((total, entry) => {
    return total + (getNutritionAmount(actor, nutrition, entry.item) * entry.quantity);
  }, 0);
  if (entries.length && !consumption.freshWater) await consumeSelectedItems(actor, entries);

  const amount = state[nutrition] + consumed;
  const conditionRemoved = (amount >= needs[nutrition]) && actor.hasConditionEffect(conditionEffect);

  await setNutritionState(actor, {
    ...state,
    [nutrition]: amount,
    [marker]: state[marker] || conditionRemoved
  });

  if (conditionRemoved) await actor.toggleStatusEffect(condition, { active: false });

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
  const malnutritionLabel = game.i18n.localize(CONFIG.DND5E.conditionTypes[CONDITION_MALNUTRITION].name);
  const constitutionLabel = game.i18n.localize(CONFIG.DND5E.abilities.con.label);
  const guidance = await foundry.applications.ux.TextEditor.enrichHTML(
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
    flavor: `${malnutritionLabel} ${game.i18n.format("DND5E.SavingThrowDC", {
      ability: constitutionLabel,
      dc: 10
    })}`,
    whisper: game.users.filter(user => actor.testUserPermission(user, "OWNER")),
    speaker: ChatMessage.implementation.getSpeaker({ actor })
  });
}

/**
 * Render the nutrition tracker markup.
 *
 * @param {Actor5e} actor The actor being rendered.
 * @param {boolean} editable Whether the tracker can be interacted with.
 * @returns {string} The rendered tracker markup.
 */
function trackerHTML(actor, editable, configurable) {
  const state = getNutritionState(actor);
  const needs = getNutritionNeeds(actor);
  const configTooltip = foundry.utils.escapeHTML(game.i18n.localize("SIMPLE_NUTRITION.Config.Configure"));
  const foodProgress = game.i18n.format("SIMPLE_NUTRITION.Tracker.Progress", {
    current: formatNutritionValue("food", state.food),
    required: formatNutritionValue("food", needs.food)
  });
  const waterProgress = game.i18n.format("SIMPLE_NUTRITION.Tracker.Progress", {
    current: formatNutritionValue("water", state.water),
    required: formatNutritionValue("water", needs.water)
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
        ${configurable ? `
          <button
            type="button"
            class="config-button unbutton"
            data-action="configureNutrition"
            data-tooltip="${configTooltip}"
            aria-label="${configTooltip}"
          >
            <i class="fas fa-cog" inert></i>
          </button>
        ` : ""}
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
 * Render compact nutrition controls for Tidy 5e header actions.
 *
 * @param {Actor5e} actor The actor being rendered.
 * @param {boolean} editable Whether the tracker can be interacted with.
 * @returns {string} The rendered tracker markup.
 */
function tidyTrackerHTML(actor, editable, configurable) {
  const state = getNutritionState(actor);
  const needs = getNutritionNeeds(actor);
  const configTooltip = foundry.utils.escapeHTML(game.i18n.localize("SIMPLE_NUTRITION.Config.Configure"));
  const foodTooltip = game.i18n.format("SIMPLE_NUTRITION.Tracker.FoodTooltip", {
    current: formatNutritionAmount("food", state.food),
    required: formatNutritionAmount("food", needs.food)
  });
  const waterTooltip = game.i18n.format("SIMPLE_NUTRITION.Tracker.WaterTooltip", {
    current: formatNutritionAmount("water", state.water),
    required: formatNutritionAmount("water", needs.water)
  });

  return `
    <button
      type="button"
      class="button button-icon-only button-gold flexshrink simple-nutrition__button ${(state.food >= needs.food) ? "simple-nutrition__button--ready" : ""}"
      data-simple-nutrition
      data-nutrition="food"
      data-tooltip="${foodTooltip}"
      aria-label="${foodTooltip}"
      ${editable ? "" : "disabled"}
    >
      <i class="fas fa-drumstick-bite" inert></i>
    </button>

    <button
      type="button"
      class="button button-icon-only button-gold flexshrink simple-nutrition__button ${(state.water >= needs.water) ? "simple-nutrition__button--ready" : ""}"
      data-simple-nutrition
      data-nutrition="water"
      data-tooltip="${waterTooltip}"
      aria-label="${waterTooltip}"
      ${editable ? "" : "disabled"}
    >
      <i class="fas fa-glass-water" inert></i>
    </button>

    ${configurable ? `
      <button
        type="button"
        class="button button-borderless button-icon-only button-config flexshrink"
        data-simple-nutrition
        data-action="configureNutrition"
        data-tooltip="${configTooltip}"
        aria-label="${configTooltip}"
      >
        <i class="fas fa-cog" inert></i>
      </button>
    ` : ""}
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
  if (actor.type !== "character") return;
  if (html.querySelector(".simple-nutrition")) return;

  const anchor = html.querySelector(".stats .meter-group:last-of-type");
  if (!anchor) return;

  const configurable = app.isEditable && !!(app.isEditMode ?? (app._mode === app.constructor.MODES?.EDIT));
  anchor.insertAdjacentHTML("afterend", trackerHTML(actor, app.isEditable, configurable));

  for (const button of html.querySelectorAll(".simple-nutrition [data-nutrition]")) {
    button.addEventListener("click", event => onToggleNutrition(actor, event));
  }

  for (const button of html.querySelectorAll(".simple-nutrition [data-action='configureNutrition']")) {
    button.addEventListener("click", event => onConfigureNutrition(app, event));
  }
}

/**
 * Register compact nutrition controls with Tidy 5e character sheets.
 *
 * @param {object} api Tidy 5e Sheets API.
 * @returns {void}
 */
function registerTidyNutritionContent(api) {
  const headerActionsSelector = '[data-tidy-sheet-part="sheet-header-actions-container"]';

  api.registerCharacterContent(new api.models.HtmlContent({
    html: context => {
      const editable = context.editable ?? context.actor?.isOwner ?? false;
      return tidyTrackerHTML(context.actor, editable, editable && !!context.unlocked);
    },
    injectParams: {
      selector: headerActionsSelector,
      position: "afterbegin"
    },
    enabled: context => context.actor?.type === "character",
    onRender: ({ app, element }) => {
      const actor = app.actor;
      const anchor = element.querySelector(headerActionsSelector);
      if (!actor || !anchor) return;

      for (const button of anchor.querySelectorAll("[data-simple-nutrition][data-nutrition]")) {
        button.addEventListener("click", event => onToggleNutrition(actor, event));
      }

      for (const button of anchor.querySelectorAll("[data-simple-nutrition][data-action='configureNutrition']")) {
        button.addEventListener("click", event => onConfigureNutrition(app, event));
      }
    }
  }), { layout: "all" });
}

/**
 * Open the nutrition config sheet for the current actor.
 *
 * @param {CharacterActorSheet} app The rendered character sheet application.
 * @param {PointerEvent} event The originating click event.
 * @returns {void}
 */
function onConfigureNutrition(app, event) {
  event.preventDefault();
  event.stopPropagation();

  const config = new NutritionConfig({ document: app.actor });
  if (typeof app._renderChild === "function") return void app._renderChild(config);
  void config.render(true);
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
  const isFood = nutrition === "food";
  const state = getNutritionState(actor);
  const condition = isFood ? CONDITION_MALNUTRITION : CONDITION_DEHYDRATION;
  const marker = isFood ? "foodConditionRemoved" : "waterConditionRemoved";

  if (state[nutrition] > 0) {
    const action = await foundry.applications.api.DialogV2.confirm({
      content: `
        <p><strong>${foundry.utils.escapeHTML(game.i18n.format("SIMPLE_NUTRITION.Dialog.ManageCurrent", {
        amount: formatNutritionAmount(nutrition, state[nutrition])
      }))}</strong></p>
      <p class="hint">${foundry.utils.escapeHTML(game.i18n.localize(
        isFood
          ? "SIMPLE_NUTRITION.Dialog.ManageHintFood"
          : "SIMPLE_NUTRITION.Dialog.ManageHintWater"
      ))}</p>
      `,
      window: {
        icon: isFood ? "fa-solid fa-drumstick-bite" : "fa-solid fa-glass-water",
        title: isFood
          ? "SIMPLE_NUTRITION.Dialog.ManageTitleFood"
          : "SIMPLE_NUTRITION.Dialog.ManageTitleWater"
      },
      yes: {
        icon: "fa-solid fa-plus",
        label: "SIMPLE_NUTRITION.Dialog.ConsumeMore"
      },
      no: {
        icon: "fa-solid fa-rotate-left",
        label: isFood
          ? "SIMPLE_NUTRITION.Dialog.ClearFood"
          : "SIMPLE_NUTRITION.Dialog.ClearWater"
      },
      position: {
        width: 420
      }
    }, { rejectClose: false });

    if (action === null) return;
    if (action === false) {
      await setNutritionState(actor, {
        ...state,
        [nutrition]: 0,
        [marker]: false
      });
      if (state[marker]) await actor.toggleStatusEffect(condition, { active: true });
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
    if (item.type !== "consumable") return false;
    if (!item.system.quantity) return false;
    if (item.system.type.value !== "food") return false;
    if (WATER_IDENTIFIERS.has(item.system.identifier)) return false;
    if (item.system.identifier === WATERSKIN_IDENTIFIER) return false;
    return getNutritionAmount(actor, "food", item) > 0;
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
    if (item.type !== "consumable") return false;
    if (!item.system.quantity) return false;
    if (!WATER_IDENTIFIERS.has(item.system.identifier)) return false;
    if (item.system.identifier === "water-pint") {
      return (item.container?.type === "container")
        && (item.container.system.identifier === WATERSKIN_IDENTIFIER);
    }
    return true;
  });
}

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

  for (const entry of entries) {
    const quantity = Math.max(0, entry.item.system.quantity - entry.quantity);

    if ((quantity === 0) && entry.item.system.uses?.autoDestroy) deletions.push(entry.item.id);
    else updates.push({ _id: entry.item.id, "system.quantity": quantity });
  }

  if (deletions.length) await actor.deleteEmbeddedDocuments("Item", deletions);
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
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
  if ((actor.type !== "character") || !config.newDay) return;

  const current = getNutritionState(actor);
  const needs = getNutritionNeeds(actor);
  const starvationLimit = getStarvationLimit(actor);
  const starvation = current.food > 0 ? 0 : (current.starvation + 1);
  const foodHalf = current.food >= (needs.food / 2);
  const foodFull = current.food >= needs.food;
  const waterHalf = current.water >= (needs.water / 2);
  const waterFull = current.water >= needs.water;

  let penalty = 0;
  let dehydrated = actor.hasConditionEffect(CONDITION_EFFECT_DEHYDRATED) && !waterFull;
  let malnourished = actor.hasConditionEffect(CONDITION_EFFECT_MALNOURISHED) && !foodFull;

  if (!waterHalf) {
    penalty += 1;
    dehydrated = true;
  }

  if ((current.food === 0) && (starvation >= starvationLimit)) {
    penalty += 1;
    malnourished = true;
  }

  /** @type {NutritionRestState} */
  const state = {
    starvation,
    dehydrated,
    malnourished,
    saveRequired: !foodHalf && ((current.food > 0) || (starvation < starvationLimit))
  };

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
 * Persist the new nutrition state after the rest has completed.
 *
 * @param {Actor5e} actor The actor that completed the rest.
 * @param {RestResult} result The completed rest result data.
 * @param {RestConfiguration} config The rest configuration.
 * @returns {Promise<void>} A promise that resolves when nutrition updates finish.
 */
async function onRestCompleted(actor, result, config) {
  if ((actor.type !== "character") || !config.newDay) return;

  const state = result[MODULE_ID];
  if (!state) return;
  const previous = getNutritionState(actor);
  const needs = getNutritionNeeds(actor);

  await setNutritionState(actor, {
    food: 0,
    water: 0,
    starvation: state.starvation,
    foodConditionRemoved: false,
    waterConditionRemoved: false
  });

  await actor.toggleStatusEffect(CONDITION_DEHYDRATION, { active: state.dehydrated });
  await actor.toggleStatusEffect(CONDITION_MALNUTRITION, { active: state.malnourished });

  if (result.message) await result.message.setFlag(MODULE_ID, "restChat", {
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

  if (state.saveRequired) await promptMalnutritionSave(actor);
}

/**
 * Render nutrition controls on a rest chat card.
 *
 * @param {ChatMessage5e} message The rendered chat message.
 * @param {HTMLElement} html The rendered message HTML.
 * @returns {Promise<void>} A promise that resolves when the summary has been rendered.
 */
async function onRenderRestChatMessage(message, html) {
  if (!(html instanceof HTMLElement)) return;
  const chat = message.getFlag(MODULE_ID, "restChat");
  if (!chat?.previous) return;

  const actor = message.getAssociatedActor();
  if (!actor?.testUserPermission(game.user, "OWNER")) return;

  const card = html.querySelector(".rest-card");
  if (!card || card.querySelector(".simple-nutrition-chat")) return;

  const statuses = [];
  if (chat.dehydrated) statuses.push(game.i18n.localize(CONFIG.DND5E.conditionTypes[CONDITION_DEHYDRATION].name));
  if (chat.malnourished) statuses.push(game.i18n.localize(CONFIG.DND5E.conditionTypes[CONDITION_MALNUTRITION].name));

  const rows = [
    {
      label: game.i18n.localize("SIMPLE_NUTRITION.Tracker.Food"),
      status: chat.previous.food >= chat.previous.foodRequired
        ? "full"
        : (chat.previous.food >= (chat.previous.foodRequired / 2) ? "half" : "none")
    },
    {
      label: game.i18n.localize("SIMPLE_NUTRITION.Tracker.Water"),
      status: chat.previous.water >= chat.previous.waterRequired
        ? "full"
        : (chat.previous.water >= (chat.previous.waterRequired / 2) ? "half" : "none")
    }
  ];

  if (chat.starvation > 0) rows.push({
    label: game.i18n.localize("SIMPLE_NUTRITION.Chat.StarvationLabel"),
    value: game.i18n.format("SIMPLE_NUTRITION.Chat.StarvationValue", { days: chat.starvation })
  });

  if (statuses.length) rows.push({
    label: game.i18n.localize("DND5E.Conditions"),
    value: statuses.join(", ")
  });

  const icons = {
    full: "fa-check",
    half: "fa-minus",
    none: "fa-xmark"
  };
  const content = await foundry.applications.handlebars.renderTemplate(
    "modules/simple-nutrition-5e/templates/rest-chat.hbs",
    {
      rows: rows.map(row => ({
        ...row,
        icon: icons[row.status] ?? null
      }))
    }
  );
  card.insertAdjacentHTML("beforeend", content);
}
