// H5-URL oz-testi yardimcisi: h5-url-live-run.js'yi CALISTIRMADAN (require.main degil) yukler ve governance altindan yuklenen dosyalari listeler.
const path = require('path');
const target = process.argv[2];
require(target);
const govRoot = path.resolve(path.dirname(target), '..', '..');
const files = Object.keys(require.cache).filter((f) => f.startsWith(govRoot) && f !== __filename).map((f) => path.relative(govRoot, f).split(path.sep).join('/')).sort();
console.log(JSON.stringify(files, null, 1));
