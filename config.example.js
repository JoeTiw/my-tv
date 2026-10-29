/*
 * Tiwari TV settings. scripts/tv.sh copies this to app/config.js the first time; edit that one.
 * app/config.js stays on your computer (it's in .gitignore): your keys never go to GitHub.
 */
window.TIWARI = {
  // Your city, for the weather and the day/night look.
  city: 'Kathmandu',
  latitude: 27.7172,
  longitude: 85.3240,
  units: 'C',                 // 'C' or 'F'
  // Your time zone (Nepal: '+05:45'). The clock uses this even when the TV itself is set to another zone.
  utcOffset: '+05:45',

  // The words on the TV: 'en' (English) or 'ne' (नेपाली). The phone page can switch it too.
  language: 'en',
  // Optional: the greeting says "Good evening, Tiwari family" (and in Nepali: शुभ सन्ध्या, तिवारी परिवार).
  familyName: '',
  familyNameNe: '',

  // Your private phone channel on ntfy.sh: open https://ntfy.sh/<channel> on your phone to send to the TV.
  // A long random name is the only lock: anyone who knows it can send to your TV. Setup makes one.
  channel: 'CHANNEL',
  // The key that seals everything on the channel (64 hex letters; setup makes it): nobody else can read your
  // messages, and the TV ignores anything not sealed with it. Your phone gets it with the link from
  // `bash scripts/tv.sh phone`. acceptPlain: true would also take unsealed messages (ntfy's own app).
  secret: 'SECRET',
  acceptPlain: false,

  // The assistant ("Hey TV, ..."): a Claude API key from console.anthropic.com. Empty = assistant off.
  // It lives on your TV, so set a monthly spending limit on it in the Claude Console.
  claudeKey: '',
  claudeModel: 'claude-haiku-5-5',
  // The assistant may look things up on the web for questions about now (about $0.01 a search). false: never.
  webSearch: true,
  country: 'NP',              // where you are, for those searches (two letters)
  // Tonight's picks above the dock (one Claude request a day). false: none.
  picks: true,

  // Movie posters for recommendations: a free TMDB key (themoviedb.org > Settings > API). Optional.
  tmdbKey: '',
  region: 'IN',               // which country's streaming catalogue to think about

  // The Nepali date under the clock in Devanagari too (कात्तिक १२, २०८३). false: in English letters only.
  nepaliScript: true,

  // Birthdays and your own days, shown as they come near (festivals are built in). Examples:
  //   {name: "Ama's birthday", bs: '05-14', birthday: true}     every year on Bhadra 14 (BS month-day)
  //   {name: "Papa's birthday", ad: '03-21', birthday: true}    every year on March 21
  //   {name: 'Trip to Pokhara', date: '2026-12-20'}             once
  // In Nepali, nameNe (and personNe for a birthday) say them in Nepali: {name: "Ama's birthday", nameNe: 'आमाको जन्मदिन', personNe: 'आमा', ...}
  events: [],

  // The photo frame starts after this many quiet minutes (when it has photos).
  frameAfter: 3,

  // The apps on your home screen, in order, by LG app id. Leave empty to use the TV's own list.
  apps: []
};
