# =============================================================================
#  engine.py - a step-by-step driver around the untouched ga_ackley.py
#  ---------------------------------------------------------------------------
#  ga_ackley.py runs a whole GA in one call (run_ga). The web frontend instead
#  needs to walk through a single generation one STAGE at a time:
#
#      evaluate -> select -> crossover -> mutate -> elitism -> commit
#
#  and it needs to know WHY each random decision happened (which roulette spin
#  picked which parent, which cut point was used, which gene mutated, ...) so
#  it can animate it.
#
#  So this file does two things:
#    1. it calls ga_ackley's own functions wherever no extra detail is needed
#       (ackley, create_population, evaluate_population, objective_to_fitness,
#        get_elites, repair_gene)
#    2. where detail IS needed it repeats the operator in the exact same way,
#       with the exact same random-number calls in the exact same order, and
#       records what happened.
#
#  Because of (2) a run driven from the browser consumes the random stream in
#  the same order as ga_ackley.run_ga, so with the same seed and the same
#  settings the browser shows exactly the numbers the command line prints.
#  verify_parity.py checks that claim.
#
#  ga_ackley.py itself is never modified or monkey-patched.
# =============================================================================

import os
import sys
import math
import random
import copy

# --- make the parent folder importable, then import the original GA ---------
HERE = os.path.dirname(os.path.abspath(__file__))
PARENT = os.path.dirname(HERE)
if PARENT not in sys.path:
    sys.path.insert(0, PARENT)

import ga_ackley as ga     # the untouched assignment code


# the order in which one generation is processed
STAGES = ["evaluate", "select", "crossover", "mutate", "elitism", "commit"]


# =============================================================================
#  CONFIGURATION HANDLING
#  The browser sends a dictionary of overrides. Everything is validated and
#  clamped here, so a bad value from the UI can never crash the GA.
# =============================================================================

def _as_float(value, low, high, default):
    """Read a float, keep it inside [low, high], fall back to default."""
    try:
        value = float(value)
    except (TypeError, ValueError):
        return default
    if math.isnan(value) or math.isinf(value):
        return default
    if value < low:
        return low
    if value > high:
        return high
    return value


def _as_int(value, low, high, default):
    """Read an int, keep it inside [low, high], fall back to default."""
    try:
        value = int(round(float(value)))
    except (TypeError, ValueError):
        return default
    if value < low:
        return low
    if value > high:
        return high
    return value


def _as_choice(value, allowed, default):
    """Accept the value only if it is one of the allowed strings."""
    if value in allowed:
        return value
    return default


def build_config(overrides):
    """Start from ga_ackley.CONFIG and apply the settings sent by the browser."""
    if overrides is None:
        overrides = {}

    config = dict(ga.CONFIG)          # defaults from the assignment code

    # ---- Ackley function ------------------------------------------------
    config["a"] = _as_float(overrides.get("a"), 0.1, 100.0, config["a"])
    config["b"] = _as_float(overrides.get("b"), 0.01, 5.0, config["b"])
    config["c"] = _as_float(overrides.get("c"), 0.0, 100.0, config["c"])

    # ---- search space ---------------------------------------------------
    # The picture is a 2D map, so the chromosome always has exactly 2 genes.
    config["n_genes"] = 2
    low = _as_float(overrides.get("lower_bound"), -100.0, -0.1,
                    config["lower_bound"])
    high = _as_float(overrides.get("upper_bound"), 0.1, 100.0,
                     config["upper_bound"])
    if high <= low:                   # keep the interval valid
        high = low + 1.0
    config["lower_bound"] = low
    config["upper_bound"] = high

    # ---- population -----------------------------------------------------
    pop_size = _as_int(overrides.get("pop_size"), 4, 300, config["pop_size"])
    if pop_size % 2 == 1:             # even size keeps the pairing simple
        pop_size = pop_size + 1
    config["pop_size"] = pop_size
    config["max_generations"] = _as_int(overrides.get("max_generations"),
                                        1, 1000, config["max_generations"])
    config["elite_count"] = _as_int(overrides.get("elite_count"),
                                    0, pop_size, config["elite_count"])

    # ---- operators ------------------------------------------------------
    config["selection_method"] = _as_choice(overrides.get("selection_method"),
                                            ["roulette", "tournament"],
                                            config["selection_method"])
    config["tournament_size"] = _as_int(overrides.get("tournament_size"),
                                        2, max(2, pop_size),
                                        config["tournament_size"])
    config["crossover_method"] = _as_choice(overrides.get("crossover_method"),
                                            ["one_point", "uniform",
                                             "arithmetic"],
                                            config["crossover_method"])
    config["mutation_method"] = _as_choice(overrides.get("mutation_method"),
                                           ["gaussian", "uniform"],
                                           config["mutation_method"])
    config["bounds_handling"] = _as_choice(overrides.get("bounds_handling"),
                                           ["resample", "clip", "reflect"],
                                           config["bounds_handling"])
    config["pc"] = _as_float(overrides.get("pc"), 0.0, 1.0, config["pc"])
    config["pm"] = _as_float(overrides.get("pm"), 0.0, 1.0, config["pm"])
    config["mutation_sigma"] = _as_float(overrides.get("mutation_sigma"),
                                         0.001, 50.0,
                                         config["mutation_sigma"])

    # ---- stopping criteria ----------------------------------------------
    config["stagnation_tolerance"] = _as_float(
        overrides.get("stagnation_tolerance"), 0.0, 1.0,
        config["stagnation_tolerance"])
    config["stagnation_limit"] = _as_int(overrides.get("stagnation_limit"),
                                         1, 1000000,
                                         config["stagnation_limit"])

    # ---- seed -----------------------------------------------------------
    seed = overrides.get("random_seed", config["random_seed"])
    if seed is None or seed == "" or seed == "none":
        config["random_seed"] = None
    else:
        config["random_seed"] = _as_int(seed, 0, 2000000000, 42)

    # the web frontend never plots or prints from Python
    config["print_every"] = 0
    config["show_plot"] = False
    config["save_plot"] = False

    return config


