import {
  onRenderNutritionSaveMessage,
  onRenderNutritionSaveResult,
  onRenderNutritionSummaryMessage,
  onRenderRestChatMessage
} from "./chat/messages.mjs";
import {
  onActivityConsumption,
  onPostUseActivity,
  onRenderActivityUsageDialog,
  onUpdateChatMessage
} from "./nutrition/activity.mjs";
import { onRenderNutritionApplyMessage, onUpdateWorldTime } from "./nutrition/calendar.mjs";
import { onPreRestCompleted, onRestCompleted } from "./nutrition/rest.mjs";
import { registerSettings } from "./settings.mjs";
import {
  onRenderCharacterActorSheet,
  onRenderGroupActorSheet,
  registerTidyNutritionContent
} from "./sheet/tracker.mjs";

Hooks.once("init", () => {
  registerSettings();
  Hooks.on("renderCharacterActorSheet", onRenderCharacterActorSheet);
  Hooks.on("renderGroupActorSheet", onRenderGroupActorSheet);
  if ( game.modules.get("tidy5e-sheet")?.active ) Hooks.once("tidy5e-sheet.ready", registerTidyNutritionContent);
  Hooks.on("dnd5e.preRestCompleted", onPreRestCompleted);
  Hooks.on("dnd5e.restCompleted", (actor, result, config) => {
    onRestCompleted(actor, result, config).catch(err => {
      Hooks.onError("onRestCompleted", err, {
        msg: _loc("SIMPLE_NUTRITION.Rest.NutritionFailed", { actor: actor.name }),
        log: "error",
        notify: "error"
      });
    });
  });
  Hooks.on("dnd5e.renderChatMessage", (message, html) => {
    onRenderRestChatMessage(message, html)
      .catch(err => Hooks.onError("onRenderRestChatMessage", err, { log: "error" }));
  });
  Hooks.on("dnd5e.renderChatMessage", (message, html) => {
    onRenderNutritionSaveMessage(message, html)
      .catch(err => Hooks.onError("onRenderNutritionSaveMessage", err, { log: "error" }));
  });
  Hooks.on("dnd5e.renderChatMessage", onRenderNutritionSaveResult);
  Hooks.on("dnd5e.renderChatMessage", onRenderNutritionSummaryMessage);
  Hooks.on("dnd5e.renderChatMessage", (message, html) => {
    onRenderNutritionApplyMessage(message, html)
      .catch(err => Hooks.onError("onRenderNutritionApplyMessage", err, { log: "error" }));
  });
  Hooks.on("renderActivityUsageDialog", onRenderActivityUsageDialog);
  Hooks.on("dnd5e.activityConsumption", onActivityConsumption);
  Hooks.on("dnd5e.postUseActivity", onPostUseActivity);
  Hooks.on("updateChatMessage", onUpdateChatMessage);
  Hooks.on("updateWorldTime", onUpdateWorldTime);
});
