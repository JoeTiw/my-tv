/*
 * The assistant. "Hey TV, ..." from the phone goes to Claude with what the TV knows: its apps, the city, the time,
 * the weather (today and tomorrow), the Nepali calendar, and what it has learned about the family. Claude answers
 * with a short reply and one action: open an app, recommend titles (cards; OK opens the app), play a trailer on
 * YouTube, refresh tonight's picks, or change the theme. It can also remember things ("we loved Panchayat") and
 * look things up on the web for questions about now (cricket scores, the news, the rupee).
 * The answer also goes back to the phone.
 */
var Assistant = (function () {
  'use strict';

  var C = window.TIWARI || {};
  var KEY = String(C.claudeKey || '').replace(/^\s+|\s+$/g, '');
  var TMDB = String(C.tmdbKey || '').replace(/^\s+|\s+$/g, '');
  var API = 'https://api.anthropic.com/v1/messages', VERSION = '2026-10-21';
  var CLOSE_MS = 60000, OPEN_DELAY_MS = 1600, MEMORY_MAX = 40, CHOSEN_MAX = 30;
  var YOUTUBE = 'youtube.leanback.v4';

  var box = U.$('assistant'), history = [], closeTimer = 0, busy = false;
  var asked = box.querySelector('.asked'), said = box.querySelector('.said'), recsBox = box.querySelector('.recs'), hint = box.querySelector('.hint');
  var search = C.webSearch !== false && !U.load('noSearch');

  // MARK: - What it knows about the family (kept on the TV)

  var memory = U.load('memory') || [], chosen = U.load('chosen') || [];

  function remember(facts) {
    (facts || []).forEach(function (f) {
      f = String(f || '').replace(/^\s+|\s+$/g, '').slice(0, 160);
      if (f) memory.push({f: f, at: Date.now()});
    });
    memory = memory.slice(-MEMORY_MAX);
    U.save('memory', memory);
  }

  function forget() { memory = []; chosen = []; U.save('memory', memory); U.save('chosen', chosen); }

  /** A title someone opened from the picks (so picks don't keep suggesting it). */
  function picked(title) {
    chosen.push({t: String(title).slice(0, 80), at: Date.now()});
    chosen = chosen.slice(-CHOSEN_MAX);
    U.save('chosen', chosen);
  }

  // MARK: - The panel

  function show(question, text, thinking) {
    asked.textContent = question ? '“' + question + '”' : '';
    said.textContent = text || '';
    U.cls(box, 'thinking', !!thinking);
    U.cls(box, 'on', true);
    U.cls(document.body, 'assistant-on', true);
    clearTimeout(closeTimer);
    closeTimer = setTimeout(close, CLOSE_MS);
  }

  function close() {
    clearTimeout(closeTimer);
    U.cls(box, 'on', false);
    U.cls(document.body, 'assistant-on', false);
    recsBox.innerHTML = '';
    hint.textContent = '';
    Home.setRecs(null);
  }

  // MARK: - Claude

  /** What the TV knows, for any request to Claude (the assistant and tonight's picks). */
  function context() {
    var now = new Date(), w = Weather.current(), h = now.getHours(), m = now.getMinutes();
    var clock = (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' AM' : ' PM');
    var apps = Home.apps().map(function (a) { return '- ' + a.title + ' (app_id: ' + a.id + ')'; }).join('\n');
    var lines = [
      'You are the assistant inside "Tiwari TV", the home screen of a family\'s LG TV' + (C.city ? ' in ' + C.city : '') + '.',
      'It is ' + U.DAYS[now.getDay()] + ', ' + clock + ' local time.'
        + (w ? ' Weather now: ' + w.temp + '°' + (C.units === 'F' ? 'F' : 'C') + ', ' + w.kind + ', today ' + w.hi + '°/' + w.lo + '°.' : '')
        + (w && w.tomorrow ? ' Tomorrow: ' + w.tomorrow.hi + '°/' + w.tomorrow.lo + '°, ' + w.tomorrow.kind + '.' : ''),
      Calendar.summary(),
      'Streaming catalogue to think about: ' + (C.region || 'IN') + ' (country code).',
      'Apps on this TV:\n' + apps
    ];
    if (memory.length) lines.push('What you know about this family (from what they told you):\n' + memory.map(function (x) { return '- ' + x.f; }).join('\n'));
    if (chosen.length) lines.push('Titles they opened from your picks recently: ' + chosen.map(function (x) { return x.t; }).join(', ') + '.');
    lines.push(L.ne ? 'The family has the TV in Nepali: write "say" and "why" in Nepali (Devanagari), whatever language they used; keep titles as they are known.'
      : 'Answer in the language they wrote in.');
    return lines.join('\n');
  }

  function system() {
    return [
      context(),
      'Someone typed or dictated a request on their phone; your answer shows on the TV and goes back to the phone.',
      search ? 'For questions about now (scores, news, prices, exchange rates, opening hours), search the web first; keep the answer short.' : '',
      '',
      'Reply with ONLY a JSON object, no other text:',
      '{"say": "<warm, short reply, at most 3 sentences>", "action": <one of>, "remember": [<optional short facts>], "forget": <optional true>}',
      '  {"type": "open_app", "app_id": "<one of the app_ids above>"}',
      '  {"type": "recommend", "items": [{"title": "...", "year": 2021, "kind": "movie" or "tv", "app_id": "<an app_id above or null>", "why": "<under 8 words>"}]}  (3 or 4 real titles)',
      '  {"type": "trailer", "title": "...", "year": 2021, "kind": "movie" or "tv"}  (plays its trailer on YouTube)',
      '  {"type": "picks"}  (make tonight\'s picks on the home screen again)',
      '  {"type": "theme", "value": "dark" or "light" or "auto"}',
      '  {"type": "none"}  (just the answer)',
      '"remember": when they tell you something worth keeping about the family (likes, dislikes, who watches what), add it in',
      'a few words in English ("Loved Panchayat", "Ama dislikes horror"). "forget": true only when they ask you to forget',
      'what you know. Only use app_ids from the list. Only recommend titles you are confident exist, and not ones they',
      'opened recently; for app_id, pick the app it most likely streams on in that country, or null when unsure. If asked',
      'for something a TV can\'t do, say so kindly.'
    ].join('\n');
  }

  function parse(text) {
    var a = text.indexOf('{'), b = text.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(text.slice(a, b + 1)); } catch (e) { return null; }
  }

  /** One request to Claude: done(err, answer object, the reply's text). opts.history, opts.search. */
  function complete(sys, messages, opts, done) {
    var body = {model: C.claudeModel || 'claude-haiku-5-5', max_tokens: 1000, system: sys, messages: messages};
    if (opts.search && search) {
      var where = {type: 'approximate'};
      if (C.city) where.city = C.city;
      if (C.country) where.country = C.country;
      body.tools = [{type: 'web_search_20250305', name: 'web_search', max_uses: 2, user_location: where}];
    }
    U.http(API, {
      method: 'POST',
      timeout: 60000,
      type: 'json',
      headers: {
        'content-type': 'application/json',
        'x-api-key': KEY,
        'anthropic-version': VERSION,
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(body)
    }, function (err, res) {
      // An account or a model without web search: once without it, and not again.
      if (err && body.tools && /HTTP 400/.test(err.message) && /web_search|tool/i.test(err.message)) {
        search = false;
        U.save('noSearch', true);
        complete(sys, messages, opts, done);
        return;
      }
      if (err) { done(err); return; }
      var text = '';
      for (var i = 0; res && res.content && i < res.content.length; i++) if (res.content[i].type === 'text') text += res.content[i].text;
      var answer = parse(text);
      if (!answer) { done(new Error('unreadable answer')); return; }
      done(null, answer, text);
    });
  }

  // MARK: - TMDB: posters, pictures and trailers

  function tmdb(path, done) {
    if (!TMDB) { done(null); return; }
    var url = 'https://api.tmdb.org/3' + path, headers = {};
    if (TMDB.indexOf('eyJ') === 0) headers.Authorization = 'Bearer ' + TMDB;   // the long "Read Access Token"
    else url += (path.indexOf('?') >= 0 ? '&' : '?') + 'api_key=' + encodeURIComponent(TMDB);   // the short "API Key"
    U.http(url, {type: 'json', headers: headers}, function (err, res) { done(err ? null : res); });
  }

  /**
   * The title on TMDB: done(hit or null). With its year first; if that finds nothing (a year off by one), without
   * it; then among movies and shows both (a "movie" that is really a series).
   */
  function find(item, done) {
    var kind = item.kind === 'tv' ? 'tv' : 'movie', q = '?query=' + encodeURIComponent(item.title);
    var year = item.year ? (kind === 'tv' ? '&first_air_date_year=' : '&year=') + item.year : '';
    function first(res, k) {
      var list = (res && res.results || []).filter(function (r) { return !k || r.media_type === 'movie' || r.media_type === 'tv'; });
      var hit = list[0] || null;
      if (hit) hit.kind = k ? hit.media_type : kind;
      return hit;
    }
    function wider() { tmdb('/search/multi' + q, function (res) { done(first(res, true)); }); }
    tmdb('/search/' + kind + q + year, function (res) {
      var hit = first(res);
      if (hit) { done(hit); return; }
      if (!year) { wider(); return; }
      tmdb('/search/' + kind + q, function (res2) { var hit2 = first(res2); if (hit2) done(hit2); else wider(); });
    });
  }

  /** A poster (tall) or a picture from the title (wide): done(url or null). */
  function picture(item, wide, done) {
    find(item, function (hit) {
      var path = hit && (wide ? hit.backdrop_path || hit.poster_path : hit.poster_path);
      done(path ? 'https://image.tmdb.org/t/p/' + (wide ? 'w500' : 'w342') + path : null);
    });
  }

  /** The YouTube id of the title's trailer: done(id or null). */
  function trailerId(item, done) {
    find(item, function (hit) {
      if (!hit) { done(null); return; }
      tmdb('/' + hit.kind + '/' + hit.id + '/videos', function (res) {
        var list = (res && res.results || []).filter(function (v) { return v.site === 'YouTube'; });
        var best = list.filter(function (v) { return v.type === 'Trailer'; })[0] || list[0];
        done(best ? best.key : null);
      });
    });
  }

  // MARK: - Actions

  function appById(id) {
    var list = Home.apps();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /** Cards for titles, in a box: tall posters for the assistant, wide pictures for tonight's picks. */
  function cards(boxEl, items, wide, onPick) {
    boxEl.innerHTML = '';
    var nodes = [];
    items.forEach(function (it, i) {
      var app = appById(it.app_id), card = U.el('div', 'rec' + (wide ? ' wide' : ''), boxEl);
      var p = U.el('div', 'poster', card, it.title);
      U.el('div', 't', card, it.title + (it.year ? ' (' + L.num(it.year) + ')' : ''));
      U.el('div', 's', card, (app ? app.title : L.t('Where to watch: unsure')) + (it.why ? ' · ' + it.why : ''));
      picture(it, wide, function (src) { if (src) { p.style.backgroundImage = 'url("' + src + '")'; U.cls(p, 'img', true); } });
      card.addEventListener('click', function () { onPick(i); });
      nodes.push(card);
    });
    return nodes;
  }

  /** Opens the title's app (or says it doesn't know which). True when it opened. */
  function openTitle(it) {
    var app = it && appById(it.app_id);
    if (!app) { Home.toast(L.t('Not sure which app has {title}', {title: it ? it.title : '?'})); return false; }
    Home.toast(L.t('Opening {app} · search for “{title}”', {app: app.title, title: it.title}));
    picked(it.title);
    Home.open(app);
    return true;
  }

  function recommend(items) {
    items = (items || []).slice(0, 4);
    var nodes = cards(recsBox, items, false, function (i) { if (openTitle(items[i])) close(); });
    hint.textContent = items.length ? L.t('OK opens it · Back closes') + (TMDB ? '' : ' · ' + L.t('Pictures need a TMDB key in config.js')) : '';
    Home.setRecs({nodes: nodes, ok: function (i) { if (openTitle(items[i])) close(); }, back: close});
  }

  function trailer(a) {
    var yt = appById(YOUTUBE);
    if (!yt) { said.textContent += ' ' + L.t("(That app isn't on this TV.)"); return; }
    if (!TMDB) { said.textContent += ' ' + L.t('Trailers need a TMDB key in config.js.'); return; }
    trailerId(a, function (id) {
      if (!id) { said.textContent = L.t("I couldn't find a trailer for {title}.", {title: a.title || '?'}); return; }
      setTimeout(function () {
        close();
        Home.toast(L.t('Playing the trailer on YouTube'));
        TV.launch(YOUTUBE, {contentTarget: 'https://www.youtube.com/tv?v=' + id});
      }, OPEN_DELAY_MS);
    });
  }

  function act(question, answer) {
    var a = answer.action || {type: 'none'}, say = answer.say || '';
    if (answer.forget === true) forget();
    if (answer.remember && answer.remember.length) remember(answer.remember);
    show(question, say, false);
    var phone = say;
    if (a.type === 'open_app') {
      var app = appById(a.app_id);
      if (app) setTimeout(function () { close(); Home.open(app); }, OPEN_DELAY_MS);
      else said.textContent = say + ' ' + L.t("(That app isn't on this TV.)");
    } else if (a.type === 'recommend') {
      recommend(a.items);
      phone += '\n' + (a.items || []).map(function (it) {
        var app = appById(it.app_id);
        return '• ' + it.title + (it.year ? ' (' + it.year + ')' : '') + (app ? ' on ' + app.title : '');
      }).join('\n');
    } else if (a.type === 'trailer') {
      trailer(a);
    } else if (a.type === 'picks') {
      Picks.make(true);
    } else if (a.type === 'theme') {
      Home.setTheme(a.value);
    }
    Inbox.reply(phone);
  }

  /** A question from the phone. */
  function ask(question) {
    question = String(question || '').replace(/^\s+|\s+$/g, '');
    if (!question) return;
    if (!KEY) {
      show(question, L.t('The assistant needs a Claude key first. Add it to config.js on your computer, then install again.'));
      Inbox.reply('The assistant needs a Claude key first (claudeKey in app/config.js).');
      return;
    }
    if (busy) return;
    busy = true;
    recsBox.innerHTML = '';
    hint.textContent = '';
    Home.setRecs(null);
    show(question, L.t('Thinking…'), true);
    var messages = history.concat([{role: 'user', content: question}]);
    complete(system(), messages, {search: true}, function (err, answer, text) {
      busy = false;
      if (err) {
        var msg = L.t(/HTTP 401/.test(err.message) ? 'My Claude key was refused. Check claudeKey in config.js.'
          : /HTTP 429/.test(err.message) ? 'Too many questions at once. Try again in a minute.'
          : /HTTP 400/.test(err.message) && /credit|billing/i.test(err.message) ? 'The Claude account is out of credit.'
          : "I couldn't reach Claude just now. Try again in a moment.");
        show(question, msg, false);
        Inbox.reply(msg);
        return;
      }
      history = messages.concat([{role: 'assistant', content: text}]).slice(-8);   // short memory, for "something else"
      act(question, answer);
    });
  }

  return {
    ask: ask, close: close, complete: complete, context: context, cards: cards, openTitle: openTitle, forget: forget,
    hasKey: function () { return !!KEY; }, memory: function () { return memory.slice(); }
  };
})();
