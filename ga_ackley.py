# =============================================================================
#  Genetic Algorithm - Global Minimum of the 2D Ackley Function
#  -------------------------------------------------------------
#  Assignment : GA - find the global minimum of the Ackley function (2D)
#
#  Ackley function (general form):
#       f(x) = -a * exp(-b * sqrt( (1/n) * sum(xi^2) ))
#              - exp( (1/n) * sum(cos(c * xi)) )
#              + a + exp(1)
#
#  With a = 20, b = 0.2, c = 2*pi and n = 2 this is exactly the formula
#  given in the assignment:
#       f(x1,x2) = -20*exp(-0.2*sqrt(0.5*(x1^2+x2^2)))
#                  - exp(0.5*(cos(2*pi*x1)+cos(2*pi*x2)))
#                  + 20 + e
#
#  Known global minimum:  f(0, 0) = 0
#
#  This is a MINIMIZATION problem: a smaller f(x) is better.
#
#  Every parameter lives in the CONFIG dictionary below, so nothing is
#  hard-coded inside the algorithm - just edit CONFIG and re-run.
# =============================================================================

import math
import random
import copy


# =============================================================================
#  1. CONFIGURATION  (all tunable parameters in one place)
# =============================================================================

CONFIG = {
    # ---- Ackley function parameters -----------------------------------
    "a": 20.0,              # amplitude of the exponential "bowl" term
    "b": 0.2,               # decay rate inside the first exponential
    "c": 2 * math.pi,       # frequency of the cosine (ripple) term

    # ---- Search space -------------------------------------------------
    "n_genes": 2,           # number of variables (2 => x1, x2)
    "lower_bound": -5.0,    # smallest allowed value for every gene
    "upper_bound": 5.0,     # largest allowed value for every gene

    # ---- Core GA parameters -------------------------------------------
    "pop_size": 50,         # N : number of chromosomes in the population
    "max_generations": 100, # hard limit on the number of generations
    "pc": 0.80,             # crossover probability (per pair of parents)
    "pm": 0.05,             # mutation probability (per GENE, not per chromosome)
    "elite_count": 1,       # how many best individuals are protected each gen

    # ---- Operator choices (change these strings to swap the algorithm) --
    "selection_method": "roulette",   # "roulette" or "tournament"
    "tournament_size": 3,             # only used when selection is tournament

    "crossover_method": "one_point",  # "one_point", "uniform" or "arithmetic"

    "mutation_method": "gaussian",    # "gaussian" or "uniform"
    "mutation_sigma": 1.0,            # sigma of the Gaussian step (10% of range)

    "bounds_handling": "resample",    # "resample", "clip" or "reflect"

    # ---- Stopping criteria --------------------------------------------
    "stagnation_tolerance": 1e-12,     # improvement below this = "no progress"
    "stagnation_limit": 30,           # stop after this many stagnant gens

    # ---- Reporting / reproducibility ----------------------------------
    "random_seed": 42,      # set to None for a different random run every time
    "print_every": 10,      # print a progress line every N gens (0 = silent)
    "show_plot": True,      # open the convergence plot window
    "save_plot": True,      # also save the plot as a PNG file
    "plot_file": "convergence.png",

    # ---- Optional extra experiment ------------------------------------
    "compare_pc_values": [0.8, 0.7],  # crossover rates compared at the end
    "compare_runs": 5,                # independent runs averaged per rate
}


# =============================================================================
#  2. OBJECTIVE FUNCTION
# =============================================================================

def ackley(chromosome, config):
    """Return the Ackley value f(x) of one chromosome (a list of genes).

    Written in the general n-dimensional form, so the same code still works
    if "n_genes" in CONFIG is changed to 3, 5, 10, ...
    """
    a = config["a"]
    b = config["b"]
    c = config["c"]
    n = len(chromosome)

    # sum of squares and sum of cosines over all genes
    sum_squares = 0.0
    sum_cosines = 0.0
    for gene in chromosome:
        sum_squares = sum_squares + gene * gene
        sum_cosines = sum_cosines + math.cos(c * gene)

    term1 = -a * math.exp(-b * math.sqrt(sum_squares / n))
    term2 = -math.exp(sum_cosines / n)

    return term1 + term2 + a + math.exp(1.0)


