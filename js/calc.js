/* Rechenlogik: Datum/Kalenderwoche, Stunden, Serien. Keine DOM-Zugriffe. */
(function () {
  'use strict';

  const DAY_MS = 86400000;
  const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const WEEKDAYS_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  const MONTHS_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const MONTHS_SHORT = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];

  // ---------- Zeit ----------
  function toMinutes(hhmm) {
    if (!hhmm) return 0;
    const p = hhmm.split(':');
    return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0);
  }
  function fromMinutes(min) {
    min = Math.max(0, Math.round(min));
    const h = Math.floor(min / 60) % 24;
    const m = min % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  function spanHours(start, end) {
    let diff = toMinutes(end) - toMinutes(start);
    if (diff < 0) diff += 24 * 60; // über Mitternacht
    return diff / 60;
  }

  // ---------- Datum ----------
  function pad2(n) { return String(n).padStart(2, '0'); }
  function parseDate(str) {
    const p = str.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function formatDate(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function today() { return formatDate(new Date()); }
  function addDays(dateStr, n) {
    const d = parseDate(dateStr);
    d.setDate(d.getDate() + n);
    return formatDate(d);
  }
  function weekdayIndex(dateStr) { // 0 = Montag … 6 = Sonntag
    return (parseDate(dateStr).getDay() + 6) % 7;
  }
  function isWeekend(dateStr) { return weekdayIndex(dateStr) >= 5; }
  function dayLabelShort(dateStr) { return WEEKDAYS_SHORT[weekdayIndex(dateStr)]; }
  function dayLabelLong(dateStr) { return WEEKDAYS_LONG[weekdayIndex(dateStr)]; }
  function dayOfMonth(dateStr) { return parseDate(dateStr).getDate(); }
  function formatShort(dateStr) { // 9. Sept.
    const d = parseDate(dateStr);
    return d.getDate() + '. ' + MONTHS_SHORT[d.getMonth()];
  }
  function formatLong(dateStr) { // 9. September 2026
    const d = parseDate(dateStr);
    return d.getDate() + '. ' + MONTHS_LONG[d.getMonth()] + ' ' + d.getFullYear();
  }
  function formatDots(dateStr) { // 09.09.
    const d = parseDate(dateStr);
    return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.';
  }
  function compareDates(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  // ---------- ISO-Kalenderwoche (Montag = Wochenstart) ----------
  function isoWeek(dateStr) {
    const d = parseDate(dateStr);
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((date - yearStart) / DAY_MS + 1) / 7);
    return { year: date.getUTCFullYear(), week: week };
  }
  function weekKeyOf(dateStr) {
    const w = isoWeek(dateStr);
    return w.year + '-W' + pad2(w.week);
  }
  function parseWeekKey(key) {
    const m = /^(\d{4})-W(\d{2})$/.exec(key);
    return { year: Number(m[1]), week: Number(m[2]) };
  }
  function weekStartOf(key) { // Montag der Woche als YYYY-MM-DD
    const w = parseWeekKey(key);
    const jan4 = new Date(w.year, 0, 4);
    const day = jan4.getDay() || 7;
    const monday = new Date(w.year, 0, 4 - day + 1 + (w.week - 1) * 7);
    return formatDate(monday);
  }
  function weekDays(key) {
    const start = weekStartOf(key);
    const days = [];
    for (let i = 0; i < 7; i++) days.push(addDays(start, i));
    return days;
  }
  function shiftWeek(key, n) {
    return weekKeyOf(addDays(weekStartOf(key), 7 * n));
  }
  function weekRangeLabel(key, workdaysOnly) { // 7. – 11. September 2026
    const days = weekDays(key);
    const a = parseDate(days[0]);
    const b = parseDate(days[workdaysOnly ? 4 : 6]);
    if (a.getMonth() === b.getMonth()) {
      return a.getDate() + '. – ' + b.getDate() + '. ' + MONTHS_LONG[b.getMonth()] + ' ' + b.getFullYear();
    }
    return a.getDate() + '. ' + MONTHS_SHORT[a.getMonth()] + ' – ' + b.getDate() + '. ' + MONTHS_SHORT[b.getMonth()] + ' ' + b.getFullYear();
  }
  function weekNumberLabel(key) { return 'KW ' + parseWeekKey(key).week; }
  function weeksBetween(keyA, keyB) { // ganze Wochen von A nach B
    const a = parseDate(weekStartOf(keyA));
    const b = parseDate(weekStartOf(keyB));
    return Math.round((b - a) / (7 * DAY_MS));
  }

  // ---------- Dienste ----------
  function shiftById(state, id) {
    for (let i = 0; i < state.shifts.length; i++) if (state.shifts[i].id === id) return state.shifts[i];
    return null;
  }
  function shiftHours(state, shift) {
    if (!shift) return 0;
    let h = spanHours(shift.start, shift.end);
    if (state.settings.deductPause) h -= shift.pause || 0;
    return Math.max(0, h);
  }
  function weekRecord(state, key) {
    return state.weeks[key] || { shiftId: null, days: {} };
  }
  // Was gilt an diesem Tag? { shift, absence }
  function resolveDay(state, dateStr) {
    const key = weekKeyOf(dateStr);
    const week = weekRecord(state, key);
    const day = (week.days && week.days[dateStr]) || null;
    if (day && day.absence) return { shift: null, absence: day.absence, override: true };
    if (day && day.shiftId) return { shift: shiftById(state, day.shiftId), absence: null, override: true };
    if (isWeekend(dateStr)) return { shift: null, absence: null, override: false };
    return { shift: week.shiftId ? shiftById(state, week.shiftId) : null, absence: null, override: false };
  }

  // ---------- Serien ----------
  function seriesOccursOn(series, dateStr) {
    const extra = series.extraDates.find(function (x) { return x.date === dateStr; });
    if (extra) return { start: extra.start || series.start, end: extra.end || series.end, extra: true };
    if (series.skipDates.indexOf(dateStr) >= 0) return null;
    if (weekdayIndex(dateStr) + 1 !== series.weekday) return null;
    if (dateStr < series.from) return null;
    if (series.until && dateStr > series.until) return null;
    const diff = weeksBetween(weekKeyOf(series.from), weekKeyOf(dateStr));
    if (diff < 0 || diff % series.interval !== 0) return null;
    return { start: series.start, end: series.end, extra: false };
  }
  function nextOccurrence(series, fromDateStr, maxDays) {
    maxDays = maxDays || 400;
    for (let i = 0; i < maxDays; i++) {
      const d = addDays(fromDateStr, i);
      if (seriesOccursOn(series, d)) return d;
    }
    return null;
  }

  // ---------- Tagesliste ----------
  function absenceLabel(code) {
    return { frei: 'Frei', urlaub: 'Urlaub', krank: 'Krank', feiertag: 'Feiertag' }[code] || code;
  }
  // Chronologische Liste aller Blöcke eines Tages, jeweils mit hours.
  function dayItems(state, dateStr) {
    const items = [];
    const res = resolveDay(state, dateStr);
    if (res.absence) {
      items.push({
        kind: 'absence', absence: res.absence, title: absenceLabel(res.absence),
        start: null, end: null,
        hours: res.absence === 'frei' ? 0 : Number(state.settings.absenceHoursPerDay) || 0
      });
    } else if (res.shift) {
      items.push({
        kind: 'dienst', shift: res.shift, title: res.shift.code,
        start: res.shift.start, end: res.shift.end, hours: shiftHours(state, res.shift), override: res.override
      });
    }
    state.entries.forEach(function (e) {
      if (e.date !== dateStr) return;
      items.push({ kind: e.kind, entry: e, id: e.id, title: e.title, start: e.start, end: e.end, hours: spanHours(e.start, e.end) });
    });
    state.series.forEach(function (se) {
      const occ = seriesOccursOn(se, dateStr);
      if (!occ) return;
      items.push({
        kind: 'termin', series: se, seriesExtra: occ.extra, title: se.title,
        start: occ.start, end: occ.end, hours: spanHours(occ.start, occ.end)
      });
    });
    items.sort(function (a, b) {
      if (a.start === null) return -1;
      if (b.start === null) return 1;
      return toMinutes(a.start) - toMinutes(b.start);
    });
    return items;
  }
  function dayHours(state, dateStr) {
    return dayItems(state, dateStr).reduce(function (sum, it) { return sum + it.hours; }, 0);
  }
  function weekHours(state, key) {
    const days = weekDays(key);
    const perDay = {};
    let total = 0;
    days.forEach(function (d) {
      perDay[d] = dayHours(state, d);
      total += perDay[d];
    });
    return { total: round2(total), perDay: perDay };
  }
  function round2(n) { return Math.round(n * 100) / 100; }

  // ---------- Saldo ----------
  function firstWeekWithShift(state) {
    const keys = Object.keys(state.weeks).filter(function (k) { return state.weeks[k] && state.weeks[k].shiftId; }).sort();
    return keys.length ? keys[0] : null;
  }
  // Soll je Tag: Wochen-Soll verteilt auf Mo–Fr
  function dayTarget(state, dateStr) {
    return isWeekend(dateStr) ? 0 : (Number(state.settings.targetHours) || 0) / 5;
  }
  // Neuester Abgleich mit der Stempeluhr bis einschließlich dateStr (mit before = true: nur davor).
  function lastSaldoCheck(state, dateStr, before) {
    let best = null;
    (state.saldoChecks || []).forEach(function (c) {
      if (c.date > dateStr || (before && c.date === dateStr)) return;
      if (!best || c.date > best.date) best = c;
    });
    return best;
  }
  // Saldo am Ende von dateStr: neuester Abgleich plus (Ist − Soll) der Tage danach,
  // ohne Abgleich ab Montag der Startwoche. ignoreSameDay: einen Abgleich an genau diesem Tag übergehen.
  function saldoAt(state, dateStr, ignoreSameDay) {
    const check = lastSaldoCheck(state, dateStr, ignoreSameDay);
    let from, sum;
    if (check) {
      from = addDays(check.date, 1);
      sum = check.value;
    } else {
      const startKey = state.settings.saldoStartWeek || firstWeekWithShift(state);
      if (!startKey) return 0;
      from = weekStartOf(startKey);
      sum = 0;
    }
    for (let d = from; d <= dateStr; d = addDays(d, 1)) sum += dayHours(state, d) - dayTarget(state, d);
    return round2(sum);
  }
  // Saldo für die Übersicht: bis Ende der Vorwoche, bei einem jüngeren Abgleich bis zu dessen Tag.
  function saldo(state, currentKey) {
    const startKey = state.settings.saldoStartWeek || firstWeekWithShift(state);
    const lastDay = addDays(weekStartOf(currentKey), -1);
    const check = lastSaldoCheck(state, addDays(lastDay, 7));
    const until = check && check.date > lastDay ? check.date : lastDay;
    const weeks = startKey ? Math.max(0, weeksBetween(startKey, currentKey)) : 0;
    return { value: saldoAt(state, until), startKey: startKey, weeks: weeks, check: check, until: until };
  }

  // ---------- Anzeige ----------
  function formatHours(h, format, withUnit) {
    const sign = h < 0 ? '−' : '';
    const abs = Math.abs(h);
    let text;
    if (format === 'hm') {
      const totalMin = Math.round(abs * 60);
      text = Math.floor(totalMin / 60) + ':' + pad2(totalMin % 60);
    } else {
      text = abs.toFixed(2).replace('.', ',');
    }
    return sign + text + (withUnit === false ? '' : ' h');
  }
  function formatSigned(h, format) {
    if (Math.abs(h) < 0.005) return '±0 ' + (format === 'hm' ? 'h' : 'h');
    return (h > 0 ? '+' : '') + formatHours(h, format, true);
  }

  window.Calc = {
    toMinutes: toMinutes, fromMinutes: fromMinutes, spanHours: spanHours,
    parseDate: parseDate, formatDate: formatDate, today: today, addDays: addDays,
    weekdayIndex: weekdayIndex, isWeekend: isWeekend, dayLabelShort: dayLabelShort, dayLabelLong: dayLabelLong,
    dayOfMonth: dayOfMonth, formatShort: formatShort, formatLong: formatLong, formatDots: formatDots, compareDates: compareDates,
    isoWeek: isoWeek, weekKeyOf: weekKeyOf, parseWeekKey: parseWeekKey, weekStartOf: weekStartOf, weekDays: weekDays,
    shiftWeek: shiftWeek, weekRangeLabel: weekRangeLabel, weekNumberLabel: weekNumberLabel, weeksBetween: weeksBetween,
    shiftById: shiftById, shiftHours: shiftHours, weekRecord: weekRecord, resolveDay: resolveDay,
    seriesOccursOn: seriesOccursOn, nextOccurrence: nextOccurrence,
    absenceLabel: absenceLabel, dayItems: dayItems, dayHours: dayHours, weekHours: weekHours, round2: round2,
    saldo: saldo, saldoAt: saldoAt, lastSaldoCheck: lastSaldoCheck, firstWeekWithShift: firstWeekWithShift,
    formatHours: formatHours, formatSigned: formatSigned,
    WEEKDAYS_SHORT: WEEKDAYS_SHORT, WEEKDAYS_LONG: WEEKDAYS_LONG, MONTHS_LONG: MONTHS_LONG, MONTHS_SHORT: MONTHS_SHORT
  };
})();
