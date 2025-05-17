const fs = require('fs');
const path = require('path');

const QUESTIONS_DIR = path.join(__dirname, 'questions');

// 1. Rename all .JSON to .json first
function renameJsonFiles(dir) {
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      renameJsonFiles(fullPath);
    } else if (file.endsWith('.JSON')) {
      const newPath = path.join(dir, file.replace(/\.JSON$/, '.json'));
      fs.renameSync(fullPath, newPath);
      console.log(`Renamed: ${fullPath} -> ${newPath}`);
    }
  });
}
renameJsonFiles(QUESTIONS_DIR);

function humanizeTopic(topic) {
  if (!topic) return topic;
  // Always capitalize SOAP
  if (topic.trim().toUpperCase() === 'SOAP') return 'SOAP';
  return topic
    .replace(/[_\-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}

function humanizeId(id) {
  if (!id) return id;
  // Special case for SOAP
  if (id.toUpperCase().includes('SOAP')) {
    return id.replace(/soap/gi, 'SOAP')
      .replace(/[_\-]+/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .replace(/\s+/g, ' ')
      .trim();
  }
  // General case
  return id
    .replace(/[_\-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}

function processFile(filePath) {
  let changed = false;
  let data = fs.readFileSync(filePath, 'utf8');
  let json;
  try {
    json = JSON.parse(data);
  } catch (e) {
    console.error(`Could not parse JSON in ${filePath}:`, e);
    return;
  }

  // If file has a root "topic" or "id" property, fix it
  if (json.topic) {
    const newTopic = humanizeTopic(json.topic);
    if (json.topic !== newTopic) {
      json.topic = newTopic;
      changed = true;
    }
  }
  if (json.id) {
    const newId = humanizeId(json.id);
    if (json.id !== newId) {
      json.id = newId;
      changed = true;
    }
  }
  if (Array.isArray(json.tags)) {
    const newTags = json.tags.map(tag => humanizeTopic(tag));
    if (JSON.stringify(json.tags) !== JSON.stringify(newTags)) {
      json.tags = newTags;
      changed = true;
    }
  }

  // If file has a "questions" array, fix each question's id, topic, and tags
  if (Array.isArray(json.questions)) {
    json.questions.forEach(q => {
      // id
      if (q.id) {
        const newId = humanizeId(q.id);
        if (q.id !== newId) {
          q.id = newId;
          changed = true;
        }
      }
      // topic
      if (q.topic) {
        const newTopic = humanizeTopic(q.topic);
        if (q.topic !== newTopic) {
          q.topic = newTopic;
          changed = true;
        }
      }
      // tags
      if (Array.isArray(q.tags)) {
        const newTags = q.tags.map(tag => humanizeTopic(tag));
        if (JSON.stringify(q.tags) !== JSON.stringify(newTags)) {
          q.tags = newTags;
          changed = true;
        }
      }
    });
  }

  // If file is an array of questions
  if (Array.isArray(json)) {
    json.forEach(q => {
      // id
      if (q.id) {
        const newId = humanizeId(q.id);
        if (q.id !== newId) {
          q.id = newId;
          changed = true;
        }
      }
      // topic
      if (q.topic) {
        const newTopic = humanizeTopic(q.topic);
        if (q.topic !== newTopic) {
          q.topic = newTopic;
          changed = true;
        }
      }
      // tags
      if (Array.isArray(q.tags)) {
        const newTags = q.tags.map(tag => humanizeTopic(tag));
        if (JSON.stringify(q.tags) !== JSON.stringify(newTags)) {
          q.tags = newTags;
          changed = true;
        }
      }
    });
  }

  if (changed) {
    fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf8');
    console.log(`Updated id/topic/tags in: ${filePath}`);
  }
}

function processDirectory(dir) {
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (file.toLowerCase().endsWith('.json')) {
      processFile(fullPath);
    }
  });
}

processDirectory(QUESTIONS_DIR);