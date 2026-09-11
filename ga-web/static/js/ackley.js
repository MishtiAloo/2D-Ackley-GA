/* =========================================================================
   ackley.js - the Ackley function, for DRAWING ONLY.

   Every number the GA produces (populations, fitness, spins, children,
   mutations) comes from the Python backend, which uses the untouched
   ga_ackley.py. This copy exists only so the browser can paint the
   background heatmap and the 3D surface without asking the server for
   thousands of grid points.
   ========================================================================= */

/* f(x1,x2) with tunable a, b, c - same formula as ga_ackley.ackley() */
function ackley2d(x1, x2, a, b, c) {
  var sumSquares = x1 * x1 + x2 * x2;
  var sumCosines = Math.cos(c * x1) + Math.cos(c * x2);
  var term1 = -a * Math.exp(-b * Math.sqrt(sumSquares / 2));
  var term2 = -Math.exp(sumCosines / 2);
  return term1 + term2 + a + Math.E;
}

/* ---------------------------------------------------------------------------
   Colour map used for the heatmap and the 3D surface.
   t = 0 -> deep blue (low f, good), t = 1 -> pale yellow (high f, bad).
   --------------------------------------------------------------------------- */
var COLOR_STOPS = [
  [8, 12, 40],
  [26, 62, 120],
  [21, 122, 129],
  [76, 176, 96],
  [214, 198, 70],
  [252, 246, 206]
];

function colorForT(t, bands) {
  if (t < 0) { t = 0; }
  if (t > 1) { t = 1; }
  if (bands) {
    // quantize into steps so the map looks like contour rings
    t = Math.round(t * 14) / 14;
  }
  var span = COLOR_STOPS.length - 1;
  var pos = t * span;
  var i = Math.floor(pos);
  if (i >= span) { i = span - 1; }
  var f = pos - i;
  var A = COLOR_STOPS[i];
  var B = COLOR_STOPS[i + 1];
  return [
    Math.round(A[0] + (B[0] - A[0]) * f),
    Math.round(A[1] + (B[1] - A[1]) * f),
    Math.round(A[2] + (B[2] - A[2]) * f)
  ];
}

function cssColorForT(t, bands) {
  var c = colorForT(t, bands);
  return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
}
