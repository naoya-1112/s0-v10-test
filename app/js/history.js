/**
 * history.js — 変更履歴（S1-38・design 6-7・R-30）: 見るだけ。日付・生徒・表で絞る。戻すボタンは作らない（D-36・T-11）。スタッフだけ。
 */
(function (root) {
  'use strict';
  var App = root.App, V = App.views, h = App.ui.h;
  var TABLES = ['生徒', '在籍', '退会', '日程', '欠席連絡', '振替', '振替券', '出席実績', 'カルテ', '要確認', '連絡が要る人', 'クラス', 'コース', 'アカウント', '設定'];
  var state = { date: '', studentId: '', table: '' };

  function render(view) {
    App.ui.clear(view);
    view.appendChild(h('h1', { text: '変更履歴（見るだけ）' }));
    var date = h('input', { type: 'date', class: 'input', value: state.date, 'aria-label': '日付' });
    var stu = h('select', { class: 'input', 'aria-label': '生徒' }, [h('option', { value: '', text: 'すべての生徒' })]);
    var tbl = h('select', { class: 'input', 'aria-label': '表' }, [h('option', { value: '', text: 'すべての表' })]
      .concat(TABLES.map(function (t) { return h('option', { value: t, text: t }); })));
    tbl.value = state.table;
    var go = h('button', { class: 'btn primary', type: 'button', text: '表示する' });
    var list = h('div', {});
    view.appendChild(h('div', { class: 'toolbar np' }, [
      h('label', { class: 'field inline' }, [h('span', { text: '日付' }), date]),
      h('label', { class: 'field inline' }, [h('span', { text: '生徒' }), stu]),
      h('label', { class: 'field inline' }, [h('span', { text: '表' }), tbl]), go]));
    view.appendChild(list);
    go.addEventListener('click', function () { state.date = date.value; state.studentId = stu.value; state.table = tbl.value; load(list); });
    App.ui.read('student.list', { includeHidden: true }).then(function (d) {
      if (!d) return;
      d.students.forEach(function (s) { stu.appendChild(h('option', { value: s.id, text: s.name })); });
      stu.value = state.studentId;
    });
    load(list);
  }

  function load(list) {
    App.ui.clear(list).appendChild(h('p', { class: 'loading', text: '読み込み中…' }));
    App.ui.read('history.list', { date: state.date, studentId: state.studentId, table: state.table }).then(function (d) {
      App.ui.clear(list);
      if (!d) { list.textContent = '読み込めませんでした'; return; }
      var rows = V.historyView(d.history);
      list.appendChild(h('p', { class: 'sub', text: '全 ' + d.total + ' 件' + (d.total > rows.length ? '（新しい ' + rows.length + ' 件を表示）' : '') }));
      if (!rows.length) { list.appendChild(h('p', { class: 'empty', text: '当てはまる履歴はありません' })); return; }
      list.appendChild(h('div', { class: 'scroll-x' }, h('table', { class: 'grid' }, [
        h('thead', {}, h('tr', {}, ['日時', '誰が', '表', '操作', '変わった所', '受付番号'].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, rows.map(function (r) {
          return h('tr', {}, [h('td', { text: r.at }), h('td', { text: r.who }), h('td', { text: r.table }), h('td', { text: r.op }),
            h('td', { class: 'memo' }, r.changes.map(function (c) { return h('div', { text: c.key + ': ' + (c.before || '（空）') + ' → ' + (c.after || '（空）') }); })),
            h('td', { class: 'mono', text: r.receipt })]);
        }))
      ])));
    });
  }

  App.screens.history = function (view) { render(view); };
})(window);
