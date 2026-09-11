/* =========================================================================
   app.js - wiring: parameter panel, the two run modes, and the API calls

   Every GA number comes from the Python backend (ga_ackley.py through
   engine.py). This file only asks for the next step and hands the answer to
   Landscape / Chart / Stages.
   ========================================================================= */

/* ------------------------------------------------------------------------
   1. the tunable parameters, one entry per control
   ------------------------------------------------------------------------ */

var PARAMS = [
  { group: 'Ackley function', fields: [
    { key: 'a', label: 'a (bowl depth)', type: 'range', min: 1, max: 40, step: 0.5, digits: 1 },
    { key: 'b', label: 'b (decay rate)', type: 'range', min: 0.02, max: 1, step: 0.01, digits: 2 },
    { key: 'c_pi', label: 'c (ripple frequency)', type: 'range', min: 0.5, max: 8, step: 0.5,
      digits: 1, suffix: ' × π' }
  ] },

  { group: 'Search space', fields: [
    { key: 'lower_bound', label: 'lower bound', type: 'range', min: -40, max: -1, step: 1, digits: 0 },
    { key: 'upper_bound', label: 'upper bound', type: 'range', min: 1, max: 40, step: 1, digits: 0 },
    { key: 'n_genes', label: 'genes per chromosome', type: 'locked', shown: '2  (x1, x2)',
      note: 'the map is two dimensional, so a chromosome has two genes' }
  ] },

  { group: 'Population', fields: [
    { key: 'pop_size', label: 'population size N', type: 'range', min: 4, max: 200, step: 2, digits: 0,
      note: 'kept even so the mating pool pairs up exactly' },
    { key: 'max_generations', label: 'max generations', type: 'range', min: 1, max: 500, step: 1, digits: 0 },
    { key: 'elite_count', label: 'elite count', type: 'range', min: 0, max: 10, step: 1, digits: 0 }
  ] },

  { group: 'Selection', fields: [
    { key: 'selection_method', label: 'method', type: 'select', rebuild: true, options: [
      ['roulette', 'roulette wheel'], ['tournament', 'tournament']
    ] },
    { key: 'tournament_size', label: 'tournament size k', type: 'range', min: 2, max: 10, step: 1,
      digits: 0, showIf: function (ui) { return ui.selection_method === 'tournament'; } }
  ] },

  { group: 'Crossover', fields: [
    { key: 'crossover_method', label: 'method', type: 'select', options: [
      ['one_point', '1-point'], ['uniform', 'uniform'], ['arithmetic', 'arithmetic (blend)']
    ] },
    { key: 'pc', label: 'crossover probability Pc', type: 'range', min: 0, max: 1, step: 0.01, digits: 2 }
  ] },

  { group: 'Mutation', fields: [
    { key: 'mutation_method', label: 'method', type: 'select', rebuild: true, options: [
      ['gaussian', 'gaussian nudge'], ['uniform', 'uniform re-draw']
    ] },
    { key: 'pm', label: 'mutation probability Pm (per gene)', type: 'range', min: 0, max: 1,
      step: 0.01, digits: 2 },
    { key: 'mutation_sigma', label: 'sigma (gaussian step size)', type: 'range', min: 0.05,
      max: 10, step: 0.05, digits: 2,
      showIf: function (ui) { return ui.mutation_method === 'gaussian'; } },
    { key: 'bounds_handling', label: 'gene out of bounds', type: 'select', options: [
      ['resample', 're-sample uniformly'], ['clip', 'clip to the bound'],
      ['reflect', 'reflect back inside']
    ] }
  ] },

  { group: 'Stopping criteria', fields: [
    { key: 'tol_exp', label: 'improvement tolerance', type: 'range', min: 1, max: 14, step: 1,
      digits: 0, fmt: function (v) { return '1e-' + v; } },
    { key: 'stagnation_limit', label: 'stagnant generations allowed', type: 'range', min: 1,
      max: 300, step: 1, digits: 0,
      note: 'the run also stops at the generation limit' }
  ] },

  { group: 'Randomness', fields: [
    { key: 'random_seed', label: 'random seed', type: 'seed' }
  ] }
];

