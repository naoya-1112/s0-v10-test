/**
 * settings.js — 設定画面（S1-28・design 8-1）: 教室名・カレンダー・定員の初期値／アカウント（追加・役割・共用・無効・
 * Googleアカウントの結び付けを外す＝人やアカウントが替わるとき・5-1）／カレンダー反映の失敗と「もう一度反映」／版を戻した後の「削除の再確認」。スタッフだけ。
 */
(function (root) {
  'use strict';
  var App = root.App, A = App.admin, h = App.ui.h, ui = App.ui;

  function render(view) {
    ui.clear(view);
    view.appendChild(h('h1', { text: '設定' }));
    var again = function () { render(view); };
    var secS = h('div', { class: 'loading', text: '読み込み中…' }), secA = h('div', {}), secC = h('div', {});
    view.appendChild(h('h2', { class: 'section-title', text: '教室の設定' }));
    view.appendChild(secS);
    view.appendChild(h('h2', { class: 'section-title', text: 'アカウント（ログインできる人・記録者）' }));
    view.appendChild(secA);
    view.appendChild(h('h2', { class: 'section-title', text: 'カレンダーへの反映' }));
    view.appendChild(secC);
    view.appendChild(h('h2', { class: 'section-title', text: '版を戻した後の「削除の再確認」' }));
    view.appendChild(h('p', { class: 'sub', text: 'スプレッドシートの版を戻した後に1回だけ押します。完全削除した生徒が戻っていれば消し直し、発行し直したリンクが戻っていれば「再発行が要る」に出します。ふだんは押さなくて大丈夫です' }));
    view.appendChild(h('div', { class: 'toolbar' }, [h('button', { class: 'btn', type: 'button', text: '削除の再確認をする', on: { click: function () {
      ui.confirmThen('削除の再確認をしますか', ['版を戻した後に使う操作です', '完全削除した人の記録が戻っていれば、もう一度消します'], '再確認する', function (b, m) {
        ui.write('restore.recheck', {}, { button: b, onDone: ui.closing(m, function (d) {
          var r = d.result || {};
          ui.toast('再確認しました' + (r.deleted && r.deleted.length ? '（消し直した人 ' + r.deleted.length + '人）' : '') +
            (r.needReissue && r.needReissue.length ? '（リンクの再発行が要る人 ' + r.needReissue.length + '人）' : ''), 'ok');
        }) });
      });
    } } })]));

    ui.read('settings.get', {}).then(function (d) {
      ui.clear(secS); secS.className = '';
      if (!d) { secS.textContent = '読み込めませんでした'; return; }
      var cur = d.settings || {};
      secS.appendChild(h('table', { class: 'grid' }, h('tbody', {}, [
        ['教室名', cur.classroom_name], ['カレンダーID', cur.calendar_id || '（未設定＝カレンダーに書きません）'], ['定員の初期値', cur.default_capacity]
      ].map(function (r) { return h('tr', {}, [h('th', { text: r[0] }), h('td', { text: r[1] || '' })]); }))));
      secS.appendChild(h('div', { class: 'toolbar' }, [h('button', { class: 'btn', type: 'button', text: '教室の設定を直す', on: { click: function () {
        ui.formModal({ title: '教室の設定', okLabel: '保存する',
          fields: [{ key: 'classroom_name', label: '教室名', value: cur.classroom_name },
            { key: 'calendar_id', label: 'カレンダーID', value: cur.calendar_id, hint: 'Googleカレンダーの「設定」→「カレンダーの統合」にある「カレンダーID」をそのまま貼ります' },
            { key: 'default_capacity', label: '定員の初期値', type: 'number', value: cur.default_capacity },
            { key: 'policy_json', label: '詳しい決まり（policy_json）', type: 'textarea', rows: 4, value: cur.policy_json,
              hint: '振替・券の期限などの決まりです。分からないときは触らないでください（間違えると保存しません）' }],
          check: function (v) { return A.settingsArgs(cur, v); },
          onOk: function (args, b, m) { ui.write('settings.save', args, { button: b, onDone: ui.closing(m, again) }); } });
      } } })]));
    });

    ui.read('account.list', {}).then(function (d) {
      if (!d) { secA.textContent = '読み込めませんでした'; return; }
      secA.appendChild(h('div', { class: 'toolbar' }, [h('button', { class: 'btn primary', type: 'button', text: '＋ アカウントを足す', on: { click: function () { editAccount(null, again); } } })]));
      var rows = A.accountRows(d.accounts);
      rows.forEach(function (r, i) {
        var raw = d.accounts[i];
        secA.appendChild(h('div', { class: 'list-row' + (r.active ? '' : ' off') }, [
          h('div', { class: 'main' }, [h('strong', { text: r.name }), h('div', { class: 'sub', text: r.email + '　' + r.role }), r.notes ? h('div', { class: 'sub', text: r.notes }) : null]),
          h('div', { class: 'row-actions' }, [
            h('button', { class: 'btn small', type: 'button', text: '直す', on: { click: function () { editAccount(raw, again); } } }),
            r.canClearSub ? h('button', { class: 'btn small', type: 'button', text: 'Googleの結び付けを外す', on: { click: function () { clearSub(raw, again); } } }) : null,
            r.active ? h('button', { class: 'btn small danger', type: 'button', text: '無効にする', on: { click: function () { disable(raw, again); } } })
              : h('button', { class: 'btn small', type: 'button', text: '有効に戻す', on: { click: function () {
                ui.write('account.save', { id: raw.id, display_name: raw.display_name, role: raw.role, email: raw.email, shared: raw.shared, active: true }, { onDone: again });
              } } })])]));
      });
    });

    ui.read('calendar.failures', {}).then(function (d) {
      if (!d) { secC.textContent = '読み込めませんでした'; return; }
      ui.read('class.list', {}).then(function (c) {
        var rows = A.calendarFailureRows(d.sessions, (c && c.classes) || []);
        if (!rows.length) { secC.appendChild(h('p', { class: 'empty', text: 'カレンダーに反映できていない日程はありません' })); return; }
        secC.appendChild(h('p', { text: 'カレンダーに反映できていない日程が ' + rows.length + ' 件あります。名簿の記録は保存できています。' }));
        rows.forEach(function (r) {
          secC.appendChild(h('div', { class: 'list-row' }, [h('div', { class: 'main' }, [r.text, h('span', { class: 'tag' + (r.failed ? ' err' : ''), text: r.state }),
            r.error ? h('div', { class: 'sub', text: r.error }) : null])]));
        });
        var b = h('button', { class: 'btn primary', type: 'button', text: 'もう一度反映する' });
        b.addEventListener('click', function () {
          ui.write('session.resync', { sessionIds: rows.map(function (r) { return r.id; }) }, { button: b, onDone: again });
        });
        secC.appendChild(h('div', { class: 'toolbar' }, [b]));
      });
    });
  }

  function editAccount(cur, again) {
    ui.formModal({ title: cur ? 'アカウントを直す' : 'アカウントを足す', okLabel: '保存する',
      fields: [{ key: 'display_name', label: '表示名（記録者として出る名前）', value: cur ? cur.display_name : '' },
        { key: 'role', label: '役割', type: 'radio', value: cur ? cur.role : 'teacher',
          options: Object.keys(A.ROLE).map(function (k) { return { value: k, label: A.ROLE[k] }; }) },
        { key: 'email', label: 'Googleアカウントのメール', type: 'email', value: cur ? cur.email : '', show: function (v) { return v.role !== 'recorder_only'; },
          hint: 'メールを変えると、Googleアカウントの結び付けも外れます（次にログインした人に結び付きます）' },
        { key: 'shared', label: '共用のアカウント（iPad など。使う人が記録者を選ぶ）', type: 'checkbox', value: cur ? cur.shared : false }],
      check: function (v) { return A.accountArgs(Object.assign({ id: cur && cur.id, active: cur ? cur.active : true }, v)); },
      onOk: function (args, b, m) { ui.write('account.save', args, { button: b, onDone: ui.closing(m, again) }); } });
  }

  function clearSub(a, again) {
    ui.confirmThen('Googleアカウントの結び付けを外しますか', [a.display_name + '（' + a.email + '）の結び付けを外します',
      '使う人やGoogleアカウントが替わったときに使います', '外した後、最初にこのメールでログインしたGoogleアカウントに結び付きます'], '外す',
    function (b, m) { ui.write('account.clear_sub', { id: a.id }, { button: b, onDone: ui.closing(m, again) }); });
  }

  function disable(a, again) {
    ui.confirmThen('このアカウントを無効にしますか', [a.display_name + ' はログインできなくなります（今ログインしている端末も、次の操作で止まります）', 'あとで「有効に戻す」でき、記録は消えません'], '無効にする',
      function (b, m) { ui.write('account.disable', { id: a.id }, { button: b, onDone: ui.closing(m, again) }); });
  }

  App.screens.settings = function (view) { render(view); };
})(window);
