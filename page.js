// Redesign behaviour layer
(function () {
  // Custom HTML blocks run in a sandboxed srcdoc iframe, where relative URLs don't resolve against this page.
  // Make them absolute before scroll-media.js (deferred, so it runs after this) builds the frames.
  document.querySelectorAll('[data-embed-box] template').forEach(function (t) {
    t.innerHTML = t.innerHTML.replace(/\b(src|href)="(?![a-z]+:|#|\/\/)([^"]+)"/gi, function (m, attr, url) {
      return attr + '="' + new URL(url, document.baseURI).href + '"';
    });
  });

  // Video plays only while on screen
  var vio = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      var v = e.target.querySelector('video');
      if (!v) return;
      if (e.isIntersecting) v.play().catch(function () {}); else v.pause();
    });
  }, { rootMargin: '150px 0px' });
  document.querySelectorAll('[data-video]').forEach(function (f) { vio.observe(f); });

  // Long lists: show the first three items, the rest behind a toggle (without JS everything stays visible)
  document.querySelectorAll('.rd-list').forEach(function (list, i) {
    var count = list.children.length;
    if (count <= 4) return;
    list.id = list.id || 'rd-list-' + i;
    list.classList.add('rd-list--collapsed');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rd-more';
    btn.setAttribute('aria-controls', list.id);
    btn.setAttribute('aria-expanded', 'false');
    btn.textContent = 'Show all ' + count;
    btn.addEventListener('click', function () {
      var open = !list.classList.toggle('rd-list--collapsed');
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Show less' : 'Show all ' + count;
    });
    list.after(btn);
  });

  // Reveal: content is hidden only if it starts below the fold, and a scroll check
  // backs up IntersectionObserver so nothing can stay hidden.
  var targets = [].slice.call(document.querySelectorAll('.rd-media:not(.rd-full:first-child), .rd-block, .rd-list li'));
  targets = targets.filter(function (el) { return el.getBoundingClientRect().top > innerHeight; });
  targets.forEach(function (el) { el.classList.add('rd-pre'); });
  function reveal(el) { el.classList.add('is-in'); }
  function check() {
    targets = targets.filter(function (el) {
      if (el.getBoundingClientRect().top < innerHeight * 0.92) { reveal(el); return false; }
      return true;
    });
  }
  if ('IntersectionObserver' in window) {
    var rio = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { reveal(e.target); rio.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    targets.forEach(function (el) { rio.observe(el); });
  }

  // Hero statement: words get a "selected" highlight one by one as the page scrolls down
  var stmt = document.querySelector('.rd-statement'), words = [];
  if (stmt) {
    var parts = stmt.textContent.trim().split(/\s+/);
    stmt.textContent = '';
    parts.forEach(function (w, i) {
      var s = document.createElement('span');
      s.className = 'rd-hl' + (i === 0 && w === 'Upstream' ? ' rd-u' : '');
      s.textContent = w + (i < parts.length - 1 ? ' ' : '');
      stmt.appendChild(s);
      words.push(s);
    });
  }
  function highlight() {
    if (!words.length) return;
    var range = Math.max(160, stmt.offsetHeight * 0.6);
    var n = Math.round(Math.min(1, Math.max(0, pageYOffset / range)) * words.length);
    for (var i = 0; i < words.length; i++) words[i].classList.toggle('is-on', i < n);
  }

  // Reading progress (transform only)
  var bar = document.getElementById('rdProgress');
  function onScroll() {
    var h = document.documentElement.scrollHeight - innerHeight;
    if (bar && h > 0) bar.style.transform = 'scaleX(' + Math.min(1, Math.max(0, pageYOffset / h)) + ')';
    check();
    highlight();
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  // Footer toggle
  var more = document.querySelector('.e2e-more-cols'), wrap = document.querySelector('.e2e-more-cols-wrapper');
  if (more && wrap) more.addEventListener('click', function () {
    more.classList.toggle('open'); wrap.classList.toggle('visible');
  });
})();

// Header: a port of ramotion.com's headerScrollListener. It scrolls away with the page,
// and on the first scroll up it slides back in whole, with its background.
(function () {
  var h = document.querySelector('header');
  if (!h) return;
  var d = { position: 0 }, release;
  function st() { return window.pageYOffset || document.documentElement.scrollTop || 0; }
  function endAnimation() { clearTimeout(release); h.classList.remove('animated'); }
  function onScroll() {
    var hh = h.offsetHeight, y = Math.max(0, st()), wh = window.innerHeight;
    if (d.lastScrollTop === undefined) d.lastScrollTop = y;
    h.classList[y ? 'remove' : 'add']('top-of-page');
    if (!y) { h.classList.remove('bg-showed'); h.removeAttribute('style'); }
    if (h.classList.contains('animated')) return;
    var delta = y - d.lastScrollTop;
    d.position = Math.min(Math.max(-hh, d.position - delta + (wh - (d.lastWndHeight || wh))), 0);
    if (delta < 0 && d.position + delta === -hh) {
      h.classList.add('animated', 'bg-showed'); d.position = 0;
      // the site waits for transitionend; the timer covers a transition that never fires
      clearTimeout(release); release = setTimeout(endAnimation, 400);
    }
    d.lastScrollTop = y; d.lastWndHeight = wh;
    if (y) h.style.transform = 'translateY(' + d.position + 'px)';
  }
  // like the site: any transition inside the header ends the slide-in
  h.addEventListener('transitionend', endAnimation);
  window.addEventListener('scroll', onScroll, false);
})();
