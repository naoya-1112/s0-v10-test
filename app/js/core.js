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
    unknown_fn: 'この操作はまだ使えません（画面とAPIの版が合っていない可能性があります）',
    bad_json: '送った内容が読めませんでした。画面を再読み込みしてください',
    internal: '処理の途中で止まりました。もう一度送ってください（同じ受付番号で大丈夫です）',
    processing: '処理中です。少し待ってから同じ内容のままもう一度押すと、結果を受け取れます（二重には保存されません）',
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
  /** ナビの2段（04b U-20）: 毎日使う画面を1行目に、たまに使う画面は「その他」にまとめる。今いる画面が「その他」なら開いておく */
  var NAV_MAIN = { home: 1, teacher: 1, dayroster: 1, students: 1, makeup: 1, contacts: 1, review: 1 };
  function navGroups(role, current) {
    var list = routesFor(role);
    if (list.length <= 8) return { main: list, more: [], openMore: false };
    var main = list.filter(function (r) { return NAV_MAIN[r.id]; }), more = list.filter(function (r) { return !NAV_MAIN[r.id]; });
    return { main: main, more: more, openMore: more.some(function (r) { return r.id === current; }) };
  }
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

  /**
   * 一覧の手元の控え（直し第3弾・尚哉 10/4②）: クラス・コース・生徒・日程の一覧は、data_version が変わったときだけ読み直す。
   * seen(v) は応答の版を見て 'new'（変わった→控えを全部捨てる）／'same'／'old'（届くのが遅れた古い応答＝控えにしない）／'none' を返す。
   * 他の人の変更は、控えていない読み込み（振替の一覧など）の版で気づく。念のため ttlMs（既定10分）で古い控えは捨てる。
   */
  var CACHED_READS = { 'class.list': true, 'course.list': true, 'student.list': true, 'session.list': true };
  function createRefCache(o) {
    o = o || {};
    var ttl = o.ttlMs || 600000, now = o.now || function () { return Date.now(); };
    var ver = null, items = {};
    return {
      seen: function (v) {
        if (v === undefined || v === null || v === '') return 'none';
        v = String(v);
        if (ver === null) { ver = v; return 'new'; }
        if (v === ver) return 'same';
        if (Number(v) < Number(ver)) return 'old';
        ver = v; items = {}; return 'new';
      },
      get: function (k) {
        var x = items[k];
        if (!x) return null;
        if (now() - x.at > ttl) { delete items[k]; return null; }
        return JSON.parse(x.json);
      },
      put: function (k, val) { items[k] = { json: JSON.stringify(val), at: now() }; },
      clear: function () { items = {}; },
      version: function () { return ver; }
    };
  }
  function cacheKey(fn, args) { return CACHED_READS[fn] ? fn + '\u0000' + JSON.stringify(args || {}) : ''; }

  /* ---------- 記号を名前と日本語に（直し第3弾・04b U-04〜U-06・U-17・U-18。サーバーは Labels.js） ---------- */
  var STATE_JA = { active: '有効', valid: '有効', used: '使用済み', present: '出席', absent: '欠席', makeup_present: '振替出席',
    canceled: '中止', cancelled: '中止', void: '無効', voided: '取消', expired: '期限切れ', withdrawn: '取下げ', reserved: '予約中',
    paused: '休止', ended: '終了', done: '済み', pending: '未確定', processing: '処理中', closed: '閉じた', open: '未解決',
    corrected: '直した', lesson: '授業', makeupday: '振替Day', trial: '体験', individual: '個別', mutual: '相互振替', staff: 'スタッフ', self: '本人', teacher: '講師' };
  var PREFIX_JA = { S_: '生徒', K_: 'クラス', C_: 'コース', D_: '回', E_: '在籍', AB_: '欠席連絡', AT_: '出席の記録', F_: '振替', MK_: '振替',
    TK_: '振替券', N_: 'カルテ', CT_: '連絡', RV_: '要確認', W_: '退会', U_: 'アカウント', L_: '履歴' };
  /** 中で使う操作名 → 日本語（U-17） */
  var OP_JA = { 'attendance.mark': '出欠の記録', 'attendance.clear': '出欠を未記録に戻す', 'absence.add': '欠席連絡', 'absence.withdraw': '欠席連絡の取消',
    'makeup.mutual': '相互振替の登録', 'makeup.reserve_day': '振替Dayの予約', 'makeup.cancel': '振替の取消', 'ticket.issue': '振替券の発行',
    'ticket.void': '振替券の失効', 'ticket.extend': '振替券の期限の延長', 'ticket.used_fix': '振替券の使用済みの訂正', 'session.cancel': '回の中止',
    'session.uncancel': '中止の解除', 'session.change': '日程の変更', 'session.generate': '開講日をまとめて作る', 'session.add': '回の追加',
    'session.renumber': '回番号の変更', 'enroll': '入会・在籍の登録', 'move': 'クラスの移動', 'pause': '休止', 'resume': '休止からの再開',
    'end_class': '1クラスの終了', 'withdraw': '退会', 'withdraw.void': '退会の取消', 'enrollment.correct': '在籍の訂正', 'enrollment.confirm': '在籍の確定',
    'rollover': '次期への一括移行', 'continuation.decide': '継続確認の記録', 'note.add': 'カルテ', 'contact.mark': '連絡済みの印', 'student.save': '生徒の保存',
    'review.resolve': '要確認の解決', 'receipt.close': '受付を閉じる' };
  /** 変更履歴の列名 → 日本語（U-18） */
  var FIELD_JA = { from_month: '開始の月', to_month: '終わりの月', class_id: 'クラス', student_id: '生徒', session_id: '回', status: '状態', state: '状態',
    date: '日付', start_time: '始まり', end_time: '終わり', capacity: '定員', number: '回番号', result: '出欠', recorder: '記録者', from_paper: '紙から',
    name: '名前', kana: 'ふりがな', phone: '電話', email: 'メール', line_name: 'LINEの名前', hidden: '非表示', reason: '理由', message: '内容',
    contacted: '連絡済み', contacted_at: '連絡した時刻', contacted_by: '連絡した人', apply_month: '退会の月', received_on: '受けた日', expiry: '期限',
    extend_to: '延長した期限', ticket_id: '振替券', absence_id: '欠席連絡', to_session_id: '行く回', source_session_id: '発行元の回', kind: '種類',
    fixed: '固定', label: 'クラス名', teacher: '講師', weekday: '曜日', term: '期', course_id: 'コース', body: '本文', tag: 'タグ', at: '時刻',
    canceled_at: '取り消した時刻', cancel_reason: '取消の理由', flag: '印', makeup_id: '振替', review: '要確認', used_at: '使った時刻' };
  function opLabel(op) { return OP_JA[op] || String(op || ''); }
  function fieldLabel(k) { return FIELD_JA[k] || String(k || ''); }
  /**
   * 文の中の記号・英語の状態・日付を日本語にする（画面側の共通の置き換え）。maps: {students:{id:名前}, classes:{id:名前}, sessions:{id:名前}}。
   * 分からない記号は表の名前（「振替券」など）にする
   */
  function humanize(text, maps) {
    if (text === null || text === undefined) return '';
    maps = maps || {};
    var out = String(text).replace(/\b([A-Z]{1,2}_)[0-9A-Za-z_-]+/g, function (id, pre) {
      var m = pre === 'S_' ? maps.students : pre === 'K_' ? maps.classes : pre === 'D_' ? maps.sessions : (maps.others || null);
      if (m && m[id]) return m[id];
      return PREFIX_JA[pre] || id;
    });
    out = out.replace(/(^|[^A-Za-z_.])([a-z_]+)(?=[^A-Za-z_.]|$)/g, function (all, p, w) { return Object.prototype.hasOwnProperty.call(STATE_JA, w) ? p + STATE_JA[w] : all; });
    out = out.replace(/\b(\d{4}-\d{2}-\d{2})(?![\d:T])/g, function (all) { return fmtDate(all); });
    out = out.replace(/\b(\d{4})-(\d{2})(?![-\d])/g, function (all) { return fmtMonth(all); });
    return out;
  }
  /** 一覧（生徒・クラス・回）から humanize の maps を作る */
  function nameMaps(students, classes, sessions) {
    var st = {}, cl = {}, se = {};
    (students || []).forEach(function (x) { st[x.id] = x.name; });
    (classes || []).forEach(function (x) { cl[x.id] = x.label; });
    (sessions || []).forEach(function (x) { se[x.id] = fmtDate(x.date) + ' ' + (x.start_time || '') + (x.class_id && cl[x.class_id] ? ' ' + cl[x.class_id] : ''); });
    return { students: st, classes: cl, sessions: se };
  }

  /** カルテのタグ（R-38・サーバー LogicTeacher.js NOTE_TAGS と同じ）。任意＝空も選べる */
  var NOTE_TAGS = ['作品', '悩み・相談', '配慮', 'その他'];

  var core = { humanize: humanize, nameMaps: nameMaps, opLabel: opLabel, fieldLabel: fieldLabel, createRefCache: createRefCache, cacheKey: cacheKey, CACHED_READS: CACHED_READS, NOTE_TAGS: NOTE_TAGS, CLIENT_VER: CLIENT_VER, newReceiptId: newReceiptId, classify: classify, MESSAGES: MESSAGES, messageFor: messageFor,
    loginFailureView: loginFailureView, routesFor: routesFor, navGroups: navGroups, pickRoute: pickRoute, todayJst: todayJst, addDays: addDays,
    addMonths: addMonths, fmtDate: fmtDate, fmtMonth: fmtMonth, fmtDateTime: fmtDateTime, confirmLines: confirmLines };
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  else { root.App = root.App || {}; root.App.core = core; }
})(typeof window !== 'undefined' ? window : this);
