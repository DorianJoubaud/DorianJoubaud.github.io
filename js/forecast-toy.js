/* ============================================================
   Forecast toy: an observed window of 48 points, followed by
   possible futures sampled from a Gaussian process fitted to it.
   Each future is drawn left to right, held, then fades out.
   Drag on the observed side to redraw the past, click on the
   future side to sample more.
   ============================================================ */
(function () {
    'use strict';

    var canvas = document.getElementById('forecast-toy');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var figure = canvas.closest('figure');
    var newButton = document.getElementById('forecast-toy-new');
    if (figure) figure.hidden = false;

    var N_CTX = 48;                 // observed points
    var H = 32;                     // forecast horizon
    var N = N_CTX + H;
    var PAD = { l: 14, r: 14, t: 30, b: 14 };
    var BASE_ALPHA = 0.5;
    var Z90 = 1.2816;               // half-width of the 10-90 % band, in sd

    var reduceMotion = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------- Helpers ---------- */

    function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

    function gauss() {
        var u = 1 - Math.random(), v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    // The model works on logit(value), so futures bend softly toward the
    // edges of the plot instead of leaving it. Quantiles map back exactly.
    function logit(v) {
        v = clamp(v, 0.02, 0.98);
        return Math.log(v / (1 - v));
    }
    function sigmoid(u) { return 1 / (1 + Math.exp(-u)); }

    /* ---------- Linear algebra (row-major Float64Array) ---------- */

    function cholesky(A, n) {
        var L = new Float64Array(n * n);
        for (var i = 0; i < n; i++) {
            for (var j = 0; j <= i; j++) {
                var s = A[i * n + j];
                for (var k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
                if (i === j) {
                    if (!(s > 0)) return null;
                    L[i * n + i] = Math.sqrt(s);
                } else {
                    L[i * n + j] = s / L[j * n + j];
                }
            }
        }
        return L;
    }

    function forwardSolve(L, n, b) {
        var x = new Float64Array(n);
        for (var i = 0; i < n; i++) {
            var s = b[i];
            for (var k = 0; k < i; k++) s -= L[i * n + k] * x[k];
            x[i] = s / L[i * n + i];
        }
        return x;
    }

    function backSolve(L, n, b) {
        var x = new Float64Array(n);
        for (var i = n - 1; i >= 0; i--) {
            var s = b[i];
            for (var k = i + 1; k < n; k++) s -= L[k * n + i] * x[k];
            x[i] = s / L[i * n + i];
        }
        return x;
    }

    /* ---------- Gaussian process ---------- */

    // Squared exponential + slowly decaying periodic + a long squared
    // exponential that plays the part of a damped trend (it follows the
    // slope of the window, then flattens instead of leaving the plot)
    // + a random walk, the local level that lets a level shift persist.
    function kernel(hp, a, b) {
        var d = a - b;
        var v = hp.se * Math.exp(-d * d / (2 * hp.l * hp.l));
        if (hp.p) {
            var s = Math.sin(Math.PI * d / hp.p);
            v += hp.per * Math.exp(-2 * s * s / (hp.lp * hp.lp) - d * d / (2 * hp.ld * hp.ld));
        }
        if (hp.tr) v += hp.tr * Math.exp(-d * d / (2 * N_CTX * N_CTX));
        if (hp.rw) v += hp.rw * (Math.min(a, b) + 1) / N_CTX;
        return v;
    }

    // The two highest autocorrelation peaks of the detrended window,
    // refined to a fractional lag by a parabola through the peak.
    function candidatePeriods(y) {
        var n = y.length, c = (n - 1) / 2, sxx = 0, sxy = 0, i, lag;
        for (i = 0; i < n; i++) { sxx += (i - c) * (i - c); sxy += (i - c) * y[i]; }
        var slope = sxy / sxx, r = new Float64Array(n), m = 0, v = 0;
        for (i = 0; i < n; i++) { r[i] = y[i] - slope * (i - c); m += r[i]; }
        m /= n;
        for (i = 0; i < n; i++) { r[i] -= m; v += r[i] * r[i]; }
        if (v < 1e-9) return [];

        var maxLag = Math.floor(n / 2), ac = new Float64Array(maxLag + 2);
        for (lag = 1; lag <= maxLag + 1; lag++) {
            var s = 0;
            for (i = lag; i < n; i++) s += r[i] * r[i - lag];
            ac[lag] = s / v;
        }
        var peaks = [];
        for (lag = 4; lag <= maxLag; lag++) {
            var a0 = ac[lag - 1], a1 = ac[lag], a2 = ac[lag + 1];
            if (a1 > 0.2 && a1 >= a0 && a1 >= a2) {
                var den = a0 - 2 * a1 + a2;
                var off = den < 0 ? clamp(0.5 * (a0 - a2) / den, -0.5, 0.5) : 0;
                peaks.push({ p: lag + off, r: a1 });
            }
        }
        peaks.sort(function (x, z) { return z.r - x.r; });
        return peaks.slice(0, 2).map(function (x) { return x.p; });
    }

    var LENGTHS = [4, 10, 24], NOISES = [0.02, 0.08, 0.25];

    // First stage of the search: shape x smoothness x noise, no trend or walk.
    function candidates(y) {
        var shapes = [{ p: 0, per: 0, se: 1, lp: 1 }], list = [];
        candidatePeriods(y).forEach(function (p) {
            [0.4, 0.8, 1.4].forEach(function (lp) {
                shapes.push({ p: p, per: 1, se: 0.15, lp: lp });
                shapes.push({ p: p, per: 0.6, se: 0.5, lp: lp });
            });
        });
        shapes.forEach(function (s) {
            LENGTHS.forEach(function (l) {
                NOISES.forEach(function (nz) {
                    list.push({ p: s.p, per: s.per, se: s.se, lp: s.lp, ld: 8 * s.p,
                                l: l, nz: nz, tr: 0, rw: 0 });
                });
            });
        });
        return list;
    }

    // Copies of hp with the given fields set to every combination of values.
    function around(hp, fields) {
        var list = [Object.assign({}, hp)];
        Object.keys(fields).forEach(function (key) {
            var next = [];
            list.forEach(function (h) {
                fields[key].forEach(function (v) {
                    var c = Object.assign({}, h);
                    c[key] = v;
                    next.push(c);
                });
            });
            list = next;
        });
        return list;
    }

    function condition(hp, y) {
        var n = y.length, K = new Float64Array(n * n), i, j;
        for (i = 0; i < n; i++) {
            for (j = 0; j <= i; j++) {
                var v = kernel(hp, i, j);
                K[i * n + j] = v;
                K[j * n + i] = v;
            }
            K[i * n + i] += hp.nz + 1e-6;
        }
        var L = cholesky(K, n);
        if (!L) return null;
        var alpha = backSolve(L, n, forwardSolve(L, n, y));
        var lml = 0;
        for (i = 0; i < n; i++) lml -= 0.5 * y[i] * alpha[i] + Math.log(L[i * n + i]);
        return { hp: hp, L: L, alpha: alpha, lml: lml };
    }

    // Predictive distribution of the next H observations, noise included.
    function predictive(m) {
        var n = N_CTX, hp = m.hp, V = [], mean = new Float64Array(H), t, u, i;
        for (t = 0; t < H; t++) {
            var ks = new Float64Array(n), s = 0;
            for (i = 0; i < n; i++) {
                ks[i] = kernel(hp, n + t, i);
                s += ks[i] * m.alpha[i];
            }
            mean[t] = s;
            V.push(forwardSolve(m.L, n, ks));
        }
        var S = new Float64Array(H * H);
        for (t = 0; t < H; t++) {
            for (u = 0; u <= t; u++) {
                var v = kernel(hp, n + t, n + u);
                for (i = 0; i < n; i++) v -= V[t][i] * V[u][i];
                S[t * H + u] = v;
                S[u * H + t] = v;
            }
            S[t * H + t] += hp.nz;
        }
        var sd = new Float64Array(H);
        for (t = 0; t < H; t++) sd[t] = Math.sqrt(Math.max(S[t * H + t], 0));
        var Ls = null;
        for (var jitter = 1e-6; !Ls && jitter < 1; jitter *= 10) {
            var A = S.slice();
            for (t = 0; t < H; t++) A[t * H + t] += jitter;
            Ls = cholesky(A, H);
        }
        return { mean: mean, sd: sd, L: Ls };
    }

    // Prior mean: the recent level (the last cycle when periodic, else the
    // last 8 points), so the futures settle near where the window ends
    // instead of falling back to its average.
    function recentLevel(values, p) {
        var n = values.length, k = p ? Math.min(n, Math.round(p)) : 8, s = 0;
        for (var i = n - k; i < n; i++) s += values[i];
        return s / k;
    }

    // Fit to the window. With fixedHp, only re-condition (cheap, used while drawing).
    function fit(values, fixedHp) {
        var u = Float64Array.from(values, logit);
        var n = u.length, mu = 0, sd = 0, i;
        for (i = 0; i < n; i++) mu += u[i];
        mu /= n;
        for (i = 0; i < n; i++) sd += (u[i] - mu) * (u[i] - mu);
        sd = Math.max(Math.sqrt(sd / n), 0.12);
        var z = new Float64Array(n);
        for (i = 0; i < n; i++) z[i] = (u[i] - mu) / sd;

        var centred = {};
        function pick(list, best) {
            list.forEach(function (hp) {
                var key = hp.p || 0;
                if (!centred[key]) {
                    var level = recentLevel(u, hp.p), y = new Float64Array(n);
                    for (i = 0; i < n; i++) y[i] = (u[i] - level) / sd;
                    centred[key] = { level: level, y: y };
                }
                var m = condition(hp, centred[key].y);
                if (m && (!best || m.lml > best.lml)) {
                    best = m;
                    best.mu = centred[key].level;
                }
            });
            return best;
        }

        // Coordinate search by marginal likelihood: shape, smoothness and noise,
        // then trend and random walk, then smoothness and noise again.
        var best = null;
        if (fixedHp) {
            best = pick([fixedHp], null);
        } else {
            best = pick(candidates(z), null);
            if (best) best = pick(around(best.hp, { tr: [0, 1], rw: [0, 0.5, 2] }), best);
            if (best) best = pick(around(best.hp, { l: LENGTHS, nz: NOISES }), best);
        }
        if (!best) return null;
        best.sd = sd;
        best.post = predictive(best);
        return best;
    }

    function sampleFuture(m) {
        var P = m.post, z = new Float64Array(H), out = new Float64Array(H), t, k;
        for (t = 0; t < H; t++) z[t] = gauss();
        for (t = 0; t < H; t++) {
            var s = P.mean[t];
            if (P.L) { for (k = 0; k <= t; k++) s += P.L[t * H + k] * z[k]; }
            else s += P.sd[t] * z[t];
            out[t] = sigmoid(m.mu + m.sd * s);
        }
        return out;
    }

    /* ---------- Series generator ---------- */

    function rand(a, b) { return a + Math.random() * (b - a); }
    function sign() { return Math.random() < 0.5 ? -1 : 1; }

    // A bump centred on `centre` within a cycle, x and centre in [0, 1).
    function bump(x, centre, width) {
        var d = Math.abs(x - centre);
        d = Math.min(d, 1 - d);
        return Math.exp(-d * d / (2 * width * width));
    }

    function build(f) {
        var v = new Float64Array(N_CTX);
        for (var t = 0; t < N_CTX; t++) v[t] = f(t);
        return v;
    }

    // Families of synthetic series, each returning raw values for t = 0 .. N_CTX-1.
    var FAMILIES = [
        // Daily load: a morning and an evening peak, modulated by a slower cycle.
        function () {
            var p = rand(11, 16), off = rand(0, 1), slow = rand(2.5, 4) * p, depth = rand(0.1, 0.35);
            var c1 = rand(0.2, 0.35), c2 = rand(0.6, 0.8), w1 = rand(0.05, 0.09), w2 = rand(0.06, 0.12);
            var h1 = rand(0.5, 1), h2 = rand(0.7, 1.2), e = 0;
            return build(function (t) {
                var x = (t / p + off) % 1;
                e = 0.6 * e + 0.06 * gauss();
                return (1 + depth * Math.sin(2 * Math.PI * t / slow)) *
                       (h1 * bump(x, c1, w1) + h2 * bump(x, c2, w2)) + e;
            });
        },
        // Fill and release: a slow rise, then a sudden drop, each cycle a little different.
        function () {
            var p = rand(10, 17), off = rand(0, p), curve = rand(0.6, 1.8), e = 0, cycle = -1, height = 1;
            return build(function (t) {
                var c = Math.floor((t + off) / p), x = ((t + off) % p) / p;
                if (c !== cycle) { cycle = c; height = rand(0.8, 1.2); }
                e = 0.5 * e + 0.04 * gauss();
                return height * Math.pow(x, curve) + e;
            });
        },
        // Weekly pattern: five busy days, a quiet weekend, and a trend.
        function () {
            var off = Math.floor(rand(0, 7)), trend = rand(-0.02, 0.02), e = 0;
            var days = [1, 1.05, 1.1, 1.05, 0.95, 0.35, 0.3].map(function (d) { return d + rand(-0.08, 0.08); });
            return build(function (t) {
                e = 0.4 * e + 0.05 * gauss();
                return days[(t + off) % 7] + trend * t + e;
            });
        },
        // Quasi-periodic: an AR(2) with complex roots, cycles drift in phase and size.
        function () {
            var p = rand(9, 16), r = rand(0.9, 0.96), a1 = 2 * r * Math.cos(2 * Math.PI / p), a2 = -r * r;
            var x1 = 0, x2 = 0, v = new Float64Array(N_CTX);
            for (var t = -80; t < N_CTX; t++) {
                var x = a1 * x1 + a2 * x2 + gauss();
                x2 = x1;
                x1 = x;
                if (t >= 0) v[t] = x;
            }
            return v;
        },
        // Seasonal with a break: the trend changes slope, the amplitude drifts.
        function () {
            var p = rand(8, 14), ph = rand(0, 2 * Math.PI), h = rand(0.2, 0.6), ph2 = rand(0, 2 * Math.PI);
            var cp = rand(16, 36), s1 = rand(-0.015, 0.015), s2 = s1 + sign() * rand(0.03, 0.06);
            var a0 = rand(0.6, 1), a1 = rand(0.6, 1.4), e = 0;
            return build(function (t) {
                var trend = t < cp ? s1 * t : s1 * cp + s2 * (t - cp), a = a0 + (a1 - a0) * t / N_CTX;
                e = 0.5 * e + 0.1 * gauss();
                return a * (Math.sin(2 * Math.PI * t / p + ph) + h * Math.sin(4 * Math.PI * t / p + ph2)) + trend + e;
            });
        },
        // Volatile walk: volatility comes in clusters (GARCH), with one jump.
        function () {
            var level = 0, s2 = 0.4, drift = rand(-0.1, 0.1), jumpAt = Math.floor(rand(12, 44));
            var jump = sign() * rand(2, 3.5);
            return build(function (t) {
                var e = Math.sqrt(s2) * gauss();
                s2 = 0.02 + 0.15 * e * e + 0.8 * s2;
                level += drift + e + (t === jumpAt ? jump : 0);
                return level;
            });
        },
        // Two cycles with unrelated periods, beating against each other.
        function () {
            var p1 = rand(6, 9), p2 = p1 * rand(1.6, 2.6), a2 = rand(0.5, 0.9);
            var ph1 = rand(0, 2 * Math.PI), ph2 = rand(0, 2 * Math.PI), e = 0;
            return build(function (t) {
                e = 0.5 * e + 0.08 * gauss();
                return Math.sin(2 * Math.PI * t / p1 + ph1) + a2 * Math.sin(2 * Math.PI * t / p2 + ph2) + e;
            });
        }
    ];

    var STRUCTURED = [0, 1, 2, 4, 6];   // the families with a clear shape, used first
    var lastFamily = -1;

    // A series from a family other than the previous one, in [0.25, 0.75]
    // (values live in [0, 1], bottom to top of the plot).
    function randomSeries(among) {
        var choices = among || FAMILIES.map(function (f, i) { return i; });
        var k, t, lo = Infinity, hi = -Infinity;
        do {
            k = choices[Math.floor(Math.random() * choices.length)];
        } while (k === lastFamily && choices.length > 1);
        lastFamily = k;
        var v = FAMILIES[k]();
        for (t = 0; t < N_CTX; t++) { lo = Math.min(lo, v[t]); hi = Math.max(hi, v[t]); }
        for (t = 0; t < N_CTX; t++) v[t] = 0.25 + 0.5 * (v[t] - lo) / (hi - lo || 1);
        return v;
    }

    /* ---------- State ---------- */

    var values = randomSeries(STRUCTURED);
    var model = fit(values);
    var futures = [];
    var band = 0;                   // band opacity, eases toward 1
    var drawing = false, hover = false, dirty = false;
    var lastIdx = -1, lastVal = 0;
    var nextSpawn = 0;
    var W = 0, HT = 0, dpr = 1;
    var colors = {};

    function readColors() {
        var cs = getComputedStyle(document.documentElement);
        function get(name, fallback) { return cs.getPropertyValue(name).trim() || fallback; }
        colors.text = get('--color-text', '#1f2222');
        colors.faint = get('--color-faint', '#8a8f92');
        colors.accent = get('--color-accent', '#11ABB0');
    }

    function step() { return (W - PAD.l - PAD.r) / (N - 1); }
    function xAt(i) { return PAD.l + i * step(); }
    function yAt(v) { return PAD.t + (1 - v) * (HT - PAD.t - PAD.b); }
    function valueAt(py) { return 1 - (py - PAD.t) / (HT - PAD.t - PAD.b); }
    function splitX() { return xAt(N_CTX - 1); }

    /* ---------- Futures ---------- */

    function spawn(now, delay) {
        if (!model) return;
        futures.push({
            y: sampleFuture(model),
            y0: values[N_CTX - 1],
            born: now + (delay || 0),
            drawMs: 1500 + Math.random() * 500,
            holdMs: 400 + Math.random() * 400,
            fadeMs: 1800 + Math.random() * 800,
            fadeAt: null,
            fadeFrom: BASE_ALPHA
        });
    }

    function fadeStart(f) { return f.fadeAt !== null ? f.fadeAt : f.born + f.drawMs + f.holdMs; }

    function alphaOf(f, now) {
        if (now < f.born) return 0;
        var start = fadeStart(f);
        if (now < start) return BASE_ALPHA;
        return f.fadeFrom * (1 - clamp((now - start) / f.fadeMs, 0, 1));
    }

    function fadeAll(now, ms) {
        futures.forEach(function (f) {
            f.fadeFrom = alphaOf(f, now);
            f.fadeAt = now;
            f.fadeMs = ms;
        });
    }

    // Reduced motion: a still fan of futures, redrawn on each change.
    function stillFan() {
        futures = [];
        if (!model) return;
        for (var i = 0; i < 14; i++) {
            futures.push({ y: sampleFuture(model), y0: values[N_CTX - 1], born: -1, drawMs: 1,
                           holdMs: Infinity, fadeMs: 1, fadeAt: null, fadeFrom: BASE_ALPHA });
        }
    }

    /* ---------- Drawing ---------- */

    function render(now) {
        var sx = splitX(), st = step(), i, t;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, HT);

        // The observed side is the drawable one.
        if (hover || drawing) {
            ctx.globalAlpha = drawing ? 0.07 : 0.04;
            ctx.fillStyle = colors.accent;
            ctx.fillRect(0, 0, sx + st / 2, HT);
        }

        // "Now" divider.
        ctx.save();
        ctx.setLineDash([3, 4]);
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = colors.faint;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(sx) + 0.5, PAD.t - 6);
        ctx.lineTo(Math.round(sx) + 0.5, HT - PAD.b + 6);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, PAD.t - 8, W, HT - PAD.t + 8);
        ctx.clip();

        // 10-90 % band of the predictive distribution.
        if (model && band > 0.01) {
            var P = model.post, last = values[N_CTX - 1];
            ctx.beginPath();
            ctx.moveTo(sx, yAt(last));
            for (t = 0; t < H; t++) ctx.lineTo(xAt(N_CTX + t), yAt(sigmoid(model.mu + model.sd * (P.mean[t] + Z90 * P.sd[t]))));
            for (t = H - 1; t >= 0; t--) ctx.lineTo(xAt(N_CTX + t), yAt(sigmoid(model.mu + model.sd * (P.mean[t] - Z90 * P.sd[t]))));
            ctx.closePath();
            ctx.globalAlpha = 0.08 * band;
            ctx.fillStyle = colors.accent;
            ctx.fill();
        }

        // Sampled futures, each drawn left to right then faded.
        ctx.lineWidth = 1.3;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = colors.accent;
        ctx.fillStyle = colors.accent;
        futures.forEach(function (f) {
            var a = alphaOf(f, now);
            if (a <= 0.003) return;
            var e = clamp((now - f.born) / f.drawMs, 0, 1);
            var s = (1 - Math.pow(1 - e, 3)) * H, k = Math.floor(s), frac = s - k;
            var tipX = sx, tipY = yAt(f.y0), j;
            ctx.globalAlpha = a;
            ctx.beginPath();
            ctx.moveTo(sx, yAt(f.y0));
            for (j = 0; j < k; j++) ctx.lineTo(xAt(N_CTX + j), yAt(f.y[j]));
            if (k < H) {
                var x0 = k === 0 ? sx : xAt(N_CTX + k - 1), v0 = k === 0 ? f.y0 : f.y[k - 1];
                tipX = x0 + (xAt(N_CTX + k) - x0) * frac;
                tipY = yAt(v0 + (f.y[k] - v0) * frac);
                ctx.lineTo(tipX, tipY);
            }
            ctx.stroke();
            if (e < 1) {
                ctx.globalAlpha = Math.min(1, a * 1.6);
                ctx.beginPath();
                ctx.arc(tipX, tipY, 2.2, 0, 2 * Math.PI);
                ctx.fill();
            }
        });
        ctx.restore();

        // Observed window.
        ctx.globalAlpha = 1;
        ctx.strokeStyle = colors.text;
        ctx.fillStyle = colors.text;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (i = 0; i < N_CTX; i++) {
            if (i) ctx.lineTo(xAt(i), yAt(values[i]));
            else ctx.moveTo(xAt(i), yAt(values[i]));
        }
        ctx.stroke();
        if (st >= 6) {
            for (i = 0; i < N_CTX; i++) {
                ctx.beginPath();
                ctx.arc(xAt(i), yAt(values[i]), 1.9, 0, 2 * Math.PI);
                ctx.fill();
            }
        }

        // Labels.
        ctx.font = '500 10.5px "JetBrains Mono", ui-monospace, monospace';
        ctx.textBaseline = 'top';
        ctx.fillStyle = colors.faint;
        ctx.textAlign = 'left';
        ctx.fillText('observed · ' + N_CTX + ' points', PAD.l, 10);
        ctx.textAlign = 'right';
        ctx.fillText('possible futures', W - PAD.r, 10);
    }

    /* ---------- Animation loop ---------- */

    var running = false, visible = true, lastFrame = 0;

    // One clock for everything (events use it too), and spawns follow the
    // schedule rather than the frame rate, so a slow device sees the same fan.
    function frame() {
        if (!running) return;
        var now = performance.now();
        var dt = lastFrame ? Math.min(now - lastFrame, 100) : 16;
        lastFrame = now;
        if (drawing && dirty) {
            model = fit(values, model && model.hp) || model;
            dirty = false;
        }
        if (!drawing && model) {
            if (now - nextSpawn > 1500) nextSpawn = now;
            while (now >= nextSpawn && futures.length < 24) {
                spawn(nextSpawn);
                nextSpawn += 230 + Math.random() * 220;
            }
        }
        futures = futures.filter(function (f) { return now < fadeStart(f) + f.fadeMs; });
        band = Math.min(1, band + dt / 500);
        render(now);
        requestAnimationFrame(frame);
    }

    function setRunning(on) {
        if (reduceMotion) return;
        if (on && !running) {
            running = true;
            lastFrame = 0;
            requestAnimationFrame(frame);
        } else if (!on) {
            running = false;
        }
    }

    function redrawStill() {
        band = 1;
        render(performance.now());
    }

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = canvas.clientWidth;
        HT = canvas.clientHeight;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(HT * dpr);
        if (reduceMotion || !running) redrawStill();
    }

    /* ---------- Interaction ---------- */

    function localPoint(clientX, clientY) {
        var r = canvas.getBoundingClientRect();
        return { x: clientX - r.left, y: clientY - r.top };
    }

    function overWindow(x) { return x <= splitX() + step() / 2; }

    function paintAt(p) {
        var i = clamp(Math.round((p.x - PAD.l) / step()), 0, N_CTX - 1);
        var v = clamp(valueAt(p.y), 0.04, 0.96);
        if (lastIdx < 0 || i === lastIdx) {
            values[i] = v;
        } else {
            var n = Math.abs(i - lastIdx), dir = i > lastIdx ? 1 : -1;
            for (var k = 1; k <= n; k++) values[lastIdx + dir * k] = lastVal + (v - lastVal) * k / n;
        }
        lastIdx = i;
        lastVal = v;
        dirty = true;
        if (reduceMotion) {
            model = fit(values, model && model.hp) || model;
            futures = [];
            redrawStill();
        }
    }

    canvas.addEventListener('pointerdown', function (e) {
        if (e.button > 0) return;
        var p = localPoint(e.clientX, e.clientY), now = performance.now();
        if (overWindow(p.x)) {
            drawing = true;
            lastIdx = -1;
            try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
            fadeAll(now, 350);
            paintAt(p);
            e.preventDefault();
        } else if (model) {
            if (reduceMotion) {
                stillFan();
                redrawStill();
            } else {
                for (var i = 0; i < 6; i++) spawn(now, i * 70);
            }
        }
    });

    canvas.addEventListener('pointermove', function (e) {
        var p = localPoint(e.clientX, e.clientY);
        hover = overWindow(p.x);
        canvas.style.cursor = hover ? 'crosshair' : 'pointer';
        if (drawing) paintAt(p);
    });

    function endDrawing() {
        if (!drawing) return;
        drawing = false;
        lastIdx = -1;
        model = fit(values) || model;
        nextSpawn = 0;
        if (reduceMotion) {
            stillFan();
            redrawStill();
        }
    }
    canvas.addEventListener('pointerup', endDrawing);
    canvas.addEventListener('pointercancel', endDrawing);
    canvas.addEventListener('pointerleave', function () {
        hover = false;
        if (reduceMotion) redrawStill();
    });

    // On touch screens, keep the page scrollable from the futures side
    // and only claim the gesture on the observed side.
    canvas.addEventListener('touchstart', function (e) {
        var t = e.touches[0];
        if (t && overWindow(localPoint(t.clientX, t.clientY).x)) e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', function (e) {
        if (drawing) e.preventDefault();
    }, { passive: false });

    if (newButton) {
        newButton.addEventListener('click', function () {
            var now = performance.now();
            values = randomSeries();
            model = fit(values) || model;
            fadeAll(now, 400);
            band = 0;
            nextSpawn = now + 250;
            if (reduceMotion) {
                stillFan();
                redrawStill();
            }
        });
    }

    /* ---------- Start ---------- */

    readColors();
    if (reduceMotion) stillFan();
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
    else window.addEventListener('resize', resize);
    resize();

    if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
            visible = entries[0].isIntersecting;
            setRunning(visible && !document.hidden);
        }).observe(canvas);
    } else {
        setRunning(true);
    }
    document.addEventListener('visibilitychange', function () {
        setRunning(visible && !document.hidden);
    });
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () { if (reduceMotion) redrawStill(); });
    }
})();
