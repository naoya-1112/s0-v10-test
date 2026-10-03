/**
 * makeup.js — 振替・欠席（S1-34・design 8-1・R-26〜R-29）。スタッフだけ。
 * これからの振替の一覧（取消は 開始前／開始後で来なかった／振替出席あり の3分け）と、生徒を選んで代行する操作
 * （欠席連絡の代行・取消／相互振替の手登録（ルール外・満席・締切後はサーバーの確認画面）／振替Dayの予約の代行）。
 * 書き込みは ui.write（押した瞬間に受付番号・返るまで押せない＝2回押しても1件・T-31）。
 */
(function (root) {
  'use strict';
  var App = root.App, core = App.core, O = App.ops, h = App.ui.h, ui = App.ui;
  var state = { all: false, studentId: '' };
  var ref = { sessions: [], classes: [] };

  function loadRef() {
    return Promise.all([ui.read('session.list', {}), ui.read('class.list', {})]).then(function (r) {
      ref.sessions = (r[0] && r[0].sessions) || [];
      ref.classes = (r[1] && r[1].classes) || [];
    });
  }

  function render(view) {
    var f = App.takeFocus ? App.takeFocus() : '';
    if (f) state.studentId = f;
    ui.clear(view);
    view.appendChild(h('h1', { text: '振替・欠席' }));
    var people = h('div', {});
    var list = h('div', { class: 'loading', text: '読み込み中…' });
    view.appendChild(h('h2', { class: 'section-title', text: '生徒を選んで代行する（欠席連絡・振替・振替Day）' }));
    view.appendChild(people);
    var all = h('input', { type: 'checkbox', class: 'check' });
    all.checked = state.all;
    all.addEventListener('change', function () { state.all = all.checked; render(view); });
    view.appendChild(h('h2', { class: 'section-title', text: state.all ? '振替の一覧（取り消したもの・過去も）' : 'これからの振替' }));
    view.appendChild(h('div', { class: 'toolbar np' }, [h('label', { class: 'choice' }, [all, ' 取り消したもの・過去も見る']), ui.printButton()]));
    view.appendChild(list);
    loadRef().then(function () {
      studentBox(view, people);
      return ui.read('makeup.list', { all: state.all });
    }).then(function (d) {
      ui.clear(list); list.className = 'print-area';
      if (!d) { list.textContent = '読み込めませんでした'; return; }
      var rows = O.makeupRows(d.makeups, ref.sessions, ref.classes, new Date());
      list.appendChild(h('p', { class: 'sub', text: rows.length + ' 件' }));
      if (!rows.length) { list.appendChild(h('p', { class: 'empty', text: 'これからの振替はありません' })); return; }
      list.appendChild(h('div', { class: 'scroll-x' }, h('table', { class: 'grid' }, [
        h('thead', {}, h('tr', {}, ['誰が', '種類', '行く回', '印', ''].map(function (t) { return h('th', { class: t ? '' : 'np', text: t }); }))),
        h('tbody', {}, rows.map(function (r) {
          var b = r.canceled ? null : h('button', { class: 'btn small', type: 'button', text: r.mode === 'after' ? '取り消す（開始後）' : '取り消す',
            on: { click: function () { cancel(r, function () { render(view); }); } } });
          return h('tr', { class: r.canceled ? 'planned' : '' }, [h('td', { class: 'name', text: r.name }), h('td', { text: r.kind }), h('td', { text: r.to }),
            h('td', { class: 'memo', text: r.badges.concat(r.canceledText ? [r.canceledText] : []).join('・') }), h('td', { class: 'np' }, b)]);
        }))])));
    });
  }

  /* ---------- 取消（3分け） ---------- */

  function cancel(r, again, repairOf) {
    var p = O.cancelPlan(r);
    var fields = [{ key: 'reason', label: p.needReason ? '理由（必ず）' : '理由（任意）', type: 'textarea' }];
    if (p.ticketChoice) fields.push({ key: 'ticket', label: '振替券', type: 'radio', value: 'void',
      options: [{ value: 'void', label: '失効させる（ふつうはこちら）' }, { value: 'return', label: '券を戻す（もう一度使える）' }] });
    ui.formModal({ title: p.title, intro: p.lines.join('。'), okLabel: '取り消す', danger: r.mode === 'after', fields: fields,
      check: function (v) { return O.cancelArgs(r, v, repairOf); },
      onOk: function (args, okBtn, m) { ui.write('makeup.cancel', args, { button: okBtn, onDone: ui.closing(m, again) }); } });
  }

  /* ---------- 生徒を選んで代行 ---------- */

  function studentBox(view, box) {
    ui.clear(box);
    var sel = h('select', { class: 'input', 'aria-label': '生徒' }, [h('option', { value: '', text: '生徒を選んでください' })]);
    var out = h('div', {});
    box.appendChild(h('div', { class: 'toolbar np' }, [h('label', { class: 'field inline' }, [h('span', { text: '生徒' }), sel])]));
    box.appendChild(out);
    sel.addEventListener('change', function () { state.studentId = sel.value; person(view, out); });
    ui.read('student.list', {}).then(function (d) {
      if (!d) return;
      d.students.slice().sort(function (a, b) { return (a.kana || '') < (b.kana || '') ? -1 : 1; }).forEach(function (s) {
        sel.appendChild(h('option', { value: s.id, text: s.name + (s.kana ? '（' + s.kana + '）' : '') }));
      });
      if (state.studentId) { sel.value = state.studentId; person(view, out); }
    });
  }

  function person(view, out) {
    ui.clear(out);
    if (!state.studentId) return;
    var sid = state.studentId, again = function () { render(view); };
    out.appendChild(h('p', { class: 'loading', text: '読み込み中…' }));
    Promise.all([ui.read('student.get', { studentId: sid }), ui.read('absence.list', { studentId: sid })]).then(function (r) {
      ui.clear(out);
      if (!r[0] || !r[1]) { out.textContent = '読み込めませんでした'; return; }
      var st = r[0].student, own = O.ownSessions(ref.sessions, r[0].enrollments, core.addDays(core.todayJst(), -60));
      out.appendChild(h('div', { class: 'toolbar np' }, [
        h('button', { class: 'btn primary', type: 'button', text: '欠席連絡を代行で登録', on: { click: function () { absenceAdd(st, own, again); } } }),
        h('button', { class: 'btn', type: 'button', text: '相互振替を登録（手登録）', on: { click: function () { mutual(st, own, again); } } }),
        h('button', { class: 'btn', type: 'button', text: '振替Dayを予約（代行）', on: { click: function () { reserveDay(st, again); } } }),
        h('button', { class: 'btn', type: 'button', text: '振替券の台帳へ', on: { click: function () { App.go('tickets', sid); } } })]));
      var abs = O.absenceRows(r[1].absences, ref.sessions, ref.classes);
      out.appendChild(h('h3', { text: st.name + ' さんの欠席連絡' }));
      if (!abs.length) { out.appendChild(h('p', { class: 'empty', text: '欠席連絡はありません' })); return; }
      abs.forEach(function (a) {
        out.appendChild(h('div', { class: 'list-row' + (a.active ? '' : ' off') }, [
          h('div', { class: 'main' }, [h('strong', { text: a.session }), h('span', { class: 'tag' + (a.active ? ' plan' : ''), text: a.state }), h('div', { class: 'sub', text: '受けた: ' + a.by })]),
          a.active ? h('button', { class: 'btn small np', type: 'button', text: '欠席連絡を取り消す', on: { click: function () { absenceWithdraw(st, a, again); } } }) : null]));
      });
    });
  }

  function absenceAdd(st, own, again) {
    if (!own.length) { ui.toast('この生徒が在籍しているクラスの授業回がありません（クラスと日程を確かめてください）', 'error'); return; }
    ui.formModal({ title: '欠席連絡を代行で登録', okLabel: '登録する', intro: st.name + ' さんの欠席を、教室が代わりに登録します。始まった後の回は次の画面で確かめてから登録します',
      fields: [{ key: 'sessionId', label: '休む回', type: 'select', options: O.sesOptions(own, ref.classes, '回を選んでください') },
        { key: 'byName', label: '連絡を受けた人（空なら自分）', type: 'text' }],
      check: function (v) { return v.sessionId ? { args: { studentId: st.id, sessionId: v.sessionId, byName: v.byName.trim() || undefined } } : { error: '休む回を選んでください' }; },
      onOk: function (args, okBtn, m) { ui.write('absence.add', args, { button: okBtn, title: '締切後の登録の確認', okLabel: '登録する', onDone: ui.closing(m, again) }); } });
  }

  function absenceWithdraw(st, a, again, repairOf) {
    ui.formModal({ title: '欠席連絡を取り消す', okLabel: '取り消す', intro: st.name + ' さん ' + a.session + ' の欠席連絡を取り消します（来られるようになった・間違いなど）。使っていない振替券は失効します',
      fields: [{ key: 'reason', label: '理由（任意）', type: 'textarea' },
        { key: 'cancelReservation', label: 'この欠席の券で振替Dayを予約していたら、その予約もいっしょに取り消す', type: 'checkbox' }],
      check: function (v) {
        var x = { absenceId: a.id, reason: v.reason.trim() || undefined, cancelReservation: v.cancelReservation || undefined };
        if (repairOf) x.repair_of = repairOf;
        return { args: x };
      },
      onOk: function (args, okBtn, m) { ui.write('absence.withdraw', args, { button: okBtn, title: '欠席連絡の取消の確認', okLabel: '取り消す', onDone: ui.closing(m, again) }); } });
  }

  function mutual(st, own, again) {
    var future = own.filter(function (x) { return x.date >= core.todayJst() && x.status === 'active'; });
    if (!future.length) { ui.toast('これからの授業回がありません', 'error'); return; }
    ui.formModal({ title: '相互振替（1. 休む回）', okLabel: '振替先を選ぶ',
      fields: [{ key: 'sessionId', label: '休む回', type: 'select', options: O.sesOptions(future, ref.classes, '回を選んでください') }],
      check: function (v) { return v.sessionId ? { args: v } : { error: '休む回を選んでください' }; },
      onOk: function (a1, okBtn, m) {
        ui.busy(okBtn, true);
        ui.read('makeup.options', { studentId: st.id, sessionId: a1.sessionId }).then(function (d) {
          ui.busy(okBtn, false);
          if (!d) return;
          m.close();
          var src = ref.sessions.filter(function (x) { return x.id === a1.sessionId; })[0];
          var inRule = d.sessions || [];
          var others = ref.sessions.filter(function (x) {
            return x.kind === 'lesson' && x.status === 'active' && x.class_id !== (src && src.class_id) && x.date >= core.todayJst() &&
              !inRule.some(function (y) { return y.id === x.id; });
          });
          ui.formModal({ title: '相互振替（2. 振替先）', okLabel: '振替を登録する',
            intro: inRule.length ? 'ルールどおりの振替先（同じ内容・同じ回番号・空きあり）から選んでください' : 'ルールどおりの振替先（同じ内容・同じ回番号・空きあり）はありません。教室の判断でルール外の回を選べます',
            fields: [{ key: 'pick', label: '振替先', type: 'radio', value: inRule.length ? inRule[0].id : 'other',
              options: O.sesOptions(inRule, ref.classes).concat([{ value: 'other', label: 'ルール外の回を選ぶ（次の画面で確かめます）' }]) },
              { key: 'other', label: 'ルール外の回', type: 'select', options: O.sesOptions(others, ref.classes, '回を選んでください'), show: function (v) { return v.pick === 'other'; } }],
            check: function (v) {
              var to = v.pick === 'other' ? v.other : v.pick;
              return to ? { args: { studentId: st.id, sessionId: a1.sessionId, toSessionId: to } } : { error: '振替先を選んでください' };
            },
            onOk: function (args, b2, m2) { ui.write('makeup.mutual', args, { button: b2, title: '振替の確認（ルール外・満席・締切後）', okLabel: '登録する', onDone: ui.closing(m2, again) }); } });
        });
      } });
  }

  function reserveDay(st, again) {
    ui.read('makeup.options', { studentId: st.id }).then(function (d) {
      if (!d) return;
      if (!d.sessions.length) { ui.toast(st.name + ' さんが予約できる振替Dayはありません（使える振替券が無い・満席・始まった）。券は「振替券の台帳」で確かめられます', 'warn'); return; }
      ui.formModal({ title: '振替Dayを予約（代行）', okLabel: '予約する', intro: '期限の近い振替券を1枚使います',
        fields: [{ key: 'sessionId', label: '振替Day', type: 'radio', value: d.sessions[0].id, options: O.sesOptions(d.sessions, ref.classes) }],
        check: function (v) { return v.sessionId ? { args: { studentId: st.id, sessionId: v.sessionId } } : { error: '振替Dayを選んでください' }; },
        onOk: function (args, okBtn, m) { ui.write('makeup.reserve_day', args, { button: okBtn, title: '振替Dayの予約の確認', okLabel: '予約する', onDone: ui.closing(m, again) }); } });
    });
  }

  App.makeupOps = { cancel: cancel, absenceWithdraw: absenceWithdraw };
  App.screens.makeup = function (view) { render(view); };
})(window);
