# Changelog

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
