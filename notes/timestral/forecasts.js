/* ============================================================
   Forecast plots of the Timestral note, drawn as SVG from
   examples.json: the end of the context, the ground truth, each
   model's median and 80 % band, and the best possible 80 % band.
   A .fc element is a full plot with its controls, a .mini a
   thumbnail, #gallery the grid of every task that drives the
   #explorer plot. Settings are read from data-fc (JSON).
   ============================================================ */
(function () {
    'use strict';

    var NS = 'http://www.w3.org/2000/svg';
    var C = {
        timestral: '#11ABB0', option: '#6250d6', chronos: '#eb6834', timesfm: '#2a78d6', timesfm3: '#173f8a', toto: '#2f9e44',
        totoBlock: '#c2255c', totoOption: '#e6a700', toto1: '#9c6b30', ruler: '#6a6f72',
        ink: '#1f2222', past: '#9a9fa2', muted: '#6a6f72', rule: '#ececea', zero: '#c4c8c6', surface: '#ffffff'
    };
    var MODEL = { 'timestral-209m': 'Timestral 209M', 'chronos-2': 'Chronos-2', 'timesfm-2.5': 'TimesFM 2.5',
                  'timesfm-3': 'TimesFM 3.0', 'toto2-2.5b': 'Toto 2.0 2.5B', 'toto1': 'Toto 1.0', 'linreg': 'Least-squares line' };
    var VARIANT = { noclip: 'clip off', log: 'on log x', basehead: 'base quantile head', block768: 'median fed back', qpaths: 'quantile paths', meanfeed: 'mean fed back' };
    var MODE = { past_cov: 'leader as given', lead_known: 'leader shifted', multi_lag: 'leader as a second series', known_cov: 'with c' };
    var LABELS = {
        linear_up: 'Rising line', linear_down: 'Falling line', linear_cross: 'Line falling through zero',
        linear_cross_up: 'Line rising through zero', quadratic: 'Parabola', exp_k1: 'Exponential, e¹',
        exp_k3: 'Exponential, e³', exp_k5: 'Exponential, e⁵', exp_k10: 'Exponential, e¹⁰',
        exp_decay_k3: 'Decay to a level', logistic: 'S-curve', staircase: 'Staircase', sine_p24: 'Sine, period 24',
        sine_p300: 'Sine, period 300', sines_24_168: 'Daily and weekly cycles', square_p50: 'Square wave',
        sawtooth_p50: 'Sawtooth', trend_seasonal: 'Line plus a cycle', mult_seasonal: 'Cycle growing with the level',
        damped_sine: 'Damped sine', growing_sine: 'Growing sine', chirp: 'Chirp, period shrinking',
        level_shift: 'Level shift', trend_break: 'Trend that turns', spike: 'Cycle with one spike',
        missing_block: 'Cycle with a gap', rw: 'Random walk', ar1_09: 'AR(1), φ = 0.9', iid_normal: 'White noise',
        gbm: 'Geometric random walk', intermittent: 'Intermittent demand'
    };
    var GROUPS = [
        ['Trends', ['linear_up', 'linear_down', 'linear_cross', 'linear_cross_up', 'quadratic', 'exp_k1', 'exp_k3',
                    'exp_k5', 'exp_k10', 'exp_decay_k3', 'logistic', 'staircase']],
        ['Cycles', ['sine_p24', 'sine_p300', 'sines_24_168', 'square_p50', 'sawtooth_p50', 'trend_seasonal',
                    'mult_seasonal', 'damped_sine', 'growing_sine', 'chirp']],
        ['Breaks and gaps', ['level_shift', 'trend_break', 'spike', 'missing_block']],
        ['Randomness', ['rw', 'ar1_09', 'iid_normal', 'gbm', 'intermittent']],
        ['Shorter history, longer horizon', ['E2__linear_up__C128_H96_n0.01', 'E3__linear_up__C4096_H4096_n0.01',
                                             'E3__rw__C4096_H4096_n0']]
    ];
    var EXTRA = {
        'E2__linear_up__C128_H96_n0.01': 'Rising line, 128 steps of history',
        'E3__linear_up__C4096_H4096_n0.01': 'Rising line, 4\u00a0096 steps ahead',
        'E3__rw__C4096_H4096_n0': 'Random walk, 4\u00a0096 steps ahead'
    };
    var CTX = { level_shift: 192, missing_block: 512, spike: 192, trend_break: 192 };   // history shown in the cards
    var DATA = null, FIGS = [], uid = 0;

    function cellId(fam) {
        if (fam.indexOf('__') > 0) return fam;
        var sto = ['rw', 'ar1_09', 'iid_normal', 'gbm', 'intermittent'].indexOf(fam) >= 0;
        return 'E1__' + fam + '__C512_H96_n' + (sto ? '0' : '0.01');
    }
    function taskName(id) { return EXTRA[id] || LABELS[id.split('__')[1]] || id; }

    /* forecast keys are model[/variant][@mode] */
    function parts(key) {
        var m = key.split('@'), v = m[0].split('/');
        return { model: v[0], variant: v[1] || 'default', mode: m[1] || 'uni', base: m[0] };
    }
    function nameOf(key) {
        var p = parts(key), s = MODEL[p.model] || p.model;
        if (p.variant !== 'default') s += ', ' + VARIANT[p.variant];
        if (p.mode !== 'uni') s += ', ' + MODE[p.mode];
        return s;
    }
    function colorOf(key) {
        var p = parts(key);
        if (p.model === 'timesfm-2.5') return C.timesfm;              // its base head is its own setting, not an option
        if (p.model.indexOf('toto2') === 0)                          // an option on Toto 2.0 gets its own colour
            return p.variant === 'block768' ? C.totoBlock : p.variant === 'default' ? C.toto : C.totoOption;
        if (p.model === 'toto1') return p.variant === 'meanfeed' ? C.totoBlock : C.toto1;
        if (p.variant !== 'default' || p.mode === 'lead_known' || p.mode === 'known_cov') return C.option;
        if (p.model.indexOf('timestral') === 0) return C.timestral;
        if (p.model === 'chronos-2') return C.chronos;
        if (p.model === 'timesfm-2.5') return C.timesfm;
        if (p.model === 'timesfm-3') return C.timesfm3;
        return C.ruler;
    }
    function fmt(v) {
        if (v === null || v === undefined || !isFinite(v)) return 'n/a';
        var a = Math.abs(v);
        return a >= 1000 ? thousands(Math.round(v)) : a >= 10 ? v.toFixed(1) : a >= 1 ? v.toFixed(2)
            : v.toPrecision(3);
    }
    function times(v) {
        if (v === null || v === undefined || !isFinite(v)) return 'n/a';
        return v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
    }
    function thousands(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f'); }
    function stepLabel(x) {
        return x === 0 ? 'now' : x > 0 ? 'step +' + thousands(x) : 'step \u2212' + thousands(-x);
    }

    function el(tag, attrs, parent) {
        var e = document.createElementNS(NS, tag);
        for (var k in attrs) if (attrs.hasOwnProperty(k) && attrs[k] !== null) e.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(e);
        return e;
    }
    function txt(parent, x, y, s, attrs) {
        var t = el('text', attrs || {}, parent);
        t.setAttribute('x', x);
        t.setAttribute('y', y);
        t.textContent = s;
        return t;
    }
    function html(tag, cls, parent, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        if (parent) parent.appendChild(e);
        return e;
    }

    var tip = html('div', 'viewer__tip', document.body);
    tip.style.position = 'fixed';
    tip.hidden = true;
    var clearMarks = null;                          // hides the crosshair of the plot that showed the tooltip
    function showTip(ev, content, clear) {
        if (clearMarks && clearMarks !== clear) clearMarks();
        clearMarks = clear || null;
        tip.innerHTML = content;
        tip.hidden = false;
        var x = ev.clientX + 14, y;
        if (x + tip.offsetWidth > window.innerWidth - 8) x = Math.max(8, ev.clientX - 14 - tip.offsetWidth);
        if (ev.pointerType === 'touch') {           // above the finger, which would hide it
            y = ev.clientY - 28 - tip.offsetHeight;
            if (y < 8) y = Math.min(ev.clientY + 28, window.innerHeight - tip.offsetHeight - 8);
        } else y = Math.min(ev.clientY + 14, window.innerHeight - tip.offsetHeight - 8);
        tip.style.left = x + 'px';
        tip.style.top = y + 'px';
    }
    function hideTip() {
        tip.hidden = true;
        if (clearMarks) { var c = clearMarks; clearMarks = null; c(); }
    }
    // a touch tooltip stays after the finger lifts, until the page scrolls or another tap lands elsewhere
    window.addEventListener('scroll', function () { if (!tip.hidden) hideTip(); }, { passive: true });
    document.addEventListener('pointerdown', function (ev) {
        if (!tip.hidden && !(ev.target.closest && ev.target.closest('.fc__plot svg, .fc__cov svg'))) hideTip();
    });

    function extent(arrs, withZero) {
        var lo = Infinity, hi = -Infinity;
        arrs.forEach(function (a) {
            if (!a) return;
            for (var i = 0; i < a.length; i++) {
                var v = a[i];
                if (v !== null && isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
            }
        });
        if (!isFinite(lo)) { lo = 0; hi = 1; }
        if (withZero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
        if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
        var pad = 0.08 * (hi - lo);
        return [lo - pad, hi + pad];
    }
    function ticks(lo, hi, n) {
        var raw = (hi - lo) / n, p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), m = raw / p;
        var step = (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p, vals = [];
        for (var v = Math.ceil(lo / step) * step; v <= hi + 1e-9 * step; v += step) vals.push(Math.abs(v) < step / 1e6 ? 0 : v);
        var dec = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log(step) / Math.LN10 - 1e-9));
        return { vals: vals, step: step, fmt: function (v) {
            return Math.abs(v) >= 10000 ? (v / 1000).toFixed(0) + 'k' : v.toFixed(dec);
        } };
    }
    /* x in steps from now: the context ends at 0, the horizon starts one step later */
    function xs(n, step, past) {
        var out = new Array(n);
        for (var i = 0; i < n; i++) out[i] = past ? -(n - 1 - i) * step : (i + 1) * step;
        return out;
    }
    function linePath(x, y, sx, sy) {
        var d = '', pen = false;
        for (var i = 0; i < y.length; i++) {
            var v = y[i];
            if (v === null || !isFinite(v)) { pen = false; continue; }
            d += (pen ? 'L' : 'M') + sx(x[i]).toFixed(1) + ',' + sy(v).toFixed(1);
            pen = true;
        }
        return d;
    }
    function bandPath(x, lo, hi, sx, sy) {
        var d = '';
        for (var i = 0; i < x.length; i++) d += (i ? 'L' : 'M') + sx(x[i]).toFixed(1) + ',' + sy(hi[i]).toFixed(1);
        for (i = x.length - 1; i >= 0; i--) d += 'L' + sx(x[i]).toFixed(1) + ',' + sy(lo[i]).toFixed(1);
        return d + 'Z';
    }
    function leadOf(id) { var m = /_L(\d+)__/.exec(id); return m ? +m[1] : 0; }

    /* One plot. o: {height, mini, ctx, oracle, fit, zero, lane, rule, aria} */
    function plot(holder, id, si, keys, o) {
        var cell = DATA[id], s = cell.series[si], step = cell.step || 1;
        var nShow = Math.min(o.ctx || s.context.length, s.context.length), off = s.context.length - nShow;
        var ctx = s.context.slice(off), nf = s.future.length;
        var X0 = -(nShow - 1) * step, X1 = nf * step, full = [X0, X1];
        if (o.view) { X0 = Math.max(X0, o.view[0]); X1 = Math.min(X1, o.view[1]); }
        var zoomed = X0 > full[0] || X1 < full[1];
        var W = Math.max(150, Math.round(holder.clientWidth || 600));
        var laneVals = o.lane && s.cov && s.cov[o.lane] ? s.cov[o.lane].slice(off) : null;
        var LT = o.mini ? 3 : 18, LH = laneVals ? (o.mini ? 18 : 46) : 0, LG = laneVals ? (o.mini ? 6 : 14) : 0;
        var H = (o.height || (W < 500 ? 230 : 280)) + LH + LG;
        var P = o.mini ? { l: 3, r: 3, t: 4, b: 4 } : { l: 46, r: 14, t: 10, b: 24 };
        if (laneVals) P.t = LT + LH + LG;
        var oracle = s.f[o.oracle || 'oracle'];
        var shown = keys.filter(function (k) { return s.f[k]; });
        var cxs = xs(nShow, step, true), fxs = xs(nf, step, false);
        var cut = function (x, a) {                 // values inside the visible range only, for the y axis
            return zoomed ? a.map(function (v, i) { return x[i] >= X0 - step && x[i] <= X1 + step ? v : null; }) : a;
        };
        var arrs = [cut(cxs, ctx), cut(fxs, s.future)];
        if (oracle) arrs.push(cut(fxs, oracle.lo), cut(fxs, oracle.hi));
        if (o.fit === 'all' || zoomed) shown.forEach(function (k) { arrs.push(cut(fxs, s.f[k].lo), cut(fxs, s.f[k].hi)); });
        var yr = extent(arrs, o.zero);
        var pw = W - P.l - P.r, ph = H - P.t - P.b;
        var sx = function (x) { return P.l + pw * (x - X0) / (X1 - X0); };
        var sy = function (v) { return P.t + ph * (1 - (v - yr[0]) / (yr[1] - yr[0])); };
        var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': o.aria || '' });
        var cid = 'fc-clip-' + (++uid);
        el('rect', { x: P.l, y: P.t, width: pw, height: ph }, el('clipPath', { id: cid }, el('defs', {}, svg)));

        if (!o.mini) {
            var t = ticks(yr[0], yr[1], ph < 200 ? 3 : 4);
            t.vals.forEach(function (v) {
                var y = Math.round(sy(v)) + 0.5;
                el('line', { x1: P.l, x2: W - P.r, y1: y, y2: y, stroke: v === 0 && o.zero ? C.zero : C.rule }, svg);
                txt(svg, P.l - 6, y + 4, t.fmt(v), { 'text-anchor': 'end', 'class': 'muted' });
            });
            if (zoomed) {                           // steps from now, on a nice grid
                var xt = ticks(X0, X1, W < 500 ? 3 : 5);
                xt.vals.forEach(function (v) {
                    var tx = Math.round(sx(v)) + 0.5;
                    if (v !== 0) el('line', { x1: tx, x2: tx, y1: P.t, y2: H - P.b, stroke: C.rule }, svg);
                    if (v !== 0) txt(svg, tx, H - 7, (v > 0 ? '+' : '\u2212') + thousands(Math.abs(v)), { 'text-anchor': 'middle', 'class': 'muted' });
                });
            } else if (X1 > (o.every || 1024)) {    // block ticks, labelled when there is room for them
                var blk = o.every || 1024;
                for (var b = blk; b < X1; b += blk) {
                    var bx = Math.round(sx(b)) + 0.5;
                    el('line', { x1: bx, x2: bx, y1: P.t, y2: H - P.b, stroke: C.rule }, svg);
                    if (pw * blk / (X1 - X0) > 46 && W - P.r - bx > 70) {
                        txt(svg, bx, H - 7, '+' + thousands(b), { 'text-anchor': 'middle', 'class': 'muted' });
                    }
                }
            }
            if (!zoomed) txt(svg, W - P.r, H - 7, '+' + thousands(X1), { 'text-anchor': 'end', 'class': 'muted' });
        } else if (o.zero && yr[0] < 0 && yr[1] > 0) {
            el('line', { x1: P.l, x2: W - P.r, y1: sy(0), y2: sy(0), stroke: C.zero }, svg);
        }
        var nowX = Math.round(sx(step / 2)) + 0.5;
        el('line', { x1: nowX, x2: nowX, y1: P.t, y2: H - P.b, stroke: C.past, 'stroke-dasharray': o.mini ? 'none' : '2 3' }, svg);
        if (!o.mini && nowX > P.l && nowX < W - P.r) txt(svg, nowX, H - 7, 'now', { 'text-anchor': 'middle', 'class': 'muted' });
        if (o.rule) {                               // dashed: where the model feeds back, labelled once
            var at = [o.rule[0]], named = false;
            if (o.every) for (var rv = o.rule[0] + o.every; rv < X1; rv += o.every) at.push(rv);
            at.forEach(function (v) {
                if (v >= X1 || v <= X0) return;
                var rx = Math.round(sx(v)) + 0.5;
                el('line', { x1: rx, x2: rx, y1: P.t, y2: H - P.b, stroke: C.muted, 'stroke-dasharray': o.mini ? '2 2' : '4 3' }, svg);
                if (!o.mini && !named && o.rule[1] && (!o.every || pw * o.every / (X1 - X0) > 120)) {
                    txt(svg, rx + 5, P.t + 13, o.rule[1], { 'class': 'muted', 'paint-order': 'stroke', stroke: C.surface, 'stroke-width': 3 });
                    named = true;
                }
            });
        }

        if (laneVals) {
            var lxs = xs(nShow, step, true).concat(xs(laneVals.length - nShow, step, false));
            var lyr = extent([laneVals]);
            var ly = function (v) { return LT + LH * (1 - (v - lyr[0]) / (lyr[1] - lyr[0])); };
            var from = o.lane === 'past_cov' ? nShow - leadOf(id) : nShow;
            var head = laneVals.map(function (v, i) { return i <= from ? v : null; });
            var tail = laneVals.map(function (v, i) { return i >= from ? v : null; });
            el('line', { x1: P.l, x2: W - P.r, y1: LT + LH + LG / 2, y2: LT + LH + LG / 2, stroke: C.rule }, svg);
            el('path', { d: linePath(lxs, head, sx, ly), fill: 'none', stroke: C.past, 'stroke-width': 1.5 }, svg);
            el('path', { d: linePath(lxs, tail, sx, ly), fill: 'none', stroke: C.ink, 'stroke-width': 2 }, svg);
            if (!o.mini && o.laneLabel) txt(svg, P.l, 12, o.laneLabel, { 'class': 'muted' });
        }

        var g = el('g', { 'clip-path': 'url(#' + cid + ')' }, svg);
        var fx = xs(nf, step, false), cx = xs(nShow, step, true), below = shown.slice().reverse();
        var many = shown.length > 1;                // several bands: lighter fills, each outlined in its colour
        below.forEach(function (k) {
            el('path', { d: bandPath(fx, s.f[k].lo, s.f[k].hi, sx, sy), fill: colorOf(k),
                         'fill-opacity': many ? (o.mini ? 0.12 : 0.07) : 0.17 }, g);
            if (many) ['lo', 'hi'].forEach(function (q) {
                el('path', { d: linePath(fx, s.f[k][q], sx, sy), fill: 'none', stroke: colorOf(k), 'stroke-width': o.mini ? 0.8 : 1,
                             'stroke-opacity': o.mini ? 0.45 : 0.6, 'stroke-linejoin': 'round' }, g);
            });
        });
        if (oracle) {
            ['lo', 'hi'].forEach(function (q) {
                el('path', { d: linePath(fx, oracle[q], sx, sy), fill: 'none', stroke: C.ink, 'stroke-opacity': 0.6,
                             'stroke-width': 1, 'stroke-dasharray': o.mini ? '3 2' : '4 3' }, g);
            });
        }
        el('path', { d: linePath(cx, ctx, sx, sy), fill: 'none', stroke: C.past, 'stroke-width': 1.5,
                     'stroke-linejoin': 'round' }, g);
        el('path', { d: linePath(fx, s.future, sx, sy), fill: 'none', stroke: C.ink, 'stroke-width': 1.5,
                     'stroke-linejoin': 'round' }, g);
        below.forEach(function (k) {
            var gen = parts(k).model === 'toto1' && parts(k).variant === 'default';   // generative: long dashes
            el('path', { d: linePath(fx, s.f[k].med, sx, sy), fill: 'none', stroke: colorOf(k), 'stroke-width': 2,
                         'stroke-linejoin': 'round', 'stroke-linecap': gen ? 'butt' : 'round',
                         'stroke-dasharray': gen ? '8 3' : null }, g);
        });

        if (!o.mini) {
            var cross = el('line', { y1: P.t, y2: H - P.b, stroke: C.muted, visibility: 'hidden' }, svg);
            var dots = shown.map(function (k) {
                return el('circle', { r: 3.5, fill: colorOf(k), stroke: C.surface, 'stroke-width': 1.5, visibility: 'hidden' }, svg);
            });
            var hit = el('rect', { x: P.l, y: 0, width: pw, height: H, fill: 'transparent' }, svg);
            var clear = function () {
                cross.setAttribute('visibility', 'hidden');
                dots.forEach(function (d) { d.setAttribute('visibility', 'hidden'); });
            };
            var move = function (ev) {
                var r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) * W / r.width;
                var xv = X0 + (x - P.l) / pw * (X1 - X0), at, rows;
                dots.forEach(function (d) { d.setAttribute('visibility', 'hidden'); });
                if (xv <= step / 2) {
                    var i = Math.max(0, Math.min(nShow - 1, Math.round(nShow - 1 + xv / step)));
                    at = cx[i];
                    rows = ['<b>' + stepLabel(at) + '</b>', 'past: ' + fmt(ctx[i])];
                } else {
                    var j = Math.max(0, Math.min(nf - 1, Math.round(xv / step) - 1));
                    at = fx[j];
                    rows = ['<b>' + stepLabel(at) + '</b>', 'ground truth: ' + fmt(s.future[j])];
                    shown.forEach(function (k, n) {
                        var f = s.f[k], y = sy(f.med[j]);
                        rows.push('<span class="swatch" style="background:' + colorOf(k) + '"></span> ' + nameOf(k) + ': '
                                  + fmt(f.med[j]) + ' (' + fmt(f.lo[j]) + ' to ' + fmt(f.hi[j]) + ')');
                        if (isFinite(y) && y >= P.t && y <= H - P.b) {
                            dots[n].setAttribute('cx', sx(at)); dots[n].setAttribute('cy', y);
                            dots[n].setAttribute('visibility', 'visible');
                        }
                    });
                    if (oracle) rows.push('best possible: ' + fmt(oracle.lo[j]) + ' to ' + fmt(oracle.hi[j]));
                }
                var px = sx(at);
                cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
                showTip(ev, rows.join('<br>'), clear);
            };
            // drag with a mouse to zoom on a stretch of time, double-click to go back
            var brush = el('rect', { y: P.t, height: ph, fill: C.ink, 'fill-opacity': 0.06, stroke: C.muted,
                                     'stroke-dasharray': '3 3', visibility: 'hidden', 'pointer-events': 'none' }, svg);
            var toX = function (ev) {
                var r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) * W / r.width;
                return Math.max(P.l, Math.min(W - P.r, x));
            };
            var drag = null;
            hit.addEventListener('pointerdown', function (ev) {
                if (ev.pointerType === 'mouse' && o.onZoom) { drag = toX(ev); hit.setPointerCapture(ev.pointerId); ev.preventDefault(); }
                move(ev);
            });
            hit.addEventListener('pointermove', function (ev) {
                move(ev);
                if (drag === null) return;
                var x = toX(ev);
                brush.setAttribute('x', Math.min(drag, x)); brush.setAttribute('width', Math.abs(x - drag));
                brush.setAttribute('visibility', 'visible');
            });
            hit.addEventListener('pointerup', function (ev) {
                if (drag === null) return;
                var a = drag, b = toX(ev); drag = null;
                brush.setAttribute('visibility', 'hidden');
                if (Math.abs(b - a) < 8) return;
                var v0 = X0 + (Math.min(a, b) - P.l) / pw * (X1 - X0), v1 = X0 + (Math.max(a, b) - P.l) / pw * (X1 - X0);
                var least = Math.max(8 * step, (full[1] - full[0]) / 12);   // not too far: at most 12 times
                if (v1 - v0 < least) { var c = (v0 + v1) / 2; v0 = c - least / 2; v1 = c + least / 2; }
                if (v0 < full[0]) { v1 += full[0] - v0; v0 = full[0]; }
                if (v1 > full[1]) { v0 -= v1 - full[1]; v1 = full[1]; }
                hideTip();
                o.onZoom([Math.max(full[0], v0), v1]);
            });
            if (o.onZoom) hit.addEventListener('dblclick', function () { o.onZoom(null); });
            if (o.onZoom) hit.style.cursor = 'crosshair';
            hit.addEventListener('pointerleave', function (ev) { if (ev.pointerType !== 'touch') hideTip(); });
        }
        holder.innerHTML = '';
        holder.appendChild(svg);
    }

    /* Under a long-horizon plot: the share of the truth inside each 80 % band, every 64 steps, over all
       the series of the task, on the time axis of the plot above. o: {oracle, rule, every, view, labelOf} */
    function coverage(holder, id, keys, o) {
        var cell = DATA[id], cv = cell.cov64, s = cell.series[0], step = cell.step || 1;
        holder.innerHTML = '';
        var ora = cv && cv[o.oracle || 'oracle'];
        if (!ora) return;
        var shown = keys.filter(function (k) { return cv[k]; });
        var nShow = s.context.length, nf = s.future.length, bin = nf * step / ora.length;
        var X0 = -(nShow - 1) * step, X1 = nf * step, full = [X0, X1];
        if (o.view) { X0 = Math.max(X0, o.view[0]); X1 = Math.min(X1, o.view[1]); }
        var zoomed = X0 > full[0] || X1 < full[1];
        html('p', '', holder, '% of the truth inside the 80 % band, every 64 steps, over the ' + cell.n + ' series of this task');
        var W = Math.max(150, Math.round(holder.clientWidth || 600)), H = W < 500 ? 130 : 150;
        var P = { l: 46, r: 14, t: 8, b: 24 }, pw = W - P.l - P.r, ph = H - P.t - P.b;
        var sx = function (x) { return P.l + pw * (x - X0) / (X1 - X0); };
        var sy = function (v) { return P.t + ph * (1 - v); };
        var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Share of the truth inside the 80 % band of '
                              + shown.map(o.labelOf).join(', ') + ', every 64 steps.' }, holder);
        var cid = 'fc-clip-' + (++uid);
        el('rect', { x: P.l, y: P.t, width: pw, height: ph }, el('clipPath', { id: cid }, el('defs', {}, svg)));
        [0, 0.2, 0.4, 0.6, 0.8, 1].forEach(function (v) {
            var y = Math.round(sy(v)) + 0.5;
            el('line', { x1: P.l, x2: W - P.r, y1: y, y2: y, stroke: C.rule }, svg);
            txt(svg, P.l - 6, y + 4, String(Math.round(100 * v)), { 'text-anchor': 'end', 'class': 'muted' });
        });
        var xt = zoomed ? ticks(X0, X1, W < 500 ? 3 : 5).vals : [];
        if (!zoomed) for (var b = o.every || 1024; b < X1; b += o.every || 1024) xt.push(b);
        xt.forEach(function (v) {
            var tx = Math.round(sx(v)) + 0.5;
            if (v === 0) return;
            el('line', { x1: tx, x2: tx, y1: P.t, y2: H - P.b, stroke: C.rule }, svg);
            if (zoomed || (pw * (o.every || 1024) / (X1 - X0) > 46 && W - P.r - tx > 70))
                txt(svg, tx, H - 7, (v > 0 ? '+' : '−') + thousands(Math.abs(v)), { 'text-anchor': 'middle', 'class': 'muted' });
        });
        if (!zoomed) txt(svg, W - P.r, H - 7, '+' + thousands(X1), { 'text-anchor': 'end', 'class': 'muted' });
        var nowX = Math.round(sx(step / 2)) + 0.5;
        el('line', { x1: nowX, x2: nowX, y1: P.t, y2: H - P.b, stroke: C.past, 'stroke-dasharray': '2 3' }, svg);
        if (nowX > P.l && nowX < W - P.r) txt(svg, nowX, H - 7, 'now', { 'text-anchor': 'middle', 'class': 'muted' });
        if (o.rule) {
            var at = [o.rule[0]];
            if (o.every) for (var rv = o.rule[0] + o.every; rv < X1; rv += o.every) at.push(rv);
            at.forEach(function (v) {
                if (v >= X1 || v <= X0) return;
                var rx = Math.round(sx(v)) + 0.5;
                el('line', { x1: rx, x2: rx, y1: P.t, y2: H - P.b, stroke: C.muted, 'stroke-dasharray': '4 3' }, svg);
            });
        }
        var steps = function (c) {                  // one flat segment per stretch of 64 steps
            var d = '';
            for (var i = 0; i < c.length; i++) {
                if (c[i] === null || !isFinite(c[i])) continue;
                d += (d ? 'L' : 'M') + sx(i * bin).toFixed(1) + ',' + sy(c[i]).toFixed(1)
                     + 'L' + sx((i + 1) * bin).toFixed(1) + ',' + sy(c[i]).toFixed(1);
            }
            return d;
        };
        var g = el('g', { 'clip-path': 'url(#' + cid + ')' }, svg);
        el('path', { d: steps(ora), fill: 'none', stroke: C.ink, 'stroke-opacity': 0.6, 'stroke-width': 1, 'stroke-dasharray': '4 3' }, g);
        shown.slice().reverse().forEach(function (k) {
            el('path', { d: steps(cv[k]), fill: 'none', stroke: colorOf(k), 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
        });

        var cross = el('line', { y1: P.t, y2: H - P.b, stroke: C.muted, visibility: 'hidden' }, svg);
        var hit = el('rect', { x: P.l, y: 0, width: pw, height: H, fill: 'transparent' }, svg);
        var clear = function () { cross.setAttribute('visibility', 'hidden'); };
        var move = function (ev) {
            var r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) * W / r.width;
            var i = Math.floor((X0 + (x - P.l) / pw * (X1 - X0)) / bin);
            if (i < 0 || i >= ora.length) { hideTip(); clear(); return; }
            var rows = ['<b>steps ' + thousands(i * bin + 1) + ' to ' + thousands((i + 1) * bin) + '</b>'];
            shown.forEach(function (k) {
                rows.push('<span class="swatch" style="background:' + colorOf(k) + '"></span> ' + o.labelOf(k) + ': '
                          + Math.round(100 * cv[k][i]) + '&nbsp;%');
            });
            rows.push('best possible: ' + Math.round(100 * ora[i]) + '&nbsp;%');
            var px = sx((i + 0.5) * bin);
            cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
            showTip(ev, rows.join('<br>'), clear);
        };
        hit.addEventListener('pointermove', move);
        hit.addEventListener('pointerdown', move);
        hit.addEventListener('pointerleave', function (ev) { if (ev.pointerType !== 'touch') hideTip(); });
    }

    function key(parent, kind, color, label) {
        var s = html('span', '', parent), k = html('span', '', s);
        if (kind === 'model') {
            k.className = 'key-model';
            k.style.setProperty('--c', color);
        } else if (kind === 'dash') k.className = 'key-dash';
        else if (kind === 'vdash') k.className = 'key-vdash';
        else { k.className = 'key-line'; k.style.borderColor = color; }
        s.appendChild(document.createTextNode(label));
    }

    function chip(parent, label, on, disabled, color, onClick) {
        var b = html('button', 'chip' + (on ? ' chip--on' : ''), parent);
        b.type = 'button';
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.disabled = !!disabled;
        if (disabled) b.title = 'not available for this task';
        if (color) { var sw = html('span', 'swatch', b); sw.style.background = color; }
        b.appendChild(document.createTextNode(label));
        b.addEventListener('click', onClick);
        return b;
    }

    /* A full plot: chips for the task, the forecasts and the series, a legend and a summary */
    function figure(box) {
        var cfg = JSON.parse(box.getAttribute('data-fc'));
        var cells = cfg.cells.filter(function (c) { return DATA[c[0]]; });
        if (!cells.length) return;
        var choices = (cfg.choices || []).map(function (c) { return typeof c === 'string' ? [c] : c; });
        var st = { cell: Math.min(cfg.start || 0, cells.length - 1), series: 0, on: (cfg.on || []).slice() };
        var LABEL = {};
        choices.forEach(function (c) { if (c[2] && MODEL[parts(c[0]).model] && c[2].indexOf(MODEL[parts(c[0]).model]) === 0) LABEL[c[0]] = c[2]; });
        function labelOf(k) { return LABEL[k] || nameOf(k); }
        var bar = html('div', 'fc__bar', box), plotBox = html('div', 'fc__plot', box);
        var foot = html('div', 'fc__foot', box), legendBox = html('div', 'viewer__legend', foot);
        var pager = html('div', 'fc__group fc__group--series', foot), covBox = cfg.cover ? html('div', 'fc__cov', box) : null;
        var sum = html('div', 'fc__sum', box);
        var fig = { box: box, w: 0 };

        function current() { return cells[st.cell][0]; }
        function viewOf(id) {                       // the reader's zoom, else the view the tab starts with
            if (st.view && st.view.id === id) return st.view.r;
            return cells[st.cell][2] || null;
        }
        function render() {
            var id = current(), cell = DATA[id], s = cell.series[st.series] || cell.series[0];
            if (!cell.series[st.series]) st.series = 0;
            bar.innerHTML = '';
            var top = html('div', 'fc__row', bar);
            if (cfg.picker === 'gallery') html('p', 'fc__task', top, taskName(id));
            else if (cells.length > 1) {
                var gc = html('div', 'fc__group', top);
                cells.forEach(function (c, i) {
                    chip(gc, c[1], i === st.cell, false, null, function () { st.cell = i; render(); });
                });
            }
            if (choices.length) {
                var gm = html('div', 'fc__group', html('div', 'fc__row', bar));
                choices.forEach(function (c) {
                    var k = c[0], on = st.on.indexOf(k) >= 0;
                    chip(gm, c[2] || nameOf(k), on, !s.f[k], colorOf(k), function () {
                        if (on) st.on = st.on.filter(function (x) { return x !== k; });
                        else {
                            if (c[1]) st.on = st.on.filter(function (x) {
                                return !choices.some(function (d) { return d[0] === x && d[1] === c[1]; });
                            });
                            st.on.push(k);
                        }
                        render();
                    });
                });
            }
            var keys = choices.length ? choices.map(function (c) { return c[0]; }).filter(function (k) {
                return st.on.indexOf(k) >= 0;
            }) : st.on;
            plot(plotBox, id, st.series, keys, {
                oracle: cfg.oracle, fit: cfg.fit, zero: cfg.zero, lane: cfg.lane, laneLabel: cfg.laneLabel,
                rule: cfg.rule, every: cfg.every, height: cfg.height,
                view: viewOf(id),
                onZoom: function (r) { st.view = { id: id, r: r }; render(); },
                aria: taskName(id) + ': the end of the context, the ground truth, and the forecasts of '
                      + keys.map(nameOf).join(', ') + '.'
            });
            pager.innerHTML = '';
            if (cell.series.length > 1) {
                html('span', 'fc__label', pager, 'series');
                cell.series.forEach(function (_, i) {
                    chip(pager, String(i + 1), i === st.series, false, null, function () { st.series = i; render(); });
                });
            }
            if (viewOf(id)) chip(pager, 'reset zoom', false, false, null, function () { st.view = { id: id, r: null }; render(); });
            legendBox.innerHTML = '';
            keys.filter(function (k) { return s.f[k]; }).forEach(function (k) { key(legendBox, 'model', colorOf(k), labelOf(k)); });
            key(legendBox, 'line', C.past, 'past');
            key(legendBox, 'line', C.ink, 'ground truth');
            if (s.f[cfg.oracle || 'oracle']) key(legendBox, 'dash', null, cfg.oracleLabel || 'best possible 80\u00a0% band');
            if (cfg.rule && (cfg.ruleKey || cfg.rule[1])) key(legendBox, 'vdash', null, cfg.ruleKey || cfg.rule[1]);
            if (cfg.lane && s.cov && s.cov[cfg.lane]) key(legendBox, 'line', C.ink, cfg.laneKey || 'covariate');
            if (covBox) coverage(covBox, id, keys, { oracle: cfg.oracle, rule: cfg.rule, every: cfg.every, labelOf: labelOf,
                                                     view: viewOf(id) });
            summary(id, keys);
            fig.w = plotBox.clientWidth;
        }
        function summary(id, keys) {
            var cell = DATA[id], alone = cfg.summary === 'alone';
            var under = cfg.under && cell.u, segs = null, segName = [], segHead = '';
            if (cfg.split && cell.cov64) {
                var n0 = cfg.split / 64;
                segs = function (k) {
                    var c = cell.cov64[k], a = 0, b = 0;
                    if (!c) return null;
                    for (var i = 0; i < c.length; i++) { if (i < n0) a += c[i]; else b += c[i]; }
                    return [a / n0, b / (c.length - n0)];
                };
                segName = ['steps 1 to ' + thousands(cfg.split), 'steps ' + thousands(cfg.split + 1) + ' to ' + thousands(cell.H)];
                segHead = '% of the truth inside the 80&nbsp;% band';
            } else if (cfg.blocks && cell.blocks) {
                segs = function (k) { return cell.blocks[k] || null; };
                segName = cell.blocks.oracle.map(function (_, i) { return (i + 1) + ['st', 'nd', 'rd'].concat(['th'])[Math.min(i, 3)]; });
                segHead = '% of the truth inside the 80&nbsp;% band, by block of 1&nbsp;024 steps';
            }
            var rows = keys.map(function (k) {
                var v = null;
                if (alone) {
                    var base = parts(k).base;
                    if (k !== base && cell.sql[k] !== null && cell.sql[base]) v = cell.sql[k] / cell.sql[base];
                } else v = cell.r[k];
                return { k: k, name: labelOf(k), color: colorOf(k), v: v,
                         b: segs ? segs(k) : null, u: under ? cell.u[k] : null };
            }).filter(function (r) { return r.v !== null && r.v !== undefined || r.b; });
            if (!rows.length) { sum.innerHTML = ''; return; }
            if (segs && segs('oracle')) rows.push({ name: 'best possible', v: alone ? null : 1, b: segs('oracle') });
            var nb = segs ? segName.length : 0;
            var top = '', head = '<th></th><th>' + (alone ? 'error with / without' : 'error / best possible') + '</th>';
            if (nb) {
                top = '<tr><th></th><th></th><th colspan="' + nb + '" class="fc__group-h">' + segHead + '</th></tr>';
                for (var i = 0; i < nb; i++) head += '<th>' + segName[i] + '</th>';
            }
            if (under) head += '<th>median below the truth, last step</th>';
            var body = rows.map(function (r) {
                var tr = '<td>' + (r.color ? '<span class="swatch" style="background:' + r.color + '"></span>' : '') + r.name + '</td>'
                    + '<td>' + (r.v === null || r.v === undefined ? '' : times(r.v)) + '</td>';
                for (var i = 0; i < nb; i++) tr += '<td>' + (r.b ? Math.round(100 * r.b[i]) : '') + '</td>';
                if (under) tr += '<td>' + (r.u === null || r.u === undefined ? '' : Math.round(100 * r.u) + '&nbsp;%') + '</td>';
                return '<tr>' + tr + '</tr>';
            }).join('');
            sum.innerHTML = '<table class="fc__table">' + top + '<tr>' + head + '</tr>' + body + '</table>'
                + '<span class="fc__note">Over the ' + cell.n + ' series of this task.</span>';
        }
        fig.render = render;
        fig.setCell = function (id) {
            for (var i = 0; i < cells.length; i++) if (cells[i][0] === id) { st.cell = i; st.series = 0; render(); }
        };
        box._fc = fig;
        FIGS.push(fig);
        render();
    }

    function mini(box) {
        var cfg = JSON.parse(box.getAttribute('data-fc'));
        if (!DATA[cfg.cell]) return;
        var holder = box.querySelector('.mini__plot');
        var fig = { box: holder, w: 0 };
        fig.render = function () {
            plot(holder, cfg.cell, cfg.series || 0, cfg.keys, {
                mini: true, ctx: cfg.ctx || 96, height: cfg.height || 110, oracle: cfg.oracle, zero: cfg.zero,
                lane: cfg.lane, rule: cfg.rule, aria: taskName(cfg.cell)
            });
            fig.w = holder.clientWidth;
        };
        FIGS.push(fig);
        fig.render();
    }

    function gallery(box) {
        var explorer = document.getElementById('explorer');
        GROUPS.forEach(function (gr) {
            html('p', 'gallery__group', box, gr[0]);
            gr[1].forEach(function (fam) {
                var id = cellId(fam);
                if (!DATA[id]) return;
                var b = html('button', 'card card--mini', box);
                b.type = 'button';
                b.setAttribute('data-fc', JSON.stringify({ cell: id, keys: ['timestral-209m', 'chronos-2'],
                                                           ctx: CTX[fam] || (DATA[id].step > 1 ? 256 : 96), height: 80,
                                                           rule: DATA[id].step > 1 ? [1024] : null }));
                html('span', 'card__title', b, taskName(id));
                html('span', 'mini__plot', b);
                var nums = html('span', 'card__nums', b), r = DATA[id].r;
                [['timestral-209m', C.timestral], ['chronos-2', C.chronos]].forEach(function (m) {
                    var sp = html('span', '', nums), sw = html('span', 'swatch', sp);
                    sw.style.background = m[1];
                    sp.appendChild(document.createTextNode(' ' + times(r[m[0]])));
                });
                b.addEventListener('click', function () {
                    if (!explorer || !explorer._fc) return;
                    explorer._fc.setCell(id);
                    Array.prototype.forEach.call(box.querySelectorAll('.card--on'), function (c) { c.classList.remove('card--on'); });
                    b.classList.add('card--on');
                    explorer.scrollIntoView({ behavior: 'smooth', block: 'center' });
                });
                mini(b);
            });
        });
    }

    var lastW = window.innerWidth, timer = null;
    window.addEventListener('resize', function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
            if (window.innerWidth === lastW) return;
            lastW = window.innerWidth;
            FIGS.forEach(function (f) { f.render(); });
        }, 150);
    });

    fetch('examples.json').then(function (r) { return r.json(); }).then(function (d) {
        DATA = d;
        Array.prototype.forEach.call(document.querySelectorAll('.mini[data-fc]'), mini);
        var exp = document.getElementById('explorer');
        if (exp) {
            var cells = [];
            GROUPS.forEach(function (gr) { gr[1].forEach(function (f) { var id = cellId(f); if (DATA[id]) cells.push([id, taskName(id)]); }); });
            var cfg = JSON.parse(exp.getAttribute('data-fc'));
            cfg.cells = cells;
            exp.setAttribute('data-fc', JSON.stringify(cfg));
        }
        Array.prototype.forEach.call(document.querySelectorAll('.fc[data-fc]'), figure);
        var gal = document.getElementById('gallery');
        if (gal) gallery(gal);
    }).catch(function () {
        Array.prototype.forEach.call(document.querySelectorAll('.fc'), function (b) {
            b.textContent = 'The forecasts could not be loaded.';
        });
    });
})();
