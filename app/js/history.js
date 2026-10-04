/**
 * history.js — 変更履歴（S1-38・design 6-7・R-30）: 見るだけ。日付・生徒・表で絞る。戻すボタンは作らない（D-36・T-11）。スタッフだけ。
 */
(function (root) {
  'use strict';
  var App = root.App, V = App.views, core = App.core, h = App.ui.h;
  var TABLES = ['生徒', '在籍', '退会', '日程', '欠席連絡', '振替', '振替券', '出席実績', 'カルテ', '要確認', '連絡が要る人', 'クラス', 'コース', 'アカウント', '設定'];
  var state = { date: '', studentId: '', table: '' };
  App.ui.onForget(function () { state.date = ''; state.studentId = ''; state.table = ''; });   // ログアウト・人の切り替え（04a 小12）

  function render(view0) {
    var view = App.ui.stage(view0);   // 読み込みの間も今の画面を出したまま（尚哉 10/4①）
    App.ui.page(view, { title: '変更履歴（見るだけ）' });
    var date = h('input', { type: 'date', class: 'input', value: state.date, 'aria-label': '日付' });
    var stu = h('select', { class: 'input', 'aria-label': '生徒' }, [h('option', { value: '', text: 'すべての生徒' })]);
    var tbl = h('select', { class: 'input', 'aria-label': '表' }, [h('option', { value: '', text: 'すべての表' })]
      .concat(TABLES.map(function (t) { return h('option', { value: t, text: t }); })));
    tbl.value = state.table;
    var go = h('button', { class: 'btn primary', type: 'button', text: '表示する' });
    var list = h('div', { class: 'card sec' });
    view.appendChild(h('div', { class: 'toolbar np' }, [
      h('label', { class: 'field inline' }, [h('span', { text: '日付' }), date]),
      h('label', { class: 'field inline' }, [h('span', { text: '生徒' }), stu]),
      h('label', { class: 'field inline' }, [h('span', { text: '表' }), tbl]), go]));
    view.appendChild(list);
    App.ui.sections(view);
    go.addEventListener('click', function () { state.date = date.value; state.studentId = stu.value; state.table = tbl.value; load(list, stu, false); });
    load(list, stu, true);
  }

  /** 履歴・生徒・クラス・回を同時に読む（記号を名前にするため）。first: 最初の表示（生徒の選択欄も作る） */
  function load(list, stu, first) {
    if (!first) App.ui.clear(list).appendChild(h('p', { class: 'loading', text: '読み込み中…' }));
    Promise.all([App.ui.read('history.list', { date: state.date, studentId: state.studentId, table: state.table }),
      App.ui.read('student.list', { includeHidden: true }), App.ui.read('class.list', {}), App.ui.read('session.list', {})]).then(function (r) {
      var d = r[0];
      if (first && r[1]) {
        r[1].students.forEach(function (s) { stu.appendChild(h('option', { value: s.id, text: s.name })); });
        stu.value = state.studentId;
      }
      App.ui.clear(list);
      if (!d) { list.textContent = '読み込めませんでした'; return; }
      var maps = core.nameMaps(r[1] && r[1].students, r[2] && r[2].classes, r[3] && r[3].sessions);
      var rows = V.historyView(d.history);
      list.appendChild(h('p', { class: 'sub', text: '全 ' + d.total + ' 件' + (d.total > rows.length ? '（新しい ' + rows.length + ' 件を表示）' : '') }));
      if (!rows.length) { list.appendChild(h('p', { class: 'empty', text: '当てはまる履歴はありません' })); return; }
      list.appendChild(h('div', { class: 'scroll-x' }, h('table', { class: 'grid' }, [
        h('thead', {}, h('tr', {}, ['日時', '誰が', '表', '操作', '変わった所'].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', {}, rows.map(function (r) {
          return h('tr', {}, [h('td', { text: r.at }), h('td', { text: r.who }), h('td', { text: r.table }), h('td', { text: r.op }),
            h('td', { class: 'memo' }, r.changes.map(function (c) { return h('div', { text: V.changeText(c, maps) }); }))]);
        }))
      ])));
    });
  }

  App.screens.history = function (view) { render(view); };
})(window);
