# Presentation icons

Icon set for the 2D Ackley GA slides. One consistent **lineal color** theme:
outlined shapes with flat colour fills, the same style Flaticon calls
"lineal color".

Open `index.html` in a browser to see every icon with its meaning.

## Where they come from

| Set | Icons | Licence |
|---|---|---|
| [IconPark](https://github.com/bytedance/IconPark), multi-colour theme | 64 | Apache 2.0 |
| drawn here, in the same style | 2 | yours |

IconPark has no DNA and no dice glyph, and both concepts are central to a
genetic algorithm talk. Borrowing them from another set looked wrong next to
the rest, so `chromosome-dna.svg` and `random-initialization.svg` are drawn by
hand using IconPark's own conventions: a 48 unit grid, 4 unit round-capped
black strokes, and the `#2F88FF` accent. They sit in the grid as natives.

Everything else was pulled through the Iconify API at 512 px. `manifest.json`
records the source id of every file, so any icon can be re-fetched or swapped
later.

## Folders

| Folder | Use it for |
|---|---|
| `01-core-ga/` | the seven-step algorithm slide, numbered in loop order |
| `02-ackley/` | the problem: surface, search space, global minimum |
| `03-ga-mechanics/` | one operator per slide: selection, crossover, mutation, elitism |
| `04-results/` | stopping criteria, convergence, the final verdict |
| `05-parameters/` | the `CONFIG` table, seeds, the Pc comparison |
| `06-implementation/` | command line, web visualizer, parity check |

The files in `01-core-ga/` are numbered `01` to `07` so they drop onto a cycle
diagram in the right order: population, fitness, selection, crossover,
mutation, elitism, new generation.

## Using them in PowerPoint

SVG inserts natively in PowerPoint 2016 and later. Insert, Pictures, This
Device, then pick the `.svg`. It scales without blurring.

To recolour one, right click it, Convert to Shape, then ungroup and fill the
parts. Do this on a copy, since the conversion is not reversible.

If your build of PowerPoint refuses SVG, open the file in a browser, or
convert the folder with any SVG to PNG tool at 512 px.

## Re-downloading or adding icons

`manifest.json` lists `iconify_id` for every file, for example
`icon-park:scissors`. Any icon can be fetched again from:

```
https://api.iconify.design/icon-park/scissors.svg?height=512
```

Browse the full IconPark set at <https://icon-sets.iconify.design/icon-park/>
and keep new picks inside that set so the slides stay consistent.

## Recolouring the whole set

Every IconPark icon uses one accent, `#2F88FF`, over black outlines. A find and
replace of that hex across the folder retints all 66 icons to your slide
colour at once, the two hand-drawn ones included.