/* ------------------------------------------------------------------------
   2. state
   ------------------------------------------------------------------------ */

var state = {
  ui: {},                 // current slider / dropdown values
  randomSeed: false,      // "new seed every restart" checkbox
  mode: 'manual',         // 'auto' or 'manual'
  sub: 'step',            // 'step' or 'generation'
  animate: true,
  speed: 190,
  fps: 12,
  snapshot: null,
  busy: false,
  playing: false,
  dirty: false
};

var STAGE_NAMES = ['evaluate', 'select', 'crossover', 'mutate', 'elitism', 'commit'];

/* ------------------------------------------------------------------------
   3. small helpers
   ------------------------------------------------------------------------ */

function $(id) { return document.getElementById(id); }

function getJSON(url) {
  return fetch(url).then(function (r) { return r.json(); });
}

function postJSON(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  }).then(function (r) { return r.json(); });
}

function fmtNumber(value, digits) {
  if (value === null || value === undefined) { return '-'; }
  if (Math.abs(value) !== 0 && Math.abs(value) < 1e-4) { return value.toExponential(2); }
  return value.toFixed(digits === undefined ? 4 : digits);
}

/* ------------------------------------------------------------------------
   4. parameter panel
   ------------------------------------------------------------------------ */

function buildParams() {
  var host = $('params');
  host.innerHTML = '';

  for (var g = 0; g < PARAMS.length; g++) {
    var group = PARAMS[g];
    var box = document.createElement('div');
    box.className = 'pgroup';
    box.innerHTML = '<h3>' + group.group + '</h3>';

    for (var f = 0; f < group.fields.length; f++) {
      var field = group.fields[f];
      if (field.showIf && !field.showIf(state.ui)) { continue; }
      box.appendChild(buildField(field));
    }
    host.appendChild(box);
  }
}

