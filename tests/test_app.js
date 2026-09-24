/**
 * HDD Task Board — Tests (Node.js + jsdom, no framework)
 */

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const js = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log("  PASS  " + name);
    passed++;
  } catch (e) {
    console.log("  FAIL  " + name);
    console.log("        " + e.message);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || "Assertion failed");
}

function freshBoard() {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    resources: "usable",
    url: "http://localhost",
  });
  // Clear localStorage before loading app
  dom.window.localStorage.clear();
  dom.window.eval(js);
  return dom;
}

console.log("\nHDD Task Board Tests\n" + "=".repeat(40));

// ── Test 1: Board renders three empty columns ──

test("Board renders three empty columns", function () {
  var dom = freshBoard();
  var doc = dom.window.document;
  var columns = doc.querySelectorAll(".column");
  assert(columns.length === 3, "Expected 3 columns, got " + columns.length);

  var statuses = Array.from(columns).map(function (c) { return c.dataset.status; });
  assert(statuses.indexOf("todo") !== -1, "Missing 'todo' column");
  assert(statuses.indexOf("in-progress") !== -1, "Missing 'in-progress' column");
  assert(statuses.indexOf("done") !== -1, "Missing 'done' column");
  dom.window.close();
});

// ── Test 2: Add a task ──

test("addTask creates a card in To Do", function () {
  var dom = freshBoard();
  var TB = dom.window.TaskBoard;

  TB.addTask("Write tests");
  var tasks = TB.getTasks();
  assert(tasks.length === 1, "Expected 1 task, got " + tasks.length);
  assert(tasks[0].title === "Write tests", "Wrong title: " + tasks[0].title);
  assert(tasks[0].status === "todo", "Wrong status: " + tasks[0].status);

  var cards = dom.window.document.querySelectorAll("#list-todo .task-card");
  assert(cards.length === 1, "Expected 1 card in DOM, got " + cards.length);
  dom.window.close();
});

// ── Test 3: Move task forward ──

test("moveTask moves card to next column", function () {
  var dom = freshBoard();
  var TB = dom.window.TaskBoard;

  TB.addTask("Move me");
  var id = TB.getTasks()[0].id;

  TB.moveTask(id, "in-progress");
  assert(TB.getTasks()[0].status === "in-progress", "Task not moved to in-progress");

  var inProgressCards = dom.window.document.querySelectorAll("#list-in-progress .task-card");
  assert(inProgressCards.length === 1, "Card not rendered in in-progress column");

  TB.moveTask(id, "done");
  assert(TB.getTasks()[0].status === "done", "Task not moved to done");
  dom.window.close();
});

// ── Test 4: Delete task ──

test("deleteTask removes the card", function () {
  var dom = freshBoard();
  var TB = dom.window.TaskBoard;

  TB.addTask("Delete me");
  var id = TB.getTasks()[0].id;

  TB.deleteTask(id);
  assert(TB.getTasks().length === 0, "Task was not deleted");

  var allCards = dom.window.document.querySelectorAll(".task-card");
  assert(allCards.length === 0, "Card still in DOM after delete");
  dom.window.close();
});

// ── Test 5: Counters update correctly ──

test("Column counters update on add/move/delete", function () {
  var dom = freshBoard();
  var doc = dom.window.document;
  var TB = dom.window.TaskBoard;

  TB.addTask("Task A");
  TB.addTask("Task B");
  assert(doc.getElementById("count-todo").textContent === "2", "Todo count should be 2");

  var idA = TB.getTasks()[0].id;
  TB.moveTask(idA, "in-progress");
  assert(doc.getElementById("count-todo").textContent === "1", "Todo count should be 1");
  assert(doc.getElementById("count-in-progress").textContent === "1", "In-progress count should be 1");

  TB.deleteTask(idA);
  assert(doc.getElementById("count-in-progress").textContent === "0", "In-progress count should be 0");
  dom.window.close();
});

// ── Theme toggle (TY-7) ──

function boardWith(setup) {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost" });
  dom.window.localStorage.clear();
  if (setup) setup(dom.window);
  dom.window.eval(js);
  return dom;
}

test("Theme defaults to dark with no stored preference", function () {
  var dom = boardWith();
  var doc = dom.window.document;
  assert(!doc.documentElement.hasAttribute("data-theme"), "Dark theme should not set data-theme");
  var btn = doc.getElementById("theme-toggle-btn");
  assert(btn.textContent === "Light", "Button should offer 'Light', got " + btn.textContent);
  assert(btn.getAttribute("aria-pressed") === "true", "aria-pressed should be true in dark mode");
  dom.window.close();
});

test("Clicking the toggle switches dark -> light -> dark", function () {
  var dom = boardWith();
  var doc = dom.window.document;
  var btn = doc.getElementById("theme-toggle-btn");

  btn.click();
  assert(doc.documentElement.getAttribute("data-theme") === "light", "Should be light after first click");
  assert(btn.textContent === "Dark", "Button should offer 'Dark', got " + btn.textContent);
  assert(btn.getAttribute("aria-pressed") === "false", "aria-pressed should be false in light mode");

  btn.click();
  assert(!doc.documentElement.hasAttribute("data-theme"), "Should be back to dark after second click");
  assert(btn.getAttribute("aria-pressed") === "true", "aria-pressed should be true again");
  dom.window.close();
});

test("Theme choice persists in localStorage and is restored on load", function () {
  var dom = boardWith();
  dom.window.document.getElementById("theme-toggle-btn").click();
  assert(dom.window.localStorage.getItem("hdd-theme") === "light", "Light theme not persisted");
  dom.window.close();

  var reloaded = boardWith(function (w) { w.localStorage.setItem("hdd-theme", "light"); });
  assert(
    reloaded.window.document.documentElement.getAttribute("data-theme") === "light",
    "Stored light theme not applied on load"
  );
  reloaded.window.close();
});

test("First visit follows prefers-color-scheme: light", function () {
  var dom = boardWith(function (w) {
    w.matchMedia = function (q) { return { matches: q.indexOf("light") !== -1 }; };
  });
  assert(dom.window.TaskBoard.getTheme() === "light", "Should follow OS light preference");
  assert(dom.window.document.documentElement.getAttribute("data-theme") === "light", "Light not applied");
  dom.window.close();
});

test("Stored preference wins over OS preference; invalid values are ignored", function () {
  var dom = boardWith(function (w) {
    w.matchMedia = function (q) { return { matches: q.indexOf("light") !== -1 }; };
    w.localStorage.setItem("hdd-theme", "dark");
  });
  assert(dom.window.TaskBoard.getTheme() === "dark", "Stored dark should beat OS light");
  dom.window.close();

  var bad = boardWith(function (w) { w.localStorage.setItem("hdd-theme", "purple"); });
  assert(bad.window.TaskBoard.getTheme() === "dark", "Invalid stored value should fall back to dark");
  bad.window.close();
});

// ── Results ──

console.log("\n" + "=".repeat(40));
console.log("Results: " + passed + " passed, " + failed + " failed\n");

if (failed > 0) process.exit(1);
