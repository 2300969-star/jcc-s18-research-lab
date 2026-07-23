"use strict";

const fs = require("fs");
const { dataPath, resultPath, reportPath, publicPath, ensureOutputDirs } = require("../lib/project-paths.js");
const Core = require("../../public/star-god-core.js");

const SAMPLE_COUNT = 5400;
const SEED = 170717;

function readCatalog() {
  return JSON.parse(fs.readFileSync(dataPath("star-god", "17.7", "catalog.json"), "utf8"));
}

function seededRandom(seed = SEED) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let next = value;
    next = Math.imul(next ^ next >>> 15, next | 1);
    next ^= next + Math.imul(next ^ next >>> 7, next | 61);
    return ((next ^ next >>> 14) >>> 0) / 4294967296;
  };
}

function pick(random, values) {
  return values[Math.floor(random() * values.length)];
}

function randomState(random) {
  const stage = pick(random, [2, 3, 4]);
  const hpBand = pick(random, [[15, 31], [32, 55], [56, 78], [79, 101]]);
  const goldBand = pick(random, [[5, 16], [16, 31], [31, 46], [46, 61]]);
  const hp = Math.floor(hpBand[0] + random() * (hpBand[1] - hpBand[0]));
  const gold = Math.floor(goldBand[0] + random() * (goldBand[1] - goldBand[0]));
  const levelRange = stage === 2 ? [4, 6] : stage === 3 ? [6, 8] : [7, 10];
  return Core.createState({
    stage,
    round: `${stage}-4`,
    hp,
    gold,
    level: Math.floor(levelRange[0] + random() * (levelRange[1] - levelRange[0])),
    streak: pick(random, [-3, -2, -1, 0, 1, 2, 3]),
    expectedRounds: stage === 2 ? 13 : stage === 3 ? 9 : 6,
    sharedChoiceCount: Math.ceil(random() * 8),
    boardStars: Math.floor(6 + random() * 10),
    distinctCompletedItems: Math.floor(2 + random() * 8),
    interestEarned: Math.floor(random() * 11),
    refreshCount: Math.floor(random() * 16),
    distinctTraits: Math.floor(3 + random() * 6),
    upgradeReady: random() > 0.52,
    componentDirection: pick(random, ["physical", "magic", "tank", "economy", "highCost", "flexible"]),
    ownedCosts: Array.from({ length: 3 + Math.floor(random() * 5) }, () => 1 + Math.floor(random() * 5)),
  });
}

function summarizeBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const name = key(row);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  }
  return [...groups.entries()].map(([name, values]) => ({
    name,
    samples: values.length,
    mean: Core.round(values.reduce((sum, row) => sum + row.total, 0) / values.length),
    p25: quantile(values.map(row => row.total), 0.25),
    p75: quantile(values.map(row => row.total), 0.75),
  })).sort((a, b) => b.mean - a.mean || a.name.localeCompare(b.name, "zh-CN"));
}

function quantile(values, point) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * point)));
  return Core.round(sorted[index] || 0);
}

function scenario(catalog, name, state) {
  const rankings = Core.rankBlessings(catalog.blessings, state);
  return {
    name,
    state,
    top: rankings.slice(0, 8),
    byGod: Core.recommendByGod(catalog.blessings, state),
  };
}

function lineupEvidence(catalog) {
  const blessingCounts = new Map();
  const godCounts = new Map();
  for (const lineup of catalog.lineups) {
    for (const row of lineup.recommendedGods || []) {
      godCounts.set(row.godId, (godCounts.get(row.godId) || 0) + 1);
      for (const id of row.blessingIds || []) blessingCounts.set(id, (blessingCounts.get(id) || 0) + 1);
    }
  }
  return {
    byGod: catalog.gods.map(god => ({
      godId: god.id,
      godName: god.name,
      officialLineupMentions: godCounts.get(god.id) || 0,
    })).sort((a, b) => b.officialLineupMentions - a.officialLineupMentions),
    topBlessings: [...blessingCounts.entries()].map(([id, count]) => {
      const blessing = catalog.blessings.find(row => row.id === id);
      return {
        id,
        name: blessing ? blessing.name : String(id),
        godName: blessing ? blessing.godName : "",
        officialLineupMentions: count,
      };
    }).sort((a, b) => b.officialLineupMentions - a.officialLineupMentions).slice(0, 20),
  };
}