# =============================================================================
#  3. INITIALIZATION
# =============================================================================

def create_individual(config):
    """Create one chromosome: every gene drawn uniformly inside the bounds."""
    low = config["lower_bound"]
    high = config["upper_bound"]

    chromosome = []
    for i in range(config["n_genes"]):
        chromosome.append(random.uniform(low, high))
    return chromosome


def create_population(config):
    """Create the starting population of "pop_size" random chromosomes."""
    population = []
    for i in range(config["pop_size"]):
        population.append(create_individual(config))
    return population


def evaluate_population(population, config):
    """Return a list holding the objective value f(x) of every chromosome."""
    values = []
    for chromosome in population:
        values.append(ackley(chromosome, config))
    return values


# =============================================================================
#  4. FITNESS TRANSFORMATION
#     Roulette wheel needs "bigger = better", but we are MINIMIZING f(x),
#     so the values are flipped:      fitness = f_worst - f(x)
#       - the best (lowest f) individual gets the largest fitness
#       - the worst individual gets a fitness of 0
#     f_worst is recomputed fresh in every generation.
# =============================================================================

def objective_to_fitness(values):
    """Turn objective values (lower = better) into fitness (higher = better)."""
    f_worst = max(values)

    fitness = []
    for value in values:
        fitness.append(f_worst - value)
    return fitness


# =============================================================================
#  5. SELECTION
# =============================================================================

def roulette_wheel_selection(population, fitness, pool_size):
    """Classic roulette wheel (fitness proportionate) selection.

    Every individual owns a slice of a wheel sized by its fitness. The wheel
    is spun "pool_size" times, so an individual can be chosen more than once
    (sampling with replacement, which is normal for roulette wheel).
    """
    total_fitness = sum(fitness)

    # cumulative distribution: [f1, f1+f2, f1+f2+f3, ...]
    cumulative = []
    running_total = 0.0
    for f in fitness:
        running_total = running_total + f
        cumulative.append(running_total)

    mating_pool = []
    for i in range(pool_size):
        # Special case: every individual has the same f(x), so every fitness
        # is 0 and the wheel has no slices. Then just pick at random.
        if total_fitness <= 0.0:
            pick = random.randrange(len(population))
            mating_pool.append(list(population[pick]))
            continue

        spin = random.uniform(0.0, total_fitness)

        # walk along the cumulative list until we pass the spin value
        for index in range(len(cumulative)):
            if spin <= cumulative[index]:
                mating_pool.append(list(population[index]))
                break

    return mating_pool


def tournament_selection(population, values, pool_size, config):
    """Alternative selection: pick k random individuals, keep the best one.

    This works on the raw objective values (lowest f(x) wins), so it needs
    no fitness transformation.
    """
    k = config["tournament_size"]

    mating_pool = []
    for i in range(pool_size):
        best_index = random.randrange(len(population))
        for j in range(k - 1):
            challenger = random.randrange(len(population))
            if values[challenger] < values[best_index]:
                best_index = challenger
        mating_pool.append(list(population[best_index]))
    return mating_pool


def select_parents(population, values, fitness, pool_size, config):
    """Call the selection method chosen in CONFIG."""
    method = config["selection_method"]

    if method == "roulette":
        return roulette_wheel_selection(population, fitness, pool_size)
    elif method == "tournament":
        return tournament_selection(population, values, pool_size, config)
    else:
        raise ValueError("Unknown selection_method: " + str(method))


# =============================================================================
#  6. CROSSOVER
# =============================================================================

