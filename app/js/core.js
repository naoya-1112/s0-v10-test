/**
 * core.js — 画面の共通のきまり（DOM に触らない・Node でテストする）。design 4章・5-1・6-5・8-3。
 * 受付番号・応答の見分け・エラー文言・役割ごとの画面・日付の表示・確認画面の一覧。
 */
(function (root) {
  'use strict';

  /** 画面の版（全要求の本文に client_ver で入れる・10-1）。互換を壊す変更をしたら admin-app の WRITE_MIN_CLIENT_VER と合わせて上げる */
  var CLIENT_VER = 1;

  /** 受付番号（6-1・8-3）: R＋32文字（サーバーの決まり ^R[0-9A-Za-z_-]{8,64}$）。rand は 0〜1 を返す関数（テスト用に差し替え） */
  function newReceiptId(rand) {
    var c = root && root.crypto;
    if (!rand && c && typeof c.randomUUID === 'function') return 'R' + c.randomUUID().replace(/-/g, '');
    var r = rand || Math.random, s = '';
    for (var i = 0; i < 32; i++) s += Math.floor(r() * 16).toString(16);
    return 'R' + s;
  }

  /**
   * 通信の結果を見分ける（4章）。input {network?:true, timeout?:true, status?, text?}
   * → {kind:'fail'}（時間切れ・通信の失敗・JSONでない応答＝成功にしない・再送してよい）
   *   {kind:'relogin', data} / {kind:'old_client', data} / {kind:'error', data} / {kind:'confirm', data} / {kind:'ok', data}
   */
  function classify(input) {
    if (!input || input.network || input.timeout) return { kind: 'fail', reason: input && input.timeout ? 'timeout' : 'network' };
    var data;
    try { data = JSON.parse(input.text); } catch (e) { return { kind: 'fail', reason: 'not_json' }; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { kind: 'fail', reason: 'not_json' };
    if (data.relogin) return { kind: 'relogin', data: data };
    if (data.error === 'old_client') return { kind: 'old_client', data: data };
    if (data.error) return { kind: 'error', data: data };
    if (data.status === 'processing') return { kind: 'error', data: { error: 'processing', message: data.message } };
    if (data.confirm !== undefined && !data.ok) return { kind: 'confirm', data: data };
    return { kind: 'ok', data: data };
  }

  /** エラーの番号 → 平易な文言（何をすればいいか・8章）。サーバーの業務の error は日本語の文なのでそのまま出す */
  var LOGIN_AGAIN = 'もう一度「Googleでログイン」を押してください';
  var MESSAGES = {
    // ログイン（5-1）
    used_token: LOGIN_AGAIN,
    no_jti: 'ログインできませんでした。' + LOGIN_AGAIN,
    bad_token: 'ログインできませんでした。' + LOGIN_AGAIN,
    bad_aud: 'ログインの設定が合っていません。教室の管理者にご連絡ください（クライアントID）',
    bad_iss: 'ログインできませんでした。' + LOGIN_AGAIN,
    unverified: 'このGoogleアカウントはメールの確認が済んでいません。別のアカウントでログインしてください',
    expired: 'ログインの期限が切れました。' + LOGIN_AGAIN,
    verify_unavailable: '少し待ってもう一度ログインしてください（Googleの確認につながりませんでした）',
    not_configured: '設定が終わっていません。教室の管理者にご連絡ください（GIS_CLIENT_ID）',
    not_registered: 'このアカウントは登録されていません。教室にご連絡ください',
    disabled: 'このアカウントは無効になっています。教室にご連絡ください',
    recorder_only: 'このアカウントは記録者の名前だけの登録です。ログインできません',
    sub_mismatch: 'このメールは別のGoogleアカウントに結び付いています。教室にご連絡ください',
    login_no_answer: 'ログインの返事が来ませんでした。' + LOGIN_AGAIN,
    // 呼び出し
    relogin: 'ログインが切れました。もう一度ログインしてください（入力した内容はそのまま残っています）',
    old_client: '画面が古くなっています。再読み込みしてください',
    forbidden: 'この操作はできません（役割が違います）',
    busy: '混み合っています。もう一度押してください',
    bad_receipt: '受付番号がありません。画面を再読み込みしてください',
    receipt_conflict: 'この受付番号は使えません。画面を再読み込みしてください',
    bad_recorder: '記録者が見つかりません。記録者を選び直してください',
    unknown_fn: 'この操作はまだ使えません（画面とAPIの版が合っていない可能性があります）',
    bad_json: '送った内容が読めませんでした。画面を再読み込みしてください',
    internal: '処理の途中で止まりました。もう一度送ってください（同じ受付番号で大丈夫です）',
    processing: '処理中です。少し待ってから画面を開き直してください',
    network: 'つながりませんでした。電波を確かめて、もう一度押してください',
    not_configured_url: 'APIのURLが設定されていません（config.js）。教室の管理者にご連絡ください',
    invariant: '記録が合わなくなるため保存しませんでした'
  };

  /** 応答（または {error}）→ 画面に出す1文 */
  function messageFor(res) {
    if (!res) return MESSAGES.network;
    if (res.relogin) return MESSAGES.relogin;
    var code = res.error;
    if (code === 'not_registered' && res.message) return res.message;   // メールを含む（どのアカウントで入ったか分かる）
    if (code && MESSAGES[code]) {
      if (code === 'invariant' && res.message) return MESSAGES.invariant + '（' + res.message + '）';
      return MESSAGES[code];
    }
    if (res.message) return String(res.message);
    if (code) return String(code);   // 業務の error は日本語の文
    return '';
  }

  /** ログインの失敗で「前のログインを消さない」か（5-1）。used_token・応答なしも前のセッションは生きている */
  function loginFailureView(res, current) {
    var reason = messageFor(res || { error: 'login_no_answer' });
    var keep = current && current.name ? '前のログインのまま使えます（ログイン中: ' + current.name + '）' : '';
    return { reason: reason, keep: keep };
  }

  /** 役割ごとの画面（ナビ）。段階1の管理・講師の画面（第1〜3弾）。スタッフの先頭はホーム */
  var ROUTES = {
    staff: [
      { id: 'home', label: 'ホーム' },
      { id: 'teacher', label: '今日のクラス' },
      { id: 'dayroster', label: '当日名簿' },
      { id: 'students', label: '生徒' },
      { id: 'roster', label: '名簿・出欠簿' },
      { id: 'schedule', label: 'クラスと日程' },
      { id: 'makeup', label: '振替・欠席' },
      { id: 'tickets', label: '振替券の台帳' },
      { id: 'review', label: '要確認' },
      { id: 'continuation', label: '継続確認' },
      { id: 'contacts', label: '連絡が要る人' },
      { id: 'notes', label: 'カルテ' },
      { id: 'history', label: '変更履歴' },
      { id: 'courses', label: 'コース' },
      { id: 'settings', label: '設定' }
    ],
    teacher: [
      { id: 'teacher', label: '今日のクラス' },
      { id: 'dayroster', label: '当日名簿' }
    ]
  };
  function routesFor(role) { return ROUTES[role] || []; }
  /** 開く画面を決める（役割に無い画面は先頭に戻す＝画面で隠しても権限の代わりにはしない。確認はサーバー） */
  function pickRoute(role, wanted) {
    var list = routesFor(role);
    if (!list.length) return '';
    for (var i = 0; i < list.length; i++) if (list[i].id === wanted) return wanted;
    return list[0].id;
  }

  /* ---------- 日付（日本時間） ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function todayJst(now) {
    var d = new Date((now || new Date()).getTime() + 9 * 3600000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function addDays(date, n) {
    var p = String(date).split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function addMonths(month, n) {
    var p = String(month).split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1 + n, 1));
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1);
  }
  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  /** 2026-10-06 → 10月6日（火） */
  function fmtDate(date) {
    var p = String(date || '').split('-');
    if (p.length !== 3) return String(date || '');
    var w = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay();
    return (+p[1]) + '月' + (+p[2]) + '日（' + WD[w] + '）';
  }
  /** 2026-10 → 2026年10月 */
  function fmtMonth(month) {
    var p = String(month || '').split('-');
    return p.length === 2 ? p[0] + '年' + (+p[1]) + '月' : String(month || '');
  }
  /** 2026-10-06T09:05:00+09:00 → 10/6 9:05 */
  function fmtDateTime(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(s || ''));
    return m ? (+m[2]) + '/' + (+m[3]) + ' ' + (+m[4]) + ':' + m[5] : String(s || '');
  }

  /** 確認画面の一覧（6-5）: 文字列の配列・{warnings, …} のどちらも1行ずつの文にする */
  function confirmLines(confirm) {
    var str = function (x) {
      if (x === null || x === undefined) return '';
      if (typeof x === 'string') return x;
      if (typeof x === 'object') return x.text || x.label || x.message || JSON.stringify(x);
      return String(x);
    };
    if (Array.isArray(confirm)) return confirm.map(str).filter(Boolean);
    if (confirm && typeof confirm === 'object') {
      var out = (confirm.warnings || []).map(str);
      Object.keys(confirm).forEach(function (k) {
        if (k === 'warnings') return;
        var v = confirm[k];
        if (Array.isArray(v) && v.length && typeof v[0] === 'string' && !/^[A-Z]+_/.test(v[0])) out = out.concat(v);
      });
      return out.filter(Boolean);
    }
    return confirm ? [str(confirm)] : [];
  }

  var core = { CLIENT_VER: CLIENT_VER, newReceiptId: newReceiptId, classify: classify, MESSAGES: MESSAGES, messageFor: messageFor,
    loginFailureView: loginFailureView, routesFor: routesFor, pickRoute: pickRoute, todayJst: todayJst, addDays: addDays,
    addMonths: addMonths, fmtDate: fmtDate, fmtMonth: fmtMonth, fmtDateTime: fmtDateTime, confirmLines: confirmLines };
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  else { root.App = root.App || {}; root.App.core = core; }
})(typeof window !== 'undefined' ? window : this);
