/* The weather from Open-Meteo (free, no key): now, today's high and low, and sunrise and sunset for the night look. */
var Weather = (function () {
  'use strict';

  var C = window.TIWARI || {};
  var last = U.load('weather');

  // WMO weather codes, grouped.
  function kind(code) {
    if (code === 0) return 'clear';
    if (code <= 3) return 'partly';
    if (code <= 48) return 'fog';
    if (code <= 67 || (code >= 80 && code <= 82)) return 'rain';
    if (code <= 77 || code === 85 || code === 86) return 'snow';
    return 'storm';
  }
  var WORDS = {clear: 'Clear', partly: 'Partly cloudy', fog: 'Foggy', rain: 'Rain', snow: 'Snow', storm: 'Thunderstorms'};

  function refresh(done) {
    if (typeof C.latitude !== 'number' || typeof C.longitude !== 'number') { done(last); return; }
    var unit = C.units === 'F' ? '&temperature_unit=fahrenheit' : '';
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + C.latitude + '&longitude=' + C.longitude
      + '&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset'
      + '&timezone=auto&forecast_days=1' + unit;
    U.http(url, {type: 'json'}, function (err, w) {
      if (!err && w && w.current && w.daily) {
        last = {
          temp: Math.round(w.current.temperature_2m),
          kind: kind(w.current.weather_code),
          isDay: w.current.is_day === 1,
          hi: Math.round(w.daily.temperature_2m_max[0]),
          lo: Math.round(w.daily.temperature_2m_min[0]),
          sunrise: w.daily.sunrise[0],
          sunset: w.daily.sunset[0],
          utcOffset: w.utc_offset_seconds,
          at: Date.now()
        };
        U.save('weather', last);
      }
      done(last);
    });
  }

  /** Night from sunset to sunrise; 6 PM to 6 AM before the first forecast. */
  function isNight(now) {
    var h = now.getHours() + now.getMinutes() / 60;
    if (!last || !last.sunrise || !last.sunset) return h < 6 || h >= 18;
    function hours(s) { var m = /T(\d\d):(\d\d)/.exec(s); return m ? +m[1] + m[2] / 60 : null; }
    var rise = hours(last.sunrise), set = hours(last.sunset);
    if (rise === null || set === null) return h < 6 || h >= 18;
    return h < rise || h >= set;
  }

  // Small drawn symbols (our own), white.
  var ICONS = {
    clear: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="8" fill="#FFD66B"/><g stroke="#FFD66B" stroke-width="3" stroke-linecap="round"><path d="M20 3v5M20 32v5M3 20h5M32 20h5M8 8l3.5 3.5M28.5 28.5L32 32M8 32l3.5-3.5M28.5 11.5L32 8"/></g></svg>',
    partly: '<svg viewBox="0 0 40 40"><circle cx="15" cy="15" r="7" fill="#FFD66B"/><path d="M13 32h17a6 6 0 0 0 0-12 8 8 0 0 0-15 2 5 5 0 0 0-2 10z" fill="#FFF"/></svg>',
    fog: '<svg viewBox="0 0 40 40"><g stroke="#FFF" stroke-width="3.5" stroke-linecap="round"><path d="M7 14h26M4 21h32M9 28h22"/></g></svg>',
    rain: '<svg viewBox="0 0 40 40"><path d="M11 24h18a6 6 0 0 0 0-12 8 8 0 0 0-15 2 5 5 0 0 0-3 10z" fill="#FFF"/><g stroke="#8CC8FF" stroke-width="3" stroke-linecap="round"><path d="M14 29l-2 5M21 29l-2 5M28 29l-2 5"/></g></svg>',
    snow: '<svg viewBox="0 0 40 40"><path d="M11 24h18a6 6 0 0 0 0-12 8 8 0 0 0-15 2 5 5 0 0 0-3 10z" fill="#FFF"/><g fill="#FFF"><circle cx="14" cy="31" r="2"/><circle cx="21" cy="34" r="2"/><circle cx="28" cy="31" r="2"/></g></svg>',
    storm: '<svg viewBox="0 0 40 40"><path d="M11 22h18a6 6 0 0 0 0-12 8 8 0 0 0-15 2 5 5 0 0 0-3 10z" fill="#FFF"/><path d="M21 22l-5 8h5l-3 7 8-10h-5l3-5z" fill="#FFD66B"/></svg>'
  };

  function render(box) {
    if (!last) { U.cls(box, 'on', false); return; }
    box.innerHTML = ICONS[last.kind] + '<b>' + last.temp + '°</b>' + '<span>' + (C.city ? C.city + ' · ' : '')
      + WORDS[last.kind] + '</span><span class="soft"> · ' + last.hi + '° / ' + last.lo + '°</span>';
    U.cls(box, 'on', true);
  }

  return {refresh: refresh, render: render, isNight: isNight, current: function () { return last; }};
})();
