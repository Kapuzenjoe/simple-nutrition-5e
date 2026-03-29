# Simple Nutrition 5e

![Static Badge](https://img.shields.io/badge/Foundry-v13--14-informational)
![Static Badge](https://img.shields.io/badge/Dnd5e-v5.3-informational)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/peterlankton86911)

Simple Nutrition 5e tracks daily food and water for `dnd5e` characters and applies the related rest consequences for dehydration and malnutrition.

## Features

### Daily tracking
- Tracks food and water separately for each character.
- Calculates daily requirements from actor size.
- Shows the current progress directly on the character sheet.

### Consume dialog
- Open food and water consumption directly from the actor sheet.
- Shows the required amount for the day and the currently selected amount.
- Supports consuming from already listed inventory items.
- Supports drag and drop for additional consumables from the same actor inventory.
- Supports `Fresh Water Source Available` for drinking without consuming carried water.

### Rest integration
- Evaluates nutrition on rests that start a new day.
- Applies dehydration automatically when less than half the required water was consumed.
- Tracks consecutive days without food and applies starvation automatically from day 5 onward.
- Blocks exhaustion recovery while dehydration or malnutrition is active.
- Adds a short nutrition summary to the resulting rest chat card.
- Creates a separate Constitution save request when the character ate less than half the required food.

### Conditions
- Uses the `Dehydrated` and `Malnutrition` conditions to represent blocked exhaustion recovery.
- Removes those conditions as soon as the character fully satisfies the relevant daily requirement.
- Keeps exhaustion itself unchanged until it is removed through the normal game workflow.

## Current Limitations
- Failed malnutrition saves are resolved manually.
- Calendar-based day changes are not implemented yet.
