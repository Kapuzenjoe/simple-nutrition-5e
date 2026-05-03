/**
 * @typedef {"food"|"water"} NutritionType
 */

/**
 * @typedef {object} NutritionState
 * @property {number} food The consumed food today, measured in pounds.
 * @property {number} water The consumed water today, measured in gallons.
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
 * @property {number|null} starvationLimit The actor-specific starvation threshold in days.
 */

/**
 * @typedef {object} NutritionRestState
 * @property {number} starvation The consecutive number of days without food.
 * @property {boolean} dehydrated Whether the actor is dehydrated after the rest.
 * @property {boolean} malnourished Whether the actor is malnourished after the rest.
 * @property {boolean} saveRequired Whether the actor must roll a malnutrition saving throw manually.
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
 */
