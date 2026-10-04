/**
 * views.js — 画面に出す形を組み立てる（DOM に触らない・Node でテストする）。
 * 講師画面（S1-37）・当日名簿（S1-38）・月の名簿と出欠簿（S1-33）・変更履歴（S1-38）。
 */
(function (root) {
  'use strict';
  var core = (typeof module !== 'undefined' && module.exports) ? require('./core.js') : root.App.core;

  var RESULT_LABEL = { present: '出席', absent: '欠席', makeup_present: '振替出席' };
  var KIND_LABEL = { lesson: '授業', makeupday: '振替Day', trial: '体験', individual: '個別' };
  var STATUS = {
    expected: { label: '出席予定', cls: 'st-expected' },
    absent: { label: '欠席連絡あり', cls: 'st-absent' },
    makeup_in: { label: '振替で来る', cls: 'st-in' },
    makeup_out: { label: '振替で他へ', cls: 'st-out' },
    walk_in: { label: '予約なしで記録あり', cls: 'st-walk' }
  };

  function where(w) {
    if (!w) return '';
    var t = core.fmtDate(w.date) + ' ' + (w.start_time || '');
    if (w.kind === 'makeupday') return t + ' 振替Day';
    return t + ' ' + (w.class_label || '') + (w.number ? ' 第' + w.number + '回' : '');
  }

  function sessionTitle(s) {
    var head = (s.start_time || '') + (s.end_time ? '〜' + s.end_time : '');
    var name = s.class_label || KIND_LABEL[s.kind] || '';
    if (s.kind !== 'lesson' && s.title) name += (name ? ' ' : '') + s.title;
    if (s.kind === 'makeupday' && !s.class_label) name = '振替Day' + (s.title ? ' ' + s.title : '');
    return head + ' ' + name + (s.number ? ' 第' + s.number + '回' : '');
  }

  /** 出欠のボタン（8-2）: 振替Day・振替で来る人は「振替出席／欠席」、それ以外は「出席／欠席」。振替で他へ行く人にはボタンを出さない */
  function buttonsFor(session, person) {
    if (person.status === 'makeup_out') return [];
    if (session.kind === 'makeupday' || person.status === 'makeup_in') return ['makeup_present', 'absent'];
    return ['present', 'absent'];
  }

  /** teacher.day の応答 → 講師画面の形 */
  function teacherDayView(day) {
    var sessions = (day && day.sessions) || [];
    return {
      date: day ? day.date : '',
      dateLabel: core.fmtDate(day && day.date),
      empty: sessions.length === 0,
      sessions: sessions.map(function (s) {
        var counts = { expected: 0, absent: 0, makeup_in: 0, makeup_out: 0, walk_in: 0, recorded: 0 };
        var rows = (s.students || []).map(function (p) {
          counts[p.status] = (counts[p.status] || 0) + 1;
          if (p.attendance) counts.recorded++;
          var st = STATUS[p.status] || { label: p.status, cls: '' };
          var notes = [];
          if (p.status === 'absent') notes.push('欠席連絡があります（来たら「出席」で大丈夫です）');
          if (p.status === 'makeup_out' && p.to) notes.push('振替先: ' + where(p.to));
          if (p.status === 'makeup_in' && p.from) notes.push('振替元: ' + where(p.from));
          if (p.attendance === 'present' && p.status === 'absent') notes.push('連絡ありで出席');
          return {
            student_id: p.student_id, name: p.name, kana: p.kana, statusLabel: st.label, statusCls: st.cls,
            attendance: p.attendance || '', attendanceLabel: RESULT_LABEL[p.attendance] || '未記録',
            buttons: buttonsFor(s, p).map(function (r) { return { result: r, label: RESULT_LABEL[r], on: p.attendance === r }; }),
            canClear: !!p.attendance, notes: notes,
            karte: (p.notes || []).map(function (n) { return core.fmtDate(n.date) + (n.tag ? '【' + n.tag + '】' : '') + ' ' + n.body; })
          };
        });
        return { session_id: s.session_id, kind: s.kind, title: sessionTitle(s), course: s.course_name || '', teacher: s.teacher || '',
          rows: rows, counts: counts, plannedNote: plannedNote(s.planned),
          summary: '出席予定 ' + (counts.expected + counts.makeup_in) + '人（うち振替で来る ' + counts.makeup_in + '人）・欠席連絡 ' + counts.absent +
            '人・振替で他へ ' + counts.makeup_out + '人／記録済み ' + counts.recorded + '人' };
      })
    };
  }

  /**
   * 講師画面・当日名簿の見出し（04b U-01）: 今日なら「今日のクラス」、ほかの日は「10月3日（土）のクラス」と色付きの帯の文。
   * kind: 'teacher'（のクラス）／'roster'（の名簿）
   */
  function dayHeading(date, today, kind) {
    var tail = kind === 'roster' ? 'の名簿' : 'のクラス';
    if (date === today) return { title: '今日' + tail, alert: '' };
    var past = date < today;
    return { title: core.fmtDate(date) + tail,
      alert: '今日ではありません（' + core.fmtDate(date) + (past ? '・過ぎた日' : '・先の日') + 'を表示中）。今日に戻すには「今日」を押してください' };
  }

  /** 出欠を押した瞬間の表示（尚哉 10/4③・U-02）: teacher.day の1回分の写しで、その生徒の出欠だけ変える（result が '' なら未記録） */
  function withAttendance(session, studentId, result) {
    var s = JSON.parse(JSON.stringify(session || {}));
    (s.students || []).forEach(function (p) { if (p.student_id === studentId) p.attendance = result || ''; });
    return s;
  }
  /** 1回分の写し → その回の講師画面の形（行・まとめの文）。date は見出しに使わないので空でよい */
  /** 移動・復帰の予定（まだ確定していない）の人: 枠・人数に入れず、別に1行で書く（尚哉 10/4・S7）。いなければ '' */
  function plannedNote(list) {
    var names = (list || []).map(function (p) { return p.name + 'さん'; });
    return names.length ? '移動・復帰の予定（まだ確定していません・人数に入れていません）: ' + names.join('、') : '';
  }

  function sessionView(session) { return teacherDayView({ date: '', sessions: [session] }).sessions[0]; }

  /** 当日名簿（出欠簿・8-1）: teacher.day の応答 → 印刷用の表（予定・出欠欄。未記録は空欄） */
  function dayRosterView(day) {
    var tv = teacherDayView(day);
    return {
      title: tv.dateLabel + ' の名簿',
      empty: tv.empty,
      sessions: tv.sessions.map(function (s) {
        return { title: s.title, course: s.course, teacher: s.teacher, summary: s.summary, plannedNote: s.plannedNote,
          rows: s.rows.map(function (r, i) {
            return { no: i + 1, name: r.name, kana: r.kana, plan: r.statusLabel, memo: r.notes.join('／'),
              attendance: r.attendance ? r.attendanceLabel : '' };
          }) };
      })
    };
  }

  /** 出欠簿の1マス: 出席実績と欠席連絡を並べる（「連絡ありで出席」が分かる・R-03） */
  function bookCell(c) {
    if (!c) return { text: '', cls: '' };
    var r = c.result, t = RESULT_LABEL[r] || '';
    if (c.absent && r === 'present') return { text: '出席（連絡あり）', cls: 'c-warn' };
    if (c.absent && !r) return { text: c.makeup_out ? '連絡・振替' : '連絡あり', cls: 'c-abs' };
    if (c.absent && r) return { text: t + '（連絡あり）', cls: 'c-abs' };
    if (c.makeup_out && !r) return { text: '振替', cls: 'c-abs' };
    return { text: t, cls: r === 'absent' ? 'c-abs' : '' };
  }

  /** roster.month の応答 → クラス別の名簿と出欠簿（回×生徒）。予定の人は表に入れず plannedNote に別に書く */
  function rosterMonthView(data) {
    var classes = (data && data.classes) || [];
    return {
      title: core.fmtMonth(data && data.month) + ' の名簿・出欠簿',
      empty: classes.length === 0,
      classes: classes.map(function (c) {
        return {
          title: c.label + (c.course_name ? '（' + c.course_name + '）' : ''),
          teacher: c.teacher,
          count: c.students.filter(function (p) { return !p.planned; }).length,
          plannedNote: plannedNote(c.students.filter(function (p) { return p.planned; })),
          heads: c.sessions.map(function (s) {
            var d = String(s.date).split('-');
            return (+d[1]) + '/' + (+d[2]) + (s.number ? ' 第' + s.number + '回' : '') + (s.status === 'canceled' ? ' 中止' : '');
          }),
          rows: c.students.filter(function (p) { return !p.planned; }).map(function (p, i) {
            return { no: i + 1, name: p.name, kana: p.kana,
              cells: c.sessions.map(function (s) { return s.status === 'canceled' ? { text: '—', cls: '' } : bookCell((c.cells[p.student_id] || {})[s.id]); }) };
          })
        };
      })
    };
  }

  var OP_LABEL = { insert: '追加', update: '変更', delete: '削除' };
  function parseJson(s) {
    if (s === null || s === undefined || s === '') return {};
    if (typeof s === 'object') return s;
    try { var v = JSON.parse(s); return v && typeof v === 'object' ? v : { '値': v }; } catch (e) { return { '値': String(s) }; }
  }
  /** 変更履歴（見るだけ・R-30）: 1行 → {日時・誰・表・操作・変わった所} */
  function historyView(rows) {
    return (rows || []).map(function (h) {
      var b = parseJson(h.before), a = parseJson(h.after), keys = {};
      Object.keys(b).concat(Object.keys(a)).forEach(function (k) { keys[k] = 1; });
      var changes = Object.keys(keys).filter(function (k) { return JSON.stringify(b[k]) !== JSON.stringify(a[k]); }).map(function (k) {
        return { key: k, before: b[k] === undefined ? '' : String(b[k]), after: a[k] === undefined ? '' : String(a[k]) };
      });
      var who = String(h.account_email || '');
      if (/^student:/.test(who)) who = '生徒さん（専用リンク）';
      else if (/^system:/.test(who)) who = 'システム';
      return { at: core.fmtDateTime(h.at), who: who + (h.recorder ? '（記録: ' + h.recorder + '）' : ''), table: h.table,
        op: OP_LABEL[h.op] || h.op, row: h.row_id, receipt: h.receipt_id || '', changes: changes };
    });
  }

  /** 変更履歴の「変わった所」1つ → 「開始の月: 10月 → 11月」（列名・状態・記号を日本語と名前に。U-18）。maps は core.nameMaps の結果 */
  function changeText(c, maps) {
    var v = function (x) { return x ? core.humanize(x, maps) : '（空）'; };
    return core.fieldLabel(c.key) + ': ' + v(c.before) + ' → ' + v(c.after);
  }

  var views = { plannedNote: plannedNote, changeText: changeText, dayHeading: dayHeading, withAttendance: withAttendance, sessionView: sessionView, teacherDayView: teacherDayView, dayRosterView: dayRosterView, rosterMonthView: rosterMonthView, bookCell: bookCell,
    historyView: historyView, buttonsFor: buttonsFor, RESULT_LABEL: RESULT_LABEL };
  if (typeof module !== 'undefined' && module.exports) module.exports = views;
  else { root.App = root.App || {}; root.App.views = views; }
})(typeof window !== 'undefined' ? window : this);
