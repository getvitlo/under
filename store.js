/* ---------------------------------------------------------------
   Store — accounts, local cache, and sync.

   Each person signs in with their own email. A `profiles` row ties
   that account to a household and to a person key (H / F), and the
   database only ever returns rows from your own household.

   Everything is cached locally per account, so the app opens
   instantly and keeps working with no signal. Writes queue and go
   out when it can reach the server. Merging is last-write-wins on
   `updated_at`; deletes are soft so they travel too.
   --------------------------------------------------------------- */

window.Store = (function () {
  "use strict";

  var CFG = window.UNDER_CONFIG || {};
  var sb = null, subs = [], channel = null;

  var session = null;                 // supabase session
  var profile = null;                 // { household_id, person_key, display_name }
  var authState = "loading";          // loading | signed-out | needs-profile | ready | local
  var items = [], prefs = {}, queue = [];
  var status = { state: "off", last: null };

  function scope() { return session ? session.user.id : "local"; }
  function LS(k) { return "under." + k + "." + scope(); }

  /* ---------- events ---------- */
  function on(fn) { subs.push(fn); }
  function emit(kind, detail) { subs.forEach(function (f) { f(kind, detail); }); }

  /* ---------- local cache ---------- */
  function readLocal() {
    try { items = JSON.parse(localStorage.getItem(LS("items")) || "[]"); if (!Array.isArray(items)) items = []; }
    catch (e) { items = []; }
    try { prefs = JSON.parse(localStorage.getItem(LS("prefs")) || "{}") || {}; } catch (e) { prefs = {}; }
    try { queue = JSON.parse(localStorage.getItem(LS("queue")) || "[]") || []; } catch (e) { queue = []; }
  }
  function writeItems() {
    try { localStorage.setItem(LS("items"), JSON.stringify(items)); }
    catch (e) { emit("error", "This browser is blocking storage"); }
  }
  function writePrefs() { try { localStorage.setItem(LS("prefs"), JSON.stringify(prefs)); } catch (e) {} }
  function writeQueue() { try { localStorage.setItem(LS("queue"), JSON.stringify(queue)); } catch (e) {} }

  /* ---------- data ---------- */
  function live() { return items.filter(function (i) { return !i.deleted; }); }
  function byId(id) { var f = null; items.forEach(function (i) { if (i.id === id) f = i; }); return f; }
  function stamp() { return new Date().toISOString(); }
  function mine() { return profile ? profile.person_key : ((CFG.people && CFG.people[0].key) || "A"); }

  function add(list) {
    list.forEach(function (i) {
      i.updated_at = stamp();
      i.logged_by = mine();
      items.unshift(i);
    });
    writeItems(); list.forEach(push); emit("change");
  }
  function update(id, patch) {
    var it = byId(id); if (!it) return;
    Object.keys(patch).forEach(function (k) { if (patch[k] !== undefined) it[k] = patch[k]; });
    it.updated_at = stamp();
    writeItems(); push(it); emit("change");
  }
  function remove(id) {
    var it = byId(id); if (!it) return null;
    it.deleted = true; it.updated_at = stamp();
    writeItems(); push(it); emit("change");
    return it;
  }
  function restore(id) { update(id, { deleted: false }); }
  function replaceAll(list) {
    items = list.map(function (i) { i.updated_at = i.updated_at || stamp(); return i; });
    writeItems(); emit("change"); items.forEach(push);
  }
  function wipe() {
    items.forEach(function (i) { i.deleted = true; i.updated_at = stamp(); });
    writeItems(); items.forEach(push); emit("change");
  }
  function getPref(k, d) { return prefs[k] === undefined ? d : prefs[k]; }
  function setPref(k, v) { prefs[k] = v; writePrefs(); pushPrefs(); emit("change"); }

  /* ---------- rows ---------- */
  function household() { return profile ? profile.household_id : (CFG.householdId || "local"); }
  function rowOf(i) {
    return { id: i.id, household_id: household(), day: i.date, person: i.person,
      logged_by: i.logged_by || mine(), name: i.name, amount: i.amount, cat: i.cat,
      kind: i.kind, deleted: !!i.deleted, updated_at: i.updated_at };
  }
  function itemOf(r) {
    return { id: r.id, date: r.day, person: r.person, logged_by: r.logged_by, name: r.name,
      amount: Number(r.amount), cat: r.cat, kind: r.kind, deleted: !!r.deleted, updated_at: r.updated_at };
  }

  /* ---------- push / pull ---------- */
  function connected() { return !!(sb && session && profile); }
  function push(item) {
    if (!connected()) return;
    sb.from("entries").upsert(rowOf(item)).then(function (res) {
      if (res.error) enqueue(item.id); else { dequeue(item.id); touch(); }
    }, function () { enqueue(item.id); });
  }
  function enqueue(id) {
    if (queue.indexOf(id) === -1) { queue.push(id); writeQueue(); }
    status.state = "pending"; emit("sync", status);
  }
  function dequeue(id) { var at = queue.indexOf(id); if (at > -1) { queue.splice(at, 1); writeQueue(); } }
  function flush() {
    if (!connected() || !queue.length) return;
    queue.slice().forEach(function (id) { var it = byId(id); if (it) push(it); else dequeue(id); });
  }
  function touch() {
    status.state = queue.length ? "pending" : "synced";
    status.last = new Date(); emit("sync", status);
  }
  function merge(remote) {
    var index = {}; items.forEach(function (i, n) { index[i.id] = n; });
    var changed = false;
    remote.forEach(function (r) {
      var inc = itemOf(r), at = index[inc.id];
      if (at === undefined) { items.push(inc); changed = true; }
      else if ((inc.updated_at || "") > (items[at].updated_at || "")) { items[at] = inc; changed = true; }
    });
    if (changed) { writeItems(); emit("change"); }
  }
  function pull() {
    if (!connected()) return Promise.resolve();
    status.state = "syncing"; emit("sync", status);
    return sb.from("entries").select("*").then(function (res) {
      if (res.error) { status.state = "error"; emit("sync", status); return; }
      merge(res.data || []); pullPrefs(); flush(); touch();
    }, function () { status.state = "error"; emit("sync", status); });
  }
  function listen() {
    if (!connected() || channel) return;
    try {
      channel = sb.channel("entries-" + household())
        .on("postgres_changes",
          { event: "*", schema: "public", table: "entries",
            filter: "household_id=eq." + household() },
          function (p) { if (p.new) merge([p.new]); })
        .subscribe();
    } catch (e) {}
  }

  /* shared settings (caps, currency, carry) live in one household row */
  function pushPrefs() {
    if (!connected()) return;
    var shared = {};
    Object.keys(prefs).forEach(function (k) { if (k !== "theme") shared[k] = prefs[k]; });
    sb.from("household").upsert({ id: household(), data: shared, updated_at: stamp() })
      .then(function () {}, function () {});
  }
  function pullPrefs() {
    if (!connected()) return;
    sb.from("household").select("*").eq("id", household()).maybeSingle().then(function (res) {
      if (res && res.data && res.data.data) {
        var remote = res.data.data, changed = false;
        Object.keys(remote).forEach(function (k) {
          if (k === "theme") return;                    // theme stays per device
          if (JSON.stringify(prefs[k]) !== JSON.stringify(remote[k])) { prefs[k] = remote[k]; changed = true; }
        });
        if (changed) { writePrefs(); emit("change"); }
      }
    }, function () {});
  }

  /* ---------- auth ---------- */
  function configured() { return !!(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase); }
  function setAuth(next) { authState = next; emit("auth", authState); }

  function loadProfile() {
    return sb.from("profiles").select("*").eq("user_id", session.user.id).maybeSingle()
      .then(function (res) {
        if (res.error || !res.data) { setAuth("needs-profile"); return; }
        profile = res.data;
        readLocal();
        setAuth("ready");
        return pull().then(listen);
      }, function () { setAuth("needs-profile"); });
  }
  function signIn(email, password) {
    if (!sb) return Promise.reject(new Error("Sharing isn't set up"));
    return sb.auth.signInWithPassword({ email: email, password: password })
      .then(function (res) { if (res.error) throw res.error; return res; });
  }
  function signUp(email, password) {
    if (!sb) return Promise.reject(new Error("Sharing isn't set up"));
    return sb.auth.signUp({ email: email, password: password })
      .then(function (res) { if (res.error) throw res.error; return res; });
  }
  function signOut() {
    if (!sb) return Promise.resolve();
    if (channel) { try { sb.removeChannel(channel); } catch (e) {} channel = null; }
    return sb.auth.signOut().then(function () {
      session = null; profile = null; items = []; prefs = {}; queue = [];
      setAuth("signed-out");
    });
  }
  function claimProfile(personKey, householdId, displayName) {
    if (!sb || !session) return Promise.reject(new Error("Not signed in"));
    var row = { user_id: session.user.id, household_id: householdId,
                person_key: personKey, display_name: displayName || personKey };
    return sb.from("profiles").upsert(row).then(function (res) {
      if (res.error) throw res.error;
      profile = row; readLocal(); setAuth("ready");
      return pull().then(listen);
    });
  }
  function useLocalOnly() { session = null; profile = null; readLocal(); setAuth("local"); }

  /* ---------- start ---------- */
  function start() {
    if (!configured()) { useLocalOnly(); return; }
    try {
      sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: "under.auth" }
      });
    } catch (e) { useLocalOnly(); return; }

    sb.auth.getSession().then(function (res) {
      session = (res && res.data) ? res.data.session : null;
      if (session) loadProfile(); else setAuth("signed-out");
    }, function () { setAuth("signed-out"); });

    sb.auth.onAuthStateChange(function (event, s) {
      session = s;
      if (session) { if (!profile) loadProfile(); }
      else { profile = null; setAuth("signed-out"); }
    });

    window.addEventListener("online", function () { pull(); });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) pull(); });
  }

  return {
    start: start, on: on,
    live: live, all: function () { return items; }, byId: byId,
    add: add, update: update, remove: remove, restore: restore, replaceAll: replaceAll, wipe: wipe,
    getPref: getPref, setPref: setPref, prefs: function () { return prefs; },
    sync: function () { return status; }, pull: pull, configured: configured,
    signIn: signIn, signUp: signUp, signOut: signOut, claimProfile: claimProfile,
    useLocalOnly: useLocalOnly,
    authState: function () { return authState; },
    profile: function () { return profile; },
    email: function () { return session ? session.user.email : null; },
    household: household, me: mine
  };
})();
