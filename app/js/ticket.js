/**
 * ticket.js — 振替券の台帳（S1-35a・design 8-1・R-58）。スタッフだけ。
 * 生徒ごとの券1枚ずつ（発行元・根拠・期限・状態・使用先）。期限が決まっていない券は「期限未確定」と出す。
 * 操作はどれも理由が必須: 発行・失効・期限の延長・使用済みの発行元訂正・使用済みの回の2枚目（D-74）。
 * 使用済みの券を未使用に戻す操作は作らない（7-3）。
 */
(function (root) {
  'use strict';
  var App = root.App, core = App.core, O = App.ops, h = App.ui.h, ui = App.ui;
  var state = { studentId: '' };
  App.ui.onForget(function () { state.studentId = ''; });   // ログアウト・人の切り替え（04a 小12）
  var ref = { sessions: [], classes: [] };

  function render(view0) {
    var f = App.takeFocus ? App.takeFocus() : '';
    if (f) state.studentId = f;
    var view = ui.stage(view0);   // 出し直しの間も今の画面を出したまま（尚哉 10/4①）
    view.appendChild(h('h1', { text: '振替券の台帳' }));
    view.appendChild(h('p', { class: 'sub', text: '期限は振替Dayの日程から毎回計算します。基準の振替Dayがまだ登録されていない券は「期限未確定」です。振替Dayを休み（中止）にしても、券は増えません' }));
    var out = h('div', {});
    // 生徒は名前・ふりがなで探して選ぶ（生徒の画面と同じ探し方・U-22）
    var pick = ui.studentPicker({ value: state.studentId, onChange: function (id) { state.studentId = id; load(view0, out); } });
    view.appendChild(h('div', { class: 'toolbar np' }, [pick.el, ui.printButton()]));
    view.appendChild(out);
    // 生徒を選んだ状態なら、券の一覧も同時に読み始める（U-21: 順番に待たない）
    var early = state.studentId ? fetchTickets(state.studentId) : null;
    Promise.all([ui.read('student.list', {}), ui.read('session.list', {}), ui.read('class.list', {})]).then(function (r) {
      ref.sessions = (r[1] && r[1].sessions) || [];
      ref.classes = (r[2] && r[2].classes) || [];
      if (!r[0]) return;
      pick.setStudents(r[0].students);
      if (state.studentId) load(view0, out, early);
    });
  }

  function fetchTickets(sid) {
    return Promise.all([ui.read('ticket.list', { studentId: sid }), ui.read('makeup.list', { all: true }), ui.read('student.get', { studentId: sid })]);
  }
  function load(view, out, early) {
    ui.clear(out);
    if (!state.studentId) return;
    var sid = state.studentId, again = function () { render(view); };
    out.appendChild(h('p', { class: 'loading', text: '読み込み中…' }));
    (early || fetchTickets(sid)).then(function (r) {
      ui.clear(out); out.className = 'print-area';
      if (!r[0] || !r[2]) { out.textContent = '読み込めませんでした'; return; }
      var st = r[2].student;
      var rows = O.ticketRows(r[0].tickets, ref.sessions, ref.classes, (r[1] && r[1].makeups) || []);
      out.appendChild(h('h2', { text: st.name + ' さんの振替券（' + rows.length + ' 枚）' }));
      out.appendChild(h('div', { class: 'toolbar np' }, [
        h('button', { class: 'btn primary', type: 'button', text: '＋ 券を発行する（理由が必要）', on: { click: function () { issue(st, r[2].enrollments, again); } } }),
        h('button', { class: 'btn', type: 'button', text: '欠席連絡・振替へ', on: { click: function () { App.go('makeup', sid); } } }),
        h('button', { class: 'btn', type: 'button', text: '生徒の画面へ', on: { click: function () { App.go('students'); } } })]));
      if (!rows.length) { out.appendChild(h('p', { class: 'empty', text: '振替券はありません' })); return; }
      out.appendChild(h('div', { class: 'scroll-x' }, h('table', { class: 'grid' }, [
        h('thead', {}, h('tr', {}, ['発行元の回', '', '根拠', '期限', '状態', '使用先', 'メモ'].map(function (t) { return h('th', { class: t ? '' : 'np', text: t }); }))),
        h('tbody', {}, rows.map(function (k) {
          // 操作は発行元の回のすぐ横（iPad 縦で右端が画面の外に出ない・U-13）。印刷では .np で消える
          return h('tr', { class: k.state === 'void' ? 'planned' : '' }, [h('td', { text: k.source }),
            h('td', { class: 'np act-first' }, k.actions.map(function (a) {
              return h('button', { class: 'btn small', type: 'button', text: O.TK_ACTION[a], on: { click: function () { act(a, k, st, again); } } });
            })), h('td', { text: k.basis }),
            h('td', { class: k.expiryUnset ? 'c-warn' : '', text: k.expiry }), h('td', { text: k.stateLabel }), h('td', { text: k.usedAt }),
            h('td', { class: 'memo', text: k.notes.join('／') })]);
        }))])));
    });
  }

  var REASON = { key: 'reason', label: '理由（必ず）', type: 'textarea' };

  function act(a, k, st, again, repairOf) {
    var rp = repairOf ? { repair_of: repairOf } : {};
    var send = function (fn, title) {
      return function (args, okBtn, m) { ui.write(fn, Object.assign(args, rp), { button: okBtn, title: title, onDone: ui.closing(m, again) }); };
    };
    if (a === 'extend') {
      ui.formModal({ title: '期限を延ばす', okLabel: '延ばす', intro: '今の期限: ' + k.expiry + '（延長は決まった回数までです）',
        fields: [{ key: 'extendTo', label: '延ばした後の期限', type: 'date', value: k.expiryRaw }, REASON],
        check: function (v) { return O.extendArgs(k, v); }, onOk: send('ticket.extend') });
    } else if (a === 'void') {
      ui.formModal({ title: '券を失効させる', okLabel: '失効させる', danger: true,
        intro: k.source + ' の券を失効させます（元に戻す操作はありません。もう一度出すときは「券を発行する」）' + (k.state === 'reserved' ? '。この券は振替Dayを予約中なので、予約もいっしょに取り消します' : ''),
        fields: [REASON],
        check: function (v) { return O.reasonArgs({ ticketId: k.id }, v, k.state === 'reserved' ? { cancelReservation: true } : null); }, onOk: send('ticket.void') });
    } else if (a === 'used_fix') {
      ui.formModal({ title: '使用済み・発行元訂正', okLabel: '理由を残す',
        intro: '使用済みの券の発行元（欠席）が間違っていたときに、理由を残します。券は使用済みのまま、出欠や他の券は変わりません',
        fields: [REASON], check: function (v) { return O.reasonArgs({ ticketId: k.id }, v); }, onOk: send('ticket.used_fix') });
    } else if (a === 'issue2') {
      ui.formModal({ title: 'もう1回分を発行（2枚目）', okLabel: '発行する',
        intro: k.source + ' の券は使用済みです。教室の判断でもう1回分を認めるときに、2枚目を出します（前の券とつながりを残します）',
        fields: [REASON], check: function (v) { return O.reasonArgs({ studentId: st.id, sessionId: k.source_session_id }, v); }, onOk: send('ticket.issue') });
    }
  }

  function issue(st, enrollments, again, repairOf) {
    var own = O.ownSessions(ref.sessions, enrollments, '0000-00-00').filter(function (x) {
      var c = ref.classes.filter(function (y) { return y.id === x.class_id; })[0];
      return c && c.makeup_type === 'makeupday';
    }).reverse();
    if (!own.length) { ui.toast('振替Dayのクラスの授業回がありません（券は振替Dayのクラスの回にだけ出せます）', 'error'); return; }
    ui.formModal({ title: '券を発行する', okLabel: '発行する', intro: st.name + ' さんに、教室の判断で振替券を出します。同じ回に使っていない券があるときは出せません',
      fields: [{ key: 'sessionId', label: 'どの回の分か', type: 'select', options: O.sesOptions(own, ref.classes, '回を選んでください') }, REASON],
      check: function (v) {
        if (!v.sessionId) return { error: 'どの回の分かを選んでください' };
        return O.reasonArgs(Object.assign({ studentId: st.id, sessionId: v.sessionId }, repairOf ? { repair_of: repairOf } : {}), v);
      },
      onOk: function (args, okBtn, m) { ui.write('ticket.issue', args, { button: okBtn, onDone: ui.closing(m, again) }); } });
  }

  App.ticketOps = { act: act };
  App.screens.tickets = function (view) { render(view); };
})(window);
