/*
 * The assistant. "Hey TV, ..." from the phone goes to Claude with what the TV knows (its apps, the city, the time);
 * Claude answers with a short reply and one action: open an app, recommend titles, or change the theme.
 * Recommendations show as cards (posters from TMDB when there's a key); OK on one opens its app.
 * The answer also goes back to the phone.
 */
var Assistant = (function () {
  'use strict';

  var C = window.TIWARI || {};
  var KEY = String(C.claudeKey || '').replace(/^\s+|\s+$/g, '');
  var TMDB = String(C.tmdbKey || '').replace(/^\s+|\s+$/g, '');
  var API = 'https://api.anthropic.com/v1/messages', VERSION = '2026-10-21';
  var CLOSE_MS = 60000, OPEN_DELAY_MS = 1600;

  var box = U.$('assistant'), history = [], closeTimer = 0, busy = false;
  var asked = box.querySelector('.asked'), said = box.querySelector('.said'), recsBox = box.querySelector('.recs'), hint = box.querySelector('.hint');

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

  function system() {
    var now = new Date(), t = U.time(now), w = Weather.current();
    var apps = Home.apps().map(function (a) { return '- ' + a.title + ' (app_id: ' + a.id + ')'; }).join('\n');
    return [
      'You are the assistant inside "Tiwari TV", the home screen of a family\'s LG TV' + (C.city ? ' in ' + C.city : '') + '.',
      'Someone typed or dictated a request on their phone; your answer shows on the TV and goes back to the phone.',
      'It is ' + U.DAYS[now.getDay()] + ', ' + t.hm + ' ' + t.ampm + ' local time.'
        + (w ? ' Weather: ' + w.temp + '°, ' + w.kind + '.' : ''),
      Calendar.summary(),
      'Streaming catalogue to think about: ' + (C.region || 'IN') + ' (country code).',
      'Apps on this TV:\n' + apps,
      '',
      'Reply with ONLY a JSON object, no other text:',
      '{"say": "<warm, short reply, at most 2 sentences>", "action": <one of>}',
      '  {"type": "open_app", "app_id": "<one of the app_ids above>"}',
      '  {"type": "recommend", "items": [{"title": "...", "year": 2021, "kind": "movie" or "tv", "app_id": "<an app_id above or null>", "why": "<under 8 words>"}]}  (3 or 4 real titles)',
      '  {"type": "theme", "value": "dark" or "light" or "auto"}',
      '  {"type": "none"}',
      'Only use app_ids from the list. Only recommend titles you are confident exist; for app_id, pick the app it most',
      'likely streams on in that country, or null when unsure. If asked for something a TV can\'t do, say so kindly.'
    ].join('\n');
  }

  function parse(text) {
    var a = text.indexOf('{'), b = text.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(text.slice(a, b + 1)); } catch (e) { return null; }
  }

  function askClaude(question, done) {
    var messages = history.concat([{role: 'user', content: question}]);
    U.http(API, {
      method: 'POST',
      timeout: 40000,
      type: 'json',
      headers: {
        'content-type': 'application/json',
        'x-api-key': KEY,
        'anthropic-version': VERSION,
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({model: C.claudeModel || 'claude-haiku-5-5', max_tokens: 800, system: system(), messages: messages})
    }, function (err, res) {
      if (err) { done(err); return; }
      var text = '';
      for (var i = 0; res && res.content && i < res.content.length; i++) if (res.content[i].type === 'text') text += res.content[i].text;
      var answer = parse(text);
      if (!answer) { done(new Error('unreadable answer')); return; }
      history = messages.concat([{role: 'assistant', content: text}]).slice(-8);   // short memory, for "something else"
      done(null, answer);
    });
  }

  // MARK: - Posters (TMDB)

  function poster(item, done) {
    if (!TMDB) { done(null); return; }
    var kind = item.kind === 'tv' ? 'tv' : 'movie';
    var url = 'https://api.tmdb.org/3/search/' + kind + '?query=' + encodeURIComponent(item.title)
      + (item.year ? (kind === 'tv' ? '&first_air_date_year=' : '&year=') + item.year : '');
    var headers = {};
    if (TMDB.indexOf('eyJ') === 0) headers.Authorization = 'Bearer ' + TMDB;   // the long "Read Access Token"
    else url += '&api_key=' + encodeURIComponent(TMDB);                        // the short "API Key"
    U.http(url, {type: 'json', headers: headers}, function (err, res) {
      var hit = !err && res && res.results && res.results[0];
      done(hit && hit.poster_path ? 'https://image.tmdb.org/t/p/w342' + hit.poster_path : null);
    });
  }

  // MARK: - Actions

  function appById(id) {
    var list = Home.apps();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function recommend(items) {
    items = (items || []).slice(0, 4);
    recsBox.innerHTML = '';
    var nodes = [];
    items.forEach(function (it) {
      var app = appById(it.app_id), card = U.el('div', 'rec', recsBox);
      var p = U.el('div', 'poster', card, it.title);
      U.el('div', 't', card, it.title + (it.year ? ' (' + it.year + ')' : ''));
      U.el('div', 's', card, (app ? app.title : 'Where to watch: unsure') + (it.why ? ' · ' + it.why : ''));
      poster(it, function (src) { if (src) { p.style.backgroundImage = 'url("' + src + '")'; U.cls(p, 'img', true); } });
      card.addEventListener('click', function () { pick(items, nodes.indexOf(card)); });
      nodes.push(card);
    });
    hint.textContent = items.length ? 'OK opens it · Back closes' : '';
    Home.setRecs({nodes: nodes, ok: function (i) { pick(items, i); }, back: close});
  }

  function pick(items, i) {
    var it = items[i], app = it && appById(it.app_id);
    if (!app) { Home.toast('Not sure which app has ' + (it ? it.title : 'that')); return; }
    Home.toast('Opening ' + app.title + ' · search for “' + it.title + '”');
    close();
    Home.open(app);
  }

  function act(question, answer) {
    var a = answer.action || {type: 'none'}, say = answer.say || '';
    show(question, say, false);
    var phone = say;
    if (a.type === 'open_app') {
      var app = appById(a.app_id);
      if (app) {
        setTimeout(function () { close(); Home.open(app); }, OPEN_DELAY_MS);
      } else {
        said.textContent = say + ' (That app isn\'t on this TV.)';
      }
    } else if (a.type === 'recommend') {
      recommend(a.items);
      phone += '\n' + (a.items || []).map(function (it) {
        var app = appById(it.app_id);
        return '• ' + it.title + (it.year ? ' (' + it.year + ')' : '') + (app ? ' on ' + app.title : '');
      }).join('\n');
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
      show(question, 'The assistant needs a Claude key first. Add it to config.js on your computer, then install again.');
      Inbox.reply('The assistant needs a Claude key first (claudeKey in app/config.js).');
      return;
    }
    if (busy) return;
    busy = true;
    recsBox.innerHTML = '';
    hint.textContent = '';
    Home.setRecs(null);
    show(question, 'Thinking…', true);
    askClaude(question, function (err, answer) {
      busy = false;
      if (err) {
        var msg = /HTTP 401/.test(err.message) ? 'My Claude key was refused. Check claudeKey in config.js.'
          : /HTTP 429/.test(err.message) ? 'Too many questions at once. Try again in a minute.'
          : /HTTP 400/.test(err.message) && /credit|billing/i.test(err.message) ? 'The Claude account is out of credit.'
          : 'I couldn\'t reach Claude just now. Try again in a moment.';
        show(question, msg, false);
        Inbox.reply(msg);
        return;
      }
      act(question, answer);
    });
  }

  return {ask: ask, close: close};
})();
