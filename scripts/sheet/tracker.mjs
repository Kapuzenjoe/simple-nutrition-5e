/**
 * @import { NutritionState, NutritionTrackerContext, NutritionType } from "../_types.mjs";
 */

import NutritionConfig from "../applications/nutrition-config.mjs";
import {
  CONDITION_DEHYDRATION,
  CONDITION_MALNUTRITION,
  MODULE_ID,
  SETTING_KEYS
} from "../config.mjs";
import {
  formatNutritionAmount,
  getNutritionFlag,
  getNutritionNeeds,
  getNutritionState,
  setNutritionState
} from "../nutrition/actor.mjs";
import { consumeGroupNutrition, consumeNutrition } from "../nutrition/consumption.mjs";

/**
 * Inject the nutrition tracker into the character sheet.
 *
 * @param {CharacterActorSheet} app The rendered character sheet application.
 * @param {HTMLElement} html The rendered sheet HTML.
 * @returns {void}
 */
export function onRenderCharacterActorSheet(app, html) {
  const actor = app.actor;
  if ( html.querySelector(".simple-nutrition") ) return;

  const anchor = [...html.querySelectorAll(".stats .meter-group")].at(-1);
  if ( !anchor ) return;

  const configurable = app.isEditable && app.isEditMode;
  anchor.insertAdjacentHTML("afterend", renderTracker(actor, app.isEditable, configurable));

  for ( const button of html.querySelectorAll(".simple-nutrition [data-nutrition]") ) {
    button.addEventListener("click", event => onToggleNutrition(actor, event));
  }

  for ( const button of html.querySelectorAll(".simple-nutrition [data-action='configureNutrition']") ) {
    button.addEventListener("click", event => onConfigureNutrition(app, event));
  }
}

/* -------------------------------------------- */

/**
 * Inject the nutrition tracker into each owned character entry and the group action into the group sheet.
 *
 * @param {GroupActorSheet} app The rendered group sheet application.
 * @param {HTMLElement} html The rendered sheet HTML.
 * @returns {void}
 */
export function onRenderGroupActorSheet(app, html) {
  if ( game.settings.get(MODULE_ID, SETTING_KEYS.DISABLE_GROUP_SHEET) ) return;

  const buttons = html.querySelector(".sheet-header-buttons");
  if ( buttons && game.user.isGM ) {
    buttons.querySelector(".simple-nutrition-group-action")?.remove();
    buttons.insertAdjacentHTML("beforeend", renderGroupAction());
    buttons.querySelector(".simple-nutrition-group-action")
      .addEventListener("click", () => onConsumeGroupNutrition(app.actor));
  }

  for ( const actor of app.actor.system.playerCharacters ) {
    if ( !actor.isOwner ) continue;

    const info = html.querySelector(`.member[data-uuid="${actor.uuid}"] .stats .info:first-child`);
    if ( !info ) continue;

    for ( const entry of info.querySelectorAll(".simple-nutrition-group") ) entry.remove();
    info.insertAdjacentHTML("beforeend", renderGroupTracker(actor));

    for ( const button of info.querySelectorAll(".simple-nutrition-group [data-nutrition]") ) {
      button.addEventListener("click", event => onToggleNutrition(actor, event));
    }
  }
}

/* -------------------------------------------- */

/**
 * Register compact nutrition controls with Tidy 5e character sheets.
 *
 * @param {object} api Tidy 5e Sheets API.
 * @returns {void}
 */
export function registerTidyNutritionContent(api) {
  const headerActionsSelector = '[data-tidy-sheet-part="sheet-header-actions-container"]';

  api.registerCharacterContent(new api.models.HtmlContent({
    html: context => {
      const editable = context.editable ?? context.actor?.isOwner ?? false;
      return renderTidyTracker(context.actor, editable, editable && !!context.unlocked);
    },
    injectParams: {
      selector: headerActionsSelector,
      position: "afterbegin"
    },
    enabled: context => context.actor?.type === "character",
    onRender: ({ app, element }) => {
      const actor = app.actor;
      const anchor = element.querySelector(headerActionsSelector);
      if ( !actor || !anchor ) return;

      for ( const button of anchor.querySelectorAll("[data-simple-nutrition][data-nutrition]") ) {
        button.addEventListener("click", event => onToggleNutrition(actor, event));
      }

      for ( const button of anchor.querySelectorAll("[data-simple-nutrition][data-action='configureNutrition']") ) {
        button.addEventListener("click", event => onConfigureNutrition(app, event));
      }
    }
  }), { layout: "all" });
}

