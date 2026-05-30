const fs = require('fs');
const js = fs.readFileSync('js/data.js', 'utf8') + '\n' + fs.readFileSync('js/app.js', 'utf8');
try {
  eval(js);
  console.log("No syntax error.");
} catch(e) {
  console.log("Error:", e);
}
