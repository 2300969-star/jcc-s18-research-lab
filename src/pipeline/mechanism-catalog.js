"use strict";

const fs = require("fs");
const path = require("path");
const { ROOT, resultPath, reportPath, publicPath, ensureOutputDirs } = require("../lib/project-paths");

const readData = name => JSON.parse(fs.readFileSync(path.join(ROOT, "data", name), "utf8"));
const values = file => Object.values(readData(file).data || {});
const compactName = name => String(name || "").replace(/[（(](?:经济|战力)[）)]/g, "").trim();

function encounterDomain(row) {
  const text = `${row.name} ${row.desc || ""}`;
  if (/纹章/.test(text)) return "traits";
  if (/装备|锻造器|选秀/.test(text)) return "items";
  if (/强化符文/.test(text)) return "augments";
  if (/金币|战利品|赐福|法球|配送/.test(text)) return "future-budget";
  if (/英雄|弈子/.test(text)) return "units";
  return "combat";
}

function guardianDomain(row) {
  const text = `${row.name} ${row.skillName || ""} ${row.skillDesc || ""}`;
  if (/刷新概率|免费刷新|同费且不同名|商店中随机刷新/.test(text)) return "shop-state";
  if (/金币|经验值|战利品|高价值弈子/.test(text)) return "future-budget";
  if (/装备|打造商店/.test(text)) return "items";
  return "combat";
}

function augmentCategory(row) {
  const text = `${row.name || ""} ${row.description || row.desc || ""}`;
  if (String(row.level) === "4") return "hero";
  if (/高端购物|升级咯|对冲基金|利滚利|明智消费|DD街区|商店|刷新|经验|金币/.test(text)) return "economy";
  if (/锻炉|百宝袋|潘朵拉|打捞桶|装备|重铸器|神器/.test(text)) return "items";
  if (/之徽|之心|之冕|纹章|转职/.test(text)) return "traits";
  return "combat";
}

function buildCatalog() {
  const galaxy = readData("galaxy.js");
  const monster = readData("monster.js");
  const hex = readData("hex.js");
  const equip = readData("equip.js");
  const chess = readData("chess.js");
  const race = readData("race.js");
  const job = readData("job.js");
  const ruleset = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "ruleset", "monster-invasion-17.7.json"), "utf8"));
  const augments = Object.values(hex.data || {});
  const heroes = Object.values(chess.data || {}).filter(row => String(row.setid) === "8"
    && String(row.showHeroTag) === "1" && Number(row.price) >= 1 && Number(row.price) <= 5
    && !(String(row.species) === "-1" && String(row.class) === "-1"));
  const itemRows = Object.values(equip.data || {});
  const traitRows = [...Object.values(race.data || {}), ...Object.values(job.data || {})];
  const augmentCounts = augments.reduce((out, row) => {
    const category = augmentCategory(row);
    out[category] = (out[category] || 0) + 1;
    return out;
  }, {});
  const openingEncounters = Object.values(galaxy.data || {}).map(row => ({
    id: row.id,
    name: row.name,
    description: row.desc || "",
    domain: encounterDomain(row),
    shopEffect: "none-direct",
  }));
  const guardians = Object.values(monster.data || {}).map(row => ({
    id: row.id,
    name: row.name,
    baseName: compactName(row.name),
    form: String(row.type) === "2" ? "经济" : "战力",
    description: row.skillDesc || "",
    domain: guardianDomain(row),
    requiresProgress: /建成后|观众席满员|每4个回合后|随机刷新|受到攻击后/.test(row.skillDesc || ""),
  }));
  return {
    schemaVersion: 1,
    version: galaxy.version,
    generatedAt: galaxy.time || "2026-07-16 16:40:29",
    source: {
      local: ["data/galaxy.js", "data/monster.js", "data/hex.js", "data/equip.js", "data/chess.js", "data/race.js", "data/job.js", "data/ruleset/monster-invasion-17.7.json"],
      rulesetEvidence: ruleset.evidence || ruleset.sources || {},
    },
    counts: {
      openingEncounters: openingEncounters.length,
      guardians: new Set(guardians.map(row => row.baseName)).size,
      guardianForms: guardians.length,
      augments: augments.length,
      augmentCategories: augmentCounts,
      heroes: new Set(heroes.map(row => row.name)).size,
      items: itemRows.length,
      traits: traitRows.length,
    },
    openingEncounters,
    guardians,
    shopModifiers: {
      augments: [
        { name: "高端购物", effect: "shop-level-offset", value: 1, automatic: true },
        { name: "DD街区", effect: "free-reroll", value: 1, automatic: false, reason: "是否已用无法从静态信号确认" },
      ],
      guardians: [
        { name: "防御塔（经济）", effect: "high-cost-odds", automatic: false, reason: "必须确认防御塔已建成且缺少公开数值" },
        { name: "爆裂球果（经济）", effect: "same-cost-transform", automatic: false, reason: "必须确认球果可用与被转换棋子" },
      ],
      openingEncounters: [],
    },
    probabilityBoundary: {
      entersShopModel: ["商店等级偏移", "已确认免费刷新", "已确认同费转换", "已确认复制器", "已建成且数值明确的商店概率修正"],
      doesNotEnterShopModel: ["战力增益", "装备强度", "羁绊强度", "未来金币", "未来经验", "未落袋随机奖励"],
      missingGoldDefinition: "仅为缺少张数乘棋子面值；概率单列，不折算为金币",
    },
  };
}

