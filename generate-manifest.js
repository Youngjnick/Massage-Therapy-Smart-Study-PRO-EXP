const fs = require('fs');
const path = require('path');

function getAllJsonFiles(dir, fileList = []) {
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllJsonFiles(fullPath, fileList);
    } else if (file.endsWith('.json')) {
      fileList.push('questions/' + path.relative(path.join(__dirname, '../questions'), fullPath).replace(/\\/g, '/'));
    }
  });
  return fileList;
}

const allJsons = getAllJsonFiles(path.join(__dirname, '../questions'));
fs.writeFileSync(path.join(__dirname, '../questions/questionsmanifest.json'), JSON.stringify(allJsons, null, 2));
console.log('Manifest updated!');