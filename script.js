// ── CONSTANTS ──────────────────────────────────────────────────
const FORMATS = {
  post:  { w: 1080, h: 1440 },
  story: { w: 1080, h: 1920 },
  wide:  { w: 1920, h: 1080 },
}

const PALETTE_COLORS = ['#4A60FF', '#CEFF00', '#FF3EBA', '#31A362', '#F7F6EB', '#141414']

// Fonts in Font/ folder.
// family = font-family name (used in fontStack/fontStr).
// file   = path relative to index.html.
// label  = display name in the select.
const BUNDLED_FONTS = [
  { family: 'PPFrama-ExtraboldItalic', label: 'PP Frama Extrabold Italic', file: 'Font/PPFrama-ExtraboldItalic.otf' },
  { family: 'PPFrama-Regular',         label: 'PP Frama Regular',           file: 'Font/PPFrama-Regular.otf' },
]

const FONT_FALLBACK = "Impact, 'Arial Black', sans-serif"

// ── EASING ─────────────────────────────────────────────────────
function applyEasing(p, type) {
  p = Math.max(0, Math.min(1, p))
  switch (type) {
    case 'linear':    return p
    case 'easeIn':    return p * p
    case 'easeOut':   return p * (2 - p)
    case 'easeInOut': return p < 0.5 ? 2*p*p : -1+(4-2*p)*p
    case 'elastic':   return p === 0 ? 0 : p === 1 ? 1 : Math.pow(2,-10*p)*Math.sin((p*10-0.75)*(2*Math.PI/3))+1
    case 'bounce': {
      if (p < 1/2.75)   return 7.5625*p*p
      if (p < 2/2.75)   { p -= 1.5/2.75;  return 7.5625*p*p+0.75 }
      if (p < 2.5/2.75) { p -= 2.25/2.75; return 7.5625*p*p+0.9375 }
      p -= 2.625/2.75;  return 7.5625*p*p+0.984375
    }
    case 'back': {
      const c1 = 1.70158, c3 = c1 + 1
      return c3*p*p*p - c1*p*p
    }
    case 'sharp': return p < 0.15 ? p/0.15 : 1
    default:      return p
  }
}

// ── STATE ──────────────────────────────────────────────────────
const S = {
  format: 'post',
  text: 'DESIGN BOMB!!!',
  align: 'left',
  tileMode: 'single',
  reps: 3,
  wordGap: 60,
  direction: 'down',
  kerning: 0,
  lineHeight: 1.0,
  gapV: 0,
  speed: 2.0,
  fps: 60,
  paddingL: 0,
  paddingR: 0,
  bgColor: '#141414',
  textColor: '#F7F6EB',
  image: null,
  imgScale: 1.0,
  imgOpacity: 1.0,
  scrollY: 0,
  fontSize: 100,
  currentFont: 'PPFrama-ExtraboldItalic', // initial; overwritten once fonts load
  fontLoaded: false,
  paletteTarget: 'bg',
  autoEffect: 'none',
  autoDelay: 1000,
  autoForce: 5.0,
  effectDuration: 600,
  easingIn: 'easeInOut',
  easingOut: 'easeInOut',
  tremolio: false,
  tremolioForce: 3.0,
  tremolioSpeed: 1.0,
  frameCount: 0,
  // Lottie
  lotties: [],        // [{ anim, container, label, animW, animH, xPct, yPct, scale, opacity }]
  activeLottieIdx: -1,
  // Composizione
  globalScale: 1.0,
  compPadL: 0,
  compPadR: 0,
  compPadT: 0,
  compPadB: 0,
  bgCornerRadius: 0,
  imgCornerRadius: 0,
}

let lastAutoTriggerTime = -Infinity
const loadedFonts = []   // { family, label }
let uploadedFontCount = 0

// ── CANVAS ─────────────────────────────────────────────────────
const canvas = document.getElementById('canvas')
const ctx    = canvas.getContext('2d')

const mCv  = document.createElement('canvas')
mCv.width  = 4000; mCv.height = 300
const mCtx = mCv.getContext('2d')

function fontStack() { return `'${S.currentFont}', ${FONT_FALLBACK}` }
function fontStr(size) { return `900 italic ${size}px ${fontStack()}` }

function setFormat(fmt) {
  S.format = fmt
  const { w, h } = FORMATS[fmt]
  canvas.width = w; canvas.height = h
  document.getElementById('fmt-badge').textContent = `${w} × ${h}`
  document.querySelectorAll('.fmt-btn').forEach(b => b.classList.toggle('active', b.dataset.fmt === fmt))
  recalcFont()
}

// ── FONT CALC ──────────────────────────────────────────────────
function measureAt(text, size) {
  mCtx.font = fontStr(size)
  if ('letterSpacing' in mCtx) mCtx.letterSpacing = S.kerning + 'px'
  const m = mCtx.measureText(text)
  const hasB = typeof m.actualBoundingBoxLeft === 'number'
  return {
    visualW:     hasB ? m.actualBoundingBoxLeft + m.actualBoundingBoxRight : m.width,
    leftBearing: hasB ? m.actualBoundingBoxLeft  : 0,
    rightExtent: hasB ? m.actualBoundingBoxRight : m.width,
    advanceW:    m.width,
  }
}

function measureCtx(context, text, size) {
  context.font = fontStr(size)
  if ('letterSpacing' in context) context.letterSpacing = S.kerning + 'px'
  const m    = context.measureText(text)
  const hasB = typeof m.actualBoundingBoxLeft === 'number'
  return {
    visualW:  hasB ? m.actualBoundingBoxLeft + m.actualBoundingBoxRight : m.width,
    advanceW: m.width,
  }
}

