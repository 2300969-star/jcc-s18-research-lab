const fs = require('fs');
const path = require('path');

function readJson(root, file) {
  return JSON.parse(fs.readFileSync(path.join(root, 'data', file), 'utf8'));
}

function currentVersion(root = __dirname) {
  const chess = readJson(root, 'chess.js');
  const edition = String(chess.version || '');
  const season = String(chess.season || '');
  if (!edition || !season) throw new Error('data/chess.js 缺少 version/season');
  return { edition, season, label: `${edition}-${season}`, time: chess.time || '' };
}

function currentLineups(lineups, root = __dirname) {
  const version = currentVersion(root);
  const rows = (lineups || []).filter(row => String(row.simulator_edition) === version.edition);
  if (!rows.length) {
    const available = [...new Set((lineups || []).map(row => row.simulator_edition).filter(Boolean))].join('、') || '无';
    throw new Error(`当前数据版本 ${version.edition} 没有对应官方阵容（阵容库版本：${available}）`);
  }
  return rows;
}

module.exports = { currentVersion, currentLineups };
