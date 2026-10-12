# three-perf-hud

**A zero-dependency drop-in performance overlay for three.js** — the counters that
actually tell you what's slow, plus a rolling frame-time p50/p99, in one corner div.

It's the "measure first" habit made visible: glance at it, fix the number that's high,
glance again. (Companion to the
[browser three.js optimization](https://github.com/iniGlowee/threejs-game-optimization)
write-up — that paper says *which* numbers matter; this puts them on screen.)

## What it shows

Straight from `renderer.info` + frame timing:

```
 63 fps   15.8ms   p99 24.1ms
calls 95  tris 81.2k  prog 6
tex 64  geo 72
```
plus a sparkline of frame time with your target line.

- **fps / p50 / p99** — frame time over a rolling window. p99 is the one that reveals
  hitches an average hides.
- **calls** — draw calls. **tris** — triangles. **prog** — distinct compiled shader
  programs (surprise-expensive; watch it jump when a `MeshPhysicalMaterial` sneaks in).
- **tex / geo** — live textures and geometries in GPU memory.

## Usage

```js
import { PerfHUD } from './three-perf-hud.js';

const hud = new PerfHUD(renderer);     // corner overlay; press ` to toggle

function frame() {
  renderer.render(scene, camera);
  hud.update();                        // the one line you add, once per frame after render
  requestAnimationFrame(frame);
}
```

Options: `corner` (`'top-left'|'top-right'|'bottom-left'|'bottom-right'`), `window`
(frames for p50/p99, default 120), `hz` (DOM repaint rate, default 10), `target`
(frame ms line, default 16.7), `key` (toggle key, default `` ` ``; `''` to disable),
`visible`.

```js
new PerfHUD(renderer, { corner: 'bottom-right', target: 8.3, window: 240 });
hud.stats();     // { fps, p50, p99, calls, triangles, programs, textures, geometries }
hud.dispose();   // remove it
```

- Works with **any** object exposing three's `.info` shape.
- Pass `null` for a **frame-time-only** HUD (no renderer counters).
- `stats()` works headless too — handy for logging or a CI perf gate.

Zero dependencies (DOM + canvas + `performance.now`). **three.js is a peer** — bring
your own. Open `demo.html` to see it live (loads three from a CDN).

## Scope / non-goals

- **CPU frame time** (wall-clock between `update()` calls) — the practical "is the loop
  keeping up" number. Not GPU timer-query time (that needs
  `EXT_disjoint_timer_query_webgl2` and is a different tool).
- A HUD, not a profiler. It tells you *that* something's heavy and roughly where to
  look; a captured profile tells you *why*.
- The HUD repaints its DOM at `hz` (default 10/s), so it costs almost nothing — but
  it's a dev tool; strip it from production builds.

## Provenance

From the AE1 ("Angel's Egg") engine's optimization work, where reading `renderer.info`
+ a frame sampler is how the real costs (a 550 MB texture problem, a stray heavy
shader) got caught. This is that habit as a drop-in widget.

## License

MIT — see [LICENSE](LICENSE).
