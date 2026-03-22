const fs = require('fs');
let content = fs.readFileSync('src/types.ts', 'utf8');
let idCounter = 1;
content = content.replace(/"label":/g, () => {
  return `"id": "sec_${idCounter++}", "label":`;
});
fs.writeFileSync('src/types.ts', content);
console.log('Done');