# =============================================================================
#  SMALL HELPERS
# =============================================================================

def _index_of_lowest(values):
    """Index of the smallest value (the best individual, we minimize)."""
    best = 0
    for i in range(len(values)):
        if values[i] < values[best]:
            best = i
    return best


def _index_of_highest(values):
    """Index of the largest value (the worst individual)."""
    worst = 0
    for i in range(len(values)):
        if values[i] > values[worst]:
            worst = i
    return worst


def _rank_order(values):
    """Indices sorted by value, best (lowest) first."""
    return sorted(range(len(values)), key=lambda i: values[i])


# =============================================================================
#  INSTRUMENTED OPERATORS
#  Each one mirrors the matching function in ga_ackley.py exactly - same
#  formula, same random calls, same order - but also returns a record of what
#  happened so the frontend can animate it.
# =============================================================================

def _roulette_with_details(population, fitness, pool_size):
    """Roulette wheel selection that also reports every spin.

    Mirrors ga_ackley.roulette_wheel_selection.
    """
    total_fitness = sum(fitness)

    cumulative = []
    running_total = 0.0
    for f in fitness:
        running_total = running_total + f
        cumulative.append(running_total)

    draws = []
    mating_pool = []
    for i in range(pool_size):
        if total_fitness <= 0.0:
            # flat population: the wheel has no slices, so pick at random
            pick = random.randrange(len(population))
            mating_pool.append(list(population[pick]))
            draws.append({"spin": None, "index": pick})
            continue

        spin = random.uniform(0.0, total_fitness)
        for index in range(len(cumulative)):
            if spin <= cumulative[index]:
                mating_pool.append(list(population[index]))
                draws.append({"spin": spin, "index": index})
                break

    return mating_pool, {
        "kind": "roulette",
        "total_fitness": total_fitness,
        "cumulative": cumulative,
        "draws": draws,
    }


def _tournament_with_details(population, values, pool_size, config):
    """Tournament selection that also reports every contender.

    Mirrors ga_ackley.tournament_selection.
    """
    k = config["tournament_size"]

    draws = []
    mating_pool = []
    for i in range(pool_size):
        best_index = random.randrange(len(population))
        contenders = [best_index]
        for j in range(k - 1):
            challenger = random.randrange(len(population))
            contenders.append(challenger)
            if values[challenger] < values[best_index]:
                best_index = challenger
        mating_pool.append(list(population[best_index]))
        draws.append({"spin": None, "index": best_index,
                      "contenders": contenders})

    return mating_pool, {
        "kind": "tournament",
        "tournament_size": k,
        "draws": draws,
    }


