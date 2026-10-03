/**
 * home.js — 管理ホーム（S1-36a・design 8-1・R-30, R-54, R-60, R-63）。スタッフだけ。
 * 今日のクラス・要確認・連絡が要る人・カレンダー反映の失敗・継続確認（未結論）の件数と、各画面へのボタン。
 * 件数は開くたびにサーバーで数え直す（各画面で解決して戻ると減る）。
 */
(function (root) {
  'use strict';
  var App = root.App, core = App.core, O = App.ops, h = App.ui.h, ui = App.ui;

  function render(view) {
    ui.clear(view);
    view.appendChild(h('h1', { text: 'ホーム　' + core.fmtDate(core.todayJst()) }));
    var body = h('div', { class: 'loading', text: '読み込み中…' });
    view.appendChild(body);
    view.appendChild(h('div', { class: 'toolbar np' }, [h('button', { class: 'btn', type: 'button', text: '数え直す', on: { click: function () { render(view); } } })]));
    ui.read('home.counts', {}).then(function (d) {
      ui.clear(body); body.className = 'home-cards';
      if (!d) { body.textContent = '読み込めませんでした'; return; }
      O.homeCards(d.counts).forEach(function (c) {
        body.appendChild(h('div', { class: 'card' + (c.alert ? ' alert' : '') }, [
          h('h2', {}, [c.label + '　', h('strong', { class: 'count', text: String(c.count) }), ' ' + c.unit]),
          c.note ? h('p', { class: 'sub', text: c.note }) : null,
          h('button', { class: 'btn' + (c.alert ? ' primary' : ''), type: 'button', text: '開く', on: { click: function () { App.go(c.route); } } })]));
      });
    });
  }

  App.screens.home = function (view) { render(view); };
})(window);
