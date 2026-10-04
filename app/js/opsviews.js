/**
 * opsviews.js — 第3弾の画面の組み立てと入力の確かめ（DOM に触らない・Node でテストする）。
 * 振替・欠席（S1-34）・振替券の台帳（S1-35a）・要確認と修復（S1-35b）・継続確認と一括移行（S1-36）・管理ホーム（S1-36a）。
 * サーバーの判断（締切・満席・止める判定・整合の確認）は画面で先回りしない。画面は「何が起きるか」を見せ、選ばせるだけ。
 */
(function (root) {
  'use strict';
  var node = typeof module !== 'undefined' && module.exports;
  var core = node ? require('./core.js') : root.App.core;
  var A = node ? require('./adminviews.js') : root.App.admin;

  function s(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function byId(list) { var m = {}; (list || []).forEach(function (r) { m[r.id] = r; }); return m; }

  /** 日本時間の「yyyy-MM-dd HH:mm」 */
  function nowJst(now) {
    var d = new Date((now || new Date()).getTime() + 9 * 3600000);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
  }
  /** 回が始まったか（日付＋開始時刻・日本時間）。開始時刻が無い回は日付が過ぎたら */
  function started(ses, now) {
    if (!ses) return false;
    var at = ses.date + ' ' + (s(ses.start_time) || '00:00');
    return nowJst(now) >= at;
  }

  /** 回の表示: 10月6日（火） 10:00 火クラス 第3回（中止） */
  function sesLabel(ses, classes) {
    if (!ses) return '（回が見つかりません）';
    var c = byId(classes)[ses.class_id];
    var name = ses.kind === 'lesson' ? (c ? c.label : '授業') : (A.KIND[ses.kind] || ses.kind) + (ses.title ? ' ' + ses.title : (c ? ' ' + c.label : ''));
    return core.fmtDate(ses.date) + ' ' + s(ses.start_time) + ' ' + name + (s(ses.number) ? ' 第' + ses.number + '回' : '') + (ses.status === 'canceled' ? '（中止）' : '');
  }
  function sesOptions(list, classes, blank) {
    return (blank ? [{ value: '', label: blank }] : []).concat((list || []).map(function (x) { return { value: x.id, label: sesLabel(x, classes) }; }));
  }

  /* ---------- 振替・欠席（S1-34） ---------- */

  var MK_KIND = { mutual: '相互振替', makeupday: '振替Day' };
  var CANCEL_KIND = { before_start: '開始前の取消', after_start_no_show: '開始後の取消（来なかった）' };

  /**
   * makeup.list の行 → 一覧。取消は3つに分けて案内する（4-10・D-57）:
   *   before: 行く回の開始前＝そのまま取り消せる（席・券は戻る）
   *   after:  開始後＝理由が必要。振替Dayの券は既定で失効、戻すこともできる（参加が付いていたらサーバーが断る）
   */
  function makeupRows(makeups, sessions, classes, now) {
    var ses = byId(sessions);
    return (makeups || []).map(function (f) {
      var to = ses[f.to_session_id];
      var badges = [];
      if (f.staff_override === '1' || f.staff_override === true) badges.push('ルール外・満席の手登録');
      if (f.flag === 'source_canceled') badges.push('元の授業が中止（予約を残した）');
      if (f.flag === 'dest_date_changed') badges.push('行く回の日付が変わった（本人に確認）');   // 01 M1・R-26
      if (to && to.status === 'canceled') badges.push('行く回が中止になっています');
      return { id: f.id, student_id: f.student_id, name: f.student_name || f.student_id, kind: MK_KIND[f.kind] || f.kind, kindKey: f.kind,
        to: sesLabel(to, classes), to_date: f.to_date || (to && to.date) || '', canceled: f.status === 'canceled',
        canceledText: f.status === 'canceled' ? (CANCEL_KIND[f.cancel_kind] || '取消') + (f.cancel_reason ? '（' + f.cancel_reason + '）' : '') : '',
        mode: f.status === 'canceled' ? '' : started(to, now) ? 'after' : 'before', hasTicket: !!s(f.ticket_id), badges: badges };
    }).sort(function (a, b) { return a.to_date < b.to_date ? -1 : a.to_date > b.to_date ? 1 : 0; });
  }

  /** 取消の画面の文と入力（3分け）。row は makeupRows の1行 */
  function cancelPlan(row) {
    if (row.mode === 'before') {
      return { title: '振替を取り消しますか（開始前）', needReason: false, ticketChoice: false,
        lines: [row.name + ' さん: ' + row.to + ' の' + row.kind + 'を取り消します', '席は空きに戻ります' + (row.hasTicket ? '。振替券は使っていない状態に戻ります' : ''),
          '元の回の欠席連絡はそのまま残ります（来られるなら、欠席連絡も別に取り消してください）'] };
    }
    return { title: '開始後の取消（来なかった）', needReason: true, ticketChoice: row.kindKey === 'makeupday' && row.hasTicket,
      lines: [row.name + ' さん: ' + row.to + ' はもう始まっています', '来なかったので取り消す、という記録になります。理由を必ず書いてください',
        row.kindKey === 'makeupday' && row.hasTicket ? '振替券は、ふつうは失効（使ったのと同じ扱い）です。教室の判断で戻すときだけ下で「券を戻す」を選んでください' : '',
        '振替出席が付いているときは取り消せません（先に出欠を直します）'].filter(Boolean) };
  }
  function cancelArgs(row, f, repairOf) {
    var reason = s(f && f.reason);
    if (row.mode === 'after' && !reason) return { error: '開始後の取消は理由を書いてください' };
    var a = { makeupId: row.id };
    if (reason) a.reason = reason;
    if (row.mode === 'after' && f && f.ticket === 'return') a.returnTicket = true;
    if (repairOf) a.repair_of = repairOf;
    return { args: a };
  }

  var AB_STATUS = { active: '有効', withdrawn: '取消済み', not_needed: '不要（中止など）' };
  /** absence.list の行 → 一覧（新しい順） */
  function absenceRows(absences, sessions, classes) {
    var ses = byId(sessions);
    return (absences || []).map(function (b) {
      return { id: b.id, session: sesLabel(ses[b.session_id], classes), date: (ses[b.session_id] || {}).date || '', active: b.status === 'active',
        state: AB_STATUS[b.status] || b.status, by: (b.by_type === 'self' ? '生徒さん' : '教室') + (b.by_name && b.by_type !== 'self' ? '（' + b.by_name + '）' : '') };
    }).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  }

  /** 生徒が在籍しているクラスの回（欠席連絡・振替の元に選ぶ）。enrollments は student.get の在籍 */
  /** 欠席連絡の代行の「休む回」（04b U-08）: 今日以降を近い順に先に、終わった回は見出しの下に新しい順。既定は次の回 */
  function absenceOptions(own, classes, today) {
    var fut = (own || []).filter(function (x) { return x.date >= today; }), past = (own || []).filter(function (x) { return x.date < today; }).reverse();
    var opts = sesOptions(fut, classes, '回を選んでください');
    if (past.length) opts = opts.concat([{ value: '', label: '―― 終わった回（新しい順） ――' }], sesOptions(past, classes));
    return { options: opts, def: fut.length ? fut[0].id : '' };
  }
  function ownSessions(sessions, enrollments, from) {
    var cls = {};
    (enrollments || []).forEach(function (e) { if (s(e['void']) !== '1' && e.state === 'enrolled') cls[e.class_id] = e; });
    return (sessions || []).filter(function (x) {
      var e = cls[x.class_id];
      if (!e || x.kind !== 'lesson' || x.date < from) return false;
      var m = x.date.slice(0, 7);
      return m >= e.from_month && (!s(e.to_month) || m <= e.to_month);
    }).sort(function (a, b) { return (a.date + a.start_time) < (b.date + b.start_time) ? -1 : 1; });
  }

  /* ---------- 振替券の台帳（S1-35a） ---------- */

  var BASIS = { absence: '欠席連絡', no_show: '連絡なしの欠席', staff: '教室が発行' };
  var TK_STATE = { unused: '未使用', reserved: '予約中', used: '使用済み', 'void': '失効' };
  var VOID_REASON = { expired: '期限切れ', absence_withdrawn: '欠席連絡の取消', after_start_cancel: '開始後の取消', source_canceled: '元の授業が中止',
    reserved_no_show: '予約して来なかった' };
  function voidReason(r) {
    r = s(r);
    if (VOID_REASON[r]) return VOID_REASON[r];
    if (/^staff: /.test(r)) return '教室が失効（' + r.slice(7) + '）';
    return r;
  }

  /**
   * ticket.list の行（state つき）→ 台帳の1行。期限が null は「期限未確定」（基準の振替Dayがまだ登録されていない）。
   * 操作: 未使用＝延長・失効／予約中＝失効（予約の取消とセット）／使用済み＝発行元訂正・2枚目／失効＝なし
   */
  function ticketRows(tickets, sessions, classes, makeups) {
    var ses = byId(sessions), mk = byId(makeups);
    return (tickets || []).map(function (k) {
      var st = k.state || {}, state = st.state || 'unused';
      var m = st.makeupId ? mk[st.makeupId] : null;
      var actions = [];
      if (state === 'unused') actions = ['extend', 'void'];
      else if (state === 'reserved') actions = ['void'];
      else if (state === 'used') actions = s(k.used_fix_note) ? ['issue2'] : ['used_fix', 'issue2'];
      var notes = [];
      if (s(k.prev_ticket_id)) notes.push('2枚目（前の券 ' + k.prev_ticket_id + '）');
      if (s(k.extended_to)) notes.push('延長済み' + (k.extend_reason ? '（' + k.extend_reason + '）' : ''));
      if (s(k.used_fix_note)) notes.push('発行元訂正: ' + k.used_fix_note);
      if (s(k.issue_reason)) notes.push('発行の理由: ' + k.issue_reason);
      if (st.review) notes.push('要確認で止めています（新しい予約に使えません）');
      return { id: k.id, student_id: k.student_id, source: sesLabel(ses[k.source_session_id], classes), source_session_id: k.source_session_id,
        basis: BASIS[k.basis] || k.basis, expiry: st.expiry ? core.fmtDate(st.expiry) : '期限未確定', expiryUnset: !st.expiry, expiryRaw: st.expiry || '',
        state: state, stateLabel: (TK_STATE[state] || state) + (state === 'void' && st.reason ? '（' + voidReason(st.reason) + '）' : '') +
          (state === 'used' && st.reason === 'reserved_no_show' ? '（予約して来なかった）' : ''),
        usedAt: m ? sesLabel(ses[m.to_session_id], classes) : '', review: !!st.review, notes: notes, actions: actions,
        issued: core.fmtDateTime(k.issued_at) };
    }).sort(function (a, b) { return a.issued < b.issued ? 1 : -1; });
  }
  var TK_ACTION = { extend: '期限を延ばす', 'void': '失効させる', used_fix: '使用済み・発行元訂正', issue2: 'もう1回分を発行（2枚目）' };

  function extendArgs(row, f) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s(f.extendTo))) return { error: '延ばした後の期限（日付）を選んでください' };
    if (row.expiryRaw && s(f.extendTo) <= row.expiryRaw) return { error: '今の期限（' + core.fmtDate(row.expiryRaw) + '）より後の日にしてください' };
    if (!s(f.reason)) return { error: '理由を書いてください' };
    return { args: { ticketId: row.id, extendTo: s(f.extendTo), reason: s(f.reason) } };
  }
  function reasonArgs(base, f, extra) {
    if (!s(f.reason)) return { error: '理由を書いてください' };
    return { args: Object.assign({}, base, { reason: s(f.reason) }, extra || {}) };
  }

  /* ---------- 要確認と修復（S1-35b） ---------- */

  var RV_KIND = {
    absent_but_present: { title: '欠席連絡があるのに出席', what: '欠席連絡（と振替券）が残ったまま、出席が付きました' },
    no_show_pending: { title: '連絡なしで欠席（券を出すか）', what: '欠席連絡なしで「欠席」が付きました。振替券を出すか決めてください' },
    ticket_basis_lost: { title: '券の根拠がなくなった', what: '「欠席」を直したので、その欠席で出した振替券の根拠がなくなりました' },
    stalled: { title: '途中で止まった操作', what: '保存の途中で止まった操作があります。この生徒・回の振替や券の操作は止めています' }
  };
  var RESOLUTION = {
    withdraw_absence: { label: '欠席連絡を取り消す（未使用の券は失効）', reason: false, reserve: true },
    keep_ticket: { label: '券を残す', reason: true, reserve: false },
    issue: { label: '振替券を出す', reason: false, reserve: false },
    not_issue: { label: '券は出さない', reason: true, reserve: false },
    void_ticket: { label: '券を失効させる', reason: false, reserve: true }
  };
  var RESOLUTIONS = { absent_but_present: ['withdraw_absence', 'keep_ticket'], no_show_pending: ['issue', 'not_issue'], ticket_basis_lost: ['void_ticket', 'keep_ticket'] };

  function reviewRows(items, names, sessions, classes) {
    var ses = byId(sessions), nm = names || {};
    return (items || []).map(function (it) {
      var k = RV_KIND[it.kind] || { title: it.kind, what: '' };
      if (it.source === 'receipt') {
        return { key: it.receipt_id, source: 'receipt', title: k.title, what: k.what, receipt_id: it.receipt_id,
          who: (it.student_ids || []).map(function (x) { return nm[x] || x; }).join('・'),
          where: (it.session_ids || []).map(function (x) { return sesLabel(ses[x], classes); }).join('／'),
          opText: core.opLabel(it.op_type), detail: '操作: ' + core.opLabel(it.op_type) + '・受け付けた時刻 ' + core.fmtDateTime(it.received_at) + (it.minutes !== null && it.minutes !== undefined ? '（' + it.minutes + '分前）' : '') };
      }
      return { key: it.review_id, source: 'review', title: k.title, what: k.what, review_id: it.review_id, kind: it.kind,
        who: nm[it.student_id] || it.student_id || '', where: it.session_id ? sesLabel(ses[it.session_id], classes) : '',
        detail: it.ticket_id ? '振替券が関わっています' : '',
        choices: (RESOLUTIONS[it.kind] || []).map(function (r) { return { value: r, label: RESOLUTION[r].label, reason: RESOLUTION[r].reason, reserve: RESOLUTION[r].reserve }; }) };
    });
  }
  function resolveArgs(row, f) {
    var c = (row.choices || []).filter(function (x) { return x.value === f.resolution; })[0];
    if (!c) return { error: 'どう解決するかを選んでください' };
    if (c.reason && !s(f.reason)) return { error: '「' + c.label + '」は理由を書いてください' };
    var a = { reviewId: row.review_id, resolution: c.value };
    if (s(f.reason)) a.reason = s(f.reason);
    if (c.reserve && f.cancelReservation) a.cancelReservation = true;
    return { args: a };
  }

  var TABLE_HINT = { '欠席連絡': 'absence', '振替': 'makeup', '振替券': 'ticket', '出席実績': 'attendance', '在籍': 'enrollment' };
  /**
   * receipt.inspect → 「しようとしたこと」の1件ずつの表示と、その記録に使える修復の操作（6-6）。
   * 修復の操作は全部 repair_of（この受付番号）を付けて送る（付けないと止められる）。
   */
  function inspectView(d) {
    var items = (d.items || []).map(function (it) {
      var have = it.exists ? '表にある' : '表に無い';
      var same = it.same_as_plan === true ? '予定どおり書かれている' : it.same_as_plan === false ? (it.type === 'delete' ? '消えていない' : '予定と中身が違う') : '—';
      if (it.type === 'delete') have = it.exists ? '表にまだある' : '消えている';
      var ok = it.same_as_plan === true;
      // 手を付けていないと言い切れるのは「足すはずの行が無い」「消すはずの行が残っている」だけ（変更の行は中身が違っても途中かもしれない）
      var untouched = (it.type === 'insert' && !it.exists) || (it.type === 'delete' && it.exists);
      return { untouched: untouched, id: it.id, table: it.table || '（表が分からない）', type: { insert: '追加', update: '変更', 'delete': '削除' }[it.type] || it.type || '—',
        have: have, same: same, ok: ok, repair: it.exists && TABLE_HINT[it.table] ? TABLE_HINT[it.table] : '' };
    });
    var done = items.filter(function (x) { return x.ok; }).length;
    return { receipt_id: d.receipt_id, op: d.op_type, opText: core.opLabel(d.op_type), at: core.fmtDateTime(d.received_at), closed: d.status !== 'processing',
      summary: d.plan_omitted ? 'しようとしたことの中身は大きすぎて残っていません（表で直接確かめてください）'
        : 'しようとしたこと ' + items.length + ' 件のうち、予定どおり書かれているのは ' + done + ' 件',
      allWritten: items.length > 0 && done === items.length, noneWritten: items.length > 0 && items.every(function (x) { return x.untouched; }),
      items: items };
  }
  /** 閉じ方の案内: 全部書けている→訂正済み（このまま使う）／何も書けていない→取消済み（やり直す）／途中→直してから */
  function closeAdvice(v) {
    if (v.allWritten) return { status: 'corrected', text: '全部書けています。中身を確かめたら「訂正済みで閉じる」で止めを解きます' };
    if (v.noneWritten) return { status: 'voided', text: '何も書けていません。「取消済みで閉じる」で止めを解いて、操作を最初からやり直してください' };
    return { status: '', text: '途中まで書けています。下の「直す」で取り消すか訂正してから閉じてください（直っていないと閉じられません）' };
  }
  function closeArgs(receiptId, f) {
    if (f.status !== 'corrected' && f.status !== 'voided') return { error: '閉じ方を選んでください' };
    if (!s(f.reason)) return { error: '閉じる理由を書いてください' };
    return { args: { receiptId: receiptId, status: f.status, reason: s(f.reason) } };
  }
  /** receipt.close の断り（problems）→ 1行ずつ */
  function closeProblems(d) {
    return (d && d.problems) || [];
  }

  /* ---------- 継続確認・一括移行（S1-36） ---------- */

  var CONCL = { 'continue': '継続（同じコースの次のクラスへ）', move: '別のクラス・コースへ移動', end: 'このクラスだけ終了', pause: '休止' };
  function continuationView(d, classes, courses, names) {
    var cl = byId(classes), co = byId(courses), nm = names || {};
    var label = function (id) { return A.classLabel(cl[id], co) || id; };
    return {
      rows: ((d && d.rows) || []).map(function (r) {
        return { enrollment_id: r.enrollment_id, student_id: r.student_id, name: nm[r.student_id] || r.student_id, cls: label(r.class_id),
          end: core.fmtMonth(r.end_month), end_month: r.end_month, switch_month: r.switch_month, sw: core.fmtMonth(r.switch_month),
          late: false, move_planned: !!r.move_planned,
          options: (r.candidates || []).map(function (id, i) { return { value: id, label: (i === 0 ? '★ ' : '') + label(id) }; }),
          // 「継続」は同じコースのクラスだけ（尚哉の判断 10/4）
          contOptions: (r.candidates || []).filter(function (id) { return cl[id] && cl[r.class_id] && cl[id].course_id === cl[r.class_id].course_id; })
            .map(function (id) { return { value: id, label: label(id) }; }) };
      }),
      paused: ((d && d.paused) || []).map(function (p) {
        return { name: nm[p.student_id] || p.student_id, student_id: p.student_id, cls: label(p.class_id),
          period: core.fmtMonth(p.from_month) + 'から' + (p.to_month ? core.fmtMonth(p.to_month) + 'まで' : '（終わり未定）') };
      })
    };
  }
  /** 結論の入力 → args と、送る前に見せる確認の文（継続・移動・終了は画面の確認ダイアログ・尚哉 10/4） */
  function decideArgs(row, f, classLabelOf) {
    var c = s(f.conclusion);
    if (!CONCL[c]) return { error: '結論を選んでください' };
    var a = { enrollmentId: row.enrollment_id, conclusion: c }, lines;
    if (c === 'continue' || c === 'move') {
      var cid = s(c === 'continue' && f.contClassId !== undefined ? f.contClassId : f.classId);
      if (!cid) return { error: '次のクラスを選んでください' };
      if (c === 'continue' && row.contOptions && !row.contOptions.some(function (o) { return o.value === cid; })) {
        return { error: '「継続」は同じコースのクラスだけ選べます。別のコースへは「移動」を選んでください' };
      }
      a.classId = cid;
      lines = [row.name + ' さん: ' + row.cls + ' は ' + row.end + ' で終わり、' + row.sw + 'から ' + (classLabelOf ? classLabelOf(a.classId) : a.classId) + ' に確定で入ります',
        c === 'continue' ? '「継続」として記録します' : '「移動」として記録します', '間違えたときは生徒の画面の在籍の「訂正」で直します（自動では戻りません）'];
    } else if (c === 'end') {
      lines = [row.name + ' さん: ' + row.cls + ' は ' + row.end + ' で終わりです（次のクラスには入りません）', '他のクラスや生徒の登録はそのまま',
        '退会のときはここではなく、生徒の画面の「退会を記録する」を使ってください'];
    } else {
      if (f.month) a.month = s(f.month);
      lines = null;   // 休止はサーバーが影響の一覧（確認画面）を返す
    }
    return { args: a, lines: lines };
  }
  function rolloverArgs(f) {
    if (!/^\d{4}-\d{2}$/.test(s(f.fromTerm)) || !/^\d{4}-\d{2}$/.test(s(f.toTerm))) return { error: '今の期と次の期を選んでください' };
    if (s(f.toTerm) <= s(f.fromTerm)) return { error: '次の期は今の期より後にしてください' };
    var a = { fromTerm: s(f.fromTerm), toTerm: s(f.toTerm) };
    if (s(f.classId)) a.classId = s(f.classId);
    return { args: a };
  }

  /* ---------- 管理ホーム（S1-36a） ---------- */

  /** home.counts → カード（件数があれば目立たせ、行き先の画面へ） */
  function homeCards(c) {
    c = c || {};
    var n = function (k) { return Number(c[k]) || 0; };
    return [
      { key: 'today', label: '今日のクラス', count: n('today_classes'), route: 'teacher', unit: 'クラス', alert: false, note: '' },
      { key: 'review', label: '要確認', count: n('reviews'), route: 'review', unit: '件', alert: n('reviews') > 0,
        note: n('reviews') ? '止まっている振替・券の操作があります。先に見てください' : '' },
      { key: 'contact', label: '連絡が要る人', count: n('contacts'), route: 'contacts', unit: '件', alert: n('contacts') > 0, note: '' },
      { key: 'calendar', label: 'カレンダー反映の失敗', count: n('calendar_failed'), route: 'settings', unit: '件', alert: n('calendar_failed') > 0,
        note: (n('calendar_failed') ? '設定の「もう一度反映」で直します' : '') + (n('calendar_pending') ? (n('calendar_failed') ? '／' : '') + '反映待ち ' + n('calendar_pending') + ' 件' : '') },
      { key: 'continuation', label: '継続確認（まだ結論なし）', count: n('continuation'), route: 'continuation', unit: '人', alert: n('continuation') > 0, note: '' }
    ];
  }

  var O = { nowJst: nowJst, started: started, sesLabel: sesLabel, sesOptions: sesOptions, absenceOptions: absenceOptions, makeupRows: makeupRows, cancelPlan: cancelPlan, cancelArgs: cancelArgs,
    absenceRows: absenceRows, ownSessions: ownSessions, ticketRows: ticketRows, TK_ACTION: TK_ACTION, extendArgs: extendArgs, reasonArgs: reasonArgs,
    voidReason: voidReason, reviewRows: reviewRows, resolveArgs: resolveArgs, inspectView: inspectView, closeAdvice: closeAdvice, closeArgs: closeArgs,
    closeProblems: closeProblems, continuationView: continuationView, decideArgs: decideArgs, CONCL: CONCL, rolloverArgs: rolloverArgs, homeCards: homeCards };
  if (node) module.exports = O;
  else { root.App = root.App || {}; root.App.ops = O; }
})(typeof window !== 'undefined' ? window : this);
