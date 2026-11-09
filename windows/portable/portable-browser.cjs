const fs = require('node:fs');
const path = require('node:path');
function findBrowser() {
  for (const suffix of ['Google/Chrome/Application/chrome.exe','Microsoft/Edge/Application/msedge.exe']) {
    for (const root of [process.env.ProgramFiles,process.env['ProgramFiles(x86)'],process.env.LOCALAPPDATA].filter(Boolean)) {
      const exe = path.join(root,suffix);
      if (fs.existsSync(exe)) return exe;
    }
  }
  throw Error('Для работы монитора установите Google Chrome или Microsoft Edge.');
}
module.exports = {findBrowser};
