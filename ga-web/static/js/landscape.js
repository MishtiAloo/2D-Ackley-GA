/* =========================================================================
   landscape.js - draws the search space

     2D view : heatmap of f(x1,x2) with the population on top
     3D view : rotatable surface of f(x1,x2) with the population floating on it

   The stage animations push "overlays" in here (highlighted dots, parent /
   child links, mutation arrows) and then ask for a redraw.
   ========================================================================= */

/* Work out which individuals get a special marker, so the map always shows
   the roles the legend lists: the best, the worst, and the ones elitism
   would carry into the next generation. */
function populationRoles(values, eliteCount) {
  var best = -1, worst = -1;
  var bestValue = Infinity, worstValue = -Infinity;
  for (var i = 0; i < values.length; i++) {
    if (values[i] < bestValue) { bestValue = values[i]; best = i; }
    if (values[i] > worstValue) { worstValue = values[i]; worst = i; }
  }

  var elites = [];
  var keep = Math.min(eliteCount || 0, values.length);
  if (keep > 0) {
    var order = [];
    for (var j = 0; j < values.length; j++) { order.push(j); }
    order.sort(function (A, B) { return values[A] - values[B]; });
    elites = order.slice(0, keep);
  }
  return { bestIndex: best, worstIndex: worst, eliteIndices: elites };
}