/* -------------------------------------------- */

/**
 * Build the shared tracker context used by both the vanilla and Tidy 5e tracker markup.
 *
 * @param {Actor5e} actor The actor being rendered.
 * @returns {NutritionTrackerContext} The shared tracker context.
 */
function buildTrackerContext(actor) {
  const { config, ...state } = getNutritionFlag(actor);
  const needs = getNutritionNeeds(actor);
  const trackFood = config.trackFood !== false;
  const trackWater = config.trackWater !== false;
  const configTooltip = foundry.utils.escapeHTML(_loc("SIMPLE_NUTRITION.Config.Configure"));
  const foodTooltip = foundry.utils.escapeHTML(trackFood
    ? _loc("SIMPLE_NUTRITION.Tracker.FoodTooltip", {
      current: formatNutritionAmount("food", state.food * needs.food),
      required: formatNutritionAmount("food", needs.food)
    })
    : _loc("SIMPLE_NUTRITION.Tracker.FoodNotRequiredTooltip"));
  const waterTooltip = foundry.utils.escapeHTML(trackWater
    ? _loc("SIMPLE_NUTRITION.Tracker.WaterTooltip", {
      current: formatNutritionAmount("water", state.water * needs.water),
      required: formatNutritionAmount("water", needs.water)
    })
    : _loc("SIMPLE_NUTRITION.Tracker.WaterNotRequiredTooltip"));

  return { state, needs, trackFood, trackWater, configTooltip, foodTooltip, waterTooltip };
}

/* -------------------------------------------- */

/**
 * Render one nutrition tracker button.
 *
 * @param {NutritionType} type The nutrition type the button controls.
 * @param {boolean} editable Whether the tracker can be interacted with.
 * @param {boolean} track Whether this nutrition type is tracked.
 * @param {boolean} active Whether today's requirement for this type is met.
 * @param {string} tooltip The escaped tooltip text.
 * @param {string} label The localized nutrition type label.
 * @param {string} progress The localized progress text.
 * @returns {string} The rendered button markup.
 */
function renderNutritionButton(type, editable, track, active, tooltip, label, progress) {
  const icon = type === "food" ? "fa-drumstick-bite" : "fa-glass-water";
  return `
    <button
      type="button"
      class="unbutton simple-nutrition__button ${track ? (active ? "is-active" : "is-inactive") : "is-disabled"}"
      data-nutrition="${type}"
      data-tooltip="${tooltip}"
      aria-label="${tooltip}"
      ${(editable && track) ? "" : "disabled"}
    >
      <i class="fas ${icon}" inert></i>
      <span class="simple-nutrition__label">${label}</span>
      <span class="simple-nutrition__state" aria-hidden="true">${progress}</span>
    </button>
  `;
}

/* -------------------------------------------- */

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

  app.renderChild(new NutritionConfig({ document: app.actor }));
}

