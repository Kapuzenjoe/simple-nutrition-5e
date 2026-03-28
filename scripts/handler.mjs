import { MODULE_ID } from "./constants.mjs";
import NutritionConsumeDialog from "./consume-dialog.mjs";

const FLAG = "nutrition";
const CONDITION_DEHYDRATION = "dehydration";
const CONDITION_MALNUTRITION = "malnutrition";
const EXHAUSTION_PATH = "system.attributes.exhaustion";
const FOOD_IDENTIFIERS = new Set(["rations", "magical-berries"]);
const WATER_IDENTIFIER = "water-pint";
const WATERSKIN_IDENTIFIER = "waterskin";

/**
 * @typedef {object} NutritionState
 * @property {boolean} food Whether the actor has consumed food today.
 * @property {boolean} water Whether the actor has consumed water today.
 * @property {number} starvation The consecutive number of days without food.
 */

/**
 * @typedef {object} NutritionRestState
 * @property {boolean} food Whether the actor has consumed food today.
 * @property {boolean} water Whether the actor has consumed water today.
 * @property {number} starvation The consecutive number of days without food.
 * @property {boolean} dehydrated Whether the actor is dehydrated after the rest.
 * @property {boolean} malnourished Whether the actor is malnourished after the rest.
 */

/**
 * @typedef {object} NutritionCandidate
 * @property {string} id The item identifier.
 * @property {string} name The item name.
 * @property {string} img The item image path.
 * @property {number} quantity The available item quantity.
 * @property {string|null} container The parent container name, if any.
 */

/**
 * @typedef {object} NutritionConsumptionEntry
 * @property {string} itemId The consumed item identifier.
 * @property {number} quantity The quantity consumed from the item.
 */

/**
 * @typedef {object} NutritionConsumption
 * @property {"food"|"water"} type The nutrition type being consumed.
 * @property {NutritionConsumptionEntry[]} entries The selected item consumption entries.
 */

/* -------------------------------------------- */

/**
 * Register all nutrition hooks.
 *
 * @returns {void}
 */
export function initNutrition() {
  Hooks.on("renderCharacterActorSheet", onRenderCharacterActorSheet);
  Hooks.on("dnd5e.preRestCompleted", onPreRestCompleted);
  Hooks.on("dnd5e.restCompleted", onRestCompleted);
}

/* -------------------------------------------- */

/**
 * Get the current nutrition state for an actor.
 *
 * @param {Actor5e} actor The actor to inspect.
 * @returns {NutritionState} The stored nutrition state.
 */
function getNutritionState(actor) {
  return foundry.utils.mergeObject(
    { food: false, water: false, starvation: 0 },
    actor.getFlag(MODULE_ID, FLAG) ?? {},
    { inplace: false }
  );
}

/* -------------------------------------------- */

/**
 * Render the nutrition tracker markup.
 *
 * @param {Actor5e} actor The actor being rendered.
 * @param {boolean} editable Whether the tracker can be interacted with.
 * @returns {string} The rendered tracker markup.
 */
function trackerHTML(actor, editable) {
  const state = getNutritionState(actor);

  return `
    <div class="meter-group simple-nutrition">
      <div class="label roboto-condensed-upper">
        <span>Nutrition</span>
      </div>

      <div class="simple-nutrition__row">
        <button
          type="button"
          class="unbutton simple-nutrition__button ${state.food ? "is-active" : "is-inactive"}"
          data-nutrition="food"
          data-tooltip="${state.food ? "Food consumed today" : "Food missing today"}"
          aria-label="${state.food ? "Food consumed today" : "Food missing today"}"
          aria-pressed="${state.food}"
          ${editable ? "" : "disabled"}
        >
          <i class="fas fa-drumstick-bite" inert></i>
          <span class="simple-nutrition__label">Food</span>
          <span class="simple-nutrition__state" aria-hidden="true">${state.food ? "✓" : "✕"}</span>
        </button>

        <button
          type="button"
          class="unbutton simple-nutrition__button ${state.water ? "is-active" : "is-inactive"}"
          data-nutrition="water"
          data-tooltip="${state.water ? "Water consumed today" : "Water missing today"}"
          aria-label="${state.water ? "Water consumed today" : "Water missing today"}"
          aria-pressed="${state.water}"
          ${editable ? "" : "disabled"}
        >
          <i class="fas fa-glass-water" inert></i>
          <span class="simple-nutrition__label">Water</span>
          <span class="simple-nutrition__state" aria-hidden="true">${state.water ? "✓" : "✕"}</span>
        </button>
      </div>
    </div>
  `;
}

