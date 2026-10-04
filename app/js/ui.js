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
    if (toastTimer && toastTimer.unref) toastTimer.unref();   // テスト（node）で消える待ちのためにプロセスを残さない。ブラウザには unref が無い
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
   * o.back: 「◀ 入力に戻る」を押したときに呼ぶ（入力の画面から開いた確認画面だけ・U-15。直し第4弾で confirmThen・再確認にも）
   * o.reasonValue: 理由の欄に最初から入れておく文（再確認で作り直すとき、入れた理由を残す）
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
    if (o.reasonLabel) { reason = h('textarea', { class: 'reason', rows: 3, placeholder: o.reasonRequired ? '（必ず書いてください）' : '（任意）' }); reason.value = o.reasonValue || ''; }
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
      h('div', { class: 'modal-actions' }, [
        o.back ? h('button', { class: 'btn big modal-back', type: 'button', text: '◀ 入力に戻る', on: { click: o.back } }) : null,
        h('button', { class: 'btn big', type: 'button', text: 'やめる', on: { click: close } }), ok])
    ]);
    if (o.isForm) box._formBox = true;
    if (o.back) box._back = o.back;   // この確認画面から先に開く確認（confirmThen の後のサーバーの確認など）でも同じ入力に戻れる
    if (!o.body) fill(o.lines, o.note);
    wrap.appendChild(box);
    return { close: close, update: fill, okButton: ok, sync: sync, box: box, reason: function () { return reason ? reason.value : ''; } };
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
    return send(fn, args, ridFor(fn, args), o);
  }

  /**
   * 受付番号は「その入力（op＋送る中身）の1回分」に結び付ける（04a 重大2）。ok か業務の断りが返るまで同じ番号を使い回すので、
   * 通信の失敗・処理中のあと、元のボタン・入力画面の保存・帯の「もう一度送る」のどれで押し直しても二重に保存されない。
   * 中身を変えて押したときは別の操作なので新しい番号。
   */
  var unsettled = {};
  function ridKey(fn, args) { try { return fn + '\u0000' + JSON.stringify(args || {}); } catch (e) { return ''; } }
  function ridFor(fn, args) {
    var k = ridKey(fn, args);
    if (k && unsettled[k]) return unsettled[k];
    var rid = core.newReceiptId();
    if (k) unsettled[k] = rid;
    return rid;
  }
  /** 返ってきた結果で、その入力の番号を残すか決める（通信の失敗・処理中・ログインし直しは残す） */
  function settle(fn, args, r) {
    var d = (r && r.data) || {};
    var keep = r && (r.kind === 'fail' || r.kind === 'relogin' || (r.kind === 'error' && d.error === 'processing'));
    if (!keep) delete unsettled[ridKey(fn, args)];
  }
  /** ログアウト・人の切り替えで、送り直し待ちの番号を全部忘れる */
  function forgetUnsettled() { unsettled = {}; }
  function send(fn, args, rid, o) {
    busy(o.button, true);
    return App.client.call(fn, args, { receiptId: rid }).then(function (r) {
      busy(o.button, false);
      return handle(fn, args, rid, o, r);
    });
  }
  function handle(fn, args, rid, o, r) {
    settle(fn, args, r);
    var d = r.data || {};
    if (r.kind === 'ok') {
      noteVersion(d.data_version, true);
      var w = (d.result && d.result.warnings) || [];
      var cal = App.admin ? App.admin.calendarNote(d) : '';
      if (cal) w = w.concat([cal]);
      if (!o.quiet || w.length) toast(w.length ? '保存しました（注意: ' + w.join('・') + '）' : (o.doneText || '保存しました'), w.length ? 'warn' : 'ok');
      if (o.onDone) o.onDone(d);
      return d;
    }
    if (r.kind === 'confirm') {
      openConfirm(fn, args, o, d, backToForm(), d.reconfirm ? d.message : (o.confirmNote || ''), '');
      return null;
    }
    return handleRest(fn, args, rid, o, r, d);
  }

  /**
   * サーバーの確認画面。再確認（確定の間に他の変更があった）のときは、confirmExtra・名前の置き換え（withNames）を通して
   * 確認画面を作り直す（04a 小9）。「◀ 入力に戻る」と入れた理由はそのまま残す（直し第4弾 1）
   */
  function openConfirm(fn, args, o, d, back, note, reasonValue) {
      var lines = core.confirmLines(d.confirm);
      if (o.names) lines = App.admin.withNames(lines, o.names);
      var ex = o.confirmExtra ? o.confirmExtra(d) : null;   // {el, valid?, collect()} 確定の args に足す値
      var m = openModal({ back: back, title: o.title || '確認してください', lines: ex && ex.hideLines ? [] : lines, body: ex && ex.body,
        note: note, reasonLabel: o.reasonLabel, reasonRequired: o.reasonRequired, reasonValue: reasonValue,
        okLabel: o.okLabel, danger: o.danger, extra: ex,
        onOk: function (reason, okBtn) {
          var a2 = Object.assign({}, args, { confirm: true, version: d.version }, ex && ex.collect ? ex.collect() : {});
          if (o.reasonLabel) a2.reason = reason;
          var rid2 = ridFor(fn, a2);   // 確定の押し直しも同じ番号（版が変わっていれば中身が違うので新しい番号）
          busy(okBtn, true);
          App.client.call(fn, a2, { receiptId: rid2 }).then(function (r2) {
            busy(okBtn, false);
            if (r2.kind !== 'fail' && r2.kind !== 'relogin' && r2.kind !== 'ok') settle(fn, a2, r2);
            if (r2.kind === 'confirm') {   // この間に他の変更があった → 最新の一覧で確認画面を作り直す（選択肢・名前も最新に）
              var keep = m.reason();
              m.close();
              openConfirm(fn, args, o, r2.data, back, (r2.data && r2.data.message) || 'この間に他の変更がありました。もう一度確認してください', keep);
              return;
            }
            if (r2.kind === 'error' && authGone(r2.data)) { m.close(); App.auth.needLogin(core.messageFor(r2.data)); return; }
            if (r2.kind === 'error' && o.onConfirmError && o.onConfirmError(r2.data)) { m.close(); return; }
            if (r2.kind === 'error') { toast(core.messageFor(r2.data), 'error'); return; }   // 確認画面は閉じない（入れた理由・選んだものを残す）
            m.close();
            handle(fn, a2, rid2, o, r2);
          });
        } });
      return m;
  }

  /** 使っている途中でアカウントが無効・登録外・結び付け違いになった（04a 小13）→ ログインの面へ */
  var AUTH_GONE = ['disabled', 'not_registered', 'sub_mismatch'];
  function authGone(d) { return !!(d && AUTH_GONE.indexOf(d.error) >= 0); }

  function handleRest(fn, args, rid, o, r, d) {
    if (r.kind === 'error' && authGone(d)) { if (o.onFail) o.onFail(r); App.auth.needLogin(core.messageFor(d)); return null; }
    if (r.kind !== 'confirm' && r.kind !== 'fail' && o.onFail) o.onFail(r);   // 押した瞬間に変えた表示を戻す（出欠・尚哉 10/4③）。fail は下で呼ぶ
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
      toast('つながりませんでした。同じ内容のままもう一度押すか、画面の上の「もう一度送る」を押してください。同じ受付番号で送ります（二重には保存されません）', 'error');
      if (o.onFail) o.onFail(r);
      banner('送れなかった操作があります', [{ label: 'もう一度送る', onClick: function () { banner(''); send(fn, args, rid, o); } }]);
      return null;
    }
    if (o.onError && o.onError(d)) return null;   // 画面が自分で出す断り（受付を閉じるときの「直っていない記録」の一覧など）
    toast(core.messageFor(d), 'error');
    return null;
  }

  /**
   * 入力の画面（formModal）から確認画面を開くとき、入力の画面をそのまま取っておき、「◀ 入力に戻る」で入れた値ごと開き直す（U-15）。
   * 入力の画面が開いていなければ null（ボタンを出さない）
   */
  function backToForm() {
    var wrap = doc.getElementById('modal');
    var cur = wrap && !wrap.hidden ? wrap.firstChild : null;
    if (cur && !cur._formBox && cur._back) return cur._back;   // 入力→確認（画面側）→サーバーの確認でも、元の入力に戻る
    return reopen(cur);
  }
  /** 取っておいた入力の画面（formModal の箱）を、入れた値ごと開き直す関数。入力の画面でなければ null */
  function reopen(cur) {
    var wrap = doc.getElementById('modal');
    if (!cur || !cur._formBox) return null;
    return function () {
      clear(wrap);
      wrap.hidden = false;
      wrap.appendChild(cur);
    };
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

  /** 一覧の手元の控え（core.createRefCache）。書き込み・読み込みの応答の data_version が変わったら捨てる */
  var refCache = core.createRefCache();
  function noteVersion(v, wrote) {
    var st = refCache.seen(v);
    if (wrote && st === 'none') refCache.clear();   // 版の無い書き込みの応答（古い API）は、念のため全部読み直す
    return st;
  }
  function forgetCache() { refCache.clear(); }

  /** 読み込み中の数（画面の差し替えの合図・stage） */
  var inflight = 0, stages = [];
  function settleStages() {
    if (inflight > 0) return;
    setTimeout(function () {
      if (inflight > 0) return;
      var list = stages; stages = [];
      list.forEach(function (x) { x.swap(); });
    }, 0);
  }

  /**
   * 画面を出したまま読み直す（直し第3弾・尚哉 10/4①）。今の画面が出ていれば、新しい中身は見えない箱に作り、
   * 読み込みが全部終わったら一度に差し替える（「読み込み中…」で画面を消さない・スクロール位置を保つ）。
   * その間、古い画面は薄くして押せなくする（aria-busy）。画面が空なら、その画面にそのまま作る。戻り値: 中身を足す要素
   */
  function stage(view) {
    if (!view.firstChild) { clear(view); return view; }
    var box = h('div', {});
    var seq = (view._stageSeq || 0) + 1;
    view._stageSeq = seq;
    view.setAttribute('aria-busy', 'true');
    var done = false;
    var swap = function () {
      if (done) return;
      done = true;
      clearTimeout(guard);
      if (view._stageSeq !== seq) return;   // あとから別の読み直しが始まった＝そちらを使う
      clear(view);
      while (box.firstChild) { var c = box.firstChild; box.removeChild(c); view.appendChild(c); }
      view.setAttribute('aria-busy', 'false');
    };
    stages.push({ swap: swap });
    setTimeout(function () { if (inflight === 0) settleStages(); }, 0);   // 読み込みの無い画面
    var guard = setTimeout(function () { swap(); }, 35000);   // 応答が来なくても 35 秒で差し替える（api は 30 秒で打ち切る）
    if (guard && guard.unref) guard.unref();
    return box;
  }

  /** 読むだけの呼び出し。失敗・エラーは文言を出して null。クラス・コース・生徒・日程の一覧は版が同じ間は手元の控えを使う */
  function read(fn, args) {
    var key = core.cacheKey(fn, args || {});
    var hit = key ? refCache.get(key) : null;
    if (hit) return Promise.resolve(hit);
    inflight++;
    var out = function (x) { inflight--; settleStages(); return x; };
    return App.client.call(fn, args || {}).then(function (r) {
      if (r.kind === 'ok') {
        var st = noteVersion(r.data && r.data.data_version, false);
        if (key && (st === 'same' || st === 'new')) refCache.put(key, r.data);
        return r.data;
      }
      return fail(r);
    }).then(out, function (e) { inflight--; settleStages(); throw e; });
    function fail(r) {
      if (r.kind === 'relogin') { App.auth.needLogin(core.MESSAGES.relogin); return null; }
      if (r.kind === 'error' && authGone(r.data)) { App.auth.needLogin(core.messageFor(r.data)); return null; }
      if (r.kind === 'old_client') { banner(core.MESSAGES.old_client, [{ label: '再読み込み', onClick: function () { root.location.reload(); } }], 'error'); return null; }
      toast(r.kind === 'fail' ? core.MESSAGES.network : core.messageFor(r.data), 'error');
      return null;
    }
  }

  /** 印刷の部品（8-3）: 一覧の画面に置く「印刷」ボタン。@media print で操作部品（.np）を隠す */
  function printButton() {
    return h('button', { class: 'btn np', type: 'button', text: '印刷', on: { click: function () { root.print(); } } });
  }

  /* ---------- 画面の器（PR Hub 風・尚哉 10/4 2回目） ----------
   * 画面は「グレーの背景の上の見出し（page）」＋「役割ごとの白いカード（card）」で組む。
   * page: 大きい画面名＋灰色の短い説明（任意・印刷に出さない）＋右端の主な操作ボタン（任意・印刷に出さない）。
   * card: 白い角丸の面。絞り込み・一覧・フォームの節ごとに1枚。
   * sections: 並べた中身を「見出し（h2）ごと」「見出しの無いひとかたまりごと」のカードに入れ直す（中身・操作・文言は変えない）。
   */
  /** o: {title(文字か要素の配列), desc?, actions?[要素], np?(見出しごと印刷に出さない)}。view の末尾に足して返す */
  function page(view, o) {
    o = o || {};
    var acts = (o.actions || []).filter(Boolean);
    var head = h('div', { class: 'page-head' + (o.np ? ' np' : '') }, [
      h('div', { class: 'page-title' }, [h('h1', {}, o.title), o.desc ? h('p', { class: 'page-desc np', text: o.desc }) : null]),
      acts.length ? h('div', { class: 'page-actions np' }, acts) : null]);
    if (view) view.appendChild(head);
    return head;
  }
  /** 白いカード。o: {cls?}。parent があれば末尾に足す */
  function card(parent, children, o) {
    o = o || {};
    var c = h('section', { class: 'card sec' + (o.cls ? ' ' + o.cls : '') }, children);
    if (parent) parent.appendChild(c);
    return c;
  }
  /** カードの上の小さな件数（「1 人」など） */
  function cardCount(parent, text) {
    var p = h('p', { class: 'card-count', text: text || '' });
    if (parent) parent.appendChild(p);
    return p;
  }
  function hasCls(n, c) { return (' ' + ((n && n.className) || '') + ' ').indexOf(' ' + c + ' ') >= 0; }
  /**
   * box の子をカードに入れ直す。見出し（page-head）・カード・お知らせ（date-alert）・危険な操作（danger-zone）・
   * 折りたたみ（admin-fold）・件数（card-count）・カードに入れない印（bare）はそのまま。h2（印刷の題 print-title 以外）で新しいカードを始める。
   */
  function sections(box) {
    var nodes = [].slice.call(box.childNodes || box.children || []);
    nodes.forEach(function (n) { box.removeChild(n); });
    var cur = null;
    nodes.forEach(function (n) {
      if (['page-head', 'card', 'date-alert', 'danger-zone', 'admin-fold', 'card-count', 'bare'].some(function (c) { return hasCls(n, c); })) {
        box.appendChild(n); cur = null; return;
      }
      if (n.tagName === 'H2' && !hasCls(n, 'print-title')) cur = null;
      if (!cur) cur = card(box, []);
      cur.appendChild(n);
    });
    return box;
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
   * 入力欄を並べる部品（第2弾）。fields: [{key, label, type?: text|date|time|number|select|textarea|checkbox|checks|radio|dates,
   * dates: 日付の選択欄＋「追加」＋追加済みの一覧（×で消す）。値は日付の配列（選んだまま追加を押し忘れた日も入れる・U-14）
   * options?: [{value, label}], value?, hint?, show?(values)}]。戻り値 {el, values(), set(key, v)}
   */
  function form(fields) {
    var box = h('div', { class: 'form' }), inputs = {}, rows = {};
    fields.forEach(function (f) {
      var el, t = f.type || 'text';
      if (t === 'select') {
        // options は関数でもよい（他の欄の値で選択肢を絞る・U-31）。そのときは欄が変わるたびに作り直す
        el = h('select', { class: 'input' }, (typeof f.options === 'function' ? [] : (f.options || [])).map(function (o) { return h('option', { value: o.value, text: o.label }); }));
        if (f.value !== undefined && typeof f.options !== 'function') el.value = f.value;
      } else if (t === 'textarea') {
        el = h('textarea', { class: 'reason', rows: f.rows || 3 });
        el.value = f.value || '';
      } else if (t === 'checkbox') {
        el = h('input', { type: 'checkbox', class: 'check' });
        el.checked = !!f.value;
      } else if (t === 'dates') {
        el = datesPicker(f);
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
      var lab = t === 'dates' ? h('div', { class: 'field' }, [h('span', { text: f.label }), el]) : t === 'checkbox' ? h('label', { class: 'field' }, [el, ' ' + f.label]) : h('label', { class: 'field' }, [h('span', { text: f.label }), el]);
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
        else if (x.type === 'dates') o[k] = x.el._dates();
        else if (x.type === 'radio') { var c = [].slice.call(x.el.querySelectorAll('input')).filter(function (c) { return c.checked; })[0]; o[k] = c ? c.value : ''; }
        else o[k] = x.el.value;
      });
      return o;
    };
    var refresh = function () {
      var v = values();
      fields.forEach(function (f) {
        if (typeof f.options !== 'function') return;
        var sel = inputs[f.key].el, keep = sel._filled ? sel.value : (f.value !== undefined ? String(f.value) : '');
        sel._filled = true;
        clear(sel);
        var opts = f.options(v) || [];
        opts.forEach(function (o) { sel.appendChild(h('option', { value: o.value, text: o.label })); });
        sel.value = opts.some(function (o) { return String(o.value) === keep; }) ? keep : (opts[0] ? opts[0].value : '');
      });
      v = values();
      fields.forEach(function (f) { if (f.show) rows[f.key].hidden = !f.show(v); });
    };
    box.addEventListener('change', refresh);
    refresh();
    return { el: box, values: values, refresh: refresh };
  }

  /** 日付を1つずつ選んで足す欄（U-14）。キーボードで打たない */
  function datesPicker(f) {
    var picked = [];
    var add1 = function (d) { d = String(d || '').trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(d) && picked.indexOf(d) < 0) { picked.push(d); picked.sort(); } };
    (f.value || []).forEach(add1);
    var pick = h('input', { type: 'date', class: 'input', 'aria-label': f.label });
    var ul = h('ul', { class: 'date-chips' });
    var draw = function () {
      clear(ul);
      if (!picked.length) ul.appendChild(h('li', { class: 'none', text: f.empty || 'まだありません' }));
      picked.forEach(function (d) {
        ul.appendChild(h('li', {}, [h('span', { text: core.fmtDate(d) }),
          h('button', { class: 'btn small', type: 'button', text: '×', 'aria-label': core.fmtDate(d) + ' を消す',
            on: { click: function () { picked.splice(picked.indexOf(d), 1); draw(); } } })]));
      });
    };
    var addBtn = h('button', { class: 'btn small', type: 'button', text: '追加', on: { click: function () { add1(pick.value); pick.value = ''; draw(); } } });
    var box = h('div', { class: 'dates-pick' }, [h('div', { class: 'pick-row' }, [pick, addBtn]), ul]);
    box._dates = function () {
      var out = picked.slice();
      var p = String(pick.value || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(p) && out.indexOf(p) < 0) { out.push(p); out.sort(); }
      return out;
    };
    draw();
    return box;
  }

  /** 入力の画面（確認画面と同じ見た目）。o: {title, fields, intro?, okLabel?, check(values) → {error}|{args}, onOk(args, okBtn, modal)} */
  function formModal(o) {
    var f = form(o.fields);
    var err = h('p', { class: 'modal-note', role: 'alert' });
    err.hidden = true;
    var m = openModal({ title: o.title, okLabel: o.okLabel || '次へ', danger: o.danger, isForm: true,
      body: h('div', {}, [o.intro ? h('p', { text: o.intro }) : null, f.el, err]),
      onOk: function (_, okBtn) {
        var r = o.check ? o.check(f.values()) : { args: f.values() };
        if (r.error) { err.textContent = r.error; err.hidden = false; return; }
        err.hidden = true;
        o.onOk(r.args, okBtn, m);
      } });
    return m;
  }

  /**
   * 書き込みの前に、確認画面を開いてから送る（サーバーが確認画面を返さない操作用: 1クラス終了・確定など）。
   * from: その前に閉じた入力の画面（formModal の戻り値）。渡すと「◀ 入力に戻る」で入れた値ごと開き直す（直し第4弾 1(a)）。
   * 入力の画面を開いたまま呼んだときも同じ。どちらでもなければボタンは出さない
   */
  function confirmThen(title, lines, okLabel, run, from) {
    var back = from && from.box ? reopen(from.box) : backToForm();
    var m = openModal({ back: back, title: title, lines: lines, okLabel: okLabel || 'この内容で確定する', onOk: function (_, okBtn) { run(okBtn, m); } });
    return m;
  }

  /**
   * 生徒を選ぶ欄（U-22）: 「名前・ふりがなで探す」欄＋選択欄。生徒の画面と同じ探し方（admin.filterStudents）。
   * o: {value, onChange(id)}。戻り値 {el, select, setStudents(list)}。探す欄に打つと選択欄の中身が絞られ、1人だけなら自動で選ぶ
   */
  function studentPicker(o) {
    o = o || {};
    var all = [], cur = o.value || '';
    var q = h('input', { type: 'search', class: 'input', placeholder: '名前・ふりがなの一部', 'aria-label': '生徒を名前で探す' });
    var sel = h('select', { class: 'input', 'aria-label': '生徒' });
    var filter = function (list, k) {
      if (App.admin && App.admin.filterStudents) return App.admin.filterStudents(list, k);
      return list.slice();
    };
    var draw = function () {
      clear(sel);
      var rows = filter(all, q.value);
      if (cur && !rows.some(function (s) { return s.id === cur; })) rows = all.filter(function (s) { return s.id === cur; }).concat(rows);   // 選んでいる人は消さない
      sel.appendChild(h('option', { value: '', text: q.value.trim() ? (rows.length ? '当てはまる生徒 ' + rows.length + ' 人から選んでください' : '当てはまる生徒はいません') : '生徒を選んでください' }));
      rows.forEach(function (s) { sel.appendChild(h('option', { value: s.id, text: s.name + (s.kana ? '（' + s.kana + '）' : '') })); });
      sel.value = cur;
    };
    q.addEventListener('input', function () {
      draw();
      var rows = filter(all, q.value);
      if (q.value.trim() && rows.length === 1 && rows[0].id !== cur) { cur = rows[0].id; sel.value = cur; if (o.onChange) o.onChange(cur); }
    });
    sel.addEventListener('change', function () { cur = sel.value; if (o.onChange) o.onChange(cur); });
    draw();
    var el = h('div', { class: 'student-pick' }, [h('label', { class: 'field inline' }, [h('span', { text: '名前で探す' }), q]),
      h('label', { class: 'field inline' }, [h('span', { text: '生徒' }), sel])]);
    return { el: el, select: sel, search: q, setStudents: function (list) { all = (list || []).slice(); draw(); } };
  }

  /** ログアウト・人の切り替えで、各画面が覚えている選択（選んだ生徒・絞り込み）を忘れる（04a 小12） */
  var forgetters = [];
  function onForget(fn) { forgetters.push(fn); }
  function forgetScreens() { forgetters.forEach(function (fn) { try { fn(); } catch (e) { /* 1つの画面の失敗で止めない */ } }); }

  /** 書き込みが終わったら閉じる onDone を作る */
  function closing(m, then) { return function (d) { if (m) m.close(); if (then) then(d); }; }

  App.ui = { form: form, formModal: formModal, confirmThen: confirmThen, closing: closing, h: h, clear: clear, toast: toast, banner: banner, openModal: openModal, write: write, read: read, resendPending: resendPending, forgetUnsettled: forgetUnsettled, forgetCache: forgetCache, stage: stage,
    studentPicker: studentPicker, onForget: onForget, forgetScreens: forgetScreens,
    printButton: printButton, stepper: stepper, busy: busy, page: page, card: card, cardCount: cardCount, sections: sections };
})(window);
