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

  // Your private phone channel on ntfy.sh: open https://ntfy.sh/<channel> on your phone to send to the TV.
  // A long random name is the only lock: anyone who knows it can send to your TV. Setup makes one.
  channel: 'CHANNEL',

  // The assistant ("Hey TV, ..."): a Claude API key from console.anthropic.com. Empty = assistant off.
  // It lives on your TV, so set a monthly spending limit on it in the Claude Console.
  claudeKey: '',
  claudeModel: 'claude-haiku-5-5',

  // Movie posters for recommendations: a free TMDB key (themoviedb.org > Settings > API). Optional.
  tmdbKey: '',
  region: 'IN',               // which country's streaming catalogue to think about

  // The apps on your home screen, in order, by LG app id. Leave empty to use the TV's own list.
  apps: []
};
