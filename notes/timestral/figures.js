/* ============================================================
   Score figures of the Timestral note, drawn as SVG from
   figures.json. Horizontal bars carry their value at the end,
   every figure has a legend when it has two series or more, a
   hover tooltip and a table view.
   ============================================================ */
(function () {
    'use strict';

    var NS = 'http://www.w3.org/2000/svg';
    var C = {
        timestral: '#e8590c', option: '#c2255c', chronos: '#862e9c', timesfm: '#6aa5ec', timesfm3: '#2a78d6', toto: '#1baf7a',
        toto1: '#0b7f4a', classical: '#8a8f92', ink: '#1f2222', muted: '#6a6f72', rule: '#ececea', surface: '#ffffff'
    };
    var NAMES = {
        'timestral-209m': 'Timestral 209M', 'timestral-123m': 'Timestral 123M', 'timestral-28m': 'Timestral 28M',
        'timestral-5m': 'Timestral 5M', 'chronos-2': 'Chronos-2', 'timesfm-2.5': 'TimesFM 2.5', 'timesfm-3': 'TimesFM 3.0',
        'toto2-2.5b': 'Toto 2.0 2.5B', 'toto2-1b': 'Toto 2.0 1B', 'toto2-313m': 'Toto 2.0 313M',
        'toto2-22m': 'Toto 2.0 22M', 'toto2-4m': 'Toto 2.0 4M', 'toto1': 'Toto 1.0, generative', 'autoarima': 'AutoARIMA', 'autoets': 'AutoETS', 'oracle': 'Best possible'
    };
    function colorOf(model) {
        if (model.indexOf('timestral') === 0) return C.timestral;
        if (model === 'chronos-2') return C.chronos;
        if (model === 'timesfm-2.5') return C.timesfm;
        if (model === 'timesfm-3') return C.timesfm3;
        if (model.indexOf('toto2') === 0) return C.toto;
        if (model === 'toto1') return C.toto1;
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

    var measure = document.createElement('canvas').getContext('2d');
    function textWidth(s) { measure.font = '12px Inter, sans-serif'; return measure.measureText(s).width; }

    /* Horizontal bars. rows: [{label, value, color, note, gap, header, tick}], opts: {ref, max, aria}.
       When the labels do not fit beside the bars (phones), they go above them. */
    function bars(box, rows, opts) {
        var W = Math.max(280, box.clientWidth), BAR = 16, LAB = Math.min(190, Math.round(W * 0.4));
        if (rows.some(function (r) { return r.header; })) LAB = Math.min(170, Math.round(W * 0.34));
        var widest = Math.max.apply(null, rows.map(function (r) { return r.label ? textWidth(r.label) : 0; }));
        var stacked = widest > LAB - 4, ROW = stacked ? 36 : 26, HEAD = 26;
        var tops = [], y = 4;
        rows.forEach(function (r) {
            if (r.gap) y += 10;
            tops.push(y);
            y += r.header ? HEAD : ROW;
        });
        var H = y + 22;
        var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': opts.aria || '' });
        var max = opts.max || Math.max.apply(null, rows.map(function (r) { return r.value || 0; })) * 1.12;
        var X0 = stacked ? 1 : LAB + 8, X1 = W - 44;
        var sx = function (v) { return X0 + (X1 - X0) * Math.min(v, max) / max; };
        // axis ticks
        var step = niceStep(max);
        for (var v = 0; v <= max + 1e-9; v += step) {
            var x = Math.round(sx(v)) + 0.5;
            el('line', { x1: x, x2: x, y1: 0, y2: H - 20, stroke: C.rule }, svg);
            text(svg, x, H - 6, tick(v, step), { 'text-anchor': v === 0 && stacked ? 'start' : 'middle', 'class': 'muted' });
        }
        if (opts.ref !== undefined) {               // under the bars and their labels
            var rx = Math.round(sx(opts.ref)) + 0.5;
            el('line', { x1: rx, x2: rx, y1: 0, y2: H - 20, stroke: C.ink, 'stroke-dasharray': '4 3' }, svg);
        }
        var halo = { 'paint-order': 'stroke', stroke: C.surface, 'stroke-width': 3 };
        rows.forEach(function (r, i) {
            var top = tops[i];
            if (r.header) {
                text(svg, 0, top + 17, r.header, { 'font-weight': 600, 'paint-order': 'stroke', stroke: C.surface, 'stroke-width': 3 });
                return;
            }
            var cy = stacked ? top + 17 + BAR / 2 : top + ROW / 2;
            if (stacked) text(svg, 0, top + 12, r.label, halo);
            else text(svg, LAB, cy + 4, r.label, { 'text-anchor': 'end' });
            if (r.value !== null && isFinite(r.value)) {
                var x2 = sx(r.value), w = Math.max(2, x2 - X0), rad = Math.min(4, w);
                var d = 'M' + X0 + ',' + (cy - BAR / 2) + ' h' + (w - rad) + ' a' + rad + ',' + rad + ' 0 0 1 ' + rad + ',' + rad
                    + ' v' + (BAR - 2 * rad) + ' a' + rad + ',' + rad + ' 0 0 1 ' + (-rad) + ',' + rad + ' h' + (-(w - rad)) + ' z';
                el('path', { d: d, fill: r.color }, svg);
                text(svg, x2 + 5, cy + 4, (r.value > max ? '> ' : '') + fmt(r.value), halo);
                var hit = el('rect', { x: X0, y: top, width: X1 - X0 + 40, height: ROW, fill: 'transparent' }, svg);
                hit.addEventListener('mousemove', function (ev) { showTip(ev, '<b>' + r.label + '</b><br>' + fmt(r.value) + (r.note ? '<br>' + r.note : '')); });
                hit.addEventListener('mouseleave', hideTip);
            } else {
                text(svg, X0 + 4, cy + 4, 'n/a', { 'class': 'muted' });
            }
            if (r.tick !== undefined && r.tick !== null) {
                var tx = Math.round(sx(r.tick)) + 0.5;
                el('line', { x1: tx, x2: tx, y1: cy - BAR / 2 - 3, y2: cy + BAR / 2 + 3, stroke: C.ink, 'stroke-width': 2 }, svg);
            }
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

    function draw(F) {
        var box;
        if ((box = document.getElementById('fig-overall'))) {
            var rows = F.overall.filter(function (r) { return colorOf(r.model) !== C.classical; }).map(function (r) {
                return { label: NAMES[r.model], value: r.value, color: colorOf(r.model) };
            });
            bars(box, rows, { ref: 1, aria: 'Average error relative to the best possible forecast, by model.' });
            legend(box, [{ color: C.timestral, label: 'Timestral' }, { color: C.chronos, label: 'Chronos-2' },
                         { color: C.timesfm, label: 'TimesFM 2.5' }, { color: C.timesfm3, label: 'TimesFM 3.0' }, { color: C.toto, label: 'Toto 2.0' },
                         { color: C.toto1, label: 'Toto 1.0, generative' }, { kind: 'dash', label: 'best possible (1)' }]);
            table(box, ['model', 'error / best possible'], F.overall.map(function (r) { return [NAMES[r.model], fmt(r.value)]; }));
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
                if (lead) rows5.push({ label: 'Chronos-2, shifted', value: r['chronos-2_shifted'],
                                       color: C.option, tick: r.oracle });
                rows5.push({ label: lead ? 'TimesFM 3.0, as given' : 'TimesFM 3.0', value: r['timesfm-3'],
                             color: C.timesfm3, tick: r.oracle });
                // shifted TimesFM 3.0 only where the lead covers the horizon (best possible 0), see the method details
                if (lead && r.oracle === 0) rows5.push({ label: 'TimesFM 3.0, shifted', value: r['timesfm-3_shifted'],
                                                         color: C.option, tick: r.oracle });
            });
            bars(box, rows5, { max: 1.3, ref: 1, aria: 'Error with the covariate divided by the error without it.' });
            legend(box, [{ color: C.timestral, label: 'Timestral 209M' }, { color: C.chronos, label: 'Chronos-2' },
                         { color: C.timesfm3, label: 'TimesFM 3.0' }, { color: C.option, label: 'leader shifted into a known covariate' },
                         { kind: 'tick', label: 'best possible' }, { kind: 'dash', label: 'no gain (1)' }]);
            table(box, ['task', 'Timestral 209M', 'shifted', 'Chronos‑2', 'shifted', 'TimesFM 3.0', 'shifted', 'best possible'], F.cov.map(function (r) {
                return [LBL[r.task], fmt(r['timestral-209m']), r['timestral-209m_shifted'] === undefined ? '' : fmt(r['timestral-209m_shifted']),
                        fmt(r['chronos-2']), r['chronos-2_shifted'] === undefined ? '' : fmt(r['chronos-2_shifted']),
                        fmt(r['timesfm-3']), r['timesfm-3_shifted'] === undefined || r.oracle !== 0 ? '' : fmt(r['timesfm-3_shifted']),
                        r.oracle === null ? 'n/a' : fmt(r.oracle)];
            }));
        }
    }

    fetch('figures.json').then(function (r) { return r.json(); }).then(draw);
})();
