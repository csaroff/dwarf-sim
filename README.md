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
| `B` | Raise / call off the alarm (civilians shelter in the Refuge zone) |
| `Q` `E`, Shift+wheel | Level down / up. The gauge on the left shows every level, where your dwarves are, and jumps on click |
| `WASD`, wheel | Pan, zoom |
| `Space`, `1` `2` `3` | Pause, speed |
| `L` `K` `T` `J` `H` `M` | Labors, stocks, trade, legends, help, music |
| `G` | Switch between drawn tiles and classic ASCII |
| `O`, then a letter | Orders menu, then `M` mine · `I` stairs · `H` channel · `R` ramp · `T` chop · `P` gather · `V` smooth · `G` engrave · `N` remove construction · `X` cancel orders. While the menu is open these letters pick the order instead of their usual job; `Esc` closes it |

Alerts (top left) explain each problem and its fix on hover; clicking jumps there. Raids, cave-ins and
other emergencies pause the game.

## What is in

- **World**: 96×96×48 map. A river in the north, rolling wooded ground, and a mountain range along the
  south edge with the wagon at its foot. Below: soil and stone layers, 87 materials, ore veins, gems,
  two cavern layers, a magma sea, and something at the bottom. Seasons change the surface.
- **Dwarves**: hunger, thirst, sleep, alcohol, clothing, leisure and worship; mood and thoughts; skills;
  wounds per body part, poison; tantrums; strange moods that produce usable artifacts; marriages,
  children and pets.
- **Work**: mining, woodcutting, farming, brewing, cooking, butchering, milling, masonry, carpentry,
  smelting and alloys, forging, glass, pottery, weaving, tailoring, hunting, fishing, hauling, doctoring,
  burial, animal training and taming, milking and shearing.
- **Buildings**: 20 workshops with work orders, furniture, constructions, fortifications, levers,
  pressure plates, floodgates, drawbridges, wells, four kinds of trap.
- **Machinery**: windmills, water wheels, axles, gears, screw pumps, millstones, with power networks.
- **Combat**: melee and crossbows with line of sight, armor by body part, militia who arm and drill
  themselves, an alarm with a refuge, war dogs.
- **Threats**: 86 creatures. Goblin raids with archers, thieves, snatchers, building destroyers,
  werebeasts, necromancers and zombies, ghosts, vampires, generated forgotten beasts, megabeasts,
  cave-ins, damp and warm stone.
- **Town life**: zones for stockpiles, farms, hospital, tavern, temple, barracks, pasture and refuge; a
  mayor with mandates; caravans (elves refuse wood); a chronicle of the fortress and engravings of it.
- **Exploits**: the drawbridge atom smasher, cage traps that catch anything, water + magma = obsidian,
  farming on mud, fuel-free magma forges.

## What is not

Still far short of Dwarf Fortress: no world generation or history beyond the one site, no adventure
mode, no nobles beyond the mayor, no justice system, no minecarts, no military squads or schedules,
no temperature, no aquifers, and combat that models seven body parts and not tissues.

## Code

- `src/sim` is the headless, deterministic simulation. `jobs.ts` holds the core pattern: every task has a
  `tryX(game, dwarf, target)` that returns a job or a plain-language reason. The right-click menu
  (`orders.ts`), the inspect panels and the alerts (`events.ts`) are all built on those reasons.
  `life.ts` is needs, combat and creature behaviour; `night.ts` the things that come in the night;
  `machines.ts` power; `civics.ts` the mayor, families and pets.
- `src/ui` is the canvas renderer (procedural tile art) and DOM panels.
- `tests/scenarios.test.ts` documents the behaviour as narrative scenarios.
