/**
 * @import { ActivityNutritionChoice, ActivityNutritionRecord } from "../_types.mjs";
 */

import {
  ACTIVITY_NUTRITION_CHOICES,
  MAGICAL_BERRIES_IDENTIFIER,
  MODULE_ID,
  RATIONS_IDENTIFIER,
  SETTING_KEYS,
  WATER_IDENTIFIERS
} from "../config.mjs";

import { getNutritionAmount, getNutritionConfig, getNutritionNeeds, getNutritionState } from "./actor.mjs";
import { applyConsumption, revertConsumption } from "./consumption.mjs";

/**
 * Add the nutrition option to the usage dialog of a food item.
 * @param {ActivityUsageDialog} dialog  Usage dialog being rendered.
 * @param {HTMLElement} element         Element of the dialog.
 */
export function onRenderActivityUsageDialog(dialog, element) {
  element.querySelector("[data-simple-nutrition-usage]")?.remove();
  if ( !canRecordNutrition(dialog.item, dialog.config) ) return;

  const choices = getAvailableChoices(dialog.item.actor);
  const stored = dialog.config[MODULE_ID]?.nutrition;
  const value = [stored, getDefaultChoice(dialog.item)].find(choice => choices.includes(choice)) ?? "none";
  const group = foundry.applications.fields.createFormGroup({
    label: _loc("SIMPLE_NUTRITION.Usage.Label"),
    input: foundry.applications.fields.createSelectInput({
      name: `${MODULE_ID}.nutrition`,
      value,
      options: choices.map(key => {
        return { value: key, label: _loc(ACTIVITY_NUTRITION_CHOICES[key].label) };
      })
    })
  });

  const legend = document.createElement("legend");
  legend.textContent = _loc("SIMPLE_NUTRITION.Usage.Legend");
  const fieldset = document.createElement("fieldset");
  fieldset.dataset.simpleNutritionUsage = "";
  fieldset.append(legend, group);
  element.querySelector("[data-application-part='consumption']")?.after(fieldset);
}

/* -------------------------------------------- */

/**
 * Record the nutrition chosen in the usage dialog once an activity of a food item was used.
 * @param {Activity} activity                     Activity that was used.
 * @param {ActivityUseConfiguration} usageConfig  Configuration data for the usage.
 * @param {ActivityUsageResults} results          Final details on the usage.
 */
export function onPostUseActivity(activity, usageConfig, results) {
  const choice = usageConfig[MODULE_ID]?.nutrition;
  if ( !Object.hasOwn(ACTIVITY_NUTRITION_CHOICES, choice) || (choice === "none") ) return;
  if ( !canRecordNutrition(activity.item, usageConfig) ) return;
  recordNutrition(activity.item, choice, results.message)
    .catch(err => Hooks.onError("onPostUseActivity", err, { log: "error" }));
}

/* -------------------------------------------- */

/**
 * Revert or reapply the nutrition recorded for a usage when its consumption is refunded or consumed again.
 * @param {ChatMessage5e} message  Updated chat message.
 * @param {object} changes         Differential update data.
 * @param {object} options         Additional options of the update.
 * @param {string} userId          ID of the user who performed the update.
 */
export function onUpdateChatMessage(message, changes, options, userId) {
  if ( (userId !== game.user.id) || !foundry.utils.hasProperty(changes, "system.deltas") ) return;
  const record = message.getFlag(MODULE_ID, "activityNutrition");
  const refunded = !changes.system.deltas;
  if ( !record || (record.applied !== refunded) ) return;
  syncRecordedNutrition(message, record, refunded)
    .catch(err => Hooks.onError("onUpdateChatMessage", err, { log: "error" }));
}

/* -------------------------------------------- */

