// node render.js <lang> <fps> <outDir> [onlyMs...]
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const [lang, fpsArg, outDir, ...only] = process.argv.slice(2)
const fps = Number(fpsArg)
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p))
;(async () => {
  fs.mkdirSync(outDir, { recursive: true })
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--force-device-scale-factor=1', '--hide-scrollbars'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1000, height: 620, deviceScaleFactor: 1 })
  const url = 'file:///' + path.resolve(__dirname, 'anim.html').split(path.sep).join('/') + '?lang=' + lang
  page.on('pageerror', e => { console.error('PAGE ERROR', e.message); process.exitCode = 1 })
  await page.goto(url)
  await page.evaluate(() => document.fonts.ready)
  const total = await page.evaluate(() => window.TOTAL)
  const times = only.length ? only.map(Number) : Array.from({ length: Math.round(total / 1000 * fps) }, (_, i) => (i * 1000) / fps)
  // Sequential pass so the cursor's path state builds in order, even for spot checks.
  let n = 0
  const want = new Set(times)
  const step = 1000 / fps
  const end = Math.max(...times)
  for (let t = 0; t <= end + 0.001; t += step) {
    await page.evaluate(x => window.render(x), t)
    const hit = [...want].find(w => Math.abs(w - t) < step / 2)
    if (hit !== undefined) {
      await page.screenshot({ path: path.join(outDir, only.length ? `t${Math.round(hit)}.png` : `f${String(n).padStart(4, '0')}.png`) })
      n++
    }
  }
  console.log(lang, 'total', total, 'ms, frames', n)
  await browser.close()
})()
