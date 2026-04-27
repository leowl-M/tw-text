const FORMATS = { post:{w:1080,h:1440}, story:{w:1080,h:1920}, wide:{w:1920,h:1080} }
const PALETTE_COLORS = ['#4A60FF','#CEFF00','#FF3EBA','#31A362','#F7F6EB','#141414','transparent']
const BUNDLED_FONTS = [
  { family:'PPFrama-ExtraboldItalic', label:'PP Frama Extrabold Italic', file:'Font/PPFrama-ExtraboldItalic.otf' },
  { family:'PPFrama-Regular',         label:'PP Frama Regular',           file:'Font/PPFrama-Regular.otf' },
]
const FONT_FALLBACK = "Impact, 'Arial Black', sans-serif"
const HANDLE_R = 24

function applyEasing(p, type) {
  p = Math.max(0, Math.min(1, p))
  switch(type) {
    case 'linear':    return p
    case 'easeIn':    return p*p
    case 'easeOut':   return p*(2-p)
    case 'easeInOut': return p<0.5?2*p*p:-1+(4-2*p)*p
    case 'elastic':   return p===0?0:p===1?1:Math.pow(2,-10*p)*Math.sin((p*10-0.75)*(2*Math.PI/3))+1
    case 'bounce': {
      if(p<1/2.75) return 7.5625*p*p
      if(p<2/2.75){p-=1.5/2.75;return 7.5625*p*p+0.75}
      if(p<2.5/2.75){p-=2.25/2.75;return 7.5625*p*p+0.9375}
      p-=2.625/2.75;return 7.5625*p*p+0.984375
    }
    case 'back': { const c1=1.70158,c3=c1+1; return c3*p*p*p-c1*p*p }
    case 'sharp': return p<0.15?p/0.15:1
    default: return p
  }
}

