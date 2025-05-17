const fs = require("fs");
const path = require("path");

const QUESTIONS_DIR = path.join(__dirname, "questions");

function prettifyName(name) {
  return name
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function processFile(filePath, topic) {
  const content = fs.readFileSync(filePath, "utf8");
  let changed = false;
  let json;
  try {
    json = JSON.parse(content);
  } catch (e) {
    console.error("Invalid JSON in", filePath);
    return;
  }
  if (Array.isArray(json)) {
    json.forEach(q => {
      // Always set topic to folder name
      if (q.topic !== topic) {
        q.topic = topic;
        changed = true;
      }
      // Only set unit if missing or empty
      if (!q.unit || typeof q.unit !== "string" || !q.unit.trim()) {
        // Use prettified filename as fallback
        const unit = prettifyName(path.basename(filePath, ".json"));
        q.unit = unit;
        changed = true;
      }
    });
    if (changed) {
      fs.writeFileSync(filePath, JSON.stringify(json, null, 2));
      console.log(`Updated: ${filePath}`);
    }
  }
}

function processDirectory(dir) {
  fs.readdirSync(dir).forEach(sub => {
    const subPath = path.join(dir, sub);
    if (fs.statSync(subPath).isDirectory()) {
      console.log(`Scanning folder: ${subPath}`); // <-- Move log here
      const topic = prettifyName(sub);
      fs.readdirSync(subPath).forEach(file => {
        if (file.endsWith(".json")) {
          processFile(
            path.join(subPath, file),
            topic
          );
        }
      });
    }
  });
}

processDirectory(QUESTIONS_DIR);