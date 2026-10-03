/**
 * app.js — 起動・役割で画面を切り替える（router）・ナビ・記録者の選択（5-4・8-2）。
 * 画面は App.screens[id] = function(viewEl, params) に登録する（teacher.js・roster.js など）。
 * 画面で隠すことは権限の代わりにしない（役割の確認は毎回サーバー・4-13）。
 */
(function (root) {
  'use strict';
  var App = root.App, core = App.core, doc = root.document;
  App.screens = App.screens || {};

  var store = (function () { try { return root.localStorage; } catch (e) { return null; } })();
  App.session = App.api.createSession(store);
  var REC_KEY = 'ehon.recorder';
  var recorder = (function () { try { return (store && store.getItem(REC_KEY)) || ''; } catch (e) { return ''; } })();

  App.recorder = function () { var w = App.session.who(); return w && w.shared ? recorder : ''; };
  App.needRecorder = function () {
    var w = App.session.who();
    if (w && w.shared && !recorder) { App.ui.toast('先に上の「記録者」で自分の名前を選んでください', 'error'); return true; }
    return false;
  };

  App.client = App.api.createApi({
    url: (root.APP_CONFIG || {}).apiUrl,
    fetch: function (u, i) { return root.fetch(u, i); },
    session: App.session,
    recorder: function () { return App.recorder(); }
  });

  /** 共用アカウントのときだけ記録者を選ぶ（最後に選んだ名前が既定・8-2） */
  App.recorderBox = function () {
    var box = doc.getElementById('recorder');
    if (!box) return;
    App.ui.clear(box);
    var w = App.session.who();
    box.hidden = !(w && w.shared);
    if (box.hidden) return;
    var sel = App.ui.h('select', { 'aria-label': '記録者', on: { change: function () {
      recorder = sel.value;
      try { if (store) store.setItem(REC_KEY, recorder); } catch (e) { /* 保存できない端末はタブの中だけ */ }
    } } }, [App.ui.h('option', { value: '', text: '記録者を選ぶ' })]);
    box.appendChild(App.ui.h('label', {}, ['記録者: ', sel]));
    App.ui.read('recorder.list', {}).then(function (d) {
      if (!d) return;
      d.names.forEach(function (n) { sel.appendChild(App.ui.h('option', { value: n, text: n })); });
      if (d.names.indexOf(recorder) >= 0) sel.value = recorder; else recorder = '';
    });
  };

  function current() { return (root.location.hash || '').replace(/^#\/?/, '').split('?')[0]; }

  function renderNav(role, id) {
    var nav = doc.getElementById('nav');
    App.ui.clear(nav);
    core.routesFor(role).forEach(function (r) {
      nav.appendChild(App.ui.h('a', { href: '#/' + r.id, class: 'nav-item' + (r.id === id ? ' on' : ''), text: r.label }));
    });
  }

  function route() {
    var who = App.session.who();
    if (!who) return;
    var id = core.pickRoute(who.role, current());
    if (!id) { App.ui.clear(doc.getElementById('view')).appendChild(App.ui.h('p', { text: 'この役割で使える画面がありません' })); return; }
    if (current() !== id) { root.location.hash = '#/' + id; return; }   // hashchange でもう一度来る
    renderNav(who.role, id);
    var view = App.ui.clear(doc.getElementById('view'));
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
  root.addEventListener('hashchange', route);

  root.addEventListener('DOMContentLoaded', function () {
    var out = doc.getElementById('logout');
    if (out) out.addEventListener('click', function () { App.auth.logout(); });
    var cfg = root.APP_CONFIG || {};
    if (!cfg.apiUrl) App.ui.banner(core.MESSAGES.not_configured_url, [], 'error');
    App.auth.boot();
  });
})(window);
