/**
 * teacher.js — 講師画面（S1-37・design 8-2）: 今日のクラス・日付を前後に動かす・出欠の大きなボタン・押し直し・未記録に戻す・
 * 注意（欠席連絡あり・満席は止めずに知らせる）・直近カルテ3件・カルテを書く。スタッフも同じ画面を使える。
 * 出すのは teacher.day が返す項目だけ（連絡先・券の台帳・変更履歴は API が返さない・5-2・T-37）。
 */
(function (root) {
  'use strict';
  var App = root.App, core = App.core, V = App.views, h = App.ui.h;
  var state = { date: '' };

  function render(view) {
    if (!state.date) state.date = core.todayJst();
    App.ui.clear(view);
    var today = core.todayJst();
    view.appendChild(h('h1', { text: '今日のクラス' }));
    view.appendChild(App.ui.stepper(core.fmtDate(state.date) + (state.date === today ? '（今日）' : ''),
      function () { state.date = core.addDays(state.date, -1); render(view); },
      function () { state.date = today; render(view); },
      function () { state.date = core.addDays(state.date, 1); render(view); }));
    if (state.date > today) view.appendChild(h('p', { class: 'hint', text: '先の日付の出欠は付けられません（見るだけ）' }));
    var body = h('div', { class: 'loading', text: '読み込み中…' });
    view.appendChild(body);
    App.ui.read('teacher.day', { date: state.date }).then(function (d) {
      if (!d) { body.textContent = '読み込めませんでした'; return; }
      fill(view, body, V.teacherDayView(d), state.date > today);
    });
  }

  function fill(view, body, tv, future) {
    App.ui.clear(body);
    body.className = '';
    if (tv.empty) { body.appendChild(h('p', { class: 'empty', text: 'この日のクラスはありません' })); return; }
    tv.sessions.forEach(function (s) {
      var card = h('section', { class: 'card' }, [
        h('h2', { text: s.title }),
        h('p', { class: 'sub', text: [s.course, s.teacher ? '講師: ' + s.teacher : ''].filter(Boolean).join('・') }),
        h('p', { class: 'summary', text: s.summary })
      ]);
      s.rows.forEach(function (r) { card.appendChild(row(view, s, r, future)); });
      body.appendChild(card);
    });
  }

  function row(view, s, r, future) {
    var btns = h('div', { class: 'att-buttons' });
    if (!future) {
      r.buttons.forEach(function (b) {
        var el = h('button', { class: 'btn att' + (b.on ? ' on' : '') + (b.result === 'absent' ? ' absent' : ''), type: 'button', text: b.label,
          'aria-pressed': b.on ? 'true' : 'false' });
        el.addEventListener('click', function () { mark(view, s, r, b.result, el); });
        btns.appendChild(el);
      });
      if (r.canClear) {
        var c = h('button', { class: 'btn small', type: 'button', text: '未記録に戻す' });
        c.addEventListener('click', function () {
          if (App.needRecorder()) return;
          App.ui.write('attendance.clear', { studentId: r.student_id, sessionId: s.session_id }, { button: c, onDone: function () { render(view); } });
        });
        btns.appendChild(c);
      }
    }
    var note = h('button', { class: 'btn small', type: 'button', text: 'カルテを書く', on: { click: function () { writeNote(view, r); } } });
    return h('div', { class: 'person ' + r.statusCls }, [
      h('div', { class: 'person-head' }, [
        h('div', { class: 'person-name' }, [h('strong', { text: r.name }), h('span', { class: 'kana', text: r.kana })]),
        h('span', { class: 'badge ' + r.statusCls, text: r.statusLabel }),
        h('span', { class: 'att-now', text: '記録: ' + r.attendanceLabel })
      ]),
      r.notes.length ? h('ul', { class: 'warn-list' }, r.notes.map(function (n) { return h('li', { text: n }); })) : null,
      btns,
      r.karte.length ? h('details', { class: 'karte' }, [h('summary', { text: '最近のカルテ（' + r.karte.length + '件）' }),
        h('ul', {}, r.karte.map(function (k) { return h('li', { text: k }); }))]) : null,
      h('div', { class: 'row-actions' }, [note])
    ]);
  }

  function mark(view, s, r, result, btn) {
    if (App.needRecorder()) return;
    App.ui.write('attendance.mark', { studentId: r.student_id, sessionId: s.session_id, result: result }, { button: btn, onDone: function () { render(view); } });
  }

  /** カルテを書く（R-38）: 一言（iPad の音声入力をそのまま使える）・タグは任意 */
  function writeNote(view, r) {
    if (App.needRecorder()) return;
    var text = h('textarea', { class: 'reason', rows: 4, placeholder: '一言（キーボードのマイクで話しても入ります）' });
    var tag = h('input', { type: 'text', class: 'input', placeholder: 'タグ（任意）例: 制作' });
    var m = App.ui.openModal({ title: r.name + ' さんのカルテ', okLabel: '保存する',
      body: h('div', {}, [h('label', { class: 'field' }, [h('span', { text: 'カルテ' }), text]), h('label', { class: 'field' }, [h('span', { text: 'タグ' }), tag])]),
      onOk: function (_, okBtn) {
        if (!text.value.trim()) { App.ui.toast('カルテの本文を入れてください', 'error'); return; }
        App.ui.write('note.add', { studentId: r.student_id, body: text.value.trim(), tag: tag.value.trim() },
          { button: okBtn, onDone: function () { m.close(); render(view); } });
      } });
    text.focus();
  }

  App.screens.teacher = function (view) { render(view); };
})(window);
