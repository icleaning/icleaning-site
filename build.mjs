#!/usr/bin/env node
/**
 * iCleaning — static site generator (no dependencies, Node.js 18+).
 *
 *   node build.mjs            -> builds the site into ./dist
 *   node build.mjs --serve    -> builds, serves ./dist on http://localhost:4321 and rebuilds on every change
 *
 * Content lives in src/content/<lang>.json, settings (phone, slugs, prices) in src/config.json,
 * static files (css, js, images, fonts, send.php) in ./public.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const PUBLIC = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist');

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/* ------------------------------------------------------------------ */
/* inline SVG icons                                                    */
/* ------------------------------------------------------------------ */
const ICONS = {
  phone: '<svg class="svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M6.6 3.5c-1.4.8-2.4 2.2-2 4.2 1.1 5 5.6 10.3 10.7 12.2 2 .7 3.4-.2 4.2-1.6l-2.8-3.2-2.2 1.2c-2-.9-4.2-3.1-5.1-5.1l1.3-2.2z"/></svg>',
  fb: '<svg class="svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M14 8.5V6.9c0-.8.2-1.2 1.3-1.2H17V3h-2.6C11.6 3 10.5 4.6 10.5 6.7v1.8H8.3V11h2.2v10H14V11h2.5l.4-2.5z"/></svg>',
  menu: '<svg class="svg" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M3 6h18M3 12h18M3 18h18"/></svg>',
  prev: '<svg class="svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg class="svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" d="M9 5l7 7-7 7"/></svg>',
  quote: '<svg class="svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M9.5 6C6.5 7 4.5 9.7 4.5 13v5h6v-6h-3c0-2 1-3.500 3-4.200zm9 0c-3 1-5 3.700-5 7v5h6v-6h-3c0-2 1-3.500 3-4.200z"/></svg>'
};

/* ------------------------------------------------------------------ */
/* data                                                                */
/* ------------------------------------------------------------------ */
function load() {
  const config = readJSON(path.join(SRC, 'config.json'));
  if (process.env.LANGS) config.langs = process.env.LANGS.split(',').filter(Boolean); // e.g. LANGS=uk,ru node build.mjs (handy while a translation is unfinished)
  const L = {};
  for (const l of config.langs) L[l] = readJSON(path.join(SRC, 'content', `${l}.json`));
  return { config, L };
}

