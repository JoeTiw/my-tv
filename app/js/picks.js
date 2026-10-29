/*
 * Tonight's picks: four titles for the family, chosen by Claude once a day (from what it knows about them and what
 * they opened lately), as wide cards above the dock. ▲ from the apps reaches them; OK opens the title's app.
 * "Hey TV, new picks" makes them again. Nothing happens without a Claude key.
 */
var Picks = (function () {
  'use strict';

  var C = window.TIWARI || {};
  var box = U.$('picks'), row = box.querySelector('.row'), busy = false;

  function today() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

  function render(saved) {
    var items = saved && saved.items || [];
    if (!items.length || C.picks === false) { U.cls(box, 'on', false); Home.setPicks(null); return; }
    box.querySelector('h3').textContent = L.t("Tonight's picks");
    var nodes = Assistant.cards(row, items, true, function (i) { Assistant.openTitle(items[i]); });
    U.cls(box, 'on', true);
    Home.setPicks({nodes: nodes, ok: function (i) { Assistant.openTitle(items[i]); }});
  }

  /** Makes them (once a day; force: now). */
  function make(force) {
    var saved = U.load('picks');
    if (!force && saved && saved.day === today()) { render(saved); return; }
    if (busy || !Assistant.hasKey() || C.picks === false || !Home.apps().length) { render(saved); return; }
    busy = true;
    var sys = [
      Assistant.context(),
      '',
      'Choose 4 titles for this family to watch tonight, on the apps they have, mixing movies and shows, fitting what you',
      'know about them (and the day: a festival, a weekend). Not ones they opened recently. Only titles you are confident',
      'exist. Reply with ONLY a JSON object, no other text:',
      '{"items": [{"title": "...", "year": 2021, "kind": "movie" or "tv", "app_id": "<an app_id above or null>", "why": "<under 6 words>"}]}'
    ].join('\n');
    Assistant.complete(sys, [{role: 'user', content: "Tonight's picks, please."}], {}, function (err, answer) {
      busy = false;
      if (!err && answer && answer.items && answer.items.length) {
        saved = {day: today(), items: answer.items.slice(0, 4)};
        U.save('picks', saved);
      }
      render(saved);
    });
  }

  function start() {
    render(U.load('picks'));
    setTimeout(function () { make(false); }, 4000);   // after the apps are listed
    setInterval(function () { if (!document.hidden) make(false); }, 30 * 60000);   // a new day: new picks
  }

  return {start: start, make: make};
})();
