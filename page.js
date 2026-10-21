// Redesign behaviour layer
(function () {
  // Video plays only while on screen
  var vio = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      var v = e.target.querySelector('video');
      if (!v) return;
      if (e.isIntersecting) v.play().catch(function () {}); else v.pause();
    });
  }, { rootMargin: '150px 0px' });
  document.querySelectorAll('[data-video]').forEach(function (f) { vio.observe(f); });

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

  // Reading progress (transform only)
  var bar = document.getElementById('rdProgress');
  function onScroll() {
    var h = document.documentElement.scrollHeight - innerHeight;
    if (bar && h > 0) bar.style.transform = 'scaleX(' + Math.min(1, Math.max(0, pageYOffset / h)) + ')';
    check();
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

// Header: follows the scroll down, slides back in with a background on scroll up.
(function () {
  var h = document.querySelector('header');
  if (!h) return;
  var d = { position: 0 };
  function st() { return window.pageYOffset || document.documentElement.scrollTop || 0; }
  function onScroll() {
    var hh = h.offsetHeight, y = Math.max(0, st()), wh = window.innerHeight;
    if (d.lastScrollTop === undefined) d.lastScrollTop = y;
    h.classList.toggle('top-of-page', !y);
    if (!y) { h.classList.remove('bg-showed'); h.style.transform = ''; d.position = 0; }
    else if (!h.classList.contains('bg-showed') && d.lastScrollTop === 0) h.classList.add('bg-showed');
    if (h.classList.contains('animated')) return;
    var delta = y - d.lastScrollTop;
    d.position = Math.min(Math.max(-hh, d.position - delta + (wh - (d.lastWndHeight || wh))), 0);
    if (delta < 0 && d.position + delta === -hh) {
      h.classList.add('animated', 'bg-showed'); d.position = 0;
    }
    d.lastScrollTop = y; d.lastWndHeight = wh;
    if (y) h.style.transform = 'translateY(' + d.position + 'px)';
  }
  h.addEventListener('transitionend', function (e) {
    if (e.target === h) h.classList.remove('animated');
  });
  window.addEventListener('scroll', onScroll, false);
  onScroll();
})();
