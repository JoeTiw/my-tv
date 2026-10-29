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

**The Tiwari TV remote page** (`remote/`) has buttons that open the TV's apps, a "Hey TV" box (with a mic where the
phone's browser can listen), one-tap notes, photos, colors and the theme, and the TV's answers like a chat.

1. Put the page online once: on github.com, open the repository's **Settings → Pages**, choose **Deploy from a
   branch**, **main**, **/ (root)**, and save. (Pages is free for public repositories.)
2. Get your private link: `bash scripts/tv.sh phone`. Open it on your phone, then **Share → Add to Home Screen**.
   The channel is in the part after `#`, which never leaves your phone; the page remembers it and takes it out of
   the address bar.

The TV keeps a live connection to the channel, so what you send arrives in about a second.

### The helper at home: volume, buttons and more, even while Netflix is playing

LG pauses Tiwari TV while another app is in front, so for the **Remote** buttons a computer at home does the work:
it listens to your channel and talks to the TV over the home Wi-Fi (the same connection LG's ThinQ app uses).

```
bash scripts/tv.sh helper
```

Run it with the TV on: the TV asks once to allow **Tiwari TV Helper**; accept it with the remote. After that, while
this Mac is awake and on the home Wi-Fi:

- **Volume, mute, play, pause and back** from the phone, whatever is on screen;
- **Tiwari TV** brings Tiwari TV back to the front (from YouTube, Netflix, anywhere);
- the app buttons work while another app is open;
- notes pop up as a small TV notification while someone's watching something else;
- "Hey TV" while another app is open brings Tiwari TV forward to answer.

`~/.tiwari-tv/helper.log` shows what it did; `bash scripts/tv.sh helper off` stops it. Without the helper, everything
else still works; the phone page says when the helper isn't answering.

You can also send from ntfy's own page or app (`https://ntfy.sh/<your channel>`):

| Send | The TV |
|---|---|
| any text | shows it as a note |
| a photo | makes it the background |
| `Hey TV, ...` or `TV, ...` | asks the assistant |
| `/open netflix` (an app id or name) | opens that app |
| `/bg #ffb3c6` · `/bg <image link>` · `/bg off` | a color, a picture from the web, or the normal sky |
| `/theme dark` · `light` · `auto` | the look |
| `/clear` | takes the notes away |
| `/vol up` · `/vol down 3` · `/vol 20` · `/mute` | the volume (needs the helper) |
| `/key play` · `pause` · `back` · `home` | a remote button (needs the helper) |
| `/tiwari` | brings Tiwari TV to the front (needs the helper) |

Messages pass through ntfy.sh, a free public relay, and stay there for a few hours.

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
| `app/js/inbox.js` | messages from the phone (ntfy.sh, live) |
| `remote/index.html` | the phone's remote page (GitHub Pages) |
| `app/js/assistant.js` | the assistant (Claude API) and its picks (TMDB) |
| `app/js/weather.js` | weather and sunset (Open-Meteo, no key) |
| `app/js/platform.js` | the TV's apps and opening them (webOS Luna) |
| `helper/helper.mjs` | the helper at home: volume, buttons, apps and notes while other apps play (lgtv2) |
| `scripts/tv.sh` | setup, install, preview, the phone link, the helper and Developer Mode renewal |
