/**
 * app.js — 起動・役割で画面を切り替える（router）・ナビ。記録者は選ばない（サーバーがログインの表示名を残す・尚哉 10/4）。
 * 画面は App.screens[id] = function(viewEl, params) に登録する（teacher.js・roster.js など）。
 * 画面で隠すことは権限の代わりにしない（役割の確認は毎回サーバー・4-13）。
 */
(function (root) {
  'use strict';
  var App = root.App, core = App.core, doc = root.document;
  App.screens = App.screens || {};

  var store = (function () { try { return root.localStorage; } catch (e) { return null; } })();
  App.session = App.api.createSession(store);
  // 記録者の選択をなくした（尚哉 10/4）。前の版が端末に残した記録者の名前は起動時に消す
  try { if (store) store.removeItem('ehon.recorder'); } catch (e) { /* 消せない端末はそのまま（もう読まない） */ }

  App.client = App.api.createApi({
    url: (root.APP_CONFIG || {}).apiUrl,
    fetch: function (u, i) { return root.fetch(u, i); },
    session: App.session
  });

  function current() { return (root.location.hash || '').replace(/^#\/?/, '').split('?')[0]; }

  /* ---------- 見た目（PR Hub 風・尚哉 10/4）: 線のアイコン（インラインSVG・外部を読まない＝CSP のまま） ---------- */
  var P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
    teacher: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/><path d="m9 15 2 2 4-4"/>',
    dayroster: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v2h6V3"/><path d="M9 10h6M9 14h6M9 18h3"/>',
    students: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.4 3.5 5.2"/>',
    roster: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 4v16"/>',
    schedule: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M7 14h2M11 14h2M15 14h2M7 17h2M11 17h2"/>',
    makeup: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
    tickets: '<path d="M3 8a2 2 0 0 0 0 4v0a2 2 0 0 1 0 4v2h18v-2a2 2 0 0 1 0-4 2 2 0 0 0 0-4V6H3z"/><path d="M14 6v12" stroke-dasharray="2 2"/>',
    review: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
    continuation: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
    contacts: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    notes: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h5"/>',
    history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    courses: '<path d="M3 6.5 12 3l9 3.5-9 3.5z"/><path d="M3 12l9 3.5 9-3.5M3 17.5 12 21l9-3.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    request: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    dot: '<circle cx="12" cy="12" r="3"/>'
  };
  function svg(name) {
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || P.dot) + '</svg>';
  }
  App.icon = svg;   // 別の画面（要望など）も同じ線のアイコンを使える
  function iconEl(name) { var s = App.ui.h('span', { class: 'ic' }); s.innerHTML = svg(name); return s; }

  /** 狭い画面（iPad 縦・スマホ）でサイドバーを開く／閉じる。広い画面では常に出ている（CSS） */
  function setSide(open) {
    var b = doc.body, back = doc.getElementById('side-back'), btn = doc.getElementById('menu');
    if (!b || !b.classList) return;
    b.classList.toggle('side-open', !!open);
    if (back) back.hidden = !open;
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  App.setSide = setSide;

  function renderNav(role, id) {
    var nav = doc.getElementById('nav');
    App.ui.clear(nav);
    var g = core.navGroups(role, id);
    var item = function (r) {
      return App.ui.h('a', { href: '#/' + r.id, class: 'nav-item' + (r.id === id ? ' on' : ''), 'aria-current': r.id === id ? 'page' : null },
        [iconEl(r.id), App.ui.h('span', { class: 'nav-label', text: r.label })]);
    };
    g.main.forEach(function (r) { nav.appendChild(item(r)); });
    if (g.more.length) {
      var more = App.ui.h('details', { class: 'nav-more' }, [App.ui.h('summary', { class: 'nav-item' }, [iconEl('more'), App.ui.h('span', { class: 'nav-label', text: 'その他 ▾' })]),
        App.ui.h('div', { class: 'nav-more-list' }, g.more.map(item))]);
      if (g.openMore) more.open = true;
      nav.appendChild(more);
    }
    // 上の帯: パンくず（今の画面名）とユーザーの丸いアイコン（名前の1文字目）
    var cur = core.routesFor(role).filter(function (r) { return r.id === id; })[0];
    var crumb = doc.getElementById('crumb');
    if (crumb) crumb.textContent = cur ? cur.label : '';
    var who = App.session.who(), av = doc.getElementById('avatar');
    if (av) { av.textContent = who && who.name ? String(who.name).charAt(0) : ''; av.hidden = !(who && who.name); }
    setSide(false);
  }

  /** keep: 今の画面を消さずに出し直す（タブに戻ったとき・stage で差し替える） */
  function route(keep) {
    var who = App.session.who();
    if (!who) return;
    var id = core.pickRoute(who.role, current());
    if (!id) { App.ui.clear(doc.getElementById('view')).appendChild(App.ui.h('p', { text: 'この役割で使える画面がありません' })); return; }
    if (current() !== id) { root.location.hash = '#/' + id; return; }   // hashchange でもう一度来る
    renderNav(who.role, id);
    // 月の出欠簿は列が多いので、その画面の間だけ印刷を A4 横にする（04a 小17）
    var land = doc.getElementById('page-landscape');
    if (land) land.media = id === 'roster' ? 'print' : 'not all';
    var view = doc.getElementById('view');
    if (keep !== true) App.ui.clear(view);
    var fn = App.screens[id];
    try {
      if (fn) fn(view, who); else view.appendChild(App.ui.h('p', { text: '準備中です' }));
    } catch (e) {
      view.appendChild(App.ui.h('p', { class: 'error-text', text: '画面を出せませんでした。再読み込みしてください（' + (e && e.message) + '）' }));
    }
  }

  /** 別の画面へ（生徒を選んだ状態で開く: 生徒の詳細→券の台帳・カルテ、ホーム→各画面） */
  App.focus = { studentId: '' };
  App.go = function (id, studentId) { App.focus.studentId = studentId || ''; if (current() === id) route(); else root.location.hash = '#/' + id; };
  App.takeFocus = function () { var x = App.focus.studentId; App.focus.studentId = ''; return x; };

  App.start = function () { route(); };
  root.addEventListener('hashchange', function () { route(); });
  /** タブに戻ったとき、講師画面・当日名簿は今日に戻して出し直す（04b U-01・画面は消さずに差し替え） */
  App.onVisible = function () {
    var id = current();
    if ((id === 'teacher' || id === 'dayroster') && App.session.who()) route(true);
  };
  if (doc.addEventListener) doc.addEventListener('visibilitychange', function () { if (doc.visibilityState === 'visible') App.onVisible(); });

  root.addEventListener('DOMContentLoaded', function () {
    // 上の帯のアイコンとメニューボタン（狭い画面でサイドバーを開く）
    var home = doc.querySelector && doc.querySelector('.ic-home'), mi = doc.querySelector && doc.querySelector('.ic-menu');
    if (home) home.innerHTML = svg('home');
    if (mi) mi.innerHTML = svg('menu');
    var menu = doc.getElementById('menu'), back = doc.getElementById('side-back');
    if (menu) menu.addEventListener('click', function () { setSide(!(doc.body && doc.body.classList && doc.body.classList.contains('side-open'))); });
    if (back) back.addEventListener('click', function () { setSide(false); });
    if (doc.addEventListener) doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && doc.body && doc.body.classList && doc.body.classList.contains('side-open')) setSide(false); });
    var out = doc.getElementById('logout');
    // ログアウトは確認してから（04b U-16・共用 iPad で押し間違えると出欠が止まる）
    if (out) out.addEventListener('click', function () {
      App.ui.confirmThen('ログアウトしますか', ['ログアウトすると、もう一度 Google でログインするまで使えません', '共用の iPad は、授業が終わってからログアウトしてください'],
        'ログアウトする', function (btn, m) { m.close(); App.auth.logout(); });
    });
    var cfg = root.APP_CONFIG || {};
    if (!cfg.apiUrl) App.ui.banner(core.MESSAGES.not_configured_url, [], 'error');
    App.auth.boot();
  });
})(window);