def one_point_crossover(parent_a, parent_b):
    """1-point crossover: cut both parents at the same point and swap tails.

    A 2-gene chromosome has only one possible cut point, between gene 1 and
    gene 2, so this becomes:
        child1 = [A.x1, B.x2]
        child2 = [B.x1, A.x2]
    """
    n = len(parent_a)
    point = random.randint(1, n - 1)      # cut position: 1 .. n-1

    child1 = parent_a[0:point] + parent_b[point:n]
    child2 = parent_b[0:point] + parent_a[point:n]
    return child1, child2


def uniform_crossover(parent_a, parent_b):
    """Uniform crossover: decide gene by gene which parent it comes from."""
    child1 = []
    child2 = []
    for i in range(len(parent_a)):
        if random.random() < 0.5:
            child1.append(parent_a[i])
            child2.append(parent_b[i])
        else:
            child1.append(parent_b[i])
            child2.append(parent_a[i])
    return child1, child2


def arithmetic_crossover(parent_a, parent_b):
    """Arithmetic (blend) crossover: children are weighted averages."""
    alpha = random.random()

    child1 = []
    child2 = []
    for i in range(len(parent_a)):
        child1.append(alpha * parent_a[i] + (1.0 - alpha) * parent_b[i])
        child2.append(alpha * parent_b[i] + (1.0 - alpha) * parent_a[i])
    return child1, child2


def do_crossover(parent_a, parent_b, config):
    """Apply crossover with probability Pc, otherwise copy the parents."""
    if random.random() > config["pc"]:
        # no crossover this time - the children are plain copies
        return list(parent_a), list(parent_b)

    method = config["crossover_method"]

    if method == "one_point":
        return one_point_crossover(parent_a, parent_b)
    elif method == "uniform":
        return uniform_crossover(parent_a, parent_b)
    elif method == "arithmetic":
        return arithmetic_crossover(parent_a, parent_b)
    else:
        raise ValueError("Unknown crossover_method: " + str(method))


def crossover_population(mating_pool, config):
    """Pair the mating pool sequentially (1,2) (3,4) ... and breed offspring.

    The mating pool is the same size as the population (an even number), so
    every individual gets a partner and nobody is left over. The draw order
    from the roulette wheel is already random, so no extra shuffle is needed.
    """
    offspring = []
    for i in range(0, len(mating_pool) - 1, 2):
        parent_a = mating_pool[i]
        parent_b = mating_pool[i + 1]
        child1, child2 = do_crossover(parent_a, parent_b, config)
        offspring.append(child1)
        offspring.append(child2)

    # safety net for an odd pool size (never happens with the default setup)
    if len(mating_pool) % 2 == 1:
        offspring.append(list(mating_pool[-1]))

    return offspring


# =============================================================================
#  7. MUTATION
# =============================================================================

def repair_gene(value, old_value, config):
    """Bring an out-of-bounds gene back inside [lower_bound, upper_bound]."""
    low = config["lower_bound"]
    high = config["upper_bound"]

    if low <= value <= high:
        return value                      # already legal, nothing to repair

    method = config["bounds_handling"]

    if method == "resample":
        # throw the illegal value away and draw a completely fresh gene
        return random.uniform(low, high)
    elif method == "clip":
        # push the value onto the nearest boundary
        if value < low:
            return low
        return high
    elif method == "reflect":
        # bounce the overshoot back inside the interval
        if value < low:
            value = low + (low - value)
        else:
            value = high - (value - high)
        # if it bounced out the other side, keep the old value instead
        if low <= value <= high:
            return value
        return old_value
    else:
        raise ValueError("Unknown bounds_handling: " + str(method))


def mutate_gene(value, config):
    """Return the mutated value of a single gene."""
    method = config["mutation_method"]

    if method == "gaussian":
        # small random nudge around the current value: value + N(0, sigma)
        new_value = value + random.gauss(0.0, config["mutation_sigma"])
    elif method == "uniform":
        # forget the current value and jump anywhere in the search space
        new_value = random.uniform(config["lower_bound"], config["upper_bound"])
    else:
        raise ValueError("Unknown mutation_method: " + str(method))

    return repair_gene(new_value, value, config)


