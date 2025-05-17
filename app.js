// ===============================
// Massage Therapy Smart Study PRO
// Main App Logic (Refactored)
// ===============================

// --- GLOBAL STATE & SELECTORS ---
const SELECTORS = {
  quizCard: ".quiz-card",
  topicSelect: ".control[data-topic]",
  lengthSelect: ".control[data-quiz-length]",
  startBtn: ".start-btn",
  feedback: ".feedback",
  progressFill: ".progress-fill",
  progressPercent: ".progress-section span:last-child"
};

let current = 0;
let selectedTopic = "";
let quiz = [];
let correct = 0;
let streak = 0;
let missedQuestions = [];
let unansweredQuestions = [];
let bookmarkedQuestions = [];
let questions = [];
let historyChart;
let accuracyChart;

// --- BADGES ---
const badges = [
  { id: "streak_10", name: "Streak Master", description: "Achieve a streak of 10 correct answers.", condition: () => streak >= 10 },
  { id: "accuracy_90", name: "Accuracy Pro", description: "Achieve 90% accuracy in a quiz.", condition: () => (correct / quiz.length) >= 0.9 },
  { id: "first_steps", name: "First Steps", description: "Answer your first question correctly.", condition: () => correct === 1 },
  { id: "first_quiz", name: "First Quiz", description: "Complete your first quiz.", condition: () => quiz.length > 0 && current >= quiz.length },
];
let earnedBadges = JSON.parse(localStorage.getItem("earnedBadges")) || [];
earnedBadges = earnedBadges.filter(badgeId => badges.some(b => b.id === badgeId));

// --- UTILITY FUNCTIONS ---
function shuffle(array) {
  let m = array.length, t, i;
  while (m) {
    i = Math.floor(Math.random() * m--);
    t = array[m];
    array[m] = array[i];
    array[i] = t;
  }
  return array;
}

function prettifyName(name) {
  const replacements = { soap: "SOAP", vs: "vs", mblex: "MBLEx", cpr: "CPR" };
  name = name.replace(/\.json$/i, '').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  const lower = name.toLowerCase();
  if (replacements[lower]) return replacements[lower];
  return name.replace(/\w\S*/g, txt =>
    replacements[txt.toLowerCase()] || txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
}

function formatTopicName(topic) {
  if (!topic) return "";
  return topic.replace(/_/g, " ").replace(/\bsoap\b/gi, "SOAP").replace(/\b\w/g, c => c.toUpperCase());
}

// --- FIREBASE CONFIG ---
firebase.initializeApp(window.firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// --- QUESTION LOADING ---
async function loadQuestionsFromFirestore() {
  try {
    // This will get all documents in any 'items' subcollection under 'questions'
    const snapshot = await db.collectionGroup("items").get();
    const loadedQuestions = [];
    snapshot.forEach(doc => loadedQuestions.push({ id: doc.id, ...doc.data() }));
    console.log("✅ Loaded questions from Firestore:", loadedQuestions);
    return loadedQuestions;
  } catch (err) {
    console.error("❌ Error loading questions from Firestore:", err);
    return [];
  }
}

// --- EVENT LISTENERS & UI SETUP ---
document.addEventListener("DOMContentLoaded", async () => {
  const statusElem = document.querySelector("#status");
  if (statusElem) statusElem.innerText = "Loading questions...";

  questions = await loadQuestionsFromFirestore();
  if (questions.length === 0) {
    if (statusElem) statusElem.innerText = "No questions found!";
    return;
  }
  if (statusElem) statusElem.innerText = "";

  startQuiz(questions);
  setupUI();
  populateTopicDropdown();
  showNotification("Welcome!", "Challenge your skills with Massage Therapy Smart Study PRO!", "badges/welcome.png");
  renderChartsOnLoad();
});

// --- UI & QUIZ LOGIC ---
function setupUI() {
  const topicSelect = document.querySelector(SELECTORS.topicSelect);
  const lengthSelect = document.querySelector(SELECTORS.lengthSelect);
  const startBtn = document.querySelector(SELECTORS.startBtn);

  function updateStartBtn() {
    if (startBtn) startBtn.disabled = !(topicSelect.value && lengthSelect.value);
  }
  if (topicSelect) {
    topicSelect.addEventListener("change", () => {
      selectedTopic = topicSelect.value;
      updateStartBtn();
    });
  }
  if (lengthSelect) lengthSelect.addEventListener("change", updateStartBtn);
  if (startBtn) startBtn.addEventListener("click", () => {
    let quizPool = [];
    const topic = topicSelect.value;
    const length = lengthSelect.value === "all" ? 9999 : parseInt(lengthSelect.value, 10);

    if (topic === "unanswered") quizPool = unansweredQuestions;
    else if (topic === "missed") quizPool = missedQuestions.map(id => questions.find(q => q.id === id)).filter(Boolean);
    else if (topic === "bookmarked") quizPool = bookmarkedQuestions;
    else if (topic === "review_unmastered") quizPool = getQuestionsMastered(0);
    else if (topic === "review_most_missed") quizPool = getMostErroredQuestions();
    else if (topic === "adaptive_quiz") quizPool = getAdaptiveQuiz();
    else if (topicSelect.value.includes("::")) {
      const [topic, unit] = topicSelect.value.split("::");
      quizPool = questions.filter(q => q.topic.trim() === topic && q.unit.trim() === unit);
    } else {
      quizPool = questions.filter(q => q.topic === topicSelect.value);
    }

    startQuiz(quizPool.slice(0, length));
  });

  document.querySelectorAll(".smart-learning a, .smart-learning-link").forEach(link =>
    link.addEventListener("click", showSmartLearningModal)
  );
  document.querySelectorAll(".view-analytics a, .analytics-link").forEach(link =>
    link.addEventListener("click", showAnalyticsModal)
  );
  document.querySelectorAll(".settings a, .settings-link").forEach(link =>
    link.addEventListener("click", showSettingsModal)
  );
}

async function populateTopicDropdown() {
  const dropdown = document.querySelector("[data-topic]");
  if (!dropdown) return;
  dropdown.innerHTML = "";

  // Add smart quiz options first
  [
    { value: "", text: "📝 -- Select Topic --", disabled: true, selected: true },
    { value: "unanswered", text: "❓ Unanswered Questions" },
    { value: "missed", text: "❌ Missed Questions" },
    { value: "bookmarked", text: "🔖 Bookmarked Questions" },
    { value: "review_unmastered", text: "🧠 Review Unmastered" },
    { value: "review_most_missed", text: "🔥 Most Missed" },
    { value: "adaptive_quiz", text: "🤖 Adaptive Quiz" }
  ].forEach(opt => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.text;
    if (opt.disabled) option.disabled = true;
    if (opt.selected) option.selected = true;
    dropdown.appendChild(option);
  });

  // Group unique, trimmed units by topic
  const grouped = {};
  questions.forEach(q => {
    if (!q.topic || !q.unit) return;
    const topic = q.topic.trim();
    const unit = q.unit.trim();
    if (!grouped[topic]) grouped[topic] = new Set();
    grouped[topic].add(unit);
  });
  console.log(grouped);

  Object.entries(grouped).sort().forEach(([topic, units]) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = prettifyName(topic);
    Array.from(units).sort().forEach(unit => {
      const option = document.createElement("option");
      option.value = `${topic}::${unit}`;
      option.textContent = prettifyName(unit);
      optgroup.appendChild(option);
    });
    dropdown.appendChild(optgroup);
  });
}

