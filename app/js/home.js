/**
 * home.js — 管理ホーム（S1-36a・design 8-1・R-30, R-54, R-60, R-63）。スタッフだけ。
 * 今日のクラス・要確認・連絡が要る人・カレンダー反映の失敗・継続確認（未結論）の件数と、各画面へのボタン。
 * 件数は開くたびにサーバーで数え直す（各画面で解決して戻ると減る）。
 */
(function (root) {
  'use strict';
  var App = root.App, core = App.core, O = App.ops, h = App.ui.h, ui = App.ui;

  function render(view0) {
    var view = ui.stage(view0);   // 出し直しの間も今の画面を出したまま（尚哉 10/4①）
    // 見出しはグレーの背景の上・「数え直す」は見出しの右の小さな副ボタン（PR Hub 風 2回目）
    ui.page(view, { title: 'ホーム　' + core.fmtDate(core.todayJst()),
      actions: [h('button', { class: 'btn small', type: 'button', text: '数え直す', on: { click: function () { render(view0); } } })] });
    var body = h('div', { class: 'loading', text: '読み込み中…' });
    view.appendChild(body);
    ui.read('home.counts', {}).then(function (d) {
      ui.clear(body); body.className = 'home-cards';
      if (!d) { body.textContent = '読み込めませんでした'; return; }
      O.homeCards(d.counts).forEach(function (c) {
        // タイル全体が押せるボタン（「開く」ボタンは無くした・PR Hub 風 2回目）。注意の数字は赤（止まっている・失敗）／黄（手を打つもの）
        var tone = c.alert ? (c.key === 'review' || c.key === 'calendar' ? ' alert' : ' warn') : '';
        body.appendChild(h('button', { class: 'card tile' + tone, type: 'button', on: { click: function () { App.go(c.route); } } }, [
          h('span', { class: 'count-label', text: c.label }),
          h('span', { class: 'count-line' }, [h('strong', { class: 'count', text: String(c.count) }), ' ' + c.unit]),
          c.note ? h('span', { class: 'sub tile-note', text: c.note }) : null,
          h('span', { class: 'tile-go', 'aria-hidden': 'true', text: '›' })]));
      });
    });
  }

  App.screens.home = function (view) { render(view); };
})(window);
