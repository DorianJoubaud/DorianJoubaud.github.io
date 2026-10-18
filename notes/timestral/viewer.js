/* ============================================================
   Forecast viewer for the Timestral note: pick a task, a model
   and, for Timestral, its test-time options; see the end of the
   context, what really happened, the model's median and 80 %
   band, and the best possible 80 % band (the oracle).
   Data: examples.json, written by scripts/export_site.py of
   github.com/DorianJoubaud/timestral-probes.
   ============================================================ */
(function () {
    'use strict';

    var root = document.getElementById('viewer');
    if (!root) return;
    var canvas = root.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var tip = root.querySelector('.viewer__tip');
    var taskSel = root.querySelector('#viewer-task');
    var modelBox = root.querySelector('#viewer-model');
    var optBox = root.querySelector('#viewer-option');
    var seriesBox = root.querySelector('#viewer-series');
    var note = root.querySelector('.viewer__note');

    var INK = '#1f2222', MUTED = '#8a8f92', RULE = '#ececea', SURFACE = '#ffffff';
    var COLORS = { timestral: '#11ABB0', chronos: '#eb6834', timesfm: '#2a78d6', classical: '#6a6f72' };
    var MODELS = [
        { key: 'timestral-209m', label: 'Timestral 209M', color: COLORS.timestral },
        { key: 'timestral-5m', label: 'Timestral 5M', color: COLORS.timestral },
        { key: 'chronos-2', label: 'Chronos-2', color: COLORS.chronos },
        { key: 'timesfm-2.5', label: 'TimesFM 2.5', color: COLORS.timesfm },
        { key: 'linreg', label: 'Least-squares line', color: COLORS.classical },
        { key: 'autoets', label: 'AutoETS', color: COLORS.classical }
    ];
    var OPTIONS = [
        { key: 'default', label: 'As shipped' },
        { key: 'noclip', label: 'No clip at zero' },
        { key: 'nosym', label: 'No mirror averaging' },
        { key: 'log', label: 'On log x' }
    ];
    var LABELS = {
        linear_up: 'Rising line', linear_down: 'Falling line, stays positive',
        linear_cross: 'Falling line that crosses zero', linear_cross_up: 'Rising line that crosses zero',
        quadratic: 'Parabola', exp_k3: 'Exponential, x e^3 over the context',
        exp_k10: 'Exponential, x e^10 over the context', exp_decay_k3: 'Decay to an asymptote',
        logistic: 'S-curve', staircase: 'Staircase', sine_p24: 'Sine, period 24',
        sine_p300: 'Sine, period 300', sines_24_168: 'Daily and weekly cycles', square_p50: 'Square wave',
        sawtooth_p50: 'Sawtooth', trend_seasonal: 'Line plus a cycle', mult_seasonal: 'Cycle growing with the level',
        damped_sine: 'Damped sine', growing_sine: 'Growing sine', chirp: 'Chirp (period shrinking)',
        level_shift: 'Level shift', trend_break: 'Trend that turns', spike: 'Cycle with one spike',
        missing_block: 'Cycle with a gap', rw: 'Random walk', ar1_09: 'AR(1), phi = 0.9',
        iid_normal: 'White noise', gbm: 'Geometric random walk', intermittent: 'Intermittent demand',
        lead_rw_L32: 'Random walk with a series 32 steps ahead', known_link_rw: 'y = 2 c + 1, c known in advance'
    };
    var GROUPS = [
        ['Trends', ['linear_up', 'linear_down', 'linear_cross', 'linear_cross_up', 'quadratic', 'exp_k3', 'exp_k10',
                    'exp_decay_k3', 'logistic', 'staircase']],
        ['Cycles', ['sine_p24', 'sine_p300', 'sines_24_168', 'square_p50', 'sawtooth_p50', 'trend_seasonal',
                    'mult_seasonal', 'damped_sine', 'growing_sine', 'chirp']],
        ['Breaks and gaps', ['level_shift', 'trend_break', 'spike', 'missing_block']],
        ['Randomness', ['rw', 'ar1_09', 'iid_normal', 'gbm', 'intermittent']],
        ['Extra information', ['lead_rw_L32', 'known_link_rw']],
        ['Long horizon (4 096 steps)', ['rw@E3', 'sine_p24@E3']]
    ];

    var data = [], state = { entry: null, model: 'timestral-209m', option: 'default', series: 0 }, geom = null;

    function familyOf(cell) { return cell.split('__')[1]; }
    function expOf(cell) { return cell.split('__')[0]; }
    function keyOf(e) { return familyOf(e.cell) + (expOf(e.cell) === 'E3' ? '@E3' : '') + '|' + e.mode; }
    function fmt(v) {
        if (v === null || v === undefined || !isFinite(v)) return 'n/a';
        var a = Math.abs(v);
        return a >= 1000 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : v.toPrecision(3);
    }

    function buildTaskMenu() {
        var byKey = {};
        data.forEach(function (e) { byKey[keyOf(e)] = e; });
        GROUPS.forEach(function (g) {
            var og = document.createElement('optgroup');
            og.label = g[0];
            g[1].forEach(function (fam) {
                ['uni', 'past_cov', 'known_cov'].forEach(function (mode) {
                    var e = byKey[fam + '|' + mode];
                    if (!e) return;
                    var o = document.createElement('option');
                    var base = LABELS[fam.split('@')[0]] || fam;
                    o.textContent = base + (mode === 'past_cov' ? ', with the leading series'
                        : mode === 'known_cov' ? ', with c' : (fam.indexOf('lead_') === 0 || fam.indexOf('known_') === 0)
                            ? ', target only' : '');
                    o.value = data.indexOf(e);
                    og.appendChild(o);
                });
            });
            if (og.children.length) taskSel.appendChild(og);
        });
        taskSel.addEventListener('change', function () { state.entry = data[+taskSel.value]; refresh(); });
        state.entry = data[+taskSel.value];
    }

    function chips(box, items, current, onPick) {
        box.innerHTML = '';
        items.forEach(function (it) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'chip' + (it.key === current ? ' chip--on' : '');
            b.setAttribute('aria-pressed', it.key === current ? 'true' : 'false');
            b.disabled = !!it.disabled;
            if (it.color) {
                var sw = document.createElement('span');
                sw.className = 'swatch';
                sw.style.background = it.color;
                b.appendChild(sw);
            }
            b.appendChild(document.createTextNode(it.label));
            b.addEventListener('click', function () { onPick(it.key); });
            box.appendChild(b);
        });
    }

    function current() {
        var s = state.entry.series[state.series];
        var k = state.model + '/' + (state.model === 'timestral-209m' ? state.option : 'default');
        return { s: s, f: s.forecasts[k], oracle: s.forecasts.oracle };
    }

    function refresh() {
        var s = state.entry.series[state.series] || state.entry.series[0];
        var avail = MODELS.map(function (m) {
            return { key: m.key, label: m.label, color: m.color, disabled: !s.forecasts[m.key + '/default'] };
        });
        if (!s.forecasts[state.model + '/default']) state.model = 'timestral-209m';
        chips(modelBox, avail, state.model, function (k) { state.model = k; refresh(); });
        var isT = state.model === 'timestral-209m';
        optBox.hidden = !isT;
        if (isT) {
            var opts = OPTIONS.map(function (o) {
                return { key: o.key, label: o.label, disabled: !s.forecasts['timestral-209m/' + o.key] };
            });
            if (!s.forecasts['timestral-209m/' + state.option]) state.option = 'default';
            chips(optBox, opts, state.option, function (k) { state.option = k; refresh(); });
        }
        chips(seriesBox, state.entry.series.map(function (_, i) { return { key: i, label: 'Series ' + (i + 1) }; }),
            state.series, function (k) { state.series = k; refresh(); });
        var c = current();
        note.textContent = c.f ? '' : 'No forecast of this model for this task.';
        draw();
    }

    function extent(arrs) {
        var lo = Infinity, hi = -Infinity;
        arrs.forEach(function (a) {
            if (!a) return;
            for (var i = 0; i < a.length; i++) {
                var v = a[i];
                if (v !== null && isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
            }
        });
        if (!isFinite(lo)) { lo = 0; hi = 1; }
        if (hi - lo < 1e-12) { hi += 1; lo -= 1; }
        var pad = 0.08 * (hi - lo);
        return [lo - pad, hi + pad];
    }

    function draw() {
        var dpr = window.devicePixelRatio || 1;
        var w = canvas.clientWidth, h = canvas.clientHeight;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        var c = current(), s = c.s;
        var nc = s.context.length, H = s.future.length, n = nc + H;
        var PAD = { l: 48, r: 12, t: 12, b: 24 };
        // the y range follows what happened and the best possible band, so that a model
        // that runs away is shown leaving the frame rather than squashing the truth
        var yr = extent([s.context, s.future, c.oracle && c.oracle.lo, c.oracle && c.oracle.hi]);
        var X = function (i) { return PAD.l + (w - PAD.l - PAD.r) * i / (n - 1); };
        var Y = function (v) { return PAD.t + (h - PAD.t - PAD.b) * (1 - (v - yr[0]) / (yr[1] - yr[0])); };
        geom = { X: X, nc: nc, n: n, PAD: PAD, w: w, h: h };

        // grid and axis
        ctx.strokeStyle = RULE;
        ctx.lineWidth = 1;
        ctx.fillStyle = MUTED;
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        var raw = (yr[1] - yr[0]) / 4, p10 = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), m = raw / p10;
        var step = (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p10;
        for (var v = Math.ceil(yr[0] / step) * step; v <= yr[1]; v += step) {
            var yy = Math.round(Y(v)) + 0.5;
            ctx.beginPath(); ctx.moveTo(PAD.l, yy); ctx.lineTo(w - PAD.r, yy); ctx.stroke();
            var dec = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log(step) / Math.LN10));
            ctx.fillText((Math.abs(v) < step / 1e6 ? 0 : v).toFixed(dec), PAD.l - 6, yy);
        }
        var x0 = Math.round(X(nc - 0.5)) + 0.5;
        ctx.strokeStyle = MUTED;
        ctx.beginPath(); ctx.moveTo(x0, PAD.t); ctx.lineTo(x0, h - PAD.b); ctx.stroke();
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText('now', x0, h - PAD.b + 6);

        ctx.save();
        ctx.beginPath(); ctx.rect(PAD.l, PAD.t, w - PAD.l - PAD.r, h - PAD.t - PAD.b); ctx.clip();
        var color = (MODELS.filter(function (m) { return m.key === state.model; })[0] || MODELS[0]).color;
        Array.prototype.forEach.call(root.querySelectorAll('[data-model-key]'), function (el) {
            if (el.classList.contains('key-band')) el.style.background = color;
            else el.style.borderColor = color;
        });
        if (c.f) {
            ctx.globalAlpha = 0.16;
            ctx.fillStyle = color;
            ctx.beginPath();
            for (var i = 0; i < H; i++) ctx.lineTo(X(nc + i), Y(c.f.hi[i]));
            for (i = H - 1; i >= 0; i--) ctx.lineTo(X(nc + i), Y(c.f.lo[i]));
            ctx.closePath(); ctx.fill();
            ctx.globalAlpha = 1;
        }
        if (c.oracle) {
            ctx.setLineDash([4, 3]);
            ctx.strokeStyle = INK; ctx.globalAlpha = 0.55; ctx.lineWidth = 1;
            ['lo', 'hi'].forEach(function (key) {
                ctx.beginPath();
                for (var i = 0; i < H; i++) ctx.lineTo(X(nc + i), Y(c.oracle[key][i]));
                ctx.stroke();
            });
            ctx.setLineDash([]); ctx.globalAlpha = 1;
        }
        line(s.context.map(function (v, i) { return [X(i), v === null ? null : Y(v)]; }), MUTED, 1.5);
        line(s.future.map(function (v, i) { return [X(nc + i), Y(v)]; }), INK, 1.5);
        if (c.f) line(c.f.med.map(function (v, i) { return [X(nc + i), Y(v)]; }), color, 2);
        ctx.restore();
    }

    function line(pts, color, width) {
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath();
        var pen = false;
        pts.forEach(function (p) {
            if (p[1] === null || !isFinite(p[1])) { pen = false; return; }
            if (pen) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); pen = true; }
        });
        ctx.stroke();
    }

    function hover(ev) {
        if (!geom) return;
        var r = canvas.getBoundingClientRect(), x = ev.clientX - r.left;
        var i = Math.round((x - geom.PAD.l) / (geom.w - geom.PAD.l - geom.PAD.r) * (geom.n - 1)) - geom.nc;
        var c = current(), H = c.s.future.length;
        if (i < 0 || i >= H) { tip.hidden = true; return; }
        var rows = ['<b>step +' + (i + 1) + '</b>', 'what happened: ' + fmt(c.s.future[i])];
        if (c.f) rows.push('median: ' + fmt(c.f.med[i]), '80 % band: ' + fmt(c.f.lo[i]) + ' to ' + fmt(c.f.hi[i]));
        if (c.oracle) rows.push('best possible band: ' + fmt(c.oracle.lo[i]) + ' to ' + fmt(c.oracle.hi[i]));
        tip.innerHTML = rows.join('<br>');
        tip.hidden = false;
        var left = Math.min(Math.max(x + 12, 0), r.width - tip.offsetWidth - 4);
        tip.style.left = left + 'px';
        tip.style.top = '8px';
    }

    canvas.addEventListener('mousemove', hover);
    canvas.addEventListener('mouseleave', function () { tip.hidden = true; });
    window.addEventListener('resize', function () { if (state.entry) draw(); });

    fetch(root.getAttribute('data-src')).then(function (r) { return r.json(); }).then(function (d) {
        data = d;
        buildTaskMenu();
        root.hidden = false;
        refresh();
    }).catch(function () {
        note.textContent = 'The examples could not be loaded.';
        root.hidden = false;
    });
})();