def _crossover_with_details(mating_pool, draws, config):
    """Pair the mating pool and breed, reporting every decision.

    Mirrors ga_ackley.crossover_population + do_crossover + the three
    crossover operators.
    """
    pairs = []
    offspring = []

    for i in range(0, len(mating_pool) - 1, 2):
        parent_a = mating_pool[i]
        parent_b = mating_pool[i + 1]

        # which population members these two copies came from (for the picture)
        source_a = draws[i]["index"] if i < len(draws) else None
        source_b = draws[i + 1]["index"] if (i + 1) < len(draws) else None

        r = random.random()
        applied = (r <= config["pc"])
        point = None
        alpha = None
        gene_from_a = None

        if not applied:
            # no crossover: the children are plain copies of the parents
            child1 = list(parent_a)
            child2 = list(parent_b)
        else:
            method = config["crossover_method"]
            n = len(parent_a)

            if method == "one_point":
                point = random.randint(1, n - 1)
                child1 = parent_a[0:point] + parent_b[point:n]
                child2 = parent_b[0:point] + parent_a[point:n]

            elif method == "uniform":
                child1 = []
                child2 = []
                gene_from_a = []
                for g in range(n):
                    if random.random() < 0.5:
                        gene_from_a.append(True)
                        child1.append(parent_a[g])
                        child2.append(parent_b[g])
                    else:
                        gene_from_a.append(False)
                        child1.append(parent_b[g])
                        child2.append(parent_a[g])

            else:   # arithmetic
                alpha = random.random()
                child1 = []
                child2 = []
                for g in range(n):
                    child1.append(alpha * parent_a[g] +
                                  (1.0 - alpha) * parent_b[g])
                    child2.append(alpha * parent_b[g] +
                                  (1.0 - alpha) * parent_a[g])

        pairs.append({
            "slot_a": i,
            "slot_b": i + 1,
            "source_a": source_a,
            "source_b": source_b,
            "parent_a": list(parent_a),
            "parent_b": list(parent_b),
            "r": r,
            "applied": applied,
            "point": point,
            "alpha": alpha,
            "gene_from_a": gene_from_a,
            "child1": list(child1),
            "child2": list(child2),
            "child1_index": len(offspring),
            "child2_index": len(offspring) + 1,
        })

        offspring.append(child1)
        offspring.append(child2)

    # safety net for an odd pool (cannot happen: pop_size is forced even)
    if len(mating_pool) % 2 == 1:
        offspring.append(list(mating_pool[-1]))

    return offspring, pairs


def _mutation_with_details(offspring, config):
    """Mutate per gene, reporting every coin flip.

    Mirrors ga_ackley.mutate_population + mutate_gene, and calls
    ga_ackley.repair_gene for the out-of-bounds handling.
    """
    pm = config["pm"]
    method = config["mutation_method"]
    sigma = config["mutation_sigma"]
    low = config["lower_bound"]
    high = config["upper_bound"]

    rolls = []
    for child_index in range(len(offspring)):
        chromosome = offspring[child_index]

        for gene_index in range(len(chromosome)):
            r = random.random()
            record = {
                "child_index": child_index,
                "gene_index": gene_index,
                "r": r,
                "mutated": False,
                "old": chromosome[gene_index],
                "new": chromosome[gene_index],
                "delta": 0.0,
                "raw": None,
                "repaired": False,
            }

            if r <= pm:
                old_value = chromosome[gene_index]

                if method == "gaussian":
                    delta = random.gauss(0.0, sigma)
                    raw_value = old_value + delta
                else:                       # uniform: jump anywhere
                    raw_value = random.uniform(low, high)
                    delta = raw_value - old_value

                # reuse the original bounds handling from ga_ackley
                new_value = ga.repair_gene(raw_value, old_value, config)

                chromosome[gene_index] = new_value
                record["mutated"] = True
                record["new"] = new_value
                record["delta"] = delta
                record["raw"] = raw_value
                record["repaired"] = (raw_value < low or raw_value > high)

            rolls.append(record)

    return offspring, rolls


def _elitism_with_details(offspring, elites, config):
    """Insert the elites into the new population, reporting each attempt.

    Mirrors ga_ackley.apply_elitism.
    """
    events = []
    if len(elites) == 0:
        return offspring, events

    offspring_values = ga.evaluate_population(offspring, config)

    for elite in elites:
        elite_value = ga.ackley(elite, config)
        worst_index = _index_of_highest(offspring_values)
        worst_value = offspring_values[worst_index]
        replaced = (elite_value < worst_value)

        event = {
            "elite": list(elite),
            "elite_value": elite_value,
            "worst_index": worst_index,
            "worst_value": worst_value,
            "worst_chromosome": list(offspring[worst_index]),
            "replaced": replaced,
        }

        if replaced:
            offspring[worst_index] = copy.deepcopy(elite)
            offspring_values[worst_index] = elite_value

        events.append(event)

    return offspring, events


# =============================================================================
#  THE ENGINE
# =============================================================================

