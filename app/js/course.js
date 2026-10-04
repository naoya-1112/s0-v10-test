/**
 * course.js — コース画面（S1-28・design 8-1・R-14〜R-17）: 追加・名前変更（似た名前の注意）・振替の種類（新しいクラスの初期値）・
 * 標準期間・おすすめの次・非表示。スタッフだけ。
 */
(function (root) {
  'use strict';
  var App = root.App, A = App.admin, h = App.ui.h, ui = App.ui;
  var MONTHS = { '': '期間なし', '6': '6か月', '12': '1年' };

  function render(view0) {
    var view = ui.stage(view0);   // 出し直しの間も今の画面を出したまま（尚哉 10/4①）
    var again = function () { render(view0); };
    var list = h('div', { class: 'loading', text: '読み込み中…' });
    ui.page(view, { title: 'コース', desc: '振替の種類は、これから作るクラスの初期値です。今あるクラスの振替の種類は変わりません',
      actions: [h('button', { class: 'btn primary', type: 'button', text: '＋ コースを足す', on: { click: function () { edit(null, [], again); } } })] });
    ui.card(view, [list]);
    ui.read('course.list', {}).then(function (d) {
      ui.clear(list); list.className = '';
      if (!d) { list.textContent = '読み込めませんでした'; return; }
      var all = d.courses.slice().sort(function (a, b) { return (+a.sort || 0) - (+b.sort || 0); });
      var names = A.byId(all);
      if (!all.length) list.appendChild(h('p', { class: 'empty', text: 'まだコースはありません' }));
      all.forEach(function (c) {
        var hidden = c.hidden === '1';
        var next = String(c.next_course_ids || '').split(',').filter(Boolean).map(function (id) { return names[id] ? names[id].name : id; });
        list.appendChild(h('div', { class: 'list-row' + (hidden ? ' off' : '') }, [
          h('div', { class: 'main' }, [h('strong', { text: c.name }), hidden ? h('span', { class: 'tag', text: '非表示' }) : null,
            h('div', { class: 'sub', text: (A.MAKEUP_TYPE[c.makeup_type] || c.makeup_type) + '・' + (MONTHS[c.standard_months || ''] || c.standard_months) +
              (next.length ? '・おすすめの次: ' + next.join('、') : '') })]),
          h('div', { class: 'row-actions' }, [
            h('button', { class: 'btn small', type: 'button', text: '直す', on: { click: function () { edit(c, all, again); } } }),
            h('button', { class: 'btn small', type: 'button', text: hidden ? '表示に戻す' : '非表示にする', on: { click: function () {
              // 生徒の非表示と同じ短い確認（U-28）
              App.ui.confirmThen(hidden ? 'コースを表示に戻しますか' : 'コースを非表示にしますか',
                [c.name + (hidden ? ' を一覧と選択肢に戻します' : ' を一覧と選択肢から隠します。記録は消えません（あとで戻せます）')], hidden ? '戻す' : '隠す',
                function (okBtn, m) { App.ui.write('course.hide', { id: c.id, hidden: !hidden }, { button: okBtn, onDone: App.ui.closing(m, again) }); });
            } } })])]));
      });
      list.dataset.all = '';
      list._all = all;
    });
    function edit(c, all, again2) { editCourse(c, list._all || all, again2); }
  }

  function editCourse(cur, all, again) {
    ui.formModal({ title: cur ? 'コースを直す' : 'コースを足す', okLabel: '保存する',
      fields: [{ key: 'name', label: 'コースの名前', value: cur ? cur.name : '' },
        { key: 'makeup_type', label: '振替の種類（新しいクラスの初期値）', type: 'radio', value: cur ? cur.makeup_type : 'makeupday',
          options: Object.keys(A.MAKEUP_TYPE).map(function (k) { return { value: k, label: A.MAKEUP_TYPE[k] }; }) },
        { key: 'standard_months', label: '標準の期間', type: 'radio', value: cur ? (cur.standard_months || '') : '',
          options: Object.keys(MONTHS).map(function (k) { return { value: k, label: MONTHS[k] }; }) },
        { key: 'next_course_ids', label: 'おすすめの次のコース', type: 'checks', value: cur ? String(cur.next_course_ids || '').split(',').filter(Boolean) : [],
          options: (all || []).filter(function (c) { return !cur || c.id !== cur.id; }).map(function (c) { return { value: c.id, label: c.name }; }) },
        { key: 'sort', label: '並び順（小さい数が上）', type: 'number', value: cur ? cur.sort : '' }],
      check: function (v) { return A.courseArgs(Object.assign({ id: cur && cur.id }, v)); },
      onOk: function (args, b, m) { ui.write('course.save', args, { button: b, onDone: ui.closing(m, again) }); } });
  }

  App.screens.courses = function (view) { render(view); };
})(window);
