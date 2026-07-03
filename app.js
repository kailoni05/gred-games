(() => {
    "use strict";

    const WORD_LENGTH = 5;
    const MAX_ATTEMPTS = 7;
    const ACCESS_CODE_HASH = "3a5fc9bb";
    const STORAGE = {
        streak: "gred_games_streak_v2",
        customWords: "gred_games_custom_words_v4",
        solvedDaily: "gred_games_solved_daily_v2",
        wordTargetCount: "gred_games_word_target_count_v1",
        recentTargets: "gred_games_recent_targets_v1",
        accessGranted: "gred_games_access_granted_v1"
    };

    const LANGUAGES = [
        { code: "DE", name: "Deutsch", keyboard: ["QWERTZUIOP", "ASDFGHJKL", "YXCVBNM", "ÄÖÜẞ"] },
        { code: "EN", name: "English", keyboard: ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"] },
        { code: "FR", name: "Français", keyboard: ["AZERTYUIOP", "QSDFGHJKLM", "WXCVBN"] },
        { code: "ES", name: "Español", keyboard: ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"] },
        { code: "IT", name: "Italiano", keyboard: ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"] }
    ];

    const STATUS_RANK = { absent: 1, present: 2, correct: 3 };

    const state = {
        language: "DE",
        mode: "daily",
        activeWords: {},
        lookup: {},
        hintLookup: {},
        customWords: readJson(STORAGE.customWords, {}),
        wordTargetCount: clampWordTargetCount(readNumber(STORAGE.wordTargetCount, 2)),
        recentTargets: readJson(STORAGE.recentTargets, {}),
        targetWords: [],
        targetHints: [],
        hintLevel: 0,
        guesses: [],
        currentGuess: "",
        solved: [false, false, false, false],
        gameOver: false,
        streak: readNumber(STORAGE.streak, 0),
        unlocked: false,
        toastTimer: 0
    };

    const els = {};

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        collectElements();
        buildActiveWords();
        buildLanguageSelector();
        bindEvents();
        renderLanguageStats();
        setupAccessGate();
        setMode(state.mode, false);
        setWordTargetCount(state.wordTargetCount, false);
        setLanguage(state.language, false);
        newGame();
    }

    function collectElements() {
        els.authGate = document.getElementById("auth-gate");
        els.accessInput = document.getElementById("access-code-input");
        els.accessButton = document.getElementById("access-code-button");
        els.accessMessage = document.getElementById("access-code-message");
        els.heroSubtitle = document.getElementById("hero-subtitle");
        els.languageSelector = document.getElementById("language-selector");
        els.keyboard = document.getElementById("keyboard");
        els.attemptCounter = document.getElementById("attempt-counter");
        els.wordCount = document.getElementById("word-count");
        els.streakCounter = document.getElementById("streak-counter");
        els.toast = document.getElementById("toast-message");
        els.boards = document.getElementById("boards");
        els.boardPanels = [1, 2, 3, 4].map((number) => document.getElementById(`board-word${number}`));
        els.grids = [1, 2, 3, 4].map((number) => document.getElementById(`grid-word${number}`));
        els.statusDots = [1, 2, 3, 4].map((number) => document.getElementById(`word${number}-status`));
        els.hintLines = [1, 2, 3, 4].map((number) => document.getElementById(`hint-word${number}`));
        els.languageStats = document.getElementById("language-stats");
        els.sourceStatus = document.getElementById("source-status");
        els.csvInput = document.getElementById("csv-file-input");
        els.csvStatus = document.getElementById("csv-status-message");
        els.gameoverModal = document.getElementById("gameover-modal");
        els.gameoverMark = document.getElementById("gameover-mark");
        els.gameoverTitle = document.getElementById("gameover-title");
        els.gameoverSubtitle = document.getElementById("gameover-subtitle");
        els.solutionLabel = document.getElementById("solution-label");
        els.solutionWords = [1, 2, 3, 4].map((number) => document.getElementById(`solution-word${number}`));
        els.statAttempts = document.getElementById("stat-attempts");
        els.statStreak = document.getElementById("stat-streak");
        els.hintButton = document.getElementById("hint-button");
    }

    function bindEvents() {
        if (els.accessButton) {
            els.accessButton.addEventListener("click", verifyAccessCode);
        }

        if (els.accessInput) {
            els.accessInput.addEventListener("keydown", (event) => {
                if (event.key === "Enter") verifyAccessCode();
            });
        }

        document.querySelectorAll(".mode-button").forEach((button) => {
            button.addEventListener("click", () => setMode(button.dataset.mode, true));
        });

        document.querySelectorAll(".word-count-button").forEach((button) => {
            button.addEventListener("click", () => setWordTargetCount(button.dataset.wordCount, true));
        });

        document.getElementById("new-game-button").addEventListener("click", newGame);
        if (els.hintButton) els.hintButton.addEventListener("click", showHint);
        document.getElementById("delete-button").addEventListener("click", () => handleKey("BACKSPACE"));
        document.getElementById("upload-button").addEventListener("click", () => els.csvInput.click());
        document.getElementById("clear-custom-button").addEventListener("click", clearCustomWords);
        document.getElementById("share-button").addEventListener("click", shareResult);
        document.getElementById("next-round-button").addEventListener("click", () => {
            closeModal("gameover-modal");
            newGame();
        });

        els.csvInput.addEventListener("change", handleCSVUpload);

        document.querySelectorAll("[data-modal-open]").forEach((button) => {
            button.addEventListener("click", () => openModal(button.dataset.modalOpen));
        });

        document.querySelectorAll("[data-modal-close]").forEach((button) => {
            button.addEventListener("click", () => closeModal(button.closest(".modal-backdrop").id));
        });

        document.querySelectorAll(".modal-backdrop").forEach((modal) => {
            modal.addEventListener("click", (event) => {
                if (event.target === modal && modal.id !== "gameover-modal") {
                    closeModal(modal.id);
                }
            });
        });

        document.addEventListener("keydown", (event) => {
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            if (!state.unlocked) return;

            const openModalElement = document.querySelector(".modal-backdrop:not(.is-hidden)");
            if (openModalElement) {
                if (event.key === "Escape" && openModalElement.id !== "gameover-modal") {
                    closeModal(openModalElement.id);
                }
                return;
            }

            if (event.key === "Enter") {
                handleKey("ENTER");
            } else if (event.key === "Backspace") {
                handleKey("BACKSPACE");
            } else {
                handleKey(event.key);
            }
        });
    }

    function buildActiveWords() {
        const baseWords = window.GRED_GAMES_WORDS || {};
        const hintedWords = window.GRED_GAMES_WORDS_WITH_HINTS || {};
        state.activeWords = {};
        state.lookup = {};
        state.hintLookup = {};

        LANGUAGES.forEach(({ code }) => {
            const hintedRows = Array.isArray(hintedWords[code]) ? hintedWords[code] : [];
            const hintedBuiltInWords = hintedRows.map((row) => Array.isArray(row) ? row[0] : "");
            const builtInWords = hintedBuiltInWords.length > 0
                ? hintedBuiltInWords
                : (Array.isArray(baseWords[code]) ? baseWords[code] : []);
            const merged = [
                ...builtInWords,
                ...(Array.isArray(state.customWords[code]) ? state.customWords[code] : [])
            ];
            const words = uniqueWords(merged);
            const lookup = new Map();
            const hintLookup = new Map();

            words.forEach((word) => {
                const key = foldWord(word);
                if (!lookup.has(key)) lookup.set(key, word);
            });

            hintedRows.forEach((row) => {
                if (!Array.isArray(row)) return;
                const word = sanitizeWord(row[0]);
                if (!isFiveLetterWord(word)) return;

                const key = foldWord(word);
                const hints = [cleanHint(row[1]), cleanHint(row[2])].filter(Boolean);
                if (!hintLookup.has(key) && hints.length > 0) hintLookup.set(key, hints);
            });

            state.activeWords[code] = words;
            state.lookup[code] = lookup;
            state.hintLookup[code] = hintLookup;
        });
    }

    function cleanHint(value) {
        return String(value || "").trim();
    }

    function buildLanguageSelector() {
        els.languageSelector.innerHTML = "";

        LANGUAGES.forEach((language) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "language-button";
            button.dataset.language = language.code;
            button.textContent = language.code;
            button.title = language.name;
            button.addEventListener("click", () => setLanguage(language.code, true));
            els.languageSelector.appendChild(button);
        });
    }

    function setupAccessGate() {
        state.unlocked = localStorage.getItem(STORAGE.accessGranted) === ACCESS_CODE_HASH;
        updateAccessGate();
    }

    function updateAccessGate() {
        if (!els.authGate) return;
        els.authGate.classList.toggle("is-hidden", state.unlocked);
        if (!state.unlocked && els.accessInput) {
            window.setTimeout(() => els.accessInput.focus(), 80);
        }
    }

    function verifyAccessCode() {
        const enteredHash = hashAccessCode(els.accessInput ? els.accessInput.value : "");

        if (enteredHash === ACCESS_CODE_HASH) {
            state.unlocked = true;
            localStorage.setItem(STORAGE.accessGranted, ACCESS_CODE_HASH);
            if (els.accessMessage) els.accessMessage.textContent = "";
            updateAccessGate();
            showToast("Willkommen zurück.");
            return;
        }

        if (els.accessMessage) els.accessMessage.textContent = "Code stimmt nicht.";
        if (els.accessInput) {
            els.accessInput.select();
            els.accessInput.focus();
        }
    }

    function hashAccessCode(value) {
        const normalized = toGameUpper(value).trim().replace(/\s+/g, "");
        let hash = 2166136261;

        for (const char of normalized) {
            hash ^= char.charCodeAt(0);
            hash = Math.imul(hash, 16777619);
        }

        return (hash >>> 0).toString(16);
    }

    function setLanguage(code, reset) {
        if (!LANGUAGES.some((language) => language.code === code)) {
            code = "DE";
        }

        state.language = code;
        document.documentElement.lang = code.toLowerCase();

        document.querySelectorAll(".language-button").forEach((button) => {
            button.classList.toggle("is-active", button.dataset.language === code);
        });

        buildKeyboard();
        updateCounters();

        if (reset) newGame();
    }

    function setMode(mode, reset) {
        state.mode = mode === "training" ? "training" : "daily";

        document.querySelectorAll(".mode-button").forEach((button) => {
            button.classList.toggle("is-active", button.dataset.mode === state.mode);
        });

        if (reset) newGame();
    }

    function setWordTargetCount(count, reset) {
        state.wordTargetCount = clampWordTargetCount(count);
        writeNumber(STORAGE.wordTargetCount, state.wordTargetCount);

        document.querySelectorAll(".word-count-button").forEach((button) => {
            button.classList.toggle("is-active", Number(button.dataset.wordCount) === state.wordTargetCount);
        });

        updateBoardLayout();
        updateCounters();

        if (reset) newGame();
    }

    function activeBoardNumbers() {
        return Array.from({ length: state.wordTargetCount }, (_, index) => index + 1);
    }

    function activeTargetWords() {
        return state.targetWords.slice(0, state.wordTargetCount);
    }

    function clampWordTargetCount(value) {
        const number = Number(value);
        return [1, 2, 4].includes(number) ? number : 2;
    }

    function newGame() {
        const words = state.activeWords[state.language] || [];
        if (uniquePlayableWords(words).length < state.wordTargetCount) {
            showToast("Für diese Auswahl gibt es zu wenige Wörter.");
            return;
        }

        state.targetWords = chooseTargets(words);
        state.targetHints = state.targetWords.map((word) => hintsForWord(word));
        state.hintLevel = 0;
        state.guesses = [];
        state.currentGuess = "";
        state.solved = [0, 1, 2, 3].map((index) => index >= state.wordTargetCount);
        state.gameOver = false;

        closeModal("gameover-modal");
        renderGrids();
        buildKeyboard();
        updateBoardLayout();
        updateSolveDots();
        renderHints();
        updateCounters();
        showToast(state.mode === "daily" ? "Neue Challenge geladen." : "Training gestartet.");
    }

    function chooseTargets(words) {
        const playableWords = shuffleArray(uniquePlayableWords(words));
        const recent = getRecentTargetSet();
        const selected = [];
        const selectedKeys = new Set();

        while (selected.length < state.wordTargetCount) {
            const freshCandidate = playableWords.find((word) => {
                const key = foldWord(word);
                return !selectedKeys.has(key) && !recent.has(key);
            });
            const fallbackCandidate = playableWords.find((word) => !selectedKeys.has(foldWord(word)));
            const candidate = freshCandidate || fallbackCandidate;

            if (!candidate) break;

            selected.push(candidate);
            selectedKeys.add(foldWord(candidate));
        }

        rememberTargets(selected);
        return selected;
    }

    function uniquePlayableWords(words) {
        const map = new Map();

        words.forEach((word) => {
            const key = foldWord(word);
            if (!key || map.has(key)) return;
            map.set(key, word);
        });

        return Array.from(map.values());
    }

    function shuffleArray(items) {
        const shuffled = [...items];

        for (let index = shuffled.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(Math.random() * (index + 1));
            [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
        }

        return shuffled;
    }

    function recentTargetStorageKey() {
        return `${state.language}:${state.wordTargetCount}`;
    }

    function getRecentTargetSet() {
        const recent = state.recentTargets[recentTargetStorageKey()];
        return new Set(Array.isArray(recent) ? recent : []);
    }

    function rememberTargets(targets) {
        const storageKey = recentTargetStorageKey();
        const current = Array.isArray(state.recentTargets[storageKey]) ? state.recentTargets[storageKey] : [];
        const targetKeys = targets.map(foldWord);
        const next = [
            ...targetKeys,
            ...current.filter((key) => !targetKeys.includes(key))
        ].slice(0, 80);

        state.recentTargets[storageKey] = next;
        writeJson(STORAGE.recentTargets, state.recentTargets);
    }

    function renderGrids() {
        els.grids.forEach((grid, index) => {
            if (!grid) return;
            grid.innerHTML = "";

            for (let row = 0; row < MAX_ATTEMPTS; row += 1) {
                grid.appendChild(createRow(index + 1, row));
            }
        });
    }

    function showHint() {
        if (!state.unlocked || state.gameOver) return;

        if (state.hintLevel >= 2) {
            showToast("Alle Tipps sind sichtbar.");
            return;
        }

        state.hintLevel += 1;
        renderHints();
        showToast(state.hintLevel === 1 ? "Tipp 1 sichtbar." : "Tipp 2 sichtbar.");
    }

    function renderHints() {
        els.hintLines.forEach((line, index) => {
            if (!line) return;

            const active = index < state.wordTargetCount;
            const hints = state.targetHints[index] || [];
            const shownHints = hints.slice(0, state.hintLevel).filter(Boolean);
            const visible = active && shownHints.length > 0;

            line.hidden = !visible;
            line.textContent = visible
                ? shownHints.map((hint, hintIndex) => `Tipp ${hintIndex + 1}: ${formatHintForDisplay(hint)}`).join("\n")
                : "";
            line.title = visible ? shownHints.join("\n") : "";
        });

        updateHintButton();
    }

    function formatHintForDisplay(hint) {
        const text = cleanHint(hint);
        const vowelPatterns = [
            [/^Das Wort enthält (\d+) Vokal(?:e)?; (mindestens ein Buchstabe kommt mehrfach vor|kein Buchstabe kommt mehrfach vor)\.$/, "Vok.", "mit Doppel", "ohne Doppel", "mindestens"],
            [/^The word contains (\d+) vowel(?:s)?; (at least one letter is repeated|no letter is repeated)\.$/, "vow.", "repeat", "no repeat", "at least"],
            [/^Le mot contient (\d+) voyelle(?:s)?; (au moins une lettre est répétée|aucune lettre n’est répétée)\.$/, "voy.", "répétée", "unique", "au moins"],
            [/^La palabra contiene (\d+) vocal(?:es)?; (al menos una letra se repite|ninguna letra se repite)\.$/, "voc.", "repite", "sin repetir", "al menos"],
            [/^La parola contiene (\d+) vocal(?:i|e)?; (almeno una lettera si ripete|nessuna lettera si ripete)\.$/, "voc.", "ripete", "no doppie", "almeno"]
        ];

        for (const [pattern, unit, repeated, unique, repeatedMarker] of vowelPatterns) {
            const match = text.match(pattern);
            if (match) return `${match[1]} ${unit} · ${match[2].startsWith(repeatedMarker) ? repeated : unique}`;
        }

        const edgePatterns = [
            [/^Es beginnt mit „(.+)“ und endet mit „(.+)“\.$/, "Start", "Ende"],
            [/^It starts with “(.+)” and ends with “(.+)”\.$/, "Start", "end"],
            [/^Il commence par « (.+) » et se termine par « (.+) »\.$/, "Début", "fin"],
            [/^Empieza por «(.+)» y termina en «(.+)»\.$/, "Inicio", "fin"],
            [/^Inizia con «(.+)» e finisce con «(.+)»\.$/, "Inizio", "fine"]
        ];

        for (const [pattern, startLabel, endLabel] of edgePatterns) {
            const match = text.match(pattern);
            if (match) return `${startLabel} ${match[1]} · ${endLabel} ${match[2]}`;
        }

        return text;
    }

    function updateHintButton() {
        if (!els.hintButton) return;
        els.hintButton.disabled = state.gameOver || state.hintLevel >= 2;
        els.hintButton.setAttribute("aria-label", state.hintLevel === 0 ? "Tipp anzeigen" : "Weiteren Tipp anzeigen");
    }

    function hintsForWord(word) {
        const lookup = state.hintLookup[state.language];
        const storedHints = lookup ? lookup.get(foldWord(word)) : null;
        if (Array.isArray(storedHints) && storedHints.length > 0) return storedHints;
        return buildGeneratedHints(word);
    }

    function buildGeneratedHints(word) {
        const letters = lettersOf(word);
        const foldedLetters = letters.map(foldWord);
        const repeated = new Set(foldedLetters).size < foldedLetters.length;
        const vowelCount = letters.filter((letter) => isVowel(letter)).length;
        const first = letters[0] || "?";
        const last = letters[letters.length - 1] || "?";

        return [
            `Das Wort enthält ${vowelCount} Vokale; ${repeated ? "mindestens ein Buchstabe kommt mehrfach vor" : "kein Buchstabe kommt mehrfach vor"}.`,
            `Es beginnt mit „${first}“ und endet mit „${last}“.`
        ];
    }

    function isVowel(letter) {
        return /^[AEIOUÄÖÜÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÅÆŒ]$/u.test(toGameUpper(letter));
    }

    function createRow(board, row) {
        const rowElement = document.createElement("div");
        rowElement.className = "guess-row";
        rowElement.id = `w${board}-row-${row}`;

        for (let column = 0; column < WORD_LENGTH; column += 1) {
            const tile = document.createElement("div");
            tile.className = "tile";
            tile.id = `w${board}-r${row}-c${column}`;
            tile.setAttribute("aria-hidden", "true");
            rowElement.appendChild(tile);
        }

        return rowElement;
    }

    function buildKeyboard() {
        const language = LANGUAGES.find((item) => item.code === state.language) || LANGUAGES[0];
        els.keyboard.innerHTML = "";

        language.keyboard.forEach((row, index) => {
            const rowElement = document.createElement("div");
            rowElement.className = "keyboard-row";

            if (index === 2) {
                rowElement.appendChild(createKey("ENTER", "Enter", true));
            }

            Array.from(row).forEach((letter) => {
                rowElement.appendChild(createKey(letter, letter, false));
            });

            if (index === 2) {
                rowElement.appendChild(createKey("BACKSPACE", "⌫", true));
            }

            els.keyboard.appendChild(rowElement);
        });
    }

    function createKey(value, label, isAction) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = isAction ? "key action-key" : "key";
        button.textContent = label;
        button.dataset.key = value;
        if (!isAction) button.dataset.char = value;
        button.addEventListener("click", () => handleKey(value));
        return button;
    }

    function handleKey(rawKey) {
        if (!state.unlocked || state.gameOver || state.guesses.length >= MAX_ATTEMPTS) return;

        const key = normalizeInputKey(rawKey);
        if (!key) return;

        if (key === "ENTER") {
            submitGuess();
            return;
        }

        if (key === "BACKSPACE") {
            const letters = lettersOf(state.currentGuess);
            letters.pop();
            state.currentGuess = letters.join("");
            updateCurrentRow();
            return;
        }

        if (lettersOf(state.currentGuess).length >= WORD_LENGTH) return;

        state.currentGuess += key;
        updateCurrentRow();
    }

    function normalizeInputKey(rawKey) {
        const key = String(rawKey || "").normalize("NFC");
        if (key === "ENTER" || key.toUpperCase() === "ENTER") return "ENTER";
        if (key === "BACKSPACE" || key.toUpperCase() === "BACKSPACE") return "BACKSPACE";

        const upper = toGameUpper(key);
        if (lettersOf(upper).length !== 1) return "";
        if (!/^\p{L}$/u.test(upper)) return "";
        return upper;
    }

    function updateCurrentRow() {
        const row = state.guesses.length;
        if (row >= MAX_ATTEMPTS) return;

        const letters = lettersOf(state.currentGuess);

        activeBoardNumbers().forEach((board) => {
            if (state.solved[board - 1]) return;

            for (let column = 0; column < WORD_LENGTH; column += 1) {
                const tile = tileAt(board, row, column);
                const letter = letters[column] || "";

                tile.textContent = letter;
                tile.dataset.state = "";
                tile.className = letter ? "tile is-filled" : "tile";
            }
        });
    }

    function submitGuess() {
        if (lettersOf(state.currentGuess).length < WORD_LENGTH) {
            showToast("Das Wort ist zu kurz.");
            shakeActiveRow();
            return;
        }

        const matchedWord = state.lookup[state.language].get(foldWord(state.currentGuess));
        if (!matchedWord) {
            showToast("Dieses Wort ist nicht in der Liste.");
            shakeActiveRow();
            return;
        }

        const row = state.guesses.length;
        state.guesses.push(matchedWord);

        activeBoardNumbers().forEach((board) => {
            const boardIndex = board - 1;

            if (state.solved[boardIndex]) {
                fillLockedRow(row, board);
                return;
            }

            const result = evaluateGuess(matchedWord, state.targetWords[boardIndex]);
            revealRow(row, board, matchedWord, result);

            if (matchedWord === state.targetWords[boardIndex]) {
                state.solved[boardIndex] = true;
            }
        });

        state.currentGuess = "";
        updateSolveDots();
        updateCounters();
        updateKeyboardStatus();

        window.setTimeout(checkGameResult, 920);
    }

    function revealRow(row, board, guess, result) {
        const letters = lettersOf(guess);

        result.forEach((status, column) => {
            const tile = tileAt(board, row, column);

            window.setTimeout(() => {
                tile.textContent = letters[column] || "";
                tile.className = "tile is-flipping";

                window.setTimeout(() => {
                    tile.dataset.state = status;
                }, 220);

                window.setTimeout(() => {
                    tile.classList.remove("is-flipping");
                }, 540);
            }, column * 85);
        });
    }

    function fillLockedRow(row, board) {
        for (let column = 0; column < WORD_LENGTH; column += 1) {
            const tile = tileAt(board, row, column);
            tile.textContent = "-";
            tile.className = "tile";
            tile.dataset.state = "locked";
        }
    }

    function shakeActiveRow() {
        const row = state.guesses.length;
        activeBoardNumbers().forEach((board) => {
            if (state.solved[board - 1]) return;
            const rowElement = document.getElementById(`w${board}-row-${row}`);
            rowElement.classList.add("is-shaking");
            window.setTimeout(() => rowElement.classList.remove("is-shaking"), 430);
        });
    }

    function evaluateGuess(guess, target) {
        const guessLetters = lettersOf(guess);
        const targetLetters = lettersOf(target);
        const result = Array(WORD_LENGTH).fill("absent");
        const counts = new Map();

        targetLetters.forEach((letter, index) => {
            if (guessLetters[index] !== letter) {
                counts.set(letter, (counts.get(letter) || 0) + 1);
            }
        });

        for (let index = 0; index < WORD_LENGTH; index += 1) {
            if (guessLetters[index] === targetLetters[index]) {
                result[index] = "correct";
            }
        }

        for (let index = 0; index < WORD_LENGTH; index += 1) {
            const letter = guessLetters[index];
            const count = counts.get(letter) || 0;

            if (result[index] === "correct" || count <= 0) continue;

            result[index] = "present";
            counts.set(letter, count - 1);
        }

        return result;
    }

    function updateKeyboardStatus() {
        const letterStates = new Map();

        state.guesses.forEach((guess) => {
            activeTargetWords().forEach((target) => {
                const result = evaluateGuess(guess, target);
                lettersOf(guess).forEach((letter, index) => {
                    const key = foldLetter(letter);
                    if (!key) return;

                    const status = result[index];
                    const current = letterStates.get(key);
                    if (!current || STATUS_RANK[status] > STATUS_RANK[current]) {
                        letterStates.set(key, status);
                    }
                });
            });
        });

        document.querySelectorAll(".key[data-char]").forEach((keyElement) => {
            const status = letterStates.get(keyElement.dataset.char);
            keyElement.dataset.state = status || "";
        });
    }

    function checkGameResult() {
        if (state.solved.slice(0, state.wordTargetCount).every(Boolean)) {
            state.gameOver = true;
            registerWin();
            showGameOver(true);
            return;
        }

        if (state.guesses.length >= MAX_ATTEMPTS) {
            state.gameOver = true;
            registerLoss();
            showGameOver(false);
        }
    }

    function registerWin() {
        if (state.mode === "daily") {
            const solved = readJson(STORAGE.solvedDaily, {});
            const key = dailyCompletionKey();
            if (!solved[key]) {
                state.streak += 1;
                solved[key] = true;
                writeJson(STORAGE.solvedDaily, solved);
            }
        } else {
            state.streak += 1;
        }

        writeNumber(STORAGE.streak, state.streak);
        updateCounters();
    }

    function registerLoss() {
        state.streak = 0;
        writeNumber(STORAGE.streak, 0);
        updateCounters();
    }

    function showGameOver(didWin) {
        els.gameoverMark.textContent = didWin ? "OK" : "!";
        els.gameoverMark.classList.toggle("is-loss", !didWin);
        els.gameoverTitle.textContent = didWin ? "Stark gelöst" : "Runde verloren";
        const winCopy = {
            1: "Das Wort sitzt. Sauberer Lauf.",
            2: "Beide Wörter sitzen. Sauberer Lauf.",
            4: "Alle vier Wörter sitzen. Sauberer Lauf."
        };
        els.gameoverSubtitle.textContent = didWin
            ? winCopy[state.wordTargetCount]
            : "Die Lösung war knapp versteckt.";
        els.solutionLabel.textContent = state.wordTargetCount === 1 ? "Gesuchtes Wort" : "Gesuchte Wörter";
        els.solutionWords.forEach((solution, index) => {
            if (!solution) return;
            solution.textContent = state.targetWords[index] || "";
            solution.hidden = index >= state.wordTargetCount;
        });
        els.statAttempts.textContent = `${state.guesses.length}/${MAX_ATTEMPTS}`;
        els.statStreak.textContent = String(state.streak);
        updateHintButton();
        openModal("gameover-modal");
    }

    function shareResult() {
        const lines = [
            `GRED GAMES ${state.language} ${state.guesses.length}/${MAX_ATTEMPTS}`,
            `Modus: ${state.mode === "daily" ? "Tages-Challenge" : "Training"}`,
            `Wörter: ${state.wordTargetCount}`,
            `Tipps: ${state.hintLevel}/2`,
            `Serie: ${state.streak}`,
            ""
        ];

        state.guesses.forEach((guess) => {
            lines.push(activeTargetWords().map((target) => buildResultMarks(guess, target)).join(" | "));
        });

        copyText(lines.join("\n"));
    }

    function buildResultMarks(guess, target) {
        return evaluateGuess(guess, target)
            .map((status) => {
                if (status === "correct") return "G";
                if (status === "present") return "Y";
                return "-";
            })
            .join("");
    }

    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text)
                .then(() => showToast("Ergebnis kopiert."))
                .catch(() => fallbackCopy(text));
            return;
        }

        fallbackCopy(text);
    }

    function fallbackCopy(text) {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();

        try {
            document.execCommand("copy");
            showToast("Ergebnis kopiert.");
        } catch {
            showToast("Kopieren wurde blockiert.");
        } finally {
            textarea.remove();
        }
    }

    function updateSolveDots() {
        els.statusDots.forEach((dot, index) => {
            if (!dot) return;
            dot.classList.toggle("is-solved", Boolean(state.solved[index]));
        });
    }

    function updateBoardLayout() {
        const solo = state.wordTargetCount === 1;
        const quad = state.wordTargetCount === 4;
        if (els.boards) {
            els.boards.classList.toggle("is-solo", solo);
            els.boards.classList.toggle("is-quad", quad);
        }
        els.boardPanels.forEach((panel, index) => {
            if (!panel) return;
            panel.classList.toggle("is-hidden", index >= state.wordTargetCount);
        });
        if (els.heroSubtitle) {
            const subtitles = {
                1: "Ein Wort. Sieben Versuche. Ein sauberer Lauf.",
                2: "Zwei Wörter. Sieben Versuche. Ein sauberer Lauf.",
                4: "Vier Wörter. Sieben Versuche. Ein sauberer Lauf."
            };
            els.heroSubtitle.textContent = subtitles[state.wordTargetCount];
        }
    }

    function updateCounters() {
        const words = state.activeWords[state.language] || [];
        els.attemptCounter.textContent = String(state.guesses.length);
        els.wordCount.textContent = formatNumber(words.length);
        els.streakCounter.textContent = String(state.streak);
        updateBoardLayout();
    }

    function renderLanguageStats() {
        els.languageStats.innerHTML = "";

        LANGUAGES.forEach(({ code }) => {
            const pill = document.createElement("div");
            pill.className = "stat-pill";
            pill.innerHTML = `<span>${code}</span><strong>${formatNumber((state.activeWords[code] || []).length)}</strong>`;
            els.languageStats.appendChild(pill);
        });

        const customTotal = LANGUAGES.reduce((sum, { code }) => sum + (state.customWords[code] || []).length, 0);
        els.sourceStatus.textContent = customTotal > 0
            ? `CSV integriert + ${formatNumber(customTotal)} eigene`
            : "CSV integriert";
    }

    function openModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.remove("is-hidden");
    }

    function closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.add("is-hidden");
    }

    function showToast(message) {
        window.clearTimeout(state.toastTimer);
        els.toast.textContent = message;
        els.toast.classList.add("is-visible");
        state.toastTimer = window.setTimeout(() => {
            els.toast.classList.remove("is-visible");
        }, 2600);
    }

    function handleCSVUpload(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        const reader = new FileReader();

        reader.onload = () => {
            const imported = wordsFromCSV(String(reader.result || ""));
            const importedTotal = LANGUAGES.reduce((sum, { code }) => sum + imported[code].length, 0);

            if (importedTotal === 0) {
                els.csvStatus.textContent = "Keine gültigen 5-Buchstaben-Wörter gefunden.";
                event.target.value = "";
                return;
            }

            LANGUAGES.forEach(({ code }) => {
                state.customWords[code] = uniqueWords([
                    ...(state.customWords[code] || []),
                    ...imported[code]
                ]);
            });

            writeJson(STORAGE.customWords, state.customWords);
            buildActiveWords();
            renderLanguageStats();
            updateCounters();
            newGame();

            els.csvStatus.textContent = `${formatNumber(importedTotal)} Wörter hinzugefügt.`;
            event.target.value = "";
        };

        reader.onerror = () => {
            els.csvStatus.textContent = "CSV konnte nicht gelesen werden.";
            event.target.value = "";
        };

        reader.readAsText(file, "utf-8");
    }

    function clearCustomWords() {
        state.customWords = {};
        writeJson(STORAGE.customWords, state.customWords);
        buildActiveWords();
        renderLanguageStats();
        updateCounters();
        newGame();
        els.csvStatus.textContent = "Eigene Liste gelöscht.";
    }

    function wordsFromCSV(text) {
        const rows = parseCSV(text);
        const result = emptyLanguageBucket();
        if (rows.length === 0) return result;

        const header = rows[0].map((value) => foldWord(value).replace(/[^\p{L}]/gu, ""));
        const mappedColumns = header.map(headerToLanguage);
        const hasHeader = mappedColumns.some(Boolean);
        const fallbackOrder = ["EN", "ES", "FR", "IT", "DE"];
        const startRow = hasHeader ? 1 : 0;

        for (let rowIndex = startRow; rowIndex < rows.length; rowIndex += 1) {
            rows[rowIndex].forEach((value, columnIndex) => {
                const language = hasHeader ? mappedColumns[columnIndex] : fallbackOrder[columnIndex];
                if (!language) return;

                const word = sanitizeWord(value);
                if (isFiveLetterWord(word)) result[language].push(word);
            });
        }

        LANGUAGES.forEach(({ code }) => {
            result[code] = uniqueWords(result[code]);
        });

        return result;
    }

    function parseCSV(text) {
        const delimiter = detectDelimiter(text);
        const rows = [];
        let row = [];
        let field = "";
        let inQuotes = false;

        for (let index = 0; index < text.length; index += 1) {
            const char = text[index];
            const next = text[index + 1];

            if (char === "\"") {
                if (inQuotes && next === "\"") {
                    field += "\"";
                    index += 1;
                } else {
                    inQuotes = !inQuotes;
                }
                continue;
            }

            if (!inQuotes && char === delimiter) {
                row.push(field);
                field = "";
                continue;
            }

            if (!inQuotes && (char === "\n" || char === "\r")) {
                if (char === "\r" && next === "\n") index += 1;
                row.push(field);
                if (row.some((value) => value.trim())) rows.push(row);
                row = [];
                field = "";
                continue;
            }

            field += char;
        }

        row.push(field);
        if (row.some((value) => value.trim())) rows.push(row);
        return rows;
    }

    function detectDelimiter(text) {
        const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || "";
        const semicolons = (firstLine.match(/;/g) || []).length;
        const commas = (firstLine.match(/,/g) || []).length;
        return semicolons >= commas ? ";" : ",";
    }

    function headerToLanguage(header) {
        const aliases = {
            EN: ["EN", "ENGLISH", "ENGLISCH"],
            ES: ["ES", "SPANISCH", "SPANISH", "ESPANOL"],
            FR: ["FR", "FRANZOSISCH", "FRANCAIS", "FRENCH"],
            IT: ["IT", "ITALIENISCH", "ITALIAN"],
            DE: ["DE", "DEUTSCH", "GERMAN"]
        };

        return Object.entries(aliases).find(([, names]) => names.includes(header))?.[0] || "";
    }

    function emptyLanguageBucket() {
        return LANGUAGES.reduce((bucket, { code }) => {
            bucket[code] = [];
            return bucket;
        }, {});
    }

    function uniqueWords(words) {
        const map = new Map();

        words.forEach((rawWord) => {
            const word = sanitizeWord(rawWord);
            if (!isFiveLetterWord(word)) return;
            if (!map.has(word)) map.set(word, word);
        });

        return Array.from(map.values()).sort((a, b) => a.localeCompare(b, "de"));
    }

    function sanitizeWord(value) {
        return toGameUpper(value)
            .trim()
            .normalize("NFC")
            .replace(/[^\p{L}]/gu, "");
    }

    function toGameUpper(value) {
        const sharpSPlaceholder = "\uE000";
        return String(value || "")
            .normalize("NFC")
            .replace(/[ßẞ]/g, sharpSPlaceholder)
            .toLocaleUpperCase("de-DE")
            .replace(new RegExp(sharpSPlaceholder, "g"), "ẞ");
    }

    function isFiveLetterWord(word) {
        const letters = lettersOf(word);
        return letters.length === WORD_LENGTH && letters.every((letter) => /^\p{L}$/u.test(letter));
    }

    function lettersOf(word) {
        return Array.from(String(word || "").normalize("NFC"));
    }

    function foldWord(word) {
        return toGameUpper(word)
            .normalize("NFD")
            .replace(/\p{M}/gu, "")
            .replace(/[ẞß]/g, "SS");
    }
    function foldLetter(letter) {
        const folded = foldWord(letter);
        if (folded === "SS") return "ẞ";
        return folded.length === 1 && /^[A-Z]$/.test(folded) ? folded : "";
    }

    function sameWord(a, b) {
        return foldWord(a) === foldWord(b);
    }

    function tileAt(board, row, column) {
        return document.getElementById(`w${board}-r${row}-c${column}`);
    }

    function dateKey() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, "0");
        const day = String(today.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function dailyCompletionKey() {
        return `${dateKey()}:${state.language}:${state.wordTargetCount}:${activeTargetWords().join(":")}`;
    }


    function formatNumber(value) {
        return new Intl.NumberFormat("de-DE").format(value);
    }

    function readJson(key, fallback) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : fallback;
        } catch {
            return fallback;
        }
    }

    function writeJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {
            showToast("Speichern ist im Browser blockiert.");
        }
    }

    function readNumber(key, fallback) {
        try {
            const value = Number(localStorage.getItem(key));
            return Number.isFinite(value) ? value : fallback;
        } catch {
            return fallback;
        }
    }
    function writeNumber(key, value) {
        try {
            localStorage.setItem(key, String(value));
        } catch {
            showToast("Speichern ist im Browser blockiert.");
        }
    }
})();


