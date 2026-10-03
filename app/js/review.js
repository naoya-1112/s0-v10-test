/**
 * review.js — 要確認と修復（S1-35b・design 6-6・8-1・R-63・R-65）。スタッフだけ。
 * 一覧: ①欠席連絡があるのに出席 ③連絡なしの欠席 ④券の根拠がなくなった（解決を選ぶ）と、②途中で止まった操作（10分以上）。
 * 止まった操作は「調べる」→ しようとしたこと（planned_ids）の1件ずつ「表にある／無い／予定どおりか」→
 * 直す（修復の経路＝この受付番号を repair_of に付けて送る。付けない操作は止められる）→ 閉じる（訂正済み／取消済み＋理由・整合の確認つき）。
 * 自動で直す仕組みは作らない（D-44）。何をすればいいかを、画面の上から順に読めば分かるように並べる。
 */
(function (root) {
  'use strict';
  var App = root.App, core = App.core, O = App.ops, A = App.admin, h = App.ui.h, ui = App.ui;
  var state = { receiptId: '' };
  var ref = { sessions: [], classes: [], courses: [], names: {} };

  function loadRef() {
    return Promise.all([ui.read('session.list', {}), ui.read('class.list', {}), ui.read('student.list', { includeHidden: true }), ui.read('course.list', {})]).then(function (r) {
      ref.sessions = (r[0] && r[0].sessions) || [];
      ref.classes = (r[1] && r[1].classes) || [];
      ref.names = {};
      ((r[2] && r[2].students) || []).forEach(function (s) { ref.names[s.id] = s.name; });
      ref.courses = (r[3] && r[3].courses) || [];
    });
  }

  function render(view) {
    if (state.receiptId) { renderReceipt(view); return; }
    ui.clear(view);
    view.appendChild(h('h1', { text: '要確認' }));
    view.appendChild(h('p', { class: 'sub', text: 'ここにあるものは、解決するまでその券・生徒・回の新しい予約を止めています。上から順に片付けてください' }));
    var body = h('div', { class: 'loading', text: '読み込み中…' });
    view.appendChild(body);
    loadRef().then(function () { return ui.read('review.list', {}); }).then(function (d) {
      ui.clear(body); body.className = '';
      if (!d) { body.textContent = '読み込めませんでした'; return; }
      var rows = O.reviewRows(d.items, ref.names, ref.sessions, ref.classes);
      // 止まった操作を先に（他の操作を止めているため）
      rows.sort(function (a, b) { return (a.source === 'receipt' ? 0 : 1) - (b.source === 'receipt' ? 0 : 1); });
      body.appendChild(h('p', { class: 'sub', text: rows.length + ' 件' }));
      if (!rows.length) { body.appendChild(h('p', { class: 'empty', text: '要確認はありません' })); return; }
      rows.forEach(function (r) {
        var acts = r.source === 'receipt'
          ? [h('button', { class: 'btn primary', type: 'button', text: '調べる・直す', on: { click: function () { state.receiptId = r.receipt_id; render(view); } } })]
          : [h('button', { class: 'btn primary', type: 'button', text: '解決する', on: { click: function () { resolve(r, function () { render(view); }); } } })];
        body.appendChild(h('div', { class: 'card' }, [h('h2', {}, [r.title, r.source === 'receipt' ? h('span', { class: 'tag err', text: '他の操作を止めています' }) : null]),
          h('p', { text: r.what }), h('p', {}, [h('strong', { text: r.who }), r.where ? '　' + r.where : '']),
          r.detail ? h('p', { class: 'sub', text: r.detail }) : null, h('div', { class: 'toolbar np' }, acts)]));
      });
    });
  }

  function resolve(r, again) {
    ui.formModal({ title: r.title + 'の解決', okLabel: '解決する', intro: r.who + (r.where ? '　' + r.where : '') + '。' + r.what,
      fields: [{ key: 'resolution', label: 'どうするか', type: 'radio', value: '', options: r.choices },
        { key: 'cancelReservation', label: '券が振替Dayの予約に使われていたら、その予約もいっしょに取り消す', type: 'checkbox',
          show: function (v) { return r.choices.some(function (c) { return c.value === v.resolution && c.reserve; }); } },
        { key: 'reason', label: '理由（「券を残す」「券は出さない」は必ず）', type: 'textarea' }],
      check: function (v) { return O.resolveArgs(r, v); },
      onOk: function (args, okBtn, m) { ui.write('review.resolve', args, { button: okBtn, onDone: ui.closing(m, again) }); } });
  }

  /* ---------- 止まった操作: 調べる → 直す → 閉じる ---------- */

  function renderReceipt(view) {
    var rid = state.receiptId, again = function () { render(view); };
    ui.clear(view);
    view.appendChild(h('div', { class: 'toolbar np' }, [h('button', { class: 'btn', type: 'button', text: '◀ 要確認の一覧へ', on: { click: function () { state.receiptId = ''; render(view); } } })]));
    var body = h('div', { class: 'loading', text: '読み込み中…' });
    view.appendChild(body);
    loadRef().then(function () { return ui.read('receipt.inspect', { receiptId: rid }); }).then(function (d) {
      ui.clear(body); body.className = '';
      if (!d) { body.textContent = '読み込めませんでした'; return; }
      var v = O.inspectView(d), adv = O.closeAdvice(v);
      var who = (d.student_ids || []).map(function (x) { return ref.names[x] || x; }).join('・');
      body.appendChild(h('h1', { text: '途中で止まった操作' }));
      body.appendChild(h('p', {}, ['受付番号 ', h('code', { text: v.receipt_id }), '　操作: ' + v.op + '　' + v.at]));
      body.appendChild(h('p', {}, ['対象: ', h('strong', { text: who || '（生徒なし）' }), '　' + (d.session_ids || []).map(function (x) {
        return O.sesLabel(ref.sessions.filter(function (s) { return s.id === x; })[0], ref.classes); }).join('／')]));
      if (v.closed) { body.appendChild(h('p', { class: 'tag ok', text: 'この受付はもう閉じています' })); return; }

      body.appendChild(h('h2', { class: 'section-title', text: '1. 調べる（しようとしたこと）' }));
      body.appendChild(h('p', { class: 'sub', text: v.summary }));
      var tb = h('tbody', {});
      body.appendChild(h('div', { class: 'scroll-x' }, h('table', { class: 'grid' }, [
        h('thead', {}, h('tr', {}, ['表', 'しようとしたこと', '番号', '今', '中身', ''].map(function (t) { return h('th', { class: t ? '' : 'np', text: t }); }))), tb])));
      v.items.forEach(function (it) {
        var btn = it.repair ? h('button', { class: 'btn small', type: 'button', text: '直す', on: { click: function () { repairItem(it, d, again); } } }) : null;
        tb.appendChild(h('tr', {}, [h('td', { text: it.table }), h('td', { text: it.type }), h('td', { text: it.id }), h('td', { text: it.have }),
          h('td', { class: it.ok ? '' : 'c-warn', text: it.same }), h('td', { class: 'np' }, btn)]));
      });

      body.appendChild(h('h2', { class: 'section-title', text: '2. 直す（必要なときだけ）' }));
      body.appendChild(h('p', { class: 'sub', text: adv.text }));
      body.appendChild(h('p', { class: 'sub', text: '上の表の「直す」、または下のボタンで直します。ここから送る操作には、この受付番号が付きます（他の画面から直すと止められます）' }));
      body.appendChild(h('div', { class: 'toolbar np' }, [h('button', { class: 'btn', type: 'button', text: '出欠を直す・券を出す（対象の生徒×回）', on: { click: function () { repairTarget(d, again); } } })]));

      body.appendChild(h('h2', { class: 'section-title', text: '3. 閉じる（止めを解く）' }));
      var probs = h('div', { role: 'alert' });
      body.appendChild(h('div', { class: 'toolbar np' }, [h('button', { class: 'btn primary', type: 'button', text: '受付を閉じる', on: { click: function () { close(rid, adv, probs, function () { state.receiptId = ''; render(view); }); } } })]));
      body.appendChild(probs);
    });
  }

  function close(rid, adv, probs, done) {
    ui.formModal({ title: '受付を閉じる', okLabel: '閉じる', intro: adv.text + '。閉じる前に、記録のつながりと重なりを確かめます（直っていなければ閉じません）',
      fields: [{ key: 'status', label: '閉じ方', type: 'radio', value: adv.status,
        options: [{ value: 'corrected', label: '訂正済み（書けた分・直した分をこのまま使う）' }, { value: 'voided', label: '取消済み（この操作は無かったことにする・やり直す）' }] },
        { key: 'reason', label: '理由（必ず）', type: 'textarea' }],
      check: function (v) { return O.closeArgs(rid, v); },
      onOk: function (args, okBtn, m) {
        ui.write('receipt.close', args, { button: okBtn, doneText: '閉じました。止めていた操作ができるようになりました', onDone: ui.closing(m, done),
          onError: function (d) {
            var list = O.closeProblems(d);
            if (!list.length) return false;
            m.close();
            ui.clear(probs);
            probs.appendChild(h('p', { class: 'error-text', text: (d.error || 'まだ直っていない記録があります') + '。次を直してから、もう一度閉じてください' }));
            probs.appendChild(h('ul', {}, list.map(function (p) { return h('li', { text: p }); })));
            return true;
          } });
      } });
  }

  /** 表の1行から直す（その記録の取消・訂正。全部 repair_of つき） */
  function repairItem(it, d, again) {
    var rid = d.receipt_id, sid = (d.student_ids || [])[0], st = { id: sid, name: ref.names[sid] || sid };
    if (it.repair === 'absence') { App.makeupOps.absenceWithdraw(st, { id: it.id, session: '（欠席連絡 ' + it.id + '）' }, again, rid); return; }
    if (it.repair === 'makeup') {
      ui.read('makeup.list', { all: true }).then(function (x) {
        if (!x) return;
        var row = O.makeupRows(x.makeups.filter(function (f) { return f.id === it.id; }), ref.sessions, ref.classes, new Date())[0];
        if (!row || row.canceled) { ui.toast('この振替はもう取り消されています', 'warn'); return; }
        App.makeupOps.cancel(row, again, rid);
      });
      return;
    }
    if (it.repair === 'ticket') {
      ui.read('ticket.list', {}).then(function (x) {
        if (!x) return;
        var k = O.ticketRows(x.tickets.filter(function (t) { return t.id === it.id; }), ref.sessions, ref.classes, [])[0];
        if (!k) return;
        var kst = { id: k.student_id, name: ref.names[k.student_id] || k.student_id };
        if (!k.actions.length) { ui.toast('この券（' + k.stateLabel + '）にできる直し方はありません', 'warn'); return; }
        ui.openModal({ title: '券を直す（' + k.source + '・' + k.stateLabel + '）', okLabel: '次へ',
          body: h('div', {}, [h('p', { text: 'どう直しますか' })].concat(k.actions.map(function (a) {
            return h('button', { class: 'btn big', type: 'button', text: O.TK_ACTION[a], on: { click: function () { App.ticketOps.act(a, k, kst, again, rid); } } });
          }))), onOk: function () {} }).okButton.hidden = true;
      });
      return;
    }
    if (it.repair === 'attendance') { repairTarget(d, again); return; }
    if (it.repair === 'enrollment') { correctEnrollment(it.id, d, again); }
  }

  /** 対象の生徒×回で、出欠を未記録に戻す／付け直す／券を出す */
  function repairTarget(d, again) {
    var rid = d.receipt_id;
    var stu = (d.student_ids || []).map(function (x) { return { value: x, label: ref.names[x] || x }; });
    var ses = (d.session_ids || []).map(function (x) { return { value: x, label: O.sesLabel(ref.sessions.filter(function (s) { return s.id === x; })[0], ref.classes) }; });
    if (!stu.length || !ses.length) { ui.toast('この受付には生徒×回の対象がありません。表の「直す」を使ってください', 'warn'); return; }
    ui.formModal({ title: '出欠を直す・券を出す（修復）', okLabel: '送る',
      fields: [{ key: 'studentId', label: '生徒', type: 'select', options: stu }, { key: 'sessionId', label: '回', type: 'select', options: ses },
        { key: 'what', label: 'すること', type: 'radio', value: '', options: [{ value: 'clear', label: '出欠を未記録に戻す' }, { value: 'present', label: '出席を付ける' },
          { value: 'absent', label: '欠席を付ける' }, { value: 'makeup_present', label: '振替出席を付ける' }, { value: 'issue', label: '振替券を出す（理由が必要）' }] },
        { key: 'reason', label: '理由', type: 'textarea', show: function (v) { return v.what === 'issue'; } }],
      check: function (v) {
        var base = { studentId: v.studentId, sessionId: v.sessionId, repair_of: rid };
        if (!v.what) return { error: 'することを選んでください' };
        if (v.what === 'issue') { var r = O.reasonArgs(base, v); return r.error ? r : { args: r.args, fn: 'ticket.issue' }; }
        if (v.what === 'clear') return { args: base, fn: 'attendance.clear' };
        return { args: Object.assign(base, { result: v.what }), fn: 'attendance.mark' };
      },
      onOk: function (args, okBtn, m) {
        var fn = args.result ? 'attendance.mark' : args.reason ? 'ticket.issue' : 'attendance.clear';
        if (App.needRecorder && /^attendance/.test(fn) && App.needRecorder()) return;
        ui.write(fn, args, { button: okBtn, onDone: ui.closing(m, again) });
      } });
  }

  /** 在籍の訂正（修復の経路）。生徒の画面の「訂正」と同じ入力 */
  function correctEnrollment(eid, d, again) {
    var sid = (d.student_ids || [])[0];
    ui.read('student.get', { studentId: sid }).then(function (x) {
      if (!x) return;
      var e = (x.enrollments || []).filter(function (r) { return r.id === eid; })[0];
      if (!e) { ui.toast('在籍の行が見つかりません', 'error'); return; }
      var co = A.byId(ref.courses), months = function (b, a) { return A.monthOptions(core.todayJst(), b, a); };
      ui.formModal({ title: '在籍の訂正（修復）', okLabel: '影響を確かめる',
        fields: [{ key: 'from_month', label: 'はじめの月', type: 'select', options: months(24, 15), value: e.from_month },
          { key: 'to_month', label: '終わりの月', type: 'select', options: [{ value: '', label: '決まっていない' }].concat(months(24, 24)), value: e.to_month || '' },
          { key: 'class_id', label: 'クラス', type: 'select', options: ref.classes.map(function (c) { return { value: c.id, label: A.classLabel(c, co) }; }), value: e.class_id },
          { key: 'state', label: '状態', type: 'radio', value: e.state, options: [{ value: 'enrolled', label: '在籍' }, { value: 'paused', label: '休止' }] }],
        check: function (v) { var r = A.correctPatch(e, v); if (r.args) r.args.repair_of = d.receipt_id; return r; },
        onOk: function (args, okBtn, m) { ui.write('enrollment.correct', args, { button: okBtn, title: '訂正の影響', onDone: ui.closing(m, again) }); } });
    });
  }

  App.screens.review = function (view) { render(view); };
})(window);
