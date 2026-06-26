Hooks.once("init", async () => {
  const { onRenderCharacterActorSheet, registerTidyNutritionContent } = await import("./sheet/tracker.mjs");
  const { onRenderNutritionSaveMessage, onRenderRestChatMessage } = await import("./chat/messages.mjs");
  const { onPreRestCompleted, onRestCompleted } = await import("./nutrition/rest.mjs");
  const { onUpdateWorldTime } = await import("./nutrition/calendar.mjs");

  Hooks.on("renderCharacterActorSheet", onRenderCharacterActorSheet);
  if ( game.modules.get("tidy5e-sheet")?.active ) Hooks.once("tidy5e-sheet.ready", registerTidyNutritionContent);
  Hooks.on("dnd5e.preRestCompleted", onPreRestCompleted);
  Hooks.on("dnd5e.restCompleted", onRestCompleted);
  Hooks.on("dnd5e.renderChatMessage", onRenderRestChatMessage);
  Hooks.on("dnd5e.renderChatMessage", onRenderNutritionSaveMessage);
  Hooks.on("updateWorldTime", onUpdateWorldTime);
});
