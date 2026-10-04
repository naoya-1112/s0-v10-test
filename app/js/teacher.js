/**
 * teacher.js — 講師画面（S1-37・design 8-2）: 今日のクラス・日付を前後に動かす・出欠の大きなボタン・押し直し・未記録に戻す・
 * 注意（欠席連絡あり・満席は止めずに知らせる）・直近カルテ3件・カルテを書く。スタッフも同じ画面を使える。
 * 出すのは teacher.day が返す項目だけ（連絡先・券の台帳・変更履歴は API が返さない・5-2・T-37）。
 * 直し第3弾: 開くたび・タブに戻るたびに今日に戻す（U-01）。出欠は押した瞬間に表示を変えて裏で送り、その1行だけ差し替える
 * （失敗したら元に戻して赤く知らせる・U-02・尚哉 10/4③）。紙の出欠の後入力は fromPaper の印だけ送る（記録者はログインの表示名・選ばない・尚哉 10/4）。
 */
(function (root) {
  'use strict';
  var App = root.App, core = App.core, V = App.views, h = App.ui.h;
  var state = { date: '', paper: false };

  function render(view) {
    var today = core.todayJst();
    if (!state.date) state.date = today;
    var out = App.ui.stage(view);   // 出し直しの間も今の画面を出したまま（尚哉 10/4①）
    var hd = V.dayHeading(state.date, today, 'teacher');
    App.ui.page(out, { title: hd.title });
    if (hd.alert) out.appendChild(h('div', { class: 'date-alert', role: 'alert', text: hd.alert }));
    out.appendChild(App.ui.stepper(core.fmtDate(state.date) + (state.date === today ? '（今日）' : ''),
      function () { state.date = core.addDays(state.date, -1); render(view); },
      function () { state.date = today; render(view); },
      function () { state.date = core.addDays(state.date, 1); render(view); }));
    var future = state.date > today;
    if (future) out.appendChild(h('p', { class: 'hint', text: '先の日付の出欠は付けられません（見るだけ）' }));
    else out.appendChild(paperBox());
    var body = h('div', { class: 'loading bare', text: '読み込み中…' });   // クラスごとのカードがグレーの上に並ぶ
    out.appendChild(body);
    App.ui.sections(out);   // 日付の切り替え・紙の出欠を1枚のカードに
    App.ui.read('teacher.day', { date: state.date }).then(function (d) {
      if (!d) { body.textContent = '読み込めませんでした'; return; }
      fill(view, body, d, future);
    });
  }

  /** 紙の出欠をあとから入れる（fromPaper の印を付けて送る。記録者は選ばない・尚哉 10/4） */
  function paperBox() {
    var box = h('div', { class: 'toolbar np' });
    var chk = h('input', { type: 'checkbox', class: 'check' });
    chk.checked = state.paper;
    chk.addEventListener('change', function () { state.paper = chk.checked; });
    box.appendChild(h('label', { class: 'choice' }, [chk, ' 紙の出欠をあとから入れる']));
    return box;
  }

  function fill(view, body, day, future) {
    App.ui.clear(body);
    body.className = '';
    var sessions = (day && day.sessions) || [];
    if (!sessions.length) { App.ui.card(body, [h('p', { class: 'empty', text: 'この日のクラスはありません' })]); return; }
    sessions.forEach(function (raw) {
      var c = { raw: raw, sv: V.sessionView(raw), summary: h('p', { class: 'summary' }), rows: {} };
      c.summary.textContent = c.sv.summary;
      var card = h('section', { class: 'card' }, [
        h('h2', { text: c.sv.title }),
        h('p', { class: 'sub', text: [c.sv.course, c.sv.teacher ? '講師: ' + c.sv.teacher : ''].filter(Boolean).join('・') }),
        c.summary
      ]);
      c.sv.rows.forEach(function (r) {
        var box = h('div', {});
        c.rows[r.student_id] = { box: box, pending: false, error: '' };
        paint(view, c, r.student_id, future);
        card.appendChild(box);
      });
      if (c.sv.plannedNote) card.appendChild(h('p', { class: 'sub planned-note', text: c.sv.plannedNote }));   // 枠の外に別に書く（尚哉 10/4）
      body.appendChild(card);
    });
  }

  /** その1行だけを作り直す（スクロール位置はそのまま・U-02） */
  function paint(view, c, sid, future) {
    var st = c.rows[sid], r = c.sv.rows.filter(function (x) { return x.student_id === sid; })[0];
    if (!st || !r) return;
    var box = App.ui.clear(st.box);
    box.className = 'person ' + r.statusCls + (st.pending ? ' sending' : '') + (st.error ? ' att-failed' : '');
    var btns = h('div', { class: 'att-buttons' });
    if (!future) {
      r.buttons.forEach(function (b) {
        var el = h('button', { class: 'btn att' + (b.on ? ' on' : '') + (b.result === 'absent' ? ' absent' : ''), type: 'button', text: b.label,
          'aria-pressed': b.on ? 'true' : 'false', disabled: st.pending });
        el.addEventListener('click', function () { if (!b.on) mark(view, c, r, b.result, future); });
        btns.appendChild(el);
      });
    }
    var head = h('div', { class: 'person-head' }, [
      h('div', { class: 'person-name' }, [h('strong', { text: r.name }), h('span', { class: 'kana', text: r.kana })]),
      h('span', { class: 'badge ' + r.statusCls, text: r.statusLabel }),
      h('span', { class: 'att-now', text: '記録: ' + r.attendanceLabel + (st.pending ? '（送信中…）' : '') })
    ]);
    if (!future && r.canClear) {   // 「未記録に戻す」は記録の文字の横に小さく離して置く（U-24）
      head.appendChild(h('button', { class: 'btn small', type: 'button', text: '未記録に戻す', disabled: st.pending,
        on: { click: function () { mark(view, c, r, '', future); } } }));
    }
    box.appendChild(head);
    if (st.error) box.appendChild(h('p', { class: 'att-error', role: 'alert', text: st.error }));
    if (r.notes.length) box.appendChild(h('ul', { class: 'warn-list' }, r.notes.map(function (n) { return h('li', { text: n }); })));
    box.appendChild(btns);
    if (r.karte.length) box.appendChild(h('details', { class: 'karte' }, [h('summary', { text: '最近のカルテ（' + r.karte.length + '件）' }),
      h('ul', {}, r.karte.map(function (k) { return h('li', { text: k }); }))]));
    box.appendChild(h('div', { class: 'row-actions' }, [h('button', { class: 'btn small', type: 'button', text: 'カルテを書く', on: { click: function () { writeNote(view, r); } } })]));
  }

  /** 押した瞬間に表示を変え、裏で送る。失敗したら元に戻して赤く知らせる（受付番号の再送は ui.write のまま） */
  function mark(view, c, r, result, future) {
    var sid = r.student_id, st = c.rows[sid];
    if (st.pending) return;
    var before = c.raw;
    var apply = function (raw) { c.raw = raw; c.sv = V.sessionView(raw); c.summary.textContent = c.sv.summary; };
    apply(V.withAttendance(c.raw, sid, result));
    st.pending = true; st.error = '';
    paint(view, c, sid, future);
    var args = { studentId: sid, sessionId: c.sv.session_id };
    if (result) args.result = result;
    if (state.paper) args.fromPaper = true;
    App.ui.write(result ? 'attendance.mark' : 'attendance.clear', args, { quiet: true,
      onDone: function () {
        st.pending = false; st.error = '';
        apply(V.withAttendance(c.raw, sid, result));   // 「もう一度送る」で後から届いたときも、押した結果にそろえる
        paint(view, c, sid, future);
      },
      onFail: function (res) {
        st.pending = false;
        var now = V.withAttendance(c.raw, sid, (before.students || []).filter(function (p) { return p.student_id === sid; }).map(function (p) { return p.attendance || ''; })[0] || '');
        apply(now);
        st.error = res && res.kind === 'fail' ? '送れませんでした（元に戻しました）。上の「もう一度送る」を押してください'
          : '保存できませんでした（元に戻しました）: ' + core.messageFor(res && res.data);
        paint(view, c, sid, future);
      } });
  }

  /** カルテを書く（R-38）: 一言（iPad の音声入力をそのまま使える）・タグは任意 */
  function writeNote(view, r) {
    var text = h('textarea', { class: 'reason', rows: 4, placeholder: '一言（キーボードのマイクで話しても入ります）' });
    var tag = h('select', { class: 'input', 'aria-label': 'タグ' }, [h('option', { value: '', text: 'タグなし' })].concat(App.core.NOTE_TAGS.map(function (t) { return h('option', { value: t, text: t }); })));
    var m = App.ui.openModal({ title: r.name + ' さんのカルテ', okLabel: '保存する',
      body: h('div', {}, [h('label', { class: 'field' }, [h('span', { text: 'カルテ' }), text]), h('label', { class: 'field' }, [h('span', { text: 'タグ（任意・健康や家庭の話は「配慮」）' }), tag])]),
      onOk: function (_, okBtn) {
        if (!text.value.trim()) { App.ui.toast('カルテの本文を入れてください', 'error'); return; }
        App.ui.write('note.add', { studentId: r.student_id, body: text.value.trim(), tag: tag.value },
          { button: okBtn, onDone: function () { m.close(); render(view); } });
      } });
    text.focus();
  }

  /** 画面を開くたび（ナビ・タブに戻ったとき）今日に戻す（U-01）。◀▶で動かした日付は、同じ画面にいる間だけ残す */
  App.screens.teacher = function (view) { state.date = core.todayJst(); render(view); };
})(window);