function makeTextLayer(text='DESIGN BOMB!!!'){
  return {
    id: `t${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    label: 'Testo',
    text,
    align:'center',
    textColor:'#F7F6EB',
    fontFamily:'PPFrama-ExtraboldItalic',
    textXPct:50,
    textYPct:50,
    textScale:1.0,
    textRotation:0,
    _bboxW:0,
    _bboxH:0,
  }
}

const S = {
  format:'post',
  kerning:0, lineHeight:1.0, fps:60,
  bgColor:'#141414',
  image:null, imgScale:1.0, imgOpacity:1.0, imgCornerRadius:0,
  imgXPct:50, imgYPct:50, imgRotation:0,
  fontSize:100, currentFont:'PPFrama-ExtraboldItalic', fontLoaded:false,
  paletteTarget:'bg',
  autoEffect:'none', autoDelay:1000, autoForce:5.0, effectDuration:600,
  easingIn:'easeInOut', easingOut:'easeInOut',
  tremolio:false, tremolioForce:3.0, tremolioSpeed:1.0,
  frameCount:0,
  lotties:[], activeLottieIdx:-1,
  texts:[makeTextLayer()],
  activeTextId:null,
  activeLayer: { type:'text', id:null }, // 'text', 'lottie', 'image'
  globalScale:1.0, compPadL:0, compPadR:0, compPadT:0, compPadB:0, bgCornerRadius:0,
}
S.activeTextId = S.texts[0].id
S.activeLayer.id = S.activeTextId

// Unified access to active layer data
function getActiveLayerData() {
  const {w, h} = FORMATS[S.format]
  if (S.activeLayer.type === 'text') {
    const t = activeText()
    return { obj:t, type:'text', x:t.textXPct/100*w, y:t.textYPct/100*h, scale:t.textScale, rot:t.textRotation, w:t._bboxW, h:t._bboxH, color:'#CEFF00' }
  }
  if (S.activeLayer.type === 'lottie' && S.activeLottieIdx >= 0) {
    const l = S.lotties[S.activeLottieIdx]
    return { obj:l, type:'lottie', x:l.xPct/100*w, y:l.yPct/100*h, scale:l.scale, rot:l.rotation||0, w:l.animW, h:l.animH, color:'#5CE0A0' }
  }
  if (S.activeLayer.type === 'image' && S.image) {
    const img = S.image; const fit = Math.min(w*0.7/img.width, h*0.7/img.height)
    return { obj:img, type:'image', x:S.imgXPct/100*w, y:S.imgYPct/100*h, scale:S.imgScale, rot:S.imgRotation, w:img.width*fit, h:img.height*fit, color:'#7C92FF' }
  }
  return null
}

function updateActiveLayerProp(key, val) {
  const ld = getActiveLayerData(); if(!ld) return
  if (ld.type === 'text') {
    if (key === 'xPct') ld.obj.textXPct = val; else if (key === 'yPct') ld.obj.textYPct = val; else if (key === 'scale') ld.obj.textScale = val; else if (key === 'rot') ld.obj.textRotation = val;
    syncTextSliders()
  } else if (ld.type === 'lottie') {
    if (key === 'xPct') ld.obj.xPct = val; else if (key === 'yPct') ld.obj.yPct = val; else if (key === 'scale') ld.obj.scale = val; else if (key === 'rot') ld.obj.rotation = val;
    syncLottieSliders()
  } else if (ld.type === 'image') {
    if (key === 'xPct') S.imgXPct = val; else if (key === 'yPct') S.imgYPct = val; else if (key === 'scale') S.imgScale = val; else if (key === 'rot') S.imgRotation = val;
    syncImageSliders()
  }
}

let lastAutoTriggerTime = -Infinity
const loadedFonts = []
let uploadedFontCount = 0

// drag state
let dragMode = null
let dragStart = {}
let draggingLottieIdx = -1, lDragOffX = 0, lDragOffY = 0
let hideTransformHandles = false
let touchGesture = null
let activeGuides = { v:false, h:false, rot:false }
let pressTimer = null
let pressStart = null
let lastHapticAt = 0

const SNAP_MOVE_PX = 18
const SNAP_ROT_DEG = 6
const LONG_PRESS_MS = 420
const LONG_PRESS_MOVE_TOL = 14

const canvas = document.getElementById('canvas')
const ctx    = canvas.getContext('2d')
const mCv    = document.createElement('canvas')
mCv.width = 4000; mCv.height = 300
const mCtx   = mCv.getContext('2d')

function fontStack(fontFamily) { return `'${fontFamily || S.currentFont}', ${FONT_FALLBACK}` }
function fontStr(size, fontFamily) { return `900 italic ${size}px ${fontStack(fontFamily)}` }
function activeText(){
  let t = S.texts.find(x=>x.id===S.activeTextId)
  if(!t){
    if(!S.texts.length) S.texts.push(makeTextLayer(''))
    t=S.texts[0]
    S.activeTextId=t.id
  }
  return t
}
function setActiveText(id){
  if(!S.texts.some(t=>t.id===id)) return
  S.activeTextId=id
  S.activeLayer = { type:'text', id:id }
  syncTextUI()
}
function syncTextLayerSelect(){
  const sel=document.getElementById('text-layer-select')
  if(!sel) return
  sel.innerHTML=''
  S.texts.forEach((t,i)=>{
    const opt=document.createElement('option')
    opt.value=t.id
    const first=(t.text||'').split('\n')[0].trim() || `Testo ${i+1}`
    opt.textContent=`${i+1}. ${first.slice(0,28)}`
    sel.appendChild(opt)
  })
  sel.value=S.activeTextId
}

function setFormat(fmt) {
  S.format = fmt
  const {w,h} = FORMATS[fmt]
  canvas.width = w; canvas.height = h
  document.getElementById('fmt-badge').textContent = `${w} × ${h}`
  document.querySelectorAll('.fmt-btn').forEach(b => b.classList.toggle('active', b.dataset.fmt===fmt))
  recalcFont()
  updateRainWalls()
}

function measureAt(text, size, fontFamily) {
  mCtx.font = fontStr(size, fontFamily)
  if('letterSpacing' in mCtx) mCtx.letterSpacing = S.kerning+'px'
  const m = mCtx.measureText(text)
  const hasB = typeof m.actualBoundingBoxLeft==='number'
  return { visualW: hasB ? m.actualBoundingBoxLeft+m.actualBoundingBoxRight : m.width }
}

function recalcFont() {
  const {w} = FORMATS[S.format]
  const avail = w - S.compPadL - S.compPadR
  if(avail<=0) return
  const lines = S.texts.flatMap(t=>{
    const ls=(t.text||'').split('\n').map(l=>l.trim()).filter(Boolean)
    return (ls.length?ls:['M']).map(line => ({ line, fontFamily:t.fontFamily }))
  })
  const BASE=100, SAFE=0.995
  const maxVis = Math.max(...lines.map(x => measureAt(x.line||'M', BASE, x.fontFamily).visualW))
  S.fontSize = maxVis>0 ? BASE*avail/maxVis*SAFE : BASE
  ctx.font = fontStr(S.fontSize, activeText().fontFamily)
  if('letterSpacing' in ctx) ctx.letterSpacing = S.kerning+'px'
  const actualMax = Math.max(...lines.map(x => {
    ctx.font = fontStr(S.fontSize, x.fontFamily)
    const m = ctx.measureText(x.line||'M')
    const hasB = typeof m.actualBoundingBoxLeft==='number'
    return hasB ? m.actualBoundingBoxLeft+m.actualBoundingBoxRight : m.width
  }))
  if(actualMax>avail) S.fontSize *= (avail/actualMax)*SAFE
}

function getLines() {
  const ls = (activeText().text||'').split('\n').map(l=>l.trim()).filter(l=>l.length>0)
  return ls.length>0 ? ls : ['']
}
function rowH() { return S.fontSize * S.lineHeight }

function getHandlesLogical() {
  const ld = getActiveLayerData(); if (!ld || ld.w === 0) return null
  const hw = ld.w * ld.scale / 2, hh = ld.h * ld.scale / 2
  const ang = ld.rot * Math.PI / 180, cos = Math.cos(ang), sin = Math.sin(ang)
  const cx = ld.x, cy = ld.y
  function r(lx,ly){ return { x:cx+lx*cos-ly*sin, y:cy+lx*sin+ly*cos } }
  return { tl:r(-hw,-hh), tr:r(hw,-hh), bl:r(-hw,hh), br:r(hw,hh), rot:r(0,-hh-70), rotBase:r(0,-hh), cx, cy, hw, hh, color:ld.color }
}

function toLogical(rx, ry) {
  const {w,h} = FORMATS[S.format]; const gs = S.globalScale
  return { x: w/2+(rx-w/2)/gs, y: h/2+(ry-h/2)/gs }
}

function mouseInTextBox(lx, ly, t = activeText()) {
  const {w,h} = FORMATS[S.format]; const cx = t.textXPct/100*w, cy = t.textYPct/100*h
  const ang = -t.textRotation*Math.PI/180; const dx=lx-cx, dy=ly-cy
  const cos=Math.cos(ang), sin=Math.sin(ang); const bx=dx*cos-dy*sin, by=dx*sin+dy*cos
  const hw=t._bboxW*t.textScale/2, hh=t._bboxH*t.textScale/2
  return Math.abs(bx)<=hw+HANDLE_R && Math.abs(by)<=hh+HANDLE_R
}

function dist(ax,ay,bx,by){ return Math.sqrt((ax-bx)**2+(ay-by)**2) }

function drawHandlesOnCtx() {
  const h = getHandlesLogical(); if(!h) return
  ctx.save()
  ctx.strokeStyle = h.color; ctx.lineWidth = 2.5; ctx.setLineDash([10,7]); ctx.beginPath()
  ctx.moveTo(h.tl.x,h.tl.y); ctx.lineTo(h.tr.x,h.tr.y); ctx.lineTo(h.br.x,h.br.y); ctx.lineTo(h.bl.x,h.bl.y); ctx.closePath(); ctx.stroke()
  ctx.setLineDash([5,5]); ctx.beginPath(); ctx.moveTo(h.rotBase.x,h.rotBase.y); ctx.lineTo(h.rot.x,h.rot.y); ctx.stroke(); ctx.setLineDash([])
  ;[h.tl,h.tr,h.bl,h.br].forEach(pt=>{
    ctx.beginPath(); ctx.arc(pt.x,pt.y,HANDLE_R,0,Math.PI*2); ctx.fillStyle='#ffffff'; ctx.fill(); ctx.strokeStyle='rgba(0,0,0,0.45)'; ctx.lineWidth=1.5; ctx.stroke()
  })
  ctx.beginPath(); ctx.arc(h.rot.x,h.rot.y,HANDLE_R,0,Math.PI*2); ctx.fillStyle=h.color; ctx.fill(); ctx.strokeStyle='rgba(0,0,0,0.45)'; ctx.lineWidth=1.5; ctx.stroke()
  ctx.restore()
}

function drawSnapGuides() {
  const { w, h } = FORMATS[S.format]; if (!activeGuides.v && !activeGuides.h && !activeGuides.rot) return
  ctx.save(); ctx.strokeStyle = 'rgba(206,255,0,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([12, 8])
  if (activeGuides.v) { ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke() }
  if (activeGuides.h) { ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke() }
  if (activeGuides.rot) {
    const ld = getActiveLayerData(); if(!ld) { ctx.restore(); return }
    const len = Math.max(ld.w, ld.h, 180) * 0.7; const ang = ld.rot * Math.PI / 180
    ctx.beginPath(); ctx.moveTo(ld.x - Math.cos(ang) * len, ld.y - Math.sin(ang) * len); ctx.lineTo(ld.x + Math.cos(ang) * len, ld.y + Math.sin(ang) * len); ctx.stroke()
  }
  ctx.restore()
}

function hapticTick() {
  if (!('vibrate' in navigator)) return
  const now = performance.now()
  if (now - lastHapticAt < 80) return
  lastHapticAt = now
  navigator.vibrate(10)
}

function drawLineWithEffect(text, startX, startY, li, now, effectIntensity, maxW, cW, cH) {
  const needPerChar = S.autoEffect!=='none' || S.tremolio
  if(!needPerChar){ ctx.fillText(text,startX,startY); return }

  for(let i=0;i<text.length;i++){
    const ch=text[i]; if(ch===' ') continue
    const prefix=text.substring(0,i)
    const charStartX=startX+(i>0?ctx.measureText(prefix).width:0)
    const cw=ctx.measureText(ch).width
    const charCenterX=charStartX+cw/2
    const seed=li*101+i+1
    const r1=Math.abs(Math.sin(seed*127.1+1.3))
    const r2=Math.abs(Math.sin(seed*311.7+2.7))
    const r1n=r1-0.5, r2n=r2-0.5
    const force=S.autoForce*10*effectIntensity
    let dx=0,dy=0,rot=0,sx=1,sy=1,alpha=1,customDraw=false

    switch(S.autoEffect){
      case 'explode': {
        const d=Math.sqrt(charCenterX**2+startY**2)||1
        dx=(charCenterX/d)*force*(0.5+r1); dy=(startY/d)*force*(0.5+r2)
        rot=r1n*effectIntensity*(S.autoForce/5); break
      }
      case 'glitch':{ dx=r1n*force; dy=r2n*force*0.3; break }
      case 'wave':{ dy=Math.sin(charCenterX*0.015+now*0.003)*force; break }
      case 'vortex':{ dx=-startY*0.05*force; dy=charCenterX*0.05*force; rot=effectIntensity*(S.autoForce/10); break }
      case 'bounce':{ const st=((charCenterX+maxW/2)/maxW)*0.4; dy=-Math.abs(Math.sin((now*0.01+st)*Math.PI))*force*2; break }
      case 'scatter':{ dx=r1n*S.fontSize*effectIntensity*(S.autoForce/3); dy=r2n*S.fontSize*effectIntensity*(S.autoForce/3); alpha=1-effectIntensity*0.6; break }
      case 'shake':{ dx=Math.sin(now*0.08+i*37.1)*S.autoForce*5*effectIntensity; dy=Math.sin(now*0.11+i*13.7)*S.autoForce*3*effectIntensity; break }
      case 'spin':{ rot=effectIntensity*Math.PI*2*(S.autoForce/5)*(r1>0.5?1:-1); break }
      case 'float':{ dy=-(r1*0.5+0.5)*force*2; alpha=Math.max(0,1-effectIntensity*1.5); break }
      case 'rain':{ dy=(1-effectIntensity)*cH*0.4*(r1*0.5+0.5); alpha=effectIntensity; break }
      case 'zoom':{ const zf=1+effectIntensity*(S.autoForce/4); sx=zf; sy=zf; break }
      case 'chromatic':{
        customDraw=true
        const off=effectIntensity*S.autoForce*4
        const sa=ctx.globalAlpha, sf=ctx.fillStyle
        ctx.globalAlpha=sa*0.65
        ctx.fillStyle='#ff3333'; ctx.save(); ctx.translate(charCenterX-off,startY); ctx.fillText(ch,-cw/2,0); ctx.restore()
        ctx.fillStyle='#33ffff'; ctx.save(); ctx.translate(charCenterX+off,startY); ctx.fillText(ch,-cw/2,0); ctx.restore()
        ctx.globalAlpha=sa; ctx.fillStyle=sf
        ctx.save(); ctx.translate(charCenterX,startY); ctx.fillText(ch,-cw/2,0); ctx.restore()
        break
      }
      case 'cascade':{ const st=((charCenterX+maxW/2)/maxW)*0.5; const le=Math.max(0,effectIntensity-st); dy=-Math.sin(le*Math.PI)*force*2; break }
      case 'flicker':{ alpha=Math.random()>effectIntensity*0.85?1:0; break }
    }

    if(S.tremolio){
      const t=now*S.tremolioSpeed*0.008
      dx+=Math.sin(t+seed*2.399)*S.tremolioForce
      dy+=Math.cos(t+seed*1.618)*S.tremolioForce
    }

    if(!customDraw){
      ctx.save()
      if(alpha!==1) ctx.globalAlpha=Math.max(0,alpha)
      ctx.translate(charCenterX+dx,startY+dy)
      ctx.rotate(rot)
      if(sx!==1||sy!==1) ctx.scale(sx,sy)
      ctx.fillText(ch,-cw/2,0)
      ctx.restore()
    }
  }
}

function drawFrame(simNow) {
  const {w,h} = FORMATS[S.format]
  ctx.clearRect(0,0,w,h)

  ctx.save()
  ctx.translate(w/2,h/2); ctx.scale(S.globalScale,S.globalScale); ctx.translate(-w/2,-h/2)
  ctx.beginPath(); ctx.rect(0,0,w,h); ctx.clip()

  const iw=w-S.compPadL-S.compPadR, ih=h-S.compPadT-S.compPadB
  ctx.save()
  ctx.fillStyle=S.bgColor
  if(S.bgCornerRadius>0){
    ctx.beginPath(); ctx.roundRect(S.compPadL,S.compPadT,iw,ih,S.bgCornerRadius); ctx.fill(); ctx.clip()
  } else {
    ctx.fillRect(S.compPadL,S.compPadT,iw,ih)
    ctx.beginPath(); ctx.rect(S.compPadL,S.compPadT,iw,ih); ctx.clip()
  }

  const now = simNow!==undefined ? simNow : performance.now()
  S.frameCount++

  if(S.autoEffect!=='none' && (now-lastAutoTriggerTime>S.autoDelay)){
    lastAutoTriggerTime+=S.autoDelay
    if(now-lastAutoTriggerTime>S.autoDelay) lastAutoTriggerTime=now
  }
  const tsk = now-lastAutoTriggerTime
  let effectIntensity=0
  if(S.autoEffect!=='none' && tsk<S.effectDuration){
    const p=tsk/S.effectDuration
    const env=p<0.5?applyEasing(p*2,S.easingIn):1-applyEasing((p-0.5)*2,S.easingOut)
    effectIntensity=Math.max(0,env)
  }

  if(S.image){
    const img=S.image
    const fit=Math.min(w*0.7/img.width,h*0.7/img.height)*S.imgScale
    const iw2=img.width*fit, ih2=img.height*fit
    const ix=S.imgXPct/100*w, iy=S.imgYPct/100*h
    ctx.save()
    ctx.globalAlpha=S.imgOpacity
    ctx.translate(ix, iy)
    ctx.rotate(S.imgRotation * Math.PI / 180)
    if(S.imgCornerRadius>0){
      ctx.beginPath()
      ctx.roundRect(-iw2/2, -ih2/2, iw2, ih2, S.imgCornerRadius)
      ctx.clip()
    }
    ctx.drawImage(img, -iw2/2, -ih2/2, iw2, ih2)
    ctx.restore()
  }

  if (rainEngine) {
    const rainDt = simNow !== undefined ? 1000/S.fps : 1000/60
    Matter.Engine.update(rainEngine, rainDt * rainSpeed)
    Matter.Composite.allBodies(rainEngine.world).filter(b=>!b.isStatic).forEach(body => {
      const el = body._imgEl
      if (!el || !el.complete || el.naturalWidth===0) return
      ctx.save()
      ctx.translate(body.position.x, body.position.y)
      ctx.rotate(body.angle)
      ctx.drawImage(el, -body._hw, -body._hh, body._hw*2, body._hh*2)
      ctx.restore()
    })
  }

  ctx.font=fontStr(S.fontSize, activeText().fontFamily)
  if('letterSpacing' in ctx) ctx.letterSpacing=S.kerning+'px'
  for(const t of S.texts){
    const lines=(t.text||'').split('\n').map(l=>l.trim()).filter(Boolean)
    const safeLines=lines.length?lines:['']
    const rh=rowH()
    const totalH=rh*safeLines.length
    ctx.font=fontStr(S.fontSize, t.fontFamily)
    if('letterSpacing' in ctx) ctx.letterSpacing=S.kerning+'px'
    const lineWidths=safeLines.map(l=>{
      const m=ctx.measureText(l||' ')
      const hasB=typeof m.actualBoundingBoxLeft==='number'
      return hasB?m.actualBoundingBoxLeft+m.actualBoundingBoxRight:m.width
    })
    const maxW=Math.max(...lineWidths,1)
    t._bboxW=maxW; t._bboxH=totalH

    const cx=t.textXPct/100*w, cy=t.textYPct/100*h
    ctx.save()
    ctx.translate(cx,cy)
    ctx.rotate(t.textRotation*Math.PI/180)
    ctx.scale(t.textScale,t.textScale)
    ctx.fillStyle=t.textColor
    ctx.font=fontStr(S.fontSize, t.fontFamily)
    if('letterSpacing' in ctx) ctx.letterSpacing=S.kerning+'px'
    ctx.textBaseline='top'
    ctx.textAlign='left'

    safeLines.forEach((line,li)=>{
      const y=-totalH/2+li*rh
      const lw=lineWidths[li]
      let x
      if(t.align==='center')      x=-lw/2
      else if(t.align==='right')  x=maxW/2-lw
      else                        x=-maxW/2
      drawLineWithEffect(line,x,y,li,now,effectIntensity,maxW,w,h)
    })
    ctx.restore()
  }

  ctx.restore()

  if (rainEngine && rainTextCollision) syncRainTextBodies(w, h)

  for(const l of S.lotties){
    const lc=l.container.querySelector('canvas')
    if(!lc||lc.width===0) continue
    const outW=l.animW*l.scale, outH=l.animH*l.scale
    const lx=l.xPct/100*w, ly=l.yPct/100*h
    ctx.save()
    ctx.globalAlpha=l.opacity
    ctx.translate(lx,ly); ctx.rotate((l.rotation||0)*Math.PI/180)
    ctx.drawImage(lc,-outW/2,-outH/2,outW,outH)
    ctx.restore()
  }

  if(!hideTransformHandles) drawHandlesOnCtx()
  drawSnapGuides()

  ctx.restore()
}

let isPaused=false
function loop(){ if(!isPaused) drawFrame(); requestAnimationFrame(loop) }

// ─── RAIN SYSTEM ─────────────────────────────────────────────────────────────
let rainEngine = null
let rainImgUrls = []
let rainEffect = 'normal'
let rainModChaos = false, rainModExplosive = false, rainIsLooping = false
let rainTimeTick = 0
const rainSelectedLottieIdxs = new Set()
const rainSelectedPresets = new Set()
let rainPresetCache = {}
let rainSpeed = 1.0
let rainTextCollision = false

function initRain() {
  if (rainEngine) return
  rainEngine = Matter.Engine.create()
  setRainGravity()
  const { w, h } = FORMATS[S.format]
  const wOpt = { isStatic: true, collisionFilter: { mask: 0x0000 } }
  const ground    = Matter.Bodies.rectangle(w/2,   h+100, w*3, 200, wOpt)
  const ceiling   = Matter.Bodies.rectangle(w/2,  -100,   w*3, 200, wOpt)
  const leftWall  = Matter.Bodies.rectangle(-100,  h/2,   200, h*3, wOpt)
  const rightWall = Matter.Bodies.rectangle(w+100, h/2,   200, h*3, wOpt)
  rainEngine._walls = { ground, ceiling, leftWall, rightWall }
  Matter.Composite.add(rainEngine.world, [ground, ceiling, leftWall, rightWall])

  Matter.Events.on(rainEngine, 'beforeUpdate', () => {
    rainTimeTick += 0.05
    const { w: cw, h: ch } = FORMATS[S.format]
    const bodies = Matter.Composite.allBodies(rainEngine.world).filter(b => !b.isStatic)
    bodies.forEach(body => {
      if (rainEffect === 'leaves') {
        Matter.Body.applyForce(body, body.position, { x: Math.sin(rainTimeTick + body.id) * 0.002 * body.mass, y: 0 })
      } else if (rainEffect === 'vortex') {
        const dx = cw/2 - body.position.x, dy = ch/2 - body.position.y
        Matter.Body.applyForce(body, body.position, { x: (-dy*0.00003 + dx*0.000005)*body.mass, y: (dx*0.00003 + dy*0.000005)*body.mass })
      } else if (rainEffect === 'magnetic') {
        const dx = cw/2 - body.position.x, dy = ch/2 - body.position.y
        Matter.Body.applyForce(body, body.position, { x: dx*0.00003*body.mass, y: dy*0.00003*body.mass })
      } else if (rainEffect === 'popcorn') {
        if (body.position.y > ch-250 && Math.abs(body.velocity.y) < 2 && Math.random() < 0.02) {
          Matter.Body.setVelocity(body, { x: (Math.random()-0.5)*15, y: -15-Math.random()*20 })
          Matter.Body.setAngularVelocity(body, (Math.random()-0.5)*0.6)
        }
      }
      if (rainIsLooping) {
        if (body.position.y > ch+300 || body.position.y < -600 || body.position.x < -300 || body.position.x > cw+300) {
          let nx = cw/2+(Math.random()-0.5)*800, ny = -200-Math.random()*200, vx = (Math.random()-0.5)*4, vy = 0
          if (rainEffect==='explosion'||rainEffect==='popcorn') { ny=ch+100; vy=-20-Math.random()*15 }
          else if (rainEffect==='windRight') { nx=-100; ny=Math.random()*ch; vx=10 }
          else if (rainEffect==='windLeft')  { nx=cw+100; ny=Math.random()*ch; vx=-10 }
          Matter.Body.setPosition(body, { x:nx, y:ny })
          Matter.Body.setVelocity(body, { x:vx, y:vy })
        }
      }
    })
  })

  Matter.Events.on(rainEngine, 'collisionStart', event => {
    if (!rainModExplosive) return
    event.pairs.forEach(({ bodyA, bodyB }) => {
      if (bodyA.isStatic || bodyB.isStatic) return
      const rvx = bodyA.velocity.x - bodyB.velocity.x, rvy = bodyA.velocity.y - bodyB.velocity.y
      if (rvx*rvx + rvy*rvy > 150) {
        const f = 0.05
        Matter.Body.applyForce(bodyA, bodyA.position, { x: rvx*f, y: rvy*f })
        Matter.Body.applyForce(bodyB, bodyB.position, { x: -rvx*f, y: -rvy*f })
      }
    })
  })
}

function updateRainWalls() {
  if (!rainEngine?._walls) return
  const { w, h } = FORMATS[S.format]
  const { ground, ceiling, leftWall, rightWall } = rainEngine._walls
  Matter.Body.setPosition(ground,    { x: w/2,   y: h+100 })
  Matter.Body.setPosition(ceiling,   { x: w/2,   y: -100 })
  Matter.Body.setPosition(leftWall,  { x: -100,  y: h/2 })
  Matter.Body.setPosition(rightWall, { x: w+100, y: h/2 })
}

function setRainGravity() {
  if (!rainEngine) return
  const e = rainEffect
  if      (e==='windRight')              { rainEngine.gravity.x= 1.5; rainEngine.gravity.y=0.8 }
  else if (e==='windLeft')               { rainEngine.gravity.x=-1.5; rainEngine.gravity.y=0.8 }
  else if (e==='heavy')                  { rainEngine.gravity.x=0;    rainEngine.gravity.y=3.5 }
  else if (e==='space')                  { rainEngine.gravity.x=0;    rainEngine.gravity.y=0.1 }
  else if (e==='vortex'||e==='magnetic') { rainEngine.gravity.x=0;    rainEngine.gravity.y=0   }
  else if (e==='leaves')                 { rainEngine.gravity.x=0;    rainEngine.gravity.y=0.6 }
  else                                   { rainEngine.gravity.x=0;    rainEngine.gravity.y=1.5 }
}

function spawnRain() {
  const urls = getRainUrls(); if (!urls.length) return
  initRain()
  const { w, h } = FORMATS[S.format]
  let amount = parseInt(document.getElementById('rain-amount').value)
  const baseSize = parseInt(document.getElementById('rain-size').value)
  if (rainEffect==='fluid') amount = Math.max(amount, 50)

  const btn = document.getElementById('rain-spawn-btn')
  btn.disabled = true; btn.style.opacity = '0.5'

  const spawnDelay = { explosion:20, popcorn:30, cannons:100, fluid:10 }[rainEffect] ?? 150
  let spawned = 0
  const interval = setInterval(() => {
    if (spawned >= amount) { clearInterval(interval); btn.disabled=false; btn.style.opacity='1'; return }

    const imgUrl = urls[spawned % urls.length]
    let radius = (rainEffect==='fluid') ? 15 : baseSize + Math.random()*(baseSize/3)
    if (rainModChaos && Math.random()<0.1 && rainEffect!=='fluid') radius *= 3.5

    let sx = w/2+(Math.random()-0.5)*800, sy = -200-Math.random()*200
    let vx = (Math.random()-0.5)*4, vy = 0
    const p = { restitution:0.5, friction:0.5, density:0.04, frictionAir:0.01,
                collisionFilter:{ category:0x0002, mask:0xFFFF } }

    if (rainEffect==='bouncy')   { p.restitution=1.1; p.frictionAir=0.001 }
    if (rainEffect==='heavy')    { p.density=0.5; p.restitution=0.1 }
    if (rainEffect==='space')    { p.frictionAir=0.08; p.restitution=0.9 }
    if (rainEffect==='leaves')   { p.frictionAir=0.05 }
    if (rainEffect==='fluid')    { p.restitution=0.1; p.friction=0.001; p.density=0.1 }
    if (rainEffect==='windRight'){ sx=-100;    sy=Math.random()*h; vx=15 }
    if (rainEffect==='windLeft') { sx=w+100;   sy=Math.random()*h; vx=-15 }
    if (rainEffect==='explosion'){ sy=h+100;   vy=-30-Math.random()*15; vx=(Math.random()-0.5)*25 }
    if (rainEffect==='popcorn')  { sx=150+Math.random()*(w-300); sy=h-50; vy=-35-Math.random()*20; vx=(Math.random()-0.5)*15; p.restitution=0.8 }
    if (rainEffect==='cannons')  { sy=200+Math.random()*(h-400); if(spawned%2===0){sx=-50;vx=25+Math.random()*10;vy=-5}else{sx=w+50;vx=-25-Math.random()*10;vy=-5} }

    const body = Matter.Bodies.circle(sx, sy, radius, p)
    body._hw = radius; body._hh = radius
    const imgEl = new Image(); imgEl.src = imgUrl; body._imgEl = imgEl
    Matter.Body.setVelocity(body, { x:vx, y:vy })
    Matter.Body.setAngularVelocity(body, (Math.random()-0.5)*0.4)
    Matter.Composite.add(rainEngine.world, body)
    spawned++
  }, spawnDelay)
}

function clearRain() {
  if (!rainEngine) return
  Matter.Composite.allBodies(rainEngine.world).filter(b=>!b.isStatic).forEach(b=>Matter.Composite.remove(rainEngine.world, b))
  if (rainEngine._textBodyMap) {
    rainEngine._textBodyMap.forEach(e => Matter.Composite.remove(rainEngine.world, e.body))
    rainEngine._textBodyMap.clear()
  }
}

function syncRainTextBodies(cw, ch) {
  if (!rainEngine) return
  if (!rainEngine._textBodyMap) rainEngine._textBodyMap = new Map()
  const map = rainEngine._textBodyMap

  // remove bodies for deleted texts
  const ids = new Set(S.texts.map(t => t.id))
  for (const [id, e] of map) {
    if (!ids.has(id)) { Matter.Composite.remove(rainEngine.world, e.body); map.delete(id) }
  }

  for (const t of S.texts) {
    const bw = Math.max((t._bboxW || 80) * t.textScale, 20)
    const bh = Math.max((t._bboxH || 40) * t.textScale, 20)
    const px = t.textXPct / 100 * cw
    const py = t.textYPct / 100 * ch
    const angle = t.textRotation * Math.PI / 180
    const e = map.get(t.id)
    const changed = !e || Math.abs(e.bw-bw)>2 || Math.abs(e.bh-bh)>2 ||
                    Math.abs(e.px-px)>1 || Math.abs(e.py-py)>1 || Math.abs(e.angle-angle)>0.01
    if (changed) {
      if (e) Matter.Composite.remove(rainEngine.world, e.body)
      const body = Matter.Bodies.rectangle(px, py, bw, bh, {
        isStatic: true, angle,
        restitution: 0.4, friction: 0.3, label: 'textBody'
      })
      Matter.Composite.add(rainEngine.world, body)
      map.set(t.id, { body, bw, bh, px, py, angle })
    }
  }
}

function addRainPreviewThumb(url) {
  const preview = document.getElementById('rain-preview')
  preview.style.display = 'flex'
  document.getElementById('rain-clear-images-btn').style.display = ''
  const img = document.createElement('img')
  img.src = url
  img.style.cssText = 'width:32px;height:32px;object-fit:cover;border-radius:4px;border:1px solid #333;'
  preview.appendChild(img)
}

function getRainUrls() {
  const urls = [...rainImgUrls]
  rainSelectedLottieIdxs.forEach(i => {
    const l = S.lotties[i]; if (!l) return
    const lc = l.container.querySelector('canvas')
    if (lc && lc.width > 0) urls.push(lc.toDataURL())
  })
  Object.values(rainPresetCache).forEach(url => urls.push(url))
  return urls
}

function rebuildRainStickerList() {
  const list = document.getElementById('rain-sticker-list')
  const section = document.getElementById('rain-sticker-section')
  if (!list || !section) return
  list.innerHTML = ''
  if (S.lotties.length === 0) { section.style.display = 'none'; return }
  section.style.display = ''
  S.lotties.forEach((l, i) => {
    const sel = rainSelectedLottieIdxs.has(i)
    const item = document.createElement('div')
    item.style.cssText = `display:flex;align-items:center;gap:8px;padding:5px 8px;background:${sel?'rgba(74,96,255,0.1)':'rgba(255,255,255,0.03)'};border:1px solid ${sel?'rgba(74,96,255,0.6)':'#2a2a2a'};border-radius:5px;cursor:pointer;`
    item.innerHTML = `<div style="width:11px;height:11px;border-radius:50%;border:2px solid ${sel?'#4A60FF':'#555'};background:${sel?'#4A60FF':'transparent'};flex-shrink:0;"></div><span style="font-size:11px;color:${sel?'#aac4ff':'#888'};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${l.label}</span>`
    item.addEventListener('click', () => {
      if (rainSelectedLottieIdxs.has(i)) rainSelectedLottieIdxs.delete(i)
      else rainSelectedLottieIdxs.add(i)
      rebuildRainStickerList()
    })
    list.appendChild(item)
  })
}

