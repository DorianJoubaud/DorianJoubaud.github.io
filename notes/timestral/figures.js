/* ============================================================
   Static figures of the Timestral note, drawn as SVG from
   figures.json (scripts of github.com/DorianJoubaud/timestral-probes).
   Horizontal bars carry their value at the end, every figure has a
   legend when it has two series or more, a hover tooltip and a
   table view underneath.
   ============================================================ */
(function () {
    'use strict';

    var NS = 'http://www.w3.org/2000/svg';
    var C = {
        timestral: '#11ABB0', option: '#6250d6', chronos: '#eb6834', timesfm: '#2a78d6',
        classical: '#8a8f92', ink: '#1f2222', muted: '#6a6f72', rule: '#ececea', surface: '#ffffff'
    };
    var NAMES = {
        'timestral-209m': 'Timestral 209M', 'timestral-123m': 'Timestral 123M', 'timestral-28m': 'Timestral 28M',
        'timestral-5m': 'Timestral 5M', 'chronos-2': 'Chronos-2', 'timesfm-2.5': 'TimesFM 2.5',
        'autoarima': 'AutoARIMA', 'autoets': 'AutoETS', 'oracle': 'Best possible'
    };
    function colorOf(model) {
        if (model.indexOf('timestral') === 0) return C.timestral;
        if (model === 'chronos-2') return C.chronos;
        if (model === 'timesfm-2.5') return C.timesfm;
        return C.classical;
    }
    function fmt(v) {
        if (v === null || v === undefined || !isFinite(v)) return 'n/a';
        return v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
    }

    function el(tag, attrs, parent) {
        var e = document.createElementNS(NS, tag);
        for (var k in attrs) if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(e);
        return e;
    }
    function text(parent, x, y, s, attrs) {
        var t = el('text', attrs || {}, parent);
        t.setAttribute('x', x);
        t.setAttribute('y', y);
        t.textContent = s;
        return t;
    }

    var tip = document.createElement('div');
    tip.className = 'viewer__tip';
    tip.style.position = 'fixed';
    tip.hidden = true;
    document.body.appendChild(tip);
    function showTip(ev, html) {
        tip.innerHTML = html;
        tip.hidden = false;
        var x = Math.min(ev.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
        tip.style.left = x + 'px';
        tip.style.top = (ev.clientY + 12) + 'px';
    }
    function hideTip() { tip.hidden = true; }

    function legend(box, items) {
        var div = document.createElement('div');
        div.className = 'viewer__legend';
        items.forEach(function (it) {
            var s = document.createElement('span');
            var k = document.createElement('span');
            if (it.kind === 'tick') { k.className = 'key-dash'; k.style.borderTopStyle = 'solid'; k.style.width = '2px'; k.style.height = '0.8rem'; k.style.borderTop = '0'; k.style.background = C.ink; }
            else if (it.kind === 'dash') { k.className = 'key-dash'; }
            else if (it.kind === 'line') { k.className = 'key-line'; k.style.borderColor = it.color; }
            else { k.className = 'swatch'; k.style.background = it.color; }
            s.appendChild(k);
            s.appendChild(document.createTextNode(it.label));
            div.appendChild(s);
        });
        box.appendChild(div);
    }

    function table(box, head, rows) {
        var d = document.createElement('details');
        var sm = document.createElement('summary');
        sm.textContent = 'Table';
        d.appendChild(sm);
        var t = document.createElement('table');
        var tr = document.createElement('tr');
        head.forEach(function (h) { var th = document.createElement('th'); th.textContent = h; tr.appendChild(th); });
        t.appendChild(tr);
        rows.forEach(function (r) {
            var row = document.createElement('tr');
            r.forEach(function (v) { var td = document.createElement('td'); td.textContent = v; row.appendChild(td); });
            t.appendChild(row);
        });
        d.appendChild(t);
        box.appendChild(d);
    }

    /* Horizontal bars. rows: [{label, value, color, note, gap}], opts: {ref, refLabel, max} */
    function bars(box, rows, opts) {
        var W = Math.max(300, box.clientWidth), ROW = 26, BAR = 16, LAB = Math.min(190, Math.round(W * 0.4));
        var gaps = rows.filter(function (r) { return r.gap; }).length;
        if (rows.some(function (r) { return r.header; })) LAB = Math.min(170, Math.round(W * 0.34));
        var H = rows.length * ROW + gaps * 10 + 26;
        var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': opts.aria || '' });
        var max = opts.max || Math.max.apply(null, rows.map(function (r) { return r.value || 0; })) * 1.12;
        var X0 = LAB + 8, X1 = W - 44;
        var sx = function (v) { return X0 + (X1 - X0) * Math.min(v, max) / max; };
        // axis ticks
        var step = niceStep(max);
        for (var v = 0; v <= max + 1e-9; v += step) {
            var x = Math.round(sx(v)) + 0.5;
            el('line', { x1: x, x2: x, y1: 0, y2: H - 20, stroke: C.rule }, svg);
            text(svg, x, H - 6, tick(v, step), { 'text-anchor': 'middle', 'class': 'muted' });
        }
        if (opts.ref !== undefined) {               // under the bars and their labels
            var rx = Math.round(sx(opts.ref)) + 0.5;
            el('line', { x1: rx, x2: rx, y1: 0, y2: H - 20, stroke: C.ink, 'stroke-dasharray': '4 3' }, svg);
        }
        var y = 4;
        rows.forEach(function (r) {
            if (r.gap) y += 10;
            var cy = y + ROW / 2;
            if (r.header) {
                text(svg, 0, cy + 4, r.header, { 'font-weight': 600 });
                y += ROW;
                return;
            }
            text(svg, LAB, cy + 4, r.label, { 'text-anchor': 'end' });
            if (r.value !== null && isFinite(r.value)) {
                var x2 = sx(r.value), w = Math.max(2, x2 - X0), rad = Math.min(4, w);
                var d = 'M' + X0 + ',' + (cy - BAR / 2) + ' h' + (w - rad) + ' a' + rad + ',' + rad + ' 0 0 1 ' + rad + ',' + rad
                    + ' v' + (BAR - 2 * rad) + ' a' + rad + ',' + rad + ' 0 0 1 ' + (-rad) + ',' + rad + ' h' + (-(w - rad)) + ' z';
                var p = el('path', { d: d, fill: r.color }, svg);
                text(svg, x2 + 5, cy + 4, (r.value > max ? '> ' : '') + fmt(r.value),
                     { 'paint-order': 'stroke', stroke: C.surface, 'stroke-width': 3 });
                var hit = el('rect', { x: X0, y: cy - ROW / 2, width: X1 - X0 + 40, height: ROW, fill: 'transparent' }, svg);
                hit.addEventListener('mousemove', function (ev) { showTip(ev, '<b>' + r.label + '</b><br>' + fmt(r.value) + (r.note ? '<br>' + r.note : '')); });
                hit.addEventListener('mouseleave', hideTip);
            } else {
                text(svg, X0 + 4, cy + 4, 'n/a', { 'class': 'muted' });
            }
            if (r.tick !== undefined && r.tick !== null) {
                var tx = Math.round(sx(r.tick)) + 0.5;
                el('line', { x1: tx, x2: tx, y1: cy - BAR / 2 - 3, y2: cy + BAR / 2 + 3, stroke: C.ink, 'stroke-width': 2 }, svg);
            }
            y += ROW;
        });
        var holder = document.createElement('div');
        holder.className = 'bars';
        holder.appendChild(svg);
        box.appendChild(holder);
    }

    function tick(v, step) {
        var d = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
        return v.toFixed(d);
    }

    function niceStep(max) {
        var raw = max / 5, p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), m = raw / p;
        return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
    }

    /* Lines over the horizon. series: [{label, color, dash, ys}], step: x spacing */
    function lines(box, series, opts) {
        var W = Math.max(300, box.clientWidth), H = 260, PAD = { l: 44, r: 12, t: 10, b: 30 };
        var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': opts.aria || '' });
        var n = series[0].ys.length, xmax = n * opts.step;
        var ymax = opts.ymax || Math.max.apply(null, series.map(function (s) { return Math.max.apply(null, s.ys); })) * 1.08;
        var sx = function (x) { return PAD.l + (W - PAD.l - PAD.r) * x / xmax; };
        var sy = function (v) { return PAD.t + (H - PAD.t - PAD.b) * (1 - Math.min(v, ymax) / ymax); };
        var ystep = niceStep(ymax);
        for (var v = 0; v <= ymax + 1e-9; v += ystep) {
            var yy = Math.round(sy(v)) + 0.5;
            el('line', { x1: PAD.l, x2: W - PAD.r, y1: yy, y2: yy, stroke: C.rule }, svg);
            text(svg, PAD.l - 6, yy + 4, tick(v, ystep), { 'text-anchor': 'end', 'class': 'muted' });
        }
        [0, 1024, 2048, 3072, 4096].forEach(function (x) {
            if (x > xmax) return;
            text(svg, sx(x), H - 10, x === 0 ? '0' : x.toLocaleString('en'),
                 { 'text-anchor': x === xmax ? 'end' : 'middle', 'class': 'muted' });
        });
        if (opts.rule) {
            var rx = Math.round(sx(opts.rule)) + 0.5;
            el('line', { x1: rx, x2: rx, y1: PAD.t, y2: H - PAD.b, stroke: C.muted, 'stroke-dasharray': '2 3' }, svg);
            text(svg, rx + 4, PAD.t + 12, opts.ruleLabel, { 'class': 'muted' });
        }
        series.forEach(function (s) {
            var d = s.ys.map(function (v, i) { return (i ? 'L' : 'M') + sx((i + 1) * opts.step).toFixed(1) + ',' + sy(v).toFixed(1); }).join('');
            el('path', { d: d, fill: 'none', stroke: s.color, 'stroke-width': s.dash ? 1.5 : 2, 'stroke-dasharray': s.dash ? '4 3' : 'none',
                         'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
        });
        var cross = el('line', { y1: PAD.t, y2: H - PAD.b, stroke: C.muted, visibility: 'hidden' }, svg);
        var hit = el('rect', { x: PAD.l, y: PAD.t, width: W - PAD.l - PAD.r, height: H - PAD.t - PAD.b, fill: 'transparent' }, svg);
        hit.addEventListener('mousemove', function (ev) {
            var r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) * W / r.width;
            var i = Math.max(0, Math.min(n - 1, Math.round((x - PAD.l) / (W - PAD.l - PAD.r) * xmax / opts.step) - 1));
            var cx = sx((i + 1) * opts.step);
            cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
            showTip(ev, '<b>step ' + ((i + 1) * opts.step).toLocaleString('en') + '</b><br>' + series.map(function (s) {
                return s.label + ': ' + fmt(s.ys[i]);
            }).join('<br>'));
        });
        hit.addEventListener('mouseleave', function () { cross.setAttribute('visibility', 'hidden'); hideTip(); });
        var holder = document.createElement('div');
        holder.className = 'bars';
        holder.appendChild(svg);
        box.appendChild(holder);
    }

    function draw(F) {
        var box;
        if ((box = document.getElementById('fig-overall'))) {
            var rows = F.overall.map(function (r) {
                return { label: NAMES[r.model], value: r.value, color: colorOf(r.model) };
            });
            bars(box, rows, { ref: 1, aria: 'Average error relative to the best possible forecast, by model.' });
            legend(box, [{ color: C.timestral, label: 'Timestral' }, { color: C.chronos, label: 'Chronos-2' },
                         { color: C.timesfm, label: 'TimesFM 2.5' }, { color: C.classical, label: 'classical' },
                         { kind: 'dash', label: 'best possible (1)' }]);
            table(box, ['model', 'error / best possible'], F.overall.map(function (r) { return [NAMES[r.model], fmt(r.value)]; }));
        }
        if ((box = document.getElementById('fig-exp'))) {
            var rows2 = [];
            var SUP = { 1: '\u00b9', 3: '\u00b3', 5: '\u2075', 10: '\u00b9\u2070' };
            F.exp.forEach(function (r, i) {
                rows2.push({ header: 'growth e' + SUP[r.growth] + ' over the context', gap: i > 0 });
                rows2.push({ label: 'Timestral 209M', value: r.timestral, color: C.timestral });
                rows2.push({ label: 'Timestral 209M on log x', value: r.timestral_log, color: C.option });
                rows2.push({ label: 'Chronos-2', value: r.chronos, color: C.chronos });
                rows2.push({ label: 'TimesFM 2.5', value: r.timesfm, color: C.timesfm });
            });
            bars(box, rows2, { ref: 1, aria: 'Error relative to the best possible forecast on exponentials, by growth.' });
            legend(box, [{ color: C.timestral, label: 'Timestral 209M as shipped' }, { color: C.option, label: 'Timestral 209M on log x' },
                         { color: C.chronos, label: 'Chronos-2' }, { color: C.timesfm, label: 'TimesFM 2.5' }, { kind: 'dash', label: 'best possible (1)' }]);
            table(box, ['growth over the context', 'Timestral 209M', 'on log x', 'Chronos-2', 'TimesFM 2.5', 'median too low at the end (T / C / F)'],
                F.exp.map(function (r) {
                    return ['e' + SUP[r.growth], fmt(r.timestral), fmt(r.timestral_log), fmt(r.chronos), fmt(r.timesfm),
                            Math.round(100 * r.under_t) + ' / ' + Math.round(100 * r.under_c) + ' / ' + Math.round(100 * r.under_f) + ' %'];
                }));
        }
        if ((box = document.getElementById('fig-cross'))) {
            var X = F.cross, rows3 = [
                { header: 'Timestral 209M' },
                { label: 'crosses zero', value: X['timestral-209m/default'].cross, color: C.timestral },
                { label: 'mirror task', value: X['timestral-209m/default'].mirror, color: C.timestral },
                { label: 'crosses zero, clip off', value: X['timestral-209m/noclip'].cross, color: C.option },
                { header: 'TimesFM 2.5', gap: true },
                { label: 'crosses zero', value: X['timesfm-2.5/default'].cross, color: C.timesfm },
                { label: 'mirror task', value: X['timesfm-2.5/default'].mirror, color: C.timesfm },
                { header: 'Chronos-2', gap: true },
                { label: 'crosses zero', value: X['chronos-2/default'].cross, color: C.chronos },
                { label: 'mirror task', value: X['chronos-2/default'].mirror, color: C.chronos }
            ];
            bars(box, rows3, { ref: 1, aria: 'Error on a line that crosses zero and on its mirror image.' });
            legend(box, [{ color: C.timestral, label: 'Timestral 209M as shipped' }, { color: C.option, label: 'Timestral 209M, clip off' },
                         { color: C.timesfm, label: 'TimesFM 2.5' }, { color: C.chronos, label: 'Chronos-2' }, { kind: 'dash', label: 'best possible (1)' }]);
            table(box, ['model', 'crosses zero', 'mirror task'], [
                ['Timestral 209M', fmt(X['timestral-209m/default'].cross), fmt(X['timestral-209m/default'].mirror)],
                ['Timestral 209M, clip off', fmt(X['timestral-209m/noclip'].cross), fmt(X['timestral-209m/noclip'].mirror)],
                ['TimesFM 2.5', fmt(X['timesfm-2.5/default'].cross), fmt(X['timesfm-2.5/default'].mirror)],
                ['Chronos-2', fmt(X['chronos-2/default'].cross), fmt(X['chronos-2/default'].mirror)]]);
        }
        if ((box = document.getElementById('fig-horizon'))) {
            var Hh = F.horizon;
            lines(box, [{ label: 'Best possible', color: C.ink, dash: true, ys: Hh.oracle.width },
                        { label: 'Chronos-2', color: C.chronos, ys: Hh['chronos-2'].width },
                        { label: 'Timestral 209M', color: C.timestral, ys: Hh['timestral-209m'].width }],
                  { step: F.horizon_step, rule: 1024, ruleLabel: 'one decoded block', aria: 'Width of the 80 percent band over a 4096-step horizon.' });
            legend(box, [{ kind: 'line', color: C.timestral, label: 'Timestral 209M' }, { kind: 'line', color: C.chronos, label: 'Chronos-2' },
                         { kind: 'dash', label: 'best possible' }]);
            var blocks = function (a) {
                var out = [], per = 1024 / F.horizon_step;
                for (var b = 0; b < 4; b++) {
                    var s = 0;
                    for (var i = b * per; i < (b + 1) * per; i++) s += a[i];
                    out.push(fmt(s / per));
                }
                return out;
            };
            table(box, ['80 % coverage, steps', '1 to 1 024', '1 025 to 2 048', '2 049 to 3 072', '3 073 to 4 096'], [
                ['Timestral 209M'].concat(blocks(Hh['timestral-209m'].cov)),
                ['Chronos-2'].concat(blocks(Hh['chronos-2'].cov)),
                ['Best possible'].concat(blocks(Hh.oracle.cov))]);
        }
        if ((box = document.getElementById('fig-cov'))) {
            var LBL = { known_link_rw: 'y = 2c + 1, c a random walk', known_link_ar1: 'y = 2c + 1, c an AR(1)',
                        lead_rw_L96: 'random walk, leader 96 steps ahead', lead_ar1_095_L96: 'AR(1), leader 96 steps ahead',
                        lead_rw_L32: 'random walk, leader 32 steps ahead' };
            var rows5 = [];
            F.cov.forEach(function (r, i) {
                var lead = r.task.indexOf('lead_') === 0;
                rows5.push({ header: LBL[r.task], gap: i > 0 });
                rows5.push({ label: lead ? 'Timestral 209M, as given' : 'Timestral 209M', value: r['timestral-209m'],
                             color: C.timestral, tick: r.oracle });
                if (lead) rows5.push({ label: 'Timestral 209M, shifted', value: r['timestral-209m_shifted'],
                                       color: C.option, tick: r.oracle });
                rows5.push({ label: lead ? 'Chronos-2, as given' : 'Chronos-2', value: r['chronos-2'],
                             color: C.chronos, tick: r.oracle });
            });
            bars(box, rows5, { max: 1.3, ref: 1, aria: 'Error with the covariate divided by the error without it.' });
            legend(box, [{ color: C.timestral, label: 'Timestral 209M' },
                         { color: C.option, label: 'Timestral 209M, leader shifted into a known covariate' },
                         { color: C.chronos, label: 'Chronos-2' }, { kind: 'tick', label: 'best possible' },
                         { kind: 'dash', label: 'no gain (1)' }]);
            table(box, ['task', 'Timestral 209M', 'shifted', 'Chronos-2', 'shifted', 'best possible'], F.cov.map(function (r) {
                return [LBL[r.task], fmt(r['timestral-209m']), r['timestral-209m_shifted'] === undefined ? '' : fmt(r['timestral-209m_shifted']),
                        fmt(r['chronos-2']), r['chronos-2_shifted'] === undefined ? '' : fmt(r['chronos-2_shifted']),
                        r.oracle === null ? 'n/a' : fmt(r.oracle)];
            }));
        }
    }

    fetch('figures.json').then(function (r) { return r.json(); }).then(draw);
})();