function recalcFont() {
  const { w }  = FORMATS[S.format]
  const availW = w - S.paddingL - S.paddingR - S.compPadL - S.compPadR
  if (availW <= 0) return

  const lines = getLines()
  const BASE  = 100
  const SAFE  = 0.995

  if (S.tileMode === 'grid') {
    const maxAdv = Math.max(...lines.map(l => measureAt(l || 'M', BASE).advanceW))
    const N      = Math.max(1, S.reps)
    const avail  = availW - N * S.wordGap
    S.fontSize   = avail > 5 ? BASE * avail / (N * maxAdv) * SAFE : 5
  } else {
    const maxVis = Math.max(...lines.map(l => measureCtx(ctx, l || 'M', BASE).visualW))
    S.fontSize   = maxVis > 0 ? BASE * availW / maxVis * SAFE : BASE

    ctx.font = fontStr(S.fontSize)
    if ('letterSpacing' in ctx) ctx.letterSpacing = S.kerning + 'px'
    const actualMax = Math.max(...lines.map(l => {
      const m = ctx.measureText(l || 'M')
      const hasB = typeof m.actualBoundingBoxLeft === 'number'
      return hasB ? m.actualBoundingBoxLeft + m.actualBoundingBoxRight : m.width
    }))
    if (actualMax > availW) S.fontSize *= (availW / actualMax) * SAFE
  }
}

function getLines() {
  const ls = S.text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  return ls.length > 0 ? ls : ['']
}

// ── ROW / BLOCK HEIGHT ─────────────────────────────────────────
function rowH()    { return S.fontSize * S.lineHeight }
function blockH(n) { return n * rowH() + S.gapV }

// ── DRAW ───────────────────────────────────────────────────────
function roundedRect(context, x, y, rw, rh, r) {
  if (r <= 0) { context.fillRect(x, y, rw, rh); return }
  context.beginPath()
  context.roundRect(x, y, rw, rh, r)
  context.fill()
}

