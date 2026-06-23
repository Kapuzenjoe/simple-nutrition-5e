# Changelog

## Version 1.0.0

- Added calendar-driven nutrition tracking for `dnd5e` 6.0.0+:
    - Follows the system's daily recovery setting. With calendar-driven recovery active, nutrition is now evaluated once per calendar midnight instead of during a long rest.
    - Tracks the primary party's characters when one is configured, otherwise every character actor.
    - Posts a separate summary message per actor.
- Fixed the malnutrition saving throw rolling against the selected token instead of the actor the request was actually for.
- Fixed the saving throw roll button no longer responding to a second click:
    - The button now also shows the pass/fail result inline with a colored state.
    - The "Apply Malnutrition" button remains available for manual control.
- Rest and calendar nutrition summaries are no longer posted when both food and water requirements are already met, reducing chat spam.

## Version 0.5.0

- The malnutrition saving throw chat message now includes an "Apply Malnutrition" button that directly applies 1 level of Exhaustion and the Malnutrition condition.
- The malnutrition saving throw DC is now configurable per actor. A new "Save DC" field in the nutrition configuration menu overrides the default DC 10 Constitution saving throw.
- Added a free food source option to the food consumption dialog for situations where a character eats without spending items (e.g. tavern meal, buffet).
- Fixed starvation counter not advancing when the character consumed less than a full day's ration.

## Version 0.4.0

- Extended the actor configuration menu with options to disable food and/or water tracking. (#3)

## Version 0.3.1

- Adjusted rest exhaustion handling to better match the D&D rules: *exhaustion caused by dehydration or malnutrition cannot be removed until the character drinks or eats the full daily requirement*, but unrelated exhaustion can still recover normally. For example, a character with 2 unrelated exhaustion levels who takes a long rest but gains 1 dehydration exhaustion now ends at 2 (`2 - 1 + 1`) instead of having the rest recovery blocked. The module now lets `dnd5e` handle existing Dehydration and Malnutrition recovery blocking and only adds new exhaustion when the current day's nutrition intake requires it.
- Actor nutrition configuration now requires the starvation threshold override to be a positive whole number, with a minimum of 1. Leaving it empty still uses the default 5-day threshold.
- Malnutrition save requests and rest chat summaries now use `dnd5e`'s localized condition, ability, and Conditions labels for more system-consistent wording.
- Improved reliability of the nutrition summary on `dnd5e` rest chat cards.
- General cleanup and smaller bug fixes.
- Reorganized the project folder structure for better maintainability.

## Version 0.3.0

- Added support for Tidy 5e Sheets. Tidy uses smaller icon-only buttons without labels to better fit the Tidy header style. (#2)

## Version 0.2.1

- Fixed dehydration and malnutrition being removed immediately once the full daily requirement is met.

## Version 0.2.0

- Added a new configuration menu to set an actor’s daily food and water limits, as well as the number of days before they begin to starve. The menu is available in actor sheet edit mode. (#1)
- Added support for metric units when the metric setting is enabled.
- Included various smaller fixes and improvements.
- Added compatibility with Foundry VTT V14.

## Version 0.1.0

- first release
