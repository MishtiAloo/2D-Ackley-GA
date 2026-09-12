/* =========================================================================
   theme.js - the dark / light switch.

   The page itself is styled entirely by the custom properties in style.css,
   so switching theme is one attribute on <html>. The two canvases cannot be
   styled that way, so they ask for the same properties through Theme.c()
   instead of keeping a second copy of the palette in JavaScript. Add a
   colour in the stylesheet and both the page and the drawings pick it up.
   ========================================================================= */

var Theme = {

  KEY: 'ga.theme',
  name: 'dark',
  cache: {},
  listeners: [],

  /* Called before anything is drawn: last choice wins, and failing that
     whatever the operating system asks for. */
  init: function () {
    this.set(this.stored() || this.preferred(), true);
  },

  stored: function () {
    try {
      var v = localStorage.getItem(this.KEY);
      return (v === 'light' || v === 'dark') ? v : null;
    } catch (err) {
      return null;
    }
  },

  preferred: function () {
    return (window.matchMedia &&
            window.matchMedia('(prefers-color-scheme: light)').matches)
           ? 'light' : 'dark';
  },

  set: function (name, quiet) {
    this.name = (name === 'light') ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', this.name);
    this.cache = {};                    // the properties all changed value

    try {
      localStorage.setItem(this.KEY, this.name);
    } catch (err) {
      /* private browsing - the theme just will not be remembered */
    }

    if (!quiet) {
      for (var i = 0; i < this.listeners.length; i++) {
        this.listeners[i](this.name);
      }
    }
  },

  onChange: function (fn) {
    this.listeners.push(fn);
  },

  /* One custom property, read once per theme and then remembered. */
  c: function (name) {
    if (this.cache[name] === undefined) {
      var value = getComputedStyle(document.documentElement)
                    .getPropertyValue(name);
      this.cache[name] = value ? value.trim() : '#888888';
    }
    return this.cache[name];
  },

  /* Same, but wrapped up as rgba() - for properties held as bare channels
     so a drawing can pick its own opacity. */
  rgba: function (name, alpha) {
    return 'rgba(' + this.c(name) + ',' + alpha + ')';
  }
};
