/**
 * ui.js — 画面の共通部品（design 8-3）: 要素づくり・お知らせ（トースト）・確認画面（6-5）・理由の入力・書き込みボタン（受付番号）・印刷。
 * 書き込みはボタンを押した瞬間に受付番号を作り、結果が返るまでボタンを押せなくする（T-31）。
 * relogin のときは入力と受付番号を残し、ログインし直した後に同じ受付番号で送り直せる（5-1）。
 */
(function (root) {
  'use strict';
  var App = root.App, core = App.core, doc = root.document;

  /** 要素を作る。attrs: {class, text, on:{click:…}, …}。children: 要素・文字・配列 */
  function h(tag, attrs, children) {
    var el = doc.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'on') Object.keys(v).forEach(function (ev) { el.addEventListener(ev, v[ev]); });
      else if (k in el && k !== 'list' && k !== 'type') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    [].concat(children === undefined ? [] : children).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? doc.createTextNode(String(c)) : c);
    });
    return el;
  }
  function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; }

  /** お知らせ。kind: ok / warn / error。error は閉じるまで残す */
  var toastTimer = null;
  function toast(msg, kind) {
    var box = doc.getElementById('toast');
    if (!box) return;
    clear(box);
    box.className = 'toast show ' + (kind || 'ok');
    box.appendChild(h('span', { text: msg }));
    box.appendChild(h('button', { class: 'btn small', type: 'button', text: '閉じる', on: { click: function () { box.className = 'toast'; } } }));
    if (toastTimer) clearTimeout(toastTimer);
    if (kind !== 'error') toastTimer = setTimeout(function () { box.className = 'toast'; }, 6000);
  }

  /** 画面の上の帯（再読み込みのお願い・送り直し等）。actions: [{label, onClick}] */
  function banner(msg, actions, kind) {
    var box = doc.getElementById('banner');
    if (!box) return;
    clear(box);
    if (!msg) { box.hidden = true; return; }
    box.hidden = false;
    box.className = 'banner np ' + (kind || 'warn');
    box.appendChild(h('span', { text: msg }));
    (actions || []).forEach(function (a) { box.appendChild(h('button', { class: 'btn', type: 'button', text: a.label, on: { click: a.onClick } })); });
  }

  /**
   * 確認画面（6-5）。o: {title, lines, note?, reasonLabel?, reasonRequired?, okLabel?, onOk(reason)}。
   * 理由が必須の操作は、空のとき確定ボタンを押せない（8-3）。戻り値 {close, update(lines, note)}
   */
  function openModal(o) {
    var wrap = doc.getElementById('modal');
    clear(wrap);
    wrap.hidden = false;
    var list = h('ul', { class: 'confirm-list' });
    var noteEl = h('p', { class: 'modal-note' });
    var fill = function (lines, note) {
      clear(list);
      (lines || []).forEach(function (l) { list.appendChild(h('li', { text: l })); });
      if (!lines || !lines.length) list.appendChild(h('li', { text: '影響する記録はありません' }));
      noteEl.textContent = note || '';
      noteEl.hidden = !note;
    };
    var reason = null;
    if (o.reasonLabel) reason = h('textarea', { class: 'reason', rows: 3, placeholder: o.reasonRequired ? '（必ず書いてください）' : '（任意）' });
    var ok = h('button', { class: 'btn primary big', type: 'button', text: o.okLabel || 'この内容で確定する' });
    var sync = function () { ok.disabled = !!(o.reasonRequired && reason && !reason.value.trim()); };
    if (reason) reason.addEventListener('input', function () { sync(); });   // 下で extra つきの sync に差し替えるため、呼ぶときに引く
    sync();
    // extra: 確認画面に足す入力（氏名の入力・戻すものの選択など）。{el, valid?()}。valid が false の間は確定を押せない
    var extra = o.extra || null;
    sync = function () {
      ok.disabled = !!(o.reasonRequired && reason && !reason.value.trim()) || !!(extra && extra.valid && !extra.valid());
    };
    if (extra && extra.el) { extra.el.addEventListener('input', sync); extra.el.addEventListener('change', sync); }
    sync();
    var close = function () { wrap.hidden = true; clear(wrap); };
    ok.addEventListener('click', function () { if (!ok.disabled) o.onOk(reason ? reason.value.trim() : '', ok); });
    var box = h('div', { class: 'modal-box' + (o.danger ? ' danger' : ''), role: 'dialog', 'aria-modal': 'true' }, [
      h('h2', { text: o.title || '確認してください' }), noteEl, o.body || list, extra ? extra.el : null,
      reason ? h('label', { class: 'field' }, [h('span', { text: o.reasonLabel }), reason]) : null,
      h('div', { class: 'modal-actions' }, [h('button', { class: 'btn big', type: 'button', text: 'やめる', on: { click: close } }), ok])
    ]);
    if (!o.body) fill(o.lines, o.note);
    wrap.appendChild(box);
    return { close: close, update: fill, okButton: ok, sync: sync };
  }

  function busy(btn, on) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.dataset.label || btn.textContent; btn.disabled = true; btn.textContent = '送信中…'; }
    else { btn.disabled = false; if (btn.dataset.label) btn.textContent = btn.dataset.label; }
  }

  /**
   * 書き込み（6-1・8-3）。o: {button?, title?, reasonLabel?, reasonRequired?, onDone(data)}。
   * 押した瞬間に受付番号を作る→返るまでボタンを押せない→失敗は api.js が同じ受付番号で1回再送。
   * 確認が返ったら確認画面（data_version を持って確定時に送る。再確認なら一覧を作り直す）。
   */
  function write(fn, args, o) {
    o = o || {};
    var rid = core.newReceiptId();
    return send(fn, args, rid, o);
  }
  function send(fn, args, rid, o) {
    busy(o.button, true);
    return App.client.call(fn, args, { receiptId: rid }).then(function (r) {
      busy(o.button, false);
      return handle(fn, args, rid, o, r);
    });
  }
  function handle(fn, args, rid, o, r) {
    var d = r.data || {};
    if (r.kind === 'ok') {
      var w = (d.result && d.result.warnings) || [];
      var cal = App.admin ? App.admin.calendarNote(d) : '';
      if (cal) w = w.concat([cal]);
      toast(w.length ? '保存しました（注意: ' + w.join('・') + '）' : (o.doneText || '保存しました'), w.length ? 'warn' : 'ok');
      if (o.onDone) o.onDone(d);
      return d;
    }
    if (r.kind === 'confirm') {
      var lines = core.confirmLines(d.confirm);
      if (o.names) lines = App.admin.withNames(lines, o.names);
      var ex = o.confirmExtra ? o.confirmExtra(d) : null;   // {el, valid?, collect()} 確定の args に足す値
      var m = openModal({ title: o.title || '確認してください', lines: ex && ex.hideLines ? [] : lines, body: ex && ex.body,
        note: d.reconfirm ? d.message : (o.confirmNote || ''), reasonLabel: o.reasonLabel, reasonRequired: o.reasonRequired,
        okLabel: o.okLabel, danger: o.danger, extra: ex,
        onOk: function (reason, okBtn) {
          var a2 = Object.assign({}, args, { confirm: true, version: d.version }, ex && ex.collect ? ex.collect() : {});
          if (o.reasonLabel) a2.reason = reason;
          var rid2 = core.newReceiptId();
          busy(okBtn, true);
          App.client.call(fn, a2, { receiptId: rid2 }).then(function (r2) {
            busy(okBtn, false);
            if (r2.kind === 'confirm') {   // この間に他の変更があった → 最新の一覧で作り直す
              d = r2.data; m.update(core.confirmLines(d.confirm), d.message || 'この間に他の変更がありました。もう一度確認してください');
              return;
            }
            if (r2.kind === 'error') { toast(core.messageFor(r2.data), 'error'); return; }   // 確認画面は閉じない（入れた理由・選んだものを残す）
            m.close();
            handle(fn, a2, rid2, o, r2);
          });
        } });
      return null;
    }
    if (r.kind === 'relogin') {
      App.pending = { fn: fn, args: args, rid: rid, o: o };
      App.auth.needLogin(core.MESSAGES.relogin);
      return null;
    }
    if (r.kind === 'old_client') {
      banner(core.MESSAGES.old_client, [{ label: '再読み込み', onClick: function () { root.location.reload(); } }], 'error');
      return null;
    }
    if (r.kind === 'fail') {
      toast('つながりませんでした（受付番号 ' + rid + '）。もう一度押すと同じ受付番号で送ります', 'error');
      banner('送れなかった操作があります', [{ label: 'もう一度送る', onClick: function () { banner(''); send(fn, args, rid, o); } }]);
      return null;
    }
    if (o.onError && o.onError(d)) return null;   // 画面が自分で出す断り（受付を閉じるときの「直っていない記録」の一覧など）
    toast(core.messageFor(d), 'error');
    return null;
  }

  /** ログインし直した後、残しておいた操作を同じ受付番号で送り直す（5-1） */
  function resendPending() {
    var p = App.pending;
    if (!p) return;
    banner('ログインし直しました。さっきの操作はまだ送れていません', [
      { label: '送り直す', onClick: function () { App.pending = null; banner(''); send(p.fn, p.args, p.rid, p.o); } },
      { label: '送らない', onClick: function () { App.pending = null; banner(''); } }
    ]);
  }

  /** 読むだけの呼び出し。失敗・エラーは文言を出して null */
  function read(fn, args) {
    return App.client.call(fn, args || {}).then(function (r) {
      if (r.kind === 'ok') return r.data;
      if (r.kind === 'relogin') { App.auth.needLogin(core.MESSAGES.relogin); return null; }
      if (r.kind === 'old_client') { banner(core.MESSAGES.old_client, [{ label: '再読み込み', onClick: function () { root.location.reload(); } }], 'error'); return null; }
      toast(r.kind === 'fail' ? core.MESSAGES.network : core.messageFor(r.data), 'error');
      return null;
    });
  }

  /** 印刷の部品（8-3）: 一覧の画面に置く「印刷」ボタン。@media print で操作部品（.np）を隠す */
  function printButton() {
    return h('button', { class: 'btn np', type: 'button', text: '印刷', on: { click: function () { root.print(); } } });
  }

  /** 日付・月を前後に動かす帯（.np） */
  function stepper(label, onPrev, onToday, onNext, todayLabel) {
    return h('div', { class: 'stepper np' }, [
      h('button', { class: 'btn', type: 'button', text: '◀ 前', on: { click: onPrev } }),
      h('strong', { class: 'stepper-label', text: label }),
      h('button', { class: 'btn', type: 'button', text: '次 ▶', on: { click: onNext } }),
      onToday ? h('button', { class: 'btn', type: 'button', text: todayLabel || '今日', on: { click: onToday } }) : null
    ]);
  }


  /**
   * 入力欄を並べる部品（第2弾）。fields: [{key, label, type?: text|date|time|number|select|textarea|checkbox|checks|radio,
   * options?: [{value, label}], value?, hint?, show?(values)}]。戻り値 {el, values(), set(key, v)}
   */
  function form(fields) {
    var box = h('div', { class: 'form' }), inputs = {}, rows = {};
    fields.forEach(function (f) {
      var el, t = f.type || 'text';
      if (t === 'select') {
        el = h('select', { class: 'input' }, (f.options || []).map(function (o) { return h('option', { value: o.value, text: o.label }); }));
        if (f.value !== undefined) el.value = f.value;
      } else if (t === 'textarea') {
        el = h('textarea', { class: 'reason', rows: f.rows || 3 });
        el.value = f.value || '';
      } else if (t === 'checkbox') {
        el = h('input', { type: 'checkbox', class: 'check' });
        el.checked = !!f.value;
      } else if (t === 'checks' || t === 'radio') {
        el = h('div', { class: 'choices' }, (f.options || []).map(function (o) {
          var c = h('input', { type: t === 'radio' ? 'radio' : 'checkbox', name: 'f_' + f.key, value: o.value, class: 'check' });
          c.checked = t === 'radio' ? String(f.value) === String(o.value) : (f.value || []).map(String).indexOf(String(o.value)) >= 0;
          return h('label', { class: 'choice' }, [c, ' ' + o.label]);
        }));
      } else {
        el = h('input', { type: t, class: 'input' });
        if (t === 'number') el.setAttribute('inputmode', 'numeric');
        el.value = f.value === undefined || f.value === null ? '' : f.value;
      }
      inputs[f.key] = { el: el, type: t };
      var lab = t === 'checkbox' ? h('label', { class: 'field' }, [el, ' ' + f.label]) : h('label', { class: 'field' }, [h('span', { text: f.label }), el]);
      if (f.hint) lab.appendChild(h('small', { class: 'hint', text: f.hint }));
      rows[f.key] = lab;
      box.appendChild(lab);
    });
    var values = function () {
      var o = {};
      Object.keys(inputs).forEach(function (k) {
        var x = inputs[k];
        if (x.type === 'checkbox') o[k] = x.el.checked;
        else if (x.type === 'checks') o[k] = [].slice.call(x.el.querySelectorAll('input')).filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
        else if (x.type === 'radio') { var c = [].slice.call(x.el.querySelectorAll('input')).filter(function (c) { return c.checked; })[0]; o[k] = c ? c.value : ''; }
        else o[k] = x.el.value;
      });
      return o;
    };
    var refresh = function () {
      var v = values();
      fields.forEach(function (f) { if (f.show) rows[f.key].hidden = !f.show(v); });
    };
    box.addEventListener('change', refresh);
    refresh();
    return { el: box, values: values, refresh: refresh };
  }

  /** 入力の画面（確認画面と同じ見た目）。o: {title, fields, intro?, okLabel?, check(values) → {error}|{args}, onOk(args, okBtn, modal)} */
  function formModal(o) {
    var f = form(o.fields);
    var err = h('p', { class: 'modal-note', role: 'alert' });
    err.hidden = true;
    var m = openModal({ title: o.title, okLabel: o.okLabel || '次へ', danger: o.danger,
      body: h('div', {}, [o.intro ? h('p', { text: o.intro }) : null, f.el, err]),
      onOk: function (_, okBtn) {
        var r = o.check ? o.check(f.values()) : { args: f.values() };
        if (r.error) { err.textContent = r.error; err.hidden = false; return; }
        err.hidden = true;
        o.onOk(r.args, okBtn, m);
      } });
    return m;
  }

  /** 書き込みの前に、確認画面を開いてから送る（サーバーが確認画面を返さない操作用: 1クラス終了・確定など） */
  function confirmThen(title, lines, okLabel, run) {
    var m = openModal({ title: title, lines: lines, okLabel: okLabel || 'この内容で確定する', onOk: function (_, okBtn) { run(okBtn, m); } });
    return m;
  }

  /** 書き込みが終わったら閉じる onDone を作る */
  function closing(m, then) { return function (d) { if (m) m.close(); if (then) then(d); }; }

  App.ui = { form: form, formModal: formModal, confirmThen: confirmThen, closing: closing, h: h, clear: clear, toast: toast, banner: banner, openModal: openModal, write: write, read: read, resendPending: resendPending,
    printButton: printButton, stepper: stepper, busy: busy };
})(window);
