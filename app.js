/* ---------------------------------------------------------------
   Under — a daily spend cap for two people.
   State lives in Store (local + Supabase). This file is the UI.
   --------------------------------------------------------------- */
(function () {
"use strict";

var CFG = window.UNDER_CONFIG || {};
var PEOPLE = CFG.people || [{ key: "A", name: "You" }, { key: "B", name: "Partner" }];
var JOINT = { key: "J", name: CFG.jointLabel || "Joint" };
var ALL = PEOPLE.concat([JOINT]);

var KEYWORDS = [
["karak","Coffee","daily"],["coffee","Coffee","daily"],["latte","Coffee","daily"],["tea","Coffee","daily"],
["juice","Eating out","daily"],["water","Eating out","daily"],["sandwich","Eating out","daily"],
["breakfast","Eating out","daily"],["lunch","Eating out","daily"],["dinner","Eating out","daily"],
["snack","Eating out","daily"],["burger","Eating out","daily"],["shawarma","Eating out","daily"],
["pizza","Eating out","daily"],["biryani","Eating out","daily"],["machboos","Eating out","daily"],
["talabat","Eating out","daily"],["cafe","Eating out","daily"],["groceries","Groceries","daily"],
["lulu","Groceries","daily"],["carrefour","Groceries","daily"],["supermarket","Groceries","daily"],
["petrol","Fuel","daily"],["fuel","Fuel","daily"],["parking","Transport","daily"],["taxi","Transport","daily"],
["uber","Transport","daily"],["careem","Transport","daily"],["bus","Transport","daily"],
["shoes","Clothing","extra"],["clothes","Clothing","extra"],["shirt","Clothing","extra"],
["jacket","Clothing","extra"],["trainers","Clothing","extra"],["phone","Electronics","extra"],
["laptop","Electronics","extra"],["charger","Electronics","extra"],["headphones","Electronics","extra"],
["repair","Home","extra"],["furniture","Home","extra"],["air con","Home","extra"],["tyre","Car","extra"],
["oil change","Car","extra"],["insurance","Car","extra"],["doctor","Medical","extra"],
["pharmacy","Medical","extra"],["dentist","Medical","extra"],["gift","Gifts","extra"],
["flight","Travel","extra"],["hotel","Travel","extra"],["netflix","Subscriptions","extra"],["gym","Subscriptions","extra"]];
var CATS = ["Coffee","Eating out","Groceries","Fuel","Transport","Clothing","Electronics","Home","Car","Medical","Gifts","Travel","Subscriptions","Other"];
var COLOR = {"Coffee":"#8A5A33","Eating out":"#A8763C","Groceries":"#2C6B5E","Fuel":"#3C6B86",
"Transport":"#56678A","Clothing":"#8A5674","Electronics":"#3A6A88","Home":"#6B7648","Car":"#77563A",
"Medical":"#96463F","Gifts":"#8F5C3B","Travel":"#3A766F","Subscriptions":"#665989","Other":"#6B7D8C"};
var CURRENCIES = {BHD:{sym:"BD",dec:3},KWD:{sym:"KD",dec:3},OMR:{sym:"OMR",dec:3},
  AED:{sym:"AED",dec:2},SAR:{sym:"SAR",dec:2},QAR:{sym:"QR",dec:2},
  GBP:{sym:"£",dec:2},USD:{sym:"$",dec:2},EUR:{sym:"€",dec:2}};

var ui = { day:null, month:null, editing:null, undo:null, timer:null, q:"",
           me:null, logFor:null, mFilter:"all", iFilter:"all", capEditing:null };

var $ = function (id) { return document.getElementById(id); };

/* ---------- settings held in the store ---------- */
function caps() { return Store.getPref("caps", {}) || {}; }
function capOf(k) { var c = caps(); return typeof c[k] === "number" ? c[k] : (CFG.defaultCap || 4.5); }
function setCap(k, v) { var c = Object.assign({}, caps()); c[k] = v; Store.setPref("caps", c); }
function carry() { return !!Store.getPref("carry", false); }
function cur() { return CURRENCIES[Store.getPref("cur", CFG.currency)] ? Store.getPref("cur", CFG.currency) : "BHD"; }
function dec() { return CURRENCIES[cur()].dec; }
function sym() { return CURRENCIES[cur()].sym; }
function round(n) { var f = Math.pow(10, dec()); return Math.round(n * f) / f; }
function fmt(n) { return round(n).toLocaleString("en-US", { minimumFractionDigits: dec(), maximumFractionDigits: dec() }); }
function money(n) { return sym() + " " + fmt(n); }
function householdCap() { return PEOPLE.reduce(function (s, p) { return s + capOf(p.key); }, 0); }

/* ---------- dates ---------- */
function key(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function fromKey(k){var p=k.split("-");return new Date(+p[0],+p[1]-1,+p[2]);}
function mkey(k){return k.slice(0,7);}
function daysIn(mk){var p=mk.split("-");return new Date(+p[0],+p[1],0).getDate();}
var TODAY = key(new Date());
function dayName(k){return fromKey(k).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function nameOf(k){var n=k;ALL.forEach(function(p){if(p.key===k)n=p.name;});return n;}

/* ---------- parsing ---------- */
function classify(t){var s=t.toLowerCase(),f=null;
  for(var i=0;i<KEYWORDS.length;i++){if(s.indexOf(KEYWORDS[i][0])!==-1)f=KEYWORDS[i];}
  return f?{cat:f[1],kind:f[2]}:{cat:"Other",kind:"daily"};}

/* "coffee 1.6, sandwich 0.6" is two buys · #category forces one
   · ! marks a one-off · a leading "y" logs to yesterday
   · a leading person key (H:, F:, J:) logs it for them */
function parseLine(raw) {
  var text = (raw || "").trim(); if (!text) return [];
  var date = ui.day || TODAY, person = ui.logFor;
  var who = text.match(/^([a-z]{1,2})\s*:\s*/i);
  if (who) {
    var k = who[1].toUpperCase();
    var hit = null; ALL.forEach(function (p) { if (p.key.toUpperCase() === k) hit = p.key; });
    if (hit) { person = hit; text = text.slice(who[0].length); }
  }
  var lead = text.match(/^(yesterday|y)\s+/i);
  if (lead) { var d = fromKey(date); d.setDate(d.getDate() - 1); date = key(d); text = text.slice(lead[0].length); }
  var out = [];
  text.split(/\s*[,;+]\s*|\s+and\s+/i).forEach(function (part) {
    var one = parseOne(part, date, person); if (one) out.push(one);
  });
  return out;
}
function parseOne(part, date, person) {
  var t = (part || "").trim(); if (!t) return null;
  var forced = null, kind = null;
  t = t.replace(/#([a-z ]+)/i, function (_, c) {
    var want = c.trim().toLowerCase();
    CATS.forEach(function (k) { if (k.toLowerCase().indexOf(want) === 0 && !forced) forced = k; });
    return " ";
  });
  if (t.indexOf("!") !== -1) { kind = "extra"; t = t.replace(/!/g, " "); }
  var m = t.match(/(\d+(?:[.,]\d+)?)(?!.*\d)/); if (!m) return null;
  var amt = parseFloat(m[1].replace(",", ".")); if (!(amt > 0) || !isFinite(amt)) return null;
  var nm = (t.slice(0, m.index) + t.slice(m.index + m[1].length))
    .replace(/\b(bd|bhd|kd|aed|sar|qr|usd|gbp|eur)\b/ig, "").replace(/\s+/g, " ").trim();
  if (!nm) nm = "Something";
  nm = nm.charAt(0).toUpperCase() + nm.slice(1);
  var c = classify(nm);
  return { id: uid(), date: date, person: person, name: nm.slice(0, 60),
           amount: round(amt), cat: forced || c.cat, kind: kind || c.kind };
}

/* ---------- queries ---------- */
function all() { return Store.live(); }
function onDay(k, person) {
  return all().filter(function (i) {
    return i.date === k && (!person || person === "all" || i.person === person);
  });
}
function dayTotal(k, person) {
  return onDay(k, person).reduce(function (s, i) { return i.kind === "daily" ? s + i.amount : s; }, 0);
}
function capFor(person) {
  if (person === "all" || !person) return householdCap();
  if (person === JOINT.key) return 0;
  return capOf(person);
}
function inMonth(mk, person) {
  return all().filter(function (i) {
    return mkey(i.date) === mk && (!person || person === "all" || i.person === person);
  });
}
function bankedBefore(k, person) {
  if (!carry()) return 0;
  var mk = mkey(k), upto = +k.slice(8), total = 0, cap = capFor(person);
  for (var i = 1; i < upto; i++) {
    var kk = mk + "-" + String(i).padStart(2, "0");
    if (onDay(kk, person).length) total += Math.max(cap - dayTotal(kk, person), 0);
  }
  return round(total);
}

/* ---------- toast ---------- */
function toast(msg, undoFn) {
  $("toast-msg").textContent = msg;
  $("toast-act").hidden = !undoFn;
  ui.undo = undoFn || null;
  $("toast").hidden = false;
  clearTimeout(ui.timer);
  ui.timer = setTimeout(function () { $("toast").hidden = true; ui.undo = null; }, 5000);
}

/* ---------- today ---------- */
function renderWho() {
  $("me-name").textContent = nameOf(ui.me);
  $("forwho").innerHTML = ALL.map(function (p) {
    var label = p.key === ui.me ? "Me" : p.name;
    return '<button type="button" data-for="' + p.key + '" aria-pressed="' + (ui.logFor === p.key) + '">' +
      esc(label) + "</button>";
  }).join("");
}
function renderToday() {
  $("today-date").textContent = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  $("hero-cur").textContent = sym();
  renderWho();

  var mine = dayTotal(ui.day, ui.me), bank = bankedBefore(ui.day, ui.me);
  var allow = capOf(ui.me) + bank, left = round(allow - mine), over = left < 0;
  var parts = Math.abs(left).toFixed(dec()).split(".");
  $("hero").classList.toggle("over", over);
  $("hero-lab").textContent = over ? "You're over your cap"
    : (ui.day === TODAY ? "Left to spend today" : "Was left that day");
  $("hero-int").textContent = (+parts[0]).toLocaleString();
  $("hero-dec").textContent = parts[1] ? "." + parts[1] : "";
  $("hero-note").innerHTML = over ? "Spent <b>" + money(mine) + "</b> against " + money(allow)
    : "<b>" + money(mine) + "</b> spent of " + money(allow);
  $("hero-track").style.width = (allow ? Math.min(mine / allow, 1) * 100 : 0) + "%";
  var hb = $("hero-banked");
  if (carry() && bank > 0) { hb.hidden = false; hb.textContent = money(bank) + " banked from earlier this month"; }
  else hb.hidden = true;

  var others = ALL.filter(function (p) { return p.key !== ui.me; });
  var otherTotal = others.reduce(function (s, p) { return s + dayTotal(ui.day, p.key); }, 0);
  $("pair-meta").textContent = otherTotal ? money(otherTotal) : "";
  $("pair").innerHTML = others.map(function (p) {
    var v = dayTotal(ui.day, p.key), cap = capFor(p.key);
    var ov = cap > 0 && v > cap;
    return '<div class="who theirs"><div class="n"><span class="initial">' + esc(p.key) + "</span>" +
      esc(p.name) + "</div>" +
      '<div class="v' + (ov ? " over" : "") + '">' + fmt(v) + "</div>" +
      '<div class="bar"><i class="' + (ov ? "over" : "") + '" style="width:' +
      (cap ? Math.min(v / cap, 1) * 100 : (v > 0 ? 100 : 0)) + '%"></i></div></div>';
  }).join("");

  var strip = "", t = new Date(), under = 0, logged = 0, hcap = householdCap();
  for (var i = 9; i >= 0; i--) {
    var d = new Date(t); d.setDate(t.getDate() - i);
    var k = key(d), s = dayTotal(k, "all"), has = onDay(k, "all").length, ov = s > hcap;
    if (has) { logged++; if (!ov) under++; }
    strip += '<button class="day" data-day="' + k + '" aria-current="' + (k === ui.day) +
      '" aria-label="' + dayName(k) + ", " + money(s) + '">' +
      '<span class="gauge"><u style="bottom:66.6%"></u><i class="' + (ov ? "over" : "") +
      '" style="height:' + Math.min(hcap ? s / (hcap * 1.5) : 0, 1) * 100 + '%"></i></span>' +
      "<span>" + d.getDate() + "</span></button>";
  }
  $("strip").innerHTML = strip;
  $("strip-meta").textContent = logged ? under + " of " + logged + " under, both of you" : "nothing logged yet";
  var curEl = $("strip").querySelector('[aria-current="true"]');
  if (curEl) curEl.scrollIntoView({ block: "nearest", inline: "center" });

  var items = onDay(ui.day, "all").filter(function (i) {
    return i.person === ui.me || i.logged_by === ui.me;
  });
  $("ledger-title").textContent = ui.day === TODAY ? "Today" : dayName(ui.day);
  var hh = dayTotal(ui.day, "all");
  $("ledger-meta").textContent = items.length
    ? items.length + (items.length === 1 ? " thing · " : " things · ") + money(hh) + " between you" : "";
  $("ledger").innerHTML = items.length ? items.map(function (i) { return row(i); }).join("")
    : '<div class="blank">Nothing logged' + (ui.day === TODAY ? " yet" : "") +
      '.<br>Try “karak 0.3” or “F: lunch 2.4”.</div>';
}
function row(i, withDate) {
  return '<button class="item" data-edit="' + i.id + '">' +
    '<span class="dot" style="background:' + (COLOR[i.cat] || COLOR.Other) + '"></span>' +
    '<span class="what"><span class="nm">' + esc(i.name) + '</span><span class="ct">' +
    (withDate ? fromKey(i.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + " · " : "") +
    esc(nameOf(i.person)) + " · " + i.cat +
    (i.kind === "extra" ? '<span class="tag">one-off</span>' : "") + "</span></span>" +
    '<span class="amt">' + fmt(i.amount) + "</span></button>";
}

/* ---------- month ---------- */
function filterButtons(el, current, attr) {
  el.innerHTML = ([{ key: "all", name: "Both" }].concat(ALL)).map(function (p) {
    return '<button type="button" ' + attr + '="' + p.key + '" aria-pressed="' + (current === p.key) + '">' +
      esc(p.key === ui.me ? "You" : p.name) + "</button>";
  }).join("");
}
function series(mk, person) {
  var n = daysIn(mk), totals = [], cum = [], run = 0;
  for (var d = 1; d <= n; d++) {
    var v = dayTotal(mk + "-" + String(d).padStart(2, "0"), person);
    totals.push(v); run += v; cum.push(run);
  }
  return { n: n, totals: totals, cum: cum };
}
function renderMonth() {
  var mk = ui.month, who = ui.mFilter, cap = capFor(who), s = series(mk, who);
  filterButtons($("m-filter"), who, "data-mf");
  $("m-title").textContent = fromKey(mk + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  $("m-next").disabled = mk >= mkey(TODAY);

  var logged = 0, underCount = 0, maxDay = 0, worst = null;
  for (var d = 1; d <= s.n; d++) {
    var k = mk + "-" + String(d).padStart(2, "0"), v = s.totals[d - 1];
    if (onDay(k, who).length) { logged++; if (cap && v <= cap) underCount++; }
    if (v > maxDay) { maxDay = v; worst = k; }
  }
  var sc = $("scrub");
  sc.max = s.n;
  sc.value = (mk === mkey(TODAY)) ? Math.min(fromKey(TODAY).getDate(), s.n)
    : Math.min(Math.max(+sc.value || 1, 1), s.n);
  renderScrub();

  var daily = s.cum[s.n - 1] || 0;
  var extra = inMonth(mk, who).reduce(function (a, i) { return i.kind === "extra" ? a + i.amount : a; }, 0);
  var kept = cap * logged - daily;
  $("m-daily").textContent = money(daily);
  $("m-kept").textContent = cap ? money(Math.abs(kept)) : "—";
  $("m-kept").className = "v " + (kept < 0 ? "bad" : "good");
  $("m-extra").textContent = money(extra);
  $("m-proj").textContent = logged ? money(daily / logged * s.n) : "—";
  $("m-proj").className = "v " + (cap && logged && daily / logged > cap ? "bad" : "");
  $("m-under").textContent = cap && logged ? underCount + " of " + logged : "—";
  $("m-worst").textContent = worst ? fromKey(worst).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";
  renderAllList();
}
function drawChart(s, cap) {
  var W = 340, H = 150, PL = 4, PR = 4, PT = 10, PB = 20, n = s.n;
  var maxY = Math.max(cap * n, s.cum[n - 1] || 0) * 1.04 || 1;
  var x = function (i) { return PL + (W - PL - PR) * (i / (n - 1 || 1)); };
  var y = function (v) { return PT + (H - PT - PB) * (1 - v / maxY); };
  var line = "";
  for (var i = 0; i < n; i++) line += (i ? "L" : "M") + x(i).toFixed(1) + " " + y(s.cum[i]).toFixed(1) + " ";
  var area = line + "L" + x(n - 1).toFixed(1) + " " + y(0) + " L" + x(0).toFixed(1) + " " + y(0) + " Z";
  var over = cap > 0 && (s.cum[n - 1] || 0) > cap * n, col = over ? "var(--rust)" : "var(--sea)";
  var sel = Math.min(Math.max(+$("scrub").value, 1), n) - 1;
  var ticks = "";
  [1, Math.round(n / 2), n].forEach(function (dd) {
    ticks += '<text x="' + x(dd - 1) + '" y="' + (H - 4) + '" fill="currentColor" font-size="10" opacity=".5" text-anchor="' +
      (dd === 1 ? "start" : dd === n ? "end" : "middle") + '">' + dd + "</text>";
  });
  $("chart").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Spending so far this month against the cap">' +
    '<defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1">' +
    '<stop offset="0" stop-color="' + col + '" stop-opacity=".3"/><stop offset="1" stop-color="' + col + '" stop-opacity="0"/>' +
    "</linearGradient></defs>" +
    '<line x1="' + PL + '" x2="' + (W - PR) + '" y1="' + y(0) + '" y2="' + y(0) + '" stroke="currentColor" opacity=".18"/>' +
    (cap ? '<path d="M' + x(0) + " " + y(0) + " L" + x(n - 1) + " " + y(cap * n) +
      '" stroke="currentColor" opacity=".45" stroke-width="1.5" fill="none" stroke-dasharray="4 4"/>' : "") +
    '<path d="' + area + '" fill="url(#g)"/>' +
    '<path d="' + line + '" fill="none" stroke="' + col + '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<line x1="' + x(sel) + '" x2="' + x(sel) + '" y1="' + PT + '" y2="' + y(0) + '" stroke="var(--brass)" stroke-width="1" opacity=".55"/>' +
    '<circle cx="' + x(sel) + '" cy="' + y(s.cum[sel]) + '" r="4.5" fill="var(--brass)"/>' + ticks + "</svg>";
}
function renderScrub() {
  var mk = ui.month, who = ui.mFilter, n = daysIn(mk), cap = capFor(who);
  var d = Math.min(Math.max(+$("scrub").value, 1), n);
  var k = mk + "-" + String(d).padStart(2, "0"), v = dayTotal(k, who), items = onDay(k, who);
  $("scrub-date").textContent = dayName(k);
  $("scrub-val").textContent = money(v);
  $("scrub-val").className = "v" + (cap && v > cap ? " over" : (v === 0 ? " zero" : ""));
  $("scrub-against").innerHTML = !cap ? (items.length ? "shared spending" : "nothing logged")
    : (v > cap ? money(v - cap) + "<br>over the cap"
      : (items.length ? money(cap - v) + "<br>kept back" : "nothing logged"));
  $("scrub-list").innerHTML = items.length ? items.map(function (i) {
    return '<button class="mini" data-edit="' + i.id + '"><span class="l"><span class="dot" style="background:' +
      (COLOR[i.cat] || COLOR.Other) + '"></span><span>' + esc(i.name) +
      ' <span class="initial">' + esc(i.person) + "</span>" +
      (i.kind === "extra" ? ' <span class="tag">one-off</span>' : "") + "</span></span>" +
      '<span class="r">' + fmt(i.amount) + "</span></button>";
  }).join("") : '<div class="blank">Nothing that day.</div>';
  drawChart(series(mk, who), cap);
}
function renderAllList() {
  var items = inMonth(ui.month, ui.mFilter).slice()
    .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  var q = ui.q.trim().toLowerCase();
  if (q) items = items.filter(function (i) {
    return (i.name + " " + i.cat + " " + nameOf(i.person)).toLowerCase().indexOf(q) !== -1;
  });
  var sum = items.reduce(function (a, i) { return a + i.amount; }, 0);
  $("all-meta").textContent = items.length ? items.length + " · " + money(sum) : "";
  $("all").innerHTML = items.length ? items.slice(0, 150).map(function (i) { return row(i, true); }).join("")
    : '<div class="blank">' + (q ? "Nothing matches “" + esc(ui.q) + "”." : "Nothing logged this month.") + "</div>";
}

/* ---------- insights ---------- */
function renderInsights() {
  var who = ui.iFilter, cap = capFor(who);
  filterButtons($("i-filter"), who, "data-if");
  var since = new Date(); since.setDate(since.getDate() - 29); since.setHours(0, 0, 0, 0);
  var recent = all().filter(function (i) {
    return fromKey(i.date) >= since && (who === "all" || i.person === who);
  });
  var byCat = {}, total = 0;
  recent.forEach(function (i) { byCat[i.cat] = (byCat[i.cat] || 0) + i.amount; total += i.amount; });
  var rows = Object.keys(byCat).map(function (c) { return [c, byCat[c]]; })
    .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 7);
  var max = rows.length ? rows[0][1] : 1;
  $("cat-bars").innerHTML = rows.length ? rows.map(function (r) {
    return '<div class="brow"><span class="n">' + r[0] + '</span><span class="t"><i style="width:' +
      (r[1] / max * 100) + "%;background:" + (COLOR[r[0]] || COLOR.Other) + '"></i></span><span class="a">' +
      fmt(r[1]) + "</span></div>";
  }).join("") : '<div class="blank">Nothing in the last 30 days.</div>';
  $("i-window").textContent = "last 30 days · " + money(total);

  var seen = {}; recent.forEach(function (i) { if (i.kind === "daily") seen[i.date] = 1; });
  var sums = [0,0,0,0,0,0,0], counts = [0,0,0,0,0,0,0];
  Object.keys(seen).forEach(function (k) { var w = fromKey(k).getDay(); sums[w] += dayTotal(k, who); counts[w]++; });
  var avgs = sums.map(function (s, i) { return counts[i] ? s / counts[i] : 0; });
  var wmax = Math.max.apply(null, avgs.concat([cap || 1]));
  var names = ["S","M","T","W","T","F","S"];
  $("week").innerHTML = avgs.map(function (a, i) {
    return '<div class="wcol"><span class="wbar"><i class="' + (cap && a > cap ? "over" : "") +
      '" style="height:' + (wmax ? a / wmax * 100 : 0) + '%"></i></span><span>' + names[i] + "</span></div>";
  }).join("");
  var busiest = avgs.indexOf(Math.max.apply(null, avgs));
  $("i-weekmeta").textContent = counts[busiest] ?
    ["Sundays","Mondays","Tuesdays","Wednesdays","Thursdays","Fridays","Saturdays"][busiest] + " cost most" : "";

  var keys = Object.keys(seen).sort();
  $("i-avg").textContent = keys.length ? money(keys.reduce(function (s, k) { return s + dayTotal(k, who); }, 0) / keys.length) : "—";

  var best = 0, run = 0, zero = 0, d = new Date(since), end = new Date();
  while (d <= end) {
    var k2 = key(d), has = onDay(k2, who).length, v = dayTotal(k2, who);
    if (has && v === 0) zero++;
    if (has && cap && v <= cap) { run++; if (run > best) best = run; } else if (has && cap) { run = 0; }
    d.setDate(d.getDate() + 1);
  }
  $("i-streak").textContent = best ? best + (best === 1 ? " day" : " days") : "—";
  $("i-zero").textContent = zero ? zero + (zero === 1 ? " day" : " days") : "—";
  var big = recent.slice().sort(function (a, b) { return b.amount - a.amount; })[0];
  $("i-big").textContent = big ? money(big.amount) : "—";

  var extras = all().filter(function (i) {
    return i.kind === "extra" && (who === "all" || i.person === who);
  }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 6);
  $("extras").innerHTML = extras.length ? extras.map(function (i) { return row(i, true); }).join("")
    : '<div class="blank">No one-off buys yet.</div>';
}

/* ---------- settings ---------- */
function renderSettings() {
  $("cap-person").innerHTML = PEOPLE.map(function (p) {
    return '<button type="button" data-cap="' + p.key + '" aria-pressed="' + (ui.capEditing === p.key) + '">' +
      esc(p.name) + "</button>";
  }).join("");
  var c = capOf(ui.capEditing);
  $("cap-num").textContent = money(c);
  $("cap-sub").textContent = money(c * 30) + " over 30 days · " + money(householdCap()) + " a day between you";
  $("cap-range").value = c;
  $("cap-min").textContent = fmt(0.5); $("cap-max").textContent = fmt(25);
  $("cur").value = cur();
  $("carry").setAttribute("aria-checked", String(carry()));
  $("carry-state").textContent = carry() ? "On — unspent money rolls into the next day" : "Off";
  var theme = Store.getPref("theme", "auto");
  Array.prototype.forEach.call($("theme").children, function (b) {
    b.setAttribute("aria-pressed", String(b.getAttribute("data-theme") === theme));
  });
  var em = Store.email();
  $("acct-line").textContent = em ? em + " · logging as " + nameOf(ui.me)
    : "Signed out — this device only. Add your Supabase keys to config.js to share.";
  $("signout").hidden = !em;
  var days = {}; all().forEach(function (i) { days[i.date] = 1; });
  $("data-meta").textContent = all().length + " purchases across " + Object.keys(days).length + " days.";
  renderSync(Store.sync());
}
function renderSync(s) {
  var dot = $("sync-dot"), text = $("sync-text");
  dot.className = "syncdot " + (s.state === "synced" ? "synced" : s.state === "pending" ? "pending" :
    s.state === "error" ? "error" : "");
  if (!Store.configured()) {
    text.textContent = "Not set up — this device keeps its own ledger";
    $("sync-help").textContent = "Add your Supabase URL and key to config.js and both phones share one ledger.";
    return;
  }
  $("sync-help").textContent = "Both phones read and write the same ledger.";
  text.textContent = s.state === "synced" ? "Up to date" + (s.last ? " · " + s.last.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "")
    : s.state === "pending" ? "Some changes still to send"
    : s.state === "error" ? "Can't reach the server — changes are saved here"
    : "Connecting…";
}
function applyTheme() {
  var t = Store.getPref("theme", "auto");
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
}

/* ---------- edit ---------- */
function openEdit(id) {
  var it = Store.byId(id); if (!it) return;
  ui.editing = id;
  $("e-name").value = it.name; $("e-amt").value = it.amount; $("e-date").value = it.date;
  $("e-person").innerHTML = ALL.map(function (p) {
    return '<option value="' + p.key + '">' + esc(p.name) + "</option>"; }).join("");
  $("e-person").value = it.person;
  $("e-cat").innerHTML = CATS.map(function (c) { return '<option value="' + c + '">' + c + "</option>"; }).join("");
  $("e-cat").value = CATS.indexOf(it.cat) >= 0 ? it.cat : "Other";
  $("e-kind").value = it.kind;
  $("edit").showModal();
  setTimeout(function () { $("e-name").focus(); }, 30);
}

/* ---------- paging ---------- */
var PAGES = ["today", "month", "insights", "settings"];
function show(page) {
  ui.page = page;
  PAGES.forEach(function (p) { $("page-" + p).hidden = (p !== page); });
  Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) {
    t.setAttribute("aria-selected", String(t.getAttribute("data-page") === page));
  });
  window.scrollTo(0, 0);
  if (page === "month") renderMonth();
  if (page === "insights") renderInsights();
  if (page === "settings") renderSettings();
}
function renderAll() {
  renderToday();
  if (!$("page-month").hidden) renderMonth();
  if (!$("page-insights").hidden) renderInsights();
  if (!$("page-settings").hidden) renderSettings();
}

/* ---------- events ---------- */
$("toast-act").addEventListener("click", function () {
  if (ui.undo) { ui.undo(); ui.undo = null; }
  $("toast").hidden = true;
});
$("account-pill").addEventListener("click", function () { show("settings"); });
$("signout").addEventListener("click", function () {
  Store.signOut().then(function () { toast("Signed out"); });
});
$("forwho").addEventListener("click", function (e) {
  var b = e.target.closest("[data-for]"); if (!b) return;
  ui.logFor = b.getAttribute("data-for");
  renderWho();
});
$("input").addEventListener("input", function () {
  var list = parseLine(this.value);
  $("go").disabled = !list.length;
  if (!list.length) {
    $("read").textContent = this.value.trim() ? "Add a price and it's ready — “karak 0.3”."
      : "Type what was bought and the price. Commas for several.";
    return;
  }
  $("read").innerHTML = list.map(function (p) {
    return '<span class="chip"><span class="dot" style="background:' + (COLOR[p.cat] || COLOR.Other) + '"></span>' +
      esc(p.name) + " · " + fmt(p.amount) + " · " + esc(nameOf(p.person)) + " · " + p.cat +
      (p.kind === "extra" ? " · one-off" : "") + "</span>";
  }).join(" ");
});
$("entry").addEventListener("submit", function (e) {
  e.preventDefault();
  var list = parseLine($("input").value);
  if (!list.length) return;
  Store.add(list);
  $("input").value = ""; $("go").disabled = true;
  $("read").textContent = "Type what was bought and the price. Commas for several.";
  var ids = list.map(function (p) { return p.id; });
  toast(list.length === 1 ? "Added “" + list[0].name + "”" : "Added " + list.length + " things", function () {
    ids.forEach(function (id) { Store.remove(id); });
  });
});
$("strip").addEventListener("click", function (e) {
  var b = e.target.closest("[data-day]"); if (!b) return;
  ui.day = b.getAttribute("data-day"); renderToday();
});
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-edit]"); if (!b) return;
  openEdit(b.getAttribute("data-edit"));
});
$("e-save").addEventListener("click", function () {
  var amt = parseFloat($("e-amt").value);
  if (!(amt > 0) || !isFinite(amt)) { $("e-amt").focus(); return; }
  var d = $("e-date").value;
  Store.update(ui.editing, {
    name: ($("e-name").value.trim() || "Something").slice(0, 60),
    amount: round(amt), cat: $("e-cat").value, kind: $("e-kind").value,
    person: $("e-person").value,
    date: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined
  });
  $("edit").close(); toast("Saved");
});
$("e-cancel").addEventListener("click", function () { $("edit").close(); });
$("e-del").addEventListener("click", function () {
  var gone = Store.remove(ui.editing);
  $("edit").close();
  if (gone) toast("Deleted “" + gone.name + "”", function () { Store.restore(gone.id); });
});
$("scrub").addEventListener("input", renderScrub);
$("q").addEventListener("input", function () { ui.q = this.value; renderAllList(); });
$("m-filter").addEventListener("click", function (e) {
  var b = e.target.closest("[data-mf]"); if (!b) return;
  ui.mFilter = b.getAttribute("data-mf"); renderMonth();
});
$("i-filter").addEventListener("click", function (e) {
  var b = e.target.closest("[data-if]"); if (!b) return;
  ui.iFilter = b.getAttribute("data-if"); renderInsights();
});
$("m-prev").addEventListener("click", function () { ui.month = shiftMonth(ui.month, -1); renderMonth(); });
$("m-next").addEventListener("click", function () { ui.month = shiftMonth(ui.month, 1); renderMonth(); });
function shiftMonth(mk, by) {
  var p = mk.split("-"), d = new Date(+p[0], +p[1] - 1 + by, 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
$("cap-person").addEventListener("click", function (e) {
  var b = e.target.closest("[data-cap]"); if (!b) return;
  ui.capEditing = b.getAttribute("data-cap"); renderSettings();
});
$("cap-range").addEventListener("input", function () {
  var v = round(+this.value);
  $("cap-num").textContent = money(v);
  $("cap-sub").textContent = money(v * 30) + " over 30 days";
});
$("cap-range").addEventListener("change", function () {
  setCap(ui.capEditing, round(+this.value)); renderSettings(); renderToday();
});
$("sync-now").addEventListener("click", function () { Store.pull(); });
$("carry").addEventListener("click", function () {
  Store.setPref("carry", !carry()); renderSettings(); renderToday();
});
$("cur").addEventListener("change", function () { Store.setPref("cur", this.value); renderAll(); });
$("theme").addEventListener("click", function (e) {
  var b = e.target.closest("[data-theme]"); if (!b) return;
  Store.setPref("theme", b.getAttribute("data-theme")); applyTheme(); renderSettings();
});
$("sync-now").addEventListener("click", function () {
  Store.pull(); toast(Store.configured() ? "Syncing…" : "Sharing isn't set up yet");
});
$("export").addEventListener("click", function () {
  $("data-title").textContent = "Export";
  $("data-lead").textContent = "Copy this somewhere safe. Pasting it back restores everything.";
  $("data-text").value = JSON.stringify({ v: 1, prefs: Store.prefs(), items: all() });
  $("data-text").readOnly = true; $("data-ok").textContent = "Copy"; $("data").showModal();
});
$("import").addEventListener("click", function () {
  $("data-title").textContent = "Import";
  $("data-lead").textContent = "Paste exported data. This replaces what's here.";
  $("data-text").value = ""; $("data-text").readOnly = false; $("data-ok").textContent = "Replace";
  $("data").showModal();
  setTimeout(function () { $("data-text").focus(); }, 30);
});
$("data-close").addEventListener("click", function () { $("data").close(); });
$("data-ok").addEventListener("click", function () {
  var t = $("data-text");
  if (t.readOnly) {
    try {
      t.select();
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.value);
      else document.execCommand("copy");
      toast("Copied");
    } catch (e) { toast("Select the text and copy it manually"); }
    return;
  }
  try {
    var d = JSON.parse(t.value);
    if (!d || !Array.isArray(d.items)) throw new Error("shape");
    var clean = d.items.filter(function (i) {
      return i && /^\d{4}-\d{2}-\d{2}$/.test(i.date) && isFinite(i.amount) && i.amount > 0;
    });
    if (!clean.length) throw new Error("empty");
    Store.replaceAll(clean);
    if (d.prefs) Object.keys(d.prefs).forEach(function (k) { Store.setPref(k, d.prefs[k]); });
    $("data").close(); renderAll(); show("today");
    toast("Imported " + clean.length + " purchases");
  } catch (e) { toast("That didn't look like exported data"); }
});
$("wipe").addEventListener("click", function () {
  var backup = all().map(function (i) { return i.id; });
  Store.wipe(); 
  toast("Everything deleted", function () { backup.forEach(function (id) { Store.restore(id); }); });
});
document.querySelector(".tabs").addEventListener("click", function (e) {
  var t = e.target.closest(".tab"); if (!t) return;
  show(t.getAttribute("data-page"));
});
document.addEventListener("keydown", function (e) {
  if (e.key === "/" && document.activeElement === document.body && !$("page-today").hidden) {
    e.preventDefault(); $("input").focus();
  }
});

/* ---------- boot ---------- */
$("cur").innerHTML = Object.keys(CURRENCIES).map(function (c) {
  return '<option value="' + c + '">' + c + " — " + CURRENCIES[c].sym + "</option>";
}).join("");

ui.day = TODAY; ui.month = mkey(TODAY);
ui.capEditing = PEOPLE[0].key;
$("read").textContent = "Type what was bought and the price. Commas for several.";

function screen(which) {
  $("page-auth").hidden = which !== "auth";
  $("page-claim").hidden = which !== "claim";
  $("app-shell").hidden = which !== "app";
  document.querySelector(".tabs").hidden = which !== "app";
}
function routeAuth(state) {
  if (state === "signed-out") { screen("auth"); return; }
  if (state === "needs-profile") {
    $("claim-people").innerHTML = PEOPLE.map(function (p) {
      return '<button class="btn" type="button" data-claim="' + p.key + '" aria-pressed="false">' +
        esc(p.name) + "</button>";
    }).join("");
    $("claim-house").value = CFG.householdId || "";
    screen("claim");
    return;
  }
  if (state === "ready" || state === "local") {
    ui.me = Store.me();
    ui.logFor = ui.me;
    ui.capEditing = ui.me;
    applyTheme();
    screen("app");
    renderAll();
    show(PAGES.indexOf(ui.page) > -1 ? ui.page : "today");
  }
}

/* sign in / create account */
function authMsg(text, ok) {
  var el = $("a-msg"); el.textContent = text || ""; el.className = "msg" + (ok ? " ok" : "");
}
$("a-signin").addEventListener("click", function () {
  authMsg("Signing in…", true);
  Store.signIn($("a-email").value.trim(), $("a-pass").value)
    .then(function () { authMsg(""); })
    .catch(function (e) { authMsg(e.message || "That didn't work"); });
});
$("a-signup").addEventListener("click", function () {
  authMsg("Creating your account…", true);
  Store.signUp($("a-email").value.trim(), $("a-pass").value)
    .then(function (res) {
      if (res && res.data && !res.data.session) authMsg("Check your email to confirm, then sign in.", true);
      else authMsg("");
    })
    .catch(function (e) { authMsg(e.message || "That didn't work"); });
});
$("a-pass").addEventListener("keydown", function (e) { if (e.key === "Enter") $("a-signin").click(); });

/* pick who you are and join the household */
var claimPick = null;
$("claim-people").addEventListener("click", function (e) {
  var b = e.target.closest("[data-claim]"); if (!b) return;
  claimPick = b.getAttribute("data-claim");
  Array.prototype.forEach.call($("claim-people").children, function (x) {
    var on = x.getAttribute("data-claim") === claimPick;
    x.setAttribute("aria-pressed", String(on));
    x.className = "btn" + (on ? " primary" : "");
  });
});
$("claim-go").addEventListener("click", function () {
  var house = $("claim-house").value.trim();
  if (!claimPick) { $("claim-msg").textContent = "Pick which one you are."; return; }
  if (!house) { $("claim-msg").textContent = "Enter the household code."; return; }
  $("claim-msg").textContent = "Joining…";
  Store.claimProfile(claimPick, house, nameOf(claimPick))
    .then(function () { $("claim-msg").textContent = ""; })
    .catch(function (e) { $("claim-msg").textContent = e.message || "Couldn't join"; });
});
$("claim-out").addEventListener("click", function () { Store.signOut(); });

Store.on(function (kind, detail) {
  if (kind === "auth") routeAuth(detail);
  if (kind === "change") { if (!$("app-shell").hidden) renderAll(); }
  if (kind === "sync") { if (!$("page-settings").hidden) renderSync(detail); }
  if (kind === "error") toast(detail);
});

if (!Store.configured()) {
  $("a-fine").textContent = "Sharing isn't set up on this copy yet — add your Supabase URL and key to config.js.";
}
Store.start();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  });
}
})();