function spawnRainForExport() {
  const urls = getRainUrls(); if (!urls.length) return
  initRain(); clearRain()
  const { w, h } = FORMATS[S.format]
  let amount = parseInt(document.getElementById('rain-amount').value)
  const baseSize = parseInt(document.getElementById('rain-size').value)
  if (rainEffect==='fluid') amount = Math.max(amount, 50)
  const spread = Math.max(h * 1.5, 1500)

  for (let spawned = 0; spawned < amount; spawned++) {
    const imgUrl = urls[spawned % urls.length]
    let radius = rainEffect==='fluid' ? 15 : baseSize + Math.random()*(baseSize/3)
    if (rainModChaos && Math.random()<0.1 && rainEffect!=='fluid') radius *= 3.5

    let sx = w/2+(Math.random()-0.5)*800
    let sy = -80 - (spawned/amount)*spread - Math.random()*200
    let vx = (Math.random()-0.5)*4, vy = 0
    const p = { restitution:0.5, friction:0.5, density:0.04, frictionAir:0.01,
                collisionFilter:{ category:0x0002, mask:0xFFFF } }

    if (rainEffect==='bouncy')   { p.restitution=1.1; p.frictionAir=0.001 }
    if (rainEffect==='heavy')    { p.density=0.5; p.restitution=0.1 }
    if (rainEffect==='space')    { p.frictionAir=0.08; p.restitution=0.9 }
    if (rainEffect==='leaves')   { p.frictionAir=0.05 }
    if (rainEffect==='fluid')    { p.restitution=0.1; p.friction=0.001; p.density=0.1 }
    if (rainEffect==='windRight'){ sx=-100-(spawned/amount)*spread; sy=Math.random()*h; vx=15 }
    if (rainEffect==='windLeft') { sx=w+100+(spawned/amount)*spread; sy=Math.random()*h; vx=-15 }
    if (rainEffect==='explosion'){ sy=h+80+(spawned/amount)*spread; vy=-30-Math.random()*15; vx=(Math.random()-0.5)*25 }
    if (rainEffect==='popcorn')  { sx=150+Math.random()*(w-300); sy=h+80+(spawned/amount)*spread; vy=-35-Math.random()*20; vx=(Math.random()-0.5)*15; p.restitution=0.8 }
    if (rainEffect==='cannons')  { sy=200+Math.random()*(h-400); if(spawned%2===0){sx=-50-(spawned/amount)*spread;vx=25+Math.random()*10;vy=-5}else{sx=w+50+(spawned/amount)*spread;vx=-25-Math.random()*10;vy=-5} }

    const body = Matter.Bodies.circle(sx, sy, radius, p)
    body._hw = radius; body._hh = radius
    const imgEl = new Image(); imgEl.src = imgUrl; body._imgEl = imgEl
    Matter.Body.setVelocity(body, { x:vx, y:vy })
    Matter.Body.setAngularVelocity(body, (Math.random()-0.5)*0.4)
    Matter.Composite.add(rainEngine.world, body)
  }
}

