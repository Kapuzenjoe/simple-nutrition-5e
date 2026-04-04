import {
  LITERS_PER_GALLON,
  MODULE_ID,
  STARVATION_LIMIT
} from "./constants.mjs";
import {
  getDefaultNutritionNeeds,
  formatNutritionAmount,
  getNutritionConfig,
  setNutritionConfig
} from "./nutrition.mjs";

const BaseConfigSheet = globalThis.dnd5e?.applications?.actor?.BaseConfigSheetV2;

const { NumberField } = foundry.data.fields;
const { convertWeight, defaultUnits } = game.dnd5e.utils;

/**
 * Configuration application for nutrition overrides on a character actor.
 */
export default class NutritionConfig extends BaseConfigSheet {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["nutrition-config"],
    position: {
      width: 420
    }
  };

  /** @override */
  static PARTS = {
    config: {
      template: "modules/simple-nutrition-5e/templates/nutrition-config.hbs"
    }
  };

  /** @override */
  _initializeApplicationOptions(options) {
    options = super._initializeApplicationOptions(options);
    options.uniqueId = `${MODULE_ID}-${options.document.uuid}-config`.replace(/\./g, "-");
    return options;
  }

  /** @override */
  get title() {
    return game.i18n.localize("SIMPLE_NUTRITION.Config.Title");
  }

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);

    const defaults = this.#getDefaultValues();
    const config = getNutritionConfig(this.document);
    const weightUnit = defaultUnits("weight");
    const metricVolume = game.settings.get("dnd5e", "metricVolumeUnits");
    const foodUnitLabel = CONFIG.DND5E.weightUnits[weightUnit]?.abbreviation ?? weightUnit;
    const waterUnitLabel = metricVolume ? CONFIG.DND5E.volumeUnits.liter.abbreviation : "gal";
    context.data = {
      foodPerDay: (config.foodPerDay === null) ? null : convertWeight(config.foodPerDay, "lb", weightUnit),
      waterPerDay: (config.waterPerDay === null)
        ? null
        : (metricVolume ? (config.waterPerDay * LITERS_PER_GALLON) : config.waterPerDay),
      starvationLimit: config.starvationLimit
    };
    context.fields = {
      foodPerDay: new NumberField({
        nullable: true,
        min: 0,
        initial: null,
        label: `${game.i18n.localize("SIMPLE_NUTRITION.Config.FoodPerDay")} (${foodUnitLabel})`
      }),
      waterPerDay: new NumberField({
        nullable: true,
        min: 0,
        initial: null,
        label: `${game.i18n.localize("SIMPLE_NUTRITION.Config.WaterPerDay")} (${waterUnitLabel})`
      }),
      starvationLimit: new NumberField({
        nullable: true,
        integer: true,
        min: 0,
        initial: null,
        label: "SIMPLE_NUTRITION.Config.StarvationLimit"
      })
    };
    context.placeholders = {
      foodPerDay: convertWeight(defaults.food, "lb", weightUnit).toLocaleString(game.i18n.lang, {
        maximumFractionDigits: 3
      }),
      waterPerDay: (metricVolume ? (defaults.water * LITERS_PER_GALLON) : defaults.water).toLocaleString(
        game.i18n.lang,
        { maximumFractionDigits: 3 }
      ),
      starvationLimit: defaults.starvation.toLocaleString(game.i18n.lang)
    };
    context.hints = {
      foodPerDay: game.i18n.format("SIMPLE_NUTRITION.Config.DefaultValue", {
        value: formatNutritionAmount("food", defaults.food)
      }),
      waterPerDay: game.i18n.format("SIMPLE_NUTRITION.Config.DefaultValue", {
        value: formatNutritionAmount("water", defaults.water)
      }),
      starvationLimit: game.i18n.format("SIMPLE_NUTRITION.Config.DefaultDays", {
        days: context.placeholders.starvationLimit
      })
    };

    return context;
  }

  /** @override */
  _prepareSubmitData(event, form, formData, updateData) {
    const submitData = foundry.utils.expandObject(formData.object);
    if (updateData) foundry.utils.mergeObject(submitData, updateData, { inplace: true });
    return submitData;
  }

  /** @inheritDoc */
  async _processSubmitData(event, form, submitData) {
    const data = submitData ?? form;
    const config = data?.config ?? {};
    const weightUnit = defaultUnits("weight");
    const metricVolume = game.settings.get("dnd5e", "metricVolumeUnits");
    const foodPerDay = this.#normalizeNumber(config.foodPerDay);
    const waterPerDay = this.#normalizeNumber(config.waterPerDay);
    await setNutritionConfig(this.document, {
      foodPerDay: (foodPerDay === null) ? null : convertWeight(foodPerDay, weightUnit, "lb"),
      waterPerDay: (waterPerDay === null)
        ? null
        : (metricVolume ? (waterPerDay / LITERS_PER_GALLON) : waterPerDay),
      starvationLimit: this.#normalizeNumber(config.starvationLimit, { integer: true })
    });
  }

  /**
   * Get the size-based default values for this actor.
   *
   * @returns {{ food: number, water: number, starvation: number }} The size-based defaults.
   */
  #getDefaultValues() {
    const defaults = getDefaultNutritionNeeds(this.document);
    return {
      ...defaults,
      starvation: STARVATION_LIMIT
    };
  }

  /**
   * Normalize a numeric config value from form submission.
   *
   * @param {unknown} value The submitted value.
   * @param {{ integer?: boolean }} [options] Normalization options.
   * @returns {number|null} The normalized numeric value.
   */
  #normalizeNumber(value, { integer=false }={}) {
    if ((value === null) || (value === undefined) || (value === "")) return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.max(integer ? Math.trunc(number) : number, 0);
  }
}
