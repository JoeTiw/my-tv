/*
 * The Nepali calendar: today's Bikram Sambat date, and what's coming (festivals, birthdays, your own days).
 *
 * BS months don't follow a formula: their lengths are set each year. The table below (2080 to 2090 BS) comes from
 * nepali-date-converter (MIT, github.com/subeshb1/Nepali-Date) and was checked against every date in the
 * government's list of public holidays for 2083. Years after the published calendars are its best projection.
 * Festival dates follow the moon, so they are listed per year: FESTIVALS has the 2083 list (until April 2027);
 * the 2084 list is added when the government publishes it, around April 2027.
 */
var Calendar = (function () {
  'use strict';

  var C = window.TIWARI || {};

  var FIRST_YEAR = 2080, EPOCH = Date.UTC(2023, 3, 14);   // 2080/01/01 BS = April 14, 2023
  var MONTH_DAYS = {
    2080: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
    2081: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
    2082: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2083: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2084: [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 30, 30],
    2085: [31, 32, 31, 32, 30, 31, 30, 30, 29, 30, 30, 30],
    2086: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
    2087: [31, 31, 32, 31, 31, 31, 30, 30, 29, 30, 30, 30],
    2088: [30, 31, 32, 32, 30, 31, 30, 30, 29, 30, 30, 30],
    2089: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
    2090: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30]
  };
  var MONTHS = ['Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Asoj', 'Kartik', 'Mangsir', 'Poush', 'Magh',
    'Falgun', 'Chaitra'];
  var MONTHS_NE = ['बैशाख', 'जेठ', 'असार', 'साउन', 'भदौ', 'असोज', 'कात्तिक', 'मंसिर', 'पुस', 'माघ', 'फागुन', 'चैत'];
  var DIGITS_NE = '०१२३४५६७८९';
  var DAY = 86400000;

  // Festivals from the government's list of public holidays for 2083 (and the days of Tihar from the Nepali
  // calendar), as AD dates. [date, name, greeting on the day]
  var FESTIVALS = [
    ['2026-11-08', 'Laxmi Puja', 'Happy Tihar!'],
    ['2026-11-10', 'Mha Puja', 'Happy Mha Puja!'],
    ['2026-11-11', 'Bhai Tika', 'Happy Bhai Tika!'],
    ['2026-11-15', 'Chhath', 'Happy Chhath!'],
    ['2026-12-24', 'Yomari Punhi', 'Happy Yomari Punhi!'],
    ['2026-12-25', 'Christmas', 'Merry Christmas!'],
    ['2026-12-30', 'Tamu Lhosar', 'Happy Tamu Lhosar!'],
    ['2027-01-01', 'New Year (AD)', 'Happy New Year!'],
    ['2027-01-15', 'Maghe Sankranti', 'Happy Maghe Sankranti!'],
    ['2027-02-07', 'Sonam Lhosar', 'Happy Sonam Lhosar!'],
    ['2027-02-11', 'Basanta Panchami', 'Happy Saraswati Puja!'],
    ['2027-03-06', 'Maha Shivaratri', 'Happy Maha Shivaratri!'],
    ['2027-03-09', 'Gyalpo Lhosar', 'Happy Gyalpo Lhosar!'],
    ['2027-03-21', 'Holi', 'Happy Holi!'],
    ['2027-04-06', 'Ghode Jatra', 'Happy Ghode Jatra!']
  ];

  // MARK: - Dates

  function dayNumber(d) { return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY); }
  function fromAd(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }

  /** AD → {year, month (0-11), day}, or null outside the table. */
  function toBS(date) {
    var n = dayNumber(date) - EPOCH / DAY;
    if (n < 0) return null;
    for (var y = FIRST_YEAR; MONTH_DAYS[y]; y++) {
      for (var m = 0; m < 12; m++) {
        if (n < MONTH_DAYS[y][m]) return {year: y, month: m, day: n + 1};
        n -= MONTH_DAYS[y][m];
      }
    }
    return null;
  }

  /** BS → AD (a local Date at midnight), or null outside the table. */
  function fromBS(year, month, day) {
    if (!MONTH_DAYS[year] || month < 0 || month > 11 || day < 1 || day > MONTH_DAYS[year][month]) return null;
    var n = day - 1;
    for (var y = FIRST_YEAR; y < year; y++) for (var i = 0; i < 12; i++) n += MONTH_DAYS[y][i];
    for (var m = 0; m < month; m++) n += MONTH_DAYS[year][m];
    var t = new Date(EPOCH + n * DAY);
    return new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  }

  function nepaliDigits(n) { return String(n).replace(/[0-9]/g, function (c) { return DIGITS_NE.charAt(+c); }); }

  /** "Kartik 12, 2083" and "कात्तिक १२, २०८३". */
  function today(now) {
    var b = toBS(now || new Date());
    if (!b) return null;
    return {
      en: MONTHS[b.month] + ' ' + b.day + ', ' + b.year,
      ne: MONTHS_NE[b.month] + ' ' + nepaliDigits(b.day) + ', ' + nepaliDigits(b.year),
      bs: b
    };
  }

  // MARK: - What's coming

  /**
   * Every dated thing from today on: festivals, Nepali New Year, and config's events. An event in config.js:
   *   {name: "Ama's birthday", bs: '05-14'}   every year on a BS date (Bhadra 14)
   *   {name: "Papa's birthday", ad: '03-21'}  every year on an AD date (March 21)
   *   {name: 'Trip to Pokhara', date: '2026-12-20'}  once
   * Add birthday: true for a birthday greeting.
   */
  function upcoming(now, days) {
    now = now || new Date();
    var start = dayNumber(now), end = start + days, out = [];
    function add(date, name, greeting, kind) {
      if (!date) return;
      var n = dayNumber(date);
      if (n >= start && n <= end) out.push({name: name, greeting: greeting, kind: kind, date: date, inDays: n - start});
    }
    FESTIVALS.forEach(function (f) { add(fromAd(f[0]), f[1], f[2], 'festival'); });
    var b = toBS(now), y = b ? b.year : 0;
    if (y) {
      add(fromBS(y + 1, 0, 1), 'Nepali New Year ' + (y + 1), 'Naya Barsha ' + (y + 1) + ' ko shubhakamana!', 'festival');
    }
    (C.events || []).forEach(function (e) {
      if (!e || !e.name) return;
      var greeting = e.birthday ? 'Happy birthday, ' + e.name.replace(/'s birthday$/i, '') + '!' : e.greeting || e.name;
      var kind = e.birthday ? 'birthday' : 'event', m;
      if (e.date) add(fromAd(e.date), e.name, greeting, kind);
      else if (e.ad && (m = /^(\d\d?)-(\d\d?)$/.exec(e.ad))) {
        for (var k = 0; k < 2; k++) add(new Date(now.getFullYear() + k, +m[1] - 1, +m[2]), e.name, greeting, kind);
      } else if (e.bs && (m = /^(\d\d?)-(\d\d?)$/.exec(e.bs)) && y) {
        for (var j = 0; j < 2; j++) add(fromBS(y + j, +m[1] - 1, +m[2]), e.name, greeting, kind);
      }
    });
    out.sort(function (a, c) { return a.inDays - c.inDays; });
    return out;
  }

  function when(e) {
    return e.inDays === 0 ? 'Today' : e.inDays === 1 ? 'Tomorrow'
      : e.inDays < 7 ? 'This ' + U.DAYS[e.date.getDay()] : 'In ' + e.inDays + ' days';
  }

  // MARK: - On screen

  var ICON = {
    festival: '<svg viewBox="0 0 24 24"><path d="M12 3c-.6 2.6-3.4 3.9-3.4 7a3.4 3.4 0 0 0 6.8 0C15.4 6.9 12.6 5.6 12 3z" fill="#FFC56B"/><rect x="7" y="15" width="10" height="3" rx="1.5" fill="#FF9F5A"/><rect x="9" y="18" width="6" height="2.5" rx="1" fill="#FF9F5A"/></svg>',
    birthday: '<svg viewBox="3.5 1.5 17 19.5"><rect x="5" y="11" width="14" height="9" rx="2" fill="#FF7AA8"/><path d="M5 15c2 1.2 3.5 1.2 4.7 0s2.6-1.2 4.6 0 3.5 1.2 4.7 0" stroke="#FFF" stroke-width="1.4" fill="none"/><rect x="11.2" y="6" width="1.6" height="5" fill="#FFF"/><path d="M12 2.5c.9 1.2 1.2 2 .1 3-1.1-1-.8-1.8-.1-3z" fill="#FFC56B"/></svg>',
    event: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3" fill="none" stroke="#FFF" stroke-width="2"/><path d="M4 10h16M9 3v4M15 3v4" stroke="#FFF" stroke-width="2" stroke-linecap="round"/></svg>'
  };

  var shownDay = -1;

  function render(force) {
    var now = new Date(), n = dayNumber(now);
    if (n === shownDay && !force) return;
    shownDay = n;
    var t = today(now), line = U.$('nepali');
    if (t) {
      line.innerHTML = '';
      U.el('span', '', line, t.en);
      if (C.nepaliScript !== false) U.el('span', 'ne', line, t.ne);
    }
    var box = U.$('days');
    box.innerHTML = '';
    var list = upcoming(now, 45).slice(0, 2);
    list.forEach(function (e) {
      var pill = U.el('div', 'pill glass day' + (e.inDays === 0 ? ' today' : ''), box);
      pill.innerHTML = ICON[e.kind] || ICON.event;
      if (e.inDays === 0) U.el('b', '', pill, e.greeting);
      else { U.el('b', '', pill, e.name); U.el('span', 'soft', pill, ' · ' + when(e)); }
    });
  }

  /** For the assistant: today's BS date and the next few things on the calendar. */
  function summary() {
    var t = today(), list = upcoming(new Date(), 60);
    return (t ? 'Nepali date today: ' + t.en + ' BS. ' : '')
      + (list.length ? 'Coming up: ' + list.map(function (e) { return e.name + ' (' + when(e).toLowerCase() + ')'; }).join(', ') + '.' : '');
  }

  return {toBS: toBS, fromBS: fromBS, today: today, upcoming: upcoming, render: render, summary: summary};
})();
