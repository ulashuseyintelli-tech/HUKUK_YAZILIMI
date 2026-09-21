// G-5 negatif kontrolu: dis etkili FD uclari HTTP katmanina ULASMADAN reddedilmeli.
'use strict';
const L = require('../scripts/c-lib.js');
(async () => {
  const urls = ['publish', 'retry-publication', 'reverse', 'supersede'].map((s) => `http://127.0.0.1:1/api/client-financial-disclosures/v1/${s}`);
  let blocked = 0;
  for (const u of urls) {
    try { await L.httpJson('POST', u, {}); console.log(`GECTI (HATA): ${u}`); }
    catch (e) { if (/G-5 IHLALI/.test(e.message)) blocked += 1; else console.log(`beklenmeyen: ${e.message}`); }
  }
  const allowed = await L.httpJson('POST', 'http://127.0.0.1:1/api/client-financial-disclosures/v1/complete-content-approval', {}).then(() => 'istek denendi').catch((e) => `hata: ${e.message}`);
  console.log(JSON.stringify({ forbiddenBlocked: `${blocked}/${urls.length}`, allowedRouteNotBlockedByG5: !/G-5/.test(allowed) }));
  process.exitCode = blocked === urls.length ? 0 : 1;
})();
