// ===============================
// Massage Therapy Smart Study PRO
// Main App Logic
// ===============================

// --- GLOBAL STATE & SELECTORS ---
const SELECTORS = {
  quizCard: "#quiz-card",
  flashcardsCard: "#flashcards-card",
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
let currentTopic = "";
let questionsByTopic = {}; // ✅ ADD THIS
let quizIndex = 0;
let score = 0;
let historyChart;
let accuracyChart;
let xp = parseInt(localStorage.getItem("xp") || "0", 10);
let vocabulary = [];

/**
 * @typedef {Object} Badge
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {() => boolean} condition
 */

/** @type {Badge[]} */
const badges = [
  { id: "streak_10", name: "Streak Master", description: "Achieve a streak of 10 correct answers.", condition: () => streak >= 10 },
  { id: "accuracy_90", name: "Accuracy Pro", description: "Achieve 90% accuracy in a quiz.", condition: () => (correct / quiz.length) >= 0.9 },
  { id: "first_steps", name: "First Steps", description: "Answer your first question correctly.", condition: () => correct === 1 },
  { id: "first_quiz", name: "First Quiz", description: "Complete your first quiz.", condition: () => quiz.length > 0 && current >= quiz.length },
];
let earnedBadges = JSON.parse(localStorage.getItem("earnedBadges")) || [];
earnedBadges = earnedBadges.filter(badgeId => badges.some(b => b.id === badgeId));

// --- UTILITY FUNCTIONS ---
/**
 * Shuffle an array in place.
 * @param {Array} array
 * @returns {Array}
 */
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

/**
 * Format a filename or topic string to a human-readable title.
 * @param {string} filename
 * @returns {string}
 */
function formatTitle(filename) {
  return filename.replace(/_/g, ' ').replace(/\.json$/i, '').replace(/\b\w/g, c => c.toUpperCase());
}

function formatTopicName(topic) {
  if (!topic) return "";
  const cleaned = topic
    .replace(/_/g, " ")
    .replace(/\bsoap\b/gi, "SOAP") // force SOAP to be uppercase
    .replace(/\b\w/g, c => c.toUpperCase()); // capitalize each word
  return cleaned;
}

// --- QUESTION LOADING & INITIALIZATION ---
/**
 * Load questions from localStorage or manifest.
 */
async function loadQuestions() {
  const cachedQuestions = localStorage.getItem("questions");
  try {
    if (cachedQuestions) {
      questions = JSON.parse(cachedQuestions);
    } else {
      // Fetch all questions from manifest
      questions = [];
      const manifestPaths = await getManifestPaths();
      for (const path of manifestPaths) {
        try {
          const fileRes = await fetch(path);
          const data = await fileRes.json();
          if (Array.isArray(data)) {
            questions.push(...data);
          } else if (data && typeof data === "object") {
            questions.push(data);
          }
        } catch (err) {
          console.error("Error loading questions from file:", path, err);
        }
      }
      localStorage.setItem("questions", JSON.stringify(questions));
    }
    // Bookmarks and unanswered
    const bookmarks = JSON.parse(localStorage.getItem("bookmarkedQuestions")) || [];
    questions.forEach(q => { q.bookmarked = bookmarks.includes(q.id); });
    unansweredQuestions = [...questions];
    loadUserData();
    const startBtn = document.querySelector(SELECTORS.startBtn);
    if (startBtn) startBtn.disabled = false;
    const loading = document.getElementById("loading");
    if (loading) loading.style.display = "none";
    preloadImages(questions);
    bookmarkedQuestions = getBookmarkedQuestions(questions);
  } catch (err) {
    localStorage.removeItem("questions");
    showNotification("Error", "Failed to load questions.", "badges/summary.png");
    console.error("Error loading questions:", err);
  }

  // Build a lookup object after loading questions
  questionsByTopic = {};
  questions.forEach(question => {
    const topicKey = (question.topic || "").trim().toLowerCase();
    if (!topicKey) return;
    questionsByTopic[topicKey] = questionsByTopic[topicKey] || [];
    questionsByTopic[topicKey].push(question);
  });
}

/**
 * Preload images for all questions to improve quiz performance.
 * @param {Array} questionsArr
 */
function preloadImages(questionsArr) {
  questionsArr.forEach(q => {
    if (q.image) {
      const img = new Image();
      img.src = q.image;
    }
    });
}

// --- EVENT LISTENERS & UI SETUP ---
document.addEventListener("DOMContentLoaded", async () => {
  await loadQuestions();
  await loadVocabulary();
  setupUI();
  const topics = questions.map(q => q.topic);
  console.log([...new Set(questions.map(q => q.topic))]);
  populateTopicDropdown(topics);
  updateXPBar(); // <-- Add this line
  showNotification(
    "Welcome!",
    "Challenge your skills with Massage Therapy Smart Study PRO!",
    "badges/welcome.png"
  );
  renderChartsOnLoad();
  console.log(questions.filter(q => q.topic && q.topic.trim().toLowerCase() === "animal vs plant cells".toLowerCase()));
  console.log(questions.filter(q => q.topic && q.topic.includes("Anatomy Prefixes")));
  const topicCounts = {};
  questions.forEach(q => {
    const t = (q.topic || "").trim().toLowerCase();
    topicCounts[t] = (topicCounts[t] || 0) + 1;
  });
  console.log(topicCounts);
});

/**
 * Setup UI event listeners for dropdowns, buttons, and modals.
 */
function setupUI() {
  const topicSelect = document.querySelector(SELECTORS.topicSelect);
  const lengthSelect = document.querySelector(SELECTORS.lengthSelect);
  const startBtn = document.querySelector(SELECTORS.startBtn);
  const quizCard = document.querySelector('.quiz-card');
  const flashcardsCard = document.querySelector('.flashcards-card');

  function autoStart() {
    if (topicSelect.value && lengthSelect.value) {
      if (topicSelect.value === "vocabulary") {
        quizCard.style.display = 'none';
        flashcardsCard.style.display = 'block';
        selectedTopic = topicSelect.value;
        flashcardPool = shuffle([...vocabulary]);
        flashcardIndex = 0;
        renderFlashcard();
      } else {
        quizCard.style.display = 'block';
        flashcardsCard.style.display = 'none';
        startQuiz();
      }
    }
  }

  if (topicSelect) topicSelect.addEventListener("change", autoStart);
  if (lengthSelect) lengthSelect.addEventListener("change", autoStart);

  // ...rest of setupUI...
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
  if (startBtn) startBtn.addEventListener("click", startQuiz);

  document.querySelectorAll(".smart-learning a, .smart-learning-link").forEach(link =>
    link.addEventListener("click", showSmartLearningModal)
  );
  document.querySelectorAll(".view-analytics a, .analytics-link").forEach(link =>
    link.addEventListener("click", showAnalyticsModal)
  );
  document.querySelectorAll(".settings a, .settings-link").forEach(link =>
    link.addEventListener("click", showSettingsModal)
  );

  startBtn.addEventListener('click', async () => {
    if (modeSelect.value === 'flashcards') {
      quizCard.style.display = 'none';
      flashcardsCard.style.display = 'block';
      selectedTopic = topicSelect.value; // <-- Add this line
      if (topicSelect.value === "vocabulary") {
        flashcardPool = shuffle([...vocabulary]);
      } else {
        // ...existing question logic...
      }
      flashcardIndex = 0;
      renderFlashcard();
    } else {
      // Always reload questions to ensure a fresh pool
      await loadQuestions(); // <-- reloads from cache or manifest
      // Reset topic if it's not a real topic
      if (["vocabulary", "unanswered", "missed", "bookmarked", ""].includes(topicSelect.value) ||
          ![...topicSelect.options].some(opt => opt.value === topicSelect.value)) {
        const firstRealTopic = Array.from(topicSelect.options)
          .find(opt => opt.value && !["vocabulary", "unanswered", "missed", "bookmarked"].includes(opt.value));
        if (firstRealTopic) topicSelect.value = firstRealTopic.value;
      }
      quizCard.style.display = 'block';
      flashcardsCard.style.display = 'none';
      // Debug logs
      console.log("Switching to quiz mode...");
      console.log("Current topic:", topicSelect.value);
      console.log("Questions loaded:", questions.length);
      startQuiz();
    }
  });

  let flashcardFlipped = false;
  document.getElementById('flashcard').addEventListener('click', () => {
    flashcardFlipped = !flashcardFlipped;
    document.getElementById('flashcard-front').style.display = flashcardFlipped ? 'none' : 'block';
    document.getElementById('flashcard-back').style.display = flashcardFlipped ? 'block' : 'none';
  });

  document.getElementById('prev-flashcard').addEventListener('click', () => {
    if (flashcardPool.length) {
      flashcardIndex = (flashcardIndex - 1 + flashcardPool.length) % flashcardPool.length;
      renderFlashcard();
    }
  });
  document.getElementById('next-flashcard').addEventListener('click', () => {
    if (flashcardPool.length) {
      flashcardIndex = (flashcardIndex + 1) % flashcardPool.length;
      renderFlashcard();
    }
  });
}

function populateTopicDropdown(topics) {
  const dropdown = document.querySelector("[data-topic]");
  if (!dropdown) return;
  dropdown.setAttribute("aria-label", "Select quiz topic");
  dropdown.innerHTML = ""; // Clear old options

  const staticOptions = [
    { value: "", text: "-- Select Topic --", disabled: true, selected: true },
    { value: "unanswered", text: "Unanswered Questions" },
    { value: "missed", text: "Missed Questions" },
    { value: "bookmarked", text: "Bookmarked Questions" },
    { value: "vocabulary", text: "Vocabulary Flashcards" }
  ];

  staticOptions.forEach(opt => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.text;
    if (opt.disabled) option.disabled = true;
    if (opt.selected) option.selected = true;
    dropdown.appendChild(option);
  });

  const uniqueTopics = [...new Set(questions.map(q => q.topic && q.topic.trim().toLowerCase()))].filter(Boolean).sort();
  uniqueTopics.forEach(topic => {
    const option = document.createElement("option");
    option.value = topic; // normalized value
    option.textContent = formatTitle(topic); // display text
    dropdown.appendChild(option);
  });
}

