# Tiwari TV

A glassy home screen for our LG TV, with a few things the TV can't do on its own:

- **Glass home screen:** a big clock, the date, Kathmandu's weather, and frosted-glass app tiles that glow in each app's color.
- **Notes from your phone,** from anywhere: they pop up on the TV, then wait in the corner for a day.
- **Your own background:** send a photo (or a color) from your phone. Light and dark follow the sunset, or you choose.
- **An assistant:** "Hey TV, open Netflix" or "Hey TV, something funny for the family tonight". It opens apps, or shows picks you open with OK. The answer comes back to your phone too.

![The home screen](docs/home.jpg)

![The assistant's picks](docs/assistant.jpg)

It's an LG webOS app, installed with LG's own developer tools ([`@webos-tools/cli`](https://www.npmjs.com/package/@webos-tools/cli)).

## Set it up (once)

**On the TV:** open the LG Content Store and install **Developer Mode**. Sign in with a free LG developer account
(webostv.developer.lge.com), turn on **Dev Mode Status** (the TV restarts), then turn on **Key Server**.

**On your Mac** (Node.js needed: `brew install node`):

```
git clone https://github.com/JoeTiw/my-tv.git
cd my-tv
bash scripts/tv.sh setup 192.168.1.50
```

It creates `app/config.js` for your settings, gets LG's tools, and asks for the passphrase the TV shows in Developer Mode.

**Your keys** go in `app/config.js`, which never goes to GitHub:

| Setting | What it's for | Where to get it |
|---|---|---|
| `channel` | Your private phone channel (setup makes one and prints its link) | Keep it secret: anyone who knows it can send to the TV |
| `claudeKey` | The assistant | console.anthropic.com → API keys. Set a monthly spending limit there: the key lives on the TV. |
| `tmdbKey` | Posters on the assistant's picks (optional) | themoviedb.org → Settings → API |

## Install (and after every change)

```
bash scripts/tv.sh install
```

Developer Mode lasts about 40 days, then the TV removes developer apps. Let your Mac renew it by itself:

```
bash scripts/tv.sh autorenew
```

Run it with the TV on. Your Mac then checks every hour; about every 25 days, when the TV is on and showing
Tiwari TV (so nobody's show is interrupted), it renews and brings Tiwari TV straight back. If it hasn't had a chance
by day 33, a note on the TV and your phone asks you to press **EXTEND** in Developer Mode. What it did is in
`~/.tiwari-tv/renew.log`; `bash scripts/tv.sh autorenew off` stops it.

## Use it from your phone

Open `https://ntfy.sh/<your channel>` in your phone's browser (add it to your home screen), or subscribe to the
channel in the ntfy app. Then send:

| Send | The TV |
|---|---|
| any text | shows it as a note |
| a photo | makes it the background |
| `Hey TV, ...` or `TV, ...` | asks the assistant (dictation works great) |
| `/bg #ffb3c6` · `/bg <image link>` · `/bg off` | a color, a picture from the web, or the normal sky |
| `/theme dark` · `light` · `auto` | the look |
| `/clear` | takes the notes away |

The TV checks every 15 seconds while Tiwari TV is open. Messages pass through ntfy.sh, a free public relay, and stay there for a few hours.

## On the TV

Arrows move, **OK** opens, **Back** closes the assistant or the newest note.

## Look at it on your computer

```
bash scripts/tv.sh preview
```

Then open http://localhost:8000: arrows, Enter and Escape act as the remote, and a stand-in list of apps opens nothing.

## How it's built

Plain HTML, CSS and JavaScript (ES5, for older LG TVs), no frameworks:

| File | What it does |
|---|---|
| `app/js/home.js` | clock, dock, focus and remote keys, day/night, background |
| `app/js/inbox.js` | messages from the phone (ntfy.sh) |
| `app/js/assistant.js` | the assistant (Claude API) and its picks (TMDB) |
| `app/js/weather.js` | weather and sunset (Open-Meteo, no key) |
| `app/js/platform.js` | the TV's apps and opening them (webOS Luna) |
| `scripts/tv.sh` | setup, install and preview |
