/**
 * continuation.js — 継続確認・一括移行（S1-36・design 7-7・8-1・R-23〜R-25・R-59）。スタッフだけ。
 * 在籍の行1つずつ結論（継続・移動・このクラスだけ終了・休止）を選んで確定する。継続・移動・終了は画面の確認ダイアログ
 * （サーバーは1回で確定・尚哉 10/4）、休止はサーバーの影響の一覧。移動予定がある行は生徒の画面で予定を確定してから。
 * 下に「休止中の人（参考）」（結論は求めない）と、次期への一括移行（対象をサーバーで確かめてから一括で確定）。
 */
(function (root) {
  'use strict';
  var App = root.App, core = App.core, O = App.ops, A = App.admin, h = App.ui.h, ui = App.ui;
  var ref = { classes: [], courses: [], names: {} };

  function render(view0) {
    var view = ui.stage(view0);   // 出し直しの間も今の画面を出したまま（尚哉 10/4①）
    view.appendChild(h('h1', { text: '継続確認' }));
    view.appendChild(h('p', { class: 'sub', text: 'クラスが終わる月の1日から、ここに出ます。結論を入れるまで消えません。退会の人は生徒の画面の「退会を記録する」を使ってください' }));
    var body = h('div', { class: 'loading', text: '読み込み中…' });
    view.appendChild(body);
    Promise.all([ui.read('continuation.rows', {}), ui.read('class.list', {}), ui.read('course.list', {}), ui.read('student.list', { includeHidden: true })]).then(function (r) {
      ui.clear(body); body.className = '';
      if (!r[0]) { body.textContent = '読み込めませんでした'; return; }
      ref.classes = (r[1] && r[1].classes) || [];
      ref.courses = (r[2] && r[2].courses) || [];
      ref.names = {};
      ((r[3] && r[3].students) || []).forEach(function (s) { ref.names[s.id] = s.name; });
      var v = O.continuationView(r[0], ref.classes, ref.courses, ref.names), again = function () { render(view0); };
      body.appendChild(h('p', { class: 'sub', text: 'まだ結論が入っていない人 ' + v.rows.length + ' 人' }));
      if (!v.rows.length) body.appendChild(h('p', { class: 'empty', text: '継続確認が要る人はいません' }));
      v.rows.forEach(function (row) {
        var acts = row.move_planned
          ? [h('span', { class: 'tag plan', text: '移動予定あり（確定待ち）' }), h('button', { class: 'btn small', type: 'button', text: '生徒の画面で予定を確定する', on: { click: function () { App.go('students', row.student_id); } } })]
          : [h('button', { class: 'btn primary', type: 'button', text: '結論を入れる', on: { click: function () { decide(row, again); } } })];
        body.appendChild(h('div', { class: 'list-row' }, [h('div', { class: 'main' }, [h('strong', { text: row.name }), h('div', { text: row.cls }),
          h('div', { class: 'sub', text: row.end + 'で終わり → ' + row.sw + 'からどうするか' })]), h('div', { class: 'row-actions np' }, acts)]));
      });
      body.appendChild(h('h2', { class: 'section-title', text: '休止中の人（参考・結論は要りません）' }));
      if (!v.paused.length) body.appendChild(h('p', { class: 'empty', text: '休止中の人はいません' }));
      v.paused.forEach(function (p) { body.appendChild(h('div', { class: 'list-row off' }, [h('div', { class: 'main' }, [h('strong', { text: p.name }), '　' + p.cls + '　' + p.period])])); });
      rollover(body, again);
    });
  }

  function decide(row, again) {
    var co = A.byId(ref.courses), cl = A.byId(ref.classes);
    var labelOf = function (id) { return A.classLabel(cl[id], co); };
    ui.formModal({ title: row.name + ' さんの結論', okLabel: '次へ', intro: row.cls + ' は ' + row.end + ' で終わります。' + row.sw + 'からどうするかを選んでください（継続は同じコースだけ・別のコースは移動。★はおすすめの次のコース）',
      fields: [{ key: 'conclusion', label: '結論', type: 'radio', value: '', options: Object.keys(O.CONCL).map(function (k) { return { value: k, label: O.CONCL[k] }; }) },
        { key: 'contClassId', label: '次のクラス（同じコースで' + row.sw + 'に開いているクラス）', type: 'select', options: [{ value: '', label: row.contOptions.length ? 'クラスを選んでください' : '同じコースで開いているクラスがありません（別のコースへは「移動」）' }].concat(row.contOptions),
          show: function (v) { return v.conclusion === 'continue'; } },
        { key: 'classId', label: '次のクラス（' + row.sw + 'に開いているクラス）', type: 'select', options: [{ value: '', label: row.options.length ? 'クラスを選んでください' : '開いているクラスがありません（先にクラスを作ってください）' }].concat(row.options),
          show: function (v) { return v.conclusion === 'move'; } },
        { key: 'month', label: '何月から休むか', type: 'select', options: A.monthOptions(core.todayJst(), 0, 12), value: row.switch_month, show: function (v) { return v.conclusion === 'pause'; } }],
      check: function (v) { return O.decideArgs(row, v, labelOf); },
      onOk: function (args, okBtn, m) {
        var r = O.decideArgs(row, { conclusion: args.conclusion, classId: args.classId, month: args.month }, labelOf);
        if (!r.lines) { ui.write('continuation.decide', args, { button: okBtn, title: '休止の影響', okLabel: '休止を確定する', onDone: ui.closing(m, again) }); return; }
        m.close();
        ui.confirmThen('結論の確認', r.lines, '確定する', function (b2, m2) { ui.write('continuation.decide', args, { button: b2, onDone: ui.closing(m2, again) }); }, m);   // ◀ 入力に戻る（直し第4弾 1(a)）
      } });
  }

  /** 次期への一括移行（期間なし・1年コースの在籍を次の期へ続ける。対象はサーバーが毎回計算し、確認画面で見せる） */
  function rollover(body, again) {
    body.appendChild(h('h2', { class: 'section-title', text: '次期への一括移行' }));
    body.appendChild(h('p', { class: 'sub', text: '1. 次期のクラスを「クラスと日程」で作る → 2. 下で期を選んで対象者を確かめる → 3. 一括で確定。2回押しても重なりません（移行した人は継続確認からも消えます）' }));
    var ts = A.terms(ref.classes);
    if (ts.length < 2) { body.appendChild(h('p', { class: 'empty', text: '期が2つ以上ありません。先に次期のクラスを作ってください' })); return; }
    var opts = ts.map(function (t) { return { value: t, label: core.fmtMonth(t) + '期' }; });
    body.appendChild(h('div', { class: 'toolbar np' }, [h('button', { class: 'btn', type: 'button', text: '一括移行の対象を確かめる', on: { click: function () {
      var co = A.byId(ref.courses);
      ui.formModal({ title: '次期への一括移行', okLabel: '対象を確かめる',
        fields: [{ key: 'fromTerm', label: '今の期', type: 'select', options: opts, value: ts[1] }, { key: 'toTerm', label: '次の期', type: 'select', options: opts, value: ts[0] },
          // 移行元のクラスは「今の期」のクラスだけ（U-31）。今の期を変えると選択肢も変わる
          { key: 'classId', label: '移行元のクラス（空なら全部）', type: 'select', options: function (v) {
            return [{ value: '', label: v.fromTerm ? core.fmtMonth(v.fromTerm) + '期の全部のクラス' : '全部のクラス' }].concat(ref.classes.filter(function (c) { return !v.fromTerm || c.term === v.fromTerm; })
              .map(function (c) { return { value: c.id, label: A.classLabel(c, co) }; }));
          } }],
        check: function (v) { return O.rolloverArgs(v); },
        onOk: function (args, okBtn, m) { ui.write('rollover', args, { button: okBtn, title: '一括移行の対象（確かめてから確定）', okLabel: '一括で確定する', onDone: ui.closing(m, again) }); } });
    } } })]));
  }

  App.screens.continuation = function (view) { render(view); };
})(window);
