/* iCleaning — site scripts (vanilla JS, no dependencies) */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- mobile nav + services dropdown ---------- */
  var toggle = $('.nav-toggle'), nav = $('#nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
  $$('.sub-toggle').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var li = a.parentNode, open = li.classList.toggle('open');
      a.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.has-sub')) $$('.has-sub.open').forEach(function (li) { li.classList.remove('open'); });
  });
  $$('[data-scroll]').forEach(function (a) {
    a.addEventListener('click', function () { if (nav) nav.classList.remove('open'); });
  });

  /* ---------- hero slider ---------- */
  var slider = $('.hero-slider');
  if (slider) {
    var slides = $$('.slide', slider), dots = $$('.dot', slider), cur = 0, timer;
    var show = function (i) {
      cur = (i + slides.length) % slides.length;
      slides.forEach(function (s, n) { s.classList.toggle('on', n === cur); });
      dots.forEach(function (d, n) { d.classList.toggle('on', n === cur); });
    };
    var play = function () { if (!reduce) { clearInterval(timer); timer = setInterval(function () { show(cur + 1); }, 6500); } };
    dots.forEach(function (d, n) { d.addEventListener('click', function () { show(n); play(); }); });
    play();
  }

  /* ---------- reviews carousel ---------- */
  var revs = $$('.rev');
  if (revs.length > 1) {
    var ri = 0, rt;
    var rshow = function (i) { ri = (i + revs.length) % revs.length; revs.forEach(function (r, n) { r.classList.toggle('on', n === ri); }); };
    var rplay = function () { if (!reduce) { clearInterval(rt); rt = setInterval(function () { rshow(ri + 1); }, 9000); } };
    $('.rev-prev').addEventListener('click', function () { rshow(ri - 1); rplay(); });
    $('.rev-next').addEventListener('click', function () { rshow(ri + 1); rplay(); });
    rplay();
  }

  /* ---------- modal + order form ---------- */
  var modal = $('#modal'), form = $('#order-form'), lastFocus = null;
  var detailsField = form && form.elements.details;
  function openModal(details) {
    if (!modal) return;
    lastFocus = document.activeElement;
    if (detailsField) detailsField.value = details || '';
    form.elements.page.value = location.href;
    modal.hidden = false; document.body.classList.add('lock');
    $('.form-msg', form).textContent = ''; $('.form-msg', form).className = 'form-msg';
    setTimeout(function () { form.elements.name.focus(); }, 30);
  }
  function closeModal() {
    if (!modal || modal.hidden) return;
    modal.hidden = true; document.body.classList.remove('lock');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-modal]');
    if (b) { e.preventDefault(); openModal(b.getAttribute('data-details') || ''); return; }
    if (e.target.closest('[data-close]') || e.target === modal) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (!modal || modal.hidden) return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Tab') { // keep focus inside the dialog
      var f = $$('input:not(.hp),textarea,button', modal).filter(function (x) { return !x.disabled && x.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = $('.form-msg', form), d = form.dataset;
      var name = form.elements.name.value.trim(), phone = form.elements.phone.value.trim();
      var set = function (t, c) { msg.textContent = t; msg.className = 'form-msg ' + (c || ''); };
      if (!name) { set(d.invalidName, 'err'); form.elements.name.focus(); return; }
      if (phone.replace(/\D/g, '').length < 9) { set(d.invalidPhone, 'err'); form.elements.phone.focus(); return; }
      var btn = $('button[type=submit]', form);
      if (form.elements.botcheck && form.elements.botcheck.checked) { location.href = document.body.getAttribute('data-thanks'); return; } // honeypot: bots only
      btn.disabled = true; set(d.sending);
      var endpoint = document.body.getAttribute('data-endpoint');
      var local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname) || location.protocol === 'file:';
      var done = function () {
        btn.disabled = false;
        if (local) { set(d.test, 'ok'); return; }
        location.href = document.body.getAttribute('data-thanks');
      };
      var fail = function () {
        btn.disabled = false;
        if (local) { set(d.test, 'ok'); return; }
        set(d.error + document.body.getAttribute('data-phone'), 'err');
      };
      fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (j) { j && (j.ok || j.success === true || j.success === 'true') ? done() : fail(); })
        .catch(fail);
    });
  }

  /* ---------- regular cleaning calculator ---------- */
  var calc = $('#calculator');
  if (calc) {
    var cs = calc.dataset, fmt = function (n) { return Math.round(n).toLocaleString(cs.locale).replace(/ /g, ' ') + ' ' + cs.cur; };
    var selR = $('#calc-rooms'), selF = $('#calc-freq'), boxes = $$('input[name=extra]', calc);
    var empty = $('.calc-empty', calc), lines = $('.calc-lines', calc), total = $('.calc-total', calc), orderBtn = $('[data-order]', calc);
    var recalc = function () {
      var base = parseFloat(selR.value);
      if (!base) { empty.hidden = false; lines.hidden = true; total.hidden = true; orderBtn.disabled = true; orderBtn.setAttribute('data-details', ''); return; }
      var chosen = boxes.filter(function (b) { return b.checked; });
      var extras = chosen.reduce(function (s, b) { return s + parseFloat(b.dataset.price); }, 0);
      var sub = base + extras, s = parseFloat(selF.value) || 0;
      var one = sub * (1 + s), first = sub * (1 + s + parseFloat(cs.first));
      var roomLabel = selR.options[selR.selectedIndex].dataset.label;
      // built with textContent (not innerHTML): labels are never parsed as HTML
      var line = function (dt, dd) {
        var row = document.createElement('div'), a = document.createElement('dt'), b = document.createElement('dd');
        a.textContent = dt; b.textContent = dd; row.appendChild(a); row.appendChild(b); lines.appendChild(row);
      };
      lines.textContent = '';
      line(cs.lRooms + ': ' + roomLabel, fmt(base));
      if (extras) line(cs.lExtras, '+' + fmt(extras));
      if (s) line(cs.lFreq + ' (+' + Math.round(s * 100) + '%)', '+' + fmt(sub * s));
      $('[data-one]', calc).textContent = fmt(one);
      $('[data-first-price]', calc).textContent = fmt(first);
      empty.hidden = true; lines.hidden = false; total.hidden = false; orderBtn.disabled = false;
      orderBtn.setAttribute('data-details', cs.dPrefix + ': ' + cs.dRooms + ' — ' + roomLabel +
        (chosen.length ? '; ' + cs.dExtras + ': ' + chosen.map(function (b) { return b.dataset.label; }).join(', ') : '') +
        '; ' + cs.dFreq + ': ' + selF.options[selF.selectedIndex].dataset.label +
        '; ' + cs.dOne + ': ' + fmt(one) + '; ' + cs.dFirst + ': ' + fmt(first));
    };
    calc.addEventListener('change', recalc); recalc();
  }

  /* ---------- area calculator (general / eco cleaning) ---------- */
  var area = $('#area-calc');
  if (area) {
    var as = area.dataset, sel = $('#area-sel', area), rate = parseFloat(as.rate);
    var afmt = function (n) { return Math.round(n).toLocaleString(as.locale).replace(/ /g, ' '); };
    var arecalc = function () {
      var opt = sel.options[sel.selectedIndex], m2 = parseFloat(sel.value), price = m2 * rate, people = opt.dataset.people;
      $('[data-area-price]', area).textContent = afmt(price);
      $('[data-area-size]', area).textContent = m2 + ' м²';
      $('[data-area-people]', area).textContent = people + ' ' + as.unit;
      $('[data-area-order]', area).setAttribute('data-details', as.d + ': ' + as.lSize + ' ' + m2 + ' м²; ' + as.lPeople + ': ' + people + '; ' + as.priceL + ' ' + afmt(price) + ' ' + as.cur);
    };
    sel.addEventListener('change', arecalc); arecalc();
  }
})();