var Landscape = {

  canvas: null,
  ctx: null,
  view: '2d',
  bands: false,
  showIds: false,

  // function + bounds currently drawn
  cfg: { a: 20, b: 0.2, c: 6.283185307, low: -5, high: 5 },

  // cached background
  heat: null,
  heatKey: '',
  gridZ: null,          // grid of f values used by the 3D surface
  gridN: 128,
  zmin: 0,
  zmax: 1,

  // 3D camera, and the pose it goes back to on a double click
  HOME: { az: -0.62, el: 0.52, zoom: 1 },
  az: -0.62,
  el: 0.52,
  zoom: 1,
  hiQuality: true,        // supersample the surface when the camera is still
  dragging: false,
  lastX: 0,
  lastY: 0,

  // what to draw
  data: { population: [], values: [], bestIndex: -1, worstIndex: -1, eliteIndices: [] },
  overlay: {},

  /* ------------------------------------------------------------------ */

  init: function (canvas) {
    var self = this;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    window.addEventListener('resize', function () { self.resize(); });

    // mouse rotation for the 3D view
    canvas.addEventListener('mousedown', function (e) {
      if (self.view !== '3d') { return; }
      self.dragging = true;
      self.lastX = e.clientX;
      self.lastY = e.clientY;
    });
    window.addEventListener('mouseup', function () {
      if (self.dragging) { self.dragging = false; self.refine(); }
    });
    window.addEventListener('mousemove', function (e) {
      if (!self.dragging) { return; }
      self.az += (e.clientX - self.lastX) * 0.01;
      self.el += (e.clientY - self.lastY) * 0.01;
      if (self.el < 0.12) { self.el = 0.12; }
      if (self.el > 1.5) { self.el = 1.5; }
      self.lastX = e.clientX;
      self.lastY = e.clientY;
      self.hiQuality = false;
      self.draw();
    });
    // a drag can end up anywhere, so give the camera a way home
    canvas.addEventListener('dblclick', function () {
      if (self.view !== '3d') { return; }
      self.az = self.HOME.az;
      self.el = self.HOME.el;
      self.zoom = self.HOME.zoom;
      self.hiQuality = true;
      self.draw();
    });

    canvas.addEventListener('wheel', function (e) {
      if (self.view !== '3d') { return; }
      e.preventDefault();
      self.zoom *= (e.deltaY > 0 ? 0.92 : 1.08);
      if (self.zoom < 0.4) { self.zoom = 0.4; }
      if (self.zoom > 3) { self.zoom = 3; }
      self.hiQuality = false;
      self.draw();
      self.refine();
    }, { passive: false });

    this.resize();
  },

  /* Redraw at full quality once the camera has been still for a moment, so
     dragging stays responsive without leaving a soft picture behind. */
  refine: function () {
    var self = this;
    if (this.refineTimer) { clearTimeout(this.refineTimer); }
    this.refineTimer = setTimeout(function () {
      self.hiQuality = true;
      self.draw();
    }, 130);
  },

  resize: function () {
    var ratio = window.devicePixelRatio || 1;
    var rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(50, Math.round(rect.width * ratio));
    this.canvas.height = Math.max(50, Math.round(rect.height * ratio));
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.w = rect.width;
    this.h = rect.height;
    this.heatKey = '';            // force the background to be rebuilt
    this.draw();
  },

  setConfig: function (cfg) {
    this.cfg = cfg;
    this.heatKey = '';
    this.draw();
  },

  setData: function (data) {
    this.data = data;
    this.draw();
  },

  setOverlay: function (overlay) {
    this.overlay = overlay || {};
    this.draw();
  },

  setView: function (view) {
    this.view = view;
    this.draw();
  },

  /* The surface buffer is baked with the theme's backdrop and furniture,
     so a switch has to throw it away. */
  retheme: function () {
    this.surfaceKey = '';
    this.draw();
  },

  /* ---------------- plot area of the 2D view ------------------------- */

  /* The search space is square, so the plot is drawn as a square box
     centred in the canvas, leaving room on the right for the colour bar. */
  plotRect: function () {
    var padL = 42, padB = 28, padT = 10, padR = 66;
    var availW = Math.max(10, this.w - padL - padR);
    var availH = Math.max(10, this.h - padT - padB);
    var side = Math.min(availW, availH);
    return {
      x: padL + (availW - side) / 2,
      y: padT,
      w: side,
      h: side
    };
  },

  toScreen: function (x1, x2) {
    var r = this.plotRect();
    var low = this.cfg.low, high = this.cfg.high;
    var fx = (x1 - low) / (high - low);
    var fy = (x2 - low) / (high - low);
    return [r.x + fx * r.w, r.y + (1 - fy) * r.h];
  },

  /* ---------------- background heatmap + z grid ---------------------- */

  buildHeat: function () {
    var key = [this.cfg.a, this.cfg.b, this.cfg.c, this.cfg.low, this.cfg.high,
               this.bands, Math.round(this.w), Math.round(this.h)].join('|');
    if (key === this.heatKey && this.heat) { return; }
    this.heatKey = key;

    var n = 200;                                  // heatmap resolution
    var off = document.createElement('canvas');
    off.width = n;
    off.height = n;
    var octx = off.getContext('2d');
    var img = octx.createImageData(n, n);

    var low = this.cfg.low, high = this.cfg.high, span = high - low;
    var a = this.cfg.a, b = this.cfg.b, c = this.cfg.c;

    // first pass: values + range
    var vals = new Float64Array(n * n);
    var vmin = Infinity, vmax = -Infinity;
    for (var iy = 0; iy < n; iy++) {
      var x2 = high - (iy + 0.5) / n * span;      // canvas y grows downward
      for (var ix = 0; ix < n; ix++) {
        var x1 = low + (ix + 0.5) / n * span;
        var v = ackley2d(x1, x2, a, b, c);
        vals[iy * n + ix] = v;
        if (v < vmin) { vmin = v; }
        if (v > vmax) { vmax = v; }
      }
    }

    // second pass: colours
    for (var i = 0; i < n * n; i++) {
      var t = (vals[i] - vmin) / (vmax - vmin || 1);
      var col = colorForT(t, this.bands);
      img.data[i * 4] = col[0];
      img.data[i * 4 + 1] = col[1];
      img.data[i * 4 + 2] = col[2];
      img.data[i * 4 + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    this.heat = off;
    this.heatMin = vmin;
    this.heatMax = vmax;

    /* Grid of heights for the 3D surface, with a surface normal at every
       vertex. Both live in the normalised cube the camera works in and
       neither depends on where the camera is, so they are built once per
       function rather than once per frame. */
    var m = this.gridN;
    var n1 = m + 1;
    var gz = new Float64Array(n1 * n1);
    var zmin = Infinity, zmax = -Infinity;
    for (var gy = 0; gy < n1; gy++) {
      for (var gx = 0; gx < n1; gx++) {
        var z = ackley2d(low + span * gx / m, low + span * gy / m, a, b, c);
        gz[gy * n1 + gx] = z;
        if (z < zmin) { zmin = z; }
        if (z > zmax) { zmax = z; }
      }
    }
    this.gridZ = gz;
    this.zmin = zmin;
    this.zmax = zmax;

    // the normal comes from the slope of f measured either side of the
    // vertex, which is smoother than reading it off the mesh cells
    var kz = 0.85 / ((zmax - zmin) || 1);
    var halfSpan = span / 2;
    var step = span / (4 * m);
    var nu = new Float32Array(n1 * n1);
    var nv = new Float32Array(n1 * n1);
    var nw = new Float32Array(n1 * n1);
    for (var ny = 0; ny < n1; ny++) {
      var wy = low + span * ny / m;
      for (var nx = 0; nx < n1; nx++) {
        var wx = low + span * nx / m;
        var dzx = (ackley2d(wx + step, wy, a, b, c) -
                   ackley2d(wx - step, wy, a, b, c)) / (2 * step);
        var dzy = (ackley2d(wx, wy + step, a, b, c) -
                   ackley2d(wx, wy - step, a, b, c)) / (2 * step);
        var du = -dzx * halfSpan * kz;
        var dv = -dzy * halfSpan * kz;
        var len = Math.sqrt(du * du + dv * dv + 1);
        var at = ny * n1 + nx;
        nu[at] = du / len;
        nv[at] = dv / len;
        nw[at] = 1 / len;
      }
    }
    this.gridNU = nu;
    this.gridNV = nv;
    this.gridNW = nw;
  },

  /* ---------------- main draw --------------------------------------- */

  draw: function () {
    if (!this.ctx) { return; }
    this.buildHeat();
    var ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    if (this.view === '3d') {
      this.draw3d();
    } else {
      this.draw2d();
    }
  },

  /* ============================ 2D ================================== */

  draw2d: function () {
    var ctx = this.ctx;
    var r = this.plotRect();
    var self = this;

    // background
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.heat, r.x, r.y, r.w, r.h);
    ctx.restore();

    // frame + axes
    ctx.strokeStyle = Theme.c('--c-frame');
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

    ctx.fillStyle = Theme.c('--c-label');
    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'center';
    var ticks = 5;
    for (var i = 0; i <= ticks; i++) {
      var t = i / ticks;
      var value = this.cfg.low + t * (this.cfg.high - this.cfg.low);
      var px = r.x + t * r.w;
      ctx.fillText(value.toFixed(1), px, r.y + r.h + 14);
      ctx.beginPath();
      ctx.moveTo(px, r.y + r.h);
      ctx.lineTo(px, r.y + r.h + 4);
      ctx.strokeStyle = Theme.c('--c-frame');
      ctx.stroke();

      var py = r.y + r.h - t * r.h;
      ctx.textAlign = 'right';
      ctx.fillText(value.toFixed(1), r.x - 6, py + 3);
      ctx.textAlign = 'center';
    }
    ctx.fillText('x1', r.x + r.w / 2, r.y + r.h + 25);
    ctx.save();
    ctx.translate(11, r.y + r.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('x2', 0, 0);
    ctx.restore();

    // colour bar on the right: which colour means which f(x)
    var barX = r.x + r.w + 14;
    var barW = 12;
    for (var s = 0; s < r.h; s++) {
      ctx.fillStyle = cssColorForT(1 - s / r.h, this.bands);
      ctx.fillRect(barX, r.y + s, barW, 1);
    }
    ctx.strokeStyle = Theme.c('--c-frame');
    ctx.strokeRect(barX + 0.5, r.y + 0.5, barW - 1, r.h - 1);
    ctx.fillStyle = Theme.c('--c-label');
    ctx.textAlign = 'left';
    ctx.fillText(this.heatMax.toFixed(1), barX + barW + 3, r.y + 8);
    ctx.fillText(this.heatMin.toFixed(1), barX + barW + 3, r.y + r.h - 2);
    ctx.save();
    ctx.translate(barX + barW + 30, r.y + r.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('f(x)', 0, 0);
    ctx.restore();
    ctx.textAlign = 'center';

    // origin cross = the known global minimum
    var o = this.toScreen(0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(o[0] - 9, o[1]); ctx.lineTo(o[0] + 9, o[1]);
    ctx.moveTo(o[0], o[1] - 9); ctx.lineTo(o[0], o[1] + 9);
    ctx.stroke();
    ctx.setLineDash([]);

    // ---- overlay links drawn under the dots ----
    var ov = this.overlay;
    if (ov.links) {
      for (var L = 0; L < ov.links.length; L++) {
        var link = ov.links[L];
        var p1 = this.toScreen(link.from[0], link.from[1]);
        var p2 = this.toScreen(link.to[0], link.to[1]);
        ctx.strokeStyle = link.color || '#ffffff';
        ctx.lineWidth = link.width || 1.2;
        ctx.setLineDash(link.dash || []);
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.stroke();
        ctx.setLineDash([]);
        if (link.arrow) { this.arrowHead(p1, p2, link.color || '#fff'); }
      }
    }

    // ---- the population ----
    var pop = this.data.population || [];
    var vals = this.data.values || [];
    var picked = ov.pickCounts || null;

    for (var i2 = 0; i2 < pop.length; i2++) {
      var p = this.toScreen(pop[i2][0], pop[i2][1]);
      var isBest = (i2 === this.data.bestIndex);
      var isWorst = (i2 === this.data.worstIndex);
      var isElite = (this.data.eliteIndices || []).indexOf(i2) >= 0;

      // halo showing how often roulette picked this individual
      if (picked && picked[i2]) {
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255,209,102,.20)';
        ctx.arc(p[0], p[1], 4 + Math.min(14, picked[i2] * 2.4), 0, 6.2832);
        ctx.fill();
      }

      this.individual(p[0], p[1], isBest, isWorst, isElite);
      if (this.showIds) { this.idLabel(p[0], p[1], String(i2)); }
    }

    // ---- overlay markers drawn on top ----
    if (ov.marks) {
      for (var m = 0; m < ov.marks.length; m++) {
        var mk = ov.marks[m];
        this.mark(mk, this.toScreen(mk.at[0], mk.at[1]));
      }
    }
  },

  arrowHead: function (p1, p2, color) {
    var ctx = this.ctx;
    var ang = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
    ctx.save();
    ctx.translate(p2[0], p2[1]);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-7, 3.2);
    ctx.lineTo(-7, -3.2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  },

  /* ---------------- markers -------------------------------------------
     Both views draw their markers through these, so what the 2D map shows
     and what the 3D surface shows cannot drift apart.

     Every marker sits on a dark halo. The colour scale runs from red in the
     basin to green on the rim, so a plain gold or red dot would disappear
     against parts of it; the halo keeps each one readable wherever it
     lands. */

  HALO: 'rgba(0,0,0,.72)',

  dot: function (x, y, r, color) {
    var ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.2832);
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = this.HALO;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fill();
  },

  ring: function (x, y, r, color) {
    var ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.2832);
    ctx.lineWidth = 3.6;
    ctx.strokeStyle = this.HALO;
    ctx.stroke();
    ctx.lineWidth = 1.7;
    ctx.strokeStyle = color;
    ctx.stroke();
  },

  square: function (x, y, half, color) {
    var ctx = this.ctx;
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = this.HALO;
    ctx.strokeRect(x - half, y - half, half * 2, half * 2);
    ctx.fillStyle = color;
    ctx.fillRect(x - half, y - half, half * 2, half * 2);
  },

  star: function (cx, cy, radius, color) {
    var ctx = this.ctx;
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var ang = -Math.PI / 2 + i * Math.PI / 5;
      var rr = (i % 2 === 0) ? radius : radius * 0.45;
      var px = cx + Math.cos(ang) * rr;
      var py = cy + Math.sin(ang) * rr;
      if (i === 0) { ctx.moveTo(px, py); } else { ctx.lineTo(px, py); }
    }
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = this.HALO;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineJoin = 'miter';
  },

  /* one individual, in the colours and shapes the legend lists */
  individual: function (x, y, isBest, isWorst, isElite) {
    if (isBest) {
      this.star(x, y, 7.5, '#ffd166');
    } else {
      this.dot(x, y, 3.4, isWorst ? '#ff6b81' : '#ffffff');
    }
    // wide enough to sit outside the star, when the best is also an elite
    if (isElite) { this.ring(x, y, isBest ? 9.5 : 7, '#3ddc97'); }
  },

  /* one marker asked for by a stage animation */
  mark: function (mk, q) {
    var ctx = this.ctx;
    if (mk.shape === 'square') {
      this.square(q[0], q[1], 4.5, mk.color);
    } else if (mk.shape === 'star') {
      this.star(q[0], q[1], 8, mk.color);
    } else if (mk.shape === 'ring') {
      this.ring(q[0], q[1], mk.r || 10, mk.color);
    } else {
      this.dot(q[0], q[1], 4.5, mk.color);
    }
    if (mk.label) {
      ctx.font = 'bold 10px Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.lineWidth = 3;
      ctx.strokeStyle = this.HALO;
      ctx.strokeText(mk.label, q[0] + 9, q[1] - 8);
      ctx.fillStyle = mk.color;
      ctx.fillText(mk.label, q[0] + 9, q[1] - 8);
    }
  },

  /* the number beside a dot when "ids" is ticked */
  idLabel: function (x, y, text) {
    var ctx = this.ctx;
    ctx.font = '9px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.lineWidth = 3;
    ctx.strokeStyle = this.HALO;
    ctx.strokeText(text, x + 6, y - 6);
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.fillText(text, x + 6, y - 6);
  },


  /* ============================ 3D ================================== */

  /* Everything in the 3D view lives in a normalised cube:
       u = x1 mapped to -1 .. 1
       v = x2 mapped to -1 .. 1
       w = f(x) mapped to roughly -0.35 .. 0.5   (up on screen)
     The camera spins that cube by the azimuth, tilts it by the elevation
     and draws it flat. The floor, the axes, the surface and the population
     all go through here, so they always line up. */

  FLOOR_W: -0.62,

  toUVW: function (x1, x2, z) {
    var low = this.cfg.low, high = this.cfg.high;
    var mid = (low + high) / 2;
    var half = (high - low) / 2;
    var t = (z - this.zmin) / ((this.zmax - this.zmin) || 1);
    return [(x1 - mid) / half, (x2 - mid) / half, t * 0.85 - 0.35];
  },

  projectUVW: function (u, v, w) {
    var ca = Math.cos(this.az), sa = Math.sin(this.az);
    var ru = u * ca - v * sa;
    var rv = u * sa + v * ca;

    var ce = Math.cos(this.el), se = Math.sin(this.el);
    var sx = ru;
    var sy = rv * se - w * ce;

    /* Distance from the eye. The eye sits above and in front, so the near
       edge of the floor is the one drawn low on screen, and a point lifted
       above the floor is closer than the same spot lying on it. Faces get
       painted far ones first. */
    var depth = -(rv * ce + w * se);

    var scale = Math.min(this.w, this.h) * 0.41 * this.zoom;
    return [this.w / 2 + sx * scale,
            this.h * 0.50 + sy * scale * 0.92,
            depth];
  },

  /* world point -> screen point + depth */
  project: function (x1, x2, z) {
    var p = this.toUVW(x1, x2, z);
    return this.projectUVW(p[0], p[1], p[2]);
  },

  /* the spot on the floor straight below a world point */
  projectFloor: function (x1, x2) {
    var p = this.toUVW(x1, x2, this.zmin);
    return this.projectUVW(p[0], p[1], this.FLOOR_W);
  },

  /* ---------------- the scene ---------------------------------------- */

  draw3d: function () {
    this.backdrop3d();
    this.floor3d();
    this.surface3d(this.hiQuality);
    this.axisLabels3d();
    this.origin3d();
    this.population3d();

    var ctx = this.ctx;
    ctx.fillStyle = Theme.c('--c-label');
    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('f(x) range  ' + this.zmin.toFixed(2) + ' .. ' + this.zmax.toFixed(2),
                 10, this.h - 8);
  },

  backdrop3d: function () {
    var ctx = this.ctx;
    var g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, Theme.c('--c-3d-top'));
    g.addColorStop(1, Theme.c('--c-3d-bottom'));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  },

  /* faint grid under the surface, plus the three labelled axes */
  floor3d: function () {
    var ctx = this.ctx;
    var ext = 1.28;
    var steps = 12;
    var i, t, p1, p2;

    ctx.lineWidth = 1;
    ctx.strokeStyle = Theme.c('--c-floor');
    ctx.beginPath();
    for (i = 0; i <= steps; i++) {
      t = -ext + 2 * ext * i / steps;
      p1 = this.projectUVW(t, -ext, this.FLOOR_W);
      p2 = this.projectUVW(t, ext, this.FLOOR_W);
      ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]);
      p1 = this.projectUVW(-ext, t, this.FLOOR_W);
      p2 = this.projectUVW(ext, t, this.FLOOR_W);
      ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]);
    }
    ctx.stroke();

    ctx.lineWidth = 1.4;
    this.axisEnds = [
      this.axis3d([-ext - 0.12, 0], [ext + 0.12, 0], Theme.c('--c-axis-x1')),
      this.axis3d([0, -ext - 0.12], [0, ext + 0.12], Theme.c('--c-axis-x2'))
    ];
  },

  axis3d: function (from, to, color) {
    var ctx = this.ctx;
    var a = this.projectUVW(from[0], from[1], this.FLOOR_W);
    var b = this.projectUVW(to[0], to[1], this.FLOOR_W);
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    return { a: a, b: b, color: color };
  },

  /* The axis names and the cost axis go on last so the surface cannot
     swallow them - the same way they read in a plotting library. */
  axisLabels3d: function () {
    var ctx = this.ctx;
    var low = this.cfg.low.toFixed(1), high = this.cfg.high.toFixed(1);
    var ends = this.axisEnds || [];
    var names = [['-x1 (' + low + ')', '+x1 (' + high + ')'],
                 ['-x2 (' + low + ')', '+x2 (' + high + ')']];

    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'center';
    for (var i = 0; i < ends.length; i++) {
      var e = ends[i];
      ctx.fillStyle = e.color;
      this.tag(names[i][0], e.a[0], e.a[1] + (e.a[1] > e.b[1] ? 13 : -6), e.color);
      this.tag(names[i][1], e.b[0], e.b[1] + (e.b[1] > e.a[1] ? 13 : -6), e.color);
    }

    // cost axis: from the surface at the centre, straight up
    var foot = this.project(0, 0, ackley2d(0, 0, this.cfg.a, this.cfg.b, this.cfg.c));
    var top = this.projectUVW(0, 0, 1.05);
    ctx.strokeStyle = Theme.c('--c-axis-z');
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(foot[0], foot[1]);
    ctx.lineTo(top[0], top[1]);
    ctx.stroke();
    this.tag('Cost f(x)', top[0], top[1] - 6, Theme.c('--c-axis-z'));
  },

  /* small readable label: a dark plate behind the text */
  tag: function (text, x, y, color) {
    var ctx = this.ctx;
    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'center';
    var pad = 4;
    var w = ctx.measureText(text).width + pad * 2;
    ctx.fillStyle = Theme.c('--c-plate');
    ctx.fillRect(x - w / 2, y - 9, w, 13);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  },

  /* ---------------- the surface ---------------------------------------

     The surface is not painted as a set of flat tiles any more. It is
     rasterised into an offscreen buffer one pixel at a time: the surface
     normal is interpolated across each triangle and the lighting is worked
     out per pixel, so the mesh cells vanish and the whole thing reads as a
     single moulded plastic object. A depth buffer decides what is in front
     of what, which also removes the old back-to-front sorting.

     The buffer depends only on the function and the camera, so it is kept
     until one of those changes. Moving the population costs nothing. */

  surfaceKey: '',
  surfaceBuf: null,
  lutKey: '',
  lut: null,

  /* 256 colours of the map, looked up per pixel */
  colorLUT: function () {
    var key = this.bands ? 'bands' : 'plain';
    if (this.lutKey === key && this.lut) { return this.lut; }
    var lut = new Uint8Array(256 * 3);
    for (var i = 0; i < 256; i++) {
      var c = colorForT(i / 255, this.bands);
      lut[i * 3] = c[0];
      lut[i * 3 + 1] = c[1];
      lut[i * 3 + 2] = c[2];
    }
    this.lut = lut;
    this.lutKey = key;
    return lut;
  },

  surface3d: function (fine) {
    var ss = fine ? 2 : 1;          // supersample once the camera settles
    var key = [this.az.toFixed(4), this.el.toFixed(4), this.zoom.toFixed(4),
               this.heatKey, ss].join('|');
    if (key !== this.surfaceKey || !this.surfaceBuf) {
      this.surfaceBuf = this.renderSurface(ss);
      this.surfaceKey = key;
    }
    if (this.surfaceBuf) {
      this.ctx.drawImage(this.surfaceBuf, 0, 0, this.w, this.h);
    }
  },

  renderSurface: function (ss) {
    var ratio = (window.devicePixelRatio || 1) * ss;
    var W = Math.max(1, Math.round(this.w * ratio));
    var H = Math.max(1, Math.round(this.h * ratio));

    var off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    var octx = off.getContext('2d');
    var img = octx.createImageData(W, H);
    var px = img.data;

    var zbuf = new Float32Array(W * H);
    zbuf.fill(1e9);

    var m = this.gridN;
    var n1 = m + 1;
    var gz = this.gridZ, gnu = this.gridNU, gnv = this.gridNV, gnw = this.gridNW;
    var zrange = (this.zmax - this.zmin) || 1;

    // ---- project every grid vertex once, and turn its normal to view space
    var count = n1 * n1;
    var vx = new Float32Array(count), vy = new Float32Array(count);
    var vd = new Float32Array(count), vt = new Float32Array(count);
    var nX = new Float32Array(count), nY = new Float32Array(count),
        nZ = new Float32Array(count);

    var ca = Math.cos(this.az), sa = Math.sin(this.az);
    var ce = Math.cos(this.el), se = Math.sin(this.el);
    var scale = Math.min(this.w, this.h) * 0.41 * this.zoom * ratio;
    var cx = this.w / 2 * ratio, cy = this.h * 0.50 * ratio;

    for (var gy = 0; gy < n1; gy++) {
      var v = -1 + 2 * gy / m;
      for (var gx = 0; gx < n1; gx++) {
        var k = gy * n1 + gx;
        var u = -1 + 2 * gx / m;
        var t = (gz[k] - this.zmin) / zrange;
        var w = t * 0.85 - 0.35;

        var rv = u * sa + v * ca;
        vx[k] = cx + (u * ca - v * sa) * scale;
        vy[k] = cy + (rv * se - w * ce) * scale * 0.92;
        vd[k] = -(rv * ce + w * se);
        vt[k] = t;

        var mu = gnu[k], mv = gnv[k], mw = gnw[k];
        var rn = mu * sa + mv * ca;
        nX[k] = mu * ca - mv * sa;
        nY[k] = rn * se - mw * ce;
        nZ[k] = -(rn * ce + mw * se);
      }
    }

    // ---- rasterise two triangles per cell
    var lut = this.colorLUT();
    for (var cy2 = 0; cy2 < m; cy2++) {
      for (var cx2 = 0; cx2 < m; cx2++) {
        var a = cy2 * n1 + cx2;
        var b = a + 1;
        var c = a + n1 + 1;
        var d = a + n1;
        this.tri(px, zbuf, W, H, lut, vx, vy, vd, vt, nX, nY, nZ, a, b, c);
        this.tri(px, zbuf, W, H, lut, vx, vy, vd, vt, nX, nY, nZ, a, c, d);
      }
    }

    octx.putImageData(img, 0, 0);
    return off;
  },

  /* One lit triangle. Normals and colour run across it, and every pixel
     gets its own diffuse term and highlight - that is what kills the
     faceted look. */
  tri: function (px, zbuf, W, H, lut, vx, vy, vd, vt, nX, nY, nZ, i0, i1, i2) {
    var x0 = vx[i0], y0 = vy[i0], x1 = vx[i1], y1 = vy[i1], x2 = vx[i2], y2 = vy[i2];

    var area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (area === 0) { return; }
    if (area < 0) {                       // keep one winding
      var ti = i1; i1 = i2; i2 = ti;
      var tx = x1; x1 = x2; x2 = tx;
      var ty = y1; y1 = y2; y2 = ty;
      area = -area;
    }

    var minX = Math.floor(Math.min(x0, x1, x2));
    var maxX = Math.ceil(Math.max(x0, x1, x2));
    var minY = Math.floor(Math.min(y0, y1, y2));
    var maxY = Math.ceil(Math.max(y0, y1, y2));
    if (minX < 0) { minX = 0; }
    if (minY < 0) { minY = 0; }
    if (maxX > W - 1) { maxX = W - 1; }
    if (maxY > H - 1) { maxY = H - 1; }
    if (minX > maxX || minY > maxY) { return; }

    var inv = 1 / area;
    var d0 = vd[i0], d1 = vd[i1], d2 = vd[i2];
    var t0 = vt[i0], t1 = vt[i1], t2 = vt[i2];
    var ax = nX[i0], ay = nY[i0], az2 = nZ[i0];
    var bx = nX[i1], by = nY[i1], bz = nZ[i1];
    var cx3 = nX[i2], cy3 = nY[i2], cz = nZ[i2];

    // barycentric edge functions, stepped one pixel at a time along a row
    var e0dx = (y1 - y2) * inv;
    var e1dx = (y2 - y0) * inv;

    for (var y = minY; y <= maxY; y++) {
      var py = y + 0.5;
      var l0 = ((y1 - y2) * (minX + 0.5 - x2) + (x2 - x1) * (py - y2)) * inv;
      var l1 = ((y2 - y0) * (minX + 0.5 - x2) + (x0 - x2) * (py - y2)) * inv;
      var row = y * W;

      for (var x = minX; x <= maxX; x++, l0 += e0dx, l1 += e1dx) {
        if (l0 < 0 || l1 < 0) { continue; }
        var l2 = 1 - l0 - l1;
        if (l2 < 0) { continue; }

        var idx = row + x;
        var dep = l0 * d0 + l1 * d1 + l2 * d2;
        if (dep >= zbuf[idx]) { continue; }
        zbuf[idx] = dep;

        var nx = l0 * ax + l1 * bx + l2 * cx3;
        var ny = l0 * ay + l1 * by + l2 * cy3;
        var nz = l0 * az2 + l1 * bz + l2 * cz;
        var s = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx *= s; ny *= s; nz *= s;
        if (nz > 0) { nx = -nx; ny = -ny; nz = -nz; }

        // key light, a weak fill from the other side, and a tight highlight
        var diff = nx * -0.42 + ny * -0.72 + nz * -0.55;
        if (diff < 0) { diff = 0; }
        var fill = nx * 0.55 + ny * -0.25 + nz * -0.79;
        if (fill < 0) { fill = 0; }
        var hs = nx * -0.2386 + ny * -0.4091 + nz * -0.8807;
        var gloss = 0;
        if (hs > 0) {
          var h2 = hs * hs, h4 = h2 * h2, h8 = h4 * h4, h16 = h8 * h8;
          gloss = h16 * hs * 108;
        }

        var lit = 0.30 + 0.66 * diff + 0.16 * fill;
        var ti2 = (l0 * t0 + l1 * t1 + l2 * t2) * 255;
        if (ti2 < 0) { ti2 = 0; } else if (ti2 > 255) { ti2 = 255; }
        ti2 = (ti2 | 0) * 3;

        var o = idx * 4;
        px[o] = lut[ti2] * lit + gloss;
        px[o + 1] = lut[ti2 + 1] * lit + gloss;
        px[o + 2] = lut[ti2 + 2] * lit + gloss;
        px[o + 3] = 255;
      }
    }
  },

  /* the known global minimum, marked on the floor and on the surface */
  origin3d: function () {
    var ctx = this.ctx;
    var i, p;

    ctx.strokeStyle = Theme.c('--c-origin-line');
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (i = 0; i <= 48; i++) {
      var ang = i / 48 * 6.2832;
      p = this.projectUVW(Math.cos(ang) * 0.17, Math.sin(ang) * 0.17, this.FLOOR_W);
      if (i === 0) { ctx.moveTo(p[0], p[1]); } else { ctx.lineTo(p[0], p[1]); }
    }
    ctx.stroke();

    var o = this.project(0, 0, ackley2d(0, 0, this.cfg.a, this.cfg.b, this.cfg.c));
    var glow = ctx.createRadialGradient(o[0], o[1], 0, o[0], o[1], 13);
    glow.addColorStop(0, Theme.rgba('--c-origin-glow', '.45'));
    glow.addColorStop(1, Theme.rgba('--c-origin-glow', '0'));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(o[0], o[1], 13, 0, 6.2832);
    ctx.fill();

    ctx.save();                       // a diamond, so it borrows no legend shape
    ctx.translate(o[0], o[1]);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = Theme.c('--c-origin');
    ctx.fillRect(-3.2, -3.2, 6.4, 6.4);
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-3.2, -3.2, 6.4, 6.4);
    ctx.restore();

    var label = 'origin (0,0) · min f';
    ctx.font = '10px Consolas, monospace';
    this.tag(label, o[0] + 12 + ctx.measureText(label).width / 2, o[1] - 8,
             Theme.c('--c-origin-text'));
  },

  /* ---------------- population + stage overlays ----------------------
     Same colour code as the 2D map and the legend:
       white dot   individual        gold star  best of generation
       green ring  elite             red dot    worst
     plus whatever the running stage asked for (parents, children,
     mutation arrows), projected onto the surface. */

  population3d: function () {
    var ctx = this.ctx;
    var ov = this.overlay;
    var self = this;
    var cfg = this.cfg;

    function onSurface(pt) {
      return self.project(pt[0], pt[1], ackley2d(pt[0], pt[1], cfg.a, cfg.b, cfg.c));
    }

    // links first, so the dots sit on top of them
    if (ov.links) {
      for (var L = 0; L < ov.links.length; L++) {
        var link = ov.links[L];
        var q1 = onSurface(link.from);
        var q2 = onSurface(link.to);
        ctx.strokeStyle = link.color || '#ffffff';
        ctx.lineWidth = link.width || 1.2;
        ctx.setLineDash(link.dash || []);
        ctx.beginPath();
        ctx.moveTo(q1[0], q1[1]);
        ctx.lineTo(q2[0], q2[1]);
        ctx.stroke();
        ctx.setLineDash([]);
        if (link.arrow) { this.arrowHead(q1, q2, link.color || '#fff'); }
      }
    }

    var pop = this.data.population || [];
    var vals = this.data.values || [];
    var picked = ov.pickCounts || null;
    var elites = this.data.eliteIndices || [];

    // near dots last, so they are not hidden by the ones behind them
    var order = [];
    for (var k = 0; k < pop.length; k++) {
      var z = (vals[k] !== undefined) ? vals[k]
              : ackley2d(pop[k][0], pop[k][1], cfg.a, cfg.b, cfg.c);
      order.push({ i: k, top: this.project(pop[k][0], pop[k][1], z) });
    }
    order.sort(function (A, B) { return B.top[2] - A.top[2]; });

    for (var n = 0; n < order.length; n++) {
      var idx = order[n].i;
      var top = order[n].top;
      var base = this.projectFloor(pop[idx][0], pop[idx][1]);

      var isBest = (idx === this.data.bestIndex);
      var isWorst = (idx === this.data.worstIndex);
      var isElite = elites.indexOf(idx) >= 0;

      // a faint stem down to a shadow, so you can read the position on the floor
      ctx.strokeStyle = isBest ? Theme.c('--c-stem-best') : Theme.c('--c-stem');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(base[0], base[1]);
      ctx.lineTo(top[0], top[1]);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(base[0], base[1], 1.6, 0, 6.2832);
      ctx.fillStyle = Theme.c('--c-shadow');
      ctx.fill();

      // roulette halo, same meaning as in the 2D map
      if (picked && picked[idx]) {
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255,209,102,.20)';
        ctx.arc(top[0], top[1], 4 + Math.min(14, picked[idx] * 2.4), 0, 6.2832);
        ctx.fill();
      }

      this.individual(top[0], top[1], isBest, isWorst, isElite);
      if (this.showIds) { this.idLabel(top[0], top[1], String(idx)); }
    }

    // stage markers on top of everything
    if (ov.marks) {
      for (var m2 = 0; m2 < ov.marks.length; m2++) {
        var mk = ov.marks[m2];
        this.mark(mk, onSurface(mk.at));
      }
    }
  }
};
