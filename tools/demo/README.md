# Demo GIF

Builds `assets/demo-en.gif` and `assets/demo-ru.gif`, the animated demo at the top of the README.

- `anim.html` — the whole animation: `render(t)` draws the frame at any moment `t` (ms). Scenes, easing, texts for both languages live here; open it in a browser with `?lang=ru&t=15000` to look at one moment.
- `render.js` — opens `anim.html` in headless Edge through `puppeteer-core` and screenshots every frame.
- `build.js` — renders the frames, builds the GIF with `ffmpeg` and writes it to `assets/`.

## Build

Needs Node.js, Microsoft Edge and `ffmpeg` on `PATH`.

```
cd tools/demo
npm install
node build.js all      # or: node build.js en / node build.js ru
```

About 4 minutes per language at 25 fps (the demo runs 115 s).

`social.html` is the repository's social preview (`assets/social-preview.png`, 1280×640): open it in a browser at that size and take a screenshot, or `chrome --headless --window-size=1280,640 --screenshot=social-preview.png social.html`.

---

# Демо-гифка

Собирает `assets/demo-en.gif` и `assets/demo-ru.gif` — анимацию в начале README.

- `anim.html` — вся анимация: `render(t)` рисует кадр на любой момент `t` (мс). Сцены, кривые ускорения и тексты на двух языках — здесь; открой в браузере с `?lang=ru&t=15000`, чтобы посмотреть один момент.
- `render.js` — открывает `anim.html` в Edge без окна через `puppeteer-core` и снимает каждый кадр.
- `build.js` — рендерит кадры, собирает GIF через `ffmpeg` и кладёт в `assets/`.

Нужны Node.js, Microsoft Edge и `ffmpeg` в `PATH`. Сборка: `cd tools/demo`, `npm install`, `node build.js all`. Около 4 минут на язык при 25 fps (демо идёт 115 с).

`social.html` — картинка репозитория для соцсетей (`assets/social-preview.png`, 1280×640): открой в браузере этого размера и сделай скриншот или `chrome --headless --window-size=1280,640 --screenshot=social-preview.png social.html`.
