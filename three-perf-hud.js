/**
 * three-perf-hud — a zero-dependency drop-in performance overlay for three.js.
 *
 * Shows the counters that actually tell you what's slow — straight from
 * `renderer.info` (draw calls, triangles, distinct shader programs, textures,
 * geometries) — plus a rolling **frame-time p50 / p99** with a sparkline. It's the
 * "measure first" habit made visible: glance at it, fix the number that's high,
 * glance again.
 *
 *   import { PerfHUD } from './three-perf-hud.js';
 *   const hud = new PerfHUD(renderer);              // corner overlay, press ` to toggle
 *   function frame() {
 *     renderer.render(scene, camera);
 *     hud.update();                                 // call once per frame, after render
 *     requestAnimationFrame(frame);
 *   }
 *
 * Works with any object exposing three's `.info` shape; pass `null` for a
 * frame-time-only HUD. `hud.stats()` returns the numbers if you want to log them.
 * `hud.dispose()` removes it.
 *
 * MIT.
 */

/** Linear-interpolated percentile of an array (not required sorted). Pure/testable. */
export function percentile(values, p) {
  const n = values.length;
  if (n === 0) return 0;
  const a = Float64Array.from(values).sort();
  if (n === 1) return a[0];
  const rank = (p / 100) * (n - 1);
  const lo = Math.floor(rank), hi = Math.ceil(rank);
  return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (rank - lo);
}

const CORNERS = {
  'top-left': 'top:8px;left:8px', 'top-right': 'top:8px;right:8px',
  'bottom-left': 'bottom:8px;left:8px', 'bottom-right': 'bottom:8px;right:8px',
};

export class PerfHUD {
  /**
   * @param {{info?:object}|null} renderer a three.js WebGLRenderer (or null).
   * @param {object} [opts]
   *   corner  'top-left'|'top-right'|'bottom-left'|'bottom-right'  (default top-left)
   *   window  frames kept for p50/p99                              (default 120)
   *   hz      DOM repaint rate                                     (default 10)
   *   target  target frame ms, drawn as a line on the sparkline    (default 16.7)
   *   key     toggle-visibility key ('' to disable)                (default '`')
   *   visible start visible                                        (default true)
   */
  constructor(renderer = null, opts = {}) {
    this.renderer = renderer;
    this.window = Math.max(8, opts.window || 120);
    this._interval = 1000 / (opts.hz || 10);
    this.target = opts.target || 16.7;

    this._times = new Float64Array(this.window);
    this._count = 0;
    this._i = 0;
    this._last = (typeof performance !== 'undefined' ? performance : Date).now();
    this._lastPaint = 0;

    if (typeof document === 'undefined') return; // headless: stats() still works
    const el = document.createElement('div');
    el.style.cssText =
      `position:fixed;${CORNERS[opts.corner] || CORNERS['top-left']};z-index:100000;` +
      'font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#9fe6a0;' +
      'background:rgba(0,0,0,0.72);border:1px solid #2a2a2a;border-radius:4px;' +
      'padding:5px 7px;pointer-events:none;white-space:pre;user-select:none;';
    const pre = document.createElement('div');
    const cv = document.createElement('canvas');
    cv.width = this.window; cv.height = 28;
    cv.style.cssText = `display:block;width:${this.window}px;height:28px;margin-top:4px;`;
    el.append(pre, cv);
    document.body.appendChild(el);
    this._el = el; this._pre = pre; this._cv = cv; this._ctx = cv.getContext('2d');

    if (opts.visible === false) el.style.display = 'none';
    const key = opts.key === undefined ? '`' : opts.key;
    if (key) {
      this._onKey = (e) => { if (e.key === key) el.style.display = el.style.display === 'none' ? 'block' : 'none'; };
      window.addEventListener('keydown', this._onKey);
    }
  }

  update(renderer = this.renderer) {
    const now = (typeof performance !== 'undefined' ? performance : Date).now();
    const dt = now - this._last;
    this._last = now;
    this._times[this._i] = dt;
    this._i = (this._i + 1) % this.window;
    this._count = Math.min(this._count + 1, this.window);
    if (this._el && now - this._lastPaint >= this._interval) {
      this._paint(renderer);
      this._lastPaint = now;
    }
  }

  /** Current numbers — also usable headless (for logging / CI). */
  stats(renderer = this.renderer) {
    const ms = this._times.subarray(0, this._count);
    const p50 = percentile(ms, 50), p99 = percentile(ms, 99);
    const out = { frames: this._count, fps: p50 > 0 ? Math.round(1000 / p50) : 0, p50, p99 };
    const info = renderer && renderer.info;
    if (info) {
      out.calls = info.render?.calls ?? 0;
      out.triangles = info.render?.triangles ?? 0;
      out.programs = info.programs?.length ?? 0;
      out.textures = info.memory?.textures ?? 0;
      out.geometries = info.memory?.geometries ?? 0;
    }
    return out;
  }

  _paint(renderer) {
    const s = this.stats(renderer);
    const k = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n);
    let txt = `${s.fps} fps   ${s.p50.toFixed(1)}ms   p99 ${s.p99.toFixed(1)}ms`;
    if (s.calls !== undefined) {
      txt += `\ncalls ${s.calls}  tris ${k(s.triangles)}  prog ${s.programs}`;
      txt += `\ntex ${s.textures}  geo ${s.geometries}`;
    }
    this._pre.textContent = txt;

    // sparkline of frame time, newest on the right, target line in red
    const ctx = this._ctx, W = this._cv.width, H = this._cv.height;
    ctx.clearRect(0, 0, W, H);
    const scale = Math.max(this.target * 2, 1);
    const yFor = (v) => H - Math.min(H, (v / scale) * H);
    ctx.strokeStyle = '#803030'; ctx.beginPath();
    ctx.moveTo(0, yFor(this.target)); ctx.lineTo(W, yFor(this.target)); ctx.stroke();
    ctx.strokeStyle = '#9fe6a0'; ctx.beginPath();
    for (let j = 0; j < this._count; j++) {
      const idx = (this._i - this._count + j + this.window) % this.window;
      const x = W - this._count + j;
      const y = yFor(this._times[idx]);
      j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  dispose() {
    if (this._onKey) window.removeEventListener('keydown', this._onKey);
    this._el?.remove();
    this._el = null;
  }
}

export default PerfHUD;
