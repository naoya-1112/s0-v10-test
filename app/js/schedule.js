/**
 * schedule.js — クラスと講座スケジュール（S1-29）と、日程の変更・中止・中止の解除・回番号変更（S1-30）。スタッフだけ。design 8-1・6-5・7-8。
 * 期を選ぶ→クラスの一覧（作る・直す・非表示）→クラスを選ぶと回番号つきの開講日一覧。
 * 開講日をまとめて作る（保存前の一覧を確かめてから保存）・1回ずつ足す（振替Day・体験・個別・追加の授業）。
 * 変更・中止・中止の解除は、サーバーの確認画面（影響の一覧）を見てから確定する。中止の解除は戻すものを1件ずつ選ぶ。
 */
(function (root) {
  'use strict';
  var App = root.App, core = App.core, A = App.admin, h = App.ui.h, ui = App.ui;
  var state = { term: '', classId: '', month: '' };
  var ref = { classes: [], courses: [], names: {} };

  function load() {
    return Promise.all([ui.read('class.list', {}), ui.read('course.list', {}), ui.read('student.list', { includeHidden: true })]).then(function (r) {
      ref.classes = (r[0] && r[0].classes) || [];
      ref.courses = (r[1] && r[1].courses) || [];
      ref.names = {};
      ((r[2] && r[2].students) || []).forEach(function (s) { ref.names[s.id] = s.name; });
      return !!r[0];
    });
  }
  function co() { return A.byId(ref.courses); }

  function render(view0) {
    var view = ui.stage(view0);   // 出し直しの間も今の画面を出したまま（尚哉 10/4①）
    view.appendChild(h('h1', { text: 'クラスと日程' }));
    var body = h('div', { class: 'loading', text: '読み込み中…' });
    view.appendChild(body);
    load().then(function (ok) {
      ui.clear(body); body.className = '';
      if (!ok) { body.textContent = '読み込めませんでした'; return; }
      draw(view0, body);
    });
  }

  function draw(view, body) {
    var again = function () { render(view); };
    var terms = A.terms(ref.classes);
    if (!state.term) state.term = terms[0] || core.todayJst().slice(0, 7);
    var termSel = h('select', { class: 'input', 'aria-label': '期' }, terms.map(function (t) { return h('option', { value: t, text: core.fmtMonth(t) + '期' }); }));
    termSel.value = state.term;
    termSel.addEventListener('change', function () { state.term = termSel.value; state.classId = ''; again(); });
    body.appendChild(h('div', { class: 'toolbar np' }, [h('label', { class: 'field inline' }, [h('span', { text: '期' }), terms.length ? termSel : h('span', { text: 'まだクラスがありません' })]),
      h('button', { class: 'btn primary', type: 'button', text: '＋ クラスを作る', on: { click: function () { editClass(null, again); } } }),
      h('button', { class: 'btn primary', type: 'button', text: '＋ 開講日をまとめて作る', on: { click: function () { pickAndGenerate(again); } } }),
      h('button', { class: 'btn', type: 'button', text: '＋ 1回ずつ足す（振替Day・体験・個別・追加の授業）', on: { click: function () { addOne(again); } } })]));

    var classes = ref.classes.filter(function (c) { return c.term === state.term; });
    // クラス一覧と期の選択は印刷しない（開講日一覧の「印刷」で一緒に出ない・U-27）
    body.appendChild(h('h2', { class: 'section-title np', text: core.fmtMonth(state.term) + '期のクラス' }));
    if (!classes.length) body.appendChild(h('p', { class: 'empty np', text: 'この期のクラスはありません' }));
    classes.forEach(function (c) {
      var on = c.id === state.classId, hidden = c.hidden === '1';
      body.appendChild(h('div', { class: 'list-row np' + (hidden ? ' off' : '') + (on ? ' now' : '') }, [
        h('div', { class: 'main' }, [h('strong', { text: A.classLabel(c, co()) }),
          h('div', { class: 'sub', text: '開講 ' + core.fmtMonth(c.open_from) + '〜' + core.fmtMonth(c.open_to) + '・定員 ' + c.capacity + '人' + (c.teacher ? '・講師 ' + c.teacher : '') +
            '・振替: ' + (A.MAKEUP_TYPE[c.makeup_type] || c.makeup_type) + '（コースから写して固定）' })]),
        h('div', { class: 'row-actions' }, [
          h('button', { class: 'btn small' + (on ? ' primary' : ''), type: 'button', text: '開講日を見る', on: { click: function () { state.classId = c.id; state.month = ''; again(); } } }),
          h('button', { class: 'btn small', type: 'button', text: '直す', on: { click: function () { editClass(c, again); } } }),
          h('button', { class: 'btn small', type: 'button', text: hidden ? '表示に戻す' : '非表示', on: { click: function () {
            // 生徒の非表示と同じ短い確認（U-28）
            ui.confirmThen(hidden ? 'クラスを表示に戻しますか' : 'クラスを非表示にしますか',
              [A.classLabel(c, co()) + (hidden ? ' を一覧と選択肢に戻します' : ' を一覧と選択肢から隠します。記録は消えません（あとで戻せます）')], hidden ? '戻す' : '隠す',
              function (okBtn, m) { ui.write('class.hide', { id: c.id, hidden: !hidden }, { button: okBtn, onDone: ui.closing(m, again) }); });
          } } })])]));
    });

    // 開講日一覧（クラス）または月の日程（クラスなしの振替Day・体験なども）
    var listBox = h('div', {});
    body.appendChild(listBox);
    if (state.classId) sessionsOfClass(listBox, again);
    else sessionsOfMonth(listBox, again);
  }

  function sessionsOfClass(box, again) {
    var c = A.byId(ref.classes)[state.classId];
    box.appendChild(h('h2', { class: 'section-title', text: '開講日一覧: ' + A.classLabel(c, co()) }));
    box.appendChild(h('div', { class: 'toolbar np' }, [
      h('button', { class: 'btn primary', type: 'button', text: '＋ 開講日をまとめて作る', on: { click: function () { generate(c, again); } } }),
      h('button', { class: 'btn', type: 'button', text: '月ごとの日程を見る', on: { click: function () { state.classId = ''; again(); } } }),
      ui.printButton()]));
    table(box, { classId: c.id }, again);
  }

  function sessionsOfMonth(box, again) {
    if (!state.month) state.month = core.todayJst().slice(0, 7);
    box.appendChild(h('h2', { class: 'section-title', text: '月ごとの日程（全部のクラス・振替Day・体験・個別）' }));
    box.appendChild(ui.stepper(core.fmtMonth(state.month),
      function () { state.month = core.addMonths(state.month, -1); again(); },
      function () { state.month = core.todayJst().slice(0, 7); again(); },
      function () { state.month = core.addMonths(state.month, 1); again(); }, '今月'));
    table(box, { month: state.month }, again);
  }

  function table(box, args, again) {
    var out = h('div', { class: 'loading', text: '読み込み中…' });
    box.appendChild(out);
    ui.read('session.list', args).then(function (d) {
      ui.clear(out); out.className = 'print-area';
      if (!d) { out.textContent = '読み込めませんでした'; return; }
      var rows = A.sessionRows(d.sessions, ref.classes, core.todayJst());
      if (!rows.length) { out.appendChild(h('p', { class: 'empty', text: 'まだ日程はありません' })); return; }
      out.appendChild(h('div', { class: 'scroll-x' }, h('table', { class: 'grid' }, [
        h('thead', {}, h('tr', {}, ['日付', '', '時間', '内容', '状態', 'カレンダー'].map(function (t) { return h('th', { class: t ? '' : 'np', text: t }); }))),
        h('tbody', {}, rows.map(function (r) {
          // 操作は日付のすぐ横（U-13）
          return h('tr', { class: r.status ? 'planned' : '' }, [h('td', { text: r.date + r.moved }),
            h('td', { class: 'np act-first' }, h('div', { class: 'row-actions' }, r.actions.map(function (a) { return actionBtn(a, r.raw, again); }))),
            h('td', { text: r.time }), h('td', { text: r.name }),
            h('td', { class: r.status ? 'c-abs' : '', text: r.status }), h('td', { class: r.calBad ? 'c-abs' : '', text: r.cal })]);
        }))])));
    });
  }

  var LABEL = { change: '変更', cancel: '中止', uncancel: '中止の解除', renumber: '回番号' };
  function actionBtn(a, s, again) {
    var fn = { change: change, cancel: cancel, uncancel: uncancel, renumber: renumber }[a];
    return h('button', { class: 'btn small' + (a === 'cancel' ? ' danger' : ''), type: 'button', text: LABEL[a], on: { click: function () { fn(s, again); } } });
  }
  function sLabel(s) { return core.fmtDate(s.date) + ' ' + s.start_time + ' ' + (A.KIND[s.kind] || '') + (s.number ? ' 第' + s.number + '回' : ''); }
  var afterContacts = function (again) {
    return function () { ui.toast('保存しました。連絡が要る人は「連絡が要る人」の画面に出ています', 'ok'); again(); };
  };

  /* ---------- クラス ---------- */

  function editClass(cur, again) {
    var months = A.monthOptions(core.todayJst(), 12, 24);
    var fields = [];
    if (!cur) fields.push({ key: 'course_id', label: 'コース', type: 'select',
      options: [{ value: '', label: 'コースを選んでください' }].concat(ref.courses.filter(function (c) { return c.hidden !== '1'; }).map(function (c) { return { value: c.id, label: c.name + '（' + A.MAKEUP_TYPE[c.makeup_type] + '）' }; })),
      hint: '振替の種類はコースから写して、このクラスでは固定になります' });
    fields = fields.concat([
      { key: 'label', label: 'クラスの名前（例: 火・土午前）', value: cur ? cur.label : '' },
      { key: 'weekday', label: '曜日', type: 'radio', value: cur ? cur.weekday : '', options: A.WEEKDAYS.map(function (w) { return { value: w, label: w }; }) },
      { key: 'start_time', label: '開始', type: 'time', value: cur ? cur.start_time : '' },
      { key: 'end_time', label: '終了', type: 'time', value: cur ? cur.end_time : '' },
      { key: 'capacity', label: '定員', type: 'number', value: cur ? cur.capacity : '' },
      { key: 'teacher', label: '講師（任意）', value: cur ? cur.teacher : '' },
      { key: 'open_from', label: '開講のはじめの月', type: 'select', options: months, value: cur ? cur.open_from : state.term },
      { key: 'open_to', label: '開講の終わりの月', type: 'select', options: months, value: cur ? cur.open_to : core.addMonths(state.term, 11) },
      { key: 'mutual_group', label: '相互振替のグループ（任意・同じ文字のクラス同士で振替できる）', value: cur ? cur.mutual_group : '' }]);
    ui.formModal({ title: cur ? 'クラスを直す' : 'クラスを作る', okLabel: '保存する', fields: fields,
      intro: cur ? 'コース・期・振替の種類は変えられません（変えるときは新しくクラスを作ってください）' : '',
      check: function (v) { return A.classArgs(Object.assign({ id: cur && cur.id }, v)); },
      onOk: function (args, b, m) { ui.write('class.save', args, { button: b, onDone: ui.closing(m, function (d) { if (d.result && d.result.class_id) state.classId = d.result.class_id; again(); }) }); } });
  }

  /* ---------- 開講日を作る（保存前の確認・T-06） ---------- */

  function generate(c, again) {
    var wd = String(A.WEEKDAYS.indexOf(c.weekday));
    ui.formModal({ title: '開講日をまとめて作る', okLabel: '保存する前の一覧を見る',
      intro: A.classLabel(c, co()) + '。次の画面で作る日の一覧を確かめてから保存します',
      fields: [{ key: 'how', label: '日の決め方', type: 'radio', value: 'nth', options: [{ value: 'weekly', label: '毎週' }, { value: 'biweekly', label: '隔週' },
          { value: 'nth', label: '第何週（例: 第1・第3）' }, { value: 'manual', label: '日付を並べる' }] },
        { key: 'weekday', label: '曜日', type: 'select', value: wd, options: A.WEEKDAYS.map(function (w, i) { return { value: String(i), label: w + '曜日' }; }),
          show: function (v) { return v.how !== 'manual'; } },
        { key: 'weeks', label: '第何週', type: 'checks', value: ['1', '3'], options: [1, 2, 3, 4, 5].map(function (n) { return { value: String(n), label: '第' + n }; }),
          show: function (v) { return v.how === 'nth'; } },
        { key: 'dates', label: '作る日（日付を選んで「追加」）', type: 'dates', empty: 'まだ選んでいません', show: function (v) { return v.how === 'manual'; } },
        { key: 'startDate', label: '最初の日（この日から数えます）', type: 'date', value: c.open_from + '-01' },
        { key: 'endBy', label: 'いつまで作るか', type: 'radio', value: 'class', options: [{ value: 'count', label: '回数で決める' }, { value: 'date', label: '終わりの日で決める' },
          { value: 'class', label: 'クラスの終わりの月まで' }] },
        { key: 'count', label: '回数', type: 'number', value: '', show: function (v) { return v.endBy === 'count'; } },
        { key: 'endDate', label: '終わりの日', type: 'date', show: function (v) { return v.endBy === 'date'; } },
        { key: 'skips', label: '休みの日（任意・日付を選んで「追加」）', type: 'dates', empty: '休みの日はありません', hint: '休みの日は飛ばして、回番号は詰めます。隔週のときは、休んだ回の分を最後に足します（2週間おきのまま）' },
        { key: 'startNumber', label: '最初の回番号（ふつうは1）', type: 'number', value: '1' }],
      check: function (v) { return A.generateArgs(Object.assign({ classId: c.id, kind: 'lesson' }, v), c); },
      onOk: function (args, b, m) {
        ui.write('session.generate', args, { button: b, title: '作る開講日（まだ保存していません）', okLabel: 'この日程で保存する',
          onDone: ui.closing(m, function (d) { ui.toast('開講日を ' + ((d.result && d.result.session_ids) || []).length + ' 回作りました', 'ok'); again(); }) });
      } });
  }

  /** どの授業（クラス）の開講日を作るかを選んでから、作る画面へ（尚哉 10/4）。いま開いているクラスがあれば最初から選んでおく */
  function pickAndGenerate(again) {
    var classes = ref.classes.filter(function (c) { return c.hidden !== '1' && c.term === state.term; });
    if (!classes.length) { ui.toast('この期のクラスがありません。先に「クラスを作る」から作ってください', 'warn'); return; }
    var byId = A.byId(classes);
    ui.formModal({ title: '開講日をまとめて作る', okLabel: '次へ',
      intro: 'どの授業の開講日を作るか選んでください',
      fields: [{ key: 'classId', label: '授業（クラス）', type: 'select', value: byId[state.classId] ? state.classId : classes[0].id,
        options: classes.map(function (c) { return { value: c.id, label: A.classLabel(c, co()) }; }) }],
      check: function (v) { return byId[v.classId] ? { args: v } : { error: '授業を選んでください' }; },
      onOk: function (v, b, m) { m.close(); state.classId = v.classId; generate(byId[v.classId], again); } });
  }

  /* ---------- 1回ずつ足す ---------- */

  function addOne(again) {
    var classes = ref.classes.filter(function (c) { return c.hidden !== '1' && c.term === state.term; });
    ui.formModal({ title: '1回ずつ足す', okLabel: '足す',
      fields: [{ key: 'kind', label: '種類', type: 'radio', value: 'makeupday', options: [{ value: 'makeupday', label: '振替Day' }, { value: 'trial', label: '体験' },
          { value: 'individual', label: '個別' }, { value: 'lesson', label: '追加の授業' }] },
        { key: 'classId', label: 'クラス（追加の授業は必ず・ほかは任意）', type: 'select', value: state.classId,
          options: [{ value: '', label: 'クラスなし' }].concat(classes.map(function (c) { return { value: c.id, label: A.classLabel(c, co()) }; })) },
        { key: 'date', label: '日付', type: 'date' },
        { key: 'startTime', label: '開始（クラスを選んだら空でクラスの時間）', type: 'time' },
        { key: 'endTime', label: '終了', type: 'time' },
        { key: 'number', label: '回番号（追加の授業）', type: 'number', show: function (v) { return v.kind === 'lesson'; } },
        { key: 'capacity', label: '定員（空ならクラス・教室の初期値）', type: 'number' },
        { key: 'title', label: '題名（任意・例: 冬の振替Day）', show: function (v) { return v.kind !== 'lesson'; } }],
      check: function (v) { return A.addArgs(v); },
      onOk: function (args, b, m) { ui.write('session.add', args, { button: b, onDone: ui.closing(m, again) }); } });
  }

  /* ---------- 変更・中止・中止の解除・回番号（S1-30） ---------- */

  function change(s, again) {
    ui.formModal({ title: '日程の変更: ' + sLabel(s), okLabel: '影響を確かめる',
      intro: '同じ月の中の日付・時刻・定員だけ変えられます。別の月にするときは「中止」してから「追加の授業」を足してください',
      fields: [{ key: 'date', label: '日付', type: 'date', value: s.date }, { key: 'startTime', label: '開始', type: 'time', value: s.start_time },
        { key: 'endTime', label: '終了', type: 'time', value: s.end_time }, { key: 'capacity', label: '定員', type: 'number', value: s.capacity }],
      check: function (v) { return A.changeArgs(s, v); },
      onOk: function (args, b, m) { ui.write('session.change', args, { button: b, title: '変更の影響', names: ref.names, onDone: ui.closing(m, afterContacts(again)) }); } });
  }

  function cancel(s, again) {
    ui.write('session.cancel', { sessionId: s.id }, { title: '中止の影響: ' + sLabel(s), names: ref.names, okLabel: '中止する', danger: true,
      confirmNote: '下の記録が変わります。中止を解除しても自動では戻りません（解除のときに1件ずつ選んで戻します）', onDone: afterContacts(again) });
  }

  function uncancel(s, again) {
    ui.write('session.uncancel', { sessionId: s.id }, { title: '中止の解除: ' + sLabel(s), okLabel: '中止を解除する',
      confirmExtra: function (d) {
        var ch = A.uncancelChoices(d, ref.names), boxes = [];
        var el = h('div', {}, [h('p', { text: ch.intro }),
          ch.askPerson ? h('p', { class: 'modal-note', text: '日付を変えた回です。戻す人には、来られるか本人に確認してください' }) : null]
          .concat(ch.groups.map(function (g) {
            return h('div', { class: 'choose-group' }, [h('h3', { text: g.title })].concat(g.items.map(function (it) {
              var c = h('input', { type: 'checkbox', class: 'check' });
              boxes.push({ key: g.key, id: it.id, el: c });
              return h('label', { class: 'choice' }, [c, ' ' + it.label]);
            })));
          }))
          .concat(ch.groups.length ? [] : [h('p', { class: 'sub', text: '戻せる記録はありません（回だけ元に戻します）' })])
          .concat(ch.rest.map(function (l) { return h('p', { class: 'sub', text: l }); })));
        // 満席の回へ振替を戻すとき、定員を超えても戻すかを選ぶ（04a 中7）
        var over = h('input', { type: 'checkbox', class: 'check' });
        if (ch.groups.some(function (g) { return g.key === 'makeupIds'; })) el.appendChild(h('label', { class: 'choice' }, [over, ' 行く回が満席でも、定員を超えて振替を戻す']));
        return { el: el, body: h('div', {}), hideLines: true, collect: function () {
          var o = { absenceIds: [], makeupIds: [], ticketIds: [] };
          boxes.forEach(function (b) { if (b.el.checked) o[b.key].push(b.id); });
          if (over.checked) o.allowOverCapacity = true;
          return o;
        } };
      },
      onDone: afterContacts(again) });
  }

  function renumber(s, again) {
    ui.formModal({ title: '回番号を変える: ' + sLabel(s), okLabel: '変える',
      intro: '振替が入っている回は変えられません。カレンダーの予定名も変わります。次の画面で連絡が要る人を確かめてから確定します',
      fields: [{ key: 'number', label: '新しい回番号', type: 'number', value: s.number }],
      check: function (v) { return /^[1-9]\d*$/.test(String(v.number).trim()) ? { args: { sessionId: s.id, number: String(v.number).trim() } } : { error: '回番号を1以上の数で入れてください' }; },
      onOk: function (args, b, m) { ui.write('session.renumber', args, { button: b, title: '回番号の変更の影響', onDone: ui.closing(m, afterContacts(again)) }); } });
  }

  App.screens.schedule = function (view) { render(view); };
})(window);
