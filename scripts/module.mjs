import { onRenderNutritionSaveMessage, onRenderNutritionSummaryMessage, onRenderRestChatMessage } from "./chat/messages.mjs";
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
  Hooks.on("dnd5e.restCompleted", onRestCompleted);
  Hooks.on("dnd5e.renderChatMessage", onRenderRestChatMessage);
  Hooks.on("dnd5e.renderChatMessage", onRenderNutritionSaveMessage);
  Hooks.on("dnd5e.renderChatMessage", onRenderNutritionSummaryMessage);
  Hooks.on("updateWorldTime", onUpdateWorldTime);
});