function startQuiz(selectedTopic) {
  // If called from an event, get the topic from the dropdown
  if (typeof selectedTopic !== "string") {
    const topicSelect = document.querySelector(SELECTORS.topicSelect);
    selectedTopic = topicSelect ? topicSelect.value : "";
  }
  const topic = selectedTopic || currentTopic || "";
  const key = typeof topic === "string" ? topic.trim().toLowerCase() : "";

  if (!key || !questionsByTopic[key]) {
    console.log("⚠️ Invalid or missing topic selection.");
    return;
  }
  questions = questionsByTopic[key] || [];

  console.log("Selected topic for quiz:", selectedTopic);
  console.log("Using currentTopic fallback:", currentTopic);
  console.log("Normalized key:", key);
  console.log("Questions loaded:", questions.length);

  if (questions.length === 0) {
    showNotification("No questions", "No questions available for this topic!", "badges/summary.png");
    // Only update the quiz header and clear other children, do NOT replace innerHTML!
    const quizCard = document.querySelector(SELECTORS.quizCard);
    if (quizCard) {
      const quizHeader = quizCard.querySelector('.quiz-header');
      if (quizHeader) quizHeader.textContent = "No questions available for this topic!";
      const questionText = quizCard.querySelector('.question-text');
      if (questionText) questionText.textContent = "";
      const answers = quizCard.querySelector('#answers');
      if (answers) answers.innerHTML = "";
    }
    return;
  }

  // Reset quiz state
  quiz = shuffle([...questions]);
  quizIndex = 0;
  score = 0;
  current = 0;
  correct = 0;
  streak = 0;

  document.querySelector(SELECTORS.quizCard).classList.remove("hidden");
  renderQuestion();
}

