/* =========================================================================
   stages.js - the generation inspector

   One generation is six stages:

     1 evaluate   score everybody, pick the elite
     2 select     roulette wheel (shown as a sliding tape) -> mating pool
     3 crossover  pair the pool, cut and swap genes -> children
     4 mutate     roll a die per gene, nudge the gene
     5 elitism    the saved elite replaces the worst child if it is better
     6 commit     the children become the new population

   In "one step at a time" mode each stage is animated item by item.
   In "whole generation" mode all six panels are rendered at once, finished.
   ========================================================================= */

var Stages = {

  token: 0,            // bumped on every new render so old animations stop
  skip: false,
  host: null,
  speed: 190,
  onDone: null,        // called when an animation finishes

  init: function (host) { this.host = host; },

  /* ------------------------------------------------------------------ */

  stop: function () { this.token = this.token + 1; },

  clear: function () {
    this.stop();
    this.host.innerHTML = '';
  },

  empty: function (message) {
    this.stop();
    this.host.innerHTML = '<div class="empty">' + message + '</div>';
  },

  /* ============================ helpers ============================= */

  num: function (value, digits) {
    if (value === null || value === undefined) { return '-'; }
    if (digits === undefined) { digits = 4; }
    if (Math.abs(value) !== 0 && Math.abs(value) < 1e-4) {
      return value.toExponential(2);
    }
    return value.toFixed(digits);
  },

  point: function (chromosome) {
    return '(' + this.num(chromosome[0], 3) + ', ' + this.num(chromosome[1], 3) + ')';
  },

  panel: function (index, title, tag, explain) {
    var node = document.createElement('div');
    node.className = 'stage';
    node.innerHTML =
      '<header><span class="n">' + index + '</span><h3>' + title + '</h3>' +
      '<span class="tag">' + (tag || '') + '</span></header>' +
      '<div class="body">' +
      (explain ? '<p class="explain">' + explain + '</p>' : '') +
      '</div>';
    node.body = node.querySelector('.body');
    return node;
  },

  sleep: function (ms) {
    if (this.skip) { ms = 0; }
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  },

  alive: function (token) { return token === this.token; },

  /* gene chip element */
  chip: function (value, cls) {
    return '<div class="gene ' + (cls || '') + '">' + this.num(value, 4) + '</div>';
  },

  /* which parent each child gene came from, for colouring */
  geneSources: function (pair, n) {
    var c1 = [], c2 = [], i;
    if (!pair.applied) {
      for (i = 0; i < n; i++) { c1.push('from-a'); c2.push('from-b'); }
    } else if (pair.point !== null && pair.point !== undefined) {
      for (i = 0; i < n; i++) {
        c1.push(i < pair.point ? 'from-a' : 'from-b');
        c2.push(i < pair.point ? 'from-b' : 'from-a');
      }
    } else if (pair.gene_from_a) {
      for (i = 0; i < n; i++) {
        c1.push(pair.gene_from_a[i] ? 'from-a' : 'from-b');
        c2.push(pair.gene_from_a[i] ? 'from-b' : 'from-a');
      }
    } else {
      for (i = 0; i < n; i++) { c1.push(''); c2.push(''); }
    }
    return [c1, c2];
  },

  /* ====================================================================
     entry point 1 : ONE STAGE (optionally animated)
     ==================================================================== */

  showStage: function (stage, detail, snapshot, opts) {
    this.token = this.token + 1;
    var token = this.token;
    this.skip = false;
    this.speed = opts.speed;
    this.host.innerHTML = '';

    var animate = opts.animate;

    if (stage === 'evaluate') {
      this.host.appendChild(this.buildEvaluate(detail, snapshot));
      this.paintEvaluate(detail, snapshot);
      return Promise.resolve();
    }
    if (stage === 'select') {
      return this.runSelect(detail, snapshot, animate, token);
    }
    if (stage === 'crossover') {
      return this.runCrossover(detail, snapshot, animate, token);
    }
    if (stage === 'mutate') {
      return this.runMutate(detail, snapshot, animate, token);
    }
    if (stage === 'elitism') {
      return this.runElitism(detail, snapshot, animate, token);
    }
    if (stage === 'commit') {
      this.host.appendChild(this.buildCommit(detail, snapshot));
      this.paintCommit(snapshot);
      return Promise.resolve();
    }
    return Promise.resolve();
  },

  /* ====================================================================
     entry point 2 : WHOLE GENERATION, no animation
     ==================================================================== */

  showGeneration: function (stageList, snapshot) {
    this.token = this.token + 1;
    this.host.innerHTML = '';

    for (var i = 0; i < stageList.length; i++) {
      var item = stageList[i];
      var stage = item.stage;
      var detail = item.detail;
      // Every stage carries the snapshot taken while it ran, so the tables
      // show the population that stage actually worked on (the final
      // snapshot already holds the NEXT generation).
      var shot = item.snapshot || snapshot;

      if (stage === 'evaluate') {
        this.host.appendChild(this.buildEvaluate(detail, shot));
      } else if (stage === 'select') {
        this.host.appendChild(this.buildSelect(detail, shot, true));
      } else if (stage === 'crossover') {
        this.host.appendChild(this.buildCrossover(detail, shot, true));
      } else if (stage === 'mutate') {
        this.host.appendChild(this.buildMutate(detail, shot, true));
      } else if (stage === 'elitism') {
        this.host.appendChild(this.buildElitism(detail, shot, true));
      } else if (stage === 'commit') {
        this.host.appendChild(this.buildCommit(detail, snapshot));
      }
    }

    // the map shows the freshly committed population
    this.paintCommit(snapshot);
  },

  /* ====================================================================
     1. EVALUATE
     ==================================================================== */

  buildEvaluate: function (detail, snapshot) {
    var node = this.panel(1, 'Evaluate &amp; rank', 'population ' + detail.values.length,
      'Every chromosome is scored with f(x). Roulette wheel needs ' +
      '"bigger = better", so the scores are flipped into fitness = f_worst - f(x).');

    var pop = snapshot.population;
    var html = '<div class="kv">' +
      '<div>best f(x)<b>' + this.num(detail.best_value, 6) + '</b></div>' +
      '<div>average<b>' + this.num(detail.average_value, 4) + '</b></div>' +
      '<div>f_worst<b>' + this.num(detail.f_worst, 4) + '</b></div>' +
      '<div>stagnation<b>' + detail.stagnation_counter + ' / ' +
        snapshot.stagnation_limit + '</b></div>' +
      '</div>';

    // the fitness table (sorted best first so the elite is on top)
    var order = [];
    for (var i = 0; i < detail.values.length; i++) { order.push(i); }
    order.sort(function (A, B) { return detail.values[A] - detail.values[B]; });

    var maxFit = 0;
    for (var k = 0; k < detail.fitness.length; k++) {
      if (detail.fitness[k] > maxFit) { maxFit = detail.fitness[k]; }
    }

    html += '<div class="scroll"><table class="grid">' +
      '<tr><th class="l">#</th><th>x1</th><th>x2</th><th>f(x)</th>' +
      '<th>fitness</th><th class="l">share</th></tr>';
    for (var r = 0; r < order.length; r++) {
      var idx = order[r];
      var cls = '';
      if (idx === detail.best_index) { cls = 'best'; }
      if (idx === detail.worst_index) { cls = 'worst'; }
      if (detail.elite_indices.indexOf(idx) >= 0) { cls += ' elite'; }
      var share = maxFit > 0 ? (detail.fitness[idx] / maxFit * 100) : 0;
      html += '<tr class="' + cls + '"><td class="l">' + idx + '</td>' +
        '<td>' + this.num(pop[idx][0], 3) + '</td>' +
        '<td>' + this.num(pop[idx][1], 3) + '</td>' +
        '<td>' + this.num(detail.values[idx], 4) + '</td>' +
        '<td>' + this.num(detail.fitness[idx], 3) + '</td>' +
        '<td class="l"><div class="bar"><i style="width:' + share.toFixed(1) +
        '%"></i></div></td></tr>';
    }
    html += '</table></div>';

    html += '<div class="kv" style="margin-top:8px">' +
      '<div><span class="badge ok">green bar</span> elite (kept)</div>' +
      '<div><span class="badge">gold row</span> best</div>' +
      '<div><span class="badge oob">red row</span> worst, fitness 0</div></div>';

    if (detail.stopped) {
      html += '<p class="explain" style="color:var(--accent-2)">Stopping criterion ' +
        'met - the run ends here, no breeding happens this generation.</p>';
    }

    node.body.innerHTML += html;
    return node;
  },

  paintEvaluate: function (detail, snapshot) {
    Landscape.setData({
      population: snapshot.population,
      values: detail.values,
      bestIndex: detail.best_index,
      worstIndex: detail.worst_index,
      eliteIndices: detail.elite_indices
    });
    Landscape.setOverlay({});
  },

  /* ====================================================================
     2. SELECT  (roulette wheel as a sliding tape)
     ==================================================================== */

  buildSelect: function (detail, snapshot, finished) {
    var isRoulette = (detail.kind === 'roulette');
    var node = this.panel(2, isRoulette ? 'Selection - roulette wheel'
                                        : 'Selection - tournament',
      'mating pool ' + detail.draws.length,
      isRoulette
        ? 'The wheel is unrolled into a tape: every individual owns a slice as ' +
          'wide as its fitness. The needle lands on a random spot, the slice ' +
          'under it is copied into the mating pool. Fitter individuals are ' +
          'wider targets, so they get picked more often.'
        : 'For every slot, ' + detail.tournament_size + ' individuals are drawn ' +
          'at random and the one with the lowest f(x) wins the slot.');

    var html = '';

    if (isRoulette) {
      html += '<div class="tape-box">' +
        '<div class="spinline" id="spinline">needle: <b>-</b></div>' +
        '<div class="tape" id="tape">';
      var total = detail.total_fitness || 1;
      for (var i = 0; i < detail.cumulative.length; i++) {
        var fit = detail.cumulative[i] - (i > 0 ? detail.cumulative[i - 1] : 0);
        var pct = (fit / total) * 100;
        var hue = (i * 37) % 360;
        html += '<div class="seg-i" data-i="' + i + '" title="#' + i +
          '" style="width:' + pct + '%;background:hsl(' + hue + ',42%,34%)"></div>';
      }
      // the needle lives inside the tape, so its position is a % of the tape
      html += '<div class="tape-head" id="tapehead" style="left:0%"></div></div>';
      html += '<div class="tape-scale"><span>0</span><span>total fitness ' +
        this.num(detail.total_fitness, 2) + '</span></div>';
      html += '</div>';
    }

    html += '<div class="kv"><div>slots filled<b id="poolcount">' +
      (finished ? detail.draws.length : 0) + '</b></div>' +
      '<div>pool size<b>' + detail.draws.length + '</b></div></div>';

    html += '<div class="poolwrap" id="poolwrap"></div>';

    // how often each individual was picked
    html += '<div id="counts"></div>';

    node.body.innerHTML += html;

    if (finished) {
      // fill everything in at once
      var wrap = node.querySelector('#poolwrap');
      var chips = '';
      for (var d = 0; d < detail.draws.length; d++) {
        chips += '<span class="chip">#' + detail.draws[d].index + '</span>';
      }
      wrap.innerHTML = chips;
      // grey out the slices nobody landed on, and park the needle on the
      // last spin so the tape still shows how it was used
      var segs = node.querySelectorAll('.seg-i');
      for (var s = 0; s < segs.length; s++) {
        if (!detail.counts || !detail.counts[s]) { segs[s].classList.add('cold'); }
      }
      var head = node.querySelector('#tapehead');
      var line = node.querySelector('#spinline');
      var lastSpin = detail.draws.length
        ? detail.draws[detail.draws.length - 1].spin : null;
      if (head && lastSpin !== null && lastSpin !== undefined) {
        head.style.left = (lastSpin / (detail.total_fitness || 1) * 100) + '%';
        if (line) {
          line.innerHTML = detail.draws.length + ' spins done &middot; last needle: <b>' +
            this.num(lastSpin, 3) + '</b> &rarr; slice <b>#' +
            detail.draws[detail.draws.length - 1].index +
            '</b> &middot; grey slices were never hit';
        }
      }
      node.querySelector('#counts').innerHTML = this.countsHtml(detail, snapshot);
    }

    return node;
  },

  countsHtml: function (detail, snapshot) {
    var counts = detail.counts || [];
    var order = [];
    for (var i = 0; i < counts.length; i++) { order.push(i); }
    order.sort(function (A, B) { return counts[B] - counts[A]; });

    var html = '<table class="grid" style="margin-top:8px">' +
      '<tr><th class="l">most picked</th><th>times</th><th>f(x)</th>' +
      '<th class="l">point</th></tr>';
    var shown = Math.min(6, order.length);
    for (var r = 0; r < shown; r++) {
      var idx = order[r];
      if (!counts[idx]) { break; }
      html += '<tr><td class="l">#' + idx + '</td><td>' + counts[idx] + '</td>' +
        '<td>' + this.num(snapshot.values[idx], 4) + '</td>' +
        '<td class="l">' + this.point(snapshot.population[idx]) + '</td></tr>';
    }
    var never = 0;
    for (var k = 0; k < counts.length; k++) { if (!counts[k]) { never++; } }
    html += '</table><p class="explain" style="margin-top:6px">' + never +
      ' individuals were never picked and die out here.</p>';
    return html;
  },

  runSelect: function (detail, snapshot, animate, token) {
    var self = this;
    var node = this.buildSelect(detail, snapshot, !animate);
    this.host.appendChild(node);

    // the map: population with halos sized by how often each one is picked
    Landscape.setData({
      population: snapshot.population,
      values: snapshot.values,
      bestIndex: -1, worstIndex: -1, eliteIndices: []
    });

    if (!animate) {
      Landscape.setOverlay({ pickCounts: detail.counts });
      return Promise.resolve();
    }

    var head = node.querySelector('#tapehead');
    var spinline = node.querySelector('#spinline');
    var wrap = node.querySelector('#poolwrap');
    var counter = node.querySelector('#poolcount');
    var segs = node.querySelectorAll('.seg-i');
    var total = detail.total_fitness || 1;
    var running = [];
    for (var z = 0; z < snapshot.population.length; z++) { running.push(0); }

    var step = function (i) {
      if (!self.alive(token)) { return Promise.resolve(); }
      if (i >= detail.draws.length) {
        node.querySelector('#counts').innerHTML = self.countsHtml(detail, snapshot);
        Landscape.setOverlay({ pickCounts: detail.counts });
        return Promise.resolve();
      }

      var draw = detail.draws[i];
      var picked = draw.index;
      running[picked] = running[picked] + 1;

      if (head && draw.spin !== null) {
        head.style.left = (draw.spin / total * 100) + '%';
        spinline.innerHTML = 'needle: <b>' + self.num(draw.spin, 3) +
          '</b> of ' + self.num(total, 2) + '  &rarr;  slice <b>#' + picked + '</b>';
      } else if (spinline) {
        spinline.innerHTML = 'slot ' + i + ' winner: <b>#' + picked + '</b>' +
          (draw.contenders ? '  (from ' + draw.contenders.join(', ') + ')' : '');
      }

      for (var s = 0; s < segs.length; s++) { segs[s].classList.remove('hit'); }
      if (segs[picked]) { segs[picked].classList.add('hit'); }

      var chip = document.createElement('span');
      chip.className = 'chip fresh';
      chip.textContent = '#' + picked;
      wrap.appendChild(chip);
      counter.textContent = String(i + 1);
      wrap.scrollTop = wrap.scrollHeight;

      // flash the chosen individual on the map
      Landscape.setOverlay({
        pickCounts: running.slice(),
        marks: [{ at: snapshot.population[picked], shape: 'ring', r: 11,
                  color: '#ffd166', label: '#' + picked }]
      });

      return self.sleep(Math.max(12, self.speed * 0.45)).then(function () {
        return step(i + 1);
      });
    };

    return step(0);
  },

  /* ====================================================================
     3. CROSSOVER
     ==================================================================== */

  buildCrossover: function (detail, snapshot, finished) {
    var names = { one_point: '1-point', uniform: 'uniform', arithmetic: 'arithmetic' };
    var how = {
      one_point: 'both parents are cut at the same point and their tails are swapped',
      uniform: 'every gene is taken from one parent or the other, decided per gene',
      arithmetic: 'the children are weighted averages of the parents, weight alpha'
    };
    var node = this.panel(3, 'Crossover - ' + (names[detail.method] || detail.method),
      detail.pairs.length + ' pairs',
      'The mating pool is paired up in draw order: (1,2) (3,4) ... For every ' +
      'pair a number r is drawn. If r &le; Pc = ' + detail.pc + ' then ' +
      (how[detail.method] || 'the parents are recombined') +
      ', otherwise the children are plain copies of the parents.');

    var holder = document.createElement('div');
    holder.id = 'pairs';
    node.body.appendChild(holder);

    if (finished) {
      for (var i = 0; i < detail.pairs.length; i++) {
        holder.appendChild(this.pairBox(detail.pairs[i], i, detail, false));
      }
    }
    return node;
  },

  pairBox: function (pair, index, detail, isNow) {
    var box = document.createElement('div');
    box.className = 'pairbox' + (isNow ? ' now' : '');
    var n = pair.parent_a.length;
    var sources = this.geneSources(pair, n);

    var head = 'pair ' + (index + 1) + ' &middot; slots ' + pair.slot_a + ',' +
      pair.slot_b + ' (from #' + pair.source_a + ', #' + pair.source_b + ')' +
      ' <span class="dice">r = ' + this.num(pair.r, 4) + '</span> ' +
      (pair.applied
        ? '<span class="yes">&le; ' + detail.pc + ' &rarr; crossover' +
          (pair.point !== null && pair.point !== undefined
            ? ' at point ' + pair.point : '') +
          (pair.alpha !== null && pair.alpha !== undefined
            ? ' alpha = ' + this.num(pair.alpha, 3) : '') + '</span>'
        : '<span class="no">&gt; ' + detail.pc + ' &rarr; copy parents</span>');

    var html = '<div class="pairhead">' + head + '</div>';

    var cut = (pair.applied && pair.point !== null && pair.point !== undefined)
      ? pair.point : -1;

    var rowHtml = function (self, label, genes, classes, showCut, extra) {
      var out = '<div class="crow"><span class="who">' + label +
        '</span><div class="genes">';
      for (var g = 0; g < genes.length; g++) {
        if (showCut && g === cut) { out += '<div class="cut"></div>'; }
        out += self.chip(genes[g], classes ? classes[g] : '');
      }
      out += '</div>' + (extra || '') + '</div>';
      return out;
    };

    var aCls = [], bCls = [];
    for (var g2 = 0; g2 < n; g2++) { aCls.push('from-a'); bCls.push('from-b'); }

    html += rowHtml(this, 'parent A', pair.parent_a, aCls, cut >= 0);
    html += rowHtml(this, 'parent B', pair.parent_b, bCls, cut >= 0);
    html += '<div class="swapline"><span class="arrow">&darr;</span> children</div>';
    html += rowHtml(this, 'child ' + pair.child1_index, pair.child1, sources[0], cut >= 0);
    html += rowHtml(this, 'child ' + pair.child2_index, pair.child2, sources[1], cut >= 0);

    box.innerHTML = html;
    return box;
  },

  runCrossover: function (detail, snapshot, animate, token) {
    var self = this;
    var node = this.buildCrossover(detail, snapshot, !animate);
    this.host.appendChild(node);

    Landscape.setData({
      population: snapshot.population,
      values: snapshot.values,
      bestIndex: -1, worstIndex: -1, eliteIndices: []
    });

    if (!animate) {
      // show every child produced this stage
      this.paintCloud(detail.offspring, detail.offspring_values, {});
      return Promise.resolve();
    }

    var holder = node.querySelector('#pairs');

    var step = function (i) {
      if (!self.alive(token)) { return Promise.resolve(); }
      if (i >= detail.pairs.length) {
        self.paintCloud(detail.offspring, detail.offspring_values, {});
        return Promise.resolve();
      }
      var pair = detail.pairs[i];

      // drop the "current" ring from the previous box
      var previous = holder.querySelector('.pairbox.now');
      if (previous) { previous.classList.remove('now'); }

      var box = self.pairBox(pair, i, detail, true);
      holder.appendChild(box);
      var chips = box.querySelectorAll('.crow:nth-child(n+4) .gene');
      for (var c = 0; c < chips.length; c++) { chips[c].classList.add('fly'); }
      box.scrollIntoView({ block: 'nearest' });

      // map: parents (squares) linked to their children (dots)
      Landscape.setOverlay({
        marks: [
          { at: pair.parent_a, shape: 'square', color: '#4cc2ff', label: 'A' },
          { at: pair.parent_b, shape: 'square', color: '#ff7ad9', label: 'B' },
          { at: pair.child1, shape: 'dot', color: '#ffffff', label: 'c1' },
          { at: pair.child2, shape: 'dot', color: '#ffffff', label: 'c2' }
        ],
        links: [
          { from: pair.parent_a, to: pair.child1, color: 'rgba(76,194,255,.85)', arrow: true },
          { from: pair.parent_b, to: pair.child1, color: 'rgba(255,122,217,.55)', dash: [3, 3] },
          { from: pair.parent_b, to: pair.child2, color: 'rgba(255,122,217,.85)', arrow: true },
          { from: pair.parent_a, to: pair.child2, color: 'rgba(76,194,255,.55)', dash: [3, 3] }
        ]
      });

      return self.sleep(Math.max(16, self.speed)).then(function () {
        return step(i + 1);
      });
    };

    return step(0);
  },

  /* ====================================================================
     4. MUTATION
     ==================================================================== */

  buildMutate: function (detail, snapshot, finished) {
    var node = this.panel(4, 'Mutation - ' + detail.method,
      detail.mutated_count + ' of ' + detail.rolls.length + ' genes',
      'Every gene of every child gets its own random number r. If r &le; Pm = ' +
      detail.pm + ' the gene is nudged by N(0, ' + detail.sigma +
      '). A gene that leaves the bounds is handled by "' +
      detail.bounds_handling + '".');

    var count = detail.offspring.length;
    var html = '<div class="kv"><div>mutated genes<b id="mutcount">' +
      (finished ? detail.mutated_count : 0) + '</b></div>' +
      '<div>children<b>' + count + '</b></div></div>';

    // one row per child, and inside it one cell per gene with its own dice roll
    html += '<div class="scroll" id="mutlist">';
    for (var i = 0; i < count; i++) {
      html += '<div class="mrow" data-child="' + i + '">' +
        '<span class="who">child ' + i + '</span>';
      for (var g = 0; g < detail.offspring[i].length; g++) {
        var shown = detail.offspring[i][g];        // value after this stage
        if (!finished) {
          // before the animation starts, show the value the child arrived with
          for (var r = 0; r < detail.rolls.length; r++) {
            if (detail.rolls[r].child_index === i && detail.rolls[r].gene_index === g) {
              shown = detail.rolls[r].old;
              break;
            }
          }
        }
        html += '<div class="mgene">' +
          '<div class="gene" data-child="' + i + '" data-gene="' + g + '">' +
          this.num(shown, 4) + '</div>' +
          '<span class="roll" data-child="' + i + '" data-gene="' + g + '"></span>' +
          '</div>';
      }
      html += '</div>';
    }
    html += '</div>';

    node.body.innerHTML += html;

    if (finished) {
      // mark the genes that actually changed
      for (var k = 0; k < detail.rolls.length; k++) {
        var roll = detail.rolls[k];
        var cell = node.querySelector('.gene[data-child="' + roll.child_index +
          '"][data-gene="' + roll.gene_index + '"]');
        var label = node.querySelector('.roll[data-child="' + roll.child_index +
          '"][data-gene="' + roll.gene_index + '"]');
        if (!roll.mutated) {
          if (label) { label.textContent = this.num(roll.r, 3); }
          continue;
        }
        if (cell) { cell.classList.add('mutated'); }
        if (label) {
          label.innerHTML = '<span class="badge mut">' +
            (roll.repaired ? 'out of bounds'
                           : (roll.delta >= 0 ? '+' : '') + this.num(roll.delta, 2)) +
            '</span>';
        }
      }
    }
    return node;
  },

  runMutate: function (detail, snapshot, animate, token) {
    var self = this;
    var node = this.buildMutate(detail, snapshot, !animate);
    this.host.appendChild(node);

    // the cloud shown during this stage is the children, before mutation
    var before = [];
    for (var i = 0; i < detail.offspring.length; i++) {
      before.push(detail.offspring[i].slice());
    }
    for (var r = detail.rolls.length - 1; r >= 0; r--) {
      var roll = detail.rolls[r];
      before[roll.child_index][roll.gene_index] = roll.old;
    }

    if (!animate) {
      this.paintCloud(detail.offspring, detail.offspring_values, {});
      return Promise.resolve();
    }

    this.paintCloud(before, null, {});

    var counter = node.querySelector('#mutcount');
    var done = 0;
    var live = [];
    for (var b = 0; b < before.length; b++) { live.push(before[b].slice()); }

    var step = function (k) {
      if (!self.alive(token)) { return Promise.resolve(); }
      if (k >= detail.rolls.length) {
        self.paintCloud(detail.offspring, detail.offspring_values, {});
        return Promise.resolve();
      }
      var roll = detail.rolls[k];
      var cell = node.querySelector('.gene[data-child="' + roll.child_index +
        '"][data-gene="' + roll.gene_index + '"]');
      var label = node.querySelector('.roll[data-child="' + roll.child_index +
        '"][data-gene="' + roll.gene_index + '"]');

      if (label) {
        label.innerHTML = self.num(roll.r, 3);
      }

      if (roll.mutated) {
        var from = live[roll.child_index].slice();
        live[roll.child_index][roll.gene_index] = roll.new;
        done = done + 1;
        counter.textContent = String(done);

        if (cell) {
          cell.classList.add('mutating');
          cell.textContent = self.num(roll.new, 4);
          setTimeout(function () {
            cell.classList.remove('mutating');
            cell.classList.add('mutated');
          }, 380);
        }
        if (label) {
          label.innerHTML = roll.repaired
            ? '<span class="badge oob">' + detail.bounds_handling + '</span>'
            : '<span class="badge mut">' +
              (roll.delta >= 0 ? '+' : '') + self.num(roll.delta, 2) + '</span>';
        }

        // map: arrow from the old spot to the new one
        self.paintCloud(live, null, {
          marks: [
            { at: from, shape: 'ring', r: 9, color: '#8d9bb0' },
            { at: live[roll.child_index], shape: 'dot', color: '#ffb03a',
              label: 'child ' + roll.child_index }
          ],
          links: [{ from: from, to: live[roll.child_index],
                    color: '#ffb03a', arrow: true, width: 1.6 }]
        });
        if (cell) { cell.scrollIntoView({ block: 'nearest' }); }
      }

      var wait = roll.mutated ? self.speed * 1.6 : self.speed * 0.16;
      return self.sleep(Math.max(6, wait)).then(function () {
        return step(k + 1);
      });
    };

    return step(0);
  },

  /* ====================================================================
     5. ELITISM
     ==================================================================== */

  buildElitism: function (detail, snapshot, finished) {
    var node = this.panel(5, 'Elitism', detail.elite_count + ' elite',
      'The best chromosome of the old generation is compared with the worst ' +
      'child. If the elite is better it takes that child\'s place, so the best ' +
      'solution found so far can never be lost.');

    if (detail.events.length === 0) {
      node.body.innerHTML += '<p class="explain">Elitism is switched off ' +
        '(elite count = 0), so the children are kept as they are.</p>';
      return node;
    }

    var html = '';
    for (var i = 0; i < detail.events.length; i++) {
      var e = detail.events[i];
      html += '<div class="pairbox">' +
        '<div class="pairhead">elite ' + (i + 1) + ' vs worst child #' +
          e.worst_index + '</div>' +
        '<div class="crow"><span class="who">elite</span><div class="genes">' +
          this.chip(e.elite[0], 'from-a') + this.chip(e.elite[1], 'from-a') +
        '</div><span class="roll">f = ' + this.num(e.elite_value, 5) + '</span></div>' +
        '<div class="crow"><span class="who">worst</span><div class="genes">' +
          this.chip(e.worst_chromosome[0]) + this.chip(e.worst_chromosome[1]) +
        '</div><span class="roll">f = ' + this.num(e.worst_value, 5) + '</span></div>' +
        '<div class="swapline">' +
        (e.replaced
          ? '<span class="badge ok">replaced</span> elite f = ' +
            this.num(e.elite_value, 5) + ' &lt; worst f = ' +
            this.num(e.worst_value, 5)
          : '<span class="badge">kept</span> the children were already at ' +
            'least as good') +
        '</div></div>';
    }
    node.body.innerHTML += html;
    return node;
  },

  runElitism: function (detail, snapshot, animate, token) {
    var node = this.buildElitism(detail, snapshot, true);
    this.host.appendChild(node);

    var marks = [];
    var links = [];
    for (var i = 0; i < detail.events.length; i++) {
      var e = detail.events[i];
      marks.push({ at: e.elite, shape: 'star', color: '#ffd166', label: 'elite' });
      if (e.replaced) {
        marks.push({ at: e.worst_chromosome, shape: 'dot', color: '#ff6b81',
                     label: 'dropped #' + e.worst_index });
        links.push({ from: e.worst_chromosome, to: e.elite, color: '#ffd166',
                     arrow: true, dash: [4, 3] });
      }
    }
    this.paintCloud(detail.offspring, detail.offspring_values,
                    { marks: marks, links: links });
    return Promise.resolve();
  },

  /* ====================================================================
     6. COMMIT
     ==================================================================== */

  buildCommit: function (detail, snapshot) {
    var node = this.panel(6, 'New generation', 'generation ' + snapshot.generation,
      'The children become the population. The next click starts the next ' +
      'generation with a fresh evaluation.');

    var improved = detail.new_best < detail.previous_best;
    node.body.innerHTML +=
      '<div class="kv">' +
      '<div>best before<b>' + this.num(detail.previous_best, 6) + '</b></div>' +
      '<div>best now<b>' + this.num(detail.new_best, 6) + '</b></div>' +
      '<div>average now<b>' + this.num(detail.new_average, 4) + '</b></div>' +
      '<div>best ever<b>' + this.num(snapshot.best_ever_value, 6) + '</b></div>' +
      '</div>' +
      '<div class="swapline">' +
      (improved ? '<span class="badge ok">improved</span>'
                : '<span class="badge">no improvement this generation</span>') +
      ' stagnation counter ' + snapshot.stagnation_counter + ' / ' +
      snapshot.stagnation_limit + '</div>' +
      (snapshot.finished
        ? '<p class="explain" style="color:var(--accent-2)">Run finished: ' +
          snapshot.stop_reason + '</p>'
        : '');
    return node;
  },

  paintCommit: function (snapshot) {
    var bestIndex = -1;
    var bestValue = Infinity;
    for (var i = 0; i < snapshot.values.length; i++) {
      if (snapshot.values[i] < bestValue) { bestValue = snapshot.values[i]; bestIndex = i; }
    }
    Landscape.setData({
      population: snapshot.population,
      values: snapshot.values,
      bestIndex: bestIndex,
      worstIndex: -1,
      eliteIndices: []
    });
    Landscape.setOverlay({});
  },

  /* draw an arbitrary cloud of points (children, for example) */
  paintCloud: function (points, values, overlay) {
    var bestIndex = -1;
    if (values) {
      var bestValue = Infinity;
      for (var i = 0; i < values.length; i++) {
        if (values[i] < bestValue) { bestValue = values[i]; bestIndex = i; }
      }
    }
    Landscape.setData({
      population: points,
      values: values || [],
      bestIndex: bestIndex,
      worstIndex: -1,
      eliteIndices: []
    });
    Landscape.setOverlay(overlay || {});
  }
};
