/* Oberfläche: Rendering der Screens, Sheets, Ereignisse. */
(function () {
  'use strict';

  const C = window.Calc;
  const D = window.Data;

  let state = D.loadState();

  const view = {
    tab: 'week',
    weekKey: null,
    selectedDate: null,
    month: null,           // { year, month(0-11) } für die Übersicht
    sheet: null,           // { type, ...daten }
    showMoreShifts: false
  };

  // iPhone-Home-Bildschirm: iOS meldet das Fenster um die Statusleiste zu klein (z. B. 793 statt 852),
  // zeichnet aber ab dem oberen Rand. Den gemessenen Unterschied hängen wir unten an den Rahmen an.
  function fixViewport() {
    let extra = 0;
    try {
      const standalone = (navigator.standalone === true) || window.matchMedia('(display-mode: standalone)').matches;
      const portrait = window.innerWidth <= window.innerHeight;
      if (standalone && portrait) {
        const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 0;
        const short = screen.height - window.innerHeight;
        if (short > 0 && short <= safeTop + 2) extra = short;
      }
    } catch (err) { extra = 0; }
    document.documentElement.style.setProperty('--app-extra', extra + 'px');
  }
  fixViewport();
  window.addEventListener('orientationchange', function () { setTimeout(fixViewport, 300); });

  // ---------- Start ----------
  (function initView() {
    const t = C.today();
    let key = C.weekKeyOf(t);
    let sel = t;
    if (C.isWeekend(t)) { key = C.shiftWeek(key, 1); sel = C.weekStartOf(key); }
    view.weekKey = key;
    view.selectedDate = sel;
    const d = C.parseDate(t);
    view.month = { year: d.getFullYear(), month: d.getMonth() };
  })();

  // ---------- Hilfen ----------
  const $ = function (sel) { return document.querySelector(sel); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function fmt(h) { return C.formatHours(h, state.settings.hoursFormat, true); }
  function fmtNo(h) { return C.formatHours(h, state.settings.hoursFormat, false); }
  // Glatte Stunden ohne Nachkommastellen, z. B. Soll „39 h“ statt „39,00 h“
  function fmtPlain(h) { return Math.abs(h - Math.round(h)) < 0.005 ? String(Math.round(h)) : fmtNo(h); }
  function commit() { D.saveState(state); render(); }
  function icon(name, size) {
    size = size || 18;
    const paths = {
      'chev-right': '<path d="M9 6l6 6-6 6"></path>',
      'chev-left': '<path d="M15 6l-6 6 6 6"></path>',
      'chev-down': '<path d="M6 9l6 6 6-6"></path>',
      'arrow-left': '<path d="M19 12H5M11 6l-6 6 6 6"></path>',
      'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"></path>',
      plus: '<path d="M12 5v14M5 12h14"></path>',
      check: '<path d="M5 12l5 5L20 7"></path>',
      x: '<path d="M6 6l12 12M18 6L6 18"></path>',
      pencil: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path>',
      upload: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 4v11M8 8l4-4 4 4"></path>',
      download: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 15V4M8 11l4 4 4-4"></path>'
    };
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + paths[name] + '</svg>';
  }
  const KIND_COLOR = { dienst: 'var(--black)', vz: 'var(--orange)', termin: 'var(--green)', absence: 'var(--grey)' };

  let toastTimer = null;
  function toast(msg, actionLabel, onAction) {
    const el = $('#toast');
    el.innerHTML = esc(msg) + (actionLabel ? '<button type="button" data-action="toast-action">' + esc(actionLabel) + '</button>' : '');
    el.hidden = false;
    el._onAction = onAction || null;
    clearTimeout(toastTimer);
    if (!actionLabel) toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  // ---------- Rendering ----------
  function render() {
    document.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('is-active', b.dataset.tab === view.tab); });
    document.querySelectorAll('.screen').forEach(function (s) { s.hidden = s.dataset.screen !== view.tab; });
    if (view.tab === 'week') renderWeek();
    else if (view.tab === 'termine') renderTermine();
    else if (view.tab === 'uebersicht') renderUebersicht();
    else renderEinstellungen();
    if (view.sheet) renderSheet();
  }

  // ----- Woche -----
  function fineSegments(dateStr) {
    const items = C.dayItems(state, dateStr);
    const t0 = C.toMinutes(state.settings.timelineStart);
    const t1 = C.toMinutes(state.settings.timelineEnd);
    const span = Math.max(60, t1 - t0);
    return items.map(function (it) {
      if (it.kind === 'absence') {
        return it.hours > 0 ? '<div class="seg seg-absence" style="left:0;width:100%"></div>' : '';
      }
      const a = Math.max(t0, C.toMinutes(it.start));
      const b = Math.min(t1, C.toMinutes(it.end));
      if (b <= a) return '';
      const left = ((a - t0) / span * 100).toFixed(2);
      const width = ((b - a) / span * 100).toFixed(2);
      return '<div class="seg seg-' + it.kind + '" style="left:' + left + '%;width:' + width + '%"></div>';
    }).join('');
  }

  function renderWeek() {
    const key = view.weekKey;
    const days = C.weekDays(key).slice(0, 5);
    const wh = C.weekHours(state, key);
    const target = Number(state.settings.targetHours) || 0;
    const todayStr = C.today();
    const prevKey = C.shiftWeek(key, -1);
    const nextKey = C.shiftWeek(key, 1);

    let head = '';
    head += '<div class="bg-glow bg-glow-a"></div><div class="bg-glow bg-glow-b"></div>';
    head += '<button class="corner-btn" type="button" data-action="entry-new" aria-label="Neuer Eintrag">' + icon('plus', 20) + '</button>';
    head += '<div class="page-title"><h1>Dienstplan</h1><div class="subtitle">Sarah · Soll ' + esc(fmtPlain(target)) + ' h pro Woche</div></div>';
    head += '<div class="kw-nav">';
    head += '<button class="kw-side" type="button" data-action="week-prev">' + icon('arrow-left', 16) + '<span>' + C.weekNumberLabel(prevKey) + '</span></button>';
    head += '<button class="kw-center" type="button" data-action="week-today"><div class="kw-number">' + C.weekNumberLabel(key) + '</div><div class="kw-range">' + esc(C.weekRangeLabel(key, true)) + '</div></button>';
    head += '<button class="kw-side" type="button" data-action="week-next"><span>' + C.weekNumberLabel(nextKey) + '</span>' + icon('arrow-right', 16) + '</button>';
    head += '</div>';
    head += '<div class="pills">';
    days.forEach(function (d) {
      const sel = d === view.selectedDate;
      const h = wh.perDay[d];
      head += '<div class="pill-col' + (sel ? ' is-selected' : '') + '">';
      head += '<button class="pill' + (sel ? ' is-selected' : '') + (d === todayStr ? ' is-today' : '') + '" type="button" data-action="select-day" data-date="' + d + '">';
      head += '<div class="pill-day">' + C.dayOfMonth(d) + '</div><div class="pill-wd">' + C.dayLabelShort(d) + '</div></button>';
      head += '<div class="fine">' + fineSegments(d) + '</div>';
      head += '<div class="pill-hours">' + (h > 0 ? esc(fmtNo(h)) : '–') + '</div>';
      head += '</div>';
    });
    head += '</div>';
    $('#week-head').innerHTML = head;

    // Stundenkarte
    const remaining = C.round2(target - wh.total);
    let diffHtml;
    let ok = false;
    if (remaining > 0.005) diffHtml = 'noch ' + esc(fmt(remaining));
    else if (remaining < -0.005) { diffHtml = esc(C.formatSigned(-remaining, state.settings.hoursFormat)) + ' über Soll'; ok = true; }
    else { diffHtml = 'Soll erreicht'; ok = true; }
    const pct = target > 0 ? Math.min(100, wh.total / target * 100) : 0;
    const week = C.weekRecord(state, key);
    const wshift = week.shiftId ? C.shiftById(state, week.shiftId) : null;

    let body = '';
    body += '<div class="card hours-card">';
    body += '<div class="hours-top"><div><div class="hours-label">Diese Woche</div><div class="hours-big"><div class="hours-value">' + esc(fmtNo(wh.total)) + '</div><div class="hours-target">/ ' + esc(fmtPlain(target)) + ' h</div></div></div>';
    body += '<div class="hours-diff' + (ok ? ' is-ok' : '') + '">' + diffHtml + '</div></div>';
    body += '<div class="bar"><div class="bar-fill' + (ok ? ' is-ok' : '') + '" style="width:' + pct.toFixed(1) + '%"></div></div>';
    body += '<div class="divider"></div>';
    body += '<button class="shift-row" type="button" data-action="sheet-shift-week"><div class="shift-row-main">';
    if (wshift) {
      body += '<span class="badge badge-black">' + esc(wshift.code) + '</span><span class="shift-row-label">Dienst</span><span class="shift-row-sub">' + esc(wshift.start) + ' – ' + esc(wshift.end) + ' · ' + esc(fmt(C.shiftHours(state, wshift))) + '/Tag</span>';
    } else {
      body += '<span class="badge badge-muted">–</span><span class="shift-row-label">Dienst wählen</span><span class="shift-row-sub">für diese Woche</span>';
    }
    body += '</div>' + icon('chev-right') + '</button>';
    body += '</div>';

    // Tag
    const d = view.selectedDate;
    const items = C.dayItems(state, d);
    const dh = wh.perDay[d] != null ? wh.perDay[d] : C.dayHours(state, d);
    body += '<button class="day-head" type="button" data-action="sheet-day" data-date="' + d + '"><div class="day-title">' + C.dayLabelLong(d) + icon('chev-down', 16) + '</div><div class="day-sum">' + esc(fmt(dh)) + '</div></button>';
    if (!items.length) {
      body += '<div class="empty">Noch nichts geplant. Oben den Dienst der Woche wählen oder unten VZ und Termine eintragen.</div>';
    } else {
      body += '<div class="timeline">';
      items.forEach(function (it) { body += timelineRow(it, d); });
      body += '</div>';
    }
    body += '<div class="btn-row indent">';
    body += '<button class="btn btn-outline is-vz" type="button" data-action="entry-new" data-kind="vz" data-date="' + d + '">' + icon('plus', 16) + 'VZ</button>';
    body += '<button class="btn btn-outline is-termin" type="button" data-action="entry-new" data-kind="termin" data-date="' + d + '">' + icon('plus', 16) + 'Termin</button>';
    body += '</div>';
    $('#week-body').innerHTML = body;
  }

  function timelineRow(it, dateStr) {
    let html = '<div class="tl-row"><div class="tl-gutter"><div class="tl-time">' + (it.start ? esc(it.start) : '') + '</div><div class="tl-line"></div><div class="tl-dot" style="background:' + KIND_COLOR[it.kind] + '"></div></div><div class="tl-body">';
    let action, extra = '';
    if (it.kind === 'dienst' || it.kind === 'absence') { action = 'sheet-day'; extra = ' data-date="' + dateStr + '"'; }
    else if (it.series) { action = 'sheet-series-occ'; extra = ' data-id="' + it.series.id + '" data-date="' + dateStr + '"'; }
    else { action = 'entry-edit'; extra = ' data-id="' + it.id + '"'; }
    html += '<button class="tl-card' + (it.kind === 'dienst' ? ' tl-card-dienst' : '') + (it.kind === 'absence' ? ' tl-card-absence' : '') + '" type="button" data-action="' + action + '"' + extra + '>';
    html += '<div class="tl-main"><div class="tl-title">' + esc(it.title);
    if (it.kind === 'dienst') html += '<span class="tl-tag">' + (it.override ? 'nur heute' : 'Dienst') + '</span>';
    if (it.series) html += '<span class="tl-tag tl-tag-light">Serie</span>';
    html += '</div>';
    if (it.start) html += '<div class="tl-sub">' + esc(it.start) + ' – ' + esc(it.end) + '</div>';
    else html += '<div class="tl-sub">ganzer Tag</div>';
    html += '</div><div class="tl-hours is-' + it.kind + '">' + esc(fmt(it.hours)) + '</div></button></div></div>';
    return html;
  }

  // ----- Termine -----
  function renderTermine() {
    const todayStr = C.today();
    let html = '<div class="bg-glow bg-glow-a"></div>';
    html += '<button class="corner-btn" type="button" data-action="sheet-series" aria-label="Neue Serie">' + icon('plus', 20) + '</button>';
    html += '<div class="page-head"><h1>Termine</h1><div class="subtitle">Regelmäßige Termine und Ausnahmen</div></div>';
    html += '<div class="section-label">Serien</div>';
    if (!state.series.length) {
      html += '<div class="empty">Noch keine Serie. Zum Beispiel: Dienstbesprechung, montags 16:30 – 18:30, jede Woche.</div>';
    }
    state.series.forEach(function (se) {
      const next = C.nextOccurrence(se, todayStr);
      html += '<div class="card series-card">';
      html += '<button class="series-top" type="button" data-action="sheet-series" data-id="' + se.id + '"><div><div class="series-title"><span class="row-dot" style="background:var(--green)"></span>' + esc(se.title) + '</div>';
      html += '<div class="series-sub">' + C.WEEKDAYS_LONG[se.weekday - 1] + 's · ' + esc(se.start) + ' – ' + esc(se.end) + ' · ' + intervalLabel(se.interval) + (se.until ? ' · bis ' + esc(C.formatShort(se.until)) : '') + '</div></div>';
      html += '<div class="series-hours">' + esc(fmt(C.spanHours(se.start, se.end))) + '</div></button>';
      html += '<div class="divider"></div><div class="series-meta">';
      html += '<div class="series-meta-row"><span class="k">Nächster Termin</span><span class="v">' + (next ? C.dayLabelShort(next) + ', ' + esc(C.formatShort(next)) : '–') + '</span></div>';
      se.skipDates.slice().sort().forEach(function (dt) {
        if (dt < C.addDays(todayStr, -7)) return;
        html += '<div class="series-meta-row"><span class="k"><span class="row-dot" style="width:6px;height:6px;background:var(--red)"></span>Entfällt</span><span class="v is-red">' + C.dayLabelShort(dt) + ', ' + esc(C.formatShort(dt)) + '<button class="x-btn" type="button" data-action="exception-remove" data-id="' + se.id + '" data-date="' + dt + '" data-type="skip">' + icon('x', 12) + '</button></span></div>';
      });
      se.extraDates.slice().sort(function (a, b) { return C.compareDates(a.date, b.date); }).forEach(function (x) {
        if (x.date < C.addDays(todayStr, -7)) return;
        html += '<div class="series-meta-row"><span class="k"><span class="row-dot" style="width:6px;height:6px;background:var(--orange)"></span>Zusätzlich</span><span class="v is-orange">' + C.dayLabelShort(x.date) + ', ' + esc(C.formatShort(x.date)) + ' · ' + esc(x.start) + ' – ' + esc(x.end) + '<button class="x-btn" type="button" data-action="exception-remove" data-id="' + se.id + '" data-date="' + x.date + '" data-type="extra">' + icon('x', 12) + '</button></span></div>';
      });
      html += '</div>';
      html += '<div class="series-actions"><button class="btn btn-secondary" type="button" data-action="sheet-exception" data-id="' + se.id + '">Ausnahme</button><button class="btn btn-secondary" type="button" data-action="sheet-series" data-id="' + se.id + '">Bearbeiten</button></div>';
      html += '</div>';
    });

    html += '<div class="section-label">Einzeltermine · nächste 4 Wochen</div>';
    const limit = C.addDays(todayStr, 28);
    const singles = state.entries.filter(function (e) { return e.kind === 'termin' && e.date >= todayStr && e.date <= limit; })
      .sort(function (a, b) { return C.compareDates(a.date, b.date) || C.toMinutes(a.start) - C.toMinutes(b.start); });
    if (!singles.length) {
      html += '<div class="empty">Keine Einzeltermine in den nächsten vier Wochen. Termine trägst du in der Wochenansicht über „+ Termin“ ein.</div>';
    } else {
      html += '<div class="list">';
      singles.forEach(function (e) {
        html += '<button class="list-row" type="button" data-action="entry-edit" data-id="' + e.id + '"><span class="row-dot" style="background:var(--green)"></span><div class="row-main" style="flex:1"><div class="row-title">' + esc(e.title) + '</div><div class="row-sub">' + C.dayLabelShort(e.date) + ', ' + esc(C.formatShort(e.date)) + ' · ' + esc(e.start) + ' – ' + esc(e.end) + '</div></div><div class="row-value">' + esc(fmt(C.spanHours(e.start, e.end))) + '</div></button>';
      });
      html += '</div>';
    }
    html += '<button class="btn btn-primary btn-block" type="button" data-action="sheet-series">' + icon('plus', 18) + 'Serie anlegen</button>';
    $('#screen-termine').innerHTML = html;
  }
  function intervalLabel(n) { return n === 1 ? 'jede Woche' : 'alle ' + n + ' Wochen'; }

  // ----- Übersicht -----
  function renderUebersicht() {
    const currentKey = C.weekKeyOf(C.today());
    const s = C.saldo(state, currentKey);
    const target = Number(state.settings.targetHours) || 0;
    let html = '<div class="bg-glow bg-glow-a"></div>';
    html += '<div class="page-head"><h1>Übersicht</h1><div class="subtitle">Alle Wochen auf einen Blick</div></div>';
    html += '<button class="saldo-card" type="button" data-action="sheet-saldo"><div><div class="saldo-label">' + (s.startKey ? 'Saldo seit ' + C.weekNumberLabel(s.startKey) + (C.parseWeekKey(s.startKey).year !== C.parseWeekKey(currentKey).year ? '/' + C.parseWeekKey(s.startKey).year : '') : 'Saldo') + '</div>';
    html += '<div class="saldo-sub">' + (s.startKey ? 'Ist minus Soll, ' + s.weeks + ' abgeschlossene Woche' + (s.weeks === 1 ? '' : 'n') : 'Zählt ab der ersten Woche mit Dienst') + '</div></div>';
    html += '<div class="saldo-value' + (s.value > 0.005 ? ' is-plus' : '') + '">' + esc(C.formatSigned(s.value, state.settings.hoursFormat)) + '</div></button>';

    const m = view.month;
    html += '<div class="month-nav"><div class="month-label">' + C.MONTHS_LONG[m.month] + ' ' + m.year + '</div><div style="display:flex;gap:6px">';
    html += '<button class="icon-btn" type="button" data-action="month-prev">' + icon('chev-left', 16) + '</button><button class="icon-btn" type="button" data-action="month-next">' + icon('chev-right', 16) + '</button></div></div>';

    // Wochen, deren Mo–Fr in den Monat fallen
    const first = C.formatDate(new Date(m.year, m.month, 1));
    const last = C.formatDate(new Date(m.year, m.month + 1, 0));
    let key = C.weekKeyOf(first);
    const keys = [];
    for (let i = 0; i < 6; i++) {
      const days = C.weekDays(key);
      if (days[0] > last) break;
      if (days[4] >= first) keys.push(key);
      key = C.shiftWeek(key, 1);
    }
    html += '<div class="week-list">';
    keys.forEach(function (k) {
      const wh = C.weekHours(state, k);
      const week = C.weekRecord(state, k);
      const sh = week.shiftId ? C.shiftById(state, week.shiftId) : null;
      const isCurrent = k === currentKey;
      const isFuture = C.weeksBetween(currentKey, k) > 0;
      const isPast = !isCurrent && !isFuture;
      const hasAnything = wh.total > 0 || sh;
      const pct = target > 0 ? Math.min(100, wh.total / target * 100) : 0;
      const reached = wh.total >= target - 0.005;
      const days = C.weekDays(k);
      html += '<button class="week-row' + (isCurrent ? ' is-current' : '') + (isFuture ? ' is-future' : '') + '" type="button" data-action="goto-week" data-week="' + k + '">';
      html += '<div class="week-row-top"><div class="week-row-kw"><b>' + C.weekNumberLabel(k) + '</b><span' + (isCurrent ? ' class="is-current"' : '') + '>' + (isCurrent ? 'diese Woche' : esc(C.formatDots(days[0])) + ' – ' + esc(C.formatDots(days[4]))) + '</span></div>';
      html += '<span class="badge' + (sh ? (isCurrent ? ' badge-black' : '') : ' badge-muted') + '">' + (sh ? esc(sh.code) : '–') + '</span>';
      if (!hasAnything) html += '<div class="week-row-hours is-none">kein Dienst</div><div class="week-row-mark"></div>';
      else {
        html += '<div class="week-row-hours' + (isFuture ? ' is-muted' : '') + '">' + esc(fmt(wh.total)) + '</div>';
        if (isPast && reached) html += '<div class="week-row-mark" style="color:var(--green)">' + icon('check', 18) + '</div>';
        else if (isPast) html += '<div class="week-row-mark">' + esc(C.formatSigned(C.round2(wh.total - target), state.settings.hoursFormat)).replace(' h', '') + '</div>';
        else if (isCurrent) html += '<div class="week-row-mark">' + (reached ? icon('check', 18) : esc(C.formatSigned(C.round2(wh.total - target), state.settings.hoursFormat)).replace(' h', '')) + '</div>';
        else html += '<div class="week-row-mark"></div>';
      }
      html += '</div>';
      html += '<div class="mini-bar"><div class="' + (isFuture ? 'is-future' : (reached ? 'is-ok' : '')) + '" style="width:' + pct.toFixed(1) + '%"></div></div>';
      html += '</button>';
    });
    html += '</div>';
    $('#screen-uebersicht').innerHTML = html;
  }

  // ----- Einstellungen -----
  function renderEinstellungen() {
    const st = state.settings;
    const vz = state.shifts.filter(function (s) { return s.group === 'vollzeit'; }).map(function (s) { return s.code; });
    const others = state.shifts.length - vz.length;
    let html = '<div class="bg-glow bg-glow-a"></div>';
    html += '<div class="page-head"><h1>Einstellungen</h1><div class="subtitle">Arbeitszeit, Dienste und Daten</div></div>';
    html += '<div class="section-label">Arbeitszeit</div><div class="list">';
    html += row('sheet-number', { key: 'targetHours', title: 'Soll-Stunden pro Woche' }, fmtPlain(st.targetHours) + ' h');
    html += row('sheet-number', { key: 'absenceHoursPerDay', title: 'Urlaub / Krank pro Tag', sub: 'wird pro Abwesenheitstag angerechnet' }, fmt(st.absenceHoursPerDay));
    html += '<div class="list-row"><div class="row-main"><div class="row-title">Pause abziehen</div><div class="row-sub">S1 und S2 dann 6,00 statt 6,50 h</div></div><button class="toggle' + (st.deductPause ? ' is-on' : '') + '" type="button" data-action="toggle-pause" aria-label="Pause abziehen"></button></div>';
    html += '<div class="list-row"><div class="row-main"><div class="row-title">Stundenanzeige</div></div><div class="seg-control seg-mini"><button class="seg-opt' + (st.hoursFormat !== 'hm' ? ' is-on' : '') + '" type="button" data-action="set-format" data-value="decimal">6,25 h</button><button class="seg-opt' + (st.hoursFormat === 'hm' ? ' is-on' : '') + '" type="button" data-action="set-format" data-value="hm">6:15 h</button></div></div>';
    html += '</div>';

    html += '<div class="section-label">Dienste</div><div class="list">';
    html += row('sheet-shifts', {}, '', { title: 'Dienste bearbeiten', sub: vz.join(', ') + (others ? ' + ' + others + ' weitere' : '') });
    html += row('sheet-timeline', {}, st.timelineStart.replace(/^0/, '') + ' – ' + st.timelineEnd.replace(/^0/, '') + ' Uhr', { title: 'Zeitlinie der Tage', sub: 'Skala unter den Tagespillen' });
    html += '</div>';

    html += '<div class="section-label">Übersicht</div><div class="list">';
    const cur = C.weekKeyOf(C.today());
    const s = C.saldo(state, cur);
    html += row('sheet-saldo', {}, s.startKey ? C.weekNumberLabel(s.startKey) + '/' + C.parseWeekKey(s.startKey).year : 'automatisch', { title: 'Saldo zählt ab', sub: st.saldoStartWeek ? 'manuell gesetzt' : 'erste Woche mit Dienst' });
    html += '</div>';

    html += '<div class="section-label">Daten</div><div class="list">';
    html += '<button class="list-row" type="button" data-action="export"><div class="row-main"><div class="row-title">Backup exportieren</div><div class="row-sub">' + (st.lastBackup ? 'Zuletzt: ' + esc(C.formatLong(st.lastBackup)) : 'Noch kein Backup') + '</div></div><div class="row-value">' + icon('upload') + '</div></button>';
    html += '<button class="list-row" type="button" data-action="sheet-import"><div class="row-main"><div class="row-title">Backup importieren</div></div><div class="row-value">' + icon('download') + '</div></button>';
    html += '<button class="list-row row-danger" type="button" data-action="confirm-reset"><div class="row-main"><div class="row-title">Alle Daten löschen</div></div></button>';
    html += '</div>';
    html += '<div class="footer-note">Dienstplan Sarah · Version ' + esc(window.APP_VERSION || '1.0') + '<br>Alle Daten bleiben auf diesem iPhone. Regelmäßig ein Backup exportieren.<br><span class="diag">' + esc(diagLine()) + '</span></div>';
    $('#screen-einstellungen').innerHTML = html;

    function row(action, data, value, labels) {
      labels = labels || data;
      let attrs = '';
      Object.keys(data).forEach(function (k) { attrs += ' data-' + k.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); }) + '="' + esc(data[k]) + '"'; });
      return '<button class="list-row" type="button" data-action="' + action + '"' + attrs + '><div class="row-main"><div class="row-title">' + esc(labels.title) + '</div>' + (labels.sub ? '<div class="row-sub">' + esc(labels.sub) + '</div>' : '') + '</div><div class="row-value">' + (value ? '<span>' + esc(value) + '</span>' : '') + icon('chev-right', 16) + '</div></button>';
    }
  }

  // Kleine Diagnosezeile für Layout-Fragen auf dem iPhone (Bildschirm-, Fenster- und App-Höhe).
  function diagLine() {
    try {
      const app = document.getElementById('app');
      const cs = getComputedStyle(document.documentElement);
      const standalone = (navigator.standalone === true) || window.matchMedia('(display-mode: standalone)').matches;
      return 'Anzeige ' + screen.width + '×' + screen.height + ' · Fenster ' + window.innerWidth + '×' + window.innerHeight +
        ' · App ' + Math.round(app.getBoundingClientRect().height) +
        ' · Rand oben ' + (cs.getPropertyValue('--safe-top') || '').trim() + ' unten ' + (cs.getPropertyValue('--safe-bottom') || '').trim() +
        ' · Ausgleich ' + (document.documentElement.style.getPropertyValue('--app-extra') || '0px') +
        ' · ' + (standalone ? 'Home-Bildschirm' : 'Browser');
    } catch (err) { return ''; }
  }

  // ---------- Sheets ----------
  function openSheet(sheet) {
    view.sheet = sheet;
    renderSheet();
    const el = $('#sheet'), bd = $('#sheet-backdrop');
    el.hidden = false; bd.hidden = false;
    requestAnimationFrame(function () { el.classList.add('is-open'); bd.classList.add('is-open'); });
  }
  function closeSheet() {
    const el = $('#sheet'), bd = $('#sheet-backdrop');
    el.classList.remove('is-open'); bd.classList.remove('is-open');
    view.sheet = null;
    setTimeout(function () { if (!view.sheet) { el.hidden = true; bd.hidden = true; $('#sheet-content').innerHTML = ''; } }, 260);
  }
  function renderSheet() {
    const sh = view.sheet;
    if (!sh) return;
    const map = {
      'shift-week': sheetShiftWeek, day: sheetDay, entry: sheetEntry, 'series-occ': sheetSeriesOcc, series: sheetSeries,
      exception: sheetException, number: sheetNumber, timeline: sheetTimeline, shifts: sheetShifts, 'shift-edit': sheetShiftEdit,
      saldo: sheetSaldo, 'import': sheetImport, confirm: sheetConfirm, text: sheetText
    };
    $('#sheet-content').innerHTML = map[sh.type](sh);
    $('#sheet-content').scrollTop = 0;
  }
  function head(title, sub, value) {
    return '<div class="sheet-head"><div><div class="sheet-title">' + esc(title) + '</div>' + (sub ? '<div class="sheet-sub">' + esc(sub) + '</div>' : '') + '</div>' + (value ? '<div class="sheet-value">' + esc(value) + '</div>' : '') + '</div>';
  }
  function shiftOption(sh, selected, action, extraAttrs) {
    return '<button class="option' + (selected ? ' is-selected' : '') + '" type="button" data-action="' + action + '" data-id="' + sh.id + '"' + (extraAttrs || '') + '><span class="option-code">' + esc(sh.code) + '</span><span class="option-main">' + esc(sh.start) + ' – ' + esc(sh.end) + (sh.pause ? ' · ' + esc(fmtNo(sh.pause)) + ' h Pause' : '') + (sh.group !== 'vollzeit' ? ' · ' + esc(sh.label) : '') + '</span><span class="option-hours">' + esc(fmt(C.shiftHours(state, sh))) + '</span>' + (selected ? icon('check') : '') + '</button>';
  }
  function groupedShifts() {
    return {
      vollzeit: state.shifts.filter(function (s) { return s.group === 'vollzeit'; }),
      other: state.shifts.filter(function (s) { return s.group !== 'vollzeit'; })
    };
  }

  function sheetShiftWeek() {
    const key = view.weekKey;
    const week = C.weekRecord(state, key);
    const g = groupedShifts();
    let html = head('Dienst für ' + C.weekNumberLabel(key), 'Gilt Montag bis Freitag. Einzelne Tage änderst du am Tag selbst.');
    html += '<div class="option-list">';
    g.vollzeit.forEach(function (sh) { html += shiftOption(sh, week.shiftId === sh.id, 'pick-week-shift'); });
    html += '</div>';
    if (g.other.length) {
      html += '<button class="option-toggle" type="button" data-action="toggle-more"><span>Teilzeit &amp; Vertretung · ' + g.other.length + ' weitere</span>' + icon(view.showMoreShifts ? 'chev-down' : 'chev-right') + '</button>';
      if (view.showMoreShifts) {
        html += '<div class="option-list">';
        g.other.forEach(function (sh) { html += shiftOption(sh, week.shiftId === sh.id, 'pick-week-shift'); });
        html += '</div>';
      }
    }
    if (week.shiftId) html += '<button class="btn btn-danger" type="button" data-action="pick-week-shift" data-id="">Kein Dienst in dieser Woche</button>';
    return html;
  }

  function sheetDay(sh) {
    const d = sh.date;
    const key = C.weekKeyOf(d);
    const week = C.weekRecord(state, key);
    const dayRec = (week.days && week.days[d]) || {};
    const res = C.resolveDay(state, d);
    const items = C.dayItems(state, d);
    const g = groupedShifts();
    const selectedShift = res.shift ? res.shift.id : null;
    let html = head(C.dayLabelLong(d) + ', ' + C.formatShort(d), 'Tagessumme', fmt(C.dayHours(state, d)));
    html += '<div class="sheet-section"><div class="sheet-label">Dienst an diesem Tag' + (res.override ? ' · abweichend von der Woche' : '') + '</div>';
    html += '<div class="chip-grid">';
    g.vollzeit.forEach(function (s) { html += '<button class="chip' + (selectedShift === s.id ? ' is-selected' : '') + '" type="button" data-action="pick-day-shift" data-date="' + d + '" data-id="' + s.id + '">' + esc(s.code) + '</button>'; });
    html += '</div>';
    html += '<div class="chip-grid chip-grid-4">';
    html += '<button class="chip chip-small' + (view.showMoreShifts ? ' is-selected' : '') + '" type="button" data-action="toggle-more">Vertretung</button>';
    ['frei', 'urlaub', 'krank', 'feiertag'].forEach(function (a) {
      html += '<button class="chip chip-small is-absence' + (res.absence === a ? ' is-selected' : '') + '" type="button" data-action="pick-day-absence" data-date="' + d + '" data-value="' + a + '">' + C.absenceLabel(a) + '</button>';
    });
    html += '</div>';
    if (view.showMoreShifts && g.other.length) {
      html += '<div class="option-list">';
      g.other.forEach(function (s) { html += shiftOption(s, selectedShift === s.id, 'pick-day-shift', ' data-date="' + d + '"'); });
      html += '</div>';
    }
    if (res.override || dayRec.shiftId || dayRec.absence) {
      html += '<button class="btn btn-secondary" type="button" data-action="pick-day-reset" data-date="' + d + '">Zurück auf Wochen-Dienst' + (week.shiftId ? ' (' + esc((C.shiftById(state, week.shiftId) || {}).code || '') + ')' : '') + '</button>';
    }
    html += '</div>';

    html += '<div class="sheet-section"><div class="sheet-label">Tagesablauf</div>';
    if (!items.length) html += '<div class="sheet-note">Noch nichts eingetragen.</div>';
    else {
      html += '<div class="option-list">';
      items.forEach(function (it) {
        const dark = it.kind === 'dienst';
        let attrs, action;
        if (it.kind === 'dienst' || it.kind === 'absence') { action = 'noop'; attrs = ''; }
        else if (it.series) { action = 'sheet-series-occ'; attrs = ' data-id="' + it.series.id + '" data-date="' + d + '"'; }
        else { action = 'entry-edit'; attrs = ' data-id="' + it.id + '"'; }
        html += '<button class="option' + (dark ? ' option-dark' : '') + '" type="button" data-action="' + action + '"' + attrs + '><span class="row-dot" style="background:' + (dark ? '#fff' : KIND_COLOR[it.kind]) + '"></span><span class="option-code" style="width:auto;flex:1">' + esc(it.title) + '</span><span class="option-main" style="flex:0 0 auto">' + (it.start ? esc(it.start) + ' – ' + esc(it.end) : 'ganzer Tag') + '</span><span class="option-hours">' + esc(fmt(it.hours)) + '</span>' + (action !== 'noop' ? icon('chev-right', 16) : '') + '</button>';
      });
      html += '</div>';
    }
    html += '<div class="btn-row" style="margin:0"><button class="btn btn-outline is-vz" type="button" data-action="entry-new" data-kind="vz" data-date="' + d + '">' + icon('plus', 16) + 'VZ</button><button class="btn btn-outline is-termin" type="button" data-action="entry-new" data-kind="termin" data-date="' + d + '">' + icon('plus', 16) + 'Termin</button></div>';
    html += '</div>';
    html += '<button class="btn btn-primary" type="button" data-action="sheet-close">Fertig</button>';
    return html;
  }

  function sheetEntry(sh) {
    const e = sh.id ? state.entries.find(function (x) { return x.id === sh.id; }) : null;
    const kind = e ? e.kind : (sh.kind || 'vz');
    const date = e ? e.date : sh.date;
    const title = e ? e.title : (kind === 'termin' ? '' : 'VZ');
    const start = e ? e.start : (kind === 'termin' ? '14:30' : '07:15');
    const end = e ? e.end : (kind === 'termin' ? '16:00' : '08:30');
    let html = head(e ? 'Eintrag bearbeiten' : 'Neuer Eintrag', C.dayLabelLong(date) + ', ' + C.formatShort(date));
    html += '<div class="seg-control"><button class="seg-opt' + (kind === 'vz' ? ' is-on' : '') + '" type="button" data-action="entry-kind" data-value="vz"><span class="row-dot" style="background:var(--orange)"></span>VZ</button><button class="seg-opt' + (kind === 'termin' ? ' is-on' : '') + '" type="button" data-action="entry-kind" data-value="termin"><span class="row-dot" style="background:var(--green)"></span>Termin</button></div>';
    html += '<input type="hidden" id="f-kind" value="' + kind + '">';
    html += '<div class="field"><div class="sheet-label">Bezeichnung</div><input class="input" id="f-title" type="text" value="' + esc(title) + '" placeholder="' + (kind === 'termin' ? 'z. B. Elterngespräch' : 'VZ') + '" autocomplete="off"></div>';
    html += '<div class="field"><div class="sheet-label">Datum</div><input class="input" id="f-date" type="date" value="' + esc(date) + '"></div>';
    html += '<div class="field-2"><div class="field"><div class="sheet-label">Von</div><input class="input input-time" id="f-start" type="time" value="' + esc(start) + '" step="300"></div><div class="field"><div class="sheet-label">Bis</div><input class="input input-time" id="f-end" type="time" value="' + esc(end) + '" step="300"></div></div>';
    html += '<div class="kv"><span class="k">Dauer</span><span class="v" id="f-duration">' + esc(fmt(C.spanHours(start, end))) + '</span></div>';
    html += '<div class="sheet-actions"><button class="btn btn-primary" type="button" data-action="entry-save"' + (e ? ' data-id="' + e.id + '"' : '') + '>Speichern</button>';
    if (e) html += '<button class="btn btn-danger" type="button" data-action="entry-delete" data-id="' + e.id + '">Eintrag löschen</button>';
    html += '</div>';
    return html;
  }

  function sheetSeriesOcc(sh) {
    const se = state.series.find(function (x) { return x.id === sh.id; });
    if (!se) return head('Termin');
    const occ = C.seriesOccursOn(se, sh.date) || {};
    let html = head(se.title, C.dayLabelLong(sh.date) + ', ' + C.formatShort(sh.date) + ' · ' + (occ.start || se.start) + ' – ' + (occ.end || se.end), fmt(C.spanHours(occ.start || se.start, occ.end || se.end)));
    html += '<div class="sheet-note">Teil der Serie „' + esc(se.title) + '“, ' + C.WEEKDAYS_LONG[se.weekday - 1] + 's, ' + intervalLabel(se.interval) + '.</div>';
    html += '<div class="sheet-actions">';
    if (occ.extra) html += '<button class="btn btn-secondary" type="button" data-action="exception-remove" data-id="' + se.id + '" data-date="' + sh.date + '" data-type="extra">Zusatztermin entfernen</button>';
    else html += '<button class="btn btn-secondary" type="button" data-action="series-skip" data-id="' + se.id + '" data-date="' + sh.date + '">Diesen Termin entfallen lassen</button>';
    html += '<button class="btn btn-secondary" type="button" data-action="sheet-series" data-id="' + se.id + '">Serie bearbeiten</button>';
    html += '<button class="btn btn-primary" type="button" data-action="sheet-close">Fertig</button></div>';
    return html;
  }

  function sheetSeries(sh) {
    const se = sh.id ? state.series.find(function (x) { return x.id === sh.id; }) : null;
    const wd = se ? se.weekday : C.weekdayIndex(view.selectedDate) + 1;
    let html = head(se ? 'Serie bearbeiten' : 'Neue Serie', 'Regelmäßiger Termin, z. B. Dienstbesprechung');
    html += '<div class="field"><div class="sheet-label">Bezeichnung</div><input class="input" id="f-title" type="text" value="' + esc(se ? se.title : '') + '" placeholder="z. B. Dienstbesprechung" autocomplete="off"></div>';
    html += '<div class="field"><div class="sheet-label">Wochentag</div><select class="select" id="f-weekday">';
    C.WEEKDAYS_LONG.forEach(function (n, i) { html += '<option value="' + (i + 1) + '"' + (wd === i + 1 ? ' selected' : '') + '>' + n + '</option>'; });
    html += '</select></div>';
    html += '<div class="field-2"><div class="field"><div class="sheet-label">Von</div><input class="input input-time" id="f-start" type="time" value="' + esc(se ? se.start : '16:30') + '" step="300"></div><div class="field"><div class="sheet-label">Bis</div><input class="input input-time" id="f-end" type="time" value="' + esc(se ? se.end : '18:00') + '" step="300"></div></div>';
    html += '<div class="kv"><span class="k">Dauer</span><span class="v" id="f-duration">' + esc(fmt(C.spanHours(se ? se.start : '16:30', se ? se.end : '18:00'))) + '</span></div>';
    html += '<div class="field"><div class="sheet-label">Wiederholung</div><select class="select" id="f-interval">';
    [1, 2, 3, 4].forEach(function (n) { html += '<option value="' + n + '"' + ((se ? se.interval : 1) === n ? ' selected' : '') + '>' + intervalLabel(n).replace(/^./, function (c) { return c.toUpperCase(); }) + '</option>'; });
    html += '</select></div>';
    html += '<div class="field-2"><div class="field"><div class="sheet-label">Gültig ab</div><input class="input" id="f-from" type="date" value="' + esc(se ? se.from : C.weekStartOf(view.weekKey)) + '"></div><div class="field"><div class="sheet-label">Bis (optional)</div><input class="input" id="f-until" type="date" value="' + esc(se && se.until ? se.until : '') + '"></div></div>';
    html += '<div class="sheet-actions"><button class="btn btn-primary" type="button" data-action="series-save"' + (se ? ' data-id="' + se.id + '"' : '') + '>Speichern</button>';
    if (se) html += '<button class="btn btn-danger" type="button" data-action="series-delete" data-id="' + se.id + '">Serie löschen</button>';
    html += '</div>';
    return html;
  }

  function sheetException(sh) {
    const se = state.series.find(function (x) { return x.id === sh.id; });
    if (!se) return head('Ausnahme');
    const type = sh.exType || 'skip';
    const next = C.nextOccurrence(se, C.today()) || C.today();
    let html = head('Ausnahme', se.title);
    html += '<div class="seg-control"><button class="seg-opt' + (type === 'skip' ? ' is-on' : '') + '" type="button" data-action="exception-type" data-value="skip">Entfällt</button><button class="seg-opt' + (type === 'extra' ? ' is-on' : '') + '" type="button" data-action="exception-type" data-value="extra">Zusätzlich</button></div>';
    html += '<input type="hidden" id="f-extype" value="' + type + '">';
    html += '<div class="field"><div class="sheet-label">Datum</div><input class="input" id="f-date" type="date" value="' + esc(sh.date || next) + '"></div>';
    if (type === 'extra') {
      html += '<div class="field-2"><div class="field"><div class="sheet-label">Von</div><input class="input input-time" id="f-start" type="time" value="' + esc(se.start) + '" step="300"></div><div class="field"><div class="sheet-label">Bis</div><input class="input input-time" id="f-end" type="time" value="' + esc(se.end) + '" step="300"></div></div>';
      html += '<div class="sheet-note">Ein zusätzlicher Termin außerhalb des normalen Rhythmus.</div>';
    } else {
      html += '<div class="sheet-note">Der Serientermin an diesem Tag fällt aus und zählt nicht zu den Stunden.</div>';
    }
    html += '<button class="btn btn-primary" type="button" data-action="exception-save" data-id="' + se.id + '">Speichern</button>';
    return html;
  }

  function sheetNumber(sh) {
    const val = state.settings[sh.key];
    let html = head(sh.title, sh.sub || '');
    html += '<div class="field"><div class="sheet-label">Stunden (Industrieminuten, z. B. 7,8)</div><input class="input input-time" id="f-number" type="text" inputmode="decimal" value="' + esc(String(val).replace('.', ',')) + '"></div>';
    html += '<button class="btn btn-primary" type="button" data-action="number-save" data-key="' + sh.key + '">Speichern</button>';
    return html;
  }

  function sheetTimeline() {
    let html = head('Zeitlinie der Tage', 'Skala der feinen Linie unter den Tagespillen');
    html += '<div class="field-2"><div class="field"><div class="sheet-label">Von</div><input class="input input-time" id="f-start" type="time" value="' + esc(state.settings.timelineStart) + '" step="1800"></div><div class="field"><div class="sheet-label">Bis</div><input class="input input-time" id="f-end" type="time" value="' + esc(state.settings.timelineEnd) + '" step="1800"></div></div>';
    html += '<div class="sheet-note">Blöcke außerhalb der Skala werden abgeschnitten, zählen aber trotzdem voll.</div>';
    html += '<button class="btn btn-primary" type="button" data-action="timeline-save">Speichern</button>';
    return html;
  }

  function sheetShifts() {
    const groups = [['vollzeit', 'Vollzeit'], ['teilzeit', 'Teilzeit'], ['vertretung', 'Vertretung']];
    let html = head('Dienste', 'Antippen zum Bearbeiten');
    groups.forEach(function (g) {
      const list = state.shifts.filter(function (s) { return s.group === g[0]; });
      if (!list.length) return;
      html += '<div class="sheet-section"><div class="sheet-label">' + g[1] + '</div><div class="option-list">';
      list.forEach(function (s) { html += shiftOption(s, false, 'sheet-shift-edit'); });
      html += '</div></div>';
    });
    html += '<button class="btn btn-primary" type="button" data-action="sheet-shift-edit" data-id="">' + icon('plus', 18) + 'Dienst hinzufügen</button>';
    return html;
  }

  function sheetShiftEdit(sh) {
    const s = sh.id ? C.shiftById(state, sh.id) : null;
    let html = head(s ? 'Dienst bearbeiten' : 'Neuer Dienst', s ? s.code + ' · ' + s.label : '');
    html += '<div class="field-2"><div class="field"><div class="sheet-label">Kürzel</div><input class="input" id="f-code" type="text" value="' + esc(s ? s.code : '') + '" placeholder="M1" autocomplete="off"></div><div class="field"><div class="sheet-label">Gruppe</div><select class="select" id="f-group">';
    [['vollzeit', 'Vollzeit'], ['teilzeit', 'Teilzeit'], ['vertretung', 'Vertretung']].forEach(function (g) { html += '<option value="' + g[0] + '"' + ((s ? s.group : 'vollzeit') === g[0] ? ' selected' : '') + '>' + g[1] + '</option>'; });
    html += '</select></div></div>';
    html += '<div class="field"><div class="sheet-label">Bezeichnung</div><input class="input" id="f-label" type="text" value="' + esc(s ? s.label : '') + '" placeholder="z. B. Vollzeit oder Vertretung F2" autocomplete="off"></div>';
    html += '<div class="field-2"><div class="field"><div class="sheet-label">Von</div><input class="input input-time" id="f-start" type="time" value="' + esc(s ? s.start : '08:30') + '" step="300"></div><div class="field"><div class="sheet-label">Bis</div><input class="input input-time" id="f-end" type="time" value="' + esc(s ? s.end : '14:30') + '" step="300"></div></div>';
    html += '<div class="field"><div class="sheet-label">Pausenanspruch in Stunden (0,5 = 30 Minuten)</div><input class="input" id="f-pause" type="text" inputmode="decimal" value="' + esc(String(s ? s.pause : 0).replace('.', ',')) + '"></div>';
    html += '<div class="sheet-actions"><button class="btn btn-primary" type="button" data-action="shift-save"' + (s ? ' data-id="' + s.id + '"' : '') + '>Speichern</button>';
    if (s) html += '<button class="btn btn-danger" type="button" data-action="shift-delete" data-id="' + s.id + '">Dienst löschen</button>';
    html += '</div>';
    return html;
  }

  function sheetSaldo() {
    const cur = C.weekKeyOf(C.today());
    const s = C.saldo(state, cur);
    let html = head('Saldo', 'Ab welcher Woche soll gezählt werden?');
    html += '<div class="sheet-note">Der Saldo summiert Ist minus Soll über alle abgeschlossenen Wochen ab der Startwoche. Aktuell: ' + (s.startKey ? C.weekNumberLabel(s.startKey) + '/' + C.parseWeekKey(s.startKey).year : 'keine Woche mit Dienst') + '.</div>';
    html += '<div class="field"><div class="sheet-label">Ein Datum in der Startwoche</div><input class="input" id="f-date" type="date" value="' + esc(s.startKey ? C.weekStartOf(s.startKey) : C.today()) + '"></div>';
    html += '<div class="sheet-actions"><button class="btn btn-primary" type="button" data-action="saldo-save">Speichern</button><button class="btn btn-secondary" type="button" data-action="saldo-auto">Automatisch (erste Woche mit Dienst)</button></div>';
    return html;
  }

  function sheetImport() {
    let html = head('Backup importieren', 'Ersetzt alle Daten auf diesem Gerät');
    html += '<label class="btn btn-secondary" for="f-file">Datei auswählen (.json)</label><input class="file-input" id="f-file" type="file" accept=".json,application/json">';
    html += '<div class="field"><div class="sheet-label">oder Backup-Text einfügen</div><textarea class="textarea" id="f-json" placeholder="{ … }"></textarea></div>';
    html += '<button class="btn btn-primary" type="button" data-action="import-save">Importieren</button>';
    return html;
  }

  function sheetConfirm(sh) {
    let html = head(sh.title, sh.text);
    html += '<div class="sheet-actions"><button class="btn btn-primary" style="background:var(--red)" type="button" data-action="confirm-yes">' + esc(sh.yes || 'Ja, löschen') + '</button><button class="btn btn-secondary" type="button" data-action="sheet-close">Abbrechen</button></div>';
    return html;
  }

  function sheetText(sh) {
    let html = head(sh.title, sh.sub);
    html += '<textarea class="textarea" id="f-json" readonly>' + esc(sh.text) + '</textarea>';
    html += '<div class="sheet-actions"><button class="btn btn-primary" type="button" data-action="copy-text">In Zwischenablage kopieren</button><button class="btn btn-secondary" type="button" data-action="sheet-close">Schließen</button></div>';
    return html;
  }

  // ---------- Aktionen ----------
  function val(id) { const el = document.getElementById(id); return el ? el.value : ''; }
  function parseNum(text) { return Number(String(text).replace(',', '.')); }
  function ensureWeek(key) {
    if (!state.weeks[key]) state.weeks[key] = { shiftId: null, days: {} };
    if (!state.weeks[key].days) state.weeks[key].days = {};
    return state.weeks[key];
  }
  function moveSelection(newKey) {
    const idx = Math.min(4, C.weekdayIndex(view.selectedDate));
    view.weekKey = newKey;
    view.selectedDate = C.weekDays(newKey)[idx];
    render();
  }

  const actions = {
    noop: function () {},
    'toast-action': function () { const el = $('#toast'); el.hidden = true; if (el._onAction) el._onAction(); },
    'sheet-close': function () { closeSheet(); },
    'week-prev': function () { moveSelection(C.shiftWeek(view.weekKey, -1)); },
    'week-next': function () { moveSelection(C.shiftWeek(view.weekKey, 1)); },
    'week-today': function () {
      const t = C.today();
      view.weekKey = C.weekKeyOf(t);
      view.selectedDate = C.isWeekend(t) ? C.weekStartOf(view.weekKey) : t;
      render();
    },
    'select-day': function (d) { view.selectedDate = d.date; render(); },
    'goto-week': function (d) {
      const t = C.today();
      view.weekKey = d.week;
      view.selectedDate = (C.weekKeyOf(t) === d.week && !C.isWeekend(t)) ? t : C.weekStartOf(d.week);
      view.tab = 'week';
      render();
    },
    'month-prev': function () { view.month.month--; if (view.month.month < 0) { view.month.month = 11; view.month.year--; } render(); },
    'month-next': function () { view.month.month++; if (view.month.month > 11) { view.month.month = 0; view.month.year++; } render(); },

    // Dienst der Woche
    'sheet-shift-week': function () { view.showMoreShifts = false; openSheet({ type: 'shift-week' }); },
    'toggle-more': function () { view.showMoreShifts = !view.showMoreShifts; renderSheet(); },
    'pick-week-shift': function (d) {
      const w = ensureWeek(view.weekKey);
      w.shiftId = d.id || null;
      closeSheet();
      commit();
      const sh = d.id ? C.shiftById(state, d.id) : null;
      toast(sh ? sh.code + ' für ' + C.weekNumberLabel(view.weekKey) + ' gesetzt' : 'Kein Dienst für ' + C.weekNumberLabel(view.weekKey));
    },

    // Tag
    'sheet-day': function (d) { view.showMoreShifts = false; openSheet({ type: 'day', date: d.date }); },
    'pick-day-shift': function (d) {
      const w = ensureWeek(C.weekKeyOf(d.date));
      if (w.shiftId === d.id && !C.isWeekend(d.date)) delete w.days[d.date];
      else w.days[d.date] = { shiftId: d.id };
      D.saveState(state); render();
    },
    'pick-day-absence': function (d) {
      const w = ensureWeek(C.weekKeyOf(d.date));
      const cur = w.days[d.date];
      if (cur && cur.absence === d.value) delete w.days[d.date];
      else w.days[d.date] = { absence: d.value };
      D.saveState(state); render();
    },
    'pick-day-reset': function (d) {
      const w = ensureWeek(C.weekKeyOf(d.date));
      delete w.days[d.date];
      D.saveState(state); render();
    },

    // Einträge
    'entry-new': function (d) { openSheet({ type: 'entry', kind: d.kind || 'vz', date: d.date || view.selectedDate }); },
    'entry-edit': function (d) { openSheet({ type: 'entry', id: d.id }); },
    'entry-kind': function (d) {
      const kind = d.value;
      document.getElementById('f-kind').value = kind;
      document.querySelectorAll('[data-action="entry-kind"]').forEach(function (b) { b.classList.toggle('is-on', b.dataset.value === kind); });
      const t = document.getElementById('f-title');
      if (kind === 'vz' && !t.value) t.value = 'VZ';
      if (kind === 'termin' && t.value === 'VZ') t.value = '';
      t.placeholder = kind === 'termin' ? 'z. B. Elterngespräch' : 'VZ';
    },
    'entry-save': function (d) {
      const kind = val('f-kind') === 'termin' ? 'termin' : 'vz';
      const title = val('f-title').trim() || (kind === 'termin' ? 'Termin' : 'VZ');
      const date = val('f-date'), start = val('f-start'), end = val('f-end');
      if (!date || !start || !end) { toast('Bitte Datum, Von und Bis angeben.'); return; }
      if (C.toMinutes(end) <= C.toMinutes(start)) { toast('„Bis“ muss nach „Von“ liegen.'); return; }
      if (d.id) {
        const e = state.entries.find(function (x) { return x.id === d.id; });
        if (e) { e.kind = kind; e.title = title; e.date = date; e.start = start; e.end = end; }
      } else {
        state.entries.push({ id: D.uid(), kind: kind, title: title, date: date, start: start, end: end });
      }
      view.weekKey = C.weekKeyOf(date);
      view.selectedDate = date;
      closeSheet();
      commit();
      toast(title + ' gespeichert · ' + fmt(C.spanHours(start, end)));
    },
    'entry-delete': function (d) {
      const e = state.entries.find(function (x) { return x.id === d.id; });
      state.entries = state.entries.filter(function (x) { return x.id !== d.id; });
      closeSheet();
      commit();
      if (e) toast(e.title + ' gelöscht', 'Rückgängig', function () { state.entries.push(e); commit(); });
    },

    // Serien
    'sheet-series-occ': function (d) { openSheet({ type: 'series-occ', id: d.id, date: d.date }); },
    'sheet-series': function (d) { openSheet({ type: 'series', id: d.id || null }); },
    'series-save': function (d) {
      const title = val('f-title').trim() || 'Termin';
      const start = val('f-start'), end = val('f-end'), from = val('f-from'), until = val('f-until') || null;
      if (!start || !end || !from) { toast('Bitte Von, Bis und „Gültig ab“ angeben.'); return; }
      if (C.toMinutes(end) <= C.toMinutes(start)) { toast('„Bis“ muss nach „Von“ liegen.'); return; }
      const rec = { title: title, weekday: Number(val('f-weekday')) || 1, start: start, end: end, interval: Number(val('f-interval')) || 1, from: from, until: until };
      if (d.id) {
        const se = state.series.find(function (x) { return x.id === d.id; });
        if (se) Object.assign(se, rec);
      } else {
        state.series.push(Object.assign({ id: D.uid(), skipDates: [], extraDates: [] }, rec));
      }
      closeSheet();
      commit();
      toast('Serie „' + title + '“ gespeichert');
    },
    'series-delete': function (d) {
      const se = state.series.find(function (x) { return x.id === d.id; });
      state.series = state.series.filter(function (x) { return x.id !== d.id; });
      closeSheet();
      commit();
      if (se) toast('Serie gelöscht', 'Rückgängig', function () { state.series.push(se); commit(); });
    },
    'series-skip': function (d) {
      const se = state.series.find(function (x) { return x.id === d.id; });
      if (se && se.skipDates.indexOf(d.date) < 0) se.skipDates.push(d.date);
      closeSheet();
      commit();
      toast('Termin am ' + C.formatShort(d.date) + ' entfällt');
    },
    'sheet-exception': function (d) { openSheet({ type: 'exception', id: d.id, exType: 'skip' }); },
    'exception-type': function (d) { view.sheet.exType = d.value; view.sheet.date = val('f-date'); renderSheet(); },
    'exception-save': function (d) {
      const se = state.series.find(function (x) { return x.id === d.id; });
      const date = val('f-date');
      if (!se || !date) { toast('Bitte ein Datum wählen.'); return; }
      if (val('f-extype') === 'extra') {
        const start = val('f-start'), end = val('f-end');
        if (C.toMinutes(end) <= C.toMinutes(start)) { toast('„Bis“ muss nach „Von“ liegen.'); return; }
        se.extraDates = se.extraDates.filter(function (x) { return x.date !== date; });
        se.extraDates.push({ date: date, start: start, end: end });
        se.skipDates = se.skipDates.filter(function (x) { return x !== date; });
      } else {
        if (se.skipDates.indexOf(date) < 0) se.skipDates.push(date);
        se.extraDates = se.extraDates.filter(function (x) { return x.date !== date; });
      }
      closeSheet();
      commit();
      toast('Ausnahme gespeichert');
    },
    'exception-remove': function (d) {
      const se = state.series.find(function (x) { return x.id === d.id; });
      if (!se) return;
      if (d.type === 'skip') se.skipDates = se.skipDates.filter(function (x) { return x !== d.date; });
      else se.extraDates = se.extraDates.filter(function (x) { return x.date !== d.date; });
      if (view.sheet) closeSheet();
      commit();
    },

    // Einstellungen
    'sheet-number': function (d) { openSheet({ type: 'number', key: d.key, title: d.title, sub: d.sub }); },
    'number-save': function (d) {
      const n = parseNum(val('f-number'));
      if (!isFinite(n) || n < 0 || n > 100) { toast('Bitte eine Zahl zwischen 0 und 100 eingeben.'); return; }
      state.settings[d.key] = C.round2(n);
      closeSheet();
      commit();
    },
    'toggle-pause': function () { state.settings.deductPause = !state.settings.deductPause; commit(); },
    'set-format': function (d) { state.settings.hoursFormat = d.value === 'hm' ? 'hm' : 'decimal'; commit(); },
    'sheet-timeline': function () { openSheet({ type: 'timeline' }); },
    'timeline-save': function () {
      const a = val('f-start'), b = val('f-end');
      if (C.toMinutes(b) - C.toMinutes(a) < 120) { toast('Die Skala muss mindestens zwei Stunden umfassen.'); return; }
      state.settings.timelineStart = a; state.settings.timelineEnd = b;
      closeSheet();
      commit();
    },
    'sheet-shifts': function () { openSheet({ type: 'shifts' }); },
    'sheet-shift-edit': function (d) { openSheet({ type: 'shift-edit', id: d.id || null }); },
    'shift-save': function (d) {
      const code = val('f-code').trim().toUpperCase();
      const start = val('f-start'), end = val('f-end');
      const pause = parseNum(val('f-pause') || '0');
      if (!code) { toast('Bitte ein Kürzel angeben.'); return; }
      if (C.toMinutes(end) <= C.toMinutes(start)) { toast('„Bis“ muss nach „Von“ liegen.'); return; }
      const rec = { code: code, label: val('f-label').trim(), group: val('f-group') || 'vollzeit', start: start, end: end, pause: isFinite(pause) ? Math.max(0, pause) : 0 };
      if (d.id) { const s = C.shiftById(state, d.id); if (s) Object.assign(s, rec); }
      else state.shifts.push(Object.assign({ id: D.uid() }, rec));
      openSheet({ type: 'shifts' });
      commit();
      toast('Dienst ' + code + ' gespeichert');
    },
    'shift-delete': function (d) {
      openSheet({ type: 'confirm', title: 'Dienst löschen?', text: 'Wochen, die diesen Dienst nutzen, zeigen danach „kein Dienst“.', onYes: function () {
        state.shifts = state.shifts.filter(function (s) { return s.id !== d.id; });
        Object.keys(state.weeks).forEach(function (k) {
          const w = state.weeks[k];
          if (w.shiftId === d.id) w.shiftId = null;
          Object.keys(w.days || {}).forEach(function (dt) { if (w.days[dt].shiftId === d.id) delete w.days[dt]; });
        });
        openSheet({ type: 'shifts' });
        commit();
      } });
    },
    'sheet-saldo': function () { openSheet({ type: 'saldo' }); },
    'saldo-save': function () {
      const dt = val('f-date');
      if (!dt) return;
      state.settings.saldoStartWeek = C.weekKeyOf(dt);
      closeSheet(); commit();
    },
    'saldo-auto': function () { state.settings.saldoStartWeek = null; closeSheet(); commit(); },
    'confirm-yes': function () { const fn = view.sheet && view.sheet.onYes; closeSheet(); if (fn) fn(); },
    'confirm-reset': function () {
      openSheet({ type: 'confirm', title: 'Alle Daten löschen?', text: 'Dienste, Wochen, VZ und Termine auf diesem iPhone werden entfernt. Vorher ein Backup exportieren!', yes: 'Ja, alles löschen', onYes: function () {
        D.clearState();
        state = D.defaultState();
        commit();
        toast('Alle Daten gelöscht');
      } });
    },

    // Backup
    'export': function () {
      const text = D.exportJson(state);
      const name = 'dienstplan-sarah-' + C.today() + '.json';
      state.settings.lastBackup = C.today();
      D.saveState(state);
      let file = null;
      try { file = new File([text], name, { type: 'application/json' }); } catch (err) { /* alte Browser */ }
      if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'Dienstplan Backup' }).then(function () { render(); toast('Backup geteilt'); }).catch(function () { render(); });
        return;
      }
      render();
      openSheet({ type: 'text', title: 'Backup', sub: 'Text kopieren und z. B. in Notizen sichern', text: text });
    },
    'copy-text': function () {
      const ta = document.getElementById('f-json');
      const done = function () { toast('Kopiert'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done).catch(function () { ta.select(); document.execCommand('copy'); done(); });
      else { ta.select(); document.execCommand('copy'); done(); }
    },
    'sheet-import': function () { openSheet({ type: 'import' }); },
    'import-save': function () {
      const text = val('f-json').trim();
      if (!text) { toast('Bitte eine Datei wählen oder Text einfügen.'); return; }
      try {
        const next = D.importJson(text);
        openSheet({ type: 'confirm', title: 'Backup einspielen?', text: 'Alle aktuellen Daten auf diesem Gerät werden durch das Backup ersetzt.', yes: 'Ja, einspielen', onYes: function () {
          state = next;
          commit();
          toast('Backup eingespielt');
        } });
      } catch (err) {
        toast('Import fehlgeschlagen: ' + err.message);
      }
    }
  };

  // ---------- Ereignisse ----------
  document.getElementById('app').addEventListener('click', function (ev) {
    const target = ev.target.closest('[data-action], [data-tab]');
    if (!target) return;
    if (target.dataset.tab) { view.tab = target.dataset.tab; render(); return; }
    const fn = actions[target.dataset.action];
    if (fn) { ev.preventDefault(); fn(target.dataset); }
  });
  $('#sheet-backdrop').addEventListener('click', closeSheet);

  // Live-Dauer in Formularen, Datei-Import
  document.getElementById('sheet-content').addEventListener('input', function (ev) {
    if (ev.target.id === 'f-start' || ev.target.id === 'f-end') {
      const dur = document.getElementById('f-duration');
      if (dur) {
        const h = C.spanHours(val('f-start'), val('f-end'));
        dur.textContent = fmt(h);
      }
    }
  });
  document.getElementById('sheet-content').addEventListener('change', function (ev) {
    if (ev.target.id === 'f-file' && ev.target.files && ev.target.files[0]) {
      const reader = new FileReader();
      reader.onload = function () { const ta = document.getElementById('f-json'); if (ta) ta.value = String(reader.result); };
      reader.readAsText(ev.target.files[0]);
    }
  });

  // Wischen zwischen Wochen
  (function swipe() {
    let x0 = 0, y0 = 0, active = false;
    const area = document.getElementById('screen-week');
    area.addEventListener('touchstart', function (ev) {
      if (view.sheet) return;
      x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY; active = true;
    }, { passive: true });
    area.addEventListener('touchend', function (ev) {
      if (!active) return;
      active = false;
      const dx = ev.changedTouches[0].clientX - x0;
      const dy = ev.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 70 && Math.abs(dy) < 50) moveSelection(C.shiftWeek(view.weekKey, dx < 0 ? 1 : -1));
    }, { passive: true });
  })();

  // Service Worker + Update-Hinweis
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').then(function (reg) {
        reg.addEventListener('updatefound', function () {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', function () {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              toast('Neue Version verfügbar', 'Neu laden', function () { window.location.reload(); });
            }
          });
        });
      }).catch(function () { /* offline oder file:// */ });
    });
  }

  render();
})();
