# Strike the Earth!

A browser colony sim: Dwarf Fortress content (z-levels, mining, booze, caverns, magma, goblins) with
RimWorld-style control. Every idle dwarf, stalled job and stuck work order says why.

## Run

```bash
npm install
cp ~/Downloads/"Dwarf Fortress - Dwarf Fortress Mode theme.mp3" public/music/theme.mp3   # music is not checked in
npm run dev        # http://localhost:5173
```

`npm test` runs the scenario tests. `npm run test:long` plays five worlds for two game years with a scripted player.

## Controls

| | |
|---|---|
| Left-click | Inspect a dwarf, tile, building, zone or item: what it is doing, or why nothing is happening |
| Select a dwarf, right-click | Menu of orders for that spot. Picking one overrides the current job. Impossible orders are listed greyed out with the reason |
| Drag | Select several dwarves |
| `R` | Draft / undraft (drafted dwarves stop working, fight, and go where you right-click) |
| `Q` `E`, Shift+wheel | Level down / up |
| `WASD`, wheel | Pan, zoom |
| `Space`, `1` `2` `3` | Pause, speed |
| `L` `K` `T` `H` `M` | Labors, stocks, trade, help, music |

Alerts (top left) explain each problem and its fix on hover; clicking jumps there. Raids pause the game.

## What is in

- **World**: 96×96×32 map with soil and stone layers, ore veins, gems, a river, two cavern layers, a magma sea, and something at the bottom.
- **Dwarves**: hunger, thirst, sleep, mood and thoughts, skills, wounds per body part, tantrums, strange moods and artifacts. Without alcohol they slow down, despair and die.
- **Work**: mining, channels, stairs, ramps, woodcutting, farming, brewing, cooking, butchering, masonry, carpentry, smelting, forging, hunting, fishing, hauling, doctoring, burial.
- **Buildings**: 18 workshops with work orders, furniture, constructions, levers, floodgates, drawbridges, traps, wells.
- **World events**: migrants, caravans and trade, goblin raids, thieves, wildlife, cavern creatures, forgotten beasts.
- **Exploits**: the drawbridge atom smasher, cage traps that catch anything, water + magma = obsidian, farming on mud, fuel-free magma forges.

## Code

- `src/sim` is the headless, deterministic simulation. `jobs.ts` holds the core pattern: every task has a
  `tryX(game, dwarf, target)` that returns a job or a plain-language reason. The right-click menu
  (`orders.ts`), the inspect panels and the alerts (`events.ts`) are all built on those reasons.
- `src/ui` is the canvas renderer and DOM panels.
- `tests/scenarios.test.ts` documents the behaviour as narrative scenarios (broken leg, right-click override, alcohol, z-levels, exploits).