def mutate_population(offspring, config):
    """Walk over every gene of every offspring and mutate it with prob. Pm."""
    pm = config["pm"]

    for chromosome in offspring:
        for i in range(len(chromosome)):
            if random.random() <= pm:
                chromosome[i] = mutate_gene(chromosome[i], config)

    return offspring


# =============================================================================
#  8. ELITISM
#     The elites of the old generation replace the worst offspring of the new
#     generation, but only when they are actually better. This stops the best
#     solution from ever being lost, and it keeps the mating pool at the full
#     (even) population size so the sequential pairing stays simple.
# =============================================================================

def get_elites(population, values, config):
    """Return deep copies of the "elite_count" best chromosomes."""
    # population indices sorted by objective value, best (lowest) first
    order = sorted(range(len(population)), key=lambda i: values[i])

    elites = []
    for rank in range(config["elite_count"]):
        if rank < len(order):
            elites.append(copy.deepcopy(population[order[rank]]))
    return elites


def apply_elitism(offspring, elites, config):
    """Insert each elite into the new population if it beats the worst member."""
    if len(elites) == 0:
        return offspring

    offspring_values = evaluate_population(offspring, config)

    for elite in elites:
        elite_value = ackley(elite, config)

        # find the currently worst (highest f) offspring
        worst_index = 0
        for i in range(len(offspring_values)):
            if offspring_values[i] > offspring_values[worst_index]:
                worst_index = i

        # replace it only if the elite is genuinely better
        if elite_value < offspring_values[worst_index]:
            offspring[worst_index] = copy.deepcopy(elite)
            offspring_values[worst_index] = elite_value

    return offspring


# =============================================================================
#  9. THE MAIN GA LOOP
# =============================================================================

def run_ga(config, verbose=True):
    """Run the genetic algorithm once and return a dictionary of results."""

    # --- step 0: reproducible randomness (optional) --------------------
    if config["random_seed"] is not None:
        random.seed(config["random_seed"])

    # --- step 1: initial population ------------------------------------
    population = create_population(config)

    best_ever = None            # best chromosome seen so far
    best_ever_value = None      # its objective value
    stagnation_counter = 0      # generations without meaningful improvement
    stop_reason = "generation limit reached"

    history_best = []           # best f(x) of each generation (for the plot)
    history_average = []        # average f(x) of each generation

    # --- step 2: evolve -------------------------------------------------
    for generation in range(1, config["max_generations"] + 1):

        # (a) evaluate the whole population
        values = evaluate_population(population, config)

        # (b) who is the best individual of this generation?
        best_index = 0
        for i in range(len(values)):
            if values[i] < values[best_index]:
                best_index = i
        current_best_value = values[best_index]
        current_best = population[best_index]

        history_best.append(current_best_value)
        history_average.append(sum(values) / len(values))

        # (c) update the best-ever solution and the stagnation counter
        if best_ever_value is None:
            best_ever = copy.deepcopy(current_best)
            best_ever_value = current_best_value
            stagnation_counter = 0
        else:
            improvement = best_ever_value - current_best_value
            if improvement > config["stagnation_tolerance"]:
                # real progress -> store it and reset the counter
                best_ever = copy.deepcopy(current_best)
                best_ever_value = current_best_value
                stagnation_counter = 0
            else:
                # no meaningful progress in this generation
                stagnation_counter = stagnation_counter + 1
                # still keep the tiny improvement if there was one
                if current_best_value < best_ever_value:
                    best_ever = copy.deepcopy(current_best)
                    best_ever_value = current_best_value

        # optional progress line
        if verbose and config["print_every"] > 0:
            if generation == 1 or generation % config["print_every"] == 0:
                print("  gen %3d | best f(x) = %.6e | avg f(x) = %.4f"
                      % (generation, current_best_value, history_average[-1]))

        # (d) stopping criterion 2: too many stagnant generations
        if stagnation_counter >= config["stagnation_limit"]:
            stop_reason = ("no improvement > %g for %d consecutive generations"
                           % (config["stagnation_tolerance"],
                              config["stagnation_limit"]))
            break

        # (e) keep the elites of this generation safe
        elites = get_elites(population, values, config)

        # (f) fitness transformation (lower f(x) -> higher fitness)
        fitness = objective_to_fitness(values)

        # (g) selection: mating pool of the same size as the population
        mating_pool = select_parents(population, values, fitness,
                                     config["pop_size"], config)

        # (h) crossover: sequential pairing -> pop_size offspring
        offspring = crossover_population(mating_pool, config)

        # (i) mutation: per gene, with bounds repair
        offspring = mutate_population(offspring, config)

        # (j) elitism: elites replace the worst offspring if they are better
        offspring = apply_elitism(offspring, elites, config)

        # (k) the offspring become the next generation
        population = offspring

    # --- step 3: pack up the results ------------------------------------
    results = {
        "best_chromosome": best_ever,
        "best_value": best_ever_value,
        "generations_run": len(history_best),
        "stop_reason": stop_reason,
        "history_best": history_best,
        "history_average": history_average,
    }
    return results


