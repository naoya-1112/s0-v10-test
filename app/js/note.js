/**
 * note.js — 管理画面のカルテ（S1-37 の後半・8-1・R-32）: 生徒を選ぶ→カルテの一覧（非表示も含む）→書く・非表示・表示に戻す。スタッフだけ。
 */
(function (root) {
  'use strict';
  var App = root.App, core = App.core, h = App.ui.h;
  var state = { studentId: '' };

  function render(view) {
    var f = App.takeFocus ? App.takeFocus() : '';
    if (f) state.studentId = f;
    App.ui.clear(view);
    view.appendChild(h('h1', { text: 'カルテ' }));
    var sel = h('select', { class: 'input', 'aria-label': '生徒' }, [h('option', { value: '', text: '生徒を選んでください' })]);
    var list = h('div', {});
    view.appendChild(h('div', { class: 'toolbar np' }, [h('label', { class: 'field inline' }, [h('span', { text: '生徒' }), sel])]));
    view.appendChild(list);
    sel.addEventListener('change', function () { state.studentId = sel.value; load(view, list); });
    App.ui.read('student.list', {}).then(function (d) {
      if (!d) return;
      d.students.slice().sort(function (a, b) { return (a.kana || '') < (b.kana || '') ? -1 : 1; }).forEach(function (s) {
        sel.appendChild(h('option', { value: s.id, text: s.name + (s.kana ? '（' + s.kana + '）' : '') }));
      });
      if (state.studentId) { sel.value = state.studentId; load(view, list); }
    });
  }

  function load(view, list) {
    App.ui.clear(list);
    if (!state.studentId) return;
    var add = h('button', { class: 'btn primary', type: 'button', text: 'カルテを書く', on: { click: function () { write(view); } } });
    list.appendChild(h('div', { class: 'toolbar np' }, [add]));
    var box = h('div', { class: 'loading', text: '読み込み中…' });
    list.appendChild(box);
    App.ui.read('note.list', { studentId: state.studentId }).then(function (d) {
      App.ui.clear(box); box.className = '';
      if (!d) { box.textContent = '読み込めませんでした'; return; }
      if (!d.notes.length) { box.appendChild(h('p', { class: 'empty', text: 'まだカルテはありません' })); return; }
      d.notes.forEach(function (n) {
        var hidden = n.hidden === '1';
        var b = h('button', { class: 'btn small', type: 'button', text: hidden ? '表示に戻す' : '非表示にする' });
        b.addEventListener('click', function () {
          App.ui.write('note.hide', { noteId: n.id, hidden: !hidden }, { button: b, onDone: function () { load(view, list); } });
        });
        box.appendChild(h('div', { class: 'note' + (hidden ? ' hidden-note' : '') }, [
          h('div', { class: 'note-head' }, [h('strong', { text: core.fmtDate(n.date) }), n.tag ? h('span', { class: 'badge', text: n.tag }) : null,
            h('span', { class: 'sub', text: '記録: ' + (n.recorder || '') }), hidden ? h('span', { class: 'badge st-absent', text: '非表示（講師画面に出ません）' }) : null]),
          h('p', { text: n.body }), h('div', { class: 'row-actions np' }, [b])
        ]));
      });
    });
  }

  function write(view) {
    var text = h('textarea', { class: 'reason', rows: 4 });
    var tag = h('input', { type: 'text', class: 'input', placeholder: 'タグ（任意）' });
    var m = App.ui.openModal({ title: 'カルテを書く', okLabel: '保存する',
      body: h('div', {}, [h('label', { class: 'field' }, [h('span', { text: 'カルテ' }), text]), h('label', { class: 'field' }, [h('span', { text: 'タグ' }), tag])]),
      onOk: function (_, okBtn) {
        if (!text.value.trim()) { App.ui.toast('カルテの本文を入れてください', 'error'); return; }
        App.ui.write('note.add', { studentId: state.studentId, body: text.value.trim(), tag: tag.value.trim() },
          { button: okBtn, onDone: function () { m.close(); render(view); } });
      } });
  }

  App.screens.notes = function (view) { render(view); };
})(window);
