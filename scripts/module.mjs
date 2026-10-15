import { onRenderNutritionSaveMessage, onRenderNutritionSummaryMessage, onRenderRestChatMessage } from "./chat/messages.mjs";
import { onPostUseActivity, onRenderActivityUsageDialog, onUpdateChatMessage } from "./nutrition/activity.mjs";
import { onUpdateWorldTime } from "./nutrition/calendar.mjs";
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
  Hooks.on("dnd5e.renderChatMessage", onRenderNutritionSaveMessage);
  Hooks.on("dnd5e.renderChatMessage", onRenderNutritionSummaryMessage);
  Hooks.on("renderActivityUsageDialog", onRenderActivityUsageDialog);
  Hooks.on("dnd5e.postUseActivity", onPostUseActivity);
  Hooks.on("updateChatMessage", onUpdateChatMessage);
  Hooks.on("updateWorldTime", onUpdateWorldTime);
});
