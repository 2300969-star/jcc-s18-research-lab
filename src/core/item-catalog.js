"use strict";

// One source of truth for the official item universe and current model coverage.
const STAT_MAP = {
  生命上限: "hp",
  护甲: "armor",
  魔法抗性: "mr",
  物理加成: "adPct",
  法术加成: "ap",
  攻击速度: "asPct",
  暴击率: "critPct",
  伤害增幅: "ampPct",
  法力值: "startMana",
  法力回复: "manaRegen",
  全能吸血: "omnivamp",
  伤害减免: "damageReduction",
};

const MODEL_SPECIAL_IDS = new Set([
  "2810", "2012", "2813", "2811", "2822", "2004",
  "2037", "2846", "2038", "2001", "2041",
]);
const MODEL_TANK_IDS = new Set(["2834", "2029", "2028", "2025", "2027", "2031", "2023", "2818", "2019"]);
const MODEL_EFFECT_IDS = new Set([...MODEL_SPECIAL_IDS, ...MODEL_TANK_IDS]);
const EXCLUDED_TYPES = new Set(["-1"]);

const CLIENT_TYPE = {
  基础装备: "component",
  成型装备: "completed",
  光明武器: "radiant",
  神器装备: "artifact",
  特殊装备: "special",
  转职纹章: "emblem",
};
const TYPE_PRIORITY = ["基础装备", "成型装备", "神器装备", "光明武器", "特殊装备", "转职纹章"];

function emptyStats() {
  return {
    hp: 0,
    armor: 0,
    mr: 0,
    adPct: 0,
    ap: 0,
    asPct: 0,
    critPct: 0,
    ampPct: 0,
    startMana: 0,
    manaRegen: 0,
    omnivamp: 0,
    damageReduction: 0,
  };
}

function extractBasicTokens(desc) {
  const tokens = [];
  const re = /\+(\d+(?:\.\d+)?)%?([A-Za-z\u4e00-\u9fa5]+)/g;
  for (const match of String(desc || "").matchAll(re)) {
    tokens.push({
      raw: match[0],
      value: Number(match[1]),
      label: match[2],
      key: STAT_MAP[match[2]] || "",
      parsedByModel: Boolean(STAT_MAP[match[2]]),
    });
  }
  return tokens;
}

function parseBasicStats(desc) {
  const stats = emptyStats();
  extractBasicTokens(desc).forEach(token => {
    if (token.key) stats[token.key] += token.value;
  });
  return stats;
}

function searchableItemRecords(equipData) {
  return Object.values(equipData || {})
    .filter(item => item && item.name && !EXCLUDED_TYPES.has(String(item.type || "")))
    .sort((a, b) => Number(a.mapID || 9999) - Number(b.mapID || 9999) || String(a.id).localeCompare(String(b.id)));
}

function primaryVariant(variants) {
  return variants.slice().sort((a, b) => {
    const ai = TYPE_PRIORITY.indexOf(a.gameType);
    const bi = TYPE_PRIORITY.indexOf(b.gameType);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || Number(a.id) - Number(b.id);
  })[0];
}

function buildItemCatalog(equipData, priorities = {}) {
  const byName = new Map();
  searchableItemRecords(equipData).forEach(item => {
    const tokens = extractBasicTokens(item.basicDesc);
    const variant = {
      id: String(item.id),
      gameType: item.type,
      basicDesc: String(item.basicDesc || ""),
      desc: String(item.desc || "").replace(/\s+/g, " ").trim(),
      picture: item.picture || "",
      stats: parseBasicStats(item.basicDesc),
      staticStatsComplete: tokens.every(token => token.parsedByModel),
      effectModeled: MODEL_EFFECT_IDS.has(String(item.id)),
    };
    if (!byName.has(item.name)) byName.set(item.name, []);
    byName.get(item.name).push(variant);
  });

  return [...byName.entries()].map(([name, variants]) => {
    const primary = primaryVariant(variants);
    const effectVariants = variants.filter(variant => variant.desc);
    const modeledEffects = effectVariants.filter(variant => variant.effectModeled).length;
    const effectCoverage = !effectVariants.length
      ? "not-applicable"
      : modeledEffects === effectVariants.length
        ? "modeled"
        : modeledEffects
          ? "partial"
          : "unmodeled";
    return {
      name,
      type: CLIENT_TYPE[primary.gameType] || "other",
      gameTypes: [...new Set(variants.map(variant => variant.gameType))],
      priority: Number(priorities[name] || 0),
      ids: variants.map(variant => variant.id),
      basicDesc: primary.basicDesc,
      desc: primary.desc,
      picture: primary.picture,
      stats: primary.stats,
      staticStatsComplete: variants.every(variant => variant.staticStatsComplete),
      effectCoverage,
      variants,
    };
  }).sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name, "zh-Hans-CN"));
}

function runAssertions(equipData) {
  const records = searchableItemRecords(equipData);
  const catalog = buildItemCatalog(equipData);
  const names = new Set(records.map(item => item.name));
  if (catalog.length !== names.size) throw new Error(`装备标准名覆盖不完整：${catalog.length}/${names.size}`);
  const missing = [...names].filter(name => !catalog.some(item => item.name === name));
  if (missing.length) throw new Error(`装备目录缺少：${missing.join("、")}`);
  const mittens = catalog.find(item => item.name === "连指手套");
  if (!mittens || mittens.type !== "artifact" || mittens.stats.asPct !== 65 || mittens.stats.ampPct !== 15) {
    throw new Error("连指手套目录回归失败");
  }
  if (mittens.effectCoverage !== "unmodeled") throw new Error("连指手套主动特效不得伪装成已建模");
  console.log(`item-catalog assertions passed (${records.length} records / ${catalog.length} names)`);
}

module.exports = {
  STAT_MAP,
  MODEL_SPECIAL_IDS,
  MODEL_TANK_IDS,
  MODEL_EFFECT_IDS,
  extractBasicTokens,
  parseBasicStats,
  searchableItemRecords,
  buildItemCatalog,
  runAssertions,
};

if (require.main === module) {
  const fs = require("fs");
  const path = require("path");
  const equipData = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../data/equip.js"), "utf8")).data;
  runAssertions(equipData);
}
