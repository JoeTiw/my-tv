/*
 * Words on the TV, in English or Nepali. The language comes from the phone (/lang ne · /lang en), or config.js's
 * `language` ('en' or 'ne'). In Nepali the numbers are written in Devanagari too, and the clock says बिहान, दिउँसो,
 * बेलुका or राति instead of AM and PM.
 */
var L = (function () {
  'use strict';

  var C = window.TIWARI || {};
  var lang = (U.load('lang') || C.language || 'en') === 'ne' ? 'ne' : 'en', ne = lang === 'ne';

  var NE = {
    'Good morning': 'शुभ प्रभात',
    'Good afternoon': 'शुभ दिन',
    'Good evening': 'शुभ सन्ध्या',
    'Good night': 'शुभ रात्रि',
    'Opening {app}': '{app} खोल्दै',
    "{app} didn't open": '{app} खुलेन',
    'Theme: {name}': 'थिम: {name}',
    'dark': 'अँध्यारो',
    'light': 'उज्यालो',
    'auto': 'स्वचालित',
    'No app called {name} on this TV': 'यो टिभीमा {name} नामको एप छैन',
    'The photo frame is empty now.': 'फोटो फ्रेम अब खाली छ।',
    'There are no photos in the frame yet.': 'फ्रेममा अहिलेसम्म कुनै फोटो छैन।',
    'Added {n} photos to the frame ({total} in it).': 'फ्रेममा {n} वटा फोटो थपियो (जम्मा {total})।',
    "{n} couldn't be picked up (ntfy keeps photos only a few hours).": '{n} वटा फोटो लिन सकिएन (ntfy ले फोटो केही घण्टा मात्र राख्छ)।',
    'From {name}': '{name} बाट',
    'Clear': 'सफा मौसम',
    'Partly cloudy': 'आंशिक बदली',
    'Foggy': 'कुहिरो',
    'Rain': 'वर्षा',
    'Snow': 'हिमपात',
    'Thunderstorms': 'चट्याङसहित वर्षा',
    'Today': 'आज',
    'Tomorrow': 'भोलि',
    'This {day}': 'यही {day}',
    'In {n} days': '{n} दिनमा',
    'Happy birthday, {name}!': 'जन्मदिनको शुभकामना, {name}!',
    'Thinking…': 'सोच्दैछु…',
    "Tonight's picks": 'आज बेलुकाका लागि',
    'Trailers need a TMDB key in config.js.': 'ट्रेलरका लागि config.js मा TMDB key चाहिन्छ।',
    "I couldn't find a trailer for {title}.": '{title} को ट्रेलर भेटिएन।',
    'Playing the trailer on YouTube': 'YouTube मा ट्रेलर चल्दै',
    'Where to watch: unsure': 'कहाँ हेर्ने: पक्का छैन',
    'OK opens it · Back closes': 'OK थिच्दा खुल्छ · Back थिच्दा बन्द हुन्छ',
    'Not sure which app has {title}': '{title} कुन एपमा छ, पक्का छैन',
    'Opening {app} · search for “{title}”': '{app} खोल्दै · “{title}” खोज्नुहोस्',
    "(That app isn't on this TV.)": '(त्यो एप यो टिभीमा छैन।)',
    'The assistant needs a Claude key first. Add it to config.js on your computer, then install again.':
      'सहायकलाई पहिले Claude key चाहिन्छ। कम्प्युटरमा config.js मा राखेर फेरि install गर्नुहोस्।',
    'My Claude key was refused. Check claudeKey in config.js.': 'मेरो Claude key अस्वीकार भयो। config.js मा claudeKey जाँच्नुहोस्।',
    'Too many questions at once. Try again in a minute.': 'एकैचोटि धेरै प्रश्न भए। एक मिनेटपछि फेरि सोध्नुहोस्।',
    'The Claude account is out of credit.': 'Claude खातामा क्रेडिट सकियो।',
    "I couldn't reach Claude just now. Try again in a moment.": 'अहिले Claude सम्म पुग्न सकिनँ। केही बेरपछि फेरि प्रयास गर्नुहोस्।'
  };

  var DIGITS = '०१२३४५६७८९';
  var DAYS = ['आइतबार', 'सोमबार', 'मंगलबार', 'बुधबार', 'बिहीबार', 'शुक्रबार', 'शनिबार'];
  var MONTHS = ['जनवरी', 'फेब्रुअरी', 'मार्च', 'अप्रिल', 'मे', 'जुन', 'जुलाई', 'अगस्ट', 'सेप्टेम्बर', 'अक्टोबर', 'नोभेम्बर', 'डिसेम्बर'];

  /** Devanagari digits in Nepali; as they are in English. */
  function num(x) { return ne ? String(x).replace(/[0-9]/g, function (c) { return DIGITS.charAt(+c); }) : String(x); }

  /** The words in the TV's language, with {placeholders} filled (numbers written the TV's way). */
  function t(en, vars) {
    var s = ne && NE[en] ? NE[en] : en;
    for (var k in vars || {}) {
      if (vars.hasOwnProperty(k)) s = s.split('{' + k + '}').join(typeof vars[k] === 'number' ? num(vars[k]) : vars[k]);
    }
    return s;
  }

  function greeting(d) {
    var h = d.getHours();
    return t(h >= 4 && h < 12 ? 'Good morning' : h >= 12 && h < 17 ? 'Good afternoon' : h >= 17 && h < 21 ? 'Good evening' : 'Good night');
  }

  function day(i) { return ne ? DAYS[i] : U.DAYS[i]; }

  // In Nepali, the clock and the dates are written the Nepali way.
  U.cls(document.body, 'lang-ne', ne);
  if (ne) {
    var enTime = U.time;
    U.time = function (d) {
      var h = d.getHours(), part = h >= 4 && h < 12 ? 'बिहान' : h >= 12 && h < 17 ? 'दिउँसो' : h >= 17 && h < 20 ? 'बेलुका' : 'राति';
      return {hm: num(enTime(d).hm), ampm: part};
    };
    U.longDate = function (d) { return DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + num(d.getDate()); };
  }

  return {lang: lang, ne: ne, t: t, num: num, greeting: greeting, day: day};
})();
