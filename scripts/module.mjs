Hooks.once("init", async () => {
  const { initNutritionHooks } = await import("./nutrition/hooks.mjs");
  initNutritionHooks();
});