function drawFrame(simNow) {
  const { w, h } = FORMATS[S.format]
  const availW   = w - S.paddingL - S.paddingR

  // Outer background — always #141414, full canvas, optional corner radius
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#141414'
  ctx.fillRect(0, 0, w, h)

  // Apply global scale centered
  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.scale(S.globalScale, S.globalScale)
  ctx.translate(-w / 2, -h / 2)

  // Clip to logical canvas bounds — prevents tile/text overflow outside inner frame
  ctx.beginPath()
  ctx.rect(0, 0, w, h)
  ctx.clip()

  // Inner background (S.bgColor) with padding + optional corner radius + clip
  const iw = w - S.compPadL - S.compPadR
  const ih = h - S.compPadT - S.compPadB
  ctx.save()
  ctx.fillStyle = S.bgColor
  if (S.bgCornerRadius > 0) {
    ctx.beginPath()
    ctx.roundRect(S.compPadL, S.compPadT, iw, ih, S.bgCornerRadius)
    ctx.fill()
    ctx.clip()
  } else {
    ctx.fillRect(S.compPadL, S.compPadT, iw, ih)
    ctx.beginPath()
    ctx.rect(S.compPadL, S.compPadT, iw, ih)
    ctx.clip()
  }

  const now = simNow !== undefined ? simNow : performance.now()
  S.frameCount++

  if (S.autoEffect !== 'none' && (now - lastAutoTriggerTime > S.autoDelay)) {
    lastAutoTriggerTime += S.autoDelay
    if (now - lastAutoTriggerTime > S.autoDelay) lastAutoTriggerTime = now
  }
  const timeSinceKick = now - lastAutoTriggerTime

  // Bell envelope with configurable easing in/out
  let effectIntensity = 0
  if (S.autoEffect !== 'none' && timeSinceKick < S.effectDuration) {
    const p = timeSinceKick / S.effectDuration
    let env
    if (p < 0.5) {
      env = applyEasing(p * 2, S.easingIn)
    } else {
      env = 1 - applyEasing((p - 0.5) * 2, S.easingOut)
    }
    effectIntensity = Math.max(0, env)
  }

  // ── TEXT ENGINE ────────────────────────────────────────────
  const drawTextWithEffect = (text, startX, startY, bi, li, xi) => {
    const needPerChar = S.autoEffect !== 'none' || S.tremolio
    if (!needPerChar) {
      ctx.fillText(text, startX, startY)
      return
    }

    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (ch === ' ') continue

      const prefix      = text.substring(0, i)
      const charStartX  = startX + (i > 0 ? ctx.measureText(prefix).width : 0)
      const cw          = ctx.measureText(ch).width
      const charCenterX = charStartX + cw / 2

      const seed = bi * 997 + li * 101 + xi * 11 + i + 1
      const r1   = Math.abs(Math.sin(seed * 127.1 + 1.3))
      const r2   = Math.abs(Math.sin(seed * 311.7 + 2.7))
      const r1n  = r1 - 0.5
      const r2n  = r2 - 0.5

      const force = S.autoForce * 10 * effectIntensity

      let dx = 0, dy = 0, rot = 0, sx = 1, sy = 1, alpha = 1
      let customDraw = false

      switch (S.autoEffect) {
        // ── original 4 ────────────────────────────────────
        case 'explode': {
          const dirX = charCenterX - w/2, dirY = startY - h/2
          const dist = Math.sqrt(dirX*dirX + dirY*dirY) || 1
          dx  = (dirX/dist) * force * (0.5 + r1)
          dy  = (dirY/dist) * force * (0.5 + r2)
          rot = r1n * effectIntensity * (S.autoForce / 5)
          break
        }
        case 'glitch': {
          dx = r1n * force
          dy = r2n * force * 0.3
          break
        }
        case 'wave': {
          dy = Math.sin(charCenterX * 0.015 + now * 0.003) * force
          break
        }
        case 'vortex': {
          const dirX = charCenterX - w/2, dirY = startY - h/2
          dx  = -dirY * 0.05 * force
          dy  =  dirX * 0.05 * force
          rot = effectIntensity * (S.autoForce / 10)
          break
        }
        // ── new 10 ────────────────────────────────────────
        case 'bounce': {
          const stagger = (charCenterX / w) * 0.4
          dy = -Math.abs(Math.sin((now * 0.01 + stagger) * Math.PI)) * force * 2
          break
        }
        case 'scatter': {
          dx    = r1n * S.fontSize * effectIntensity * (S.autoForce / 3)
          dy    = r2n * S.fontSize * effectIntensity * (S.autoForce / 3)
          alpha = 1 - effectIntensity * 0.6
          break
        }
        case 'shake': {
          dx = Math.sin(now * 0.08 + i * 37.1) * S.autoForce * 5 * effectIntensity
          dy = Math.sin(now * 0.11 + i * 13.7) * S.autoForce * 3 * effectIntensity
          break
        }
        case 'spin': {
          const dir = r1 > 0.5 ? 1 : -1
          rot = effectIntensity * Math.PI * 2 * (S.autoForce / 5) * dir
          break
        }
        case 'float': {
          dy    = -(r1 * 0.5 + 0.5) * force * 2
          alpha = Math.max(0, 1 - effectIntensity * 1.5)
          break
        }
        case 'rain': {
          dy    = (1 - effectIntensity) * h * 0.4 * (r1 * 0.5 + 0.5)
          alpha = effectIntensity
          break
        }
        case 'zoom': {
          const zf = 1 + effectIntensity * (S.autoForce / 4)
          sx = zf; sy = zf
          break
        }
        case 'chromatic': {
          customDraw = true
          const off        = effectIntensity * S.autoForce * 4
          const savedAlpha = ctx.globalAlpha
          const savedFill  = ctx.fillStyle
          ctx.globalAlpha  = savedAlpha * 0.65
          ctx.fillStyle    = '#ff3333'
          ctx.save(); ctx.translate(charCenterX - off, startY); ctx.fillText(ch, -cw/2, 0); ctx.restore()
          ctx.fillStyle    = '#33ffff'
          ctx.save(); ctx.translate(charCenterX + off, startY); ctx.fillText(ch, -cw/2, 0); ctx.restore()
          ctx.globalAlpha  = savedAlpha
          ctx.fillStyle    = savedFill
          ctx.save(); ctx.translate(charCenterX, startY); ctx.fillText(ch, -cw/2, 0); ctx.restore()
          break
        }
        case 'cascade': {
          const delay    = (charCenterX / w) * 0.5
          const localEff = Math.max(0, effectIntensity - delay)
          dy = -Math.sin(localEff * Math.PI) * force * 2
          break
        }
        case 'flicker': {
          alpha = Math.random() > effectIntensity * 0.85 ? 1 : 0
          break
        }
      }

      // Tremolio — continuous per-character oscillation
      if (S.tremolio) {
        const t = now * S.tremolioSpeed * 0.008
        dx += Math.sin(t + seed * 2.399) * S.tremolioForce
        dy += Math.cos(t + seed * 1.618) * S.tremolioForce
      }

      if (!customDraw) {
        ctx.save()
        if (alpha !== 1) ctx.globalAlpha = Math.max(0, alpha)
        ctx.translate(charCenterX + dx, startY + dy)
        ctx.rotate(rot)
        if (sx !== 1 || sy !== 1) ctx.scale(sx, sy)
        ctx.fillText(ch, -cw / 2, 0)
        ctx.restore()
      }
    }
  }

  if (availW > 0) {
    ctx.fillStyle    = S.textColor
    ctx.font         = fontStr(S.fontSize)
    ctx.textBaseline = 'top'
    ctx.textAlign    = 'left'
    if ('letterSpacing' in ctx) ctx.letterSpacing = S.kerning + 'px'

    const lines = getLines()
    const rh    = rowH()
    const bh    = blockH(lines.length)

    const scrollOffset = S.direction === 'down' ? S.scrollY : -S.scrollY
    const phase     = ((scrollOffset % bh) + bh) % bh
    const numBlocks = Math.ceil(h / bh) + 2

    for (let bi = 0; bi < numBlocks; bi++) {
      const blockY = -phase + bi * bh
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li]
        const y    = blockY + li * rh

        const m    = ctx.measureText(line)
        const hasB = typeof m.actualBoundingBoxLeft === 'number'
        const lb   = hasB ? m.actualBoundingBoxLeft  : 0
        const re   = hasB ? m.actualBoundingBoxRight : m.width

        if (S.tileMode === 'grid') {
          const N    = Math.max(1, S.reps)
          const unit = m.width + S.wordGap
          for (let xi = 0; xi < N; xi++) {
            drawTextWithEffect(line, S.paddingL + xi * unit, y, bi, li, xi)
          }
        } else {
          let drawX
          if (S.align === 'left')       drawX = S.paddingL + lb
          else if (S.align === 'right') drawX = S.paddingL + availW - re
          else                          drawX = S.paddingL + availW / 2 - (re - lb) / 2
          drawTextWithEffect(line, drawX, y, bi, li, 0)
        }
      }
    }
  }

  // Image overlay
  if (S.image) {
    const img = S.image
    const fit = Math.min(w * 0.7 / img.width, h * 0.7 / img.height) * S.imgScale
    const iw  = img.width  * fit
    const ih  = img.height * fit
    const ix  = (w - iw) / 2
    const iy  = (h - ih) / 2
    ctx.save()
    ctx.globalAlpha = S.imgOpacity
    if (S.imgCornerRadius > 0) {
      ctx.beginPath()
      ctx.roundRect(ix, iy, iw, ih, S.imgCornerRadius)
      ctx.clip()
    }
    ctx.drawImage(img, ix, iy, iw, ih)
    ctx.restore()
  }

  ctx.restore() // end inner bg clip

  // Lottie overlays (outside clip so they can overflow rounded bg if needed)
  for (const l of S.lotties) {
    const lc = l.container.querySelector('canvas')
    if (!lc || lc.width === 0) continue
    const outW  = l.animW * l.scale
    const outH  = l.animH * l.scale
    const cx    = (l.xPct / 100) * w
    const cy    = (l.yPct / 100) * h
    ctx.save()
    ctx.globalAlpha = l.opacity
    ctx.translate(cx, cy)
    ctx.rotate((l.rotation || 0) * Math.PI / 180)
    ctx.drawImage(lc, -outW / 2, -outH / 2, outW, outH)
    ctx.restore()
  }

  ctx.restore() // end global scale transform

  S.scrollY += S.speed
}

// ── ANIMATION LOOP ─────────────────────────────────────────────
let isPaused = false
function loop() { if (!isPaused) drawFrame(); requestAnimationFrame(loop) }

// ── FONT SYSTEM ────────────────────────────────────────────────
function setFontStatus(msg, color) {
  const el = document.getElementById('font-status-msg')
  if (el) { el.textContent = msg; el.style.color = color || '#737373' }
}

