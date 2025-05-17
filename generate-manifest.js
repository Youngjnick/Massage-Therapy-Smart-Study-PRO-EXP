const fs = require('fs');
const path = require('path');

function normalize(str) {
  return str.toLowerCase().replace(/ /g, '_');
}

function getAllJsonFiles(dir, fileList = [], baseDir = dir) {
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllJsonFiles(fullPath, fileList, baseDir);
    } else if (file.endsWith('.json')) {
      // Normalize each part of the relative path
      const relParts = path.relative(baseDir, fullPath).split(path.sep).map(normalize);
      fileList.push('questions/' + relParts.join('/'));
    }
  });
  return fileList;
}

const questionsDir = path.join(__dirname, 'questions');
const allJsons = getAllJsonFiles(questionsDir);
fs.writeFileSync(path.join(__dirname, 'manifestquestions.json'), JSON.stringify(allJsons, null, 2));
console.log('Manifest updated!');