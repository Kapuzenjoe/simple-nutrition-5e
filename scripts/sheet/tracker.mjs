import NutritionConfig from "../applications/nutrition-config.mjs";
import {
  CONDITION_DEHYDRATION,
  CONDITION_MALNUTRITION
} from "../config.mjs";
import {
  formatNutritionAmount,
  getNutritionFlag,
  getNutritionNeeds,
  setNutritionState
} from "../nutrition/actor.mjs";
import { consumeNutrition } from "../nutrition/consumption.mjs";

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

  const anchor = html.querySelector(".stats .meter-group:last-of-type");
  if ( !anchor ) return;

  const configurable = app.isEditable && !!(app.isEditMode ?? app.isEditable);
  anchor.insertAdjacentHTML("afterend", trackerHTML(actor, app.isEditable, configurable));

  for ( const button of html.querySelectorAll(".simple-nutrition [data-nutrition]") ) {
    button.addEventListener("click", event => onToggleNutrition(actor, event));
  }

  for ( const button of html.querySelectorAll(".simple-nutrition [data-action='configureNutrition']") ) {
    button.addEventListener("click", event => onConfigureNutrition(app, event));
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
 * @returns {{ state: NutritionState, needs: object, trackFood: boolean, trackWater: boolean, configTooltip: string, foodTooltip: string, waterTooltip: string }}
 */
function buildTrackerContext(actor) {
  const { config, ...state } = getNutritionFlag(actor);
  const needs = getNutritionNeeds(actor);
  const trackFood = config.trackFood !== false;
  const trackWater = config.trackWater !== false;
  const configTooltip = foundry.utils.escapeHTML(game.i18n.localize("SIMPLE_NUTRITION.Config.Configure"));
  const foodTooltip = foundry.utils.escapeHTML(trackFood
    ? game.i18n.format("SIMPLE_NUTRITION.Tracker.FoodTooltip", {
      current: formatNutritionAmount("food", state.food * needs.food),
      required: formatNutritionAmount("food", needs.food)
    })
    : game.i18n.localize("SIMPLE_NUTRITION.Tracker.FoodNotRequiredTooltip"));
  const waterTooltip = foundry.utils.escapeHTML(trackWater
    ? game.i18n.format("SIMPLE_NUTRITION.Tracker.WaterTooltip", {
      current: formatNutritionAmount("water", state.water * needs.water),
      required: formatNutritionAmount("water", needs.water)
    })
    : game.i18n.localize("SIMPLE_NUTRITION.Tracker.WaterNotRequiredTooltip"));

  return { state, needs, trackFood, trackWater, configTooltip, foodTooltip, waterTooltip };
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

  const config = new NutritionConfig({ document: app.actor });
  if ( typeof app._renderChild === "function" ) return void app._renderChild(config);
  void config.render(true);
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
        <p><strong>${foundry.utils.escapeHTML(game.i18n.format("SIMPLE_NUTRITION.Dialog.ManageCurrent", {
          amount: formatNutritionAmount(nutrition, state[nutrition] * needs[nutrition])
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

    if ( action === null ) return;
    if ( action === false ) {
      await setNutritionState(actor, {
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

/* -------------------------------------------- */

/**
 * Render compact nutrition controls for Tidy 5e header actions.
 *
 * @param {Actor5e} actor The actor being rendered.
 * @param {boolean} editable Whether the tracker can be interacted with.
 * @param configurable
 * @returns {string} The rendered tracker markup.
 */
function tidyTrackerHTML(actor, editable, configurable) {
  const { state, trackFood, trackWater, configTooltip, foodTooltip, waterTooltip } = buildTrackerContext(actor);

  return `
    <button
      type="button"
      class="button button-icon-only button-gold flexshrink simple-nutrition__button ${trackFood && (state.food >= 1) ? "simple-nutrition__button--ready" : ""} ${trackFood ? "" : "simple-nutrition__button--disabled"}"
      data-simple-nutrition
      data-nutrition="food"
      data-tooltip="${foodTooltip}"
      aria-label="${foodTooltip}"
      ${(editable && trackFood) ? "" : "disabled"}
    >
      <i class="fas fa-drumstick-bite" inert></i>
    </button>

    <button
      type="button"
      class="button button-icon-only button-gold flexshrink simple-nutrition__button ${trackWater && (state.water >= 1) ? "simple-nutrition__button--ready" : ""} ${trackWater ? "" : "simple-nutrition__button--disabled"}"
      data-simple-nutrition
      data-nutrition="water"
      data-tooltip="${waterTooltip}"
      aria-label="${waterTooltip}"
      ${(editable && trackWater) ? "" : "disabled"}
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

/* -------------------------------------------- */

/**
 * Render the nutrition tracker markup.
 *
 * @param {Actor5e} actor The actor being rendered.
 * @param {boolean} editable Whether the tracker can be interacted with.
 * @param configurable
 * @returns {string} The rendered tracker markup.
 */
function trackerHTML(actor, editable, configurable) {
  const { state, needs, trackFood, trackWater, configTooltip, foodTooltip, waterTooltip } = buildTrackerContext(actor);
  const foodProgress = trackFood
    ? game.i18n.format("SIMPLE_NUTRITION.Tracker.Progress", {
      current: formatNutritionAmount("food", state.food * needs.food, { withUnit: false }),
      required: formatNutritionAmount("food", needs.food, { withUnit: false })
    })
    : game.i18n.localize("SIMPLE_NUTRITION.Tracker.NotRequired");
  const waterProgress = trackWater
    ? game.i18n.format("SIMPLE_NUTRITION.Tracker.Progress", {
      current: formatNutritionAmount("water", state.water * needs.water, { withUnit: false }),
      required: formatNutritionAmount("water", needs.water, { withUnit: false })
    })
    : game.i18n.localize("SIMPLE_NUTRITION.Tracker.NotRequired");

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
          class="unbutton simple-nutrition__button ${trackFood ? ((state.food >= 1) ? "is-active" : "is-inactive") : "is-disabled"}"
          data-nutrition="food"
          data-tooltip="${foodTooltip}"
          aria-label="${foodTooltip}"
          ${(editable && trackFood) ? "" : "disabled"}
        >
          <i class="fas fa-drumstick-bite" inert></i>
          <span class="simple-nutrition__label">${game.i18n.localize("SIMPLE_NUTRITION.Tracker.Food")}</span>
          <span class="simple-nutrition__state" aria-hidden="true">${foodProgress}</span>
        </button>

        <button
          type="button"
          class="unbutton simple-nutrition__button ${trackWater ? ((state.water >= 1) ? "is-active" : "is-inactive") : "is-disabled"}"
          data-nutrition="water"
          data-tooltip="${waterTooltip}"
          aria-label="${waterTooltip}"
          ${(editable && trackWater) ? "" : "disabled"}
        >
          <i class="fas fa-glass-water" inert></i>
          <span class="simple-nutrition__label">${game.i18n.localize("SIMPLE_NUTRITION.Tracker.Water")}</span>
          <span class="simple-nutrition__state" aria-hidden="true">${waterProgress}</span>
        </button>
      </div>
    </div>
  `;
}