/* -------------------------------------------- */

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

/* -------------------------------------------- */

/**
 * Open the nutrition consumption dialog and mark the actor as fed or hydrated on success.
 *
 * @param {Actor5e} actor The actor consuming nutrition.
 * @param {PointerEvent} event The originating click event.
 * @returns {Promise<void>} A promise that resolves when the workflow completes.
 */
async function onToggleNutrition(actor, event) {
  const { nutrition } = event.currentTarget.dataset;
  const items = getConsumableItems(actor, nutrition);

  if ( !items.length ) {
    ui.notifications.warn(nutrition === "food" ? "No food available." : "No water available.");
    return;
  }

  /** @type {NutritionConsumption|null} */
  const consumption = await NutritionConsumeDialog.consume(actor, { type: nutrition, items });
  if ( !consumption ) return;

  await consumeSelectedItems(actor, consumption);

  const state = getNutritionState(actor);
  await actor.setFlag(MODULE_ID, FLAG, { ...state, [nutrition]: true });
}

/* -------------------------------------------- */

/**
 * Get all valid consumable items for a nutrition type.
 *
 * @param {Actor5e} actor The actor to inspect.
 * @param {"food"|"water"} type The nutrition type to collect.
 * @returns {NutritionCandidate[]} The available consumable candidates.
 */
function getConsumableItems(actor, type) {
  const items = (type === "food") ? getFoodCandidates(actor) : getWaterCandidates(actor);

  return items.map(item => ({
    id: item.id,
    name: item.name,
    img: item.img,
    quantity: item.system.quantity,
    container: item.container?.name ?? null
  }));
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
    return (item.type === "consumable")
      && (item.system.type.value === "food")
      && FOOD_IDENTIFIERS.has(item.system.identifier)
      && item.system.quantity;
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
    if ( item.system.identifier !== WATER_IDENTIFIER ) return false;
    if ( !item.system.quantity ) return false;
    return (item.container?.type === "container")
      && (item.container.system.identifier === WATERSKIN_IDENTIFIER);
  });
}

/* -------------------------------------------- */

/**
 * Consume the selected nutrition items from the actor.
 *
 * @param {Actor5e} actor The actor to update.
 * @param {NutritionConsumption} consumption The selected consumption data.
 * @returns {Promise<void>} A promise that resolves when item updates finish.
 */
async function consumeSelectedItems(actor, consumption) {
  const updates = consumption.entries.map(entry => {
    const item = actor.items.get(entry.itemId);
    return {
      _id: item.id,
      "system.quantity": Math.max(0, item.system.quantity - entry.quantity)
    };
  });

  if ( updates.length ) await actor.updateEmbeddedDocuments("Item", updates);
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
function onPreRestCompleted(actor, result, config) {
  if ( (actor.type !== "character") || !config.newDay ) return;

  const state = getNutritionState(actor);
  const starvation = state.food ? 0 : (state.starvation + 1);
  const dehydrated = !state.water;
  const malnourished = starvation >= 5;

  const exhaustion = foundry.utils.getProperty(result.clone, EXHAUSTION_PATH) ?? 0;
  const recovery = (!dehydrated && !malnourished) ? (config.exhaustionDelta ?? 0) : 0;
  const penalty = Number(dehydrated) + Number(malnourished);
  const max = CONFIG.DND5E.conditionTypes.exhaustion.levels ?? 6;

  foundry.utils.mergeObject(result.updateData, {
    [EXHAUSTION_PATH]: Math.clamp(exhaustion + recovery + penalty, 0, max)
  });

  /** @type {NutritionRestState} */
  result[MODULE_ID] = {
    food: false,
    water: false,
    starvation,
    dehydrated,
    malnourished
  };
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
async function onRestCompleted(actor, result, config) {
  if ( (actor.type !== "character") || !config.newDay ) return;

  const state = result[MODULE_ID];
  if ( !state ) return;

  await actor.setFlag(MODULE_ID, FLAG, {
    food: state.food,
    water: state.water,
    starvation: state.starvation
  });

  await actor.toggleStatusEffect(CONDITION_DEHYDRATION, { active: state.dehydrated });
  await actor.toggleStatusEffect(CONDITION_MALNUTRITION, { active: state.malnourished });
}