function buildField(field) {
  var wrap = document.createElement('div');
  wrap.className = 'field';

  if (field.type === 'locked') {
    wrap.className += ' locked';
    wrap.innerHTML = '<div class="top"><span class="name">' + field.label +
      '</span><span class="val">' + field.shown + '</span></div>' +
      (field.note ? '<div class="note">' + field.note + '</div>' : '');
    return wrap;
  }

  if (field.type === 'select') {
    var opts = '';
    for (var i = 0; i < field.options.length; i++) {
      var o = field.options[i];
      opts += '<option value="' + o[0] + '"' +
        (state.ui[field.key] === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    }
    wrap.innerHTML = '<div class="top"><span class="name">' + field.label +
      '</span></div><select>' + opts + '</select>' +
      (field.note ? '<div class="note">' + field.note + '</div>' : '');
    var select = wrap.querySelector('select');
    select.addEventListener('change', function () {
      state.ui[field.key] = select.value;
      markDirty();
      if (field.rebuild) { buildParams(); }
    });
    return wrap;
  }

  if (field.type === 'seed') {
    wrap.innerHTML = '<div class="top"><span class="name">' + field.label + '</span></div>' +
      '<div class="seedrow">' +
      '<input type="number" min="0" step="1" value="' + (state.ui.random_seed || 0) + '">' +
      '<button class="mini" type="button">dice</button></div>' +
      '<label class="chk" style="margin-top:5px"><input type="checkbox"' +
      (state.randomSeed ? ' checked' : '') + '> new seed on every restart</label>';

    var input = wrap.querySelector('input[type=number]');
    var dice = wrap.querySelector('button');
    var check = wrap.querySelector('input[type=checkbox]');

    input.addEventListener('input', function () {
      state.ui.random_seed = parseInt(input.value, 10) || 0;
      markDirty();
    });
    dice.addEventListener('click', function () {
      state.ui.random_seed = Math.floor(Math.random() * 100000);
      input.value = state.ui.random_seed;
      markDirty();
    });
    check.addEventListener('change', function () {
      state.randomSeed = check.checked;
      input.disabled = check.checked;
      markDirty();
    });
    input.disabled = state.randomSeed;
    return wrap;
  }

  // range slider
  var value = state.ui[field.key];
  var shown = field.fmt ? field.fmt(value) : value.toFixed(field.digits) + (field.suffix || '');
  wrap.innerHTML = '<div class="top"><span class="name">' + field.label +
    '</span><span class="val">' + shown + '</span></div>' +
    '<input type="range" min="' + field.min + '" max="' + field.max +
    '" step="' + field.step + '" value="' + value + '">' +
    (field.note ? '<div class="note">' + field.note + '</div>' : '');

  var slider = wrap.querySelector('input');
  var out = wrap.querySelector('.val');
  slider.addEventListener('input', function () {
    var v = parseFloat(slider.value);
    state.ui[field.key] = v;
    out.textContent = field.fmt ? field.fmt(v) : v.toFixed(field.digits) + (field.suffix || '');
    markDirty();
  });
  return wrap;
}

function markDirty() {
  state.dirty = true;
  $('dirty').classList.remove('hidden');
}

/* show / hide the whole parameter panel, keeping the canvases in step */
function setCollapsed(flag) {
  document.body.classList.toggle('side-collapsed', flag);
  try {
    localStorage.setItem('ga.sideCollapsed', flag ? '1' : '0');
  } catch (err) {
    // private mode or blocked storage: remembering it is optional
  }
  Landscape.resize();
  Chart.resize();
}

/* turn the UI values into the config the backend expects */
function uiToConfig() {
  var seed = state.randomSeed ? Math.floor(Math.random() * 100000) : state.ui.random_seed;
  return {
    a: state.ui.a,
    b: state.ui.b,
    c: state.ui.c_pi * Math.PI,
    lower_bound: state.ui.lower_bound,
    upper_bound: state.ui.upper_bound,
    pop_size: state.ui.pop_size,
    max_generations: state.ui.max_generations,
    pc: state.ui.pc,
    pm: state.ui.pm,
    elite_count: state.ui.elite_count,
    selection_method: state.ui.selection_method,
    tournament_size: state.ui.tournament_size,
    crossover_method: state.ui.crossover_method,
    mutation_method: state.ui.mutation_method,
    mutation_sigma: state.ui.mutation_sigma,
    bounds_handling: state.ui.bounds_handling,
    stagnation_tolerance: Math.pow(10, -state.ui.tol_exp),
    stagnation_limit: state.ui.stagnation_limit,
    random_seed: seed
  };
}

/* fill the UI from a backend config (used on load and for "defaults") */
function configToUi(config) {
  state.ui = {
    a: config.a,
    b: config.b,
    c_pi: Math.round((config.c / Math.PI) * 2) / 2,
    lower_bound: Math.round(config.lower_bound),
    upper_bound: Math.round(config.upper_bound),
    pop_size: config.pop_size,
    max_generations: config.max_generations,
    pc: config.pc,
    pm: config.pm,
    elite_count: config.elite_count,
    selection_method: config.selection_method,
    tournament_size: config.tournament_size,
    crossover_method: config.crossover_method,
    mutation_method: config.mutation_method,
    mutation_sigma: config.mutation_sigma,
    bounds_handling: config.bounds_handling,
    tol_exp: Math.max(1, Math.min(14,
      Math.round(-Math.log(config.stagnation_tolerance) / Math.LN10))),
    stagnation_limit: Math.min(300, config.stagnation_limit),
    random_seed: config.random_seed === null ? 42 : config.random_seed
  };
  state.randomSeed = (config.random_seed === null);
}

/* ------------------------------------------------------------------------
   5. readouts, banner, stage bar
   ------------------------------------------------------------------------ */

function updateReadouts(snapshot) {
  $('ro-gen').textContent = snapshot.generation + ' / ' +
    (snapshot.config ? snapshot.config.max_generations : '?');
  $('ro-best').textContent = fmtNumber(snapshot.best_ever_value, 6);
  $('ro-point').textContent = snapshot.best_ever
    ? '(' + fmtNumber(snapshot.best_ever[0], 3) + ', ' +
      fmtNumber(snapshot.best_ever[1], 3) + ')'
    : '-';
  $('ro-stag').textContent = snapshot.stagnation_counter + ' / ' + snapshot.stagnation_limit;
  $('ro-stage').textContent = snapshot.finished ? 'finished' : snapshot.next_stage;

  var banner = $('banner');
  if (snapshot.finished) {
    banner.className = 'banner';
    banner.innerHTML = '<strong>Run finished</strong> after ' +
      snapshot.history_best.length + ' generations - ' + snapshot.stop_reason +
      '. Best f(x) = ' + fmtNumber(snapshot.best_ever_value, 8) +
      ' at (' + fmtNumber(snapshot.best_ever[0], 5) + ', ' +
      fmtNumber(snapshot.best_ever[1], 5) + ').' +
      (snapshot.best_ever_value < 1e-3
        ? '  That is the global minimum f(0,0) = 0 within 1e-3.'
        : '  The known global minimum is f(0,0) = 0.');
  } else {
    banner.classList.add('hidden');
    return;
  }
  banner.classList.remove('hidden');
}

function updateStageBar(snapshot) {
  var host = $('stagebar');
  var next = snapshot.finished ? null : snapshot.next_stage;
  var nextIndex = STAGE_NAMES.indexOf(next);
  var html = '';
  for (var i = 0; i < STAGE_NAMES.length; i++) {
    var cls = '';
    if (nextIndex >= 0 && i < nextIndex) { cls = 'done'; }
    if (i === nextIndex) { cls = 'now'; }
    html += '<div class="' + cls + '">' + (i + 1) + ' ' + STAGE_NAMES[i] + '</div>';
  }
  host.innerHTML = html;
}

function setLegend() {
  $('legend').innerHTML =
    '<span><i style="background:#fff"></i>individual</span>' +
    '<span><i style="background:#ffd166"></i>best of generation</span>' +
    '<span><i style="background:#3ddc97"></i>elite (ring)</span>' +
    '<span><i style="background:#ff6b81"></i>worst</span>' +
    '<span><i style="background:#4cc2ff"></i>parent A</span>' +
    '<span><i style="background:#ff7ad9"></i>parent B</span>' +
    '<span><i style="background:#ffb03a"></i>mutated gene</span>' +
    '<span>dashed cross = known optimum (0,0)</span>';
}

/* ------------------------------------------------------------------------
   6. run control
   ------------------------------------------------------------------------ */

function setBusy(flag) {
  state.busy = flag;
  $('btn-step').disabled = flag;
  $('btn-one').disabled = flag;
  $('btn-restart').disabled = flag;
}

function restart() {
  stopPlaying();
  Stages.stop();
  var config = uiToConfig();

  setBusy(true);
  return postJSON('/api/init', { config: config }).then(function (res) {
    state.snapshot = res.snapshot;
    state.dirty = false;
    $('dirty').classList.add('hidden');
    $('banner').classList.add('hidden');

    var cfg = res.snapshot.config;
    Landscape.setConfig({ a: cfg.a, b: cfg.b, c: cfg.c,
                          low: cfg.lower_bound, high: cfg.upper_bound });
    Chart.setData([], [], cfg.max_generations);

    // show the starting population (not scored yet by the GA loop)
    Landscape.setData({
      population: res.snapshot.population,
      values: res.snapshot.values,
      bestIndex: -1, worstIndex: -1, eliteIndices: []
    });
    Landscape.setOverlay({});

    updateReadouts(res.snapshot);
    updateStageBar(res.snapshot);
    Stages.empty('Fresh random population of ' + cfg.pop_size +
      ' chromosomes. Press "' + ($('btn-step').textContent.trim()) +
      '" to start generation 1.');
    setBusy(false);
    return res.snapshot;
  });
}

/* ---- manual: one stage at a time ---- */

function doStep() {
  if (state.busy || !state.snapshot) { return; }
  if (state.snapshot.finished) { return; }

  setBusy(true);
  $('btn-skip').classList.remove('hidden');

  postJSON('/api/step', {}).then(function (res) {
    if (res.error) { setBusy(false); return; }
    state.snapshot = res.snapshot;
    updateReadouts(res.snapshot);
    updateStageBar(res.snapshot);
    Chart.setData(res.snapshot.history_best, res.snapshot.history_average);

    return Stages.showStage(res.stage, res.detail, res.snapshot, {
      animate: state.animate,
      speed: state.speed
    });
  }).then(function () {
    $('btn-skip').classList.add('hidden');
    setBusy(false);
  });
}

/* ---- manual: the whole generation at once ---- */

function doGeneration() {
  if (state.busy || !state.snapshot) { return; }
  if (state.snapshot.finished) { return; }

  setBusy(true);
  postJSON('/api/generation', {}).then(function (res) {
    if (res.error) { setBusy(false); return; }
    state.snapshot = res.snapshot;
    updateReadouts(res.snapshot);
    updateStageBar(res.snapshot);
    Chart.setData(res.snapshot.history_best, res.snapshot.history_average);
    Stages.showGeneration(res.stages, res.snapshot);
    setBusy(false);
  });
}

/* ---- automatic mode ---- */

function autoFrame(frame) {
  var bestIndex = -1;
  var bestValue = Infinity;
  for (var i = 0; i < frame.values.length; i++) {
    if (frame.values[i] < bestValue) { bestValue = frame.values[i]; bestIndex = i; }
  }
  Landscape.setData({
    population: frame.population,
    values: frame.values,
    bestIndex: bestIndex, worstIndex: -1, eliteIndices: []
  });
  Landscape.setOverlay({});
  Chart.setData(frame.history_best, frame.history_average);

  state.snapshot.generation = frame.generation;
  state.snapshot.best_ever = frame.best_ever;
  state.snapshot.best_ever_value = frame.best_ever_value;
  state.snapshot.stagnation_counter = frame.stagnation_counter;
  state.snapshot.history_best = frame.history_best;
  state.snapshot.history_average = frame.history_average;
  state.snapshot.finished = frame.finished;
  state.snapshot.stop_reason = frame.stop_reason;
  state.snapshot.next_stage = 'evaluate';
  updateReadouts(state.snapshot);
}

function autoTick() {
  if (!state.playing) { return; }
  postJSON('/api/auto', { count: 1 }).then(function (res) {
    if (!state.playing) { return; }
    if (res.frames && res.frames.length) {
      autoFrame(res.frames[res.frames.length - 1]);
    }
    if (res.finished) {
      stopPlaying();
      return;
    }
    setTimeout(autoTick, Math.max(16, 1000 / state.fps));
  });
}

function startPlaying() {
  if (!state.snapshot || state.snapshot.finished) { return; }
  state.playing = true;
  $('btn-play').textContent = 'Pause';
  autoTick();
}

function stopPlaying() {
  state.playing = false;
  var button = $('btn-play');
  if (button) { button.textContent = 'Play'; }
}

/* ------------------------------------------------------------------------
   7. mode switching
   ------------------------------------------------------------------------ */

function applyMode() {
  var manual = (state.mode === 'manual');
  $('manual-controls').classList.toggle('hidden', !manual);
  $('auto-controls').classList.toggle('hidden', manual);
  if (!manual) {
    Stages.empty('Automatic mode runs whole generations back to back and ' +
      'draws the population and the convergence curve. Switch to manual mode ' +
      'to look inside a single generation.');
    Stages.stop();
  } else {
    stopPlaying();
  }
  applySub();
}

function applySub() {
  var stepMode = (state.sub === 'step');
  $('btn-step').textContent = stepMode ? 'Next step →' : 'Run whole generation →';
  $('anim-row').classList.toggle('hidden', !stepMode);
}

/* ------------------------------------------------------------------------
   8. start-up
   ------------------------------------------------------------------------ */

function wireControls() {
  // mode switch
  var modeButtons = $('mode-switch').querySelectorAll('button');
  for (var i = 0; i < modeButtons.length; i++) {
    (function (button) {
      button.addEventListener('click', function () {
        for (var k = 0; k < modeButtons.length; k++) { modeButtons[k].classList.remove('on'); }
        button.classList.add('on');
        state.mode = button.getAttribute('data-mode');
        applyMode();
      });
    })(modeButtons[i]);
  }

  // manual sub-mode
  var subButtons = $('manual-switch').querySelectorAll('button');
  for (var j = 0; j < subButtons.length; j++) {
    (function (button) {
      button.addEventListener('click', function () {
        for (var k = 0; k < subButtons.length; k++) { subButtons[k].classList.remove('on'); }
        button.classList.add('on');
        state.sub = button.getAttribute('data-sub');
        applySub();
      });
    })(subButtons[j]);
  }

  // 2D / 3D view
  var viewButtons = $('view-switch').querySelectorAll('button');
  for (var v = 0; v < viewButtons.length; v++) {
    (function (button) {
      button.addEventListener('click', function () {
        for (var k = 0; k < viewButtons.length; k++) { viewButtons[k].classList.remove('on'); }
        button.classList.add('on');
        var view = button.getAttribute('data-view');
        Landscape.setView(view);
        $('hint3d').classList.toggle('hidden', view !== '3d');
      });
    })(viewButtons[v]);
  }

  $('btn-step').addEventListener('click', function () {
    if (state.sub === 'step') { doStep(); } else { doGeneration(); }
  });

  $('btn-skip').addEventListener('click', function () { Stages.skip = true; });

  $('btn-play').addEventListener('click', function () {
    if (state.playing) { stopPlaying(); } else { startPlaying(); }
  });

  $('btn-one').addEventListener('click', function () {
    if (state.busy || !state.snapshot || state.snapshot.finished) { return; }
    setBusy(true);
    postJSON('/api/auto', { count: 1 }).then(function (res) {
      if (res.frames && res.frames.length) { autoFrame(res.frames[0]); }
      setBusy(false);
    });
  });

  $('btn-restart').addEventListener('click', function () { restart(); });

  // collapse / expand the parameter panel (the canvases must be re-measured
  // afterwards, because their width is a percentage of the new column)
  $('btn-collapse').addEventListener('click', function () { setCollapsed(true); });
  $('btn-expand').addEventListener('click', function () { setCollapsed(false); });

  $('btn-reset-params').addEventListener('click', function () {
    getJSON('/api/defaults').then(function (res) {
      configToUi(res.config);
      buildParams();
      markDirty();
    });
  });

  $('chk-anim').addEventListener('change', function () {
    state.animate = this.checked;
  });

  $('rng-speed').addEventListener('input', function () {
    state.speed = parseInt(this.value, 10);
    Stages.speed = state.speed;
    $('out-speed').textContent = state.speed + ' ms';
  });

  $('rng-fps').addEventListener('input', function () {
    state.fps = parseInt(this.value, 10);
    $('out-fps').textContent = state.fps;
  });

  $('chk-bands').addEventListener('change', function () {
    Landscape.bands = this.checked;
    Landscape.heatKey = '';
    Landscape.draw();
  });

  $('chk-ids').addEventListener('change', function () {
    Landscape.showIds = this.checked;
    Landscape.draw();
  });

  $('chk-log').addEventListener('change', function () {
    Chart.log = this.checked;
    Chart.draw();
  });
}

function boot() {
  // restore the panel state from the last visit
  var stored = null;
  try {
    stored = localStorage.getItem('ga.sideCollapsed');
  } catch (err) {
    stored = null;
  }
  if (stored === '1') { document.body.classList.add('side-collapsed'); }

  Landscape.init($('landscape'));
  Chart.init($('chart'));
  Stages.init($('inspector'));
  setLegend();
  wireControls();

  getJSON('/api/defaults').then(function (res) {
    configToUi(res.config);
    buildParams();
    applyMode();
    return restart();
  });
}

window.addEventListener('load', boot);
