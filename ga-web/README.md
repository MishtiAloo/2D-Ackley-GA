# GA Visualizer — 2D Ackley Function

A web frontend for the assignment code. It draws the search space, runs the
genetic algorithm, and can walk through a single generation stage by stage with
animations for roulette wheel selection, crossover and mutation.

The Python in the parent folder is **not modified**. `ga_ackley.py` still runs
on its own with `python ga_ackley.py`; this app imports it.

## Install and run

```
pip install -r requirements.txt
python server.py
```

Then open <http://127.0.0.1:5000>.

To stop it, press CTRL+C in that terminal, or from any other terminal run:

```
python shutdown.py
python shutdown.py 5001      # if you moved the server to another port
```

`shutdown.py` first calls `POST /api/shutdown`, which makes the server stop
itself. If that gets no answer, it finds the python process listening on the
port and ends that instead, so it also works on a server you no longer have a
terminal for. It never touches a process that is not python, and it only ever
looks at 127.0.0.1. Browser tabs left open simply stop updating.

## Files

| File | Purpose |
|---|---|
| `server.py` | Flask app, a handful of JSON endpoints |
| `shutdown.py` | stops the server from another terminal |
| `engine.py` | drives `ga_ackley.py` one stage at a time and records every random decision |
| `verify_parity.py` | proves the engine produces the same numbers as the command line |
| `static/index.html` | the page |
| `static/css/style.css` | styling |
| `static/js/ackley.js` | Ackley formula, used only to paint the background |
| `static/js/landscape.js` | 2D heatmap, 3D surface, population and overlays |
| `static/js/chart.js` | convergence plot |
| `static/js/stages.js` | the six stage panels and their animations |
| `static/js/app.js` | parameter panel, modes, API calls |

## Where the numbers come from

Every GA number shown (populations, fitness, roulette spins, cut points,
mutation deltas, elitism swaps) is computed by Python. `engine.py` calls
`ga_ackley.py`'s own functions where no extra detail is needed, and where the
animation needs to know *why* something happened it repeats the operator with
the same random calls in the same order.

That means a run in the browser matches the command line exactly for the same
seed and settings. Check it yourself:

```
python verify_parity.py
```

It compares `ga_ackley.run_ga` against the stepwise engine across 14
configurations and reports MATCH or DIFFER for each.

The only JavaScript copy of the Ackley formula is `static/js/ackley.js`, used
purely to colour the heatmap and build the 3D mesh, so the browser does not
have to ask the server for 40 000 grid points.

## Modes

**Auto** runs whole generations back to back. Play/Pause, a "+1 gen" button,
and a generations-per-second slider. The map and the convergence curve update
each generation.

**Manual** has two sub-modes:

- **One step at a time** runs a single stage per click, in order:
  evaluate → select → crossover → mutate → elitism → commit. The stage bar
  shows where you are. With animations on you see each roulette spin land on
  the tape, each pair being cut and swapped, and each gene mutation moving its
  point on the map. Animations can be turned off, and the speed slider sets the
  per-item delay. "Skip animation" jumps to the finished state of the stage.
- **Whole generation** runs all six stages at once and stacks all six panels:
  the ranked population with the elite marked, the mating pool that selection
  produced, all 25 pairs with their children, every mutation roll with the
  final children, the elitism swap, and the new generation summary.

The animation toggle applies to one-step mode only, as asked.

## What each stage shows

| Stage | Panel | On the map |
|---|---|---|
| 1 evaluate | table of x1, x2, f(x), fitness and each individual's share of the wheel; best row gold, worst row red, elite marked green | best as a gold star, elite ringed green, worst red |
| 2 select | the wheel unrolled into a **sliding tape**: one slice per individual, width proportional to fitness, a needle that slides to each random spin; the mating pool fills up chip by chip; a most-picked table and how many individuals died out | halo around each individual grows with how often it was picked, current pick ringed |
| 3 crossover | one card per pair: the dice roll against Pc, the cut point drawn between the gene boxes, and the two children with each gene coloured by the parent it came from (blue = A, pink = B) | parents as squares, children as dots, arrows from parents to children |
| 4 mutate | one row per child, one dice roll per gene; a mutated gene shakes, turns orange and shows its delta or an out-of-bounds badge | arrow from the gene's old position to the new one |
| 5 elitism | the elite against the worst child with both f values, and whether the swap happened | elite star, dropped child in red, arrow between them |
| 6 commit | best before, best now, average, best ever, and the stagnation counter | the new population |

## Views

- **2D map** — heatmap of f(x1, x2) with a colour bar, the population on top,
  and a dashed cross at the known optimum (0, 0).
- **3D surface** — the same function as a rotatable surface with the population
  standing on it. Drag to rotate, wheel to zoom. Animations stay in the 2D view,
  so switch back to 2D while stepping.
- **contour bands** quantizes the colours into rings.
- **ids** labels each individual with its index.

## Parameters

Every parameter is a slider or a dropdown in the left panel, and the defaults
are read from `ga_ackley.CONFIG` at startup, so editing the Python file changes
what the page opens with.

| Group | Controls |
|---|---|
| Ackley function | `a`, `b`, `c` (as a multiple of π) |
| Search space | lower bound, upper bound (genes fixed at 2, since the map is 2D) |
| Population | population size N (kept even), max generations, elite count |
| Selection | roulette wheel or tournament, tournament size k |
| Crossover | 1-point, uniform or arithmetic, and Pc |
| Mutation | gaussian or uniform, Pm per gene, sigma, out-of-bounds handling |
| Stopping | improvement tolerance (1e-1 … 1e-14), stagnant generations allowed |
| Randomness | seed, a dice button, and "new seed on every restart" |

Changing anything marks the panel dirty. Press **Apply & restart run** to build
a fresh population with the new settings. The **defaults** link re-reads
`ga_ackley.CONFIG`.

The `‹` button next to **defaults** collapses the whole panel to a thin strip on
the left, giving the width to the picture and the inspector. Click the strip to
bring it back. The choice is remembered in the browser between visits.

Values are validated server-side in `engine.build_config`, so a bad value can
never reach the GA.

## Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/defaults` | the default configuration |
| `POST /api/init` | start a fresh run with the given configuration |
| `GET /api/state` | current state |
| `POST /api/step` | run one stage, with full detail |
| `POST /api/generation` | run the rest of the current generation, with full detail |
| `POST /api/auto` | run whole generations, detail left out |
| `POST /api/shutdown` | stop the server (what `shutdown.py` calls) |

One engine is kept in server memory, so this is a single-user local tool. It
binds to 127.0.0.1 only.
