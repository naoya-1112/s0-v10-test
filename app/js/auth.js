/**
 * auth.js —「Googleでログイン」（GIS・design 5-1）・ログイン中の表示・ログアウト・sk の保持（api.js の createSession）。
 *  - ログインの失敗は理由を表示したまま残し、前のログインが生きていれば「前のログインのまま使えます」を並べる（前のログインは消さない）
 *  - auth.login は再送しない。応答が来ない・used_token は「もう一度『Googleでログイン』を押してください」
 *  - verify_unavailable は「少し待ってもう一度ログインしてください」（セッションは消さない）
 *  - ログアウト: auth.logout → メモリと localStorage を消す → GIS の自動選択を切る
 */
(function (root) {
  'use strict';
  var App = root.App, core = App.core, doc = root.document;
  var gisReady = false;
  var lastWho = null;   // セッション切れの前に入っていた人（ログインし直したのが同じ人か見分ける）

  function el(id) { return doc.getElementById(id); }

  function showWho() {
    var who = App.session.who();
    var w = el('who');
    if (w) w.textContent = who ? 'ログイン中: ' + who.name + (who.role === 'staff' ? '（スタッフ）' : '（講師）') : '';
    var out = el('logout');
    if (out) out.hidden = !who;
  }

  /** ログインの面を出す。reason は表示したまま残す（次の操作まで消さない） */
  function showLogin(reason, keep) {
    var panel = el('login');
    panel.hidden = false;
    var r = el('login-reason');
    r.textContent = reason || '';
    r.hidden = !reason;
    var k = el('login-keep');
    k.hidden = !keep;
    if (keep) {
      App.ui.clear(k);
      k.appendChild(doc.createTextNode(keep + ' '));
      k.appendChild(App.ui.h('button', { class: 'btn', type: 'button', text: 'このまま使う', on: { click: function () { panel.hidden = true; } } }));
    }
    renderButton();
  }

  /** relogin（セッション切れ）: 入力と受付番号は ui.js の App.pending に残っている */
  function needLogin(msg) {
    lastWho = App.session.who() || lastWho;
    App.session.clear();
    hideScreens(true);   // 個人情報の画面を隠す（入力は App.pending に残っている・04a 中4）
    showWho();
    showLogin(msg || core.MESSAGES.relogin, '');
  }

  /** 画面（一覧・ナビ・入力画面）を隠す／出す。消さずに隠すので、同じ人がログインし直せば入力の続きから送れる */
  function hideScreens(on) {
    ['view', 'nav'].forEach(function (id) { var e = el(id); if (e) e.hidden = on; });
    var m = el('modal');
    if (m) m.hidden = on ? true : !(m.children && m.children.length);
  }

  /** 前の人の名残（送り直し待ちの操作・帯・受付番号・入力画面）を消す（04a 中3・中5・尚哉の判断3） */
  function forgetPrevious() {
    App.pending = null;
    App.ui.banner('');
    App.ui.forgetUnsettled();
    if (App.ui.forgetCache) App.ui.forgetCache();
    if (App.ui.forgetScreens) App.ui.forgetScreens();   // 各画面が覚えている「選んだ生徒」等も消す（04a 小12）
    var m = el('modal');
    if (m) { m.hidden = true; App.ui.clear(m); }
  }

  function renderButton() {
    var box = el('gbtn');
    if (!box) return;
    var cfg = root.APP_CONFIG || {};
    if (!cfg.gisClientId) { box.textContent = 'ログインの設定が終わっていません（config.js の gisClientId）。教室の管理者にご連絡ください'; return; }
    var g = root.google && root.google.accounts && root.google.accounts.id;
    if (!g) { box.textContent = 'Googleのログインを読み込んでいます…（出ないときは電波を確かめて再読み込みしてください）'; return; }
    try {
      if (!gisReady) { g.initialize({ client_id: cfg.gisClientId, callback: onCredential, ux_mode: 'popup', auto_select: false }); gisReady = true; }
      App.ui.clear(box);
      g.renderButton(box, { type: 'standard', text: 'signin_with', size: 'large', locale: 'ja', width: 280 });
    } catch (e) {
      box.textContent = 'ログインのボタンを出せませんでした。再読み込みしてください';
    }
  }

  /** GIS がIDトークンを返したとき（5-1 の 3）。auth.login は1回だけ送る */
  function onCredential(resp) {
    var prev = App.session.who() ? { sk: App.session.sk(), who: App.session.who() } : null;
    App.client.call('auth.login', {}, { idToken: resp && resp.credential }).then(function (r) {
      if (r.kind === 'ok' && r.data.sk) {
        var d = r.data;
        var before = lastWho || (prev && prev.who);
        var same = !!(before && before.email === d.email && before.role === d.role);
        lastWho = null;
        // 前と違う人・役割なら、前の人の操作・記録者・画面を残さない（共用 iPad・04a 中3・中4）
        if (before && !same) forgetPrevious();
        App.session.set(d.sk, { name: d.name, role: d.role, email: d.email, shared: !!d.shared });
        el('login').hidden = true;
        hideScreens(false);
        showWho();
        // 同じ人が relogin で残した操作があれば、今の画面（入力）をそのまま残して送り直しを案内する。それ以外は役割の画面を作り直す
        if (App.pending && same) App.ui.resendPending(); else { App.pending = null; App.start(); }
        return;
      }
      // 失敗: 理由を残し、前のログインは消さない
      var v = core.loginFailureView(r.kind === 'fail' ? { error: 'login_no_answer' } : r.data, prev && prev.who);
      showLogin(v.reason, v.keep);
    });
  }

  function logout() {
    var sk = App.session.sk();
    var done = function () {
      App.session.clear();
      lastWho = null;
      forgetPrevious();
      try { root.google.accounts.id.disableAutoSelect(); } catch (e) { /* GIS が無いときは何もしない */ }
      showWho();
      App.ui.clear(el('view'));
      App.ui.clear(el('nav'));
      showLogin('ログアウトしました', '');
    };
    if (!sk) { done(); return; }
    App.client.call('auth.logout', {}).then(done, done);
  }

  /** 開いたとき（5-1 の 1）: メモリ→localStorage の sk で whoami。無い・切れていればログインの面 */
  function boot() {
    var sk = App.session.restore();
    if (!sk) { showWho(); showLogin('', ''); return; }
    App.client.call('auth.whoami', {}).then(function (r) {
      if (r.kind === 'ok') {
        App.session.setWho({ name: r.data.name, role: r.data.role, email: r.data.email, shared: !!r.data.shared });
        showWho();
        App.start();
        return;
      }
      if (r.kind === 'fail') { showWho(); showLogin(core.MESSAGES.network, ''); return; }   // つながらないだけ: sk は残す
      App.session.clear();
      showWho();
      showLogin(r.kind === 'relogin' ? '' : core.messageFor(r.data), '');
    });
  }

  /** GIS のスクリプトが後から読み込まれたらボタンを出し直す */
  root.onGisLoad = function () { if (!el('login').hidden) renderButton(); };
  // index.html の CSP でインラインの onload を使わないため、ページの読み込み完了（async の GIS も含む）で出し直す（04a 小16）
  if (root.addEventListener) root.addEventListener('load', function () { root.onGisLoad(); });

  App.auth = { boot: boot, logout: logout, needLogin: needLogin, showWho: showWho, onCredential: onCredential };
})(window);