/**
 * Add the chosen nutrition of one item usage to the actor's current day and store the recorded amounts on the
 * usage message.
 * @param {Item5e} item                     Food item that was used.
 * @param {ActivityNutritionChoice} choice  Chosen nutrition, never `none`.
 * @param {ChatMessage5e|object} [message]  Usage message of the activity.
 * @returns {Promise<void>}
 */
async function recordNutrition(item, choice, message) {
  const actor = item.actor;
  const config = getNutritionConfig(actor);
  const needs = getNutritionNeeds(actor);
  const types = (choice === "both") ? ["food", "water"] : [choice];
  const record = { food: 0, water: 0, applied: true };

  for ( const type of types ) {
    const track = (type === "food") ? config.trackFood : config.trackWater;
    if ( track === false ) continue;
    const before = getNutritionState(actor)[type];
    await applyConsumption(actor, type, getNutritionAmount(actor, type, item) / needs[type]);
    record[type] = getNutritionState(actor)[type] - before;
  }

  if ( (record.food || record.water) && (message instanceof ChatMessage) ) {
    await message.setFlag(MODULE_ID, "activityNutrition", record);
  }
}

/* -------------------------------------------- */

/**
 * Revert or reapply the nutrition recorded for a usage message.
 * @param {ChatMessage5e} message           Usage message holding the record.
 * @param {ActivityNutritionRecord} record  Nutrition recorded for the usage.
 * @param {boolean} refunded                Whether the consumption was refunded.
 * @returns {Promise<void>}
 */
async function syncRecordedNutrition(message, record, refunded) {
  const actor = message.getAssociatedActor();
  if ( !actor ) return;

  const update = refunded ? revertConsumption : applyConsumption;
  for ( const type of ["food", "water"] ) {
    if ( record[type] > 0 ) await update(actor, type, record[type]);
  }
  await message.setFlag(MODULE_ID, "activityNutrition", { ...record, applied: !refunded });
}

/* -------------------------------------------- */

/**
 * Determine whether the usage of an item can be recorded as nutrition.
 * @param {Item5e} item                           Item being used.
 * @param {ActivityUseConfiguration} usageConfig  Configuration data for the usage.
 * @returns {boolean}
 */
function canRecordNutrition(item, usageConfig) {
  if ( game.settings.get(MODULE_ID, SETTING_KEYS.DISABLE_ACTIVITY_NUTRITION) ) return false;
  const actor = item.actor;
  if ( (actor?.type !== "character") || (item.type !== "consumable") || (item.system.type.value !== "food") ) {
    return false;
  }
  if ( getAvailableChoices(actor).length < 2 ) return false;

  if ( (usageConfig.consume === false) || !usageConfig.hasConsumption ) return false;
  const resources = usageConfig.consume?.resources;
  return Array.isArray(resources) ? resources.length > 0 : resources === true;
}

/* -------------------------------------------- */

/**
 * Get the nutrition choices matching the nutrition types tracked for an actor.
 * @param {Actor5e} actor  Actor using the item.
 * @returns {ActivityNutritionChoice[]}
 */
function getAvailableChoices(actor) {
  const { trackFood, trackWater } = getNutritionConfig(actor);
  const food = trackFood !== false;
  const water = trackWater !== false;
  return Object.keys(ACTIVITY_NUTRITION_CHOICES).filter(key => {
    if ( key === "food" ) return food;
    if ( key === "water" ) return water;
    if ( key === "both" ) return food && water;
    return true;
  });
}

/* -------------------------------------------- */

/**
 * Get the choice that is preselected for an item.
 * @param {Item5e} item                Food item being used.
 * @returns {ActivityNutritionChoice}  Food for rations and magical berries, water for water items, otherwise none.
 */
function getDefaultChoice(item) {
  const identifier = item.system.identifier;
  if ( (identifier === RATIONS_IDENTIFIER) || (identifier === MAGICAL_BERRIES_IDENTIFIER) ) return "food";
  if ( WATER_IDENTIFIERS.has(identifier) ) return "water";
  return "none";
}
