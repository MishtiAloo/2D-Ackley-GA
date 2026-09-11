# GA — Global Minimum of the 2D Ackley Function

Genetic Algorithm implementation for the assignment specification
(real-valued encoding, roulette wheel selection, 1-point crossover,
per-gene Gaussian mutation, 1 elite).

Known global minimum: `f(0, 0) = 0`.

There are two ways to run it: the **command line script**, and a **web
visualizer** that draws the search space and steps through a single generation
stage by stage.

## Files

| File | Purpose |
|---|---|
| `ga_ackley.py` | the whole algorithm + report + convergence plot |
| `requirements.txt` | only `matplotlib` (needed for the plot) |
| `convergence.png` | plot produced by the run |
| `ga-web/` | the web visualizer (see below and `ga-web/README.md`) |
| `ga-web/shutdown.py` | stops the web server |

## 1. Command line

```
pip install -r requirements.txt
python ga_ackley.py
```

The plot is optional. Without `matplotlib` the program still runs and
prints all numbers, it just skips the figure.

## 2. Web visualizer

```
cd ga-web
pip install -r requirements.txt
python server.py
```

Then open <http://127.0.0.1:5000> in a browser. It needs Flask, which is the
only entry in `ga-web/requirements.txt`.

To stop the server, press CTRL+C in that terminal, or from any other terminal:

```
cd ga-web
python shutdown.py
```

`shutdown.py` asks the server to stop itself and, if it does not answer, ends
the python process holding the port. Pass a port number to use a different one,
for example `python shutdown.py 5001`.

`ga_ackley.py` is **not modified or copied** by the web app. The server imports
it from this folder and drives it, so the script keeps running on its own
exactly as before.

What the page gives you:

- **Auto mode** plays whole generations back to back, with the population on
  the map and a live convergence curve.
- **Manual mode, one step at a time** runs one stage per click through
  evaluate, select, crossover, mutate, elitism, commit. Animations show each
  roulette spin landing on a sliding fitness tape, each pair being cut and
  swapped, and each mutated gene moving its point on the map. Animations can be
  switched off, and the speed is adjustable.
- **Manual mode, whole generation** runs all six stages at once and stacks all
  six panels: the ranked population with the elite marked, the mating pool,
  every pair with its children, every mutation roll with the final children,
  the elitism swap, and the new generation summary.
- Every parameter is a slider or a dropdown, and the defaults are read from
  `CONFIG` in `ga_ackley.py` at startup.
- A **2D heatmap** of f(x1, x2) and a rotatable **3D surface** of the same
  function, with the population drawn on both.

Every number on the page is computed by Python, so a browser run matches the
command line exactly for the same seed and settings. To check that:

```
cd ga-web
python verify_parity.py
```

It compares `ga_ackley.run_ga` against the stepwise engine used by the server
across 14 configurations and prints MATCH or DIFFER for each.

`ga-web/README.md` has the full details: file layout, endpoints, and what each
stage panel shows.

## Tuning

Everything is in the `CONFIG` dictionary at the top of `ga_ackley.py`.
Nothing is hard-coded anywhere else, so edit `CONFIG` and re-run. The web page
reads the same dictionary for its starting values, so an edit here changes both
ways of running.

| Key | Meaning | Default |
|---|---|---|
| `a`, `b`, `c` | Ackley function constants | `20`, `0.2`, `2*pi` |
| `n_genes` | number of variables | `2` |
| `lower_bound`, `upper_bound` | search space per gene | `-5`, `5` |
| `pop_size` | population size N | `50` |
| `max_generations` | generation limit | `100` |
| `pc` | crossover probability | `0.80` |
| `pm` | mutation probability **per gene** | `0.05` |
| `elite_count` | protected best individuals | `1` |
| `selection_method` | `roulette`, `tournament` | `roulette` |
| `tournament_size` | k for tournament selection | `3` |
| `crossover_method` | `one_point`, `uniform`, `arithmetic` | `one_point` |
| `mutation_method` | `gaussian`, `uniform` | `gaussian` |
| `mutation_sigma` | Gaussian step size | `1.0` |
| `bounds_handling` | `resample`, `clip`, `reflect` | `resample` |
| `stagnation_tolerance` | improvement counted as progress | `1e-12` |
| `stagnation_limit` | stagnant generations before stopping | `30` |
| `random_seed` | integer for repeatable runs, `None` for random | `42` |
| `print_every` | progress line frequency, `0` = silent | `10` |
| `show_plot`, `save_plot`, `plot_file` | plot output | on, on, `convergence.png` |
| `compare_pc_values`, `compare_runs` | the extra Pc experiment | `[0.8, 0.7]`, `5` |

The algorithm is n-dimensional, so setting `n_genes` to `5` or `10` works
without any other change in the script. The web page always uses 2 genes,
because the map it draws is two dimensional.

## What the command line run prints

1. the parameter summary
2. a progress line every 10 generations
3. best `(x1, x2)`, best `f(x)`, distance to the origin, and a verdict
4. best `f(x)` at generations 1, 5, 10, 25, 50, 100 with the share of the
   total improvement that happened before and after generation 5
5. a comparison of `Pc = 0.8` against `Pc = 0.7`, averaged over 5 runs
6. the convergence plot, linear scale and log scale side by side
