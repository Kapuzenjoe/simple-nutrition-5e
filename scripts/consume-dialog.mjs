import Dialog5e from "/systems/dnd5e/module/applications/api/dialog.mjs";
import { MODULE_ID } from "./constants.mjs";

/**
 * @typedef {object} NutritionCandidate
 * @property {string} id
 * @property {string} name
 * @property {string} img
 * @property {number} quantity
 * @property {string|null} container
 */

/**
 * @typedef {object} NutritionConsumptionEntry
 * @property {string} itemId
 * @property {number} quantity
 */

/**
 * @typedef {object} NutritionConsumption
 * @property {"food"|"water"} type
 * @property {NutritionConsumptionEntry[]} entries
 */

/**
 * Dialog for choosing food or water items to consume.
 */
export default class NutritionConsumeDialog extends Dialog5e {
  constructor(options = {}) {
    super(options);
    this.#actor = options.document;
    this.#items = options.items;
    this.#type = options.type;
    this.options.window.title = this.#type === "food" ? "Consume Food" : "Drink Water";
    this.options.window.icon = this.#type === "food" ? "fa-solid fa-drumstick-bite" : "fa-solid fa-glass-water";
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["simple-nutrition-consume"],
    buttons: [{
      action: "consume",
      label: "Consume",
      icon: "fa-solid fa-check",
      default: true
    }],
    document: null,
    form: {
      handler: NutritionConsumeDialog.#handleFormSubmission
    },
    items: [],
    position: {
      width: 480
    },
    type: null
  };

  /* -------------------------------------------- */

  /**
   * Actor consuming the selected items.
   * @type {Actor5e}
   */
  #actor;

  get actor() {
    return this.#actor;
  }

  /* -------------------------------------------- */

  /**
   * Candidate items to display in the dialog.
   * @type {NutritionCandidate[]}
   */
  #items;

  get items() {
    return this.#items;
  }

  /* -------------------------------------------- */

  /**
   * Type of nutrition being consumed.
   * @type {"food"|"water"}
   */
  #type;

  get type() {
    return this.#type;
  }

  /* -------------------------------------------- */

  /**
   * Dialog result.
   * @type {NutritionConsumption|null}
   */
  #result = null;

  get result() {
    return this.#result;
  }

  /* -------------------------------------------- */

  /**
   * Prepare rendering context for the content section.
   * @param {ApplicationRenderContext} context
   * @param {HandlebarsRenderOptions} options
   * @returns {Promise<ApplicationRenderContext>}
   * @protected
   */
  async _prepareContentContext(context, options) {
    context.content = this.#renderContent();
    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    for (const button of this.element.querySelectorAll("[data-action=stepQuantity]")) {
      button.addEventListener("click", event => this.#onStepQuantity(event));
    }
  }

  /* -------------------------------------------- */

  /**
   * Render the dialog body.
   * @returns {string}
   */
  #renderContent() {
    const itemRows = this.items.map(item => {
      const name = foundry.utils.escapeHTML(item.name);
      const container = item.container ? ` <span class="hint">(${foundry.utils.escapeHTML(item.container)})</span>` : "";
      const img = item.img ? `<img src="${item.img}" alt="" width="24" height="24">` : "";
      return `
        <div class="form-group">
          <label for="${MODULE_ID}-${item.id}">
            ${img}
            <span>${name}</span>${container}
          </label>
          <div class="form-fields">
            <span class="hint">Owned: ${item.quantity}</span>
            <button type="button" class="unbutton" data-action="stepQuantity" data-item-id="${item.id}" data-step="-1" aria-label="Decrease ${name}">
              <i class="fa-solid fa-minus" inert></i>
            </button>
            <input
              id="${MODULE_ID}-${item.id}"
              type="number"
              name="items.${item.id}"
              min="0"
              max="${item.quantity}"
              step="1"
              value="0"
              readonly
            >
            <button type="button" class="unbutton" data-action="stepQuantity" data-item-id="${item.id}" data-step="1" aria-label="Increase ${name}">
              <i class="fa-solid fa-plus" inert></i>
            </button>
          </div>
        </div>
      `;
    }).join("");

    return `
      <fieldset>
        <legend>${this.type === "food" ? "Food" : "Water"}</legend>
        <p class="hint">Required today: —</p>
        ${itemRows}
      </fieldset>
    `;
  }

  /* -------------------------------------------- */

  /**
   * Adjust one quantity input by a fixed step.
   * @param {PointerEvent} event
   */
  #onStepQuantity(event) {
    const button = event.currentTarget;
    const input = this.element.querySelector(`#${MODULE_ID}-${button.dataset.itemId}`);
    const step = Number(button.dataset.step);
    const min = Number(input.min || 0);
    const max = Number(input.max || 0);
    const value = Number(input.value || 0);

    input.value = Math.clamp(value + step, min, max);
  }


  /* -------------------------------------------- */

  /**
   * Handle submission of the dialog using the form buttons.
   * @this {NutritionConsumeDialog}
   * @param {Event|SubmitEvent} event
   * @param {HTMLFormElement} form
   * @param {FormDataExtended} formData
   */
  static async #handleFormSubmission(event, form, formData) {
    const entries = Object.entries(formData.object).reduce((result, [key, quantity]) => {
      if (!key.startsWith("items.")) return result;

      quantity = Number(quantity);
      if (quantity <= 0) return result;

      result.push({
        itemId: key.slice(6),
        quantity
      });

      return result;
    }, []);

    if (!entries.length) {
      ui.notifications.warn(this.type === "food" ? "Select food to consume." : "Select water to consume.");
      return;
    }

    for (const entry of entries) {
      const item = this.actor.items.get(entry.itemId);
      if (entry.quantity > item.system.quantity) {
        ui.notifications.warn(`Not enough ${item.name}.`);
        return;
      }
    }

    this.#result = { type: this.type, entries };
    await this.close({ [MODULE_ID]: { submitted: true } });
  }

  /* -------------------------------------------- */

  /** @override */
  _onClose(options = {}) {
    if (!options[MODULE_ID]?.submitted) this.#result = null;
  }

  /* -------------------------------------------- */

  /**
   * Display the nutrition consumption dialog.
   * @param {Actor5e} actor
   * @param {{ type: "food"|"water", items: NutritionCandidate[] }} options
   * @returns {Promise<NutritionConsumption|null>}
   */
  static async consume(actor, options = {}) {
    return new Promise(resolve => {
      const dialog = new this({ document: actor, ...options });
      dialog.addEventListener("close", () => resolve(dialog.result), { once: true });
      dialog.render({ force: true });
    });
  }
}