function startQuiz(quizPool) {
  // Only include valid questions with an answers array
  quiz = shuffle([...quizPool].filter(q => Array.isArray(q.answers)));
  current = 0; correct = 0; streak = 0;
  const quizCard = document.querySelector(SELECTORS.quizCard);
  if (quizCard) quizCard.classList.remove("hidden");
  renderQuestion();
}

function renderQuestion(q) {
  q = q || quiz[current];
  const quizCard = document.querySelector(SELECTORS.quizCard);

  if (!quiz || quiz.length === 0) {
    if (quizCard) quizCard.innerHTML = "<p>No questions available for this quiz!</p>";
    return;
  }

  if (!q || !Array.isArray(q.answers)) {
    console.error("Invalid question object:", q);
    if (quizCard) quizCard.innerHTML = "<p>Invalid question data. Please try another quiz or topic.</p>";
    return;
  }

  const answerObjs = q.answers.map((a, i) => ({
    text: a,
    isCorrect: i === q.correct
  }));
  shuffle(answerObjs);

  renderQuizHeader(q);

  const quizHeaderStrong = document.querySelector(".quiz-header strong");
  if (quizHeaderStrong) quizHeaderStrong.textContent = formatTopicName(selectedTopic);

  const questionText = document.querySelector(".question-text");
  if (questionText) questionText.textContent = q.question;

  renderAnswers(answerObjs);

  const feedbackElem = document.querySelector(SELECTORS.feedback);
  if (feedbackElem) feedbackElem.textContent = "";

  quizCard.querySelectorAll(".question-actions").forEach(el => el.remove());
  renderQuestionActions(q);
}

/**
 * Render the quiz header row with topic, streak, and bookmark button.
 */
function renderQuizHeader(q) {
  const quizHeader = document.querySelector(".quiz-header");
  quizHeader.querySelector(".quiz-header-row")?.remove();

  const headerRow = document.createElement("div");
  headerRow.className = "quiz-header-row";
  headerRow.innerHTML = `
    <div class="topic-streak">
      <span>TOPIC: <strong>${selectedTopic}</strong></span>
      <span style="margin-left: 16px;">Streak: <span id="quizStreak">${streak}</span></span>
    </div>
  `;

  const bookmarkBtn = document.createElement("button");
  bookmarkBtn.className = "bookmark-btn";
  bookmarkBtn.textContent = q.bookmarked ? "Unbookmark" : "Bookmark";
  bookmarkBtn.setAttribute("aria-label", q.bookmarked ? "Unbookmark this question" : "Bookmark this question");
  bookmarkBtn.addEventListener("click", () => {
    q.bookmarked = !q.bookmarked;
    bookmarkBtn.textContent = q.bookmarked ? "Unbookmark" : "Bookmark";
    toggleBookmark(q.id);
    bookmarkedQuestions = getBookmarkedQuestions(questions);
  });

  headerRow.appendChild(bookmarkBtn);
  quizHeader.appendChild(headerRow);
}

/**
 * Render answer buttons for the current question.
 */