class GAEngine(object):
    """Runs the GA of ga_ackley.py one stage (or one generation) at a time."""

    def __init__(self, config):
        self.config = config

        # seed exactly like ga_ackley.run_ga does
        if config["random_seed"] is not None:
            random.seed(config["random_seed"])

        # step 1 of run_ga: the random starting population
        self.population = ga.create_population(config)

        self.generation = 1
        self.stage = "evaluate"          # the stage that will run next

        # filled in by the evaluate stage
        self.values = []
        self.fitness = []
        self.elites = []
        self.mating_pool = []
        self.select_detail = None
        self.offspring = []

        # progress tracking (same meaning as in run_ga)
        self.best_ever = None
        self.best_ever_value = None
        self.stagnation_counter = 0
        self.history_best = []
        self.history_average = []

        self.finished = False
        self.stop_reason = None

    # -- reporting ---------------------------------------------------------

    def snapshot(self):
        """The small state bundle the frontend needs after every call."""
        return {
            "generation": self.generation,
            "next_stage": self.stage,
            "finished": self.finished,
            "stop_reason": self.stop_reason,
            "population": [list(c) for c in self.population],
            "values": list(self.values),
            "best_ever": None if self.best_ever is None else list(self.best_ever),
            "best_ever_value": self.best_ever_value,
            "stagnation_counter": self.stagnation_counter,
            "stagnation_limit": self.config["stagnation_limit"],
            "history_best": list(self.history_best),
            "history_average": list(self.history_average),
            "config": self.public_config(),
        }

    def public_config(self):
        """The configuration, without the unused plotting keys."""
        skip = ["show_plot", "save_plot", "plot_file", "print_every",
                "compare_pc_values", "compare_runs"]
        out = {}
        for key in self.config:
            if key not in skip:
                out[key] = self.config[key]
        return out

    # -- the six stages ----------------------------------------------------

    def _stage_evaluate(self):
        """Score everybody, find the best/worst, elites and fitness values."""
        config = self.config
        self.values = ga.evaluate_population(self.population, config)

        best_index = _index_of_lowest(self.values)
        worst_index = _index_of_highest(self.values)
        current_best_value = self.values[best_index]
        average_value = sum(self.values) / len(self.values)

        self.history_best.append(current_best_value)
        self.history_average.append(average_value)

        # --- best-ever and stagnation bookkeeping (copied from run_ga) ---
        improvement = None
        if self.best_ever_value is None:
            self.best_ever = copy.deepcopy(self.population[best_index])
            self.best_ever_value = current_best_value
            self.stagnation_counter = 0
        else:
            improvement = self.best_ever_value - current_best_value
            if improvement > config["stagnation_tolerance"]:
                self.best_ever = copy.deepcopy(self.population[best_index])
                self.best_ever_value = current_best_value
                self.stagnation_counter = 0
            else:
                self.stagnation_counter = self.stagnation_counter + 1
                if current_best_value < self.best_ever_value:
                    self.best_ever = copy.deepcopy(self.population[best_index])
                    self.best_ever_value = current_best_value

        # --- fitness transformation and elites ---------------------------
        self.fitness = ga.objective_to_fitness(self.values)
        self.elites = ga.get_elites(self.population, self.values, config)
        elite_indices = _rank_order(self.values)[0:config["elite_count"]]

        # --- stopping criterion 2: stagnation ----------------------------
        stopped = False
        if self.stagnation_counter >= config["stagnation_limit"]:
            self.finished = True
            stopped = True
            self.stop_reason = ("no improvement > %g for %d consecutive generations"
                                % (config["stagnation_tolerance"],
                                   config["stagnation_limit"]))

        detail = {
            "values": list(self.values),
            "fitness": list(self.fitness),
            "f_worst": max(self.values),
            "best_index": best_index,
            "worst_index": worst_index,
            "best_value": current_best_value,
            "average_value": average_value,
            "elite_indices": elite_indices,
            "improvement": improvement,
            "stagnation_counter": self.stagnation_counter,
            "stopped": stopped,
        }

        self.stage = "select"
        return detail

    def _stage_select(self):
        """Fill the mating pool (same size as the population)."""
        config = self.config

        if config["selection_method"] == "roulette":
            pool, detail = _roulette_with_details(self.population,
                                                  self.fitness,
                                                  config["pop_size"])
        else:
            pool, detail = _tournament_with_details(self.population,
                                                    self.values,
                                                    config["pop_size"],
                                                    config)

        self.mating_pool = pool
        self.select_detail = detail

        # how many times each individual was picked (nice for a histogram)
        counts = [0] * len(self.population)
        for draw in detail["draws"]:
            counts[draw["index"]] = counts[draw["index"]] + 1
        detail["counts"] = counts
        detail["pool"] = [list(c) for c in pool]

        self.stage = "crossover"
        return detail

    def _stage_crossover(self):
        """Pair the pool sequentially and breed a full set of offspring."""
        self.offspring, pairs = _crossover_with_details(
            self.mating_pool, self.select_detail["draws"], self.config)

        detail = {
            "pc": self.config["pc"],
            "method": self.config["crossover_method"],
            "pairs": pairs,
            "offspring": [list(c) for c in self.offspring],
            "offspring_values": ga.evaluate_population(self.offspring,
                                                       self.config),
        }
        self.stage = "mutate"
        return detail

    def _stage_mutate(self):
        """Roll a die for every gene of every child."""
        self.offspring, rolls = _mutation_with_details(self.offspring,
                                                       self.config)

        mutated_count = 0
        for roll in rolls:
            if roll["mutated"]:
                mutated_count = mutated_count + 1

        detail = {
            "pm": self.config["pm"],
            "method": self.config["mutation_method"],
            "sigma": self.config["mutation_sigma"],
            "bounds_handling": self.config["bounds_handling"],
            "rolls": rolls,
            "mutated_count": mutated_count,
            "offspring": [list(c) for c in self.offspring],
            "offspring_values": ga.evaluate_population(self.offspring,
                                                       self.config),
        }
        self.stage = "elitism"
        return detail

    def _stage_elitism(self):
        """Let the saved elites replace the worst children, if they are better."""
        self.offspring, events = _elitism_with_details(self.offspring,
                                                       self.elites,
                                                       self.config)
        detail = {
            "elite_count": self.config["elite_count"],
            "events": events,
            "offspring": [list(c) for c in self.offspring],
            "offspring_values": ga.evaluate_population(self.offspring,
                                                       self.config),
        }
        self.stage = "commit"
        return detail

    def _stage_commit(self):
        """The children become the new population and the counter moves on."""
        previous_best = self.history_best[-1]

        self.population = self.offspring
        self.offspring = []

        new_values = ga.evaluate_population(self.population, self.config)
        new_best = min(new_values)

        # stopping criterion 1: the generation limit
        if self.generation >= self.config["max_generations"]:
            self.finished = True
            self.stop_reason = "generation limit reached"
        else:
            self.generation = self.generation + 1

        self.values = new_values
        self.stage = "evaluate"

        return {
            "previous_best": previous_best,
            "new_best": new_best,
            "new_average": sum(new_values) / len(new_values),
            "generation": self.generation,
        }

    # -- public stepping ---------------------------------------------------

    def step(self):
        """Run the next single stage and return {stage, detail, snapshot}."""
        if self.finished and self.stage == "evaluate":
            return {"stage": "done", "detail": {}, "snapshot": self.snapshot()}

        stage = self.stage

        if stage == "evaluate":
            detail = self._stage_evaluate()
        elif stage == "select":
            detail = self._stage_select()
        elif stage == "crossover":
            detail = self._stage_crossover()
        elif stage == "mutate":
            detail = self._stage_mutate()
        elif stage == "elitism":
            detail = self._stage_elitism()
        else:
            detail = self._stage_commit()

        # The evaluate stage can decide to stop. Then no breeding happens and
        # the generation is over, exactly like the break inside run_ga.
        if stage == "evaluate" and self.finished:
            self.stage = "evaluate"

        return {"stage": stage, "detail": detail, "snapshot": self.snapshot()}

    def step_generation(self):
        """Run every remaining stage of the current generation."""
        results = []
        guard = 0
        while guard < len(STAGES) + 1:
            guard = guard + 1
            result = self.step()
            if result["stage"] == "done":
                break
            results.append(result)
            if result["stage"] == "commit":
                break
            if self.finished and self.stage == "evaluate":
                break
        return {"stages": results, "snapshot": self.snapshot()}

    def run_generation_fast(self):
        """One whole generation without collecting the animation details.

        Used by the automatic mode, where only the population and the
        convergence curve are drawn.
        """
        result = self.step_generation()
        stages = {}
        for item in result["stages"]:
            stages[item["stage"]] = item["detail"]

        frame = {
            "generation": self.generation,
            "finished": self.finished,
            "stop_reason": self.stop_reason,
            "population": [list(c) for c in self.population],
            "values": list(self.values),
            "history_best": list(self.history_best),
            "history_average": list(self.history_average),
            "best_ever": None if self.best_ever is None else list(self.best_ever),
            "best_ever_value": self.best_ever_value,
            "stagnation_counter": self.stagnation_counter,
            "mutated_count": stages.get("mutate", {}).get("mutated_count", 0),
        }
        return frame