/* ------------------------------------------------------------------ */
/* url helpers                                                         */
/* ------------------------------------------------------------------ */
function makeUrls(config) {
  const base = config.site.basePath.replace(/\/$/, '');
  const pref = (lang) => (lang === config.defaultLang ? '' : `/${lang}`);
  return {
    base,
    asset: (p) => `${base}${p}`,
    page(lang, key) {
      const s = config.slugs[key][lang];
      return `${base}${pref(lang)}/${s ? s + '/' : ''}`;
    },
    post(lang, k) {
      return `${base}${pref(lang)}/${config.postSlugs[k][lang]}/`;
    },
    dir(lang, key) {
      const s = config.slugs[key][lang];
      return path.join(pref(lang).replace(/^\//, ''), s || '');
    },
    postDir(lang, k) {
      return path.join(pref(lang).replace(/^\//, ''), config.postSlugs[k][lang]);
    }
  };
}

/* ------------------------------------------------------------------ */
/* layout                                                              */
/* ------------------------------------------------------------------ */
function renderLayout(ctx, { lang, key, post, title, desc, body, alt, image, bodyClass = '', ogType = 'website' }) {
  const { config, L, U } = ctx;
  const T = L[lang];
  const ui = T.ui;
  const site = config.site;
  const self = post ? U.post(lang, post) : U.page(lang, key);
  const canonical = site.domain + self;
  const phoneHref = `tel:${site.phone}`;
  const langLinks = config.langs.map((l) => {
    const href = post ? U.post(l, post) : U.page(l, key);
    return `<a href="${href}" hreflang="${l}" lang="${l}"${l === lang ? ' aria-current="true" class="on"' : ''} title="${esc(L[l].name)}">${esc(L[l].label)}</a>`;
  }).join('');
  const hreflangs = config.langs.map((l) => `<link rel="alternate" hreflang="${l}" href="${site.domain}${post ? U.post(l, post) : U.page(l, key)}">`).join('\n  ')
    + `\n  <link rel="alternate" hreflang="x-default" href="${site.domain}${post ? U.post(config.defaultLang, post) : U.page(config.defaultLang, key)}">`;
  const nav = [
    `<li class="${key === 'home' ? 'cur' : ''}"><a href="${U.page(lang, 'home')}">${esc(ui.nav.home)}</a></li>`,
    `<li class="has-sub${config.menuOrder.includes(key) ? ' cur' : ''}"><a href="#" class="sub-toggle" aria-haspopup="true" aria-expanded="false">${esc(ui.nav.services)}</a><ul class="sub">${config.menuOrder.map((k) => `<li><a href="${U.page(lang, k)}"${k === key ? ' aria-current="page"' : ''}>${esc(ui.svc[k])}</a></li>`).join('')}</ul></li>`,
    `<li class="${key === 'faq' ? 'cur' : ''}"><a href="${U.page(lang, 'faq')}">${esc(ui.nav.faq)}</a></li>`,
    `<li class="${key === 'info' || post ? 'cur' : ''}"><a href="${U.page(lang, 'info')}">${esc(ui.nav.info)}</a></li>`,
    `<li><a href="#contact" data-scroll>${esc(ui.nav.contacts)}</a></li>`
  ].join('');
  const ogImg = image ? `${site.domain}${U.asset(image)}` : `${site.domain}${U.asset('/img/hero/main2_1.jpg')}`;

  return `<!doctype html>
<html lang="${T.htmlLang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${canonical}">
  ${hreflangs}
  <meta property="og:type" content="${ogType}">
  <meta property="og:site_name" content="${esc(site.name)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${ogImg}">
  <meta property="og:locale" content="${T.locale}">
  <link rel="icon" href="${U.asset('/favicon.png')}" type="image/png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&family=Raleway:wght@500;600;700&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Roboto:wght@400;500&display=swap&subset=cyrillic,latin-ext">
  <link rel="stylesheet" href="${U.asset('/css/style.css')}">
</head>
<body class="${bodyClass}" data-lang="${lang}" data-endpoint="${esc(site.formEndpoint.startsWith('/') ? U.asset(site.formEndpoint) : site.formEndpoint)}" data-phone="${esc(site.phoneTop)}" data-thanks="${U.page(lang, 'thanks')}">
<a class="skip" href="#main">${esc(ui.common.skip)}</a>
<header class="site-header" id="top">
  <div class="topbar"><div class="wrap">
    <a class="top-phone" href="${phoneHref}">${ICONS.phone}<span>${esc(site.phoneTop)}</span></a>
    <a class="top-fb" href="${esc(site.facebook)}" target="_blank" rel="noopener" aria-label="Facebook">${ICONS.fb}</a>
  </div></div>
  <div class="mainbar"><div class="wrap">
    <a class="logo" href="${U.page(lang, 'home')}"><img src="${U.asset('/img/logo.png')}" alt="${esc(site.name)}" width="120" height="38"></a>
    <a class="head-phone" href="${phoneHref}">${esc(site.phoneDisplay.replace('-34-32', '-3432'))}</a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="nav" aria-label="${esc(ui.common.menu)}">${ICONS.menu}</button>
    <nav id="nav" class="nav" aria-label="${esc(ui.common.menu)}">
      <ul class="menu">${nav}</ul>
      <button type="button" class="btn btn-sm" data-modal>${esc(ui.nav.callback)}</button>
      <div class="langs" role="group" aria-label="${esc(ui.common.language)}">${langLinks}</div>
    </nav>
  </div></div>
</header>
<main id="main">
${body}
</main>
${renderFooter(ctx, lang)}
${renderModal(ctx, lang)}
<script src="${U.asset('/js/site.js')}" defer></script>
</body>
</html>
`;
}

function renderFooter(ctx, lang) {
  const { config, L, U } = ctx;
  const f = L[lang].ui.footer;
  const site = config.site;
  const about = f.about.map((t) => `<p>${esc(t)}</p>`).join('');
  return `<footer class="site-footer" id="contact">
  <div class="wrap footer-grid">
    <div class="f-about"><h3>${esc(f.aboutTitle)}</h3>${about}
      <p class="f-open"><strong>${esc(f.open)}</strong></p>
      <p class="f-online">${esc(f.online)}</p>
      <p class="f-area">${esc(f.area)}</p>
    </div>
    <div class="f-contact"><h3>${esc(f.contactsTitle)}</h3>
      <p class="f-phone"><a href="tel:${site.phone}">${esc(site.phoneTop)}</a></p>
      <p>${esc(f.hours)}</p>
      <p class="f-online2"><span>${esc(f.onlineLabel)}</span> <strong>${esc(f.onlineValue)}</strong></p>
      <button type="button" class="btn btn-block" data-modal>${esc(L[lang].ui.common.order)}</button>
      <h3 class="f-social">${esc(f.social)}</h3>
      <a class="f-fb" href="${esc(site.facebook)}" target="_blank" rel="noopener" aria-label="Facebook">${ICONS.fb}</a>
    </div>
  </div>
  <div class="f-bottom"><div class="wrap">© ${new Date().getFullYear()} ${esc(site.name)}. ${esc(f.rights)}</div></div>
</footer>`;
}

function renderModal(ctx, lang) {
  const m = ctx.L[lang].ui.modal;
  const c = ctx.L[lang].ui.common;
  return `<div class="modal" id="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" hidden>
  <div class="modal-box">
    <button type="button" class="modal-x" data-close aria-label="${esc(c.close)}">×</button>
    <h2 id="modal-title">${esc(m.title)}</h2>
    <p class="modal-lead">${esc(m.lead)}</p>
    <form id="order-form" novalidate
      data-sending="${esc(m.sending)}" data-success="${esc(m.success)}" data-test="${esc(m.testMode)}" data-error="${esc(m.error)}"
      data-invalid-name="${esc(m.invalidName)}" data-invalid-phone="${esc(m.invalidPhone)}">
      <label for="f-name">${esc(m.name)}</label>
      <input id="f-name" name="name" type="text" autocomplete="name" required>
      <label for="f-phone">${esc(m.phone)}</label>
      <input id="f-phone" name="phone" type="tel" autocomplete="tel" placeholder="+38 (0__) ___ __ __" required>
      <label for="f-comment">${esc(m.comment)}</label>
      <textarea id="f-comment" name="comment" rows="3"></textarea>
      <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <input type="hidden" name="details" value="">
      <input type="hidden" name="page" value="">
      <input type="hidden" name="lang" value="${lang}">
      <p class="form-msg" role="status" aria-live="polite"></p>
      <button type="submit" class="btn btn-block">${esc(m.send)}</button>
    </form>
  </div>
</div>`;
}

/* ------------------------------------------------------------------ */
/* shared blocks                                                       */
/* ------------------------------------------------------------------ */
const icon = (name) => `<i class="df df-${esc(name)}" aria-hidden="true"></i>`;

function orderButton(ui, label, details = '') {
  return `<p class="center"><button type="button" class="btn" data-modal data-details="${esc(details)}">${esc(label || ui.common.order)}</button></p>`;
}

function reviews(ctx, lang) {
  const ui = ctx.L[lang].ui;
  const items = ui.reviews.map((r, i) => `<figure class="rev${i === 0 ? ' on' : ''}"><blockquote><span class="q q-o">“</span>${esc(r.q)}<span class="q q-c">”</span></blockquote><figcaption><strong>${esc(r.name)}</strong><span>${esc(r.role)}</span></figcaption></figure>`).join('');
  return `<section class="band band-blue reviews" aria-labelledby="rev-h">
  <div class="wrap"><h2 class="sec-title light" id="rev-h">${esc(ui.home.reviewsTitle)}</h2>
  <div class="rev-wrap"><button type="button" class="rev-btn rev-prev" aria-label="${esc(ui.common.prev)}">${ICONS.prev}</button>
  <div class="rev-list" aria-live="polite">${items}</div>
  <button type="button" class="rev-btn rev-next" aria-label="${esc(ui.common.next)}">${ICONS.next}</button></div></div>
</section>`;
}

function heroStatic(ctx, p) {
  const U = ctx.U;
  return `<section class="hero hero-static">
  <img class="slide-img" src="${U.asset(`/img/hero/${p.hero}.jpg`)}" alt="" width="1920" height="620">
  <div class="hero-band"><div class="wrap"><h1>${esc(p.h1)}</h1>${p.sub ? `<p class="hero-sub">${esc(p.sub)}</p>` : ''}${p.price ? `<p class="hero-price">${esc(p.price)}</p>` : ''}</div></div>
</section>`;
}

/* regular-cleaning calculator (static markup, logic in public/js/site.js) */
function renderCalc(ctx, lang, pageKey) {
  const { config, L } = ctx;
  const c = L[lang].ui.calc;
  const cc = config.calc;
  const fmt = (n) => n.toLocaleString(L[lang].locale.replace('_', '-')).replace(/ /g, ' ');
  const cur = c.currency;
  const rooms = cc.rooms.map((p, i) => `<option value="${p}" data-label="${esc(c.rooms[i])}">${esc(c.rooms[i])} — ${fmt(p)} ${esc(cur)}</option>`).join('');
  const extras = cc.extras.map((x) => `<label class="chk"><input type="checkbox" name="extra" value="${x.id}" data-price="${x.price}" data-label="${esc(c.extras[x.id])}"><span class="box" aria-hidden="true"></span><span class="nm">${esc(c.extras[x.id])}</span><span class="pr">+${fmt(x.price)} ${esc(cur)}${x.perHour ? esc(c.perHour) : ''}</span></label>`).join('');
  const freq = cc.frequency.map((f) => `<option value="${f.surcharge}" data-label="${esc(c.freq[f.id])}">${esc(c.freq[f.id])}${f.surcharge ? ` (+${Math.round(f.surcharge * 100)}%)` : ''}</option>`).join('');
  const d = c.d;
  return `<section class="calc" id="calculator" data-first="${cc.firstCleaningSurcharge}" data-cur="${esc(cur)}" data-locale="${L[lang].locale.replace('_', '-')}"
  data-d-prefix="${esc(d.prefix)}" data-d-rooms="${esc(d.rooms)}" data-d-extras="${esc(d.extras)}" data-d-freq="${esc(d.freq)}" data-d-one="${esc(d.one)}" data-d-first="${esc(d.first)}"
  data-l-rooms="${esc(c.linesRooms)}" data-l-extras="${esc(c.linesExtras)}" data-l-freq="${esc(c.linesFreq)}">
  <div class="calc-grid">
    <div class="calc-form">
      <label for="calc-rooms">${esc(c.roomsLabel)}</label>
      <select id="calc-rooms"><option value="">${esc(c.roomsPlaceholder)}</option>${rooms}</select>
      <fieldset><legend>${esc(c.extrasLegend)}</legend>${extras}</fieldset>
      <label for="calc-freq">${esc(c.freqLabel)}</label>
      <select id="calc-freq">${freq}</select>
    </div>
    <aside class="calc-res" aria-live="polite">
      <h3>${esc(c.resultTitle)}</h3>
      <p class="calc-empty">${esc(c.empty)}</p>
      <dl class="calc-lines" hidden></dl>
      <div class="calc-total" hidden>
        <div><span>${esc(c.one)}</span><strong data-one></strong></div>
        <div class="first"><span>${esc(c.first)}</span><strong data-first-price></strong></div>
      </div>
      <button type="button" class="btn btn-block" data-modal data-order disabled>${esc(c.order)}</button>
    </aside>
  </div>
</section>`;
}

/* area based calculator (general + eco cleaning) */
function renderAreaCalc(ctx, lang) {
  const { config, L } = ctx;
  const a = L[lang].ui.area;
  const ac = config.calc.area;
  const fmt = (n) => n.toLocaleString(L[lang].locale.replace('_', '-')).replace(/ /g, ' ');
  const opts = [];
  for (let s = ac.from; s <= ac.to; s += ac.step) opts.push(`<option value="${s}" data-people="${ac.specialists[s]}">${esc(a.upTo)} ${s} м²</option>`);
  return `<section class="calc area-calc" id="area-calc" data-rate="${ac.rate}" data-locale="${L[lang].locale.replace('_', '-')}"
  data-cur="${esc(a.currency)}" data-d="${esc(a.d)}" data-l-size="${esc(a.size)}" data-l-people="${esc(a.people)}" data-unit="${esc(a.personUnit)}" data-price-l="${esc(a.price)}">
  <h2 class="sec-title">${esc(a.title)}</h2>
  <p class="center lead">${esc(a.rate)}</p>
  <div class="area-box">
    <label for="area-sel">${esc(a.lead)}</label>
    <select id="area-sel">${opts.join('')}</select>
    <p class="area-price"><span>${esc(a.price)}</span> <strong data-area-price>${fmt(ac.from * ac.rate)}</strong> ${esc(a.currency)}</p>
    <ul class="area-meta"><li>${esc(a.size)}: <b data-area-size>${ac.from} м²</b></li><li>${esc(a.people)}: <b data-area-people>${ac.specialists[ac.from]} ${esc(a.personUnit)}</b></li></ul>
    <p class="muted center small">${esc(a.approx)}</p>
    <button type="button" class="btn" data-modal data-area-order>${esc(a.order)}</button>
  </div>
</section>`;
}

function renderBlocks(ctx, lang, blocks, pageKey) {
  const ui = ctx.L[lang].ui;
  let out = '';
  let prev = '';
  for (const b of blocks) {
    if (b.t === 'h') out += `<h2 class="sec-h">${esc(b.x)}</h2>`;
    else if (b.t === 'p') out += `<p class="sec-p${b.x.startsWith('*') ? ' note' : ''}">${esc(b.x)}</p>`;
    else if (b.t === 'ul') out += `<ul class="${prev === 'h' ? 'num' : 'bul'}">${b.x.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
    else if (b.t === 'calc') out += renderCalc(ctx, lang, pageKey);
    else if (b.t === 'areacalc') out += renderAreaCalc(ctx, lang);
    else if (b.t === 'cta') out += orderButton(ui, b.x === 'trial' ? ui.common.bookTrial : ui.common.order);
    prev = b.t;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* pages                                                               */
/* ------------------------------------------------------------------ */
function pageHome(ctx, lang) {
  const { L, U, config } = ctx;
  const T = L[lang], ui = T.ui, h = ui.home;
  const slides = h.slides.map((s, i) => `<div class="slide${i === 0 ? ' on' : ''}"><img class="slide-img" src="${U.asset(`/img/hero/${s.img}.jpg`)}" alt="" width="1920" height="620"${i ? ' loading="lazy"' : ''}>
    <div class="hero-band"><div class="wrap"><h2 class="hero-h">${esc(s.title)}</h2>${s.sub ? `<p class="hero-sub">${esc(s.sub)}</p>` : ''}</div></div></div>`).join('');
  const dots = h.slides.map((_, i) => `<button type="button" class="dot${i === 0 ? ' on' : ''}" aria-label="${i + 1}"></button>`).join('');
  const services = h.services.map((s) => `<li><a href="${U.page(lang, s.key)}"><i class="cl cl-${s.icon}" aria-hidden="true"></i><h3>${esc(s.h)}</h3><p>${esc(s.p)}</p></a></li>`).join('');
  const quality = h.quality.map((q) => `<div class="qi">${icon(q.icon)}<h3>${esc(q.h)}</h3>${q.p.map((t) => `<p>${esc(t)}</p>`).join('')}</div>`).join('');
  const diff = h.diff.map((q) => `<div class="qi dark">${icon(q.icon)}<h3>${esc(q.h)}</h3><p>${esc(q.p)}</p></div>`).join('');
  const body = `<section class="hero hero-slider" aria-roledescription="carousel" aria-label="iCleaning">
  <div class="slides">${slides}</div>
  <h1 class="sr-only">${esc(T.home.meta.title)}</h1>
  <div class="hero-order"><button type="button" class="btn" data-modal>${esc(ui.common.order)}</button></div>
  <div class="dots">${dots}</div>
</section>
<section class="section services"><div class="wrap">
  <h2 class="sec-title">${esc(h.servicesTitle)}</h2>
  <ul class="svc-grid">${services}</ul>
</div></section>
<section class="band band-blue"><div class="wrap">
  <h2 class="sec-title light">${esc(h.qualityTitle)}</h2>
  <div class="q-grid q3">${quality}</div>
  ${orderButton(ui, ui.common.order)}
</div></section>
<section class="section"><div class="wrap">
  <h2 class="sec-title">${esc(h.diffTitle)}</h2>
  <div class="q-grid q4">${diff}</div>
</div></section>
${reviews(ctx, lang)}`;
  const org = {
    '@context': 'https://schema.org', '@type': 'HomeAndConstructionBusiness', name: config.site.name, url: config.site.domain + U.page(lang, 'home'),
    telephone: config.site.phone, areaServed: { '@type': 'AdministrativeArea', name: lang === 'uk' ? 'Київ, Київська область' : lang === 'ru' ? 'Киев, Киевская область' : lang === 'es' ? 'Kiev y región de Kiev' : 'Kyiv and Kyiv region' }
  };
  return renderLayout(ctx, { lang, key: 'home', title: h.meta?.title || T.home.meta.title, desc: T.home.meta.desc, bodyClass: 'home',
    body: body + `\n<script type="application/ld+json">${JSON.stringify(org)}</script>` });
}

function pageService(ctx, lang, key) {
  const { L, U, config } = ctx;
  const T = L[lang], ui = T.ui, p = T.pages[key];
  const isRegularType = key === 'regular' || key === 'eco';
  const badges = (key === 'general' || key === 'eco') ? `<ul class="badges">${ui.badges.map((b, i) => `<li><img src="${U.asset(`/img/badge${i + 1}.png`)}" alt="" width="45" height="45"><span>${esc(b)}</span></li>`).join('')}</ul>` : '';
  const sections = renderBlocks(ctx, lang, p.sections, key);
  const band = isRegularType
    ? `<section class="band band-blue"><div class="wrap"><h2 class="sec-title light">${esc(ui.diffRegular.title)}</h2><div class="q-grid q4">${ui.diffRegular.items.map((i) => `<div class="qi">${icon(i.icon)}<h3>${esc(i.h)}</h3><p>${esc(i.p)}</p></div>`).join('')}</div>${orderButton(ui, ui.common.bookTrial)}</div></section>`
    : `<section class="band band-blue"><div class="wrap"><h2 class="sec-title light">${esc(ui.band.title)}</h2><div class="q-grid q5">${ui.band.items.map((i) => `<div class="qi">${icon(i.icon)}<h3>${esc(i.h)}</h3><p>${esc(i.p)}</p></div>`).join('')}</div>${orderButton(ui, ui.common.order)}</div></section>`;
  const steps = `<section class="section steps"><div class="wrap"><h2 class="sec-title">${esc(ui.stepsTitle)}</h2>
  <ol class="step-grid n${p.steps.length}">${p.steps.map((s, i) => `<li><span class="stn" aria-hidden="true">${i + 1}</span><h3>${esc(s.h)}</h3><p>${esc(s.p)}</p></li>`).join('')}</ol>
  ${orderButton(ui, isRegularType ? ui.common.bookTrial : ui.common.order)}</div></section>`;
  const body = `${heroStatic(ctx, p)}
<section class="section content"><div class="wrap narrow">${badges}${sections}</div></section>
${band}
${steps}
${reviews(ctx, lang)}`;
  return renderLayout(ctx, { lang, key, title: p.meta.title, desc: p.meta.desc, body, image: `/img/hero/${p.hero}.jpg`, bodyClass: 'service' });
}

function pageFaq(ctx, lang) {
  const { L } = ctx;
  const T = L[lang], f = T.faq;
  const items = f.items.map((it, i) => `<details class="faq-item"${i === 0 ? ' open' : ''}><summary>${esc(it.q)}</summary><p>${esc(it.a)}</p></details>`).join('');
  const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: f.items.map((it) => ({ '@type': 'Question', name: it.q, acceptedAnswer: { '@type': 'Answer', text: it.a } })) };
  const body = `<section class="section page-head"><div class="wrap narrow"><h1 class="sec-title">${esc(f.h1)}</h1></div></section>
<section class="section"><div class="wrap narrow faq">${items}${orderButton(T.ui, T.ui.common.order)}</div></section>
<script type="application/ld+json">${JSON.stringify(ld)}</script>`;
  return renderLayout(ctx, { lang, key: 'faq', title: f.meta.title, desc: f.meta.desc, body });
}

function pageInfo(ctx, lang) {
  const { L, U, config } = ctx;
  const T = L[lang], i = T.info;
  const cards = config.postOrder.map((k) => {
    const p = T.posts[k];
    return `<article class="card"><a class="card-img" href="${U.post(lang, k)}"><img src="${U.asset(`/img/posts/${config.postImages[k]}`)}" alt="" width="1170" height="580" loading="lazy"></a>
    <div class="card-b"><time datetime="${p.date}">${formatDate(p.date, T.locale)}</time><h2><a href="${U.post(lang, k)}">${esc(p.title)}</a></h2><p>${esc(p.desc)}</p><a class="more" href="${U.post(lang, k)}">${esc(T.ui.common.readMore)} →</a></div></article>`;
  }).join('');
  const body = `<section class="section page-head"><div class="wrap narrow"><h1 class="sec-title">${esc(i.h1)}</h1><p class="center lead">${esc(i.lead)}</p></div></section>
<section class="section"><div class="wrap"><div class="cards">${cards}</div></div></section>`;
  return renderLayout(ctx, { lang, key: 'info', title: i.meta.title, desc: i.meta.desc, body });
}

function formatDate(d, locale) {
  try { return new Date(d + 'T12:00:00Z').toLocaleDateString(locale.replace('_', '-'), { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }); } catch { return d; }
}

function pagePost(ctx, lang, k) {
  const { L, U, config } = ctx;
  const T = L[lang], p = T.posts[k];
  const img = `/img/posts/${config.postImages[k]}`;
  const body = p.body.map((b) => {
    if (b.t === 'h') return `<h2>${esc(b.x)}</h2>`;
    if (b.t === 'p') return `<p>${esc(b.x)}</p>`;
    if (b.t === 'ul') return `<ul>${b.x.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
    if (b.t === 'img') return `<figure><img src="${U.asset(img)}" alt="${esc(p.title)}" width="1170" height="580" loading="lazy"></figure>`;
    return '';
  }).join('\n');
  const art = { '@context': 'https://schema.org', '@type': 'Article', headline: p.title, datePublished: p.date, inLanguage: T.htmlLang, image: config.site.domain + U.asset(img), author: { '@type': 'Organization', name: config.site.name } };
  const html = `<section class="section post-head"><div class="wrap narrow"><p class="crumbs"><a href="${U.page(lang, 'info')}">${esc(T.ui.nav.info)}</a></p><h1 class="post-title">${esc(p.title)}</h1><time datetime="${p.date}">${formatDate(p.date, T.locale)}</time></div></section>
<article class="section post"><div class="wrap narrow"><div class="prose">${body}</div>
  <p class="center back"><a href="${U.page(lang, 'info')}">← ${esc(T.ui.common.allPosts)}</a></p>
  ${orderButton(T.ui, T.ui.common.order)}</div></article>
<script type="application/ld+json">${JSON.stringify(art)}</script>`;
  return renderLayout(ctx, { lang, key: 'info', post: k, title: p.seo || p.title, desc: p.desc, body: html, image: img, ogType: 'article' });
}

function pageThanks(ctx, lang) {
  const { L, U } = ctx;
  const T = L[lang], t = T.thanks;
  const body = `<section class="section page-head thanks"><div class="wrap narrow center"><h1 class="sec-title">${esc(t.h1)}</h1><p class="lead">${esc(t.p)}</p><p>${esc(t.link)}</p>
  <p><a class="btn" href="${U.page(lang, 'home')}">${esc(T.ui.common.backHome)}</a></p></div></section>`;
  return renderLayout(ctx, { lang, key: 'thanks', title: t.meta.title, desc: t.meta.desc || t.p, body }).replace('<meta name="description"', '<meta name="robots" content="noindex">\n  <meta name="description"');
}

/* ------------------------------------------------------------------ */
/* build                                                               */
/* ------------------------------------------------------------------ */
function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

export function build() {
  const t0 = Date.now();
  const { config, L } = load();
  const U = makeUrls(config);
  const ctx = { config, L, U };
  fs.rmSync(DIST, { recursive: true, force: true });
  // CLAUDE.md is project notes for Claude Code, not a site file — never publish it
  fs.cpSync(PUBLIC, DIST, { recursive: true, filter: (src) => path.basename(src) !== 'CLAUDE.md' });
  const urls = [];
  for (const lang of config.langs) {
    const add = (dir, html, key, post) => { write(path.join(DIST, dir, 'index.html'), html); urls.push({ lang, key, post }); };
    add(U.dir(lang, 'home'), pageHome(ctx, lang), 'home');
    for (const k of config.menuOrder) add(U.dir(lang, k), pageService(ctx, lang, k), k);
    add(U.dir(lang, 'faq'), pageFaq(ctx, lang), 'faq');
    add(U.dir(lang, 'info'), pageInfo(ctx, lang), 'info');
    for (const k of config.postOrder) add(U.postDir(lang, k), pagePost(ctx, lang, k), 'info', k);
    write(path.join(DIST, U.dir(lang, 'thanks'), 'index.html'), pageThanks(ctx, lang));
  }
  // 404 (Apache: ErrorDocument in .htaccess, Netlify/Cloudflare Pages pick up 404.html automatically)
  write(path.join(DIST, '404.html'), pageThanks(ctx, config.defaultLang).replace(/<title>.*?<\/title>/, '<title>404 | iCleaning</title>').replace(/<h1 class="sec-title">.*?<\/h1>/, '<h1 class="sec-title">404</h1>').replace(/<p class="lead">.*?<\/p>/, ''));
  // sitemap
  const loc = (u) => config.site.domain + (u.post ? U.post(u.lang, u.post) : U.page(u.lang, u.key));
  const sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'];
  for (const u of urls) {
    sm.push(`<url><loc>${loc(u)}</loc>` + config.langs.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${loc({ ...u, lang: l })}"/>`).join('') + '</url>');
  }
  sm.push('</urlset>');
  write(path.join(DIST, 'sitemap.xml'), sm.join('\n'));
  write(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /send.php\n\nSitemap: ${config.site.domain}/sitemap.xml\n`);
  console.log(`built ${urls.length + config.langs.length} pages in ${Date.now() - t0} ms -> ${path.relative(process.cwd(), DIST) || 'dist'}`);
}

/* ------------------------------------------------------------------ */
/* dev server                                                          */
/* ------------------------------------------------------------------ */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain', '.ico': 'image/x-icon' };

function serve(port = 4321) {
  http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.includes('..')) { res.writeHead(400); return res.end(); }
    let f = path.join(DIST, p);
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) {
      if (!p.endsWith('/')) { res.writeHead(301, { Location: p + '/' }); return res.end(); }
      f = path.join(f, 'index.html');
    }
    if (!fs.existsSync(f)) { res.writeHead(404, { 'Content-Type': MIME['.html'] }); return res.end(fs.readFileSync(path.join(DIST, '404.html'))); }
    if (path.basename(f) === 'send.php') { // PHP is not executed by the dev server
      res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true,"test":true}');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  }).listen(port, () => console.log(`dev server: http://localhost:${port}/  (Ctrl+C to stop)`));
  let timer;
  const rebuild = () => { clearTimeout(timer); timer = setTimeout(() => { try { build(); } catch (e) { console.error(e); } }, 150); };
  for (const dir of [SRC, PUBLIC]) fs.watch(dir, { recursive: true }, rebuild);
  fs.watch(path.join(ROOT, 'build.mjs'), () => console.log('build.mjs changed — restart the dev server to apply'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build();
  if (process.argv.includes('--serve')) serve(Number(process.env.PORT) || 4321);
}
