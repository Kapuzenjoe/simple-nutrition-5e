/**
 * @import { NutritionCandidate, NutritionConsumption, NutritionType } from "../_types.mjs";
 */

import { MODULE_ID } from "../config.mjs";
import { formatNutritionAmount, getNutritionCandidate } from "../nutrition/actor.mjs";

const Dialog5e = game.dnd5e.applications.api.Dialog5e;
const { BooleanField } = foundry.data.fields;

/**
 * Dialog for choosing food or water items to consume.
 */
export default class NutritionConsumeDialog extends Dialog5e {
  constructor(options={}) {
    super(options);
    this.#actor = options.document;
    this.#daysWithoutFood = options.daysWithoutFood ?? 0;
    this.#items = options.items;
    this.#required = options.required ?? "";
    this.#requiredValue = options.requiredValue ?? 0;
    this.#type = options.type;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    actions: {
      stepQuantity: NutritionConsumeDialog.#onStepQuantity
    },
    classes: ["simple-nutrition-consume"],
    buttons: [{
      action: "consume",
      label: "SIMPLE_NUTRITION.Dialog.Consume",
      icon: "fa-solid fa-check",
      default: true,
      type: "submit"
    }, {
      action: "close",
      icon: "fa-solid fa-times",
      label: game.i18n.localize("Cancel"),
      type: "button"
    }],
    daysWithoutFood: 0,
    document: null,
    form: {
      handler: NutritionConsumeDialog.#handleFormSubmission
    },
    items: [],
    position: {
      width: 480
    },
    required: "",
    requiredValue: 0,
    type: null
  };

  /** @inheritDoc */
  static PARTS = {
    ...super.PARTS,
    content: {
      template: "modules/simple-nutrition-5e/templates/consume-dialog.hbs"
    }
  };

  /* -------------------------------------------- */

  /**
   * Handle submission of the dialog using the form buttons.
   *
   * @this {NutritionConsumeDialog}
   * @param {Event|SubmitEvent} event The form submission event.
   * @param {HTMLFormElement} form The submitted form.
   * @param {FormDataExtended} formData Data from the dialog.
   * @returns {Promise<void>} A promise that resolves when the dialog closes.
   */
  static async #handleFormSubmission(event, form, formData) {
    const freshWater = (this.type === "water") && Boolean(formData.object.freshWater);
    const freeFood = (this.type === "food") && Boolean(formData.object.freeFood);
    const entries = Object.entries(formData.object).reduce((result, [key, quantity]) => {
      if ( !key.startsWith("items.") ) return result;

      quantity = Number(quantity);
      if ( quantity <= 0 ) return result;

      result.push({
        itemId: key.slice(6),
        quantity
      });

      return result;
    }, []);

    if ( !entries.length && !freshWater && !freeFood ) {
      ui.notifications.warn(game.i18n.localize(this.type === "food"
        ? "SIMPLE_NUTRITION.Dialog.WarningSelectFood"
        : "SIMPLE_NUTRITION.Dialog.WarningSelectWater"));
      return;
    }

    for ( const entry of entries ) {
      const item = this.actor.items.get(entry.itemId);
      if ( !item ) {
        ui.notifications.warn(game.i18n.localize("SIMPLE_NUTRITION.Dialog.WarningItemMissing"));
        return;
      }
      if ( entry.quantity > item.system.quantity ) {
        ui.notifications.warn(game.i18n.format("SIMPLE_NUTRITION.Dialog.WarningNotEnough", {
          item: item.name
        }));
        return;
      }
    }

    this.#result = { type: this.type, entries, freshWater, freeFood };
    await this.close({ [MODULE_ID]: { submitted: true } });
  }

  /* -------------------------------------------- */

  /**
   * Adjust one quantity input by a fixed step.
   *
   * @this {NutritionConsumeDialog}
   * @param {PointerEvent} event The originating click event.
   * @param {HTMLElement} target The clicked step button.
   * @returns {void}
   */
  static #onStepQuantity(event, target) {
    const input = this.element.querySelector(`#${MODULE_ID}-${target.dataset.itemId}`);
    const step = Number(target.dataset.step);
    const min = Number(input.min || 0);
    const max = Number(input.max || 0);
    const value = Number(input.value || 0);

    const quantity = Math.clamp(value + step, min, max);
    input.value = quantity;
    this.#formState.quantities[target.dataset.itemId] = quantity;
    this.#updateSelectedAmount();
  }

  /* -------------------------------------------- */

  /**
   * Display the nutrition consumption dialog.
   *
   * @param {Actor5e} actor The actor consuming nutrition.
   * @param {{ type: NutritionType, items: NutritionCandidate[], required: string, requiredValue?: number, daysWithoutFood?: number }} options The dialog configuration.
   * @returns {Promise<NutritionConsumption|null>} The submitted result, or null if the dialog is dismissed.
   */
  static async consume(actor, options={}) {
    return new Promise(resolve => {
      const dialog = new this({
        document: actor,
        ...options,
        window: {
          title: options.type === "food" ? "SIMPLE_NUTRITION.Dialog.TitleFood" : "SIMPLE_NUTRITION.Dialog.TitleWater",
          icon: options.type === "food" ? "fa-solid fa-drumstick-bite" : "fa-solid fa-glass-water"
        }
      });
      dialog.addEventListener("close", () => resolve(dialog.result), { once: true });
      dialog.render({ force: true });
    });
  }

  /**
   * Actor consuming the selected items.
   * @type {Actor5e}
   */
  #actor;

  /**
   * Consecutive days without food.
   * @type {number}
   */
  #daysWithoutFood;

  /**
   * Local form state preserved across re-renders.
   * @type {{ freshWater: boolean, quantities: Record<string, number> }}
   */
  #formState = {
    freshWater: false,
    freeFood: false,
    quantities: {}
  };

  /**
   * Candidate items to display in the dialog.
   * @type {NutritionCandidate[]}
   */
  #items;

  /**
   * Localized required amount for the day.
   * @type {string}
   */
  #required;

  /**
   * Numeric required amount for the day.
   * @type {number}
   */
  #requiredValue;

  /**
   * Dialog result.
   * @type {NutritionConsumption|null}
   */
  #result = null;

  /**
   * Type of nutrition being consumed.
   * @type {NutritionType}
   */
  #type;

  /* -------------------------------------------- */

  get actor() {
    return this.#actor;
  }

  /* -------------------------------------------- */

  get daysWithoutFood() {
    return this.#daysWithoutFood;
  }

  /* -------------------------------------------- */

  get items() {
    return this.#items;
  }

  /* -------------------------------------------- */

  get required() {
    return this.#required;
  }

  /* -------------------------------------------- */

  get requiredValue() {
    return this.#requiredValue;
  }

  /* -------------------------------------------- */

  get result() {
    return this.#result;
  }

  /* -------------------------------------------- */

  get type() {
    return this.#type;
  }

  /* -------------------------------------------- */

  /**
   * Clear the result when the dialog is dismissed without submission.
   *
   * @param {ApplicationClosingOptions} [options={}] Options which configure the close workflow.
   * @returns {void}
   * @protected
   */
  _onClose(options={}) {
    if ( !options[MODULE_ID]?.submitted ) this.#result = null;
  }

  /* -------------------------------------------- */

  /**
   * Activate step controls after the dialog is rendered.
   *
   * @param {ApplicationRenderContext} context Context being rendered.
   * @param {HandlebarsRenderOptions} options Options which configure application rendering behavior.
   * @returns {Promise<void>} A promise that resolves when render handlers are attached.
   * @protected
   */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#restoreFormState();
    this.#updateSelectedAmount();

    this.element.querySelector("[name=freshWater]")?.addEventListener("change", event => {
      this.#formState.freshWater = event.currentTarget.checked;
      this.#toggleItemSelection();
      this.#updateSelectedAmount();
    });

    this.element.querySelector("[name=freeFood]")?.addEventListener("change", event => {
      this.#formState.freeFood = event.currentTarget.checked;
      this.#toggleItemSelection();
      this.#updateSelectedAmount();
    });

    this.#toggleItemSelection();

    const dropArea = this.element.querySelector("[data-drop-area]");
    dropArea?.addEventListener("dragover", event => {
      event.preventDefault();
    });
    dropArea?.addEventListener("dragenter", () => dropArea.classList.add("is-dragover"));
    dropArea?.addEventListener("dragleave", event => {
      if ( event.currentTarget.contains(event.relatedTarget) ) return;
      dropArea.classList.remove("is-dragover");
    });
    dropArea?.addEventListener("drop", event => this.#onDropItem(event));
  }

  /* -------------------------------------------- */

  /**
   * Prepare rendering context for the content section.
   *
   * @param {ApplicationRenderContext} context Context being prepared.
   * @param {HandlebarsRenderOptions} options Options which configure application rendering behavior.
   * @returns {Promise<ApplicationRenderContext>} The prepared content context.
   * @protected
   */
  async _prepareContentContext(context, options) {
    context = await super._prepareContentContext(context, options);
    const legend = game.i18n.localize(this.type === "food"
      ? "SIMPLE_NUTRITION.Dialog.LegendFood"
      : "SIMPLE_NUTRITION.Dialog.LegendWater");
    const nutritionItems = this.items.map(item => ({
      ...item,
      owned: game.i18n.format("SIMPLE_NUTRITION.Dialog.Owned", { quantity: item.quantity }),
      amountLabel: item.amount ? game.i18n.format("SIMPLE_NUTRITION.Dialog.Each", { amount: item.amount }) : null,
      decreaseLabel: game.i18n.format("SIMPLE_NUTRITION.Dialog.Decrease", { item: item.name }),
      increaseLabel: game.i18n.format("SIMPLE_NUTRITION.Dialog.Increase", { item: item.name })
    }));

    context.daysWithoutFood = this.daysWithoutFood;
    context.hasNutritionItems = nutritionItems.length > 0;
    context.fields = {
      freshWater: new BooleanField({ label: "SIMPLE_NUTRITION.Dialog.FreshWater" }),
      freeFood: new BooleanField({ label: "SIMPLE_NUTRITION.Dialog.FreeFood" })
    };
    context.hints = {
      freshWater: game.i18n.localize("SIMPLE_NUTRITION.Dialog.FreshWaterHint"),
      freeFood: game.i18n.localize("SIMPLE_NUTRITION.Dialog.FreeFoodHint")
    };
    context.legend = legend;
    context.moduleId = MODULE_ID;
    context.nutritionItems = nutritionItems;
    context.required = this.required;
    context.selected = formatNutritionAmount(this.type, 0);
    context.showDaysWithoutFood = (this.type === "food") && (this.daysWithoutFood > 0);
    context.showFreshWater = this.type === "water";
    context.showFreeFood = this.type === "food";

    return context;
  }

  /* -------------------------------------------- */

  /**
   * Get the currently selected nutrition amount.
   *
   * @returns {number} The selected nutrition amount.
   */
  #getSelectedAmount() {
    if ( this.type === "water" && this.#formState.freshWater ) return this.requiredValue;
    if ( this.type === "food" && this.#formState.freeFood ) return this.requiredValue;

    return this.items.reduce((total, item) => {
      return total + ((this.#formState.quantities[item.id] ?? 0) * item.value);
    }, 0);
  }

  /* -------------------------------------------- */

  /**
   * Handle dropping an additional consumable item onto the dialog.
   *
   * @param {DragEvent} event The concluding drag-drop event.
   * @returns {Promise<void>} A promise that resolves when the drop flow completes.
   */
  async #onDropItem(event) {
    event.preventDefault();
    event.currentTarget.classList.remove("is-dragover");
    if ( (this.type === "water") && this.#formState.freshWater ) return;

    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if ( data?.type !== "Item" ) return;

    const item = await Item.implementation.fromDropData(data);
    if ( !item || (item.parent?.uuid !== this.actor.uuid) || (item.type !== "consumable") ) {
      ui.notifications.warn(game.i18n.localize("SIMPLE_NUTRITION.Dialog.WarningDropInvalid"));
      return;
    }

    if ( !Number(item.system.quantity) ) {
      ui.notifications.warn(game.i18n.localize("SIMPLE_NUTRITION.Dialog.WarningDropEmpty"));
      return;
    }

    if ( this.items.some(entry => entry.id === item.id) ) {
      ui.notifications.warn(game.i18n.localize("SIMPLE_NUTRITION.Dialog.WarningDropDuplicate"));
      return;
    }

    this.#items = [...this.items, getNutritionCandidate(this.actor, this.type, item)];

    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Restore persisted form values after a re-render.
   *
   * @returns {void}
   */
  #restoreFormState() {
    const freshWater = this.element.querySelector("[name=freshWater]");
    if ( freshWater ) freshWater.checked = this.#formState.freshWater;
    const freeFood = this.element.querySelector("[name=freeFood]");
    if ( freeFood ) freeFood.checked = this.#formState.freeFood;

    for ( const input of this.element.querySelectorAll("[name^='items.']") ) {
      const itemId = input.name.slice(6);
      input.value = this.#formState.quantities[itemId] ?? 0;
    }
  }

  /* -------------------------------------------- */

  /**
   * Toggle item controls when fresh water is selected.
   *
   * @returns {void}
   */
  #toggleItemSelection() {
    const disabled = ((this.type === "water") && this.#formState.freshWater)
      || ((this.type === "food") && this.#formState.freeFood);
    this.element.querySelector("[data-item-list]")?.toggleAttribute("disabled", disabled);
    this.element.querySelector("[data-drop-container]")?.classList.toggle("is-disabled", disabled);
  }

  /* -------------------------------------------- */

  /**
   * Update the selected amount display.
   *
   * @returns {void}
   */
  #updateSelectedAmount() {
    const value = this.element?.querySelector("[data-selected-amount]");
    if ( value ) value.textContent = formatNutritionAmount(this.type, this.#getSelectedAmount());
  }
}
