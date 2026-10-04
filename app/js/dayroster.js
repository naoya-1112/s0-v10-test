/**
 * dayroster.js — 当日名簿（出欠簿・S1-38・design 8-1）: 日付を選ぶ→クラスごとの名簿を画面に一覧で出し、「印刷」でそのまま印刷する。
 * 印刷専用の別画面・新しいタブは作らない（尚哉 10/3）。@media print で操作部品（.np）を隠し、表だけを出す。
 */
(function (root) {
  'use strict';
  var App = root.App, core = App.core, V = App.views, h = App.ui.h;
  var state = { date: '' };

  function render(view0) {
    if (!state.date) state.date = core.todayJst();
    var view = App.ui.stage(view0);   // 出し直しの間も今の画面を出したまま（尚哉 10/4①）
    var hd = V.dayHeading(state.date, core.todayJst(), 'roster');
    App.ui.page(view, { title: hd.title === '今日の名簿' ? '当日名簿' : hd.title, np: true });
    if (hd.alert) view.appendChild(h('div', { class: 'date-alert np', role: 'alert', text: hd.alert }));
    var pick = h('input', { type: 'date', class: 'input', value: state.date, 'aria-label': '日付' });
    pick.addEventListener('change', function () { if (pick.value) { state.date = pick.value; render(view0); } });
    view.appendChild(App.ui.stepper(core.fmtDate(state.date),
      function () { state.date = core.addDays(state.date, -1); render(view0); },
      function () { state.date = core.todayJst(); render(view0); },
      function () { state.date = core.addDays(state.date, 1); render(view0); }));
    view.appendChild(h('div', { class: 'toolbar np' }, [pick, App.ui.printButton()]));
    var body = h('div', { class: 'loading card sec', text: '読み込み中…' });
    view.appendChild(body);
    App.ui.sections(view);
    App.ui.read('teacher.day', { date: state.date }).then(function (d) {
      App.ui.clear(body); body.className = 'print-area card sec';
      if (!d) { body.textContent = '読み込めませんでした'; return; }
      var rv = V.dayRosterView(d);
      body.appendChild(h('h2', { class: 'print-title', text: rv.title }));
      if (rv.empty) { body.appendChild(h('p', { class: 'empty', text: 'この日のクラスはありません' })); return; }
      rv.sessions.forEach(function (s) {
        body.appendChild(h('section', { class: 'roster-block' }, [
          h('h3', { text: s.title }),
          h('p', { class: 'sub', text: [s.course, s.teacher ? '講師: ' + s.teacher : '', s.summary].filter(Boolean).join('　') }),
          h('table', { class: 'grid' }, [
            h('thead', {}, h('tr', {}, ['No', 'なまえ', 'ふりがな', '予定', 'メモ', '出欠'].map(function (t) { return h('th', { text: t }); }))),
            h('tbody', {}, s.rows.map(function (r) {
              return h('tr', {}, [h('td', { text: r.no }), h('td', { class: 'name', text: r.name }), h('td', { text: r.kana }),
                h('td', { text: r.plan }), h('td', { class: 'memo', text: r.memo }), h('td', { class: 'mark', text: r.attendance })]);
            }))
          ]),
          s.plannedNote ? h('p', { class: 'sub planned-note', text: s.plannedNote }) : null   // 表の外に別に書く（尚哉 10/4）
        ]));
      });
    });
  }

  /** 開くたび（ナビ・タブに戻ったとき）今日に戻す（04b U-01） */
  App.screens.dayroster = function (view) { state.date = core.todayJst(); render(view); };
})(window);
