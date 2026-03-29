Hooks.once("init", async () => {
  const { initNutrition } = await import("./handler.mjs");
  initNutrition();
});