function addFontToSelect(family, label) {
  if (loadedFonts.find(f => f.family === family)) return // no duplicates
  loadedFonts.push({ family, label })
  const sel = document.getElementById('font-select')
  const opt = document.createElement('option')
  opt.value = family
  opt.textContent = label
  sel.appendChild(opt)
}

// Step 1: inject @font-face for BUNDLED_FONTS (weight 900 italic so fontStr() matches)
BUNDLED_FONTS.forEach(f => {
  const s = document.createElement('style')
  s.textContent = `@font-face{font-family:'${f.family}';src:url('${f.file}');font-weight:900;font-style:italic;}`
  document.head.appendChild(s)
})

// Step 2: explicitly load each bundled font, then populate select
Promise.all(
  BUNDLED_FONTS.map(f =>
    document.fonts.load(`900 italic 12px '${f.family}'`).catch(() => [])
  )
).then(() => {
  BUNDLED_FONTS.forEach(f => {
    if (document.fonts.check(`900 italic 12px '${f.family}'`)) {
      addFontToSelect(f.family, f.label)
    }
  })

  if (loadedFonts.length > 0) {
    const match = loadedFonts.find(f => f.family === S.currentFont) || loadedFonts[0]
    S.currentFont = match.family
    S.fontLoaded  = true
    setFontStatus(match.label + ' caricato', '#31A362')
    document.getElementById('font-select').value = S.currentFont
    recalcFont()
  } else {
    setFontStatus('Nessun font trovato — carica manualmente', '#F0C500')
  }
})

document.getElementById('font-select').addEventListener('change', e => {
  S.currentFont = e.target.value
  recalcFont()
})

// Manual upload via drag-drop
const fontZone  = document.getElementById('font-zone')
const fontInput = document.getElementById('font-input')
fontZone.addEventListener('click', () => fontInput.click())
fontZone.addEventListener('dragover',  e => { e.preventDefault(); fontZone.classList.add('drag') })
fontZone.addEventListener('dragleave', ()  => fontZone.classList.remove('drag'))
fontZone.addEventListener('drop', e => {
  e.preventDefault(); fontZone.classList.remove('drag')
  handleFontFile(e.dataTransfer.files[0])
})
fontInput.addEventListener('change', () => { handleFontFile(fontInput.files[0]); fontInput.value = '' })

async function handleFontFile(file) {
  if (!file) return
  if (!['.ttf','.otf','.woff','.woff2'].some(e => file.name.toLowerCase().endsWith(e))) return
  try {
    const familyName = `uploaded-font-${uploadedFontCount++}`
    // Descriptors must match fontStr() which always requests '900 italic'
    const face = new FontFace(familyName, await file.arrayBuffer(), { weight: '900', style: 'italic' })
    await face.load()
    document.fonts.add(face)
    const label = file.name.replace(/\.[^.]+$/, '')
    addFontToSelect(familyName, label)
    document.getElementById('font-select').value = familyName
    S.currentFont = familyName
    S.fontLoaded  = true
    setFontStatus(`${label} caricato`, '#31A362')
    recalcFont()
  } catch (err) {
    console.error('Font load error:', err)
    setFontStatus('Errore caricamento font', '#FF3EBA')
  }
}

// ── CONTROLS ───────────────────────────────────────────────────
function bindRange(id, key, valId, parse) {
  const el = document.getElementById(id)
  const ve = document.getElementById(valId)
  el.addEventListener('input', () => {
    S[key] = parse(el.value)
    const v = parseFloat(el.value)
    ve.textContent = Number.isInteger(v) ? v : v.toFixed(parseFloat(el.step) < 0.1 ? 2 : 1)
    recalcFont()
  })
}

bindRange('reps',           'reps',           'reps-v',           v => parseInt(v))
bindRange('wgap',           'wordGap',        'wgap-v',           v => parseFloat(v))
bindRange('kerning',        'kerning',        'kerning-v',        v => parseFloat(v))
bindRange('lh',             'lineHeight',     'lh-v',             v => parseFloat(v))
bindRange('gapv',           'gapV',           'gapv-v',           v => parseFloat(v))
bindRange('speed',          'speed',          'speed-v',          v => parseFloat(v))
bindRange('pad-l',          'paddingL',       'pad-l-v',          v => parseInt(v))
bindRange('pad-r',          'paddingR',       'pad-r-v',          v => parseInt(v))
bindRange('img-scale',           'imgScale',           'img-scale-v',           v => parseFloat(v))
bindRange('img-opacity',         'imgOpacity',         'img-opacity-v',         v => parseFloat(v))
bindRange('img-corner-radius',   'imgCornerRadius',    'img-corner-radius-v',   v => parseInt(v))
bindRange('global-scale',        'globalScale',        'global-scale-v',        v => parseFloat(v))
document.getElementById('comp-pad-all').addEventListener('input', function () {
  const v = parseInt(this.value)
  S.compPadL = S.compPadR = S.compPadT = S.compPadB = v
  document.getElementById('comp-pad-all-v').textContent = v
  recalcFont()
})
bindRange('bg-corner-radius',    'bgCornerRadius',     'bg-corner-radius-v',    v => parseInt(v))
bindRange('duration',       '_dur',           'duration-v',       v => parseInt(v))
bindRange('fps',            'fps',            'fps-v',            v => parseInt(v))
bindRange('autoDelay',      'autoDelay',      'autoDelay-v',      v => parseInt(v))
bindRange('autoForce',      'autoForce',      'autoForce-v',      v => parseFloat(v))
bindRange('effectDuration', 'effectDuration', 'effectDuration-v', v => parseInt(v))

document.getElementById('tremolio-toggle').addEventListener('click', function () {
  S.tremolio = !S.tremolio
  this.textContent = S.tremolio ? 'ON' : 'OFF'
  this.classList.toggle('border-[#CEFF00]', S.tremolio)
  this.classList.toggle('text-[#CEFF00]', S.tremolio)
  document.getElementById('tremolio-controls').style.display = S.tremolio ? 'flex' : 'none'
  document.getElementById('tremolio-controls').style.flexDirection = 'column'
})
bindRange('tremolio-force', 'tremolioForce', 'tremolio-force-v', v => parseFloat(v))
bindRange('tremolio-speed', 'tremolioSpeed', 'tremolio-speed-v', v => parseFloat(v))