async function captureLottiePresetFrame(filename) {
  const data = await (await fetch(`Lottie/${filename}`)).json()
  const animW = data.w || 400, animH = data.h || 400
  const container = document.createElement('div')
  container.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${animW}px;height:${animH}px;overflow:hidden;`
  document.body.appendChild(container)
  return new Promise((resolve, reject) => {
    const anim = lottie.loadAnimation({ container, renderer:'canvas', loop:false, autoplay:false, animationData:data })
    anim.addEventListener('DOMLoaded', () => {
      anim.goToAndStop(Math.floor((anim.totalFrames || 10) * 0.1), true)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const lc = container.querySelector('canvas')
        if (lc && lc.width > 0) resolve(lc.toDataURL())
        else reject(new Error('canvas not ready'))
        anim.destroy(); container.remove()
      }))
    })
    anim.addEventListener('error', () => { container.remove(); reject(new Error('load error')) })
  })
}

function buildRainPresetList(files) {
  const list = document.getElementById('rain-preset-list')
  const section = document.getElementById('rain-preset-section')
  if (!list || !files.length) return
  section.style.display = ''
  files.forEach(filename => {
    const label = filename.replace(/\.json$/i, '')
    const item = document.createElement('div')
    item.dataset.filename = filename
    item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 8px;background:rgba(255,255,255,0.03);border:1px solid #2a2a2a;border-radius:5px;cursor:pointer;'
    item.innerHTML = `<div class="rp-dot" style="width:11px;height:11px;border-radius:50%;border:2px solid #555;background:transparent;flex-shrink:0;"></div><span class="rp-lbl" style="font-size:11px;color:#888;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${label}</span><span class="rp-status" style="font-size:9px;color:#555;flex-shrink:0;"></span>`
    item.addEventListener('click', () => toggleRainPreset(filename, item))
    list.appendChild(item)
  })
}

async function toggleRainPreset(filename, item) {
  const dot = item.querySelector('.rp-dot')
  const lbl = item.querySelector('.rp-lbl')
  const status = item.querySelector('.rp-status')
  if (rainSelectedPresets.has(filename)) {
    rainSelectedPresets.delete(filename)
    delete rainPresetCache[filename]
    item.style.background = 'rgba(255,255,255,0.03)'
    item.style.borderColor = '#2a2a2a'
    dot.style.borderColor = '#555'; dot.style.background = 'transparent'
    lbl.style.color = '#888'; status.textContent = ''
  } else {
    rainSelectedPresets.add(filename)
    item.style.background = 'rgba(74,96,255,0.08)'
    item.style.borderColor = 'rgba(74,96,255,0.4)'
    dot.style.borderColor = '#4A60FF'; dot.style.background = '#4A60FF'
    lbl.style.color = '#aac4ff'; status.textContent = '⋯'
    try {
      rainPresetCache[filename] = await captureLottiePresetFrame(filename)
      status.textContent = '✓'; status.style.color = '#4A60FF'
    } catch {
      rainSelectedPresets.delete(filename); delete rainPresetCache[filename]
      item.style.background = 'rgba(255,255,255,0.03)'; item.style.borderColor = '#2a2a2a'
      dot.style.borderColor = '#555'; dot.style.background = 'transparent'
      lbl.style.color = '#888'; status.textContent = '✗'; status.style.color = '#ff6b6b'
    }
  }
}

function setFontStatus(msg,color){
  const el=document.getElementById('font-status-msg')
  if(el){el.textContent=msg;el.style.color=color||'#737373'}
}
function addFontToSelect(family,label){
  if(loadedFonts.find(f=>f.family===family)) return
  loadedFonts.push({family,label})
  const sel=document.getElementById('font-select')
  const opt=document.createElement('option')
  opt.value=family; opt.textContent=label; sel.appendChild(opt)
}
BUNDLED_FONTS.forEach(f=>{
  const s=document.createElement('style')
  s.textContent=`@font-face{font-family:'${f.family}';src:url('${f.file}');font-weight:900;font-style:italic;}`
  document.head.appendChild(s)
})
Promise.all(BUNDLED_FONTS.map(f=>document.fonts.load(`900 italic 12px '${f.family}'`).catch(()=>[]))).then(()=>{
  BUNDLED_FONTS.forEach(f=>{ if(document.fonts.check(`900 italic 12px '${f.family}'`)) addFontToSelect(f.family,f.label) })
  if(loadedFonts.length>0){
    const match=loadedFonts.find(f=>f.family===S.currentFont)||loadedFonts[0]
    S.currentFont=match.family; S.fontLoaded=true
    setFontStatus(match.label+' caricato','#31A362')
    document.getElementById('font-select').value=S.currentFont
    recalcFont()
  } else { setFontStatus('Nessun font trovato — carica manualmente','#F0C500') }
})
document.getElementById('font-select').addEventListener('change',e=>{
  S.currentFont=e.target.value
  activeText().fontFamily=e.target.value
  recalcFont()
})
const fontZone=document.getElementById('font-zone'), fontInput=document.getElementById('font-input')
// Click listener removed, handled by label tag in HTML
fontZone.addEventListener('dragover',e=>{e.preventDefault();fontZone.classList.add('drag')})
fontZone.addEventListener('dragleave',()=>fontZone.classList.remove('drag'))
fontZone.addEventListener('drop',e=>{e.preventDefault();fontZone.classList.remove('drag');handleFontFile(e.dataTransfer.files[0])})
fontInput.addEventListener('change',()=>{handleFontFile(fontInput.files[0]);fontInput.value=''})
async function handleFontFile(file){
  if(!file) return
  if(!['.ttf','.otf','.woff','.woff2'].some(e=>file.name.toLowerCase().endsWith(e))) return
  try{
    const familyName=`uploaded-font-${uploadedFontCount++}`
    const face=new FontFace(familyName,await file.arrayBuffer(),{weight:'900',style:'italic'})
    await face.load(); document.fonts.add(face)
    const label=file.name.replace(/\.[^.]+$/,'')
    addFontToSelect(familyName,label)
    document.getElementById('font-select').value=familyName
    S.currentFont=familyName; S.fontLoaded=true
    activeText().fontFamily=familyName
    setFontStatus(label+' caricato','#31A362'); recalcFont()
  } catch(err){ setFontStatus('Errore caricamento font','#FF3EBA') }
}

function bindRange(id,key,valId,parse){
  const el=document.getElementById(id), ve=document.getElementById(valId)
  el.addEventListener('input',()=>{
    S[key]=parse(el.value)
    const v=parseFloat(el.value)
    ve.textContent=Number.isInteger(v)?v:v.toFixed(parseFloat(el.step)<0.1?2:1)
    recalcFont()
  })
}
bindRange('kerning','kerning','kerning-v',v=>parseFloat(v))
bindRange('lh','lineHeight','lh-v',v=>parseFloat(v))
bindRange('img-scale','imgScale','img-scale-v',v=>parseFloat(v))
bindRange('img-x','imgXPct','img-x-v',v=>parseFloat(v))
bindRange('img-y','imgYPct','img-y-v',v=>parseFloat(v))
bindRange('img-rotation','imgRotation','img-rotation-v',v=>parseFloat(v))
bindRange('img-opacity','imgOpacity','img-opacity-v',v=>parseFloat(v))
bindRange('img-corner-radius','imgCornerRadius','img-corner-radius-v',v=>parseInt(v))
bindRange('global-scale','globalScale','global-scale-v',v=>parseFloat(v))
bindRange('bg-corner-radius','bgCornerRadius','bg-corner-radius-v',v=>parseInt(v))
bindRange('duration','_dur','duration-v',v=>parseInt(v))
bindRange('fps','fps','fps-v',v=>parseInt(v))
bindRange('autoDelay','autoDelay','autoDelay-v',v=>parseInt(v))
bindRange('autoForce','autoForce','autoForce-v',v=>parseFloat(v))
bindRange('effectDuration','effectDuration','effectDuration-v',v=>parseInt(v))
bindRange('tremolio-force','tremolioForce','tremolio-force-v',v=>parseFloat(v))
bindRange('tremolio-speed','tremolioSpeed','tremolio-speed-v',v=>parseFloat(v))
document.getElementById('comp-pad-all').addEventListener('input',function(){
  const v=parseInt(this.value)
  S.compPadL=S.compPadR=S.compPadT=S.compPadB=v
  document.getElementById('comp-pad-all-v').textContent=v; recalcFont()
})
document.getElementById('tremolio-toggle').addEventListener('click',function(){
  S.tremolio=!S.tremolio
  this.textContent=S.tremolio?'ON':'OFF'
  this.classList.toggle('border-[#CEFF00]',S.tremolio)
  this.classList.toggle('text-[#CEFF00]',S.tremolio)
  const tc=document.getElementById('tremolio-controls')
  tc.style.display=S.tremolio?'flex':'none'; tc.style.flexDirection='column'
})
document.getElementById('rain-images-input').addEventListener('change', e => {
  for (const file of Array.from(e.target.files)) {
    const reader = new FileReader()
    reader.onload = ev => { rainImgUrls.push(ev.target.result); addRainPreviewThumb(ev.target.result) }
    reader.readAsDataURL(file)
  }
  e.target.value = ''
})
document.getElementById('rain-clear-images-btn').addEventListener('click', () => {
  rainImgUrls = []
  const p = document.getElementById('rain-preview'); p.innerHTML=''; p.style.display='none'
  document.getElementById('rain-clear-images-btn').style.display='none'
})
document.getElementById('rain-effect').addEventListener('change', e => {
  rainEffect = e.target.value; setRainGravity()
})
document.getElementById('rain-amount').addEventListener('input', e => {
  document.getElementById('rain-amount-v').textContent = e.target.value
})
document.getElementById('rain-size').addEventListener('input', e => {
  document.getElementById('rain-size-v').textContent = e.target.value
})
;['rain-chaos','rain-explosive','rain-loop'].forEach(id => {
  document.getElementById(id).addEventListener('click', function() {
    const on = this.textContent === 'OFF'
    this.textContent = on ? 'ON' : 'OFF'
    this.classList.toggle('border-[#4A60FF]', on)
    this.classList.toggle('text-[#4A60FF]', on)
    if (id==='rain-chaos')     rainModChaos = on
    if (id==='rain-explosive') rainModExplosive = on
    if (id==='rain-loop')      { rainIsLooping = on; if(rainEngine){ rainEngine.world.gravity.y = on ? 1.5 : rainEngine.gravity.y } }
  })
})
document.getElementById('rain-speed').addEventListener('input', e => {
  rainSpeed = parseFloat(e.target.value)
  document.getElementById('rain-speed-v').textContent = parseFloat(e.target.value).toFixed(1)
})
document.getElementById('rain-text-collision').addEventListener('click', function() {
  rainTextCollision = !rainTextCollision
  this.textContent = rainTextCollision ? 'ON' : 'OFF'
  this.classList.toggle('border-[#4A60FF]', rainTextCollision)
  this.classList.toggle('text-[#4A60FF]', rainTextCollision)
  if (!rainTextCollision && rainEngine?._textBodyMap) {
    rainEngine._textBodyMap.forEach(e => Matter.Composite.remove(rainEngine.world, e.body))
    rainEngine._textBodyMap.clear()
  }
})
document.getElementById('rain-spawn-btn').addEventListener('click', spawnRain)
document.getElementById('rain-clear-btn').addEventListener('click', clearRain)
document.getElementById('autoEffect').addEventListener('change',e=>{S.autoEffect=e.target.value})
document.getElementById('easingIn').addEventListener('change',e=>{S.easingIn=e.target.value})
document.getElementById('easingOut').addEventListener('change',e=>{S.easingOut=e.target.value})
document.querySelectorAll('.speed-preset').forEach(btn=>{
  btn.addEventListener('click',()=>{
    S.effectDuration=parseInt(btn.dataset.ms)
    document.getElementById('effectDuration').value=S.effectDuration
    document.getElementById('effectDuration-v').textContent=S.effectDuration
    document.querySelectorAll('.speed-preset').forEach(b=>b.classList.remove('active'))
    btn.classList.add('active')
  })
})
function syncTextUI(){
  const t=activeText()
  const ti=document.getElementById('text-input')
  if(ti) ti.value=t.text
  document.querySelectorAll('.align-btn').forEach(b=>b.classList.toggle('active',b.dataset.align===t.align))
  const fs=document.getElementById('font-select')
  if(fs && [...fs.options].some(o=>o.value===t.fontFamily)) fs.value=t.fontFamily
  const isTransparent=t.textColor==='rgba(0,0,0,0)'
  document.getElementById('text-dot').style.background=isTransparent
    ? 'repeating-conic-gradient(#c9c9c9 0% 25%, #ffffff 0% 50%) 50% / 10px 10px'
    : t.textColor
  document.getElementById('text-hex').textContent=isTransparent ? 'TRANSPARENT' : t.textColor.toUpperCase()
  syncTextLayerSelect()
  syncTextSliders()
}

