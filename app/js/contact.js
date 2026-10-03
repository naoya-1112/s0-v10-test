/**
 * contact.js — 連絡が要る人（S1-30・design 8-1・R-54）: 誰に・何を・連絡済みの印。日程の変更・中止・退会などで作られた行を、
 * 連絡したら「連絡済み」にする（間違えたら戻せる）。印刷できる。スタッフだけ。
 */
(function (root) {
  'use strict';
  var App = root.App, A = App.admin, h = App.ui.h, ui = App.ui;
  var state = { all: false };

  function render(view) {
    ui.clear(view);
    view.appendChild(h('h1', { text: '連絡が要る人' }));
    var all = h('input', { type: 'checkbox', class: 'check' });
    all.checked = state.all;
    all.addEventListener('change', function () { state.all = all.checked; render(view); });
    view.appendChild(h('div', { class: 'toolbar np' }, [h('label', { class: 'choice' }, [all, ' 連絡済みも見る']), ui.printButton()]));
    var body = h('div', { class: 'loading', text: '読み込み中…' });
    view.appendChild(body);
    Promise.all([ui.read('contact.list', { all: state.all }), ui.read('session.list', {})]).then(function (r) {
      ui.clear(body); body.className = 'print-area';
      if (!r[0]) { body.textContent = '読み込めませんでした'; return; }
      var rows = A.contactRows(r[0].contacts, (r[1] && r[1].sessions) || []);
      body.appendChild(h('p', { class: 'sub', text: (state.all ? '全部で ' : 'まだ連絡していない人 ') + rows.length + ' 件' }));
      if (!rows.length) { body.appendChild(h('p', { class: 'empty', text: '連絡が要る人はいません' })); return; }
      body.appendChild(h('div', { class: 'scroll-x' }, h('table', { class: 'grid' }, [
        h('thead', {}, h('tr', {}, ['誰に', '何を', '内容', '回', '状態', ''].map(function (t) { return h('th', { class: t ? '' : 'np', text: t }); }))),
        h('tbody', {}, rows.map(function (c) {
          var b = h('button', { class: 'btn small' + (c.done ? '' : ' primary'), type: 'button', text: c.done ? '未連絡に戻す' : '連絡した' });
          b.addEventListener('click', function () {
            ui.write('contact.mark', { contactId: c.id, contacted: !c.done }, { button: b, onDone: function () { render(view); } });
          });
          return h('tr', { class: c.done ? 'planned' : '' }, [h('td', { class: 'name', text: c.name }), h('td', { text: c.what }), h('td', { class: 'memo', text: c.message }),
            h('td', { text: c.session }), h('td', { text: c.doneText || '未連絡' }), h('td', { class: 'np' }, b)]);
        }))])));
    });
  }

  App.screens.contacts = function (view) { render(view); };
})(window);
