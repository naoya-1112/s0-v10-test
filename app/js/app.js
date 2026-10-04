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

  function renderNav(role, id) {
    var nav = doc.getElementById('nav');
    App.ui.clear(nav);
    var g = core.navGroups(role, id);
    var item = function (r) { return App.ui.h('a', { href: '#/' + r.id, class: 'nav-item' + (r.id === id ? ' on' : ''), text: r.label }); };
    g.main.forEach(function (r) { nav.appendChild(item(r)); });
    if (g.more.length) {
      var more = App.ui.h('details', { class: 'nav-more' }, [App.ui.h('summary', { class: 'nav-item', text: 'その他 ▾' }),
        App.ui.h('div', { class: 'nav-more-list' }, g.more.map(item))]);
      if (g.openMore) more.open = true;
      nav.appendChild(more);
    }
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