function duplicateActiveText(){
  const t = activeText()
  const copy = {
    ...t,
    id: makeTextLayer('').id,
    textXPct: Math.min(100, t.textXPct + 2),
    textYPct: Math.min(100, t.textYPct + 2),
  }
  S.texts.push(copy)
  setActiveText(copy.id)
  recalcFont()
}

function removeActiveText(){
  if(S.texts.length<=1) return
  const idx=S.texts.findIndex(t=>t.id===S.activeTextId)
  if(idx<0) return
  S.texts.splice(idx,1)
  setActiveText(S.texts[Math.max(0,idx-1)].id)
  recalcFont()
}

function moveActiveTextLayer(dir){
  const idx=S.texts.findIndex(t=>t.id===S.activeTextId)
  const target=idx+dir
  if(idx<0 || target<0 || target>=S.texts.length) return
  const [item]=S.texts.splice(idx,1)
  S.texts.splice(target,0,item)
}

document.getElementById('text-layer-select').addEventListener('change',e=>setActiveText(e.target.value))
document.getElementById('text-add-btn').addEventListener('click',()=>{
  const t=makeTextLayer(`TESTO ${S.texts.length+1}`)
  t.label=`Testo ${S.texts.length+1}`
  S.texts.push(t)
  setActiveText(t.id)
  recalcFont()
})
document.getElementById('text-remove-btn').addEventListener('click',()=>{
  removeActiveText()
})
document.getElementById('text-input').addEventListener('input',e=>{ activeText().text=e.target.value||'A'; recalcFont(); syncTextLayerSelect() })
document.querySelectorAll('.fmt-btn').forEach(b=>b.addEventListener('click',()=>setFormat(b.dataset.fmt)))
document.querySelectorAll('.align-btn').forEach(b=>{
  b.addEventListener('click',()=>{
    activeText().align=b.dataset.align
    syncTextUI()
  })
})

function syncTextSliders(){
  const t=activeText()
  document.getElementById('text-x').value=t.textXPct
  document.getElementById('text-x-v').textContent=t.textXPct.toFixed(1)
  document.getElementById('text-y').value=t.textYPct
  document.getElementById('text-y-v').textContent=t.textYPct.toFixed(1)
  document.getElementById('text-scale').value=t.textScale
  document.getElementById('text-scale-v').textContent=t.textScale.toFixed(2)
  let rot=((t.textRotation%360)+360)%360
  if(rot>180) rot-=360
  rot=Math.max(-180,Math.min(180,rot))
  document.getElementById('text-rotation').value=rot
  document.getElementById('text-rotation-v').textContent=rot.toFixed(0)+'°'
}
document.getElementById('text-x').addEventListener('input',function(){
  activeText().textXPct=parseFloat(this.value)
  document.getElementById('text-x-v').textContent=parseFloat(this.value).toFixed(1)
})
document.getElementById('text-y').addEventListener('input',function(){
  activeText().textYPct=parseFloat(this.value)
  document.getElementById('text-y-v').textContent=parseFloat(this.value).toFixed(1)
})
document.getElementById('text-scale').addEventListener('input',function(){
  activeText().textScale=parseFloat(this.value)
  document.getElementById('text-scale-v').textContent=parseFloat(this.value).toFixed(2)
})
document.getElementById('text-rotation').addEventListener('input',function(){
  activeText().textRotation=parseFloat(this.value)
  document.getElementById('text-rotation-v').textContent=parseFloat(this.value).toFixed(0)+'°'
})
document.getElementById('reset-transform-btn').addEventListener('click',()=>{
  const t=activeText()
  t.textXPct=50; t.textYPct=50; t.textScale=1.0; t.textRotation=0
  syncTextSliders()
})

function updateColor(target,hex){
  const toCanvasColor = hex==='transparent' ? 'rgba(0,0,0,0)' : hex
  if(target==='bg'){
    S.bgColor=toCanvasColor
    const dot=document.getElementById('bg-dot')
    if(hex==='transparent' || toCanvasColor==='rgba(0,0,0,0)'){
      dot.style.background='repeating-conic-gradient(#c9c9c9 0% 25%, #ffffff 0% 50%) 50% / 10px 10px'
      document.getElementById('bg-hex').textContent='TRANSPARENT'
    } else {
      dot.style.background=hex
      document.getElementById('bg-hex').textContent=hex.toUpperCase()
    }
  } else {
    activeText().textColor=toCanvasColor
    const dot=document.getElementById('text-dot')
    if(hex==='transparent' || toCanvasColor==='rgba(0,0,0,0)'){
      dot.style.background='repeating-conic-gradient(#c9c9c9 0% 25%, #ffffff 0% 50%) 50% / 10px 10px'
      document.getElementById('text-hex').textContent='TRANSPARENT'
    } else {
      dot.style.background=hex
      document.getElementById('text-hex').textContent=hex.toUpperCase()
    }
  }
}

function shuffleColors() {
  const bg = PALETTE_COLORS[Math.floor(Math.random() * PALETTE_COLORS.length)]
  let text = PALETTE_COLORS[Math.floor(Math.random() * PALETTE_COLORS.length)]
  // Evitiamo che testo e sfondo siano identici a meno che non siano entrambi trasparenti (poco probabile)
  let attempts = 0
  while (text === bg && bg !== 'transparent' && attempts < 10) {
    text = PALETTE_COLORS[Math.floor(Math.random() * PALETTE_COLORS.length)]
    attempts++
  }
  updateColor('bg', bg)
  updateColor('text', text)
  // Feedback aptico se possibile
  if ('vibrate' in navigator) navigator.vibrate(15)
}
document.querySelectorAll('.color-target').forEach(el=>{
  el.addEventListener('click',()=>{
    S.paletteTarget=el.dataset.target
    document.querySelectorAll('.color-target').forEach(t=>t.classList.remove('selected'))
    el.classList.add('selected')
  })
})
PALETTE_COLORS.forEach(c=>{
  const el=document.createElement('div')
  el.className='flex-1 h-8 rounded-md cursor-pointer border-2 border-transparent transition-all hover:scale-105 hover:border-white/60'
  if(c==='transparent'){
    el.style.background='repeating-conic-gradient(#c9c9c9 0% 25%, #ffffff 0% 50%) 50% / 10px 10px'
    el.title='transparent'
  } else {
    el.style.background=c
    el.title=c
  }
  el.addEventListener('click',()=>updateColor(S.paletteTarget,c))
  document.getElementById('palette').appendChild(el)
})
updateColor('bg',S.bgColor); syncTextUI()

const uploadZone=document.getElementById('upload-zone'), fileInput=document.getElementById('file-input')
// Click listener removed, handled by label tag in HTML
uploadZone.addEventListener('dragover',e=>{e.preventDefault();uploadZone.classList.add('border-neutral-500','text-neutral-400')})
uploadZone.addEventListener('dragleave',()=>uploadZone.classList.remove('border-neutral-500','text-neutral-400'))
uploadZone.addEventListener('drop',e=>{e.preventDefault();uploadZone.classList.remove('border-neutral-500','text-neutral-400');handleImageFile(e.dataTransfer.files[0])})
fileInput.addEventListener('change',()=>{handleImageFile(fileInput.files[0]);fileInput.value=''})
function handleImageFile(file){
  if(!file?.type.startsWith('image/')) return
  const reader=new FileReader()
  reader.onload=e=>{
    const img=new Image()
    img.onload=()=>{
      S.image=img
      document.getElementById('img-thumb').src=e.target.result
      document.getElementById('img-thumb').style.display='block'
      ;['img-x-row','img-y-row','img-scale-row','img-rotation-row','img-opacity-row','img-corner-radius-row','remove-img'].forEach(id=>document.getElementById(id).style.display='grid')
      document.getElementById('remove-img').style.display='block'
    }
    img.src=e.target.result
  }
  reader.readAsDataURL(file)
}
document.getElementById('remove-img').addEventListener('click',()=>{
  S.image=null
  ;['img-thumb','img-x-row','img-y-row','img-scale-row','img-rotation-row','img-opacity-row','img-corner-radius-row','remove-img'].forEach(id=>document.getElementById(id).style.display='none')
})

function getCanvasPoint(e){
  const rect=canvas.getBoundingClientRect()
  return {
    x:(e.clientX-rect.left)*canvas.width/rect.width,
    y:(e.clientY-rect.top)*canvas.height/rect.height,
  }
}

function resetCanvasInteraction(){
  dragMode=null
  draggingLottieIdx=-1
  activeGuides.v = false
  activeGuides.h = false
  activeGuides.rot = false
}

function snapMove(cx, cy, w, h) {
  let sx = cx
  let sy = cy
  let snapped = false
  const centerX = w / 2
  const centerY = h / 2
  activeGuides.v = Math.abs(cx - centerX) <= SNAP_MOVE_PX
  activeGuides.h = Math.abs(cy - centerY) <= SNAP_MOVE_PX
  if (activeGuides.v) { sx = centerX; snapped = true }
  if (activeGuides.h) { sy = centerY; snapped = true }
  return { x: sx, y: sy, snapped }
}

function snapRotation(deg) {
  const baseAngles = [-180, -135, -90, -45, 0, 45, 90, 135, 180]
  let snappedDeg = deg
  let snapped = false
  for (const target of baseAngles) {
    if (Math.abs(deg - target) <= SNAP_ROT_DEG) {
      snappedDeg = target
      snapped = true
      break
    }
  }
  activeGuides.rot = snapped
  return { deg: snappedDeg, snapped }
}

function getTopTextAt(mx, my) {
  for(let i=S.texts.length-1;i>=0;i--){
    if(mouseInTextBox(mx,my,S.texts[i])) return S.texts[i]
  }
  return null
}

function getTextsAt(mx, my) {
  const hit=[]
  for(let i=0;i<S.texts.length;i++){
    if(mouseInTextBox(mx,my,S.texts[i])) hit.push(S.texts[i])
  }
  return hit
}

function clearLongPressTimer() {
  if (pressTimer) {
    clearTimeout(pressTimer)
    pressTimer = null
  }
}

function scheduleLongPress(e, mx, my) {
  if (e.pointerType !== 'touch') return
  clearLongPressTimer()
  pressStart = { pointerId:e.pointerId, mx, my }
  pressTimer = setTimeout(() => {
    const hits = getTextsAt(pressStart.mx, pressStart.my)
    if (hits.length > 1) {
      const idx = hits.findIndex(t => t.id === S.activeTextId)
      const next = hits[(idx + 1) % hits.length] || hits[0]
      setActiveText(next.id)
      hapticTick()
    } else if (hits.length === 1) {
      setActiveText(hits[0].id)
      hapticTick()
    }
    pressTimer = null
  }, LONG_PRESS_MS)
}

function maybeCancelLongPress(e, mx, my) {
  if (!pressTimer || !pressStart) return
  if (pressStart.pointerId !== e.pointerId) return
  const moved = Math.hypot(mx - pressStart.mx, my - pressStart.my)
  if (moved > LONG_PRESS_MOVE_TOL || dragMode || draggingLottieIdx >= 0) clearLongPressTimer()
}

