/**
 * request.js — 要望欄（尚哉 10/4・9/29 Zoom）: ログインしている人なら誰でも要望を書ける（スタッフ・講師・共用アカウント）。
 * 上に書く欄（要望の文＋どの画面か＋送る）、下に一覧（新しい順・状態のラベル）。状態を変えるボタンはスタッフだけ（確認はサーバー）。
 * 状態: 受付 → 対応中 → 済／見送り（見送りは理由が必須）。
 */
(function (root) {
  'use strict';
  var App = root.App, core = App.core, h = App.ui.h, ui = App.ui;
  // サーバー LogicRequest.js の REQUEST_SCREENS と同じ
  var SCREENS = ['ホーム', '今日のクラス', '当日名簿', '生徒', '名簿・出欠簿', 'クラスと日程', '振替・欠席', '振替券の台帳', '要確認',
    '継続確認', '連絡が要る人', 'カルテ', '変更履歴', 'コース', '設定', 'その他'];
  var LABELS = { received: '受付', working: '対応中', done: '済', declined: '見送り' };
  var BADGE = { received: 'badge', working: 'badge', done: 'badge', declined: 'badge st-absent' };

  function isStaff() { var w = App.session && App.session.who(); return !!(w && w.role === 'staff'); }

  function render(view) {
    var view0 = view;
    view = ui.stage(view0);
    ui.page(view, { title: '要望', desc: 'こうなったら使いやすい、ここが分かりにくい、などを自由に書いてください。誰でも書けます。' });
    var f = ui.form([
      { key: 'body', label: '要望', type: 'textarea', rows: 4 },
      { key: 'screen', label: 'どの画面の話ですか（任意）', type: 'select',
        options: [{ value: '', label: '選ばない' }].concat(SCREENS.map(function (s) { return { value: s, label: s }; })) }
    ]);
    var send = h('button', { class: 'btn primary', type: 'button', text: '要望を送る' });
    send.addEventListener('click', function () {
      var v = f.values();
      if (!String(v.body).trim()) { ui.toast('要望の内容を入れてください', 'error'); return; }
      ui.write('request.add', { body: String(v.body).trim(), screen: v.screen }, { button: send, onDone: function () { ui.toast('送りました'); render(view0); } });
    });
    view.appendChild(h('div', { class: 'np' }, [f.el, h('div', { class: 'toolbar' }, [send])]));
    view.appendChild(h('h2', { text: 'これまでの要望' }));
    var body = h('div', { class: 'loading', text: '読み込み中…' });
    view.appendChild(body);
    ui.sections(view);   // 書く欄・これまでの要望をそれぞれ白いカードに
    ui.read('request.list', {}).then(function (d) {
      ui.clear(body); body.className = '';
      if (!d) { body.textContent = '読み込めませんでした'; return; }
      if (!d.requests.length) { body.appendChild(h('p', { class: 'empty', text: 'まだ要望はありません' })); return; }
      d.requests.forEach(function (r) { body.appendChild(card(r, view0)); });
    });
  }

  function card(r, view0) {
    var head = [h('strong', { text: core.fmtDateTime ? core.fmtDateTime(r.created_at) : r.created_at }),
      h('span', { class: BADGE[r.status] || 'badge', text: LABELS[r.status] || r.status })];
    if (r.screen) head.push(h('span', { class: 'badge', text: r.screen }));
    head.push(h('span', { class: 'sub', text: '書いた人: ' + (r.recorder || '') }));
    var parts = [h('div', { class: 'note-head' }, head), h('p', { text: r.body })];
    if (r.status === 'declined' && r.status_reason) parts.push(h('p', { class: 'sub', text: '見送りの理由: ' + r.status_reason }));
    if (isStaff()) {
      var acts = [];
      [['working', '対応中にする'], ['done', '済にする'], ['received', '受付に戻す']].forEach(function (p) {
        if (r.status === p[0]) return;
        var b = h('button', { class: 'btn small', type: 'button', text: p[1] });
        b.addEventListener('click', function () {
          ui.write('request.status', { requestId: r.id, status: p[0] }, { button: b, onDone: function () { render(view0); } });
        });
        acts.push(b);
      });
      var no = h('button', { class: 'btn small', type: 'button', text: '見送りにする' });
      no.addEventListener('click', function () { decline(r, view0); });
      acts.push(no);
      parts.push(h('div', { class: 'row-actions np' }, acts));
    }
    return h('div', { class: 'note' }, parts);
  }

  function decline(r, view0) {
    var f = ui.form([{ key: 'reason', label: '見送りの理由', type: 'textarea', rows: 3 }]);
    var m = ui.openModal({ title: '見送りにする', okLabel: '見送りにする', body: f.el,
      onOk: function (_, okBtn) {
        var reason = String(f.values().reason).trim();
        if (!reason) { ui.toast('見送りの理由を入れてください', 'error'); return; }
        ui.write('request.status', { requestId: r.id, status: 'declined', reason: reason }, { button: okBtn, onDone: function () { m.close(); render(view0); } });
      } });
  }

  App.screens.requests = function (view) { render(view); };
  App.requestLabels = LABELS;
})(window);
