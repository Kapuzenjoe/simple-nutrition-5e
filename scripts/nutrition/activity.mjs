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
  const extra = usageConfig[MODULE_ID]?.extra ?? 0;
  if ( (extra > 0) && (results.message instanceof ChatMessage) ) {
    results.message.setFlag(MODULE_ID, "extraUnits", extra)
      .catch(err => Hooks.onError("onPostUseActivity", err, { log: "error" }));
  }

  const choice = usageConfig[MODULE_ID]?.nutrition;
  if ( !Object.hasOwn(ACTIVITY_NUTRITION_CHOICES, choice) || (choice === "none") ) return;
  if ( !canRecordNutrition(activity.item, usageConfig) ) return;
  const scaling = Number.isFinite(usageConfig.scaling) ? usageConfig.scaling : 0;
  recordNutrition(activity, choice, results.message, 1 + scaling + extra)
    .catch(err => Hooks.onError("onPostUseActivity", err, { log: "error" }));
}

/* -------------------------------------------- */

/**
 * Apply the additional units picked in the Consume dialog to the quantity and uses that the usage consumes.
 * @param {Activity} activity                          Activity being used.
 * @param {ActivityUseConfiguration} usageConfig        Configuration data for the usage.
 * @param {ActivityMessageConfiguration} messageConfig  Configuration info for the usage message.
 * @param {ActivityUsageUpdates} updates                Updates about to be applied to the actor and its items.
 * @returns {false|void}                                False if there is not enough left for all units.
 */
export function onActivityConsumption(activity, usageConfig, messageConfig, updates) {
  const settings = usageConfig[MODULE_ID];
  const messageId = usageConfig.event?.target?.closest?.("[data-message-id]")?.dataset.messageId;
  const stored = game.messages.get(messageId)?.getFlag(MODULE_ID, "extraUnits");
  const extra = settings ? Number(settings.units) - 1 : Number(stored);
  if ( !(extra > 0) || (usageConfig.consume === false) ) return;

  let scaled = false;
  for ( let index = updates.item.length - 1; index >= 0; index-- ) {
    const update = updates.item[index];
    const item = activity.actor.items.get(update._id);
    const { quantity, uses } = item.system;
    if ( "system.quantity" in update ) update["system.quantity"] += (update["system.quantity"] - quantity) * extra;
    if ( "system.uses.spent" in update ) update["system.uses.spent"] += (update["system.uses.spent"] - uses.spent) * extra;
    scaled ||= ("system.quantity" in update) || ("system.uses.spent" in update);
    const exceeded = (update["system.quantity"] < 0) || (update["system.uses.spent"] < 0)
      || (update["system.uses.spent"] > uses?.max);
    if ( exceeded ) {
      ui.notifications.warn(_loc("SIMPLE_NUTRITION.Usage.WarningUnitsLeft", { item: activity.item.name, units: extra + 1 }));
      return false;
    }
    if ( (update["system.quantity"] === 0) && uses?.autoDestroy ) {
      updates.item.splice(index, 1);
      updates.delete.push(item.id);
    }
  }

  if ( !scaled ) {
    if ( settings ) ui.notifications.warn(_loc("SIMPLE_NUTRITION.Usage.WarningUnits", { item: activity.item.name }));
    return;
  }
  if ( settings ) settings.extra = extra;
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
 * @param {Activity} activity               Activity of the food item that was used.
 * @param {ActivityNutritionChoice} choice  Chosen nutrition, never `none`.
 * @param {ChatMessage5e|object} [message]  Usage message of the activity.
 * @param {number} [units=1]                Number of items consumed by the usage.
 * @returns {Promise<void>}
 */
async function recordNutrition(activity, choice, message, units=1) {
  const { actor, item } = activity;
  const config = getNutritionConfig(actor);
  const needs = getNutritionNeeds(actor);
  const types = (choice === "both") ? ["food", "water"] : [choice];
  const record = { food: 0, water: 0, applied: true };

  for ( const type of types ) {
    const track = (type === "food") ? config.trackFood : config.trackWater;
    if ( track === false ) continue;
    const before = getNutritionState(actor)[type];
    await applyConsumption(actor, type, (getNutritionAmount(actor, type, item, activity) * units) / needs[type]);
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
