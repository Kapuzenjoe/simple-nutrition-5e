export const MODULE_ID = "simple-nutrition-5e";
export const NUTRITION_FLAG = "nutrition";

export const CONDITION_DEHYDRATION = "dehydration";
export const CONDITION_MALNUTRITION = "malnutrition";
export const CONDITION_EFFECT_DEHYDRATED = "dehydrated";
export const CONDITION_EFFECT_MALNOURISHED = "malnourished";
export const EXHAUSTION_PATH = "system.attributes.exhaustion";

export const FOOD_NEEDS = { tiny: 0.25, sm: 1, med: 1, lg: 4, huge: 16, grg: 64 };
export const WATER_NEEDS = { tiny: 0.25, sm: 1, med: 1, lg: 4, huge: 16, grg: 64 };
export const STARVATION_LIMIT = 5;

export const MAGICAL_BERRIES_IDENTIFIER = "magical-berries";
export const WATER_ITEM_AMOUNT = 0.125;
export const LITERS_PER_GALLON = 3.78541;
export const WATER_IDENTIFIERS = new Set(["water-pint", "water-fresh-pint"]);
export const WATERSKIN_IDENTIFIER = "waterskin";

export const EMPTY_NUTRITION_STATE = {
  food: 0,
  water: 0,
  starvation: 0,
  foodConditionRemoved: false,
  waterConditionRemoved: false
};

export const EMPTY_NUTRITION_CONFIG = {
  trackFood: true,
  trackWater: true,
  foodPerDay: null,
  waterPerDay: null,
  starvationLimit: null
};
