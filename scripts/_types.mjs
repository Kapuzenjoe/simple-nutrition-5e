/**
 * @typedef {"food"|"water"} NutritionType
 */

/**
 * @typedef {object} NutritionState
 * @property {number} food The fraction of today's food requirement consumed (0 = none, 1 = requirement met).
 * @property {number} water The fraction of today's water requirement consumed (0 = none, 1 = requirement met).
 * @property {number} starvation The consecutive number of days without food.
 * @property {boolean} foodConditionRemoved Whether malnutrition was removed after meeting today's food requirement.
 * @property {boolean} waterConditionRemoved Whether dehydration was removed after meeting today's water requirement.
 */

/**
 * @typedef {object} NutritionConfig
 * @property {boolean} trackFood Whether food tracking is enabled.
 * @property {boolean} trackWater Whether water tracking is enabled.
 * @property {number|null} foodPerDay The actor-specific daily food requirement in pounds.
 * @property {number|null} waterPerDay The actor-specific daily water requirement in gallons.
 * @property {string|null} starvationLimit The actor-specific formula for the starvation threshold in days (flat day count under modern rules, CON-mod formula under legacy rules).
 * @property {string|null} malnutritionDC The actor-specific formula for the Constitution saving throw DC (food under modern rules, water under legacy rules).
 */

/**
 * @typedef {object} NutritionRestState
 * @property {number} starvation The accumulated days-without-food counter (accrual rule differs by ruleset).
 * @property {boolean} dehydrated Whether the dehydration condition should be active (modern rules only).
 * @property {boolean} malnourished Whether the malnutrition condition should be active (modern rules only).
 * @property {boolean} saveRequired Whether the actor must roll a nutrition saving throw manually.
 * @property {NutritionType|null} saveType Which nutrition type the save is for, when `saveRequired` is true.
 * @property {number} penalty The automatic exhaustion levels to apply for this day.
 * @property {boolean} foodFull Whether today's food requirement was fully met.
 * @property {boolean} waterFull Whether today's water requirement was fully met.
 */

/**
 * @typedef {object} NutritionCandidate
 * @property {string} id The item document id.
 * @property {string} name The item name.
 * @property {string} img The item image path.
 * @property {number} quantity The available item quantity.
 * @property {string|null} container The parent container name, if any.
 * @property {string|null} amount A localized amount hint for one item.
 * @property {number} value The nutrition value provided by one item.
 */

/**
 * @typedef {object} NutritionConsumptionEntry
 * @property {string} itemId The consumed item document id.
 * @property {number} quantity The quantity consumed from the item.
 */

/**
 * @typedef {object} NutritionConsumption
 * @property {NutritionType} type The nutrition type being consumed.
 * @property {NutritionConsumptionEntry[]} entries The selected item consumption entries.
 * @property {boolean} [freshWater] Whether the actor drinks from a fresh water source.
 * @property {boolean} [freeFood] Whether the actor eats from a free food source.
 */
