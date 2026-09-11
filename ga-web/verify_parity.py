# =============================================================================
#  verify_parity.py - proof that the web backend and the CLI agree
#  ---------------------------------------------------------------------------
#  The engine used by the web page repeats some of ga_ackley.py's operators so
#  it can record what happened. This script checks that the repetition is
#  faithful: for the same seed and the same settings, driving the engine stage
#  by stage must produce exactly the same numbers as ga_ackley.run_ga.
#
#  Run it with:  python verify_parity.py
# =============================================================================

import engine
import ga_ackley as ga


def run_engine(config):
    """Drive the stepwise engine until it stops, like the browser would."""
    machine = engine.GAEngine(config)
    guard = 0
    while not machine.finished and guard < 20000:
        guard = guard + 1
        machine.step()
    return machine


def compare(name, overrides):
    """Run both implementations with the same settings and compare them."""
    config = engine.build_config(overrides)

    cli = ga.run_ga(config, verbose=False)       # the original code
    web = run_engine(config)                     # the stepwise engine

    same_value = abs(cli["best_value"] - web.best_ever_value) < 1e-12
    same_length = len(cli["history_best"]) == len(web.history_best)

    same_history = same_length
    if same_length:
        for i in range(len(cli["history_best"])):
            if abs(cli["history_best"][i] - web.history_best[i]) > 1e-12:
                same_history = False
                break

    same_point = True
    for i in range(len(cli["best_chromosome"])):
        if abs(cli["best_chromosome"][i] - web.best_ever[i]) > 1e-12:
            same_point = False

    ok = same_value and same_history and same_point
    print(" %-34s %s   cli=%.6e  web=%.6e  gens %d/%d"
          % (name, "MATCH  " if ok else "DIFFER!",
             cli["best_value"], web.best_ever_value,
             len(cli["history_best"]), len(web.history_best)))
    return ok


def main():
    print("")
    print(" comparing ga_ackley.run_ga  vs  the stepwise web engine")
    print(" " + "-" * 66)

    checks = []
    checks.append(compare("defaults", {}))
    checks.append(compare("seed 7", {"random_seed": 7}))
    checks.append(compare("tournament selection",
                          {"selection_method": "tournament"}))
    checks.append(compare("uniform crossover",
                          {"crossover_method": "uniform"}))
    checks.append(compare("arithmetic crossover",
                          {"crossover_method": "arithmetic"}))
    checks.append(compare("uniform mutation",
                          {"mutation_method": "uniform"}))
    checks.append(compare("clip bounds", {"bounds_handling": "clip"}))
    checks.append(compare("reflect bounds", {"bounds_handling": "reflect"}))
    checks.append(compare("high mutation rate", {"pm": 0.5}))
    checks.append(compare("5 elites", {"elite_count": 5}))
    checks.append(compare("no elites", {"elite_count": 0}))
    checks.append(compare("long run",
                          {"stagnation_limit": 1000, "max_generations": 200}))
    checks.append(compare("big population", {"pop_size": 120}))
    checks.append(compare("wide bounds",
                          {"lower_bound": -32.768, "upper_bound": 32.768,
                           "mutation_sigma": 6.5}))

    print(" " + "-" * 66)
    passed = 0
    for ok in checks:
        if ok:
            passed = passed + 1
    print(" %d of %d configurations match exactly" % (passed, len(checks)))
    print("")


if __name__ == "__main__":
    main()