function renderAnswers(answerObjs) {
  const answersDiv = document.getElementById("answers");
  answersDiv.innerHTML = "";
  answerObjs.forEach((ansObj, i) => {
    const btn = document.createElement("div");
    btn.className = "answer";
    btn.textContent = `${String.fromCharCode(65 + i)}. ${ansObj.text}`;
    btn.setAttribute("role", "button");
    btn.setAttribute("tabindex", "0");
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", `Answer ${String.fromCharCode(65 + i)}: ${ansObj.text}`);
    btn.addEventListener("click", () => {
      handleAnswerClick(ansObj.isCorrect, btn);
      btn.setAttribute("aria-pressed", "true");
    });
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        handleAnswerClick(ansObj.isCorrect, btn);
        btn.setAttribute("aria-pressed", "true");
      }
    });
    answersDiv.appendChild(btn);
  });
}

/**
 * Render action buttons (suggest, report, flag, rate) for the current question.
 */
function renderQuestionActions(q) {
  const quizCard = document.querySelector(SELECTORS.quizCard);
  const actionsDiv = document.createElement("div");
  actionsDiv.className = "question-actions";
  actionsDiv.setAttribute("role", "group");
  actionsDiv.setAttribute("aria-label", "Question actions");

  actionsDiv.appendChild(createSuggestBtn());
  actionsDiv.appendChild(createReportBtn());
  actionsDiv.appendChild(createFlagBtn());
  actionsDiv.appendChild(createRateDiv(q.id));

  quizCard.appendChild(actionsDiv);
}

/**
 * Create the "Suggest a Question" button and modal.
 */
function createSuggestBtn() {
  const btn = document.createElement("button");
  btn.textContent = "Suggest a Question";
  btn.className = "suggest-btn";
  btn.addEventListener("click", () => {
    openModal("Suggest a Question", `
      <form id="suggestForm">
        <label>Question:<br><input type="text" id="suggestQ" required></label><br>
        <label>Answer A:<br><input type="text" id="suggestA" required></label><br>
        <label>Answer B:<br><input type="text" id="suggestB" required></label><br>
        <label>Answer C:<br><input type="text" id="suggestC"></label><br>
        <label>Answer D:<br><input type="text" id="suggestD"></label><br>
        <label>Correct Answer (A/B/C/D):<br><input type="text" id="suggestCorrect" required maxlength="1"></label><br>
        <label>Topic:<br><input type="text" id="suggestTopic" required></label><br>
        <button type="submit">Submit</button>
      </form>
    `);
    document.getElementById("suggestForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const suggestion = {
        question: document.getElementById("suggestQ").value,
        answers: [
          document.getElementById("suggestA").value,
          document.getElementById("suggestB").value,
          document.getElementById("suggestC").value,
          document.getElementById("suggestD").value,
        ].filter(Boolean),
        correct: ["A","B","C","D"].indexOf(document.getElementById("suggestCorrect").value.toUpperCase()),
        topic: document.getElementById("suggestTopic").value,
        submittedAt: new Date().toISOString()
      };
      await submitSuggestionToFirestore(suggestion);
      showNotification("Thank you!", "Your suggestion has been submitted.", "badges/summary.png");
      document.querySelector(".modal-overlay").remove();
    });
  });
  btn.setAttribute("aria-pressed", "true");
  return btn;
}

/**
 * Create the "Report Question" button and modal.
 */
function createReportBtn() {
  const btn = document.createElement("button");
  btn.textContent = "Report Question";
  btn.className = "report-btn";
  btn.addEventListener("click", () => {
    openModal("Report Question", `
      <form id="reportForm">
        <p>Why are you reporting this question?</p>
        <textarea id="reportReason" required style="width:100%;height:60px;"></textarea><br>
        <button type="submit">Submit Report</button>
      </form>
    `);
    document.getElementById("reportForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const report = {
        questionId: quiz[current].id,
        question: quiz[current].question,
        reason: document.getElementById("reportReason").value,
        reportedAt: new Date().toISOString()
      };
      await submitReportToFirestore(report);
      showNotification("Thank you!", "Your report has been submitted.", "badges/summary.png");
      document.querySelector(".modal-overlay").remove();
    });
  });
  btn.setAttribute("aria-pressed", "true");
  return btn;
}

/**
 * Create the "Flag as Unclear" button.
 */
function createFlagBtn() {
  const btn = document.createElement("button");
  btn.textContent = "Flag as Unclear";
  btn.className = "flag-unclear-btn";
  btn.addEventListener("click", async () => {
    const qid = quiz[current].id;
    let unclearFlags = JSON.parse(localStorage.getItem("unclearFlags") || "{}");
    unclearFlags[qid] = (unclearFlags[qid] || 0) + 1;
    localStorage.setItem("unclearFlags", JSON.stringify(unclearFlags));
    showNotification("Thank you!", "This question has been flagged as unclear.", "badges/summary.png");
  });
  btn.setAttribute("aria-pressed", "true");
  return btn;
}

/**
 * Create the star rating UI for the current question.
 */
