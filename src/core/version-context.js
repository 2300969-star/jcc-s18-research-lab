const fs = require('fs');
const path = require('path');
const { ROOT } = require('../lib/project-paths');

// Balance-only patches can publish unit/trait data before the official lineup API
// republishes formations. Carrying forward a formation snapshot is explicit so a
// stale lineup source can never be mistaken for current numeric data.
const LINEUP_CARRY_FORWARD = Object.freeze({
  '17.17.7': '17.17.6b',
});

function readJson(root, file) {
  return JSON.parse(fs.readFileSync(path.join(root, 'data', file), 'utf8'));
}

function currentVersion(root = ROOT) {
  const chess = readJson(root, 'chess.js');
  const edition = String(chess.version || '');
  const season = String(chess.season || '');
  if (!edition || !season) throw new Error('data/chess.js 缺少 version/season');
  return { edition, season, label: `${edition}-${season}`, time: chess.time || '' };
}

function currentLineups(lineups, root = ROOT) {
  const version = currentVersion(root);
  let rows = (lineups || []).filter(row => String(row.simulator_edition) === version.edition);
  if (!rows.length && LINEUP_CARRY_FORWARD[version.edition]) {
    const sourceEdition = LINEUP_CARRY_FORWARD[version.edition];
    rows = (lineups || []).filter(row => String(row.simulator_edition) === sourceEdition);
    if (rows.length) {
      console.warn(`官方阵容结构沿用 ${sourceEdition}，战斗数值使用 ${version.edition}`);
      return rows;
    }
  }
  if (!rows.length) {
    const available = [...new Set((lineups || []).map(row => row.simulator_edition).filter(Boolean))].join('、') || '无';
    throw new Error(`当前数据版本 ${version.edition} 没有对应官方阵容（阵容库版本：${available}）`);
  }
  return rows;
}

module.exports = { currentVersion, currentLineups, LINEUP_CARRY_FORWARD };