canvas.addEventListener('pointerdown',e=>{
  if(touchGesture) return
  const {x:rx,y:ry}=getCanvasPoint(e)
  const {x:mx,y:my}=toLogical(rx,ry)
  const H=getHandlesLogical()
  
  // 1. Check Handles (if any active layer)
  if(H) {
    if(dist(mx,my,H.rot.x,H.rot.y)<=HANDLE_R*1.8){
      const ld = getActiveLayerData()
      const ang=Math.atan2(my-H.cy,mx-H.cx)
      dragMode='rotate'
      dragStart={mx,my,rotation:ld.rot,startAngle:ang,cx:H.cx,cy:H.cy}
      canvas.setPointerCapture(e.pointerId); e.preventDefault(); return
    }
    for(const key of ['tl','tr','bl','br']){
      const pt=H[key]
      if(dist(mx,my,pt.x,pt.y)<=HANDLE_R*1.8){
        const ld = getActiveLayerData()
        dragMode='scale'
        dragStart={mx,my,scale:ld.scale,cx:H.cx,cy:H.cy,startDist:dist(mx,my,H.cx,H.cy)}
        canvas.setPointerCapture(e.pointerId); e.preventDefault(); return
      }
    }
  }

  // 2. Select Lottie?
  const {w,h}=FORMATS[S.format]
  for(let i=S.lotties.length-1;i>=0;i--){
    const l=S.lotties[i]
    const lx=l.xPct/100*w, ly=l.yPct/100*h
    if(Math.abs(mx-lx)<l.animW*l.scale*0.5&&Math.abs(my-ly)<l.animH*l.scale*0.5){
      S.activeLayer = {type:'lottie', id:i}; setActiveLottie(i)
      draggingLottieIdx=i; lDragOffX=mx-lx; lDragOffY=my-ly
      dragMode='move'
      dragStart={mx,my,xPct:l.xPct,yPct:l.yPct}
      canvas.setPointerCapture(e.pointerId); e.preventDefault(); return
    }
  }

  // 3. Select Text?
  for(let i=S.texts.length-1;i>=0;i--){
    if(mouseInTextBox(mx,my,S.texts[i])){
      S.activeLayer = {type:'text', id:S.texts[i].id}; setActiveText(S.texts[i].id)
      dragMode='move'
      dragStart={mx,my,xPct:activeText().textXPct,yPct:activeText().textYPct}
      canvas.setPointerCapture(e.pointerId); e.preventDefault(); return
    }
  }

  // 4. Select Image?
  if(S.image) {
    const fit = Math.min(w*0.7/S.image.width, h*0.7/S.image.height)
    const iw = S.image.width * fit * S.imgScale, ih = S.image.height * fit * S.imgScale
    const ix = S.imgXPct/100*w, iy = S.imgYPct/100*h
    // Simple bbox check for rotation 0, or just proximity
    if(Math.abs(mx-ix)<iw/2 && Math.abs(my-iy)<ih/2) {
      S.activeLayer = {type:'image', id:'bgImage'}
      dragMode='move'
      dragStart={mx,my,xPct:S.imgXPct,yPct:S.imgYPct}
      canvas.setPointerCapture(e.pointerId); e.preventDefault(); return
    }
  }
}, { passive:false })

canvas.addEventListener('pointermove',e=>{
  if(touchGesture) return
  const {x:rx,y:ry}=getCanvasPoint(e)
  const {x:mx,y:my}=toLogical(rx,ry)
  const {w,h}=FORMATS[S.format]

  if(dragMode==='move'){
    const rawX = (dragStart.xPct/100*w)+(mx-dragStart.mx)
    const rawY = (dragStart.yPct/100*h)+(my-dragStart.my)
    const snapped = snapMove(rawX, rawY, w, h)
    updateActiveLayerProp('xPct', snapped.x/w*100)
    updateActiveLayerProp('yPct', snapped.y/h*100)
    if (snapped.snapped) hapticTick(); return
  }

  if(dragMode==='rotate'){
    const newAng=Math.atan2(my-dragStart.cy,mx-dragStart.cx)
    const delta=(newAng-dragStart.startAngle)*180/Math.PI
    const snapped = snapRotation(dragStart.rotation+delta)
    updateActiveLayerProp('rot', snapped.deg)
    if (snapped.snapped) hapticTick(); return
  }

  if(dragMode==='scale'){
    const d=dist(mx,my,dragStart.cx,dragStart.cy)
    if(dragStart.startDist>0) updateActiveLayerProp('scale', Math.max(0.05,Math.min(5.0,dragStart.scale*d/dragStart.startDist)))
    return
  }

  const H=getHandlesLogical()
  if(dist(mx,my,H.rot.x,H.rot.y)<=HANDLE_R*1.8){
    canvas.style.cursor='crosshair'
  } else if(['tl','tr','bl','br'].some(k=>dist(mx,my,H[k].x,H[k].y)<=HANDLE_R*1.8)){
    canvas.style.cursor='nwse-resize'
  } else if(S.lotties.some(l=>{
    const lx=l.xPct/100*w, ly=l.yPct/100*h
    return Math.abs(mx-lx)<l.animW*l.scale*0.5&&Math.abs(my-ly)<l.animH*l.scale*0.5
  })){
    canvas.style.cursor='move'
  } else if(mouseInTextBox(mx,my)){
    canvas.style.cursor='move'
    activeGuides.v = false
    activeGuides.h = false
    activeGuides.rot = false
  } else {
    canvas.style.cursor='default'
    activeGuides.v = false
    activeGuides.h = false
    activeGuides.rot = false
  }
}, { passive:false })

canvas.addEventListener('pointerup',e=>{
  clearLongPressTimer()
  pressStart = null
  resetCanvasInteraction()
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
})
canvas.addEventListener('pointercancel',e=>{
  clearLongPressTimer()
  pressStart = null
  resetCanvasInteraction()
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
})
canvas.addEventListener('mouseleave',()=>{
  clearLongPressTimer()
  pressStart = null
  resetCanvasInteraction()
})

function getTouchLogicalPoint(touch){
  const rect=canvas.getBoundingClientRect()
  const rx=(touch.clientX-rect.left)*canvas.width/rect.width
  const ry=(touch.clientY-rect.top)*canvas.height/rect.height
  return toLogical(rx,ry)
}
function touchDistance(a,b){ return Math.hypot(a.x-b.x,a.y-b.y) }
function touchAngle(a,b){ return Math.atan2(b.y-a.y,b.x-a.x) }

canvas.addEventListener('touchstart',e=>{
  if(e.touches.length!==2) return
  const p1=getTouchLogicalPoint(e.touches[0])
  const p2=getTouchLogicalPoint(e.touches[1])
  const mid={x:(p1.x+p2.x)/2,y:(p1.y+p2.y)/2}
  const t=activeText()
  touchGesture={
    startDist:touchDistance(p1,p2),
    startAngle:touchAngle(p1,p2),
    startScale:t.textScale,
    startRotation:t.textRotation,
    startMid:mid,
    startXPct:t.textXPct,
    startYPct:t.textYPct,
  }
  resetCanvasInteraction()
  e.preventDefault()
},{ passive:false })

canvas.addEventListener('touchmove',e=>{
  if(!touchGesture || e.touches.length!==2) return
  const {w,h}=FORMATS[S.format]
  const ld = getActiveLayerData(); if(!ld) return
  const p1=getTouchLogicalPoint(e.touches[0])
  const p2=getTouchLogicalPoint(e.touches[1])
  const mid={x:(p1.x+p2.x)/2,y:(p1.y+p2.y)/2}
  const curDist=touchDistance(p1,p2)
  const curAngle=touchAngle(p1,p2)
  if(touchGesture.startDist>0){
    updateActiveLayerProp('scale', Math.max(0.05,Math.min(5.0,touchGesture.startScale*(curDist/touchGesture.startDist))))
  }
  const rotSnap = snapRotation(touchGesture.startRotation + ((curAngle-touchGesture.startAngle)*180/Math.PI))
  updateActiveLayerProp('rot', rotSnap.deg)
  const rawX = (touchGesture.startXPct/100*w) + (mid.x-touchGesture.startMid.x)
  const rawY = (touchGesture.startYPct/100*h) + (mid.y-touchGesture.startMid.y)
  const moveSnap = snapMove(rawX, rawY, w, h)
  updateActiveLayerProp('xPct', moveSnap.x/w*100)
  updateActiveLayerProp('yPct', moveSnap.y/h*100)
  if (rotSnap.snapped || moveSnap.snapped) hapticTick()
  e.preventDefault()
},{ passive:false })

canvas.addEventListener('touchend',e=>{
  if(e.touches.length<2){
    touchGesture=null
    activeGuides.v = false
    activeGuides.h = false
    activeGuides.rot = false
  }
},{ passive:false })
canvas.addEventListener('touchcancel',()=>{
  touchGesture=null
  activeGuides.v = false
  activeGuides.h = false
  activeGuides.rot = false
},{ passive:false })

function setLottieStatus(msg,color){ const el=document.getElementById('lottie-status'); if(el){el.textContent=msg;el.style.color=color||'#737373'} }
function setActiveLottie(idx){
  S.activeLottieIdx=idx
  S.activeLayer = { type:'lottie', id:idx }
  document.querySelectorAll('.lottie-item').forEach((el,i)=>el.classList.toggle('lottie-active',i===idx))
  const ctrl=document.getElementById('lottie-controls')
  if(idx>=0){ctrl.classList.remove('hidden');syncLottieSliders()} else ctrl.classList.add('hidden')
}
function syncLottieSliders(){
  const l=S.lotties[S.activeLottieIdx]; if(!l) return
  const set=(id,v,dec)=>{ document.getElementById(id).value=v; document.getElementById(id+'-v').textContent=dec!=null?v.toFixed(dec):v }
  set('lottie-x',l.xPct,0); set('lottie-y',l.yPct,0); set('lottie-scale',l.scale,2); set('lottie-opacity',l.opacity,2)
  document.getElementById('lottie-rotation').value=l.rotation
  document.getElementById('lottie-rotation-v').textContent=l.rotation+'°'
}
function rebuildLottieList(){
  const list=document.getElementById('lottie-list'); list.innerHTML=''
  S.lotties.forEach((l,i)=>{
    const item=document.createElement('div')
    item.className='lottie-item flex items-center gap-2 p-2 bg-neutral-800 border border-neutral-700 rounded-md cursor-pointer transition-colors hover:bg-neutral-700'
    item.dataset.idx=i
    item.innerHTML=`<span class="flex-1 text-xs truncate text-neutral-300">${l.label}</span><button class="lottie-remove shrink-0 text-neutral-500 hover:text-red-400 text-xs px-1 transition-colors" data-idx="${i}">✕</button>`
    item.addEventListener('click',e=>{ if(!e.target.classList.contains('lottie-remove')) setActiveLottie(i) })
    item.querySelector('.lottie-remove').addEventListener('click',e=>{ e.stopPropagation(); removeLottie(i) })
    list.appendChild(item)
  })
  if(S.activeLottieIdx>=0){ const items=document.querySelectorAll('.lottie-item'); if(items[S.activeLottieIdx]) items[S.activeLottieIdx].classList.add('lottie-active') }
  rebuildRainStickerList()
}
function removeLottie(idx){
  S.lotties[idx].anim.destroy(); S.lotties[idx].container.remove(); S.lotties.splice(idx,1)
  const next = new Set(); rainSelectedLottieIdxs.forEach(i => { if(i<idx) next.add(i); else if(i>idx) next.add(i-1) }); rainSelectedLottieIdxs.clear(); next.forEach(i=>rainSelectedLottieIdxs.add(i))
  if(S.activeLottieIdx>=idx) S.activeLottieIdx=Math.max(-1,S.activeLottieIdx-1); rebuildLottieList(); setActiveLottie(S.activeLottieIdx)
}
async function loadLottieJSON(file){
  if(typeof lottie==='undefined'){ setLottieStatus('Lottie non disponibile','#FF3EBA'); return }
  let data; try{ data=JSON.parse(await file.text()) } catch{ setLottieStatus('JSON non valido: '+file.name,'#FF3EBA'); return }
  const animW=data.w||400, animH=data.h||400
  const container=document.createElement('div')
  container.style.cssText=`position:fixed;top:-9999px;left:-9999px;width:${animW}px;height:${animH}px;pointer-events:none;overflow:hidden;`
  document.body.appendChild(container)
  const anim=lottie.loadAnimation({container,renderer:'canvas',loop:true,autoplay:true,animationData:data})
  anim.addEventListener('error',()=>setLottieStatus('Errore animazione: '+file.name,'#FF3EBA'))
  const label=file.name.replace(/\.json$/i,'')
  S.lotties.push({anim,container,label,animW,animH,xPct:50,yPct:50,scale:1.0,opacity:1.0,rotation:0})
  rebuildLottieList(); setActiveLottie(S.lotties.length-1); setLottieStatus(label+' caricato','#31A362')
}
const lottieZone=document.getElementById('lottie-zone'), lottieInput=document.getElementById('lottie-input')
// Click listener removed, handled by label tag in HTML
lottieZone.addEventListener('dragover',e=>{e.preventDefault();lottieZone.classList.add('border-neutral-500')})
lottieZone.addEventListener('dragleave',()=>lottieZone.classList.remove('border-neutral-500'))
lottieZone.addEventListener('drop',e=>{e.preventDefault();lottieZone.classList.remove('border-neutral-500');Array.from(e.dataTransfer.files).filter(f=>f.name.toLowerCase().endsWith('.json')).forEach(loadLottieJSON)})
lottieInput.addEventListener('change',()=>{ Array.from(lottieInput.files).forEach(loadLottieJSON); lottieInput.value='' })
async function loadLottieFromURL(url,label){
  if(typeof lottie==='undefined') return
  let data; try{ data=await(await fetch(url)).json() } catch{ setLottieStatus('Errore: '+label,'#FF3EBA'); return }
  const animW=data.w||400, animH=data.h||400
  const container=document.createElement('div')
  container.style.cssText=`position:absolute;left:-9999px;top:-9999px;pointer-events:none;width:${animW}px;height:${animH}px;`
  document.body.appendChild(container)
  const anim=lottie.loadAnimation({container,renderer:'canvas',loop:true,autoplay:true,animationData:data})
  anim.addEventListener('error',()=>setLottieStatus('Errore: '+label,'#FF3EBA'))
  S.lotties.push({anim,container,label,animW,animH,xPct:50,yPct:50,scale:1.0,opacity:1.0,rotation:0})
  rebuildLottieList(); setActiveLottie(S.lotties.length-1); setLottieStatus(label+' caricato','#31A362')
}
;(async()=>{
  try{
    let files
    const apiRes=await fetch('/api/lotties')
    if(apiRes.ok){ files=await apiRes.json() } else { const r=await fetch('Lottie/index.json'); if(!r.ok) return; files=await r.json() }
    files=files.filter(f=>f.toLowerCase()!=='index.json')
    if(!files.length) return
    const row=document.getElementById('lottie-preset-row'), sel=document.getElementById('lottie-select')
    row.classList.remove('hidden')
    files.forEach(f=>{ const opt=document.createElement('option'); opt.value=f; opt.textContent=f.replace(/\.json$/i,''); sel.appendChild(opt) })
    buildRainPresetList(files)
  } catch{}
})()
document.getElementById('lottie-add-btn').addEventListener('click',()=>{
  const sel=document.getElementById('lottie-select'), file=sel.value
  if(!file) return; loadLottieFromURL(`Lottie/${file}`,file.replace(/\.json$/i,''))
})
;['x','y','scale','opacity','rotation'].forEach(key=>{
  const el=document.getElementById(`lottie-${key}`), ve=document.getElementById(`lottie-${key}-v`)
  if(!el||!ve) return
  el.addEventListener('input',()=>{
    const l=S.lotties[S.activeLottieIdx]; if(!l) return
    const v=parseFloat(el.value)
    const prop=key==='x'?'xPct':key==='y'?'yPct':key
    l[prop]=v
    ve.textContent=key==='rotation'?v+'°':(Number.isInteger(v)?v:v.toFixed(2))
  })
})