function buildResult(catalog) {
  const random = seededRandom();
  const sampled = [];
  const winnerCounts = new Map();
  const stateSnapshots = [];
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const state = randomState(random);
    const rankings = Core.rankBlessings(catalog.blessings, state);
    if (!rankings.length) throw new Error(`阶段${state.stage}没有可用赐福`);
    const winner = rankings[0];
    winnerCounts.set(winner.godName, (winnerCounts.get(winner.godName) || 0) + 1);
    sampled.push(...rankings.map(row => ({ ...row, stateStage: state.stage, stateHp: state.hp })));
    if (index < 24) stateSnapshots.push({ state, top: rankings.slice(0, 3) });
  }

  const scenarios = [
    scenario(catalog, "2-4高血量物理开局", Core.createState({ stage: 2, hp: 96, gold: 20, level: 5, componentDirection: "physical", expectedRounds: 13 })),
    scenario(catalog, "3-4低血量止血", Core.createState({ stage: 3, hp: 24, gold: 28, level: 7, streak: -3, componentDirection: "tank", expectedRounds: 8 })),
    scenario(catalog, "4-4高经济冲九", Core.createState({ stage: 4, hp: 70, gold: 52, level: 8, componentDirection: "highCost", expectedRounds: 6, refreshCount: 8 })),
    scenario(catalog, "4-4法系装备成型", Core.createState({ stage: 4, hp: 55, gold: 34, level: 8, componentDirection: "magic", distinctCompletedItems: 7, expectedRounds: 6 })),
  ];
  const byGod = summarizeBy(sampled, row => row.godName).map(row => ({
    ...row,
    wins: winnerCounts.get(row.name) || 0,
    winShare: Core.round((winnerCounts.get(row.name) || 0) / SAMPLE_COUNT * 100),
  }));
  const byStage = [2, 3, 4].map(stage => ({
    stage,
    topGods: summarizeBy(sampled.filter(row => row.stateStage === stage), row => row.godName).slice(0, 5),
  }));
  return {
    schemaVersion: "1.0.0",
    generatedAt: catalog.generatedAt,
    experiment: "star-god-state-value-v1",
    samples: SAMPLE_COUNT,
    seed: SEED,
    formula: "Q(a|s)=E[Σγ^(k-t)(ΔC+ΔE+ΔF)]−λ·CVaRα(L)−κ·Kcommit",
    catalog: catalog.summary,
    byGod,
    byStage,
    scenarios,
    lineupEvidence: lineupEvidence(catalog),
    stateSnapshots,
    limitations: [
      "羽饰骑士按生命值分档奖励表未公开，因此相关赐福只保留低置信度价值。",
      "普通4-7神之秘宝包池未公开，不与主神恩赐做精确差值。",
      "官方阵容只作为选择先验，不参与状态价值公式的强制排序。",
      "商店牌池份数未证实，英雄复制与全费用商店采用卡面价值而非伪精确抽卡金额。",
    ],
  };
}

function assertResult(result, catalog) {
  if (catalog.summary.gods !== 9) throw new Error("星神必须为9位");
  if (catalog.summary.uniqueBlessings !== 110 || catalog.summary.blessingRows !== 141) throw new Error("赐福目录数量异常");
  if (catalog.summary.mainGodBlessings !== 9) throw new Error("主神恩赐必须为9个");
  if (catalog.summary.heroes !== 63) throw new Error(`可玩英雄应为63，实际${catalog.summary.heroes}`);
  if (result.byGod.length !== 9 || result.byGod.some(row => row.samples <= 0)) throw new Error("九位星神没有全部进入模拟");
  if (JSON.stringify(result).match(/NaN|Infinity/)) throw new Error("结果中禁止NaN/Infinity");

  const blessing = name => catalog.blessings.find(row => row.name === name);
  const soraka = blessing("12小小英雄生命值");
  const eve = blessing("随机成装");
  const asol = blessing("财富探险");
  const ekko = blessing("随机神器");
  if (Core.evaluateBlessing(soraka, { hp: 20 }).total <= Core.evaluateBlessing(soraka, { hp: 90 }).total) throw new Error("索拉卡低血量回归失败");
  if (Core.evaluateBlessing(eve, { hp: 20 }).total >= Core.evaluateBlessing(eve, { hp: 90 }).total) throw new Error("伊芙琳卖血回归失败");
  if (Core.evaluateBlessing(asol, { gold: 48 }).total <= Core.evaluateBlessing(asol, { gold: 10 }).total) throw new Error("索尔任务回归失败");
  if (Core.evaluateBlessing(ekko, { hp: 18 }).total >= Core.evaluateBlessing(ekko, { hp: 90 }).total) throw new Error("艾克延迟回归失败");

  const kaylePhysical = Core.evaluateBlessing(blessing("反曲之弓"), { componentDirection: "physical" }).total;
  const kayleMagic = Core.evaluateBlessing(blessing("反曲之弓"), { componentDirection: "magic" }).total;
  if (kaylePhysical <= kayleMagic) throw new Error("凯尔装备方向没有影响选择");
  const greed = catalog.blessings.find(row => row.name === "贪婪之宝箱");
  if (Core.evaluateBlessing(greed, { sharedChoiceCount: 1 }).total <= Core.evaluateBlessing(greed, { sharedChoiceCount: 6 }).total) throw new Error("阿狸共选人数没有进入模型");
  return true;
}