# =============================================================================
#  10. REPORTING HELPERS
# =============================================================================

def print_report(results, config):
    """Print the final answer plus the analysis notes asked for in the task."""
    best = results["best_chromosome"]
    value = results["best_value"]

    distance = 0.0
    for gene in best:
        distance = distance + gene * gene
    distance = math.sqrt(distance)

    print("")
    print("=" * 68)
    print(" RESULT")
    print("=" * 68)
    print(" generations run   : %d" % results["generations_run"])
    print(" stopped because   : %s" % results["stop_reason"])
    print("")
    for i in range(len(best)):
        name = "x" + str(i + 1)
        print(" %-17s = %+.8f      (target 0)" % (name, best[i]))
    print(" %-17s = %.10e  (target 0)" % ("f(x)", value))
    print(" %-17s = %.8f" % ("distance to (0,0)", distance))
    print("")

    # did we get close enough to the known global minimum?
    if value < 1e-3:
        print(" Verdict: SUCCESS - f(x) < 1e-3, converged to the global minimum.")
    elif value < 1.0:
        print(" Verdict: CLOSE - inside the global basin but not within 1e-3.")
    else:
        print(" Verdict: STUCK in a local minimum (Ackley has very many).")

    # --- early vs. late behaviour (generation 5 against the rest) -------
    history = results["history_best"]
    print("")
    print("-" * 68)
    print(" EARLY vs LATE PROGRESS")
    print("-" * 68)
    for g in [1, 5, 10, 25, 50, 100]:
        if g <= len(history):
            print("  best f(x) after generation %3d : %.6e" % (g, history[g - 1]))

    if len(history) >= 5:
        early_drop = history[0] - history[4]         # generation 1 -> 5
        late_drop = history[4] - history[-1]         # generation 5 -> end
        total_drop = history[0] - history[-1]
        if total_drop > 0:
            print("")
            print("  drop during generations 1-5 : %.4f  (%.1f%% of total)"
                  % (early_drop, 100.0 * early_drop / total_drop))
            print("  drop after generation 5     : %.4f  (%.1f%% of total)"
                  % (late_drop, 100.0 * late_drop / total_drop))
            print("")
            print("  Observation: the first few generations remove most of the")
            print("  error (a drastic early change), after that the curve")
            print("  flattens and improves only in small steps while the")
            print("  population fine-tunes around the global minimum.")


