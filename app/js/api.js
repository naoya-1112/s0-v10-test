/**
 * api.js — ①の doPost を呼ぶ部品（design 4章・8-3）と sk の置き場所（5-1）。DOM に触らないので Node でテストする。
 *  - fetch(URL, POST, text/plain, credentials omit, redirect follow)。時間切れ（30秒）・通信の失敗・JSONでない応答は「失敗」
 *  - 書き込み（receiptId あり）は失敗のとき同じ受付番号で自動で1回だけ再送（R-50・T-31）。auth.login は再送しない
 *  - 全要求に client_ver
 */
(function (root) {
  'use strict';
  var core = (typeof module !== 'undefined' && module.exports) ? require('./core.js') : root.App.core;

  /**
   * sk はまず画面のメモリ、localStorage は再読み込み後の復元用だけ（5-1・8-3）。storage が使えない端末でもタブの中で使える。
   * storage: localStorage 相当（getItem/setItem/removeItem）。読み書きは全部 try/catch。
   */
  function createSession(storage) {
    var KEY = 'ehon.sk', mem = { sk: '', who: null };
    var ls = function (fn) { try { return fn(); } catch (e) { return null; } };
    return {
      sk: function () { return mem.sk; },
      who: function () { return mem.who; },
      restore: function () {
        if (!mem.sk) { var v = ls(function () { return storage && storage.getItem(KEY); }); if (v) mem.sk = String(v); }
        return mem.sk;
      },
      set: function (sk, who) {
        mem.sk = sk || ''; mem.who = who || null;
        ls(function () { if (storage) storage.setItem(KEY, mem.sk); });
      },
      setWho: function (who) { mem.who = who || null; },
      clear: function () {
        mem.sk = ''; mem.who = null;
        ls(function () { if (storage) storage.removeItem(KEY); });
      }
    };
  }

  /**
   * opts: { url, fetch, session, recorder:()=>名前, timeoutMs?, setTimeout?, clearTimeout?, AbortController? }
   * call(fn, args, {receiptId?}) → Promise<classify の結果（kind・data）>。kind='fail' は2回目も失敗したとき
   */
  function createApi(opts) {
    var timeoutMs = opts.timeoutMs || 30000;
    var st = opts.setTimeout || (typeof setTimeout !== 'undefined' ? setTimeout : null);
    var ct = opts.clearTimeout || (typeof clearTimeout !== 'undefined' ? clearTimeout : function () {});
    var AC = opts.AbortController || (typeof AbortController !== 'undefined' ? AbortController : null);

    function once(body) {
      return new Promise(function (resolve) {
        var done = false, timer = null, ac = AC ? new AC() : null;
        var finish = function (x) { if (done) return; done = true; if (timer !== null) ct(timer); resolve(core.classify(x)); };
        if (st) timer = st(function () { if (ac) { try { ac.abort(); } catch (e) { /* 無視 */ } } finish({ timeout: true }); }, timeoutMs);
        var init = { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          credentials: 'omit', redirect: 'follow' };
        if (ac) init.signal = ac.signal;
        var p;
        try { p = opts.fetch(opts.url, init); } catch (e) { finish({ network: true }); return; }
        Promise.resolve(p).then(function (r) {
          return r.text().then(function (text) { finish({ status: r.status, text: text }); });
        }).catch(function () { finish({ network: true }); });
      });
    }

    function call(fn, args, o) {
      o = o || {};
      if (!opts.url) return Promise.resolve({ kind: 'error', data: { error: 'not_configured_url' } });
      var body = { fn: fn, client_ver: core.CLIENT_VER, args: args || {} };
      if (fn !== 'auth.login') body.sk = opts.session.sk();
      if (o.idToken) body.idToken = o.idToken;
      var rec = opts.recorder ? opts.recorder() : '';
      if (rec) body.recorder = rec;
      if (o.receiptId) body.receiptId = o.receiptId;
      return once(body).then(function (r) {
        // 再送は「受付番号つきの書き込み」と「読むだけ」の失敗に1回だけ。ログインは再送しない（IDトークンは一度きり・5-1）
        if (r.kind === 'fail' && fn !== 'auth.login') return once(body);
        return r;
      });
    }
    return { call: call };
  }

  var api = { createSession: createSession, createApi: createApi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.App = root.App || {}; root.App.api = api; }
})(typeof window !== 'undefined' ? window : this);
