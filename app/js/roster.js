/**
 * roster.js — 名簿・出欠簿（S1-33・design 8-1・R-02・R-03）: 月を選ぶ→クラス別の名簿（予定は印）と出欠簿（回×生徒）。
 * 出欠簿は欠席連絡と出席実績を並べ、「出席（連絡あり）」で連絡ありで出席が分かる。画面の一覧をそのまま印刷（当日名簿と同じ部品）。
 */
(function (root) {
  'use strict';
  var App = root.App, core = App.core, V = App.views, h = App.ui.h;
  var state = { month: '' };

  function render(view) {
    if (!state.month) state.month = core.todayJst().slice(0, 7);
    App.ui.clear(view);
    view.appendChild(h('h1', { class: 'np', text: '名簿・出欠簿' }));
    view.appendChild(App.ui.stepper(core.fmtMonth(state.month),
      function () { state.month = core.addMonths(state.month, -1); render(view); },
      function () { state.month = core.todayJst().slice(0, 7); render(view); },
      function () { state.month = core.addMonths(state.month, 1); render(view); }, '今月'));
    view.appendChild(h('div', { class: 'toolbar np' }, [App.ui.printButton(),
      h('span', { class: 'hint', text: '「出席（連絡あり）」は欠席連絡があったのに来た人です' })]));
    var body = h('div', { class: 'loading', text: '読み込み中…' });
    view.appendChild(body);
    App.ui.read('roster.month', { month: state.month }).then(function (d) {
      App.ui.clear(body); body.className = 'print-area';
      if (!d) { body.textContent = '読み込めませんでした'; return; }
      var rv = V.rosterMonthView(d);
      body.appendChild(h('h2', { class: 'print-title', text: rv.title }));
      if (rv.empty) { body.appendChild(h('p', { class: 'empty', text: 'この月の在籍はありません' })); return; }
      rv.classes.forEach(function (c) {
        body.appendChild(h('section', { class: 'roster-block' }, [
          h('h3', { text: c.title }),
          h('p', { class: 'sub', text: '在籍 ' + c.count + '人' + (c.planned ? '・予定 ' + c.planned + '人' : '') + (c.teacher ? '　講師: ' + c.teacher : '') }),
          h('div', { class: 'scroll-x' }, h('table', { class: 'grid book' }, [
            h('thead', {}, h('tr', {}, [h('th', { text: 'No' }), h('th', { text: 'なまえ' })].concat(c.heads.map(function (t) { return h('th', { text: t }); })))),
            h('tbody', {}, c.rows.map(function (r) {
              return h('tr', { class: r.planned ? 'planned' : '' }, [h('td', { text: r.no }),
                h('td', { class: 'name' }, [r.name, h('div', { class: 'kana', text: r.kana })])]
                .concat(r.cells.map(function (x) { return h('td', { class: 'mark ' + x.cls, text: x.text }); })));
            }))
          ]))
        ]));
      });
    });
  }

  App.screens.roster = function (view) { render(view); };
})(window);