function report(result) {
  const lines = [
    "# 星神玩法 17.7 确定性研究",
    "",
    `生成时间：${result.generatedAt}`,
    "",
    "## 研究口径",
    "",
    `- 官方数据：${result.catalog.gods}位星神、${result.catalog.uniqueBlessings}个唯一赐福、${result.catalog.heroes}个可玩英雄、${result.catalog.lineups}套官方前中后期样本。`,
    `- 虚拟状态：${result.samples}个，固定随机种子 ${result.seed}，覆盖2-4/3-4/4-4、四档血量、四档经济、六种阵容方向。`,
    `- 价值函数：\`${result.formula}\`。`,
    "- 官方阵容只用于外部先验对照，不直接决定模型排序。",
    "",
    "## 九神总体敏感性",
    "",
    "| 星神 | 平均价值 | P25 | P75 | 成为全局第一 |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...result.byGod.map(row => `| ${row.name} | ${row.mean} | ${row.p25} | ${row.p75} | ${row.winShare}% |`),
    "",
    "## 四个可复现实验状态",
    "",
    ...result.scenarios.flatMap(row => [
      `### ${row.name}`,
      "",
      ...row.top.slice(0, 5).map((choice, index) => `${index + 1}. ${choice.godName} · ${choice.name}：${choice.total}（战斗${choice.parts.combat} / 经济${choice.parts.economy} / 灵活${choice.parts.flexibility} / 延迟${choice.parts.delay} / 风险-${choice.parts.risk + choice.parts.commitment}）`),
      "",
    ]),
    "## 已验证的独特口径",
    "",
    "- 索尔：任务阈值接近度决定兑现概率，不能把奖励按100%到账。",
    "- 亚索：永久格与主C方向匹配，格子本身含不可逆承诺成本。",
    "- 凯尔：散件方向与成装多样性进入价值。",
    "- 阿狸：共选人数直接改变联手和平分金币的回报。",
    "- 韦鲁斯：已有费用结构、商店费用和总星级进入价值。",
    "- 艾克：延迟回报乘生存概率，低血量时自动折价。",
    "- 锤石：随机池按均值减尾部风险估值，不把未知奖励当满额。",
    "- 索拉卡：玩家生命边际价值随当前血量下降而上升。",
    "- 伊芙琳：卖血、禁购和连胜终止风险都是显式负项。",
    "",
    "## 尚未自证",
    "",
    ...result.limitations.map(text => `- ${text}`),
    "",
  ];
  return lines.join("\n");
}

function writeResult(result) {
  ensureOutputDirs();
  fs.writeFileSync(resultPath("star_god_results.json"), JSON.stringify(result, null, 2));
  fs.writeFileSync(reportPath("星神玩法17.7研究.md"), report(result));
  const publicResult = {
    schemaVersion: result.schemaVersion,
    generatedAt: result.generatedAt,
    experiment: result.experiment,
    samples: result.samples,
    formula: result.formula,
    byGod: result.byGod,
    byStage: result.byStage,
    scenarios: result.scenarios,
    lineupEvidence: result.lineupEvidence,
    limitations: result.limitations,
  };
  fs.writeFileSync(publicPath("star-god-results-data.js"), `window.STAR_GOD_RESULTS = ${JSON.stringify(publicResult)};\n`);
}

function main() {
  const catalog = readCatalog();
  const result = buildResult(catalog);
  assertResult(result, catalog);
  writeResult(result);
  console.log(`星神虚拟实验完成：${result.samples}个状态，九神覆盖${result.byGod.length}/9`);
}

if (require.main === module) main();

module.exports = {
  SAMPLE_COUNT,
  SEED,
  randomState,
  buildResult,
  assertResult,
  report,
};