/**
 * Render the current quiz question and answers.
 */
function renderQuestion() {
  const quizCard = document.querySelector(SELECTORS.quizCard);
  if (!quizCard) {
    console.warn('Quiz card element not found!');
    return;
  }
  const quizHeader = quizCard.querySelector('.quiz-header');
  if (!quizHeader) {
    console.warn('Quiz header element not found!');
    return;
  }

  if (!quiz || quiz.length === 0) {
    let msg = "No questions available for this topic!";
    if (selectedTopic === "missed") msg = "No missed questions to review!";
    if (selectedTopic === "unanswered") msg = "No unanswered questions to review!";
    if (selectedTopic === "bookmarked") msg = "No bookmarked questions to review!";
    // Show the message in quizHeader or another child
    quizHeader.textContent = msg;
    // Optionally hide other children
    quizCard.querySelector('.question-text').textContent = "";
    const answers = quizCard.querySelector('#answers');
    if (answers) answers.innerHTML = "";
    return;
  }

  const q = quiz[current];
  if (!q) {
    document.querySelector(SELECTORS.quizCard).classList.add("hidden");
    return;
  }

  const answerObjs = q.answers.map((a, i) => ({
    text: a,
    isCorrect: i === q.correct
  }));
  shuffle(answerObjs);

  renderQuizHeader(q);

  document.querySelector(".quiz-header").textContent = formatTopicName(selectedTopic);
  document.querySelector(".question-text").textContent = q.question;
  renderAnswers(answerObjs);
  document.querySelector(SELECTORS.feedback).textContent = "";

  document.querySelector(SELECTORS.quizCard).querySelectorAll(".question-actions").forEach(el => el.remove());

  renderQuestionActions(q);

  console.log('quizCard:', quizCard);
  console.log('quizHeader:', quizHeader);
  console.log('questionText:', quizCard.querySelector('.question-text'));
  console.log('answers:', quizCard.querySelector('#answers'));
}

