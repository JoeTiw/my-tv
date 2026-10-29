/*
 * The TV's side: its apps and opening them, through webOS's own service bus (Luna), the way LG's apps do.
 * In a desktop browser (no PalmServiceBridge) it plays a stand-in TV, so the screen can be previewed.
 */
var TV = (function () {
  'use strict';

  var onTV = typeof window.PalmServiceBridge !== 'undefined';
  var keys = {left: 37, up: 38, right: 39, down: 40, ok: 13, back: 461};

  /** One Luna call: done(err, reply). */
  function luna(uri, params, done) {
    if (!onTV) { done(new Error('not a TV')); return; }
    var bridge = new window.PalmServiceBridge(), answered = false;
    bridge.onservicecallback = function (msg) {
      if (answered) return;
      answered = true;
      var reply;
      try { reply = JSON.parse(msg); } catch (e) { done(e); return; }
      if (reply.returnValue === false) done(new Error(reply.errorText || 'refused'), reply);
      else done(null, reply);
    };
    bridge.call(uri, JSON.stringify(params || {}));
    TV._bridges.push(bridge);   // kept, or the bridge can be collected before it answers
  }

  // Well-known LG app ids, for TVs that won't list their apps to a Developer Mode app (newer webOS).
  // [id, name, brand color]
  var KNOWN = [
    ['netflix', 'Netflix', '#E50914'],
    ['youtube.leanback.v4', 'YouTube', '#FF0033'],
    ['amazon', 'Prime Video', '#1A98FF'],
    ['com.disney.disneyplus-prod', 'Disney+', '#1838C8'],
    ['com.apple.appletv', 'Apple TV', '#8E8E9A'],
    ['spotify-beehive', 'Spotify', '#1DB954'],
    ['com.webos.app.livetv', 'Live TV', '#FF8A3D'],
    ['com.webos.app.hdmi1', 'HDMI 1', '#7A7AFF'],
    ['com.webos.app.browser', 'Browser', '#3A7BD5'],
    ['com.palm.app.settings', 'Settings', '#8E8E93']
  ];
  var SYSTEM = /^com\.webos\.app\.(home|discovery|voice|notificationcenter|accessibility|inputmgr|tvhotkey)|^com\.webos\.exampleapp|^com\.tiwari\.tv$/;

  function known() {
    return KNOWN.map(function (k) { return {id: k[0], title: k[1], color: k[2], icon: ''}; });
  }

  /** The apps to show: [{id, title, color, icon}]. */
  function apps(done) {
    if (!onTV) { done(known()); return; }
    luna('luna://com.webos.applicationManager/listLaunchPoints', {}, function (err, reply) {
      if (err || !reply || !reply.launchPoints || !reply.launchPoints.length) { done(known()); return; }
      var list = [];
      for (var i = 0; i < reply.launchPoints.length; i++) {
        var p = reply.launchPoints[i];
        if (!p.id || SYSTEM.test(p.id) || p.hidden) continue;
        list.push({id: p.id, title: p.title || p.id, color: p.bgColor || '', icon: p.largeIcon || p.icon || ''});
      }
      done(list.length ? list : known());
    });
  }

  /** Opens an app; done(err). */
  function launch(id, done) {
    done = done || function () {};
    if (!onTV) { TV.launched.push(id); done(null); return; }
    luna('luna://com.webos.applicationManager/launch', {id: id}, function (err) { done(err); });
  }

  return {onTV: onTV, keys: keys, apps: apps, launch: launch, known: known, launched: [], _bridges: []};
})();