document.getElementById('autoEffect').addEventListener('change', e => { S.autoEffect = e.target.value })
document.getElementById('easingIn').addEventListener('change',   e => { S.easingIn   = e.target.value })
document.getElementById('easingOut').addEventListener('change',  e => { S.easingOut  = e.target.value })

document.querySelectorAll('.speed-preset').forEach(btn => {
  btn.addEventListener('click', () => {
    S.effectDuration = parseInt(btn.dataset.ms)
    document.getElementById('effectDuration').value = S.effectDuration
    document.getElementById('effectDuration-v').textContent = S.effectDuration
    document.querySelectorAll('.speed-preset').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
  })
})

document.getElementById('text-input').addEventListener('input', e => {
  S.text = e.target.value || 'A'; recalcFont()
})

document.querySelectorAll('.fmt-btn').forEach(b =>
  b.addEventListener('click', () => setFormat(b.dataset.fmt))
)

document.querySelectorAll('.tog-btn').forEach(b => {
  b.addEventListener('click', () => {
    S.tileMode = b.dataset.mode
    document.querySelectorAll('.tog-btn').forEach(x => x.classList.remove('active'))
    b.classList.add('active')
    document.getElementById('grid-controls').style.display = S.tileMode === 'grid' ? 'flex' : 'none'
    recalcFont()
  })
})

document.querySelectorAll('.align-btn').forEach(b => {
  b.addEventListener('click', () => {
    S.align = b.dataset.align
    document.querySelectorAll('.align-btn').forEach(x => x.classList.remove('active'))
    b.classList.add('active')
  })
})

document.querySelectorAll('.dir-btn').forEach(b => {
  b.addEventListener('click', () => {
    S.direction = b.dataset.dir
    document.querySelectorAll('.dir-btn').forEach(x => x.classList.remove('active'))
    b.classList.add('active')
  })
})

// Colors — palette only, no free picker
function updateColor(target, hex) {
  if (target === 'bg') {
    S.bgColor = hex
    document.getElementById('bg-dot').style.background = hex
    document.getElementById('bg-hex').textContent      = hex.toUpperCase()
  } else {
    S.textColor = hex
    document.getElementById('text-dot').style.background = hex
    document.getElementById('text-hex').textContent      = hex.toUpperCase()
  }
}
document.querySelectorAll('.color-target').forEach(el => {
  el.addEventListener('click', () => {
    S.paletteTarget = el.dataset.target
    document.querySelectorAll('.color-target').forEach(t => t.classList.remove('selected'))
    el.classList.add('selected')
  })
})
PALETTE_COLORS.forEach(c => {
  const el = document.createElement('div')
  el.className = 'flex-1 h-8 rounded-md cursor-pointer border-2 border-transparent transition-all hover:scale-105 hover:border-white/60'
  el.style.background = c
  el.title = c
  el.addEventListener('click', () => updateColor(S.paletteTarget, c))
  document.getElementById('palette').appendChild(el)
})
updateColor('bg',   S.bgColor)
updateColor('text', S.textColor)

// Image
const uploadZone = document.getElementById('upload-zone')
const fileInput  = document.getElementById('file-input')
uploadZone.addEventListener('click', () => fileInput.click())
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('border-neutral-500', 'text-neutral-400') })
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('border-neutral-500', 'text-neutral-400'))
uploadZone.addEventListener('drop', e => {
  e.preventDefault()
  uploadZone.classList.remove('border-neutral-500', 'text-neutral-400')
  handleImageFile(e.dataTransfer.files[0])
})
fileInput.addEventListener('change', () => { handleImageFile(fileInput.files[0]); fileInput.value = '' })

function handleImageFile(file) {
  if (!file?.type.startsWith('image/')) return
  const reader = new FileReader()
  reader.onload = e => {
    const img = new Image()
    img.onload = () => {
      S.image = img
      document.getElementById('img-thumb').src                       = e.target.result
      document.getElementById('img-thumb').style.display             = 'block'
      document.getElementById('img-scale-row').style.display         = 'grid'
      document.getElementById('img-opacity-row').style.display       = 'grid'
      document.getElementById('img-corner-radius-row').style.display = 'grid'
      document.getElementById('remove-img').style.display            = 'block'
    }
    img.src = e.target.result
  }
  reader.readAsDataURL(file)
}
document.getElementById('remove-img').addEventListener('click', () => {
  S.image = null
  ;['img-thumb','img-scale-row','img-opacity-row','img-corner-radius-row','remove-img'].forEach(id => {
    document.getElementById(id).style.display = 'none'
  })
})

// ── LOTTIE ─────────────────────────────────────────────────────
let draggingLottieIdx = -1, lDragOffX = 0, lDragOffY = 0

function setLottieStatus(msg, color) {
  const el = document.getElementById('lottie-status')
  if (el) { el.textContent = msg; el.style.color = color || '#737373' }
}

function setActiveLottie(idx) {
  S.activeLottieIdx = idx
  document.querySelectorAll('.lottie-item').forEach((el, i) =>
    el.classList.toggle('lottie-active', i === idx)
  )
  const ctrl = document.getElementById('lottie-controls')
  if (idx >= 0) { ctrl.classList.remove('hidden'); syncLottieSliders() }
  else            ctrl.classList.add('hidden')
}

function syncLottieSliders() {
  const l = S.lotties[S.activeLottieIdx]
  if (!l) return
  const set = (id, v, dec) => {
    document.getElementById(id).value = v
    document.getElementById(id + '-v').textContent = dec != null ? v.toFixed(dec) : v
  }
  set('lottie-x',        l.xPct,     0)
  set('lottie-y',        l.yPct,     0)
  set('lottie-scale',    l.scale,    2)
  set('lottie-opacity',  l.opacity,  2)
  document.getElementById('lottie-rotation').value = l.rotation
  document.getElementById('lottie-rotation-v').textContent = l.rotation + '°'
}