/**
 * Render the quiz header row with topic, streak, and bookmark button.
 */
function renderQuizHeader() {
  const quizHeader = document.querySelector('.quiz-card .quiz-header');
  if (!quizHeader) {
    console.warn('quizHeader not found!');
    return;
  }
  quizHeader.textContent = formatTopicName(selectedTopic);
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

  const qid = quiz[current].id;

  // ...existing missed/correct logic...

  showFeedback(isCorrect, quiz[current]);

  if (isCorrect) correct++;
  unansweredQuestions = unansweredQuestions.filter(q => q.id !== qid);

  if (isCorrect) {
    addXP(10); // 10 XP for correct
  } else {
    addXP(2); // 2 XP for incorrect
  }

  setTimeout(() => {
    current++;
    if (current >= quiz.length) {
      showSummary();
      return;
    }
    renderQuestion();
    renderAccuracyChart(correct, current - correct, quiz.length - current);
  }, 1500);
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
  const totalQuestions = questions.length;
  const answered = questions.filter(q => (q.stats?.correct || 0) + (q.stats?.incorrect || 0) > 0).length;
  const correctCount = questions.reduce((sum, q) => sum + (q.stats?.correct || 0), 0);
  const incorrectCount = questions.reduce((sum, q) => sum + (q.stats?.incorrect || 0), 0);
  const accuracy = (correctCount + incorrectCount) > 0 ? Math.round((correctCount / (correctCount + incorrectCount)) * 100) : 0;

  // Per-topic stats
  const topicStats = {};
  questions.forEach(q => {
    if (!q.topic) return;
    if (!topicStats[q.topic]) topicStats[q.topic] = { correct: 0, incorrect: 0, total: 0 };
    topicStats[q.topic].correct += q.stats?.correct || 0;
    topicStats[q.topic].incorrect += q.stats?.incorrect || 0;
    topicStats[q.topic].total += (q.stats?.correct || 0) + (q.stats?.incorrect || 0);
  });

  const masteryHtml = Object.entries(topicStats).map(([topic, stat]) => {
    const acc = stat.total ? stat.correct / stat.total : 0;
    return `<li style="background:${masteryColor(acc)};padding:4px 8px;border-radius:4px;margin:2px 0;">
      <strong>${formatTopicName(topic)}:</strong> ${(acc*100).toFixed(0)}% mastery (${stat.correct}/${stat.total})
    </li>`;
  }).join("");

  openModal("Enhanced Analytics", `
    <p><strong>XP:</strong> ${xp} (Level ${getXPLevel()})</p>
    <ul style="list-style: none; padding: 0;">
      <li><strong>Questions Answered:</strong> ${answered}</li>
      <li><strong>Correct:</strong> ${correctCount}</li>
      <li><strong>Incorrect:</strong> ${incorrectCount}</li>
      <li><strong>Accuracy:</strong> ${accuracy}%</li>
    </ul>
    <h4 style="margin-top:16px;">Per Topic Stats</h4>
    <ul style="margin-top:0">${masteryHtml}</ul>
    <h4 style="margin-top:16px;">Chart Visualization</h4>
    <canvas id="analyticsChart" width="300" height="120"></canvas>
  `);

  // Chart: Correct vs Incorrect
  setTimeout(() => {
    const ctx = document.getElementById("analyticsChart")?.getContext("2d");
    if (ctx) {
      new Chart(ctx, {
        type: "bar",
        data: {
          labels: ["Correct", "Incorrect"],
          datasets: [{
            label: "Answers",
            data: [correctCount, incorrectCount],
            backgroundColor: ["#6BCB77", "#FF6B6B"]
          }]
        },
        options: { responsive: true }
      });
    }
  }, 100);
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
      <label>
        Always Show Explanations:
        <select id="showExplanationSetting">
          <option value="always">Always</option>
          <option value="toggle">Show with Toggle</option>
          <option value="never">Never</option>
        </select>
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
  document.getElementById("showExplanationSetting").value = settings.showExplanationSetting || "always";

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const newSettings = {
      difficulty: document.getElementById("difficultySelect").value,
      timerEnabled: document.getElementById("timerToggle").checked,
      adaptiveMode: document.getElementById("adaptiveModeToggle").checked,
      showExplanationSetting: document.getElementById("showExplanationSetting").value
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
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
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

// --- MANIFEST & TOPIC DROPDOWN ---
/**
 * Fetch manifest paths for external question modules.
 */
async function getManifestPaths() {
  const res = await fetch('manifestquestions.json');
  return await res.json();
}

// --- FIREBASE CONFIG ---
// NOTE: Do not commit real secrets to public repos. Use environment variables or config files for production.
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

/**
 * Submit a suggested question to Firestore.
 */
async function submitSuggestionToFirestore(suggestion) {
  try {
    await db.collection("suggestedQuestions").add(suggestion);
  } catch (error) {
    showNotification("Error", "Failed to submit suggestion. Try again later.", "badges/summary.png");
    console.error("Error submitting suggestion:", error);
  }
}

/**
 * Submit a reported question to Firestore.
 */
async function submitReportToFirestore(report) {
  try {
    await db.collection("reportedQuestions").add(report);
  } catch (error) {
    showNotification("Error", "Failed to submit report. Try again later.", "badges/summary.png");
    console.error("Error submitting report:", error);
  }
}

function addXP(amount) {
  xp += amount;
  localStorage.setItem("xp", xp);
  updateXPBar();
}

function getXPLevel() {
  return Math.floor(xp / 100) + 1;
}

function getXPProgressPercent() {
  return (xp % 100);
}

function updateXPBar() {
  const xpBar = document.getElementById("xp-progress-bar");
  const xpLabel = document.getElementById("xp-label");
  if (xpBar) xpBar.style.width = getXPProgressPercent() + "%";
  if (xpLabel) xpLabel.textContent = `Level ${getXPLevel()} — ${xp % 100} / 100 XP`;
}

async function loadVocabulary() {
  try {
    const res = await fetch('vocabulary.json');
    vocabulary = await res.json();
  } catch (err) {
    console.error("Failed to load vocabulary:", err);
  }
}

let flashcardIndex = 0;
let flashcardPool = [];

function renderFlashcard() {
  if (!flashcardPool.length) return;
  const card = flashcardPool[flashcardIndex];
  if (selectedTopic === "vocabulary") {
    document.getElementById('flashcard-front').textContent = card.term;
    document.getElementById('flashcard-back').textContent = card.definition;
  } else if (card.answers && typeof card.correct === "number") {
    document.getElementById('flashcard-front').textContent = card.question;
    document.getElementById('flashcard-back').textContent = card.answers[card.correct];
  } else {
    document.getElementById('flashcard-front').textContent = "Invalid flashcard data";
    document.getElementById('flashcard-back').textContent = "";
  }
  // Reset flip state
  flashcardFlipped = false;
  document.getElementById('flashcard-front').style.display = 'block';
  document.getElementById('flashcard-back').style.display = 'none';
}