/* -------------------------------------------- */

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
  const { config, ...state } = getNutritionFlag(actor);
  if ( isFood ? (config.trackFood === false) : (config.trackWater === false) ) return;

  const condition = isFood ? CONDITION_MALNUTRITION : CONDITION_DEHYDRATION;
  const marker = isFood ? "foodConditionRemoved" : "waterConditionRemoved";

  if ( state[nutrition] > 0 ) {
    const needs = getNutritionNeeds(actor);
    const action = await foundry.applications.api.DialogV2.confirm({
      content: `
        <p><strong>${foundry.utils.escapeHTML(_loc("SIMPLE_NUTRITION.Dialog.ManageCurrent", {
          amount: formatNutritionAmount(nutrition, state[nutrition] * needs[nutrition])
        }))}</strong></p>
      <p class="hint">${foundry.utils.escapeHTML(_loc(
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
    });

    if ( action === null ) return;
    if ( action === false ) {
      const conditionRemoved = getNutritionState(actor)[marker];
      await setNutritionState(actor, {
        [nutrition]: 0,
        [marker]: false
      });
      if ( conditionRemoved ) await actor.toggleStatusEffect(condition, { active: true });
      return;
    }
  }

  await consumeNutrition(actor, nutrition);
}

/* -------------------------------------------- */

/**
 * Prompt for free food and water sources and record them for every character of the group.
 *
 * @param {Actor5e} group The group actor.
 * @returns {Promise<void>} A promise that resolves when the workflow completes.
 */
async function onConsumeGroupNutrition(group) {
  const { createCheckboxInput, createFormGroup } = foundry.applications.fields;
  const content = [
    createFormGroup({
      label: _loc("SIMPLE_NUTRITION.Dialog.FreeFood"),
      hint: _loc("SIMPLE_NUTRITION.Dialog.FreeFoodHint"),
      input: createCheckboxInput({ name: "food" })
    }),
    createFormGroup({
      label: _loc("SIMPLE_NUTRITION.Dialog.FreshWater"),
      hint: _loc("SIMPLE_NUTRITION.Dialog.FreshWaterHint"),
      input: createCheckboxInput({ name: "water" })
    })
  ].map(field => field.outerHTML).join("");

  const data = await foundry.applications.api.DialogV2.input({
    content,
    window: {
      icon: "fa-solid fa-bowl-food",
      title: "SIMPLE_NUTRITION.Group.Title"
    },
    position: { width: 520 }
  });
  if ( !data ) return;

  const actors = group.system.playerCharacters;
  if ( data.food ) await consumeGroupNutrition(actors, "food");
  if ( data.water ) await consumeGroupNutrition(actors, "water");
}

/* -------------------------------------------- */

/**
 * Render the group action button for the group sheet header.
 *
 * @returns {string} The rendered button markup.
 */
function renderGroupAction() {
  const label = foundry.utils.escapeHTML(_loc("SIMPLE_NUTRITION.Group.Title"));
  return `
    <button type="button" class="gold-button always-interactive simple-nutrition-group-action" data-tooltip
            aria-label="${label}">
      <i class="fa-solid fa-bowl-food" inert></i>
    </button>
  `;
}

/* -------------------------------------------- */

/**
 * Render one compact Tidy 5e nutrition button.
 *
 * @param {NutritionType} type The nutrition type the button controls.
 * @param {boolean} editable Whether the tracker can be interacted with.
 * @param {boolean} track Whether this nutrition type is tracked.
 * @param {boolean} ready Whether today's requirement for this type is met.
 * @param {string} tooltip The escaped tooltip text.
 * @returns {string} The rendered button markup.
 */
function renderTidyNutritionButton(type, editable, track, ready, tooltip) {
  const icon = type === "food" ? "fa-drumstick-bite" : "fa-glass-water";
  return `
    <button
      type="button"
      class="button button-icon-only button-gold flexshrink simple-nutrition__button ${track && ready ? "simple-nutrition__button--ready" : ""} ${track ? "" : "simple-nutrition__button--disabled"}"
      data-simple-nutrition
      data-nutrition="${type}"
      data-tooltip="${tooltip}"
      aria-label="${tooltip}"
      ${(editable && track) ? "" : "disabled"}
    >
      <i class="fas ${icon}" inert></i>
    </button>
  `;
}

/* -------------------------------------------- */

/**
 * Render compact nutrition controls for Tidy 5e header actions.
 *
 * @param {Actor5e} actor The actor being rendered.
 * @param {boolean} editable Whether the tracker can be interacted with.
 * @param {boolean} configurable Whether the configure button should be rendered.
 * @returns {string} The rendered tracker markup.
 */
function renderTidyTracker(actor, editable, configurable) {
  const { state, trackFood, trackWater, configTooltip, foodTooltip, waterTooltip } = buildTrackerContext(actor);

  return `
    ${renderTidyNutritionButton("food", editable, trackFood, state.food >= 1, foodTooltip)}
    ${renderTidyNutritionButton("water", editable, trackWater, state.water >= 1, waterTooltip)}

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

/* -------------------------------------------- */

/**
 * Render the nutrition tracker markup.
 *
 * @param {Actor5e} actor The actor being rendered.
 * @param {boolean} editable Whether the tracker can be interacted with.
 * @param {boolean} configurable Whether the configure button should be rendered.
 * @returns {string} The rendered tracker markup.
 */
function renderTracker(actor, editable, configurable) {
  const { state, needs, trackFood, trackWater, configTooltip, foodTooltip, waterTooltip } = buildTrackerContext(actor);
  const foodProgress = formatNutritionProgress("food", trackFood, state, needs);
  const waterProgress = formatNutritionProgress("water", trackWater, state, needs);

  return `
    <div class="meter-group simple-nutrition">
      <div class="label roboto-condensed-upper">
        <span>${_loc("SIMPLE_NUTRITION.Tracker.Title")}</span>
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
        ${renderNutritionButton("food", editable, trackFood, state.food >= 1, foodTooltip,
          _loc("SIMPLE_NUTRITION.Tracker.Food"), foodProgress)}
        ${renderNutritionButton("water", editable, trackWater, state.water >= 1, waterTooltip,
          _loc("SIMPLE_NUTRITION.Tracker.Water"), waterProgress)}
      </div>
    </div>
  `;
}

/* -------------------------------------------- */

/**
 * Format the compact progress text of one nutrition type.
 *
 * @param {NutritionType} type The nutrition type.
 * @param {boolean} track Whether this nutrition type is tracked.
 * @param {NutritionState} state The stored nutrition state.
 * @param {{ food: number, water: number }} needs The daily food and water requirements.
 * @returns {string} The localized progress text.
 */
function formatNutritionProgress(type, track, state, needs) {
  if ( !track ) return _loc("SIMPLE_NUTRITION.Tracker.NotRequired");
  return _loc("SIMPLE_NUTRITION.Tracker.Progress", {
    current: formatNutritionAmount(type, state[type] * needs[type], { withUnit: false }),
    required: formatNutritionAmount(type, needs[type], { withUnit: false })
  });
}

/* -------------------------------------------- */

/**
 * Render one nutrition entry of the group sheet tracker.
 *
 * @param {NutritionType} type The nutrition type the entry controls.
 * @param {boolean} track Whether this nutrition type is tracked.
 * @param {string} tooltip The escaped tooltip text.
 * @param {string} progress The localized progress text.
 * @returns {string} The rendered entry markup.
 */
function renderGroupNutritionEntry(type, track, tooltip, progress) {
  const icon = type === "food" ? "fa-drumstick-bite" : "fa-glass-water";
  const iconMarkup = `<i class="fa-solid ${icon}" inert></i>`;
  return `
    <div class="simple-nutrition-group${track ? "" : " is-disabled"}" data-tooltip="${tooltip}">
      ${track ? `<a data-nutrition="${type}" aria-label="${tooltip}">${iconMarkup}</a>` : iconMarkup}
      <span class="value">${track ? progress : "&mdash;"}</span>
    </div>
  `;
}

/* -------------------------------------------- */

/**
 * Render the nutrition entries appended to the first info block of a group sheet member.
 *
 * @param {Actor5e} actor The member being rendered.
 * @returns {string} The rendered entries markup.
 */
function renderGroupTracker(actor) {
  const { state, needs, trackFood, trackWater, foodTooltip, waterTooltip } = buildTrackerContext(actor);
  const foodProgress = formatNutritionProgress("food", trackFood, state, needs);
  const waterProgress = formatNutritionProgress("water", trackWater, state, needs);

  return `
    ${renderGroupNutritionEntry("food", trackFood, foodTooltip, foodProgress)}
    ${renderGroupNutritionEntry("water", trackWater, waterTooltip, waterProgress)}
  `;
}
