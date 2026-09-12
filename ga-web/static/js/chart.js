/* =========================================================================
   chart.js - the convergence plot: best and average f(x) per generation
   ========================================================================= */

var Chart = {

  canvas: null,
  ctx: null,
  log: true,
  best: [],
  avg: [],
  maxGen: 100,

  init: function (canvas) {
    var self = this;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    window.addEventListener('resize', function () { self.resize(); });
    this.resize();
  },

  resize: function () {
    var ratio = window.devicePixelRatio || 1;
    var rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(50, Math.round(rect.width * ratio));
    this.canvas.height = Math.max(40, Math.round(rect.height * ratio));
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.w = rect.width;
    this.h = rect.height;
    this.draw();
  },

  setData: function (best, avg, maxGen) {
    this.best = best || [];
    this.avg = avg || [];
    if (maxGen) { this.maxGen = maxGen; }
    this.draw();
  },

  /* value -> pixel, honouring the log switch (log of a tiny value is
     clamped so the curve never runs off the bottom of the box) */
  yFor: function (value, rect, vmin, vmax) {
    var t;
    if (this.log) {
      var floor = 1e-12;
      var lv = Math.log10(Math.max(value, floor));
      var lo = Math.log10(Math.max(vmin, floor));
      var hi = Math.log10(Math.max(vmax, floor * 10));
      t = (lv - lo) / ((hi - lo) || 1);
    } else {
      t = (value - vmin) / ((vmax - vmin) || 1);
    }
    if (t < 0) { t = 0; }
    if (t > 1) { t = 1; }
    return rect.y + rect.h - t * rect.h;
  },

  draw: function () {
    if (!this.ctx) { return; }
    var ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    var rect = { x: 46, y: 8, w: this.w - 58, h: this.h - 30 };
    ctx.strokeStyle = Theme.c('--c-chart-frame');
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

    if (this.best.length === 0) {
      ctx.fillStyle = Theme.c('--c-chart-label');
      ctx.font = '11px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('no generations yet', this.w / 2, this.h / 2);
      return;
    }

    // value range over both curves
    var vmin = Infinity, vmax = -Infinity;
    var all = this.best.concat(this.avg);
    for (var i = 0; i < all.length; i++) {
      if (all[i] < vmin) { vmin = all[i]; }
      if (all[i] > vmax) { vmax = all[i]; }
    }
    if (this.log && vmin <= 0) { vmin = 1e-12; }
    if (vmax === vmin) { vmax = vmin + 1; }

    var genCount = Math.max(this.best.length, 2);
    var xFor = function (index) {
      return rect.x + (index / (genCount - 1)) * rect.w;
    };

    // horizontal guides
    ctx.font = '9px Consolas, monospace';
    ctx.fillStyle = Theme.c('--c-chart-label');
    ctx.textAlign = 'right';
    var lines = 4;
    for (var g = 0; g <= lines; g++) {
      var t = g / lines;
      var value;
      if (this.log) {
        var lo = Math.log10(Math.max(vmin, 1e-12));
        var hi = Math.log10(vmax);
        value = Math.pow(10, lo + t * (hi - lo));
      } else {
        value = vmin + t * (vmax - vmin);
      }
      var py = this.yFor(value, rect, vmin, vmax);
      ctx.strokeStyle = Theme.c('--c-chart-guide');
      ctx.beginPath();
      ctx.moveTo(rect.x, py);
      ctx.lineTo(rect.x + rect.w, py);
      ctx.stroke();
      ctx.fillText(value.toExponential(0), rect.x - 5, py + 3);
    }

    // average curve
    var self = this;
    var drawLine = function (series, color, width) {
      ctx.beginPath();
      for (var i = 0; i < series.length; i++) {
        var px = xFor(i);
        var py = self.yFor(series[i], rect, vmin, vmax);
        if (i === 0) { ctx.moveTo(px, py); } else { ctx.lineTo(px, py); }
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    };

    var bestColor = Theme.c('--c-series-best');
    var avgColor = Theme.c('--c-series-avg');
    drawLine(this.avg, avgColor, 1.1);
    drawLine(this.best, bestColor, 1.8);

    // last point
    var lastX = xFor(this.best.length - 1);
    var lastY = this.yFor(this.best[this.best.length - 1], rect, vmin, vmax);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3, 0, 6.2832);
    ctx.fillStyle = bestColor;
    ctx.fill();

    // x labels + legend
    ctx.textAlign = 'center';
    ctx.fillStyle = Theme.c('--c-chart-label');
    ctx.fillText('1', rect.x, rect.y + rect.h + 13);
    ctx.fillText(String(this.best.length), rect.x + rect.w, rect.y + rect.h + 13);
    ctx.fillText('generation', rect.x + rect.w / 2, rect.y + rect.h + 13);

    ctx.textAlign = 'left';
    ctx.fillStyle = bestColor;
    ctx.fillText('best', rect.x + 6, rect.y + 11);
    ctx.fillStyle = avgColor;
    ctx.fillText('average', rect.x + 40, rect.y + 11);
  }
};
