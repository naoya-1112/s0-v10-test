/**
 * student.js — 生徒一覧・生徒の詳細（S1-31）と在籍の操作（S1-32）。スタッフだけ。design 8-1・6-5・7-6。
 * 一覧（名前で探す・非表示も見る）→ 詳細（基本情報・在籍の時系列・退会・専用リンク・完全削除）。
 * 取り消しにくい操作（休止・退会・退会の取消・在籍の訂正・完全削除）はサーバーの確認画面（影響の一覧）を出してから確定する。
 * 確認画面を返さない操作（1クラス終了・予定の確定）は、画面で確認ダイアログを出してから送る。
 */
(function (root) {
  'use strict';
  var App = root.App, core = App.core, A = App.admin, h = App.ui.h, ui = App.ui;
  var state = { studentId: '', q: '', hidden: false };
  var ref = { classes: [], courses: [] };

  function loadRef() {
    return Promise.all([ui.read('class.list', {}), ui.read('course.list', {})]).then(function (r) {
      ref.classes = (r[0] && r[0].classes) || [];
      ref.courses = (r[1] && r[1].courses) || [];
    });
  }
  function today() { return core.todayJst(); }
  function months(before, after) { return A.monthOptions(today(), before, after); }
  function classOptions(filter, blank) {
    var co = A.byId(ref.courses);
    var list = ref.classes.filter(function (c) { return c.hidden !== '1' && (!filter || filter(c)); })
      .sort(function (a, b) { return (b.term + a.label) < (a.term + b.label) ? -1 : 1; });
    return (blank ? [{ value: '', label: blank }] : []).concat(list.map(function (c) { return { value: c.id, label: A.classLabel(c, co) }; }));
  }

  /* ---------- 一覧 ---------- */

  function renderList(view) {
    ui.clear(view);
    view.appendChild(h('h1', { text: '生徒' }));
    var q = h('input', { type: 'search', class: 'input', placeholder: '名前・ふりがなの一部', value: state.q, 'aria-label': '名前で探す' });
    var hid = h('input', { type: 'checkbox', class: 'check' });
    hid.checked = state.hidden;
    var add = h('button', { class: 'btn primary', type: 'button', text: '＋ 新しい生徒を登録', on: { click: function () { editStudent(view, null); } } });
    var list = h('div', { class: 'loading', text: '読み込み中…' });
    view.appendChild(h('div', { class: 'toolbar np' }, [h('label', { class: 'field inline' }, [h('span', { text: '名前で探す' }), q]),
      h('label', { class: 'choice' }, [hid, ' 非表示の生徒も見る']), add]));
    view.appendChild(list);
    var data = [];
    var draw = function () {
      ui.clear(list); list.className = '';
      var rows = A.filterStudents(data, state.q);
      list.appendChild(h('p', { class: 'sub', text: rows.length + ' 人' }));
      if (!rows.length) { list.appendChild(h('p', { class: 'empty', text: '当てはまる生徒はいません' })); return; }
      rows.forEach(function (s) {
        list.appendChild(h('div', { class: 'list-row' + (s.hidden ? ' off' : '') }, [
          h('div', { class: 'main' }, [h('strong', { text: s.name }), h('span', { class: 'kana', text: '　' + s.kana }),
            s.hidden ? h('span', { class: 'tag', text: '非表示' }) : null, s.has_link ? null : h('span', { class: 'tag plan', text: 'リンク未発行' })]),
          h('button', { class: 'btn', type: 'button', text: '開く', on: { click: function () { state.studentId = s.id; render(view); } } })]));
      });
    };
    q.addEventListener('input', function () { state.q = q.value; draw(); });
    hid.addEventListener('change', function () { state.hidden = hid.checked; load(); });
    var load = function () {
      ui.read('student.list', { includeHidden: state.hidden }).then(function (d) {
        if (!d) { list.textContent = '読み込めませんでした'; return; }
        data = d.students; draw();
      });
    };
    load();
  }

  function editStudent(view, cur) {
    ui.formModal({ title: cur ? '生徒の情報を直す' : '新しい生徒を登録', okLabel: '保存する',
      fields: A.STUDENT_FIELDS.map(function (f) { return { key: f.key, label: f.label + (f.required ? '（必ず）' : ''), type: f.type, value: cur ? cur[f.key] : '' }; }),
      check: function (v) { return A.studentArgs(cur, v); },
      onOk: function (args, okBtn, m) {
        ui.write('student.save', args, { button: okBtn, onDone: ui.closing(m, function (d) {
          state.studentId = (d.result && d.result.student_id) || state.studentId; render(view);
        }) });
      } });
  }

  /* ---------- 詳細 ---------- */

  function render(view) {
    if (!state.studentId) { renderList(view); return; }
    ui.clear(view);
    var back = h('button', { class: 'btn np', type: 'button', text: '◀ 生徒の一覧へ', on: { click: function () { state.studentId = ''; render(view); } } });
    view.appendChild(h('div', { class: 'toolbar np' }, [back]));
    var body = h('div', { class: 'loading', text: '読み込み中…' });
    view.appendChild(body);
    Promise.all([ui.read('student.get', { studentId: state.studentId }), loadRef()]).then(function (r) {
      var d = r[0];
      ui.clear(body); body.className = '';
      if (!d) { body.textContent = '読み込めませんでした'; return; }
      detail(view, body, d);
    });
  }

  function detail(view, body, d) {
    var s = d.student, again = function () { render(view); };
    body.appendChild(h('h1', {}, [s.name, h('span', { class: 'kana', text: '　' + s.kana }), s.hidden ? h('span', { class: 'tag', text: '非表示' }) : null]));
    // 基本情報
    var info = h('table', { class: 'grid' }, h('tbody', {}, A.STUDENT_FIELDS.filter(function (f) { return f.key !== 'name' && f.key !== 'kana'; }).map(function (f) {
      return h('tr', {}, [h('th', { text: f.label }), h('td', { text: f.type === 'date' && s[f.key] ? core.fmtDate(s[f.key]) : (s[f.key] || '') })]);
    })));
    var hideBtn = h('button', { class: 'btn', type: 'button', text: s.hidden ? '一覧に戻す（非表示をやめる）' : '一覧から隠す（非表示）' });
    hideBtn.addEventListener('click', function () {
      ui.confirmThen(s.hidden ? '一覧に戻しますか' : '一覧から隠しますか',
        [s.hidden ? s.name + ' さんを生徒の一覧に戻します' : s.name + ' さんを生徒の一覧から隠します。記録は消えません（あとで戻せます）'], s.hidden ? '戻す' : '隠す',
        function (okBtn, m) { ui.write(s.hidden ? 'student.unhide' : 'student.hide', { studentId: s.id }, { button: okBtn, onDone: ui.closing(m, again) }); });
    });
    body.appendChild(h('h2', { class: 'section-title', text: '基本情報' }));
    body.appendChild(h('div', { class: 'toolbar np' }, [
      h('button', { class: 'btn', type: 'button', text: '情報を直す', on: { click: function () { editStudent(view, s); } } }), hideBtn]));
    body.appendChild(h('div', { class: 'scroll-x' }, info));

    // 在籍
    body.appendChild(h('h2', { class: 'section-title', text: '在籍（過去〜予定）' }));
    body.appendChild(h('div', { class: 'toolbar np' }, [
      h('button', { class: 'btn primary', type: 'button', text: '＋ 入会（クラスに入る）', on: { click: function () { enroll(s, again); } } }),
      h('button', { class: 'btn danger', type: 'button', text: '退会を記録する', on: { click: function () { withdraw(s, again); } } })]));
    var tl = A.enrollmentTimeline(d.enrollments, ref.classes, ref.courses, today());
    var box = h('div', { class: 'timeline' });
    if (!tl.length) box.appendChild(h('p', { class: 'empty', text: 'まだ在籍はありません。「入会」から入れてください' }));
    tl.forEach(function (e) {
      box.appendChild(h('div', { class: 'list-row' + (e.voided ? ' off' : '') + (e.now ? ' now' : '') }, [
        h('div', { class: 'main' }, [h('strong', { text: e.cls }), h('div', {}, [e.period + '　', h('span', { class: 'tag' + (e.state === '休止' ? ' plan' : ' ok'), text: e.state }),
          e.kind ? h('span', { class: 'tag', text: e.kind }) : null]),
          e.badges.length ? h('div', { class: 'sub', text: e.badges.join('・') }) : null]),
        h('div', { class: 'row-actions np' }, e.actions.map(function (a) { return actionButton(a, e.raw, s, again); }))]));
    });
    body.appendChild(box);

    // 退会
    var ws = A.withdrawalRows(d.withdrawals);
    if (ws.length) {
      body.appendChild(h('h2', { class: 'section-title', text: '退会の記録' }));
      ws.forEach(function (w) {
        body.appendChild(h('div', { class: 'list-row' + (w.active ? '' : ' off') }, [
          h('div', { class: 'main' }, [w.text, w.state ? h('span', { class: 'tag', text: w.state }) : null]),
          w.active ? h('button', { class: 'btn np', type: 'button', text: '退会を取り消す', on: { click: function () { withdrawVoid(w, s, again); } } }) : null]));
      });
    }

    // 券の台帳・カルテ（S1-35a で足したつなぎ）
    body.appendChild(h('h2', { class: 'section-title', text: '振替券・振替・カルテ' }));
    body.appendChild(h('div', { class: 'toolbar np' }, [
      h('button', { class: 'btn', type: 'button', text: '振替券の台帳を見る', on: { click: function () { App.go('tickets', s.id); } } }),
      h('button', { class: 'btn', type: 'button', text: '欠席連絡・振替を見る', on: { click: function () { App.go('makeup', s.id); } } }),
      h('button', { class: 'btn', type: 'button', text: 'カルテを見る', on: { click: function () { App.go('notes', s.id); } } })]));

    // 専用リンク
    body.appendChild(h('h2', { class: 'section-title', text: '生徒さんの専用リンク' }));
    var linkOut = h('div', {});
    body.appendChild(h('p', { class: 'sub', text: s.has_link ? '発行済みです。もう一度発行すると、前のリンクは使えなくなります（なくした・他の人に知られたときに使います）'
      : 'まだ発行していません。発行すると、生徒さんが欠席連絡や振替を自分でできるリンクができます' }));
    body.appendChild(h('div', { class: 'toolbar np' }, [h('button', { class: 'btn', type: 'button', text: s.has_link ? 'リンクを発行し直す' : 'リンクを発行する',
      on: { click: function () { issueLink(s, linkOut); } } })]));
    body.appendChild(linkOut);

    // 完全削除
    body.appendChild(h('div', { class: 'danger-zone np' }, [h('h2', { text: '完全削除（元に戻せません）' }),
      h('p', { text: 'この生徒の記録（在籍・出欠・振替・カルテなど）を全部消します。退会しただけの人には使わないでください（退会は「退会を記録する」）。' }),
      h('button', { class: 'btn danger', type: 'button', text: '完全削除へ進む', on: { click: function () { hardDelete(view, s); } } })]));
  }

  /* ---------- リンク ---------- */

  function issueLink(s, out) {
    ui.confirmThen(s.has_link ? 'リンクを発行し直しますか' : 'リンクを発行しますか',
      s.has_link ? ['新しいリンクを作ります', '前のリンクは使えなくなります。生徒さんに新しいリンクを送り直してください'] : ['新しいリンクを作ります'], '発行する',
      function (okBtn, m) {
        ui.write('link.issue', { studentId: s.id }, { button: okBtn, onDone: function (d) {
          m.close();
          ui.clear(out);
          var tok = d.result && d.result.token;
          if (!tok) { out.appendChild(h('p', { class: 'error-text', text: 'リンクを表示できませんでした（通信のやり直しで返ってきたため）。もう一度「発行し直す」を押してください' })); return; }
          var url = A.linkUrl((root.APP_CONFIG || {}).studentUrl, tok);
          out.appendChild(h('p', { text: 'この画面を閉じると二度と表示できません。今すぐ生徒さんに送ってください。' }));
          out.appendChild(h('p', { class: 'token', text: url || tok }));
          if (!url) out.appendChild(h('p', { class: 'hint', text: '生徒さん画面のURLが設定されていないため、記号だけ出しています（config.js の studentUrl）' }));
          if (root.navigator && root.navigator.clipboard) {
            out.appendChild(h('button', { class: 'btn np', type: 'button', text: 'コピーする', on: { click: function () {
              root.navigator.clipboard.writeText(url || tok).then(function () { ui.toast('コピーしました'); }, function () { ui.toast('コピーできませんでした。長押しで選んでください', 'error'); });
            } } }));
          }
        } });
      });
  }

  /* ---------- 完全削除（確認2回＋氏名入力・T-43） ---------- */

  function hardDelete(view, s) {
    ui.openModal({ title: '本当に完全削除しますか（1回目の確認）', danger: true, okLabel: '影響を確かめる',
      lines: [s.name + ' さんの記録を全部消します', '消した後は元に戻せません（変更履歴にも残りません）', '退会した人の記録を残したいときは、ここでやめてください'],
      onOk: function (_, okBtn) {
        var input = h('input', { type: 'text', class: 'input', placeholder: s.name });
        ui.write('student.delete', { studentId: s.id }, { button: okBtn, title: '消える記録（2回目の確認）', danger: true, okLabel: '完全に削除する',
          confirmExtra: function () {
            return { el: h('label', { class: 'field' }, [h('span', { text: '確かめのため、生徒の名前「' + s.name + '」をそのまま入れてください' }), input]),
              valid: function () { return A.sameName(input.value, s.name); }, collect: function () { return { nameTyped: input.value }; } };
          },
          onDone: function () { ui.toast('完全に削除しました'); state.studentId = ''; render(view); } });
      } });
  }

  /* ---------- 在籍の操作（S1-32） ---------- */

  var LABEL = { move: '移動', pause: '休止', end: '1クラス終了', resume: '復帰', confirm: '予定を確定', correct: '訂正' };
  function actionButton(a, e, s, again) {
    var fn = { move: move, pause: pause, end: endClass, resume: resume, confirm: confirmPlanned, correct: correct }[a];
    return h('button', { class: 'btn small', type: 'button', text: LABEL[a], on: { click: function () { fn(e, s, again); } } });
  }
  var FIXED = { key: 'fixed', label: '確定か予定か', type: 'radio', value: 'confirmed',
    options: [{ value: 'confirmed', label: '確定' }, { value: 'planned', label: '予定（あとで確定する）' }] };
  var cname = function (id) { return A.classLabel(A.byId(ref.classes)[id], A.byId(ref.courses)); };

  function enroll(s, again) {
    ui.formModal({ title: '入会（クラスに入る）', okLabel: '入会する',
      fields: [{ key: 'classId', label: 'クラス', type: 'select', options: classOptions(null, 'クラスを選んでください') },
        { key: 'fromMonth', label: '何月から', type: 'select', options: months(3, 15), value: today().slice(0, 7) },
        { key: 'toMonth', label: '何月まで（決まっていなければ空のまま）', type: 'select', options: [{ value: '', label: '決まっていない' }].concat(months(0, 24)) }, FIXED],
      check: function (v) { return v.classId ? { args: { studentId: s.id, classId: v.classId, fromMonth: v.fromMonth, toMonth: v.toMonth || undefined, fixed: v.fixed } } : { error: 'クラスを選んでください' }; },
      onOk: function (args, okBtn, m) { ui.write('enroll', args, { button: okBtn, onDone: ui.closing(m, again) }); } });
  }

  function move(e, s, again) {
    ui.formModal({ title: '別のクラスへ移動', intro: '今のクラス: ' + cname(e.class_id), okLabel: '移動する',
      fields: [{ key: 'classId', label: '移動先のクラス', type: 'select', options: classOptions(function (c) { return c.id !== e.class_id; }, 'クラスを選んでください') },
        { key: 'fromMonth', label: '移動先に何月から来るか', type: 'select', options: months(1, 15), value: core.addMonths(today().slice(0, 7), 1) }, FIXED],
      check: function (v) { return v.classId ? { args: { enrollmentId: e.id, classId: v.classId, fromMonth: v.fromMonth, fixed: v.fixed } } : { error: '移動先のクラスを選んでください' }; },
      onOk: function (args, okBtn, m) { ui.write('move', args, { button: okBtn, onDone: ui.closing(m, again) }); } });
  }

  function pause(e, s, again) {
    ui.formModal({ title: '休止', intro: cname(e.class_id) + ' をお休みします。次の画面で影響（取り消す予定・振替）を確かめてから確定します', okLabel: '影響を確かめる',
      fields: [{ key: 'fromMonth', label: '何月から休むか', type: 'select', options: months(1, 12), value: core.addMonths(today().slice(0, 7), 1) }],
      check: function (v) { return { args: { enrollmentId: e.id, fromMonth: v.fromMonth } }; },
      onOk: function (args, okBtn, m) { ui.write('pause', args, { button: okBtn, title: '休止の影響', names: names(s), onDone: ui.closing(m, again) }); } });
  }

  function resume(e, s, again) {
    var fields = function (month) {
      var rc = A.resumeChoices(e, month, ref.classes);
      return rc;
    };
    var startMonth = today().slice(0, 7);
    var rc0 = fields(startMonth);
    ui.formModal({ title: '復帰', okLabel: '復帰する',
      intro: '休んでいたクラス: ' + cname(e.class_id) + '。休んでいたクラスが終わっているときは、戻る月に開いているクラスを選んでください',
      fields: [{ key: 'month', label: '何月から戻るか', type: 'select', options: months(1, 15), value: startMonth },
        { key: 'classId', label: '戻るクラス', type: 'select', value: rc0.defaultId,
          options: classOptions(null, '戻るクラスを選んでください') }, FIXED],
      check: function (v) {
        var rc = fields(v.month);
        if (!v.classId && rc.mustChoose) return { error: '休んでいたクラスは ' + core.fmtMonth(v.month) + ' には開いていません。戻るクラスを選んでください' };
        var cls = A.byId(ref.classes)[v.classId || e.class_id];
        if (cls && !A.inOpen(cls, v.month)) return { error: '選んだクラスは ' + core.fmtMonth(v.month) + ' には開いていません（' + core.fmtMonth(cls.open_from) + '〜' + core.fmtMonth(cls.open_to) + '）' };
        return { args: { pausedId: e.id, month: v.month, classId: v.classId || undefined, fixed: v.fixed } };
      },
      onOk: function (args, okBtn, m) { ui.write('resume', args, { button: okBtn, onDone: ui.closing(m, again) }); } });
  }

  function endClass(e, s, again) {
    ui.formModal({ title: '1クラス終了', intro: cname(e.class_id) + ' をやめます（他のクラスや生徒の登録はそのまま）', okLabel: '次へ',
      fields: [{ key: 'month', label: '最後に来る月', type: 'select', options: months(1, 12), value: today().slice(0, 7) }],
      check: function (v) { return { args: { enrollmentId: e.id, month: v.month } }; },
      onOk: function (args, okBtn, m) {
        m.close();
        ui.confirmThen('1クラス終了の確認', [cname(e.class_id) + ' は ' + core.fmtMonth(args.month) + ' で終わりです',
          'その後の予定の在籍は取り消します', '使っていない振替券は ' + core.fmtMonth(args.month) + ' の末日まで使えます', 'この操作は「訂正」で直せますが、自動では戻りません'],
        '終了する', function (b2, m2) { ui.write('end_class', args, { button: b2, onDone: ui.closing(m2, again) }); });
      } });
  }

  function confirmPlanned(e, s, again) {
    ui.confirmThen('予定を確定しますか', [cname(e.class_id) + '（' + core.fmtMonth(e.from_month) + 'から）の予定を確定します'], '確定する',
      function (okBtn, m) { ui.write('enrollment.confirm', { enrollmentId: e.id }, { button: okBtn, onDone: ui.closing(m, again) }); });
  }

  function correct(e, s, again) {
    ui.formModal({ title: '在籍の訂正（間違いを直す）', okLabel: '影響を確かめる',
      intro: '入れ間違いを直すときに使います。移動・休止・終了は、それぞれのボタンを使ってください。次の画面で影響を確かめてから確定します',
      fields: [{ key: 'from_month', label: 'はじめの月', type: 'select', options: months(24, 15), value: e.from_month },
        { key: 'to_month', label: '終わりの月', type: 'select', options: [{ value: '', label: '決まっていない' }].concat(months(24, 24)), value: e.to_month || '' },
        { key: 'class_id', label: 'クラス', type: 'select', options: classOptions(null), value: e.class_id },
        { key: 'state', label: '状態', type: 'radio', value: e.state, options: [{ value: 'enrolled', label: '在籍' }, { value: 'paused', label: '休止' }] }],
      check: function (v) { return A.correctPatch(e, v); },
      onOk: function (args, okBtn, m) { ui.write('enrollment.correct', args, { button: okBtn, title: '訂正の影響', names: names(s), onDone: ui.closing(m, again) }); } });
  }

  function withdraw(s, again) {
    ui.formModal({ title: '退会', okLabel: '影響を確かめる', danger: true,
      intro: '退会は「この月から来ない」月を選びます。次の画面で、終わる在籍・取り消す予約・券を確かめてから確定します',
      fields: [{ key: 'applyMonth', label: '何月から来ないか（退会の月）', type: 'select', options: months(2, 12), value: core.addMonths(today().slice(0, 7), 1) },
        { key: 'receivedOn', label: '退会の連絡を受けた日', type: 'date', value: today() }],
      check: function (v) { return { args: { studentId: s.id, applyMonth: v.applyMonth, receivedOn: v.receivedOn || undefined } }; },
      onOk: function (args, okBtn, m) {
        ui.write('withdraw', args, { button: okBtn, title: '退会の影響', names: names(s), reasonLabel: '退会の理由（分かれば）', okLabel: '退会を確定する', danger: true,
          onDone: ui.closing(m, function () { ui.toast('退会を記録しました。「連絡が要る人」も確かめてください'); again(); }) });
      } });
  }

  function withdrawVoid(w, s, again) {
    // 理由は1回目の呼び出しから要る（plan_withdrawVoid）ので、先に入れてもらう
    ui.formModal({ title: '退会の取消', intro: w.text, okLabel: '影響を確かめる',
      fields: [{ key: 'reason', label: '取り消す理由（必ず）', type: 'textarea' }],
      check: function (v) { return v.reason.trim() ? { args: { withdrawalId: w.id, reason: v.reason.trim() } } : { error: '取り消す理由を入れてください' }; },
      onOk: function (args, okBtn, m) {
        ui.write('withdraw.void', args, { button: okBtn, title: '退会の取消（戻らないものの一覧）', names: names(s), okLabel: '退会を取り消す',
          confirmNote: '在籍・予約・券は自動では戻りません。下の一覧を見て、必要なら在籍の「訂正」や「入会」で直してください',
          onDone: ui.closing(m, again) });
      } });
  }

  function names(s) { var o = {}; o[s.id] = s.name; return o; }

  App.screens.students = function (view) {
    var f = App.takeFocus ? App.takeFocus() : '';
    if (f) state.studentId = f;
    render(view);
  };
})(window);