function rebuildLottieList() {
  const list = document.getElementById('lottie-list')
  list.innerHTML = ''
  S.lotties.forEach((l, i) => {
    const item = document.createElement('div')
    item.className = 'lottie-item flex items-center gap-2 p-2 bg-neutral-800 border border-neutral-700 rounded-md cursor-pointer transition-colors hover:bg-neutral-700'
    item.dataset.idx = i
    item.innerHTML = `<span class="flex-1 text-xs truncate text-neutral-300">${l.label}</span><button class="lottie-remove shrink-0 text-neutral-500 hover:text-red-400 text-xs px-1 transition-colors" data-idx="${i}">✕</button>`
    item.addEventListener('click', e => { if (!e.target.classList.contains('lottie-remove')) setActiveLottie(i) })
    item.querySelector('.lottie-remove').addEventListener('click', e => { e.stopPropagation(); removeLottie(i) })
    list.appendChild(item)
  })
  if (S.activeLottieIdx >= 0) {
    const items = document.querySelectorAll('.lottie-item')
    if (items[S.activeLottieIdx]) items[S.activeLottieIdx].classList.add('lottie-active')
  }
}

function removeLottie(idx) {
  S.lotties[idx].anim.destroy()
  S.lotties[idx].container.remove()
  S.lotties.splice(idx, 1)
  if (S.activeLottieIdx >= idx) S.activeLottieIdx = Math.max(-1, S.activeLottieIdx - 1)
  rebuildLottieList()
  setActiveLottie(S.activeLottieIdx)
}

