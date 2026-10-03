// 画面の設定（design 4章・5-1）。どちらも公開されてよい値。鍵・パスワードはここに書かない。
// 書き方は web/README.md。空のままでも画面は開く（上に「設定されていません」と出る）。
window.APP_CONFIG = {
  apiUrl: 'https://script.google.com/macros/s/AKfycbxUoVmOBFkCCNhqwPPUo-trD7zegjoGSK5-bJYCUch9Cf3c0Qd-pXw82E5f_88HVRQf/exec',        // ①（Apps Script）のウェブアプリの URL（https://script.google.com/macros/s/…/exec）
  gisClientId: '920093308638-lpmr5iplmbh82v9hol40ua6n6m6ahbef.apps.googleusercontent.com',   // OAuth クライアントID（…apps.googleusercontent.com）。①のスクリプトプロパティ GIS_CLIENT_ID と同じ値
  studentUrl: ''     // 生徒さん画面の URL（専用リンクは このURL#t=… の形・5-3）。空なら発行したリンクは記号だけ出す
};
