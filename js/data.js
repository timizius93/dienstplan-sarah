/* Datenschicht: Datenmodell, Vorgaben, Laden/Speichern, Export/Import.
   Die Oberfläche greift nie direkt auf localStorage zu – nur über diese Funktionen.
   Ein späteres Backend ersetzt loadState/saveState/exportJson/importJson. */
(function () {
  'use strict';

  const STORAGE_KEY = 'dienstplan-sarah';
  const VERSION = 1;

  // Dienste laut Dienstplan Kita „Äffchen“, U3-Bereich.
  // pause = Pausenanspruch in Stunden (nur abgezogen, wenn settings.deductPause = true).
  const DEFAULT_SHIFTS = [
    { id: 'f1', code: 'F1', label: 'Vollzeit', group: 'vollzeit', start: '06:30', end: '12:30', pause: 0 },
    { id: 'f2', code: 'F2', label: 'Vollzeit', group: 'vollzeit', start: '07:00', end: '13:00', pause: 0 },
    { id: 'f4', code: 'F4', label: 'Vollzeit', group: 'vollzeit', start: '07:30', end: '13:30', pause: 0 },
    { id: 'm1', code: 'M1', label: 'Vollzeit', group: 'vollzeit', start: '08:30', end: '14:30', pause: 0 },
    { id: 's1', code: 'S1', label: 'Vollzeit', group: 'vollzeit', start: '09:30', end: '16:00', pause: 0.5 },
    { id: 's2', code: 'S2', label: 'Vollzeit', group: 'vollzeit', start: '10:30', end: '17:00', pause: 0.5 },
    { id: 'f3', code: 'F3', label: 'Teilzeit', group: 'teilzeit', start: '08:00', end: '13:00', pause: 0 },
    { id: 'f5', code: 'F5', label: 'Teilzeit', group: 'teilzeit', start: '09:00', end: '14:00', pause: 0 },
    { id: 'm2', code: 'M2', label: 'Teilzeit', group: 'teilzeit', start: '10:15', end: '15:15', pause: 0 },
    { id: 'f1v', code: 'F1', label: 'Vertretung F2', group: 'vertretung', start: '06:30', end: '13:00', pause: 0.5 },
    { id: 'f2v', code: 'F2', label: 'Vertretung F4', group: 'vertretung', start: '07:00', end: '13:30', pause: 0.5 },
    { id: 'f4v', code: 'F4', label: 'Vertretung F2', group: 'vertretung', start: '07:00', end: '13:30', pause: 0.5 },
    { id: 'm2v', code: 'M2', label: 'Vertretung F5', group: 'vertretung', start: '09:00', end: '15:00', pause: 0 },
    { id: 's1v', code: 'S1', label: 'Vertretung M1', group: 'vertretung', start: '09:30', end: '16:00', pause: 0.5 },
    { id: 's2v', code: 'S2', label: 'Vertretung S1', group: 'vertretung', start: '10:00', end: '17:00', pause: 0.5 }
  ];

  const DEFAULT_SETTINGS = {
    targetHours: 39,
    deductPause: false,
    absenceHoursPerDay: 7.8,
    hoursFormat: 'decimal',      // 'decimal' = 6,25 h · 'hm' = 6:15 h
    timelineStart: '06:00',
    timelineEnd: '20:00',
    saldoStartWeek: null,        // z. B. '2026-W36'; null = erste Woche mit Dienst
    lastBackup: null             // ISO-Datum des letzten Exports
  };

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function defaultState() {
    return {
      version: VERSION,
      settings: clone(DEFAULT_SETTINGS),
      shifts: clone(DEFAULT_SHIFTS),
      weeks: {},     // "2026-W37": { shiftId, days: { "2026-09-10": { shiftId } | { absence } } }
      entries: [],   // { id, date, title, start, end, kind: 'vz' | 'termin' }
      series: [],    // { id, title, weekday(1=Mo..7=So), start, end, interval, from, until, skipDates: [], extraDates: [{date,start,end}] }
      saldoChecks: [] // { id, date, value, appValue }: Saldo laut Stempeluhr am Ende von date, appValue = Rechnung der App davor
    };
  }

  // Bringt ein geladenes/importiertes Objekt in eine gültige Form.
  function normalize(raw) {
    const base = defaultState();
    if (!raw || typeof raw !== 'object') return base;
    const s = base;
    s.settings = Object.assign({}, base.settings, raw.settings || {});
    s.shifts = Array.isArray(raw.shifts) && raw.shifts.length ? raw.shifts.map(function (sh) {
      return {
        id: String(sh.id || uid()),
        code: String(sh.code || '?'),
        label: String(sh.label || ''),
        group: ['vollzeit', 'teilzeit', 'vertretung'].indexOf(sh.group) >= 0 ? sh.group : 'vollzeit',
        start: sh.start || '08:00',
        end: sh.end || '14:00',
        pause: Number(sh.pause) || 0
      };
    }) : base.shifts;
    s.weeks = raw.weeks && typeof raw.weeks === 'object' ? raw.weeks : {};
    Object.keys(s.weeks).forEach(function (k) {
      const w = s.weeks[k] || {};
      s.weeks[k] = { shiftId: w.shiftId || null, days: w.days && typeof w.days === 'object' ? w.days : {} };
    });
    s.entries = Array.isArray(raw.entries) ? raw.entries.filter(function (e) {
      return e && e.date && e.start && e.end;
    }).map(function (e) {
      return {
        id: String(e.id || uid()),
        date: e.date,
        title: String(e.title || (e.kind === 'termin' ? 'Termin' : 'VZ')),
        start: e.start,
        end: e.end,
        kind: e.kind === 'termin' ? 'termin' : 'vz'
      };
    }) : [];
    s.series = Array.isArray(raw.series) ? raw.series.filter(function (se) {
      return se && se.start && se.end && se.from;
    }).map(function (se) {
      return {
        id: String(se.id || uid()),
        title: String(se.title || 'Termin'),
        weekday: Math.min(7, Math.max(1, Number(se.weekday) || 1)),
        start: se.start,
        end: se.end,
        interval: Math.max(1, Number(se.interval) || 1),
        from: se.from,
        until: se.until || null,
        skipDates: Array.isArray(se.skipDates) ? se.skipDates.slice() : [],
        extraDates: Array.isArray(se.extraDates) ? se.extraDates.map(function (x) {
          return typeof x === 'string' ? { date: x, start: se.start, end: se.end } : x;
        }) : []
      };
    }) : [];
    s.saldoChecks = Array.isArray(raw.saldoChecks) ? raw.saldoChecks.filter(function (c) {
      return c && /^\d{4}-\d{2}-\d{2}$/.test(c.date) && typeof c.value === 'number' && isFinite(c.value);
    }).map(function (c) {
      return {
        id: String(c.id || uid()),
        date: c.date,
        value: c.value,
        appValue: typeof c.appValue === 'number' && isFinite(c.appValue) ? c.appValue : null
      };
    }) : [];
    return s;
  }

  function loadState() {
    try {
      const text = localStorage.getItem(STORAGE_KEY);
      if (!text) return defaultState();
      return normalize(JSON.parse(text));
    } catch (err) {
      console.warn('Daten konnten nicht geladen werden, starte leer.', err);
      return defaultState();
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      console.error('Speichern fehlgeschlagen', err);
      return false;
    }
  }

  function exportJson(state) {
    return JSON.stringify(Object.assign({}, state, { exportedAt: new Date().toISOString() }), null, 2);
  }

  // Wirft einen Fehler, wenn der Text kein brauchbares Backup ist.
  function importJson(text) {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== 'object' || (!raw.weeks && !raw.entries && !raw.shifts)) {
      throw new Error('Das ist kein Backup von „Dienstplan Sarah“.');
    }
    return normalize(raw);
  }

  function clearState() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (err) { /* egal */ }
  }

  window.Data = {
    loadState: loadState,
    saveState: saveState,
    exportJson: exportJson,
    importJson: importJson,
    clearState: clearState,
    defaultState: defaultState,
    uid: uid
  };
})();