function createRateDiv(qid) {
  const rateDiv = document.createElement("div");
  rateDiv.className = "rate-question";
  rateDiv.innerHTML = `
    <span>Rate: </span>
    ${[1, 2, 3, 4, 5].map(n =>
      `<span class="star" data-star="${n}" style="cursor:pointer;font-size:1.2em;color:#ccc;">&#9734;</span>`
    ).join("")}
  `;
  const stars = rateDiv.querySelectorAll(".star");
  const ratings = JSON.parse(localStorage.getItem("questionRatings") || "{}");
  const savedRating = ratings[qid] || 0;
  stars.forEach((star, index) => {
    star.style.color = index < savedRating ? "gold" : "#ccc";
    star.addEventListener("click", () => {
      stars.forEach((s, i) => s.style.color = i <= index ? "gold" : "#ccc");
      const rating = index + 1;
      ratings[qid] = rating;
      localStorage.setItem("questionRatings", JSON.stringify(ratings));
      showNotification("Thank you!", `You rated this question ${rating} stars.`, "badges/summary.png");
    });
    star.addEventListener("mouseover", () => {
      stars.forEach((s, i) => s.style.color = i <= index ? "gold" : "#ccc");
    });
    star.addEventListener("mouseout", () => {
      stars.forEach((s, i) => s.style.color = i < savedRating ? "gold" : "#ccc");
    });
  });
  return rateDiv;
}

/**
 * Handle answer selection, update streak, feedback, and progress.
 */
function handleAnswerClick(isCorrect, btn) {
  if (!quiz[current]) return;
  btn.classList.add(isCorrect ? "correct" : "incorrect");
  updateStreak(isCorrect);
  updateProgress(current + 1, quiz.length);

  const feedback = document.querySelector(SELECTORS.feedback);
  const qid = quiz[current].id;

  if (!isCorrect) {
    const correctAnswer = quiz[current].answers[quiz[current].correct];
    feedback.textContent = `Incorrect! The correct answer is: ${correctAnswer}`;
    feedback.style.color = "red";
    if (!missedQuestions.includes(qid)) {
      missedQuestions.push(qid);
      saveUserData();
    }
    quiz[current].stats = quiz[current].stats || { correct: 0, incorrect: 0 };
    quiz[current].stats.incorrect++;
    localStorage.setItem("review_" + qid, JSON.stringify({
      lastMissed: Date.now(),
      interval: 24 * 60 * 60 * 1000
    }));
    recordWrongAnswer(qid, btn.textContent);
  } else {
    feedback.textContent = "Correct!";
    feedback.style.color = "green";
    missedQuestions = missedQuestions.filter(id => id !== qid);
    saveUserData();
    quiz[current].stats = quiz[current].stats || { correct: 0, incorrect: 0 };
    quiz[current].stats.correct++;
  }
  const explanation = quiz[current].explanation || "";
  feedback.innerHTML += explanation ? `<br><em>${explanation}</em>` : "";
  if (isCorrect) correct++;
  unansweredQuestions = unansweredQuestions.filter(q => q.id !== qid);

  setTimeout(() => {
    current++;
    if (current >= quiz.length) {
      showSummary();
      return;
    }
    renderQuestion();
    renderAccuracyChart(correct, current - correct, quiz.length - current);
  }, 1500);
  updateQuestionMeta(qid, isCorrect);
}

/**
 * Update the user's streak and check for badge unlocks.
 */
function updateStreak(isCorrect) {
  streak = isCorrect ? streak + 1 : 0;
  document.getElementById("quizStreak").textContent = streak;
  checkBadges();
}

/**
 * Update the quiz progress bar and percentage.
 */
function updateProgress(current, total) {
  const progress = Math.round((current / total) * 100);
  document.querySelector(SELECTORS.progressFill).style.width = `${progress}%`;
  document.querySelector(SELECTORS.progressPercent).textContent = `${progress}%`;
}

/**
 * Show quiz summary and review/smart review buttons if needed.
 */
function showSummary() {
  const accuracy = quiz.length > 0 ? Math.round((correct / quiz.length) * 100) : 0;
  showNotification("Quiz Summary", `You answered ${correct} out of ${quiz.length} questions correctly (${accuracy}% accuracy).`, "badges/summary.png");
  checkBadges();
  if (missedQuestions.length > 0) showReviewMissedBtn();
  if (getQuestionsForSmartReview().length > 0) showSmartReviewBtn();
  saveQuizResult();
}

/**
 * Show a button to review missed questions after quiz.
 */
function showReviewMissedBtn() {
  const reviewBtn = document.createElement("button");
  reviewBtn.textContent = "Review Missed Questions";
  reviewBtn.className = "modal-btn";
  reviewBtn.onclick = () => {
    quiz = questions.filter(q => missedQuestions.includes(q.id));
    current = 0; correct = 0; streak = 0;
    document.querySelector(SELECTORS.quizCard).classList.remove("hidden");
    renderQuestion();
    document.querySelector(".notification-container")?.remove();
  };
  setTimeout(() => {
    document.body.appendChild(reviewBtn);
    setTimeout(() => reviewBtn.remove(), 5000);
  }, 500);
}

/**
 * Show a button to smart review questions after quiz.
 */
function showSmartReviewBtn() {
  const smartReviewBtn = document.createElement("button");
  smartReviewBtn.textContent = "Smart Review Questions";
  smartReviewBtn.className = "modal-btn";
  smartReviewBtn.onclick = () => {
    quiz = getQuestionsForSmartReview();
    current = 0; correct = 0; streak = 0;
    document.querySelector(SELECTORS.quizCard).classList.remove("hidden");
    renderQuestion();
    document.querySelector(".notification-container")?.remove();
  };
  setTimeout(() => {
    document.body.appendChild(smartReviewBtn);
    setTimeout(() => smartReviewBtn.remove(), 5000);
  }, 500);
}

/**
 * Start a review session for unmastered questions.
 */
function startUnmasteredReview() {
  quiz = shuffle(getQuestionsMastered(0)); // Or set a threshold
  current = 0; correct = 0; streak = 0;
  document.querySelector(SELECTORS.quizCard).classList.remove("hidden");
  renderQuestion();
}

// --- MODALS ---
/**
 * Open a modal dialog with the given title and content.
 * @param {string} title
 * @param {string} content
 * @param {boolean} [toggle=false]
 */
function openModal(title, content, toggle = false) {
  const existingModal = document.querySelector(".modal-overlay");
  if (toggle && existingModal) {
    existingModal.remove();
    return;
  }
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", title);
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>${title}</h2>
        <button class="close-modal">&times;</button>
      </div>
      <div class="modal-body">${content}</div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector(".close-modal").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", () => modal.remove());
  modal.querySelector(".modal").addEventListener("click", (e) => e.stopPropagation());
  modal.querySelector(".close-modal").setAttribute("aria-label", "Close modal");
  document.addEventListener("keydown", function escListener(e) {
    if (e.key === "Escape") {
      modal.remove();
      document.removeEventListener("keydown", escListener);
    }
  });
  setTimeout(() => document.querySelector('.modal').scrollTop = 0, 0);
}

/**
 * Show the Smart Learning modal with badge grid.
 */
function showSmartLearningModal(e) {
  e.preventDefault();
  openModal("Smart Learning", `
    <p>Smart Learning helps you focus on missed or unanswered questions to improve your knowledge.</p>
    <div class="badge-grid">
      ${badges.map(badge => `
        <div class="badge-item ${earnedBadges.includes(badge.id) ? "" : "unearned"}">
          <img src="badges/${badge.id}.png" alt="${badge.name}" />
          <p>${badge.name}</p>
        </div>
      `).join("")}
    </div>
  `, true);
}

/**
 * Show the Analytics modal with charts and mastery stats.
 */
function showAnalyticsModal(e) {
  e.preventDefault();
  const totalQuestions = quiz.length;
  const unansweredQuestionsCount = totalQuestions - current;
  const incorrectAnswers = current - correct;
  const accuracy = totalQuestions > 0 ? Math.round((correct / totalQuestions) * 100) : 0;
  const stats = { totalQuestions, correctAnswers: correct, incorrectAnswers, unansweredQuestions: unansweredQuestionsCount, accuracy, streak };
  const topicStats = getTopicMastery();

  // --- NEW: Meta stats for each question ---
  const metaMap = JSON.parse(localStorage.getItem("questionMeta") || "{}");
  const metaHtml = questions.map(q => {
    const meta = metaMap[q.id] || {};
    const attempts = meta.attempts || 0;
    const correct = meta.correct || 0;
    const incorrect = meta.incorrect || 0;
    const lastAttempt = meta.lastAttempt ? new Date(meta.lastAttempt).toLocaleString() : "Never";
    const acc = attempts > 0 ? Math.round((correct / attempts) * 100) : 0;
    return `<li>
      <strong>${q.question}</strong>
      <br>Attempts: ${attempts}, Accuracy: ${acc}%, Last Attempt: ${lastAttempt}
    </li>`;
  }).join("");

  openModal("View Analytics", `
    <p>Track your progress, accuracy, and streaks over time to measure your improvement.</p>
    <div style="display: flex; flex-direction: column; align-items: center; gap: 20px;">
      <canvas id="accuracyChart" width="200" height="200"></canvas>
      <ul style="list-style: none; padding: 0; text-align: left;">
        <li><strong>Total Questions Attempted:</strong> ${stats.totalQuestions}</li>
        <li><strong>Correct Answers:</strong> ${stats.correctAnswers}</li>
        <li><strong>Incorrect Answers:</strong> ${stats.incorrectAnswers}</li>
        <li><strong>Unanswered Questions:</strong> ${stats.unansweredQuestions}</li>
        <li><strong>Accuracy:</strong> ${stats.accuracy}%</li>
        <li><strong>Current Streak:</strong> ${stats.streak}</li>
      </ul>
      <h4 style="margin-top:16px;">Mastery by Topic</h4>
      <ul style="margin-top:0">${Object.entries(topicStats).map(([topic, stat]) => {
        const acc = stat.total ? stat.correct / stat.total : 0;
        return `<li style="background:${masteryColor(acc)};padding:4px 8px;border-radius:4px;margin:2px 0;">
          <strong>${topic}:</strong> ${(acc*100).toFixed(0)}% mastery
        </li>`;
      }).join("")}</ul>
      <h4 style="margin-top:16px;">Quiz History</h4>
      <canvas id="historyChart" width="300" height="120"></canvas>
      <h4 style="margin-top:16px;">Per-Question Meta</h4>
      <ul style="max-height:200px;overflow:auto;">${metaHtml}</ul>
    </div>
  `);
  requestAnimationFrame(() => {
    renderAccuracyChart(stats.correctAnswers, stats.incorrectAnswers, stats.unansweredQuestions);
    renderHistoryChart();
  });
}

/**
 * Reset all user progress and settings.
 */
function resetAll() {
  if (!confirm("Are you sure you want to reset all progress and settings? This cannot be undone.")) return;
  localStorage.clear();
  location.reload();
}

/**
 * Show the Settings modal and handle settings save/reset.
 */
function showSettingsModal(e) {
  e.preventDefault();
  openModal("Settings", `
    <p>Customize your quiz experience. Adjust difficulty, topics, and more.</p>
    <form id="settingsForm">
      <label>
        Difficulty:
        <select id="difficultySelect">
          <option value="easy">Easy</option>
          <option value="moderate">Moderate</option>
          <option value="hard">Hard</option>
        </select>
      </label>
      <br />
      <label>
        Enable Timer:
        <input type="checkbox" id="timerToggle" />
      </label>
      <br />
      <label>
        <input type="checkbox" id="adaptiveModeToggle" /> Enable Adaptive Mode
      </label>
      <br />
      <button type="submit">Save Settings</button>
    </form>
    <hr />
    <button id="exportProgressBtn" type="button">Export Progress</button>
    <input type="file" id="importProgressInput" style="display:none" accept=".json" />
    <button id="importProgressBtn" type="button">Import Progress</button>
    <button id="resetAllButton" style="background-color: red; color: white; padding: 10px; border: none; cursor: pointer;">
      Reset All
    </button>
  `);
  const form = document.getElementById("settingsForm");
  const settings = JSON.parse(localStorage.getItem("settings") || "{}");
  document.getElementById("difficultySelect").value = settings.difficulty || "easy";
  document.getElementById("timerToggle").checked = !!settings.timerEnabled;
  document.getElementById("adaptiveModeToggle").checked = settings.adaptiveMode !== false;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const newSettings = {
      difficulty: document.getElementById("difficultySelect").value,
      timerEnabled: document.getElementById("timerToggle").checked,
      adaptiveMode: document.getElementById("adaptiveModeToggle").checked
    };
    localStorage.setItem("settings", JSON.stringify(newSettings));
    showNotification("Settings Saved", "Your preferences have been saved.", "badges/summary.png");
  });
  document.getElementById("resetAllButton").addEventListener("click", resetAll);
}

// --- CHARTS ---
/**
 * Render charts on load (accuracy and history).
 */
function renderChartsOnLoad() {
  const stats = {
    correct: correct,
    incorrect: quiz.length - correct,
    unanswered: quiz.length > 0 ? quiz.length - current : 0
  };
  renderAccuracyChart(stats.correct, stats.incorrect, stats.unanswered);
  renderHistoryChart();
}

/**
 * Render the accuracy doughnut chart.
 */
function renderAccuracyChart(correct, incorrect, unanswered) {
  const ctxElem = document.getElementById("accuracyChart");
  if (!ctxElem) return;
  if (accuracyChart) {
    accuracyChart.destroy();
    accuracyChart = null;
  }
  const ctx = ctxElem.getContext("2d");
  accuracyChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Correct", "Incorrect", "Unanswered"],
      datasets: [{
        data: [correct, incorrect, unanswered],
        backgroundColor: ["#6BCB77", "#FF6B6B", "#FFD93D"],
        hoverBackgroundColor: ["#8FDCA8", "#FF8787", "#FFE066"],
        borderWidth: 1,
        borderColor: "#ffffff",
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom", labels: { font: { size: 14 } } },
      },
      cutout: "85%",
    },
  });
}

/**
 * Render the quiz history line chart.
 */
function renderHistoryChart() {
  const results = JSON.parse(localStorage.getItem("quizResults")) || [];
  const ctx = document.getElementById("historyChart")?.getContext("2d");
  if (!ctx) return;
  if (historyChart) historyChart.destroy();
  historyChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: results.length ? results.map(r => new Date(r.date).toLocaleDateString()) : ["No Data"],
      datasets: [
        {
          label: "Accuracy (%)",
          data: results.length
            ? results.map(r =>
                r.total > 0 && typeof r.score === "number"
                  ? Math.max(0, Math.round((r.score / r.total) * 100))
                  : 0
              )
            : [0],
          borderColor: "#007bff",
          fill: false,
        },
        {
          label: "Streak",
          data: results.length
            ? results.map(r => typeof r.streak === "number" ? Math.max(0, r.streak) : 0)
            : [0],
          borderColor: "#FFD93D",
          fill: false,
        }
      ]
    },
    options: { responsive: true }
  });
}

// --- NOTIFICATIONS ---
/**
 * Show a notification with title, message, and image.
 * @param {string} title
 * @param {string} message
 * @param {string} imageUrl
 */
function showNotification(title, message, imageUrl) {
  let container = document.getElementById("notification-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "notification-container";
    container.className = "notification-container";
    container.setAttribute("role", "alert");
    container.setAttribute("aria-live", "assertive");
    document.body.appendChild(container);
  }
  const notification = document.createElement("div");
  notification.className = "notification";
  notification.innerHTML = `<h3>${title}</h3><p>${message}</p><img src="${imageUrl}" alt="${title}" />`;
  container.appendChild(notification);
  setTimeout(() => {
    notification.remove();
    if (container.children.length === 0) container.remove();
  }, 3000);
}

// --- BADGES ---
/**
 * Check if any badges are earned and show modal if so.
 */
function checkBadges() {
  badges.forEach(badge => {
    if (!earnedBadges.includes(badge.id) && badge.condition()) {
      earnedBadges.push(badge.id);
      localStorage.setItem("earnedBadges", JSON.stringify(earnedBadges));
      showBadgeModal(badge);
    }
  });
}

/**
 * Show a modal for a newly earned badge.
 */
function showBadgeModal(badge) {
  openModal("New Achievement Unlocked!", `
    <h3>${badge.name}</h3>
    <p>${badge.description}</p>
    <img src="badges/${badge.id}.png" alt="${badge.name}" style="width: 100px; height: 100px;" />
  `);
}

// --- STORAGE & DATA ---
/**
 * Save user stats to localStorage.
 */
function saveStats() {
  const stats = { correct, streak, current, quizLength: quiz.length };
  localStorage.setItem("userStats", JSON.stringify(stats));
}

/**
 * Load user stats from localStorage.
 */
function loadStats() {
  const savedStats = JSON.parse(localStorage.getItem("userStats"));
  if (savedStats) {
    correct = savedStats.correct || 0;
    streak = savedStats.streak || 0;
    current = savedStats.current || 0;
    quiz = quiz.slice(0, savedStats.quizLength || quiz.length);
  }
}

/**
 * Save missed questions to localStorage.
 */
function saveUserData() {
  localStorage.setItem("missedQuestions", JSON.stringify(missedQuestions));
}

/**
 * Load missed questions from localStorage.
 */
function loadUserData() {
  missedQuestions = JSON.parse(localStorage.getItem("missedQuestions")) || [];
}

/**
 * Save quiz result to localStorage and update history chart.
 */
function saveQuizResult() {
  const results = JSON.parse(localStorage.getItem("quizResults")) || [];
  results.push({ streak, total: quiz.length, score: correct, date: new Date().toISOString() });
  localStorage.setItem("quizResults", JSON.stringify(results));
  renderHistoryChart();
}

/**
 * Update question metadata (attempts, correct/incorrect count, last attempt time).
 */
function updateQuestionMeta(qid, isCorrect) {
  const metaMap = JSON.parse(localStorage.getItem("questionMeta") || "{}");
  if (!metaMap[qid]) {
    metaMap[qid] = { attempts: 0, correct: 0, incorrect: 0, lastAttempt: null };
  }
  metaMap[qid].attempts++;
  if (isCorrect) metaMap[qid].correct++;
  else metaMap[qid].incorrect++;
  metaMap[qid].lastAttempt = Date.now();
  localStorage.setItem("questionMeta", JSON.stringify(metaMap));
}

// --- ANALYTICS ---
/**
 * Get mastery stats for each topic.
 * @returns {Object}
 */
function getTopicMastery() {
  const topicStats = {};
  questions.forEach(q => {
    if (!q.topic) return;
    if (!topicStats[q.topic]) topicStats[q.topic] = { correct: 0, incorrect: 0, total: 0 };
    topicStats[q.topic].correct += q.stats?.correct || 0;
    topicStats[q.topic].incorrect += q.stats?.incorrect || 0;
    topicStats[q.topic].total += (q.stats?.correct || 0) + (q.stats?.incorrect || 0);
  });
  return topicStats;
}

/**
 * Get color for topic mastery based on accuracy.
 */
function masteryColor(accuracy) {
  if (accuracy >= 0.85) return "#6BCB77";
  if (accuracy >= 0.6) return "#FFD93D";
  return "#FF6B6B";
}

/**
 * Get questions that need smart review (low accuracy or multiple misses).
 * @returns {Array}
 */
function getQuestionsForSmartReview() {
  return questions.filter(q => (q.stats?.incorrect || 0) > 1 || ((q.stats?.correct || 0) / ((q.stats?.correct || 0) + (q.stats?.incorrect || 0))) < 0.7);
}

/**
 * Get accuracy stats for each topic.
 * @returns {Object}
 */
function getAccuracyPerTopic() {
  const stats = {};
  questions.forEach(q => {
    if (!q.topic) return;
    if (!stats[q.topic]) stats[q.topic] = { correct: 0, total: 0 };
    stats[q.topic].correct += q.stats?.correct || 0;
    stats[q.topic].total += (q.stats?.correct || 0) + (q.stats?.incorrect || 0);
  });
  Object.keys(stats).forEach(topic => {
    stats[topic].accuracy = stats[topic].total > 0 ? Math.round((stats[topic].correct / stats[topic].total) * 100) : 0;
  });
  return stats;
}

/**
 * Get questions that have been mastered.
 * @param {number} [threshold=3] - The number of correct answers required to consider a question mastered.
 * @returns {Array}
 */
function getQuestionsMastered(threshold = 3) {
  return questions.filter(q => q.stats?.correct >= threshold);
}

/**
 * Get questions that have been repeated.
 * @returns {Array}
 */
function getQuestionsRepeated() {
  return questions.filter(q => (q.stats?.correct || 0) + (q.stats?.incorrect || 0) > 1);
}

/**
 * Get topics with the lowest accuracy.
 * @param {number} [n=3] - The number of topics to return.
 * @returns {Array}
 */
function getLowestAccuracyTopics(n = 3) {
  const acc = getAccuracyPerTopic();
  return Object.entries(acc)
    .sort((a, b) => a[1].accuracy - b[1].accuracy)
    .slice(0, n)
    .map(([topic]) => topic);
}

/**
 * Get questions with the most errors.
 * @param {number} [n=5] - The number of questions to return.
 * @returns {Array}
 */
function getMostErroredQuestions(n = 5) {
  const errorMap = JSON.parse(localStorage.getItem("errorFrequencyMap") || "{}");
  return Object.entries(errorMap)
    .map(([qid, errors]) => ({
      qid,
      totalErrors: Object.values(errors).reduce((a, b) => a + b, 0)
    }))
    .sort((a, b) => b.totalErrors - a.totalErrors)
    .slice(0, n)
    .map(e => questions.find(q => q.id === e.qid))
    .filter(Boolean);
}

/**
 * Get adaptive quiz questions based on user performance.
 * Focus on most missed and low mastery questions.
 */
function getAdaptiveQuiz() {
  // Example adaptive logic: focus on most missed and low mastery questions
  const mostMissed = getMostErroredQuestions(10);
  const lowMastery = questions.filter(q => {
    const stats = q.stats || {};
    const total = (stats.correct || 0) + (stats.incorrect || 0);
    return total > 0 && ((stats.correct || 0) / total) < 0.7;
  });
  // Combine and remove duplicates
  const adaptivePool = [...new Set([...mostMissed, ...lowMastery])];
  return adaptivePool.length > 0 ? adaptivePool : questions;
}

/**
 * Get smart quiz questions based on lowest accuracy and least recent attempts.
 * @param {number} [limit=20] - The maximum number of questions to return.
 * @returns {Array}
 */
function getSmartQuizQuestions(limit = 20) {
  const metaMap = JSON.parse(localStorage.getItem("questionMeta") || "{}");
  // Sort by lowest accuracy and least recently attempted
  const sorted = questions
    .map(q => {
      const meta = metaMap[q.id] || {};
      const accuracy = meta.attempts ? (meta.correct || 0) / meta.attempts : 0;
      return { ...q, meta, accuracy };
    })
    .sort((a, b) => {
      if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
      return (a.meta.lastAttempt || 0) - (b.meta.lastAttempt || 0);
    });
  return sorted.slice(0, limit);
}

// --- BOOKMARKS ---
/**
 * Toggle bookmark state for a question.
 */
function toggleBookmark(questionId) {
  let bookmarks = JSON.parse(localStorage.getItem("bookmarkedQuestions")) || [];
  if (bookmarks.includes(questionId)) bookmarks = bookmarks.filter(id => id !== questionId);
  else bookmarks.push(questionId);
  localStorage.setItem("bookmarkedQuestions", JSON.stringify(bookmarks));
}

/**
 * Get all bookmarked questions from the full question list.
 */
function getBookmarkedQuestions(allQuestions) {
  const bookmarks = JSON.parse(localStorage.getItem("bookmarkedQuestions")) || [];
  return allQuestions.filter(q => bookmarks.includes(q.id));
}

// --- TOPIC DROPDOWN ---
// Example: Group questions by unit (top-level folder)
function groupQuestionsByUnit(manifest) {
  const units = {};
  manifest.forEach(path => {
    // Extract the unit name (first folder after 'questions/')
    const match = path.match(/^questions\/([^/]+)\//);
    if (match) {
      const unit = match[1];
      if (!units[unit]) units[unit] = [];
      units[unit].push(path);
    }
  });
  return units;
}

// --- FIREBASE HELPERS ---
async function submitSuggestionToFirestore(suggestion) {
  try {
    await db.collection("suggestedQuestions").add(suggestion);
  } catch (error) {
    showNotification("Error", "Failed to submit suggestion. Try again later.", "badges/summary.png");
    console.error("Error submitting suggestion:", error);
  }
}

async function submitReportToFirestore(report) {
  try {
    await db.collection("reportedQuestions").add(report);
  } catch (error) {
    showNotification("Error", "Failed to submit report. Try again later.", "badges/summary.png");
    console.error("Error submitting report:", error);
  }
}

function recordWrongAnswer(qid, answerText) {
  // Track frequency of wrong answers per question in localStorage
  const errorMap = JSON.parse(localStorage.getItem("errorFrequencyMap") || "{}");
  if (!errorMap[qid]) errorMap[qid] = {};
  errorMap[qid][answerText] = (errorMap[qid][answerText] || 0) + 1;
  localStorage.setItem("errorFrequencyMap", JSON.stringify(errorMap));
}

// --- AUTHENTICATION ---
// Firebase Authentication
document.getElementById('profileBtn')?.addEventListener('click', () => {
  const user = auth.currentUser;
  openModal("Profile", `
    <div style="text-align:center;">
      <img src="${user?.photoURL || 'default-avatar.png'}" alt="Avatar" style="width:64px;height:64px;border-radius:50%;" />
      <p style="margin:12px 0 0 0;">${user?.displayName || user?.email || "Not signed in"}</p>
      ${user ? `
        <button id="signOutBtn" class="modal-btn">Sign Out</button>
      ` : `
        <button id="signInBtn" class="modal-btn">Sign In with Google</button>
      `}
    </div>
  `);
  document.getElementById('signInBtn')?.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider);
  });
  document.getElementById('signOutBtn')?.addEventListener('click', () => auth.signOut());
});

auth.onAuthStateChanged(user => {
  const avatar = document.getElementById('profileAvatar');
  if (user && avatar) {
    avatar.src = user.photoURL || 'default-avatar.png';
    avatar.title = user.displayName || user.email || 'Profile';
  } else if (avatar) {
    avatar.src = 'default-avatar.png';
    avatar.title = 'Sign in';
  }
});

// Example: Save/load user progress to Firestore
async function saveUserProfile(uid, data) {
  await db.collection('users').doc(uid).set(data, { merge: true });
}
async function loadUserProfile(uid) {
  const doc = await db.collection('users').doc(uid).get();
  if (doc.exists) {
    // Merge Firestore data into your app state
    const data = doc.data();
    // e.g. missedQuestions = data.missedQuestions || [];
    //      correct = data.correct || 0;
    //      etc.
  }
}

// --- END OF FILE ---
document.querySelector('.analytics-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('analyticsModal').style.display = 'block';
  renderHistoryChart(); // Your function to draw the chart
});

document.getElementById('closeAnalyticsModal')?.addEventListener('click', () => {
  document.getElementById('analyticsModal').style.display = 'none';
});