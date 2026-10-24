// node build.js [en|ru|all] [fps]
// Renders anim.html frame by frame (render.js), builds the GIF with ffmpeg and puts it in ../../assets.
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const which = process.argv[2] || 'all'
const fps = process.argv[3] || '25'
const langs = which === 'all' ? ['en', 'ru'] : [which]
const assets = path.resolve(__dirname, '..', '..', 'assets')

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts })

for (const lang of langs) {
  const frames = path.join(__dirname, `frames-${lang}`)
  fs.rmSync(frames, { recursive: true, force: true })
  run(process.execPath, [path.join(__dirname, 'render.js'), lang, fps, frames])

  const palette = path.join(__dirname, `palette-${lang}.png`)
  const out = path.join(assets, `demo-${lang}.gif`)
  const input = ['-framerate', fps, '-i', path.join(frames, 'f%04d.png')]
  run('ffmpeg', ['-loglevel', 'error', '-y', ...input, '-vf', 'palettegen=max_colors=128:stats_mode=diff', palette])
  run('ffmpeg', ['-loglevel', 'error', '-y', ...input, '-i', palette, '-lavfi', 'paletteuse=dither=none:diff_mode=rectangle', '-loop', '0', out])

  fs.rmSync(frames, { recursive: true, force: true })
  fs.rmSync(palette, { force: true })
  console.log(`${out}: ${(fs.statSync(out).size / 1e6).toFixed(2)} MB`)
}