async function loadLottieJSON(file) {
  // Guard: lottie global from CDN
  if (typeof lottie === 'undefined') {
    setLottieStatus('Lottie non disponibile — controlla connessione', '#FF3EBA')
    return
  }
  let data
  try { data = JSON.parse(await file.text()) }
  catch { setLottieStatus('JSON non valido: ' + file.name, '#FF3EBA'); return }

  const animW = data.w || 400
  const animH = data.h || 400

  const container = document.createElement('div')
  container.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${animW}px;height:${animH}px;pointer-events:none;overflow:hidden;`
  document.body.appendChild(container)

  const anim = lottie.loadAnimation({
    container,
    renderer:      'canvas',
    loop:          true,
    autoplay:      true,
    animationData: data,
  })

  anim.addEventListener('error', () => setLottieStatus('Errore animazione: ' + file.name, '#FF3EBA'))

  const label = file.name.replace(/\.json$/i, '')
  S.lotties.push({ anim, container, label, animW, animH, xPct: 50, yPct: 50, scale: 1.0, opacity: 1.0, rotation: 0 })
  rebuildLottieList()
  setActiveLottie(S.lotties.length - 1)
  setLottieStatus(label + ' caricato', '#31A362')
}

// Lottie upload
const lottieZone  = document.getElementById('lottie-zone')
const lottieInput = document.getElementById('lottie-input')
lottieZone.addEventListener('click', () => lottieInput.click())
lottieZone.addEventListener('dragover',  e => { e.preventDefault(); lottieZone.classList.add('border-neutral-500') })
lottieZone.addEventListener('dragleave', ()  => lottieZone.classList.remove('border-neutral-500'))
lottieZone.addEventListener('drop', e => {
  e.preventDefault(); lottieZone.classList.remove('border-neutral-500')
  Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.json')).forEach(loadLottieJSON)
})
lottieInput.addEventListener('change', () => {
  Array.from(lottieInput.files).forEach(loadLottieJSON)
  lottieInput.value = ''
})

// Lottie preset select — populated via server /api/lotties
async function loadLottieFromURL(url, label) {
  if (typeof lottie === 'undefined') {
    setLottieStatus('Lottie non disponibile — controlla connessione', '#FF3EBA')
    return
  }
  let data
  try {
    const res = await fetch(url)
    data = await res.json()
  } catch {
    setLottieStatus('Errore caricamento: ' + label, '#FF3EBA')
    return
  }

  const animW = data.w || 400
  const animH = data.h || 400
  const container = document.createElement('div')
  container.style.cssText = 'position:absolute;left:-9999px;top:-9999px;pointer-events:none;'
  container.style.width  = animW + 'px'
  container.style.height = animH + 'px'
  document.body.appendChild(container)

  const anim = lottie.loadAnimation({
    container,
    renderer:      'canvas',
    loop:          true,
    autoplay:      true,
    animationData: data,
  })

  anim.addEventListener('error', () => setLottieStatus('Errore animazione: ' + label, '#FF3EBA'))

  S.lotties.push({ anim, container, label, animW, animH, xPct: 50, yPct: 50, scale: 1.0, opacity: 1.0, rotation: 0 })
  rebuildLottieList()
  setActiveLottie(S.lotties.length - 1)
  setLottieStatus(label + ' caricato', '#31A362')
}

;(async () => {
  try {
    let files
    // Try server API first (auto-discovers all files in Lottie/)
    const apiRes = await fetch('/api/lotties')
    if (apiRes.ok) {
      files = await apiRes.json()
    } else {
      // Fallback to static index.json
      const idxRes = await fetch('Lottie/index.json')
      if (!idxRes.ok) return
      files = await idxRes.json()
    }
    // Exclude index.json itself
    files = files.filter(f => f.toLowerCase() !== 'index.json')
    if (!files.length) return
    const row = document.getElementById('lottie-preset-row')
    const sel = document.getElementById('lottie-select')
    row.classList.remove('hidden')
    files.forEach(f => {
      const opt = document.createElement('option')
      opt.value = f
      opt.textContent = f.replace(/\.json$/i, '')
      sel.appendChild(opt)
    })
  } catch {
    // upload zone is the fallback
  }
})()

document.getElementById('lottie-add-btn').addEventListener('click', () => {
  const sel = document.getElementById('lottie-select')
  const file = sel.value
  if (!file) return
  loadLottieFromURL(`Lottie/${file}`, file.replace(/\.json$/i, ''))
})

// Lottie sliders
;['x', 'y', 'scale', 'opacity', 'rotation'].forEach(key => {
  const el = document.getElementById(`lottie-${key}`)
  const ve = document.getElementById(`lottie-${key}-v`)
  if (!el || !ve) return
  el.addEventListener('input', () => {
    const l = S.lotties[S.activeLottieIdx]
    if (!l) return
    const v    = parseFloat(el.value)
    const prop = key === 'x' ? 'xPct' : key === 'y' ? 'yPct' : key
    l[prop] = v
    if (key === 'rotation') {
      ve.textContent = v + '°'
    } else {
      ve.textContent = Number.isInteger(v) ? v : v.toFixed(2)
    }
  })
})

// Canvas drag to reposition lottie
canvas.addEventListener('mousedown', e => {
  const rect = canvas.getBoundingClientRect()
  const sx = canvas.width / rect.width, sy = canvas.height / rect.height
  const mx = (e.clientX - rect.left) * sx
  const my = (e.clientY - rect.top)  * sy
  for (let i = S.lotties.length - 1; i >= 0; i--) {
    const l  = S.lotties[i]
    const lx = l.xPct / 100 * canvas.width
    const ly = l.yPct / 100 * canvas.height
    const hw = l.animW * l.scale * 0.5
    const hh = l.animH * l.scale * 0.5
    if (mx >= lx - hw && mx <= lx + hw && my >= ly - hh && my <= ly + hh) {
      draggingLottieIdx = i; lDragOffX = mx - lx; lDragOffY = my - ly
      setActiveLottie(i); e.preventDefault(); break
    }
  }
})
canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect()
  const sx = canvas.width / rect.width, sy = canvas.height / rect.height
  const mx = (e.clientX - rect.left) * sx
  const my = (e.clientY - rect.top)  * sy
  if (draggingLottieIdx >= 0) {
    const l = S.lotties[draggingLottieIdx]
    l.xPct = Math.max(0, Math.min(100, (mx - lDragOffX) / canvas.width  * 100))
    l.yPct = Math.max(0, Math.min(100, (my - lDragOffY) / canvas.height * 100))
    syncLottieSliders()
    return
  }
  let hover = false
  for (const l of S.lotties) {
    const lx = l.xPct / 100 * canvas.width
    const ly = l.yPct / 100 * canvas.height
    if (Math.abs(mx - lx) < l.animW * l.scale * 0.5 && Math.abs(my - ly) < l.animH * l.scale * 0.5) {
      hover = true; break
    }
  }
  canvas.style.cursor = hover ? 'move' : 'default'
})
canvas.addEventListener('mouseup',    () => { draggingLottieIdx = -1 })
canvas.addEventListener('mouseleave', () => { draggingLottieIdx = -1 })

// ── RECORDING ──────────────────────────────────────────────────
let recorder = null, recChunks = [], recActive = false
document.getElementById('rec-btn').addEventListener('click', () => {
  if (recActive) { recorder?.stop(); return }
  const dur      = parseInt(document.getElementById('duration').value) * 1000
  const mimeType = ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4']
    .find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm'
  recorder  = new MediaRecorder(canvas.captureStream(S.fps), { mimeType, videoBitsPerSecond: 12_000_000 })
  recChunks = []
  recorder.ondataavailable = e => { if (e.data.size > 0) recChunks.push(e.data) }
  recorder.onstop = () => {
    Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(new Blob(recChunks, { type: mimeType })),
      download: `video_${S.format}_${Date.now()}.webm`
    }).click()
    recActive = false
    document.getElementById('rec-btn').textContent   = 'Registra Video'
    document.getElementById('rec-btn').className     = 'btn btn-primary'
    document.getElementById('rec-status').textContent = 'Download completato'
    setTimeout(() => document.getElementById('rec-status').textContent = '', 3000)
  }
  recorder.start(); recActive = true
  document.getElementById('rec-btn').textContent    = 'Stop'
  document.getElementById('rec-btn').className      = 'btn btn-record'
  document.getElementById('rec-status').textContent  = `Registrazione... ${dur/1000}s`
  setTimeout(() => { if (recorder?.state !== 'inactive') recorder.stop() }, dur)
})

// ── MP4 EXPORT (WebCodecs + mp4-muxer) ─────────────────────────
let mp4MuxerMod = null, isCapturing = false

async function getMuxer() {
  if (mp4MuxerMod) return mp4MuxerMod
  mp4MuxerMod = await import('https://cdn.jsdelivr.net/npm/mp4-muxer@5/build/mp4-muxer.mjs')
  return mp4MuxerMod
}

function setMP4Status(msg) { document.getElementById('mp4-status').textContent = msg }

document.getElementById('mp4-btn').addEventListener('click', async () => {
  if (isCapturing) return
  if (!window.VideoEncoder) {
    setMP4Status('Errore: WebCodecs non supportato (Chrome 94+ richiesto)')
    return
  }
  isCapturing = true
  const btn = document.getElementById('mp4-btn')
  btn.disabled = true; btn.textContent = 'In corso...'

  const dur   = parseInt(document.getElementById('duration').value)
  const fps   = S.fps
  const total = dur * fps
  const { w, h } = FORMATS[S.format]

  try {
    setMP4Status('Caricamento mp4-muxer...')
    const { Muxer, ArrayBufferTarget } = await getMuxer()
    const target  = new ArrayBufferTarget()
    const muxer   = new Muxer({ target, video: { codec: 'avc', width: w, height: h }, fastStart: 'in-memory' })
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error:  e => { throw e },
    })
    encoder.configure({ codec: 'avc1.640034', width: w, height: h, bitrate: 20_000_000, framerate: fps })

    isPaused = true
    const savedScrollY = S.scrollY
    S.scrollY = 0
    lastAutoTriggerTime = -Infinity
    // Pause lottie autoplay and sync frame-by-frame
    S.lotties.forEach(l => l.anim.pause())
    for (let i = 0; i < total; i++) {
      S.lotties.forEach(l => {
        const f = ((i / fps) * l.anim.frameRate) % l.anim.totalFrames
        l.anim.goToAndStop(f, true)
      })
      drawFrame((i / fps) * 1000)
      const frame = new VideoFrame(canvas, { timestamp: Math.round((i / fps) * 1_000_000) })
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 })
      frame.close()
      if (i % 15 === 0) {
        setMP4Status(`Encoding frame ${i + 1}/${total}...`)
        await new Promise(r => setTimeout(r, 0))
      }
    }
    isPaused = false
    S.scrollY = savedScrollY
    S.lotties.forEach(l => l.anim.play())

    setMP4Status('Finalizzazione MP4...')
    await encoder.flush()
    muxer.finalize()
    const blob = new Blob([target.buffer], { type: 'video/mp4' })
    const url  = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), { href: url, download: `video_${S.format}_${Date.now()}.mp4` }).click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    setMP4Status('Download MP4 completato')
    setTimeout(() => setMP4Status(''), 4000)
  } catch (err) {
    console.error(err)
    setMP4Status('Errore: ' + (err.message || err))
    isPaused = false
    S.scrollY = savedScrollY
    S.lotties.forEach(l => l.anim.play())
  }

  btn.disabled = false; btn.textContent = 'Export MP4 (Alta qualità)'
  isCapturing  = false
})

// ── PRESET ─────────────────────────────────────────────────────
const PRESET_KEYS = [
  'format','text','align','tileMode','reps','wordGap','direction',
  'kerning','lineHeight','gapV','speed','fps','paddingL','paddingR',
  'bgColor','textColor','imgScale','imgOpacity','imgCornerRadius',
  'autoEffect','autoDelay','autoForce','effectDuration','easingIn','easingOut',
  'tremolio','tremolioForce','tremolioSpeed',
  'globalScale','compPadL','compPadR','compPadT','compPadB',
  'bgCornerRadius','currentFont',
]

function savePreset() {
  const name = document.getElementById('preset-name').value.trim() || 'preset'
  const data = { _name: name }
  PRESET_KEYS.forEach(k => { data[k] = S[k] })
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: name.replace(/\s+/g, '_') + '.json',
  }).click()
}

function applyPreset(data) {
  PRESET_KEYS.forEach(k => { if (k in data) S[k] = data[k] })

  // Sync range inputs
  const ranges = {
    'reps': 'reps-v', 'wgap': 'wgap-v', 'kerning': 'kerning-v',
    'lh': 'lh-v', 'gapv': 'gapv-v', 'speed': 'speed-v',
    'pad-l': 'pad-l-v', 'pad-r': 'pad-r-v',
    'img-scale': 'img-scale-v', 'img-opacity': 'img-opacity-v',
    'img-corner-radius': 'img-corner-radius-v',
    'fps': 'fps-v', 'autoDelay': 'autoDelay-v', 'autoForce': 'autoForce-v',
    'effectDuration': 'effectDuration-v',
    'tremolio-force': 'tremolio-force-v', 'tremolio-speed': 'tremolio-speed-v',
    'global-scale': 'global-scale-v', 'comp-pad-all': 'comp-pad-all-v',
    'bg-corner-radius': 'bg-corner-radius-v',
  }
  const stateMap = {
    'reps': 'reps', 'wgap': 'wordGap', 'kerning': 'kerning',
    'lh': 'lineHeight', 'gapv': 'gapV', 'speed': 'speed',
    'pad-l': 'paddingL', 'pad-r': 'paddingR',
    'img-scale': 'imgScale', 'img-opacity': 'imgOpacity',
    'img-corner-radius': 'imgCornerRadius',
    'fps': 'fps', 'autoDelay': 'autoDelay', 'autoForce': 'autoForce',
    'effectDuration': 'effectDuration',
    'tremolio-force': 'tremolioForce', 'tremolio-speed': 'tremolioSpeed',
    'global-scale': 'globalScale', 'comp-pad-all': 'compPadL',
    'bg-corner-radius': 'bgCornerRadius',
  }
  Object.keys(ranges).forEach(id => {
    const el = document.getElementById(id)
    const ve = document.getElementById(ranges[id])
    if (!el || !ve) return
    const v = S[stateMap[id]]
    if (v == null) return
    el.value = v
    ve.textContent = Number.isInteger(v) ? v : v.toFixed(Number.isInteger(parseFloat(el.step)) ? 1 : 2)
  })
  // comp-pad-all shows compPadL (all sides equal)
  const cpa = document.getElementById('comp-pad-all')
  if (cpa) { cpa.value = S.compPadL; document.getElementById('comp-pad-all-v').textContent = S.compPadL }

  // Selects
  ;['autoEffect','easingIn','easingOut'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = S[id]
  })
  if (S.currentFont) {
    const fs = document.getElementById('font-select')
    if (fs && [...fs.options].some(o => o.value === S.currentFont)) fs.value = S.currentFont
  }

  // Text input
  const ti = document.getElementById('text-input'); if (ti) ti.value = S.text

  // Active-state button groups
  document.querySelectorAll('.fmt-btn').forEach(b => b.classList.toggle('active', b.dataset.fmt === S.format))
  document.querySelectorAll('.align-btn').forEach(b => b.classList.toggle('active', b.dataset.align === S.align))
  document.querySelectorAll('.dir-btn').forEach(b => b.classList.toggle('active', b.dataset.dir === S.direction))
  document.querySelectorAll('.tog-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === S.tileMode))
  document.getElementById('grid-controls').style.display = S.tileMode === 'grid' ? 'flex' : 'none'

  // Colors
  updateColor('bg',   S.bgColor)
  updateColor('text', S.textColor)

  // Tremolio toggle
  const tt = document.getElementById('tremolio-toggle')
  if (tt) {
    tt.textContent = S.tremolio ? 'ON' : 'OFF'
    tt.classList.toggle('border-[#CEFF00]', S.tremolio)
    tt.classList.toggle('text-[#CEFF00]',   S.tremolio)
    const tc = document.getElementById('tremolio-controls')
    if (tc) { tc.style.display = S.tremolio ? 'flex' : 'none'; tc.style.flexDirection = 'column' }
  }

  setFormat(S.format)
  recalcFont()
}

document.getElementById('preset-save-btn').addEventListener('click', savePreset)

document.getElementById('preset-load-input').addEventListener('change', function () {
  const file = this.files[0]; if (!file) return
  const reader = new FileReader()
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result)
      applyPreset(data)
      document.getElementById('preset-status').textContent = 'Preset "' + (data._name || file.name) + '" caricato'
      setTimeout(() => { document.getElementById('preset-status').textContent = '' }, 3000)
      if (data._name) document.getElementById('preset-name').value = data._name
    } catch {
      document.getElementById('preset-status').textContent = 'File non valido'
    }
  }
  reader.readAsText(file)
  this.value = ''
})

// ── BOOT ───────────────────────────────────────────────────────
setFormat('post')
loop()
