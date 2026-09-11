/* =========================================================================
   landscape.js - draws the search space

     2D view : heatmap of f(x1,x2) with the population on top
     3D view : rotatable surface of f(x1,x2) with the population floating on it

   The stage animations push "overlays" in here (highlighted dots, parent /
   child links, mutation arrows) and then ask for a redraw.
   ========================================================================= */

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
  gridN: 56,
  zmin: 0,
  zmax: 1,

  // 3D camera
  az: -0.7,
  el: 0.95,
  zoom: 1,
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
    window.addEventListener('mouseup', function () { self.dragging = false; });
    window.addEventListener('mousemove', function (e) {
      if (!self.dragging) { return; }
      self.az += (e.clientX - self.lastX) * 0.01;
      self.el += (e.clientY - self.lastY) * 0.01;
      if (self.el < 0.12) { self.el = 0.12; }
      if (self.el > 1.5) { self.el = 1.5; }
      self.lastX = e.clientX;
      self.lastY = e.clientY;
      self.draw();
    });
    canvas.addEventListener('wheel', function (e) {
      if (self.view !== '3d') { return; }
      e.preventDefault();
      self.zoom *= (e.deltaY > 0 ? 0.92 : 1.08);
      if (self.zoom < 0.4) { self.zoom = 0.4; }
      if (self.zoom > 3) { self.zoom = 3; }
      self.draw();
    }, { passive: false });

    this.resize();
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

    // coarse grid for the 3D surface
    var m = this.gridN;
    var grid = [];
    var zmin = Infinity, zmax = -Infinity;
    for (var gy = 0; gy <= m; gy++) {
      var rowArr = [];
      for (var gx = 0; gx <= m; gx++) {
        var wx = low + span * gx / m;
        var wy = low + span * gy / m;
        var z = ackley2d(wx, wy, a, b, c);
        rowArr.push(z);
        if (z < zmin) { zmin = z; }
        if (z > zmax) { zmax = z; }
      }
      grid.push(rowArr);
    }
    this.gridZ = grid;
    this.zmin = zmin;
    this.zmax = zmax;
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
    ctx.strokeStyle = '#2b3545';
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

    ctx.fillStyle = '#8d9bb0';
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
      ctx.strokeStyle = '#2b3545';
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
    ctx.strokeStyle = '#2b3545';
    ctx.strokeRect(barX + 0.5, r.y + 0.5, barW - 1, r.h - 1);
    ctx.fillStyle = '#8d9bb0';
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

      ctx.beginPath();
      ctx.arc(p[0], p[1], isBest ? 0 : 3.2, 0, 6.2832);
      ctx.fillStyle = isWorst ? '#ff6b81' : 'rgba(255,255,255,.92)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,.65)';
      ctx.stroke();

      if (isElite) {
        ctx.beginPath();
        ctx.arc(p[0], p[1], 6.5, 0, 6.2832);
        ctx.strokeStyle = '#3ddc97';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      if (isBest) { this.star(p[0], p[1], 7.5, '#ffd166'); }

      if (this.showIds) {
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.font = '9px Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(String(i2), p[0] + 5, p[1] - 5);
      }
    }

    // ---- overlay markers drawn on top ----
    if (ov.marks) {
      for (var m = 0; m < ov.marks.length; m++) {
        var mk = ov.marks[m];
        var q = this.toScreen(mk.at[0], mk.at[1]);
        ctx.lineWidth = 1.6;
        if (mk.shape === 'square') {
          ctx.fillStyle = mk.color;
          ctx.fillRect(q[0] - 4.5, q[1] - 4.5, 9, 9);
          ctx.strokeStyle = 'rgba(0,0,0,.6)';
          ctx.strokeRect(q[0] - 4.5, q[1] - 4.5, 9, 9);
        } else if (mk.shape === 'star') {
          this.star(q[0], q[1], 8, mk.color);
        } else if (mk.shape === 'ring') {
          ctx.beginPath();
          ctx.arc(q[0], q[1], mk.r || 10, 0, 6.2832);
          ctx.strokeStyle = mk.color;
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(q[0], q[1], 4.5, 0, 6.2832);
          ctx.fillStyle = mk.color;
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,.6)';
          ctx.stroke();
        }
        if (mk.label) {
          ctx.fillStyle = mk.color;
          ctx.font = 'bold 10px Consolas, monospace';
          ctx.textAlign = 'left';
          ctx.fillText(mk.label, q[0] + 8, q[1] - 7);
        }
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
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.stroke();
  },

  /* ============================ 3D ================================== */

  /* world point -> screen point + depth */
  project: function (x1, x2, z) {
    var low = this.cfg.low, high = this.cfg.high;
    var mid = (low + high) / 2;
    var half = (high - low) / 2;

    var u = (x1 - mid) / half;                 // -1 .. 1
    var v = (x2 - mid) / half;
    var w = (z - this.zmin) / ((this.zmax - this.zmin) || 1);
    w = w * 0.85 - 0.35;                       // height, roughly -0.35 .. 0.5

    var ca = Math.cos(this.az), sa = Math.sin(this.az);
    var ru = u * ca - v * sa;
    var rv = u * sa + v * ca;

    var ce = Math.cos(this.el), se = Math.sin(this.el);
    var sx = ru;
    var sy = rv * se - w * ce;
    var depth = rv * ce + w * se;

    var scale = Math.min(this.w, this.h) * 0.42 * this.zoom;
    return [this.w / 2 + sx * scale, this.h / 2 + sy * scale * 0.92, depth];
  },

  draw3d: function () {
    var ctx = this.ctx;
    var grid = this.gridZ;
    var m = this.gridN;
    var low = this.cfg.low, high = this.cfg.high, span = high - low;

    // collect every cell with its depth so we can paint far ones first
    var cells = [];
    for (var gy = 0; gy < m; gy++) {
      for (var gx = 0; gx < m; gx++) {
        var x1a = low + span * gx / m;
        var x1b = low + span * (gx + 1) / m;
        var x2a = low + span * gy / m;
        var x2b = low + span * (gy + 1) / m;

        var p00 = this.project(x1a, x2a, grid[gy][gx]);
        var p10 = this.project(x1b, x2a, grid[gy][gx + 1]);
        var p11 = this.project(x1b, x2b, grid[gy + 1][gx + 1]);
        var p01 = this.project(x1a, x2b, grid[gy + 1][gx]);

        var zavg = (grid[gy][gx] + grid[gy][gx + 1] +
                    grid[gy + 1][gx + 1] + grid[gy + 1][gx]) / 4;
        var davg = (p00[2] + p10[2] + p11[2] + p01[2]) / 4;
        cells.push([davg, p00, p10, p11, p01, zavg]);
      }
    }
    cells.sort(function (A, B) { return B[0] - A[0]; });

    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      var t = (cell[5] - this.zmin) / ((this.zmax - this.zmin) || 1);
      ctx.beginPath();
      ctx.moveTo(cell[1][0], cell[1][1]);
      ctx.lineTo(cell[2][0], cell[2][1]);
      ctx.lineTo(cell[3][0], cell[3][1]);
      ctx.lineTo(cell[4][0], cell[4][1]);
      ctx.closePath();
      ctx.fillStyle = cssColorForT(t, this.bands);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.18)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // the population sits on the surface
    var pop = this.data.population || [];
    var vals = this.data.values || [];
    for (var k = 0; k < pop.length; k++) {
      var z = (vals[k] !== undefined) ? vals[k]
              : ackley2d(pop[k][0], pop[k][1], this.cfg.a, this.cfg.b, this.cfg.c);
      var top = this.project(pop[k][0], pop[k][1], z);
      var base = this.project(pop[k][0], pop[k][1], this.zmin);

      ctx.strokeStyle = 'rgba(255,255,255,.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(base[0], base[1]);
      ctx.lineTo(top[0], top[1]);
      ctx.stroke();

      var isBest = (k === this.data.bestIndex);
      if (isBest) {
        this.star(top[0], top[1], 8, '#ffd166');
      } else {
        ctx.beginPath();
        ctx.arc(top[0], top[1], 3, 0, 6.2832);
        ctx.fillStyle = (k === this.data.worstIndex) ? '#ff6b81' : '#ffffff';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.6)';
        ctx.stroke();
      }
    }

    ctx.fillStyle = '#8d9bb0';
    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('f(x) range  ' + this.zmin.toFixed(2) + ' .. ' + this.zmax.toFixed(2),
                 10, this.h - 8);
  }
};
