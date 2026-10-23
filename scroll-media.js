/* scroll-media.js — three pieces from nazarii-d.netlify.app, framework-free:
   1. Custom HTML block: your own HTML/CSS/JS in a sandboxed iframe (can't touch the page, the page can't touch it);
      on phones it's laid out at its desktop width and scaled down, so it looks like the desktop version.
   2. Scroll video: a clip that sticks in the middle of the screen and plays exactly with the scroll (backwards too).
      The clip is turned into an image sequence first, because seeking a <video> per scroll step stutters.
   3. Scroll video with mask: the same, but the frame opens from a smaller, rounded cut-out to full size as it comes in.
   Usage: <script src="scroll-media.js" defer></script>, markup as in the README. Options: ScrollMedia.options before
   DOMContentLoaded, or call ScrollMedia.init({...}) yourself. */
(function () {
  const DEFAULTS = {
    rate: 0.5,          // screens of scroll per second of clip
    hold: 0.1,          // screens the last frame stays stuck before the block scrolls on
    nav: null,          // selector of a fixed header: the pinned block centres under it (null = whole window)
    maskPart: 0.2,      // share of the clip by which the mask has fully opened
    maskFrom: 0.8,      // starting size of the mask, as a share of the frame
    fps: 30,            // frames per second of clip in the image sequence (at most maxFrames)
    maxFrames: 360,
    maxWidth: 1600,     // px, width of the frames kept in memory
    phone: '(max-width: 700px)',
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 1. Custom HTML ─────────────────────────────────────────────────────────────────────────────────────────── */
  const SANDBOX = 'allow-scripts allow-pointer-lock allow-popups allow-forms';
  // the document the code runs in. bg: "frame" (dark fill), "none" (transparent: the code draws on the page), "white".
  // The frame's colour scheme matches its background: with mismatched schemes browsers paint an opaque backdrop.
  const embedDoc = (code, bg) => {
    if (/<html[\s>]/i.test(code || '')) return code;
    const light = bg === 'white';
    return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`
      + `<meta name="color-scheme" content="${light ? 'light' : 'dark'}"><style>:root{color-scheme:${light ? 'light' : 'dark'}}`
      + `html,body{margin:0;height:100%;overflow:hidden;background:${light ? '#fff' : bg === 'none' ? 'transparent' : '#161615'};`
      + `color:${light ? '#080808' : '#f1efe9'};font-family:system-ui,sans-serif}canvas,svg,video,img{display:block}</style>` + (code || '');
  };
  const addToDoc = (f, html) => {
    const doc = f.getAttribute('srcdoc') || '';
    if (!doc.includes(html)) f.setAttribute('srcdoc', doc.replace(/^(\s*<!doctype[^>]*>)?/i, (m) => m + html)); // after the doctype, or quirks mode
  };
  function embeds(o) {
    // <div data-embed-box data-design-w="1112" data-bg="frame" style="aspect-ratio:16/9"><template>…code…</template></div>
    document.querySelectorAll('[data-embed-box]').forEach((box) => {
      if (box.querySelector('iframe')) return;
      const t = box.querySelector('template');
      const f = document.createElement('iframe');
      f.setAttribute('data-embed', '');
      f.dataset.designW = box.dataset.designW || '';
      f.title = box.dataset.title || 'Interactive piece';
      f.setAttribute('sandbox', SANDBOX);
      f.setAttribute('scrolling', 'no');
      f.loading = 'lazy';
      f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;display:block;background:transparent;color-scheme:dark';
      f.setAttribute('srcdoc', embedDoc(t ? t.innerHTML : '', box.dataset.bg || 'frame'));
      if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
      box.style.overflow = 'hidden';
      box.appendChild(f);
    });
    // touch screens: a vertical swipe over a piece always scrolls the page (pieces often set touch-action:none)
    if (matchMedia('(pointer: coarse)').matches)
      document.querySelectorAll('iframe[data-embed]').forEach((f) => addToDoc(f, '<style>html,body,*,*::before,*::after{touch-action:pan-y!important}</style>'));
    // phones: laid out at the desktop width and scaled down; frozen on the first frame (no animation, no touch)
    if (matchMedia(o.phone).matches) {
      const FREEZE = '<script>(function(){var t0=performance.now(),raf=window.requestAnimationFrame.bind(window);'
        + 'window.requestAnimationFrame=function(cb){return performance.now()-t0<150?raf(cb):0;};'
        + 'addEventListener("load",function(){document.querySelectorAll("video").forEach(function(v){v.pause();});});})();<\/script>'
        + '<style>*,*::before,*::after{animation-play-state:paused!important;transition:none!important}</style>';
      document.querySelectorAll('iframe[data-embed]').forEach((f) => {
        const D = +f.dataset.designW;
        if (!D) return;
        const box = f.parentElement;
        const fit = () => {
          const k = box.clientWidth / D;
          Object.assign(f.style, { width: D + 'px', height: box.clientHeight / k + 'px', transformOrigin: '0 0', transform: `scale(${k})` });
        };
        fit();
        addEventListener('resize', fit);
        f.style.pointerEvents = 'none';
        f.setAttribute('tabindex', '-1');
        addToDoc(f, FREEZE);
      });
    }
  }

  /* ── 2 + 3. Scroll video (with optional mask) ───────────────────────────────────────────────────────────────── */
  function scrubs(o) {
    const list = [...document.querySelectorAll('video[data-scrub]')].map((v) => ({
      v, box: v.closest('[data-media]'), sec: v.closest('[data-scrub-sec]'), cv: v.parentNode.querySelector('canvas'),
      frames: [], shown: -1, cache: new Map(),
    })).filter((s) => s.box && s.cv && s.sec);
    if (!list.length) return;
    const navEl = o.nav && document.querySelector(o.nav);
    // window height that ignores a phone's address bar showing/hiding (that resize would move the pin mid-scroll)
    let VW = innerWidth, VH = innerHeight;
    const layout = () => list.forEach((s) => {
      const navB = navEl ? navEl.offsetHeight : 0, pin = s.sec.querySelector('[data-scrub-pin]'), run = s.sec.querySelector('[data-scrub-run]');
      s.top = (VH + navB - pin.offsetHeight) / 2;                 // centred (under the header)
      s.run = (+s.sec.dataset.dur || s.dur || 4) * o.rate * VH;  // the clip's length in scroll
      pin.style.position = 'sticky';
      pin.style.top = s.top + 'px';
      run.style.height = s.run + o.hold * VH + 'px';
    });
    const once = (el, ev, ms) => new Promise((r) => { const t = setTimeout(r, ms); el.addEventListener(ev, () => { clearTimeout(t); r(); }, { once: true }); });
    // no data-dur in the markup: read the clip's length from its metadata first (a small request), then lay out
    list.forEach((s) => {
      if (s.sec.dataset.dur) return;
      const m = document.createElement('video');
      m.preload = 'metadata'; m.muted = true; m.src = s.v.dataset.src;
      m.addEventListener('loadedmetadata', () => { s.dur = m.duration || 4; layout(); m.removeAttribute('src'); m.load(); }, { once: true });
    });
    layout();
    addEventListener('resize', () => {
      if (innerWidth === VW && Math.abs(innerHeight - VH) < 160) return;
      VW = innerWidth; VH = innerHeight; layout();
    });
    addEventListener('load', layout);
    const seek = (v, t) => { const p = once(v, 'seeked', 1500); v.currentTime = t; return p; };
    const target = (s) => Math.round(Math.min(1, Math.max(0, (s.top - s.sec.getBoundingClientRect().top) / s.run)) * (s.total - 1));
    let lastScroll = 0;
    addEventListener('scroll', () => { lastScroll = performance.now(); }, { passive: true });
    const far = (s) => { const r = s.sec.getBoundingClientRect(); return r.top > 2.5 * innerHeight || r.bottom < -1.5 * innerHeight; };
    const nextFrame = (s) => {
      for (let j = s.want; j < s.total; j++) if (!s.frames[j]) return j;
      for (let j = s.want - 1; j >= 0; j--) if (!s.frames[j]) return j;
      return -1;
    };
    // the clip → JPEG frames in memory, drawn at the block's size (object-fit: cover). The frame for the current
    // scroll position first, then onward, then back; so a reload mid-clip shows the right frame at once.
    const extract = async (s) => {
      const v = s.v;
      v.style.opacity = '0';                 // only a decoder: its seeking never shows
      v.preload = 'auto';
      v.src = v.dataset.src;
      const loaded = once(v, 'loadeddata', 10000);
      const pl = v.play(); if (pl && pl.catch) pl.catch(() => {}); // iOS loads a video only once it's played
      await loaded;
      v.pause();
      const d = v.duration, vw = v.videoWidth, vh = v.videoHeight;
      if (!d || !vw || v.readyState < 2) {   // the phone refuses to decode ahead (Low Power Mode): scrub the video itself
        v.style.opacity = '';
        s.direct = true;
        if (!v.duration) await once(v, 'loadedmetadata', 15000);
        s.total = Math.max(2, Math.round((v.duration || 4) * o.fps));
        return;
      }
      const n = Math.max(2, Math.min(o.maxFrames, Math.round(d * o.fps)));
      s.total = n;
      const b = s.box.getBoundingClientRect();
      const W = Math.round(Math.min(o.maxWidth, vw, b.width * Math.min(2, devicePixelRatio || 1)));
      const H = Math.round(W * b.height / b.width);
      const work = document.createElement('canvas');
      work.width = s.cv.width = W; work.height = s.cv.height = H;
      const wc = work.getContext('2d');
      const sc = Math.max(W / vw, H / vh), dw = vw * sc, dh = vh * sc;
      s.want = target(s);
      for (let k = 0; k < n; k++) {
        while (performance.now() - lastScroll < 150 && far(s)) await new Promise((r) => setTimeout(r, 60));
        const i = nextFrame(s);
        if (i < 0) break;
        await seek(v, (i / (n - 1)) * Math.max(0, d - 0.02));
        wc.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
        s.frames[i] = await new Promise((r) => work.toBlob(r, 'image/jpeg', 0.9));
      }
      v.removeAttribute('src'); v.load();
    };
    // all clips after the page loads, one at a time, nearest first
    const queue = async () => {
      const order = list.slice().sort((a, b) => Math.abs(a.sec.getBoundingClientRect().top) - Math.abs(b.sec.getBoundingClientRect().top));
      for (const s of order) { try { await extract(s); } catch (e) { /* next */ } }
    };
    if (document.readyState === 'complete') queue(); else addEventListener('load', queue, { once: true });
    const bitmap = (s, i) => {
      if (s.cache.has(i)) return Promise.resolve(s.cache.get(i));
      return createImageBitmap(s.frames[i]).then((bm) => {
        s.cache.set(i, bm);
        if (s.cache.size > 24) { const [k, old] = s.cache.entries().next().value; s.cache.delete(k); old.close && old.close(); }
        return bm;
      });
    };
    // mask: the frame starts cut down to maskFrom of its size (rounded) and opens to full size from the moment the
    // block comes in at the bottom until maskPart of the clip has played
    const mask = (s, r) => {
      const W = s.box.offsetWidth, H = s.box.offsetHeight, from = +s.sec.dataset.maskFrom || o.maskFrom;
      const k = reduce ? 1 : Math.min(1, Math.max(0, (VH - r.top) / Math.max(1, VH - s.top + o.maskPart * s.run)));
      const sc = from + (1 - from) * k * k * (3 - 2 * k);   // eases in and out
      const dx = Math.round(W * (1 - sc) / 2), dy = Math.round(H * (1 - sc) / 2);
      const radius = getComputedStyle(s.box).borderTopLeftRadius || '0px';
      const clip = dx || dy ? `inset(${dy}px ${dx}px round ${radius})` : 'none';
      if (clip !== s.clip) { s.clip = clip; s.box.style.clipPath = clip; }
    };
    const tick = () => {
      for (const s of list) {
        const r = s.sec.getBoundingClientRect();
        if (r.bottom < -100 || r.top > innerHeight + 100) continue;
        if (s.sec.hasAttribute('data-mask')) mask(s, r);
        if (!s.total) continue;
        let i = s.want = target(s);
        if (s.direct) {
          const t = (i / (s.total - 1)) * Math.max(0, (s.v.duration || 0) - 0.05);
          if (s.v.duration && !s.v.seeking && Math.abs(s.v.currentTime - t) > 0.02) s.v.currentTime = t;
          continue;
        }
        if (!s.frames[i]) {                    // not made yet: the nearest ready frame stands in
          let j = -1;
          for (let k = 1; k < s.total && j < 0; k++) j = s.frames[i - k] ? i - k : s.frames[i + k] ? i + k : -1;
          if (j < 0) continue;
          i = j;
        }
        if (i === s.shown || s.busy) continue;
        s.busy = true;
        bitmap(s, i).then((bm) => {
          s.ctx = s.ctx || s.cv.getContext('2d');
          s.ctx.drawImage(bm, 0, 0, s.cv.width, s.cv.height);
          const dir = i >= s.shown ? 1 : -1;
          s.shown = i;
          for (const j of [i + dir, i + 2 * dir, i + 3 * dir, i - dir]) if (s.frames[j] && !s.cache.has(j)) bitmap(s, j).catch(() => {});
        }, () => {}).then(() => { s.busy = false; });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  let started = false;
  const init = (opts) => {
    if (started) return; started = true;
    const o = Object.assign({}, DEFAULTS, window.ScrollMedia && window.ScrollMedia.options, opts);
    embeds(o);
    scrubs(o);
  };
  window.ScrollMedia = Object.assign(window.ScrollMedia || {}, { init, embedDoc });
  if (!(window.ScrollMedia.options && window.ScrollMedia.options.manual)) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init()); else init();
  }
})();