function triggerDownload(url, filename) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

let recorder=null, recChunks=[], recActive=false
document.getElementById('rec-btn').addEventListener('click',()=>{
  if(recActive){ recorder?.stop(); return }
  const dur=parseInt(document.getElementById('duration').value)*1000
  const mimeType=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'].find(m=>MediaRecorder.isTypeSupported(m))||'video/webm'
  recorder=new MediaRecorder(canvas.captureStream(S.fps),{mimeType,videoBitsPerSecond:12_000_000})
  hideTransformHandles=true
  recChunks=[]
  recorder.ondataavailable=e=>{ if(e.data.size>0) recChunks.push(e.data) }
  recorder.onstop=()=>{
    const url = URL.createObjectURL(new Blob(recChunks,{type:mimeType}))
    triggerDownload(url, `video_${S.format}_${Date.now()}.webm`)
    setTimeout(()=>URL.revokeObjectURL(url), 10000)
    hideTransformHandles=false
    recActive=false; document.getElementById('rec-btn').textContent='Export WEBM'
    document.getElementById('rec-status').textContent='Download completato'
    setTimeout(()=>document.getElementById('rec-status').textContent='',3000)
  }
  recorder.start(); recActive=true
  document.getElementById('rec-btn').textContent='Stop'
  document.getElementById('rec-status').textContent=`Registrazione... ${dur/1000}s`
  setTimeout(()=>{ if(recorder?.state!=='inactive') recorder.stop() },dur)
})

let mp4MuxerMod=null, isCapturing=false
let seqZipMod=null, isExportingSequence=false
async function getMuxer(){ if(mp4MuxerMod) return mp4MuxerMod; mp4MuxerMod=await import('https://cdn.jsdelivr.net/npm/mp4-muxer@5/build/mp4-muxer.mjs'); return mp4MuxerMod }
function setMP4Status(msg, progress){
  const el = document.getElementById('mp4-status'); if(el) el.textContent=msg
  const overlay = document.getElementById('export-overlay')
  const statusMsg = document.getElementById('export-status-msg')
  const bar = document.getElementById('export-progress-bar')
  
  if (overlay && !overlay.hidden) {
    if (statusMsg) statusMsg.textContent = msg
    if (bar && progress !== undefined) bar.style.width = progress + '%'
  }
}

function showExportOverlay() {
  const overlay = document.getElementById('export-overlay')
  const bar = document.getElementById('export-progress-bar')
  if (overlay) {
    overlay.hidden = false
    if (bar) bar.style.width = '0%'
  }
}

function hideExportOverlay() {
  const overlay = document.getElementById('export-overlay')
  if (overlay) overlay.hidden = true
}
async function getZipLib(){ if(seqZipMod) return seqZipMod.default || seqZipMod; seqZipMod=await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm'); return seqZipMod.default || seqZipMod }
function setSeqStatus(msg){ document.getElementById('seq-status').textContent=msg }
function canvasToPngBlob(){
  return new Promise((resolve,reject)=>{
    canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG encode failed')),'image/png')
  })
}

// -------------------------------------------------------------
// FIX DEFINITIVO PER SAFARI / WEBMUXER
// Intercetta qualunque difetto nei metadati e impedisce il crash
// -------------------------------------------------------------
document.getElementById('mp4-btn').addEventListener('click', async () => {
  if (isCapturing) return
  if (!window.VideoEncoder) { setMP4Status('Errore: WebCodecs non supportato'); return }
  isCapturing = true
  showExportOverlay()
  setMP4Status('Caricamento mp4-muxer...', 5)
  const btn = document.getElementById('mp4-btn'); btn.disabled = true; btn.textContent = 'In corso...'
  const dur = parseInt(document.getElementById('duration').value), fps = S.fps, total = dur * fps
  const { w, h } = FORMATS[S.format]
  
  try {
    setMP4Status('Caricamento mp4-muxer...')
    const { Muxer, ArrayBufferTarget } = await getMuxer()
    const target = new ArrayBufferTarget()
    
    // FORZIAMO il colorSpace nel costruttore per evitare che mp4-muxer crashi su Safari 
    // se l'encoder non lo fornisce immediatamente o lo fornisce nullo.
    const muxer = new Muxer({ 
      target, 
      video: { 
        codec: 'avc', 
        width: w, 
        height: h,
        colorSpace: {
          primaries: 'bt709',
          transfer: 'bt709',
          matrix: 'bt709',
          fullRange: false
        }
      }, 
      fastStart: 'in-memory' 
    })
    
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        // DEBUG — rimuovere dopo il debug
        try {
          console.log('[MP4-DEBUG] chunk type:', chunk.type, '| meta:', JSON.stringify(meta, (k, v) => v instanceof ArrayBuffer ? `ArrayBuffer(${v.byteLength})` : v));
          console.log('[MP4-DEBUG] meta===null:', meta === null, '| meta===undefined:', meta === undefined);
          if (meta) {
            console.log('[MP4-DEBUG] meta.decoderConfig:', JSON.stringify(meta.decoderConfig, (k, v) => v instanceof ArrayBuffer ? `ArrayBuffer(${v.byteLength})` : v));
            if (meta.decoderConfig) {
              console.log('[MP4-DEBUG] meta.decoderConfig.colorSpace:', JSON.stringify(meta.decoderConfig.colorSpace));
            }
          }
        } catch(logErr) { console.warn('[MP4-DEBUG] log error:', logErr) }

        let safeMeta = meta;

        if (meta) {
          if (meta.decoderConfig) {
            safeMeta = {
              ...meta,
              decoderConfig: {
                ...meta.decoderConfig,
                colorSpace: meta.decoderConfig.colorSpace || {
                  primaries: 'bt709',
                  transfer: 'bt709',
                  matrix: 'bt709',
                  fullRange: false
                }
              }
            };
          } else {
            const { decoderConfig: _, ...rest } = meta;
            safeMeta = rest;
          }
        }

        console.log('[MP4-DEBUG] safeMeta prima di addVideoChunk:', JSON.stringify(safeMeta, (k, v) => v instanceof ArrayBuffer ? `ArrayBuffer(${v.byteLength})` : v));
        try {
          muxer.addVideoChunk(chunk, safeMeta);
        } catch(muxErr) {
          console.error('[MP4-DEBUG] CRASH in addVideoChunk:', muxErr, '| safeMeta era:', JSON.stringify(safeMeta, (k, v) => v instanceof ArrayBuffer ? `ArrayBuffer(${v.byteLength})` : v));
          throw muxErr;
        }
      },
      error: e => { throw e }
    });
    
    // Usiamo un profilo Main (4D) e un bitrate più conservativo per stabilità mobile
    encoder.configure({ codec: 'avc1.4D002A', width: w, height: h, bitrate: 8_000_000, framerate: fps })
    
    hideTransformHandles = true
    isPaused = true; lastAutoTriggerTime = -Infinity
    S.lotties.forEach(l => l.anim.pause())
    spawnRainForExport()
    if (rainEngine) {
      await Promise.all(
        Matter.Composite.allBodies(rainEngine.world)
          .filter(b => !b.isStatic && b._imgEl)
          .map(b => new Promise(r => {
            if (b._imgEl.complete && b._imgEl.naturalWidth > 0) { r(); return }
            b._imgEl.onload = r; b._imgEl.onerror = r
          }))
      )
    }

    for (let i = 0; i < total; i++) {
      // Sincronizziamo ogni lottie al frame esatto
      S.lotties.forEach(l => { 
        const f = ((i / fps) * l.anim.frameRate) % l.anim.totalFrames; 
        l.anim.goToAndStop(f, true); 
      });
      
      // Piccolo trucco: attendiamo un istante per assicurarci che il renderer canvas di Lottie abbia finito
      if (S.lotties.length > 0) {
        await new Promise(r => requestAnimationFrame(r));
      }

      drawFrame((i / fps) * 1000);
      
      const frameDuration = Math.round(1_000_000 / fps);
      const frame = new VideoFrame(canvas, { timestamp: Math.round((i / fps) * 1_000_000), duration: frameDuration });
      
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();

      // Feedback più frequente e respiro per il thread principale su mobile
      if (i % 10 === 0) {
        const progress = Math.round((i / total) * 90) + 5
        setMP4Status(`Rendering frame ${i + 1}/${total}...`, progress);
        await new Promise(r => setTimeout(r, 5)); // Throttling per evitare crash di memoria
      }
    }
    
    isPaused = false; S.lotties.forEach(l => l.anim.play()); hideTransformHandles = false
    setMP4Status('Finalizzazione MP4...', 95)
    await encoder.flush(); muxer.finalize()
    
    const blob = new Blob([target.buffer], { type: 'video/mp4' })
    const url = URL.createObjectURL(blob)
    triggerDownload(url, `video_${S.format}_${Date.now()}.mp4`)
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    
    setMP4Status('Download completato!', 100)
    setTimeout(() => { setMP4Status(''); hideExportOverlay() }, 2000)
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : String(err);
    setMP4Status('Errore: ' + msg);
    setTimeout(hideExportOverlay, 4000)
    isPaused = false; S.lotties.forEach(l => l.anim.play()); hideTransformHandles = false
  }
  btn.disabled = false; btn.textContent = 'Export MP4'; isCapturing = false
})

