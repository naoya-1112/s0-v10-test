/**
 * adminviews.js — 管理画面（第2弾 S1-28〜S1-32）の組み立て（DOM に触らない・Node でテストする）。
 * 設定・アカウント・コース・クラスと日程・日程の変更と中止・連絡が要る人・生徒・在籍の操作。
 */
(function (root) {
  'use strict';
  var core = (typeof module !== 'undefined' && module.exports) ? require('./core.js') : root.App.core;

  var MAKEUP_TYPE = { none: '振替なし', mutual: '相互振替（他の曜日の授業へ）', makeupday: '振替Day' };
  var KIND = { lesson: '授業', makeupday: '振替Day', trial: '体験', individual: '個別' };
  var ROLE = { staff: 'スタッフ（全部の画面）', teacher: '講師（今日のクラス・当日名簿だけ）', recorder_only: '記録者の名前だけ（使われていません）' };
  // 新しく選べる役割（recorder_only は記録者の選択をなくしたので出さない・尚哉 10/4）
  var ROLE_PICK = ['staff', 'teacher'];
  var CAL = { ok: '反映済み', pending: '反映待ち', failed: '反映できなかった', skipped: 'カレンダー未設定' };
  var LINK_KIND = { enroll: '入会', move: '移動', pause: '休止', resume: '復帰', 'continue': '継続', rollover: '一括移行' };
  var CONT = { 'continue': '継続', move: '移動', end: '終了', pause: '休止', withdrawn: '退会' };
  var CONTACT_REASON = { canceled: '中止のお知らせ', uncanceled: '中止の取りやめ', date_changed: '日程の変更', renumbered: '回番号の変更',
    withdraw: '退会', withdrawn: '退会', pause: '休止', paused: '休止', class_ended: '1クラス終了', moved: '移動' };
  var WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

  function s(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function isMonth(v) { return /^\d{4}-\d{2}$/.test(s(v)); }
  function isDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(s(v)); }
  function isTime(v) { return /^\d{2}:\d{2}$/.test(s(v)); }

  /** 月の選択肢（今月の before か月前〜after か月後）。選択式にする（Mac の Safari は月の入力欄が無いため） */
  function monthOptions(today, before, after) {
    var m0 = String(today).slice(0, 7), out = [];
    for (var i = -(before || 0); i <= (after || 0); i++) {
      var m = core.addMonths(m0, i);
      out.push({ value: m, label: core.fmtMonth(m) });
    }
    return out;
  }

  function byId(list) { var m = {}; (list || []).forEach(function (r) { m[r.id] = r; }); return m; }

  /** クラスの見出し: 「2026年11月期 火 10:00〜11:00（世界で1冊）」 */
  function classLabel(c, courses) {
    if (!c) return '（クラスなし）';
    var co = courses ? courses[c.course_id] : null;
    return (c.term ? core.fmtMonth(c.term) + '期 ' : '') + (c.label || '') + ' ' + (c.start_time || '') + (c.end_time ? '〜' + c.end_time : '') +
      (co ? '（' + co.name + '）' : '') + (c.hidden === '1' ? '［非表示］' : '');
  }

  /** 期の一覧（クラスの term）。新しい順 */
  function terms(classes) {
    var m = {};
    (classes || []).forEach(function (c) { if (c.term) m[c.term] = 1; });
    return Object.keys(m).sort().reverse();
  }

  /** 月 m がクラスの開講期間に入るか */
  function inOpen(c, m) { return !!c && (!c.open_from || m >= c.open_from) && (!c.open_to || m <= c.open_to); }

  /* ---------- 設定・アカウント（S1-28） ---------- */

  function accountRows(accounts) {
    return (accounts || []).map(function (a) {
      var notes = [];
      if (a.shared) notes.push('共用（教室の iPad など）');
      if (!a.active) notes.push('無効');
      if (a.role !== 'recorder_only') notes.push(a.bound ? 'Googleアカウントと結び付け済み' : 'まだ一度もログインしていない');
      return { id: a.id, name: a.display_name, email: a.email || '（メールなし）', role: ROLE[a.role] || a.role, active: !!a.active,
        canClearSub: !!a.bound && !!a.active, notes: notes.join('・') };
    });
  }

  /** アカウントの保存の args（入力欄の値から）。誤りは error の文 */
  function accountArgs(f) {
    var o = { display_name: s(f.display_name), role: s(f.role), email: s(f.email).toLowerCase(), shared: !!f.shared, active: f.active !== false };
    if (f.id) o.id = f.id;
    if (!o.display_name) return { error: '表示名を入れてください' };
    if (!ROLE[o.role]) return { error: '役割を選んでください' };
    if (o.role !== 'recorder_only' && !/^[^@\s]+@[^@\s]+$/.test(o.email)) return { error: 'ログインに使うGoogleアカウントのメールを入れてください' };
    return { args: o };
  }

  /** 設定の保存の args（変わった所だけ送る） */
  function settingsArgs(cur, f) {
    var values = {};
    ['classroom_name', 'calendar_id', 'default_capacity', 'policy_json'].forEach(function (k) {
      if (f[k] === undefined) return;
      if (s(f[k]) !== s(cur && cur[k])) values[k] = s(f[k]);
    });
    if (values.default_capacity !== undefined && !/^[1-9]\d{0,2}$/.test(values.default_capacity)) return { error: '定員は 1〜999 の数で入れてください' };
    if (values.policy_json) { try { JSON.parse(values.policy_json); } catch (e) { return { error: '詳しい設定（policy_json）の書き方が正しくありません' }; } }
    if (!Object.keys(values).length) return { error: '変わった所がありません' };
    return { args: { values: values } };
  }

  function calendarFailureRows(sessions, classes) {
    var cm = byId(classes);
    return (sessions || []).map(function (x) {
      return { id: x.id, text: core.fmtDate(x.date) + ' ' + (x.start_time || '') + ' ' + (KIND[x.kind] || x.kind) +
        (cm[x.class_id] ? ' ' + cm[x.class_id].label : ''), state: CAL[x.cal_state] || x.cal_state, error: x.cal_error || '', failed: x.cal_state === 'failed' };
    });
  }

  /** 書き込みの応答のカレンダー反映の結果 → 注意の文（成功なら ''） */
  function calendarNote(res) {
    var c = res && res.calendar;
    if (!c || c.ok !== false && !(c.failed > 0)) return '';
    return c.message || 'カレンダーに反映できなかった日程があります。「設定」の「もう一度反映」でやり直せます（名簿の記録は保存できています）';
  }

  /* ---------- コース ---------- */

  function courseArgs(f) {
    var o = { name: s(f.name), makeup_type: s(f.makeup_type), standard_months: s(f.standard_months), next_course_ids: f.next_course_ids || [], sort: s(f.sort) };
    if (f.id) o.id = f.id;
    if (!o.name) return { error: 'コースの名前を入れてください' };
    if (!MAKEUP_TYPE[o.makeup_type]) return { error: '振替の種類を選んでください' };
    if (o.sort && !/^-?\d+$/.test(o.sort)) return { error: '並び順は数で入れてください' };
    return { args: o };
  }

  /* ---------- クラスと日程（S1-29・S1-30） ---------- */

  function classArgs(f) {
    var o = {};
    ['course_id', 'term', 'label', 'weekday', 'start_time', 'end_time', 'capacity', 'teacher', 'open_from', 'open_to', 'mutual_group'].forEach(function (k) { o[k] = s(f[k]); });
    if (f.id) { o.id = f.id; delete o.course_id; delete o.term; }
    else if (!o.course_id) return { error: 'コースを選んでください' };
    if (!o.label) return { error: 'クラスの名前（例: 火）を入れてください' };
    if (WEEKDAYS.indexOf(o.weekday) < 0) return { error: '曜日を選んでください' };
    if (!isTime(o.start_time) || !isTime(o.end_time) || o.start_time >= o.end_time) return { error: '開始・終了の時刻を入れてください（終了は開始より後）' };
    if (!/^[1-9]\d{0,2}$/.test(o.capacity)) return { error: '定員を数で入れてください' };
    if (!isMonth(o.open_from) || !isMonth(o.open_to) || o.open_from > o.open_to) return { error: '開講期間（はじめの月・終わりの月）を選んでください' };
    if (!f.id && !o.term) o.term = o.open_from;
    return { args: o };
  }

  /**
   * 開講日を作る（session.generate）の args。f: {classId, kind, how: 'weekly'|'biweekly'|'nth'|'manual', weekday, weeks:[1,3],
   * startDate, endBy: 'count'|'date', count, endDate, skipText, datesText}
   */
  function generateArgs(f, cls) {
    var o = { classId: s(f.classId), kind: f.kind || 'lesson', startDate: s(f.startDate) };
    if (!isDate(o.startDate)) return { error: '最初の日を選んでください' };
    var wd = f.weekday === '' || f.weekday === undefined ? (cls ? WEEKDAYS.indexOf(cls.weekday) : -1) : +f.weekday;
    // 日付は選択欄で足した配列（U-14）。前の形（1行に1つの文字）も読む
    var dates = function (t) { return Array.isArray(t) ? t.map(s).filter(Boolean) : String(t || '').split(/[\s,、]+/).map(s).filter(Boolean); };
    if (f.how === 'manual') {
      if (Array.isArray(f.dates) && !f.dates.length) return { error: '日付を1つ以上「追加」してください' };
      var ds = dates(f.dates !== undefined ? f.dates : f.datesText);
      var bad = ds.filter(function (d) { return !isDate(d); });
      if (!ds.length || bad.length) return { error: '日付を 2026-11-03 の形で1行に1つずつ入れてください' + (bad.length ? '（読めない: ' + bad.join('、') + '）' : '') };
      o.pattern = { type: 'manual', dates: ds };
    } else if (f.how === 'nth') {
      var weeks = (f.weeks || []).map(Number).filter(function (n) { return n >= 1 && n <= 5; });
      if (!weeks.length) return { error: '第何週かを1つ以上選んでください' };
      if (wd < 0) return { error: '曜日を選んでください' };
      o.pattern = { type: 'nth', weekday: wd, weeks: weeks };
    } else if (f.how === 'biweekly' || f.how === 'weekly') {
      if (wd < 0) return { error: '曜日を選んでください' };
      if (f.how === 'weekly') o.pattern = { type: 'nth', weekday: wd, weeks: [1, 2, 3, 4, 5] };
      else o.pattern = { type: 'biweekly', weekday: wd };
    } else return { error: '日の決め方を選んでください' };
    if (f.endBy === 'date') {
      if (!isDate(f.endDate) || s(f.endDate) < o.startDate) return { error: '終わりの日を選んでください（最初の日より後）' };
      o.endDate = s(f.endDate);
    } else if (f.endBy === 'count') {
      if (!/^[1-9]\d{0,2}$/.test(s(f.count))) return { error: '回数を数で入れてください' };
      o.count = +s(f.count);
    }   // どちらも無ければクラスの終わりの月まで
    var skips = dates(f.skips !== undefined ? f.skips : f.skipText);
    if (skips.some(function (d) { return !isDate(d); })) return { error: '休みの日は 2026-12-29 の形で入れてください' };
    if (skips.length) o.skipDates = skips;
    if (s(f.startNumber)) o.startNumber = +s(f.startNumber);
    if (!o.classId && o.kind === 'lesson') return { error: 'クラスを選んでください' };
    return { args: o };
  }

  /** 1回ずつ追加（session.add）の args */
  function addArgs(f) {
    var o = { kind: s(f.kind) || 'lesson', classId: s(f.classId), date: s(f.date), startTime: s(f.startTime), endTime: s(f.endTime),
      number: s(f.number), capacity: s(f.capacity), title: s(f.title) };
    if (!KIND[o.kind]) return { error: '種類を選んでください' };
    if (o.kind === 'lesson' && !o.classId) return { error: '授業はクラスを選んでください' };
    if (!isDate(o.date)) return { error: '日付を選んでください' };
    if (o.kind === 'lesson' && !/^[1-9]\d*$/.test(o.number)) return { error: '追加の授業にも回番号を入れてください' };
    if (!o.classId && (!isTime(o.startTime) || !isTime(o.endTime))) return { error: '開始・終了の時刻を入れてください' };
    if (o.kind === 'lesson') o.extra = true;
    Object.keys(o).forEach(function (k) { if (o[k] === '') delete o[k]; });
    return { args: o };
  }

  /** 日程の変更（session.change）の args（変わった所だけ） */
  function changeArgs(cur, f) {
    var o = { sessionId: cur.id };
    if (s(f.date) && s(f.date) !== cur.date) o.date = s(f.date);
    if (s(f.startTime) && s(f.startTime) !== cur.start_time) o.startTime = s(f.startTime);
    if (s(f.endTime) && s(f.endTime) !== cur.end_time) o.endTime = s(f.endTime);
    if (s(f.capacity) && s(f.capacity) !== s(cur.capacity)) {
      if (!/^[1-9]\d{0,2}$/.test(s(f.capacity))) return { error: '定員は数で入れてください' };
      o.capacity = s(f.capacity);
    }
    if (Object.keys(o).length === 1) return { error: '変わった所がありません' };
    return { args: o };
  }

  /** 日程の一覧の1行（状態・カレンダー・押せる操作） */
  function sessionRows(sessions, classes, today) {
    var cm = byId(classes);
    return (sessions || []).map(function (x) {
      var canceled = x.status === 'canceled', past = x.date < today;
      var c = cm[x.class_id];
      var name = x.kind === 'lesson' ? (c ? c.label : '') + (x.number ? ' 第' + x.number + '回' : '') + (x.extra === '1' ? '（追加）' : '')
        : (KIND[x.kind] || x.kind) + (x.title ? ' ' + x.title : '') + (c ? '（' + c.label + '）' : '');
      return { id: x.id, date: core.fmtDate(x.date), time: (x.start_time || '') + '〜' + (x.end_time || ''), name: name,
        status: canceled ? '中止' : '', moved: x.original_date ? '（もとは ' + core.fmtDate(x.original_date) + '）' : '',
        cal: CAL[x.cal_state] || '', calBad: x.cal_state === 'failed',
        actions: past ? [] : canceled ? ['uncancel'] : ['change', 'cancel'].concat(x.kind === 'lesson' ? ['renumber'] : []),   // 終わった回は操作を出さない（U-12）
        past: past, raw: x };
    });
  }

  /** 確認画面の文の中の生徒の番号（S_…）を名前に置き換える */
  function withNames(lines, names) {
    return (lines || []).map(function (l) {
      return core.humanize(l, { students: names || {} });   // 生徒以外の記号・英語の状態・日付も日本語に（直し第3弾）
    });
  }

  /**
   * 中止の解除の選択肢（6-5: スタッフが1件ずつ選ぶ）。confirm の応答 d（confirm 文の配列・candidates）→
   * {intro, groups:[{key:'absenceIds', title, items:[{id, label}]}], rest}（rest は選択肢でない文）
   */
  function uncancelChoices(d, names) {
    var raw = ((d && d.confirm) || []).map(String), lines = withNames(raw, names), c = (d && d.candidates) || {};
    var cl = (d && d.candidate_labels) || null;   // サーバーが名前にした選択肢の文（確認の文から記号を外したので、番号で探せないとき用・直し第3弾）
    var used = {};
    var group = function (key, title, ids) {
      return { key: key, title: title, items: (ids || []).map(function (id) {
        var i = -1;
        raw.forEach(function (l, j) { if (i < 0 && l.indexOf(id) >= 0 && /^［/.test(l)) i = j; });
        if (i >= 0) used[i] = 1;
        var text = cl && cl[id] ? cl[id] : i >= 0 ? lines[i].replace(/^［[^］]*］\s*/, '') : id;
        return { id: id, label: text };
      }) };
    };
    var groups = [group('absenceIds', '中止の前に出ていた欠席連絡（戻すと「欠席」の連絡に戻ります）', c.absences),
      group('makeupIds', '取り消した振替（戻すと振替の予約に戻ります。空席を確かめます）', c.makeups),
      group('ticketIds', '失効させた振替券（戻すと使える券に戻ります）', c.tickets)].filter(function (g) { return g.items.length; });
    var rest = lines.filter(function (l, j) { return j > 0 && !used[j] && !(cl && /^［/.test(l)); });
    return { intro: lines[0] || '', groups: groups, rest: rest, askPerson: !!(d && d.confirmWithPerson) };
  }

  function contactRows(contacts, sessions, students, classes) {
    var sm = byId(sessions), stm = byId(students), maps = core.nameMaps(students, classes, sessions);
    return (contacts || []).map(function (c) {
      var x = sm[c.session_id];
      var p = stm[c.student_id] || {};
      return { id: c.id, name: c.student_name || c.student_id, what: CONTACT_REASON[c.reason] || c.reason, message: core.humanize(c.message || '', maps),
        reach: [p.phone ? '電話 ' + p.phone : '', p.line_name ? 'LINE ' + p.line_name : ''].filter(Boolean).join('・'),
        session: x ? core.fmtDate(x.date) + ' ' + (x.start_time || '') : '', at: core.fmtDateTime(c.created_at), done: c.contacted === '1',
        doneText: c.contacted === '1' ? '連絡済み（' + core.fmtDateTime(c.contacted_at) + (c.contacted_by ? '・' + c.contacted_by : '') + '）' : '' };
    });
  }

  /* ---------- 生徒・在籍（S1-31・S1-32） ---------- */

  var STUDENT_FIELDS = [
    { key: 'name', label: '名前', required: true }, { key: 'kana', label: 'ふりがな', required: true },
    { key: 'phone', label: '電話' }, { key: 'email', label: 'メール' }, { key: 'line_name', label: 'LINEの名前' },
    { key: 'joined', label: '入会日', type: 'date' }, { key: 'id_checked', label: '本人確認', type: 'checkbox', mark: '確認済み' },
    { key: 'consent_date', label: '同意した日', type: 'date' },
    { key: 'kaihipay_registered', label: '会費ペイの登録', type: 'checkbox', mark: '登録済み' }, { key: 'source', label: 'きっかけ', type: 'select' },
    { key: 'memo', label: 'メモ', type: 'textarea' }];
  /** きっかけの選択肢（サーバー LogicAdmin.js ADM_STUDENT_SOURCES と同じ・10/4 仮置き【要確認】） */
  var STUDENT_SOURCES = ['紹介', 'Instagram', '検索', '体験レッスン', 'その他'];

  /** 入力欄の値をサーバーに送る文字にする（印は 1 か空）。前の値が形に合わない（移行前の文字）とき、空のままなら変えない */
  function studentValue(x, f, cur) {
    var v = x.type === 'checkbox' ? (f[x.key] === true || f[x.key] === '1' ? '1' : '') : s(f[x.key]);
    var old = s(cur && cur[x.key]);
    if (cur && x.type === 'checkbox' && old !== '1' && v === '') return old;
    if (cur && x.type === 'date' && old && !isDate(old) && v === '') return old;
    return v;
  }
  /** 生徒の登録・編集の入力欄（印はチェック・日付・きっかけは選ぶ形。前の値が選択肢に無ければ「（前の入力）」で残す） */
  function studentFormFields(cur) {
    return STUDENT_FIELDS.map(function (f) {
      var v = cur ? cur[f.key] : '', o = { key: f.key, label: f.label + (f.required ? '（必ず）' : ''), type: f.type, value: v };
      if (f.type === 'checkbox') { o.label = f.label + ': ' + f.mark; o.value = s(v) === '1'; }
      if (f.type === 'date' && v && !isDate(v)) { o.value = ''; o.hint = '前の入力: ' + v + '（日付を選ぶと置き換わります）'; }
      if (f.key === 'source') {
        o.options = [{ value: '', label: '選んでください（空のまま可）' }].concat(STUDENT_SOURCES.map(function (x) { return { value: x, label: x }; }));
        if (s(v) && STUDENT_SOURCES.indexOf(s(v)) < 0) o.options.push({ value: s(v), label: '（前の入力）' + s(v) });
      }
      return o;
    });
  }
  /** 生徒一覧の「今のクラス」列の文字（student.list の current → クラス名。休止中・予定は印） */
  function currentClassText(current, classes, courses) {
    var cm = byId(classes), co = byId(courses);
    if (!current || !current.length) return '今月の在籍なし';
    return current.map(function (x) {
      var c = cm[x.class_id], name = c ? ((c.label || '') + ' ' + (c.start_time || '') + (co[c.course_id] ? '（' + co[c.course_id].name + '）' : '')).trim() : x.class_id;
      return name + (x.state === 'paused' ? '［休止中］' : '') + (x.planned ? '［予定］' : '');
    }).join('、');
  }
  /** 詳細に出す文字（印は「確認済み」など・日付は月日） */
  function studentFieldText(f, v, fmtDate) {
    v = s(v);
    if (f.type === 'checkbox') return v === '1' ? f.mark : v;
    if (f.type === 'date' && isDate(v) && fmtDate) return fmtDate(v);
    return v;
  }

  /** 生徒の保存の args（新規は全部・編集は変わった所だけ） */
  function studentArgs(cur, f) {
    var o = {};
    STUDENT_FIELDS.forEach(function (x) {
      var v = studentValue(x, f, cur);
      if (cur ? v !== s(cur[x.key]) : v !== '') o[x.key] = v;
    });
    var name = o.name !== undefined ? o.name : s(cur && cur.name), kana = o.kana !== undefined ? o.kana : s(cur && cur.kana);
    if (!name || !kana) return { error: '名前とふりがなを入れてください' };
    if (o.joined === '' && cur) return { error: '入会日は消せません（日付を入れてください）' };
    if (o.joined && !isDate(o.joined)) return { error: '入会日を選んでください' };
    if (o.consent_date && !isDate(o.consent_date)) return { error: '同意した日を選んでください' };
    if (o.source && STUDENT_SOURCES.indexOf(o.source) < 0) return { error: 'きっかけを選んでください' };
    if (cur) { if (!Object.keys(o).length) return { error: '変わった所がありません' }; o.id = cur.id; }
    return { args: o };
  }

  /** 生徒一覧の絞り込み（名前・ふりがなの一部）。ふりがな順 */
  function filterStudents(list, q) {
    var k = s(q).replace(/[\s　]+/g, '');
    return (list || []).filter(function (x) {
      return !k || (x.name + x.kana).replace(/[\s　]+/g, '').indexOf(k) >= 0;
    }).sort(function (a, b) { return (a.kana || '') < (b.kana || '') ? -1 : (a.kana || '') > (b.kana || '') ? 1 : 0; });
  }

  /** 完全削除の氏名入力が合っているか（空白は無視・サーバーと同じ） */
  function sameName(typed, name) {
    var t = s(typed).replace(/[\s　]+/g, ''), n = s(name).replace(/[\s　]+/g, '');
    return t !== '' && t === n;
  }

  /**
   * 在籍の時系列（過去〜予定）。enrollments は student.get の在籍（from_month 順）。
   * 1行 → {id, cls, period, state, kind, badges, actions:[move|pause|end|resume|confirm|correct]}
   * 押せる操作: 取り消した行は無し／予定の行は「確定」「予定を取り消す」「訂正」／休止中（終わり未定・復帰の予定なし）は「復帰」／在籍中で今月以降も続く行は「移動・休止・1クラス終了」
   */
  function enrollmentTimeline(enrollments, classes, courses, today) {
    var cm = byId(classes), co = byId(courses), m = String(today).slice(0, 7);
    var hasNext = {};
    (enrollments || []).forEach(function (e) { if (e.void !== '1' && e.prev_id) hasNext[e.prev_id] = 1; });
    return (enrollments || []).map(function (e) {
      var voided = e.void === '1', planned = e.fixed === 'planned', paused = e.state === 'paused';
      var ended = !!e.to_month && e.to_month < m;
      var period = core.fmtMonth(e.from_month) + ' 〜 ' + (e.to_month ? core.fmtMonth(e.to_month) : (paused ? '（終わり未定）' : '（続く）'));
      var badges = [];
      if (voided) badges.push('取り消し済み' + (e.void_reason ? '（' + e.void_reason + '）' : ''));
      if (planned) badges.push('予定（まだ確定していない）');
      if (e.cont_decided) badges.push('継続確認: ' + (CONT[e.cont_decided] || e.cont_decided));
      var actions = [];
      if (!voided) {
        if (planned) actions.push('confirm', 'cancel_plan');
        else if (paused && !e.to_month && !hasNext[e.id]) actions.push('resume');
        else if (!paused && !ended && !hasNext[e.id]) actions.push('move', 'pause', 'end');
        actions.push('correct');
      }
      return { id: e.id, cls: classLabel(cm[e.class_id], co), classId: e.class_id, period: period, state: paused ? '休止' : '在籍',
        kind: LINK_KIND[e.link_kind] || e.link_kind || '', badges: badges, actions: actions, voided: voided, now: !voided && e.from_month <= m && (!e.to_month || e.to_month >= m),
        raw: e };
    });
  }

  /**
   * 復帰先のクラスの候補（7-6 plan_resume・D-77）: month を開講期間に含むクラス。休止したクラスが入るならそれが既定。
   * 入らない（期をまたいだ）ときは既定なし＝選ばないと確定できない
   */
  function resumeChoices(paused, month, classes) {
    var list = (classes || []).filter(function (c) { return c.hidden !== '1' && inOpen(c, month); });
    var own = list.filter(function (c) { return paused && c.id === paused.class_id; })[0];
    return { classes: list, defaultId: own ? own.id : '', mustChoose: !own };
  }

  /** 在籍の訂正の patch（変わった所だけ） */
  function correctPatch(cur, f) {
    var p = {};
    if (s(f.from_month) && s(f.from_month) !== cur.from_month) p.from_month = s(f.from_month);
    if (s(f.to_month) !== s(cur.to_month)) p.to_month = s(f.to_month);
    if (s(f.class_id) && s(f.class_id) !== cur.class_id) p.class_id = s(f.class_id);
    if (s(f.state) && s(f.state) !== cur.state) p.state = s(f.state);
    if (!Object.keys(p).length) return { error: '変わった所がありません' };
    if (p.to_month && (p.from_month || cur.from_month) > p.to_month) return { error: '終わりの月がはじめの月より前です' };
    return { args: { enrollmentId: cur.id, patch: p } };
  }

  function withdrawalRows(ws) {
    return (ws || []).map(function (w) {
      return { id: w.id, text: core.fmtMonth(core.addMonths(w.apply_month, -1)) + 'まで来て退会' + (w.received_on ? '（受けた日 ' + core.fmtDate(w.received_on) + '）' : '') +
        (w.reason ? '・理由: ' + w.reason : ''), active: w.status === 'active',
        state: w.status === 'active' ? '' : '取り消し済み' + (w.void_reason ? '（' + w.void_reason + '）' : '') };
    });
  }

  /** 生徒さんの専用リンク（5-3: 生徒さん画面のURL#t=<トークン>）。URL が未設定なら '' */
  function linkUrl(base, token) {
    base = s(base);
    if (!base || !token) return '';
    return base.replace(/#.*$/, '') + '#t=' + token;
  }

  /** アカウントの役割の選択肢。recorder_only は今その役割の行を直すときだけ出す（尚哉 10/4） */
  function roleOptions(curRole) {
    var keys = ROLE_PICK.concat(curRole === 'recorder_only' ? ['recorder_only'] : []);
    return keys.map(function (k) { return { value: k, label: ROLE[k] }; });
  }

  var A = { linkUrl: linkUrl, MAKEUP_TYPE: MAKEUP_TYPE, KIND: KIND, ROLE: ROLE, roleOptions: roleOptions, WEEKDAYS: WEEKDAYS, STUDENT_FIELDS: STUDENT_FIELDS, STUDENT_SOURCES: STUDENT_SOURCES, studentFormFields: studentFormFields, studentFieldText: studentFieldText, currentClassText: currentClassText, monthOptions: monthOptions, byId: byId,
    classLabel: classLabel, terms: terms, inOpen: inOpen, accountRows: accountRows, accountArgs: accountArgs, settingsArgs: settingsArgs,
    calendarFailureRows: calendarFailureRows, calendarNote: calendarNote, courseArgs: courseArgs, classArgs: classArgs, generateArgs: generateArgs,
    addArgs: addArgs, changeArgs: changeArgs, sessionRows: sessionRows, withNames: withNames, uncancelChoices: uncancelChoices,
    contactRows: contactRows, studentArgs: studentArgs, filterStudents: filterStudents, sameName: sameName, enrollmentTimeline: enrollmentTimeline,
    resumeChoices: resumeChoices, correctPatch: correctPatch, withdrawalRows: withdrawalRows };
  if (typeof module !== 'undefined' && module.exports) module.exports = A;
  else { root.App = root.App || {}; root.App.admin = A; }
})(typeof window !== 'undefined' ? window : this);