function report(catalog) {
  const domainCounts = rows => rows.reduce((out, row) => {
    out[row.domain] = (out[row.domain] || 0) + 1;
    return out;
  }, {});
  const lines = [
    "# 怪兽入侵 17.7 机制知识审计",
    "",
    `生成时间：${catalog.generatedAt}`,
    "",
    "## 结论",
    "",
    "抽卡模型只接收会改变商店状态的已确认机制。未来金币、经验、装备、羁绊和战斗增益保留在各自通道，禁止折算为抽卡金币。",
    "",
    `- 开场奇遇：${catalog.counts.openingEncounters} 种，作用域 ${JSON.stringify(domainCounts(catalog.openingEncounters))}`,
    `- 守护者：${catalog.counts.guardians} 名、${catalog.counts.guardianForms} 个形态，作用域 ${JSON.stringify(domainCounts(catalog.guardians))}`,
    `- 强化符文：${catalog.counts.augments} 个，类别 ${JSON.stringify(catalog.counts.augmentCategories)}`,
    `- 商店英雄：${catalog.counts.heroes} 名；装备记录 ${catalog.counts.items} 条；羁绊记录 ${catalog.counts.traits} 条`,
    "",
    "## 开场奇遇",
    "",
    "| 名称 | 作用域 | 说明 |",
    "|---|---|---|",
    ...catalog.openingEncounters.map(row => `| ${row.name} | ${row.domain} | ${row.description} |`),
    "",
    "## 商店状态修正",
    "",
    ...[...catalog.shopModifiers.augments, ...catalog.shopModifiers.guardians].map(row => `- ${row.name}：${row.effect}；${row.automatic ? "确认后自动生效" : `默认不自动生效（${row.reason}）`}`),
    "",
    "## 概率边界",
    "",
    `- 进入概率模型：${catalog.probabilityBoundary.entersShopModel.join("、")}`,
    `- 不进入概率模型：${catalog.probabilityBoundary.doesNotEnterShopModel.join("、")}`,
    `- 金额口径：${catalog.probabilityBoundary.missingGoldDefinition}`,
    "",
  ];
  return lines.join("\n");
}

function run() {
  ensureOutputDirs();
  const catalog = buildCatalog();
  fs.writeFileSync(resultPath("mechanism_catalog.json"), JSON.stringify(catalog, null, 2));
  fs.writeFileSync(publicPath("mechanism-data.js"), `(function(root,factory){var data=factory();if(typeof module==="object"&&module.exports)module.exports=data;root.JCC_MECHANISMS=data;})(typeof globalThis!=="undefined"?globalThis:this,function(){return ${JSON.stringify(catalog)};});\n`);
  fs.writeFileSync(reportPath("17.7玩法机制与概率边界.md"), report(catalog));
  if (catalog.counts.openingEncounters !== 14) throw new Error("开场奇遇数量不符");
  if (catalog.counts.heroes < 60) throw new Error(`商店英雄数量异常，实际${catalog.counts.heroes}`);
  if (!catalog.guardians.some(row => row.name === "防御塔（经济）" && row.domain === "shop-state")) throw new Error("防御塔商店机制未识别");
  console.log(`mechanism catalog generated: ${catalog.counts.openingEncounters} encounters, ${catalog.counts.guardians} guardians, ${catalog.counts.heroes} heroes`);
}

module.exports = { buildCatalog, encounterDomain, guardianDomain, augmentCategory, run };
if (require.main === module) run();