document.getElementById('seq-btn').addEventListener('click',async()=>{
  if(isExportingSequence) return
  isExportingSequence=true
  const btn=document.getElementById('seq-btn'); btn.disabled=true; btn.textContent='In corso...'
  const dur=parseInt(document.getElementById('duration').value), fps=S.fps, total=dur*fps
  try{
    setSeqStatus('Caricamento zip...')
    const JSZip=await getZipLib()
    const zip=new JSZip()
    isPaused=true; hideTransformHandles=true; lastAutoTriggerTime=-Infinity
    S.lotties.forEach(l=>l.anim.pause())
    for(let i=0;i<total;i++){
      S.lotties.forEach(l=>{ const f=((i/fps)*l.anim.frameRate)%l.anim.totalFrames; l.anim.goToAndStop(f,true) })
      drawFrame((i/fps)*1000)
      const blob=await canvasToPngBlob()
      zip.file(`frame_${String(i+1).padStart(5,'0')}.png`, blob)
      if(i%10===0){ setSeqStatus(`Render frame ${i+1}/${total}...`); await new Promise(r=>setTimeout(r,0)) }
    }
    isPaused=false; hideTransformHandles=false; S.lotties.forEach(l=>l.anim.play())
    setSeqStatus('Compressione zip...')
    const zipBlob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}})
    const url=URL.createObjectURL(zipBlob)
    triggerDownload(url, `frames_${S.format}_${Date.now()}.zip`)
    setTimeout(()=>URL.revokeObjectURL(url),10000)
    setSeqStatus('Download sequenza completato'); setTimeout(()=>setSeqStatus(''),4000)
  } catch(err){
    console.error(err)
    setSeqStatus('Errore: '+(err.message||err))
    isPaused=false; hideTransformHandles=false; S.lotties.forEach(l=>l.anim.play())
  }
  btn.disabled=false; btn.textContent='Export PNG Sequence'; isExportingSequence=false
})

const PRESET_KEYS=['format','kerning','lineHeight','fps','bgColor',
  'imgScale','imgOpacity','imgCornerRadius','autoEffect','autoDelay','autoForce','effectDuration',
  'easingIn','easingOut','tremolio','tremolioForce','tremolioSpeed',
  'globalScale','compPadL','compPadR','compPadT','compPadB','bgCornerRadius','currentFont']
function savePreset(){
  const name=document.getElementById('preset-name').value.trim()||'preset'
  const data={_name:name}; PRESET_KEYS.forEach(k=>{data[k]=S[k]})
  data.texts=S.texts
  data.activeTextId=S.activeTextId
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'})
  const url = URL.createObjectURL(blob)
  triggerDownload(url, name.replace(/\s+/g,'_')+'.json')
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
function applyPreset(data){
  PRESET_KEYS.forEach(k=>{ if(k in data) S[k]=data[k] })
  if(Array.isArray(data.texts) && data.texts.length){
    S.texts=data.texts.map(t=>({
      ...makeTextLayer(''),
      ...t,
      id:t.id||makeTextLayer('').id,
      text:t.text||'',
      align:t.align||'center',
      textColor:t.textColor||'#F7F6EB',
      fontFamily:t.fontFamily||S.currentFont,
    }))
    S.activeTextId=(data.activeTextId && S.texts.some(t=>t.id===data.activeTextId)) ? data.activeTextId : S.texts[0].id
  } else {
    const legacy=makeTextLayer(data.text||'DESIGN BOMB!!!')
    legacy.align=data.align||'center'
    legacy.textColor=data.textColor||'#F7F6EB'
    legacy.fontFamily=data.currentFont||S.currentFont
    legacy.textXPct=('textXPct' in data)?data.textXPct:50
    legacy.textYPct=('textYPct' in data)?data.textYPct:50
    legacy.textScale=('textScale' in data)?data.textScale:1
    legacy.textRotation=('textRotation' in data)?data.textRotation:0
    S.texts=[legacy]
    S.activeTextId=legacy.id
  }
  const rmap={'kerning':'kerning-v','lh':'lh-v','img-scale':'img-scale-v','img-opacity':'img-opacity-v',
    'img-corner-radius':'img-corner-radius-v','fps':'fps-v','autoDelay':'autoDelay-v','autoForce':'autoForce-v',
    'effectDuration':'effectDuration-v','tremolio-force':'tremolio-force-v','tremolio-speed':'tremolio-speed-v',
    'global-scale':'global-scale-v','comp-pad-all':'comp-pad-all-v','bg-corner-radius':'bg-corner-radius-v'}
  const smap={'kerning':'kerning','lh':'lineHeight','img-scale':'imgScale','img-opacity':'imgOpacity',
    'img-corner-radius':'imgCornerRadius','fps':'fps','autoDelay':'autoDelay','autoForce':'autoForce',
    'effectDuration':'effectDuration','tremolio-force':'tremolioForce','tremolio-speed':'tremolioSpeed',
    'global-scale':'globalScale','comp-pad-all':'compPadL','bg-corner-radius':'bgCornerRadius'}
  Object.keys(rmap).forEach(id=>{
    const el=document.getElementById(id), ve=document.getElementById(rmap[id])
    if(!el||!ve) return
    const v=S[smap[id]]; if(v==null) return
    el.value=v; ve.textContent=Number.isInteger(v)?v:v.toFixed(Number.isInteger(parseFloat(el.step))?1:2)
  })
  ;['autoEffect','easingIn','easingOut'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=S[id]})
  if(S.currentFont){const fs=document.getElementById('font-select');if(fs&&[...fs.options].some(o=>o.value===S.currentFont))fs.value=S.currentFont}
  document.querySelectorAll('.fmt-btn').forEach(b=>b.classList.toggle('active',b.dataset.fmt===S.format))
  updateColor('bg',S.bgColor); syncTextUI()
  const tt=document.getElementById('tremolio-toggle')
  if(tt){ tt.textContent=S.tremolio?'ON':'OFF'; tt.classList.toggle('border-[#CEFF00]',S.tremolio); tt.classList.toggle('text-[#CEFF00]',S.tremolio); const tc=document.getElementById('tremolio-controls');if(tc){tc.style.display=S.tremolio?'flex':'none';tc.style.flexDirection='column'} }
  setFormat(S.format); recalcFont(); syncTextUI()
}
document.getElementById('preset-save-btn').addEventListener('click',savePreset)
document.getElementById('preset-load-input').addEventListener('change',function(){
  const file=this.files[0];if(!file) return
  const reader=new FileReader()
  reader.onload=e=>{
    try{
      const data=JSON.parse(e.target.result); applyPreset(data)
      document.getElementById('preset-status').textContent='Preset "'+(data._name||file.name)+'" caricato'
      setTimeout(()=>{document.getElementById('preset-status').textContent=''},3000)
      if(data._name) document.getElementById('preset-name').value=data._name
    } catch{ document.getElementById('preset-status').textContent='File non valido' }
  }
  reader.readAsText(file); this.value=''
})

;(function setupMobileControls(){
  const app = document.querySelector('.app')
  const sidebar = document.getElementById('controls')
  const toggleBtn = document.getElementById('mobile-controls-toggle')
  const backdrop = document.getElementById('mobile-backdrop')
  if(!app || !sidebar || !toggleBtn || !backdrop) return

  const mq = window.matchMedia('(max-width: 860px)')

  function setOpen(open){
    app.classList.toggle('mobile-controls-open', open)
    toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false')
    toggleBtn.textContent = open ? 'Chiudi controlli' : 'Controlli'
    backdrop.hidden = !open
    document.body.classList.toggle('mobile-ui-lock', open && mq.matches)
  }

  function syncByViewport(){
    if(!mq.matches) {
      setOpen(false)
      toggleBtn.style.display = 'none'
    } else {
      toggleBtn.style.display = 'inline-flex'
    }
  }

  toggleBtn.addEventListener('click', () => {
    const isOpen = app.classList.contains('mobile-controls-open')
    setOpen(!isOpen)
  })
  backdrop.addEventListener('click', () => setOpen(false))
  window.addEventListener('keydown', e => {
    if(e.key === 'Escape' && app.classList.contains('mobile-controls-open')) setOpen(false)
  })
  mq.addEventListener('change', syncByViewport)
  syncByViewport()
})()

setFormat('post')
syncTextUI()
loop()

;(function(){
  const sel=document.getElementById('lottie-select')
  const addBtn=document.getElementById('lottie-add-btn')
  const row=document.getElementById('lottie-preset-row')
  const gallery=document.getElementById('lottie-gallery')
  if(!sel||!gallery) return
  const built=new Set()
  function build(){
    [...sel.options].forEach(opt=>{
      if(!opt.value||built.has(opt.value)) return
      built.add(opt.value); row.classList.remove('hidden')
      const card=document.createElement('button')
      card.type='button'; card.className='lot-card'; card.title=opt.textContent
      card.innerHTML=`<div class="lot-thumb" data-src="Lottie/${opt.value}"></div><span class="lot-label">${opt.textContent}</span>`
      card.addEventListener('click',()=>{ sel.value=opt.value; addBtn.click() })
      gallery.appendChild(card)
    })
  }
  new MutationObserver(build).observe(sel,{childList:true}); build()
  const io=new IntersectionObserver((entries)=>{
    entries.forEach(async(entry)=>{
      if(!entry.isIntersecting) return
      const el=entry.target; if(el.dataset.loaded) return
      el.dataset.loaded='1'; io.unobserve(el)
      try{
        const res=await fetch(el.dataset.src), data=await res.json()
        if(typeof lottie==='undefined') return
        lottie.loadAnimation({container:el,renderer:'svg',loop:true,autoplay:true,animationData:data,rendererSettings:{preserveAspectRatio:'xMidYMid meet'}})
      } catch{}
    })
  }, { threshold: 0.1 })
  new MutationObserver(()=>{ gallery.querySelectorAll('.lot-thumb:not([data-loaded])').forEach(t=>io.observe(t)) }).observe(gallery,{childList:true})
  gallery.querySelectorAll('.lot-thumb').forEach(t=>io.observe(t))
})()

function syncImageSliders(){
  if(!S.image) return
  const set=(id,v,dec)=>{ const el=document.getElementById(id); if(el){el.value=v; const ve=document.getElementById(id+'-v'); if(ve) ve.textContent=dec!=null?v.toFixed(dec):v} }
  set('img-x',S.imgXPct,0); set('img-y',S.imgYPct,0); set('img-scale',S.imgScale,2); set('img-rotation',S.imgRotation,0); set('img-opacity',S.imgOpacity,2)
}

// Mobile Quick Actions
const colorDrawer = document.getElementById('color-drawer')
const stickerDrawer = document.getElementById('sticker-drawer')
const formatDrawer = document.getElementById('format-drawer')
const imageDrawer = document.getElementById('image-drawer')

function toggleDrawer(drawer) {
  const drawers = [colorDrawer, stickerDrawer, formatDrawer, imageDrawer]
  drawers.forEach(d => {
    if (d !== drawer && d.classList.contains('open')) {
      d.classList.remove('open')
      setTimeout(() => { d.hidden = true }, 350)
    }
  })

  const isOpen = drawer.classList.contains('open')
  if (!isOpen) {
    drawer.hidden = false
    // When opening a drawer, set the active layer accordingly
    if(drawer === imageDrawer) { S.activeLayer = {type:'image', id:'bgImage'} }
    else if(drawer === stickerDrawer) { S.activeLayer = {type:'lottie', id:S.activeLottieIdx} }
    else if(drawer === colorDrawer) { /* color is global */ }
    
    setTimeout(() => drawer.classList.add('open'), 10)
  } else {
    drawer.classList.remove('open')
    setTimeout(() => { if (!drawer.classList.contains('open')) drawer.hidden = true }, 350)
  }
}

document.getElementById('desktop-color-btn')?.addEventListener('click', () => toggleDrawer(colorDrawer))
document.getElementById('close-color-drawer')?.addEventListener('click', () => {
  colorDrawer.classList.remove('open')
  setTimeout(() => { colorDrawer.hidden = true }, 350)
})

document.getElementById('desktop-sticker-btn')?.addEventListener('click', () => toggleDrawer(stickerDrawer))
document.getElementById('close-sticker-drawer')?.addEventListener('click', () => {
  stickerDrawer.classList.remove('open')
  setTimeout(() => { stickerDrawer.hidden = true }, 350)
})

document.getElementById('desktop-format-btn')?.addEventListener('click', () => toggleDrawer(formatDrawer))
document.getElementById('close-format-drawer')?.addEventListener('click', () => {
  formatDrawer.classList.remove('open')
  setTimeout(() => { formatDrawer.hidden = true }, 350)
})

document.getElementById('desktop-image-btn')?.addEventListener('click', () => toggleDrawer(imageDrawer))
document.getElementById('close-image-drawer')?.addEventListener('click', () => {
  imageDrawer.classList.remove('open')
  setTimeout(() => { imageDrawer.hidden = true }, 350)
})

document.getElementById('mobile-mp4-btn')?.addEventListener('click', () => {
  const sidebarBtn = document.getElementById('mp4-btn')
  if (sidebarBtn) sidebarBtn.click()
})
