# 2D Ackley GA presentation

The deliverables are `../2D_Ackley_GA_Presentation.pptx` and the matching PDF.

The presentation contains 26 slides, with an off-cream background, native
PowerPoint text and diagrams, the supplied SVG icons, captioned white-mode
frontend captures, and detailed speaker notes. All authored slide text is
14 pt or larger. Explanatory callouts reveal on click. Slide 20 includes an
animated GIF of the real frontend; use PowerPoint Slide Show to play it.
The PDF is a static preview.

## Evidence

- `data/run.json`: the full default seed-42 run, including every stage.
- `data/summary.json`: exact result, convergence data, and parameter comparison.
- The parameter experiment comprises 9 configurations × 20 seeds (42–61),
  changing one parameter at a time. Six representative configurations appear
  on slide 6. The 100-individual comparison uses more evaluations; no claim of
  equal computation or statistically established superiority is made.
- `ga-web/verify_parity.py` passed all 14 existing configurations.
- Baseline result: `(0.003972697250467887, 0.00031705775953021903)`,
  objective `0.011695092835325216`, distance `0.003985329229405449`.
- The generation-67 average spike is decomposed using the actual generation-66
  crossover, mutation, and elitism records.

## Frontend captures

All algorithm screenshots are rendered by the project's own frontend in light
mode. The browser uses larger text and selected inspector rows for projection;
duplicate explanatory paragraphs are hidden. The algorithm, values, and project
source files are unchanged. The surface and maps are canvas crops from the
frontend. The replay samples evaluated generations 1, 2, 5, 10, 17, 30, 47, 67,
77, and 100; it is a time-lapse, not real elapsed time. Figure captions and speaker
notes distinguish excerpts and explain generation numbering.

## Sources

- Project: `ga_ackley.py`, `ga-web/engine.py`, and `ga-web/static/`.
- [SFU Ackley benchmark](https://www.sfu.ca/~ssurjano/ackley.html).
- [Holland, Adaptation in Natural and Artificial Systems, MIT Press, 1992 edition](https://doi.org/10.7551/mitpress/1090.001.0001).
- [ByteDance IconPark](https://github.com/bytedance/IconPark), Apache 2.0;
  supplied custom icons as documented in `../icons/README.md`.
- Web sources accessed 12 September 2026.

## Rebuild

Python dependencies: python-pptx, Pillow, Flask, Playwright, pywin32. Chrome and
desktop Microsoft PowerPoint are used for capture and final rendering.

1. `python presentation/build_data.py`
2. Start the project Flask app locally on port 5011.
3. `python presentation/capture_frontend.py`
4. `python presentation/build_deck.py`
5. `python presentation/finish_and_render.py`

`build_deck.py` creates a fresh deck. `finish_and_render.py` adds animations,
renders all slides with PowerPoint, exports the PDF, and records text-bound
checks in `layout_audit.json`. Run it after a fresh build to avoid duplicate
animation effects. Preview images are in `preview/`.
