import {
  FOOD_NEEDS,
  LITERS_PER_GALLON,
  MODULE_ID,
  SAVE_DC_LEGACY,
  SAVE_DC_MODERN,
  STARVATION_FORMULA_LEGACY,
  STARVATION_LIMIT,
  WATER_NEEDS
} from "../config.mjs";
import {
  formatNutritionAmount,
  getNutritionConfig,
  setNutritionConfig
} from "../nutrition/actor.mjs";

const BaseConfigSheet = game.dnd5e.applications.actor.BaseConfigSheetV2;

const { BooleanField, NumberField } = foundry.data.fields;
const { FormulaField } = game.dnd5e.dataModels.fields;
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
  get title() {
    return game.i18n.localize("SIMPLE_NUTRITION.Config.Title");
  }

  /* -------------------------------------------- */

  /** @override */
  _initializeApplicationOptions(options) {
    options = super._initializeApplicationOptions(options);
    options.uniqueId = `${MODULE_ID}-${options.document.uuid}-config`.replace(/\./g, "-");
    return options;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);

    const size = this.document.system.traits.size;
    const config = getNutritionConfig(this.document);
    const weightUnit = defaultUnits("weight");
    const metricVolume = game.settings.get("dnd5e", "metricVolumeUnits");
    const legacy = game.dnd5e.settings.rulesVersion === "legacy";
    const defaults = {
      food: FOOD_NEEDS[size] ?? FOOD_NEEDS.med,
      water: WATER_NEEDS[size] ?? WATER_NEEDS.med,
      starvation: game.dnd5e.utils.simplifyBonus(
        legacy ? STARVATION_FORMULA_LEGACY : String(STARVATION_LIMIT),
        this.document.getRollData()
      )
    };
    const foodUnitLabel = CONFIG.DND5E.weightUnits[weightUnit]?.abbreviation ?? weightUnit;
    const waterUnitLabel = metricVolume ? CONFIG.DND5E.volumeUnits.liter.abbreviation : "gal";
    context.data = {
      trackFood: config.trackFood !== false,
      trackWater: config.trackWater !== false,
      foodPerDay: (config.foodPerDay === null) ? null : convertWeight(config.foodPerDay, "lb", weightUnit),
      waterPerDay: (config.waterPerDay === null)
        ? null
        : (metricVolume ? (config.waterPerDay * LITERS_PER_GALLON) : config.waterPerDay),
      starvationLimit: config.starvationLimit,
      malnutritionDC: config.malnutritionDC
    };
    context.fields = {
      trackFood: new BooleanField({
        label: "SIMPLE_NUTRITION.Config.TrackFood"
      }),
      trackWater: new BooleanField({
        label: "SIMPLE_NUTRITION.Config.TrackWater"
      }),
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
      starvationLimit: new FormulaField({
        deterministic: true,
        nullable: true,
        initial: null,
        label: "SIMPLE_NUTRITION.Config.StarvationLimit"
      }),
      malnutritionDC: new FormulaField({
        deterministic: true,
        nullable: true,
        initial: null,
        label: "SIMPLE_NUTRITION.Config.SaveDC"
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
      malnutritionDC: (legacy ? SAVE_DC_LEGACY : SAVE_DC_MODERN).toLocaleString(game.i18n.lang),
      starvationLimit: defaults.starvation.toLocaleString(game.i18n.lang)
    };
    context.hints = {
      trackFood: game.i18n.localize("SIMPLE_NUTRITION.Config.TrackFoodHint"),
      trackWater: game.i18n.localize("SIMPLE_NUTRITION.Config.TrackWaterHint"),
      foodPerDay: game.i18n.format("SIMPLE_NUTRITION.Config.DefaultValue", {
        value: formatNutritionAmount("food", defaults.food)
      }),
      waterPerDay: game.i18n.format("SIMPLE_NUTRITION.Config.DefaultValue", {
        value: formatNutritionAmount("water", defaults.water)
      }),
      malnutritionDC: game.i18n.localize(legacy
        ? "SIMPLE_NUTRITION.Config.SaveDCHintWater"
        : "SIMPLE_NUTRITION.Config.SaveDCHintFood"),
      starvationLimit: game.i18n.format("SIMPLE_NUTRITION.Config.DefaultDays", {
        days: context.placeholders.starvationLimit
      })
    };

    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  _prepareSubmitData(event, form, formData) {
    return foundry.utils.expandObject(formData.object);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _processSubmitData(event, form, submitData) {
    const config = submitData.config ?? {};
    const weightUnit = defaultUnits("weight");
    const metricVolume = game.settings.get("dnd5e", "metricVolumeUnits");
    const foodPerDay = this.#normalizeNumber(config.foodPerDay);
    const waterPerDay = this.#normalizeNumber(config.waterPerDay);
    await setNutritionConfig(this.document, {
      trackFood: config.trackFood !== false,
      trackWater: config.trackWater !== false,
      foodPerDay: (foodPerDay === null) ? null : convertWeight(foodPerDay, weightUnit, "lb"),
      waterPerDay: (waterPerDay === null)
        ? null
        : (metricVolume ? (waterPerDay / LITERS_PER_GALLON) : waterPerDay),
      starvationLimit: config.starvationLimit?.trim() || null,
      malnutritionDC: config.malnutritionDC?.trim() || null
    });
  }

  /* -------------------------------------------- */

  /**
   * Normalize a numeric config value from form submission.
   *
   * @param {unknown} value The submitted value.
   * @param {{ integer?: boolean, min?: number }} [options] Normalization options.
   * @returns {number|null} The normalized numeric value.
   */
  #normalizeNumber(value, { integer=false, min=0 }={}) {
    if ( (value === null) || (value === undefined) || (value === "") ) return null;
    const number = Number(value);
    if ( !Number.isFinite(number) ) return null;
    return Math.max(integer ? Math.trunc(number) : number, min);
  }
}
