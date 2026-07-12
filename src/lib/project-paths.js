const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const DATA_DIR = path.join(ROOT, "data");
const RESULTS_DIR = path.join(ROOT, "artifacts", "results");
const REPORTS_DIR = path.join(ROOT, "docs", "reports");
const PUBLIC_DIR = path.join(ROOT, "public");
const NOTES_DIR = path.join(ROOT, "docs", "notes");
const TESTS_DIR = path.join(ROOT, "tests");

function ensureOutputDirs() {
  [RESULTS_DIR, REPORTS_DIR, PUBLIC_DIR, NOTES_DIR].forEach(dir => fs.mkdirSync(dir, { recursive: true }));
}

module.exports = {
  ROOT,
  DATA_DIR,
  RESULTS_DIR,
  REPORTS_DIR,
  PUBLIC_DIR,
  NOTES_DIR,
  TESTS_DIR,
  dataPath: (...parts) => path.join(DATA_DIR, ...parts),
  resultPath: (...parts) => path.join(RESULTS_DIR, ...parts),
  reportPath: (...parts) => path.join(REPORTS_DIR, ...parts),
  publicPath: (...parts) => path.join(PUBLIC_DIR, ...parts),
  notePath: (...parts) => path.join(NOTES_DIR, ...parts),
  testPath: (...parts) => path.join(TESTS_DIR, ...parts),
  ensureOutputDirs,
};