def plot_convergence(results, config):
    """Draw best and average f(x) against the generation number."""
    try:
        import matplotlib.pyplot as plt
    except ImportError:
        print("")
        print(" matplotlib is not installed - skipping the convergence plot.")
        print(" install it with:  pip install matplotlib")
        return

    generations = list(range(1, len(results["history_best"]) + 1))

    figure, axes = plt.subplots(1, 2, figsize=(11, 4.5))

    # left plot: normal (linear) scale
    axes[0].plot(generations, results["history_best"], label="best f(x)")
    axes[0].plot(generations, results["history_average"], label="average f(x)")
    axes[0].set_xlabel("generation")
    axes[0].set_ylabel("Ackley value f(x)")
    axes[0].set_title("Convergence (linear scale)")
    axes[0].legend()
    axes[0].grid(True)

    # right plot: log scale, so the tiny late improvements stay visible
    axes[1].semilogy(generations, results["history_best"], label="best f(x)")
    axes[1].set_xlabel("generation")
    axes[1].set_ylabel("Ackley value f(x)  (log scale)")
    axes[1].set_title("Convergence (log scale)")
    axes[1].legend()
    axes[1].grid(True, which="both")

    figure.suptitle("GA on the 2D Ackley function - global minimum f(0,0) = 0")
    figure.tight_layout()

    if config["save_plot"]:
        figure.savefig(config["plot_file"], dpi=120)
        print("")
        print(" convergence plot saved to: %s" % config["plot_file"])

    if config["show_plot"]:
        plt.show()
    else:
        plt.close(figure)


def compare_crossover_rates(config):
    """Optional experiment: is Pc = 80% really better than Pc = 70%?

    Each crossover rate is run "compare_runs" times with different seeds and
    the results are averaged, because a single GA run is very noisy.
    """
    rates = config["compare_pc_values"]
    runs = config["compare_runs"]

    if len(rates) == 0 or runs < 1:
        return

    print("")
    print("=" * 68)
    print(" EXTRA EXPERIMENT: effect of the crossover probability Pc")
    print(" (%d independent runs per value, averaged)" % runs)
    print("=" * 68)
    print(" %-6s %-18s %-18s %-10s"
          % ("Pc", "avg best f(x)", "best of all runs", "avg gens"))

    for rate in rates:
        total_value = 0.0
        total_generations = 0
        best_of_all = None

        for run in range(runs):
            # copy the settings so the main configuration stays untouched
            trial = dict(config)
            trial["pc"] = rate
            trial["random_seed"] = 1000 + run    # same seeds for every rate
            trial["print_every"] = 0

            result = run_ga(trial, verbose=False)

            total_value = total_value + result["best_value"]
            total_generations = total_generations + result["generations_run"]
            if best_of_all is None or result["best_value"] < best_of_all:
                best_of_all = result["best_value"]

        print(" %-6.2f %-18.6e %-18.6e %-10.1f"
              % (rate, total_value / runs, best_of_all,
                 float(total_generations) / runs))


# =============================================================================
#  11. ENTRY POINT
# =============================================================================

def main():
    print("=" * 68)
    print(" GENETIC ALGORITHM - 2D ACKLEY FUNCTION MINIMIZATION")
    print("=" * 68)
    print(" population        : %d" % CONFIG["pop_size"])
    print(" max generations   : %d" % CONFIG["max_generations"])
    print(" crossover (Pc)    : %.0f%% (%s)"
          % (100 * CONFIG["pc"], CONFIG["crossover_method"]))
    print(" mutation  (Pm)    : %.0f%% per gene (%s, sigma = %.2f)"
          % (100 * CONFIG["pm"], CONFIG["mutation_method"],
             CONFIG["mutation_sigma"]))
    print(" selection         : %s" % CONFIG["selection_method"])
    print(" elitism           : %d" % CONFIG["elite_count"])
    print(" search space      : [%.1f, %.1f] for each of %d variables"
          % (CONFIG["lower_bound"], CONFIG["upper_bound"], CONFIG["n_genes"]))
    print(" out of bounds     : %s" % CONFIG["bounds_handling"])
    print(" stop when         : %d gens, or improvement < %g for %d gens"
          % (CONFIG["max_generations"], CONFIG["stagnation_tolerance"],
             CONFIG["stagnation_limit"]))
    print("-" * 68)

    results = run_ga(CONFIG)
    print_report(results, CONFIG)
    compare_crossover_rates(CONFIG)
    plot_convergence(results, CONFIG)


if __name__ == "__main__":
    main()
