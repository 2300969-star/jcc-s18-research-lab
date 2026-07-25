"use strict";

const fs = require("fs");
const { dataPath, publicPath, reportPath, resultPath, ensureOutputDirs } = require("../lib/project-paths.js");

// The official 44 lineups are seeds and an external prior, never the answer.
// Every model score below is reproducible from the local 17.7 catalog.
const MODEL = Object.freeze({
  version: "star-lineup-value-v1",
  targetBoardSize: 8,
  beamWidth: 36,
  generatedLimit: 18,
  qualityPrior: Object.freeze({ S: 6, A: 3, B: 0 }),
  unitCost: 3.2,
  hp: 0.0022,
  attackDamage: 0.025,
  attackSpeed: 4.5,
  resistance: 0.018,
  activeTrait: 4.5,
  traitTier: 2.8,
  traitUnit: 0.65,
  frontlineBalance: 7,
  carryPresence: 12,
  itemClosure: 4.5,
  continuity: 14,
  excessiveFiveCost: 7,
  costBudgetPenalty: 0.7,
  variantMinGain: 1.2,
});

const OFFENSE_COMPONENTS = new Set(["1001", "1002", "1003", "1004", "1009"]);
const DEFENSE_COMPONENTS = new Set(["1005", "1006", "1007"]);
const PSEUDO_UNITS = new Set(["圣物", "羊咩咩 & 咩咩羊", "迷你黑洞"]);

function loadCatalog() {
  return JSON.parse(fs.readFileSync(dataPath("star-god", "17.7", "catalog.json"), "utf8"));
}

function uniq(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function round(value, digits = 1) {
  const scale = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
}

function jaccard(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  const union = new Set([...a, ...b]);
  if (!union.size) return 0;
  let overlap = 0;
  for (const value of a) if (b.has(value)) overlap += 1;
  return overlap / union.size;
}

function parseLocation(location) {
  const [row, col] = String(location || "").split(",").map(Number);
  return {
    row: Number.isFinite(row) ? row : null,
    col: Number.isFinite(col) ? col : null,
  };
}

function createContext(catalog) {
  const heroByName = new Map(catalog.heroes.map(hero => [hero.name, hero]));
  const traitById = new Map(catalog.traits.map(trait => [String(trait.id), trait]));
  const itemByName = new Map(catalog.items.map(item => [item.name, item]));
  const itemById = new Map(catalog.items.map(item => [String(item.id), item]));
  const playableNames = new Set(catalog.heroes.map(hero => hero.name));
  return { catalog, heroByName, traitById, itemByName, itemById, playableNames };
}

function itemComponents(item, context) {
  if (!item) return [];
  return (item.synthesis || [])
    .map(id => context.itemById.get(String(id)))
    .filter(component => component && component.type === "基础装备");
}

function itemRole(item, context) {
  const components = itemComponents(item, context);
  const offense = components.filter(component => OFFENSE_COMPONENTS.has(component.id)).length;
  const defense = components.filter(component => DEFENSE_COMPONENTS.has(component.id)).length;
  const text = `${item?.name || ""} ${item?.description || ""}`;
  if (defense > offense || /护盾|护甲|魔法抗性|最大生命|伤害减免|治疗/.test(text) && !/造成伤害|法术加成|物理加成/.test(text)) return "tank";
  if (offense > defense || /攻击速度|物理加成|法术加成|暴击|伤害增幅|法力值/.test(text)) return "offense";
  return "utility";
}

function carryDirection(items, context) {
  const counts = { physical: 0, magic: 0, tank: 0 };
  for (const itemName of items || []) {
    const item = context.itemByName.get(itemName);
    for (const component of itemComponents(item, context)) {
      if (["1001", "1002", "1009"].includes(component.id)) counts.physical += 1;
      else if (["1003", "1004"].includes(component.id)) counts.magic += 1;
      else if (DEFENSE_COMPONENTS.has(component.id)) counts.tank += 1;
    }
  }
  if (counts.physical === counts.magic && counts.physical > 0) return "hybrid";
  if (counts.magic > counts.physical && counts.magic >= counts.tank) return "magic";
  if (counts.physical > 0 && counts.physical >= counts.tank) return "physical";
  return counts.tank > 0 ? "tank" : "flexible";
}

function heroPower(hero) {
  if (!hero) return 0;
  return (
    Number(hero.cost || 0) * MODEL.unitCost
    + Number(hero.hp || 0) * MODEL.hp
    + Number(hero.attackDamage || 0) * MODEL.attackDamage
    + Number(hero.attackSpeed || 0) * MODEL.attackSpeed
    + (Number(hero.armor || 0) + Number(hero.magicResist || 0)) * MODEL.resistance
  );
}

function defenseIndex(hero) {
  if (!hero) return 0;
  const mitigation = 1 + (Number(hero.armor || 0) + Number(hero.magicResist || 0)) / 200;
  return Number(hero.hp || 0) * mitigation;
}

function offenseIndex(hero, direction = "flexible") {
  if (!hero) return 0;
  const attack = Number(hero.attackDamage || 0) * Math.max(0.35, Number(hero.attackSpeed || 0));
  const manaTempo = 120 / Math.max(45, Number(hero.mana || 0) || 80);
  const directionBias = direction === "physical" ? 1.12 : direction === "magic" ? manaTempo : 1;
  return (attack + Number(hero.cost || 0) * 12) * directionBias;
}

function activeTraits(names, context) {
  const counts = new Map();
  for (const name of names) {
    const hero = context.heroByName.get(name);
    if (!hero) continue;
    for (const traitId of hero.traits || []) counts.set(String(traitId), (counts.get(String(traitId)) || 0) + 1);
  }
  const rows = [];
  for (const [id, count] of counts) {
    const trait = context.traitById.get(id);
    if (!trait) continue;
    const reached = (trait.breakpoints || []).filter(point => point <= count);
    if (!reached.length) continue;
    rows.push({
      id,
      name: trait.name,
      count,
      breakpoint: Math.max(...reached),
      tier: reached.length,
      score: round(MODEL.activeTrait + reached.length * MODEL.traitTier + count * MODEL.traitUnit),
    });
  }
  return rows.sort((a, b) => b.score - a.score || b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
}

function evaluateBoard(names, context, options = {}) {
  const heroes = uniq(names).map(name => context.heroByName.get(name)).filter(Boolean);
  const traits = activeTraits(heroes.map(hero => hero.name), context);
  const direction = options.direction || "flexible";
  const defenseRows = heroes.map(hero => ({ name: hero.name, value: defenseIndex(hero) })).sort((a, b) => b.value - a.value);
  const offenseRows = heroes.map(hero => ({ name: hero.name, value: offenseIndex(hero, direction) })).sort((a, b) => b.value - a.value);
  const frontline = defenseRows.slice(0, 3).reduce((sum, row) => sum + row.value, 0);
  const normalizedFrontline = Math.sqrt(Math.max(0, frontline)) * 0.52;
  const cost = heroes.reduce((sum, hero) => sum + hero.cost, 0);
  const fiveCosts = heroes.filter(hero => hero.cost === 5).length;
  const budget = options.costBudget || 27;
  const costPenalty = Math.max(0, cost - budget) * MODEL.costBudgetPenalty
    + Math.max(0, fiveCosts - 2) * MODEL.excessiveFiveCost;
  const unitValue = heroes.reduce((sum, hero) => sum + heroPower(hero), 0);
  const traitValue = traits.reduce((sum, row) => sum + row.score, 0);
  const carryPresent = options.carry && heroes.some(hero => hero.name === options.carry);
  const roleBalance = defenseRows.length >= 2 && offenseRows.length >= 1 ? MODEL.frontlineBalance : 0;
  const total = unitValue + traitValue + normalizedFrontline + roleBalance
    + (carryPresent ? MODEL.carryPresence : 0)
    + Number(options.itemClosure || 0) * MODEL.itemClosure
    - costPenalty;
  return {
    total: round(total),
    unitValue: round(unitValue),
    traitValue: round(traitValue),
    frontline: Math.round(frontline),
    roleBalance: round(roleBalance),
    cost,
    fiveCosts,
    costPenalty: round(costPenalty),
    traits,
    frontlineNames: defenseRows.slice(0, 3).map(row => row.name),
    offenseNames: offenseRows.slice(0, 3).map(row => row.name),
  };
}

function normalizeStageRows(rows, context) {
  return (rows || []).filter(row => context.playableNames.has(row.name)).map(row => ({
    name: row.name,
    cost: row.cost || context.heroByName.get(row.name)?.cost || null,
    carry: !!row.carry,
    position: parseLocation(row.location),
    items: (row.items || []).filter(Boolean),
  }));
}

function deriveProfile(lineup, context, source = "official-seed", modelChange = null) {
  const early = normalizeStageRows(lineup.early, context);
  const middle = normalizeStageRows(lineup.middle, context);
  const final = normalizeStageRows(lineup.final, context);
  const carryRow = final.find(row => row.carry) || final.slice().sort((a, b) => (b.items.length - a.items.length) || (b.cost - a.cost))[0];
  if (!carryRow) throw new Error(`${lineup.name}没有可识别主C`);
  const direction = carryDirection(carryRow.items, context);
  const targetStar = carryRow.cost <= 3 ? 3 : 2;
  const tankRows = final.filter(row => row.name !== carryRow.name).map(row => {
    const itemTankCount = row.items.filter(name => itemRole(context.itemByName.get(name), context) === "tank").length;
    const positionBonus = row.position.row != null && row.position.row <= 2 ? 500 : 0;
    return { ...row, tankValue: defenseIndex(context.heroByName.get(row.name)) + itemTankCount * 900 + positionBonus };
  }).sort((a, b) => b.tankValue - a.tankValue);
  const primaryTank = tankRows[0] || null;
  const secondaryCarries = final.filter(row => row.name !== carryRow.name && row.items.filter(name => itemRole(context.itemByName.get(name), context) === "offense").length >= 2);
  const finalNames = final.map(row => row.name);
  const continuityRaw = (jaccard(early.map(row => row.name), middle.map(row => row.name))
    + jaccard(middle.map(row => row.name), finalNames)) / 2;
  const board = evaluateBoard(finalNames, context, {
    carry: carryRow.name,
    direction,
    itemClosure: carryRow.items.length,
    costBudget: carryRow.cost <= 3 ? 24 : carryRow.cost === 4 ? 28 : 31,
  });
  const qualityPrior = MODEL.qualityPrior[lineup.quality] || 0;
  const researchScore = round(board.total + continuityRaw * MODEL.continuity + qualityPrior);
  const components = carryRow.items.flatMap(name => itemComponents(context.itemByName.get(name), context).map(item => item.name));
  return {
    id: String(lineup.id || `${source}-${carryRow.name}-${finalNames.join("-")}`),
    name: lineup.name,
    source,
    seedName: lineup.seedName || lineup.name,
    officialQuality: lineup.quality || null,
    modelVersion: MODEL.version,
    carry: {
      name: carryRow.name,
      cost: carryRow.cost,
      targetStar,
      direction,
      items: carryRow.items,
      components,
    },
    primaryTank: primaryTank ? {
      name: primaryTank.name,
      cost: primaryTank.cost,
      items: primaryTank.items,
    } : null,
    secondaryCarries: secondaryCarries.map(row => ({ name: row.name, items: row.items })),
    stages: { early, middle, final },
    activeTraits: board.traits,
    boardModel: board,
    continuity: round(continuityRaw, 3),
    researchScore,
    operation: lineup.operation || "",
    positioning: lineup.positioning || "",
    recommendedGods: lineup.recommendedGods || [],
    modelChange,
  };
}

function toLineupShape(profile) {
  const mapRows = rows => rows.map(row => ({
    name: row.name,
    cost: row.cost,
    carry: row.name === profile.carry.name,
    location: row.position?.row != null ? `${row.position.row},${row.position.col}` : "",
    items: row.items || [],
  }));
  return {
    id: profile.id,
    name: profile.name,
    quality: profile.officialQuality,
    early: mapRows(profile.stages.early),
    middle: mapRows(profile.stages.middle),
    final: mapRows(profile.stages.final),
    operation: profile.operation,
    positioning: profile.positioning,
    recommendedGods: profile.recommendedGods,
  };
}

function bestSingleSlotVariant(profile, context) {
  const final = profile.stages.final;
  const locked = new Set([
    profile.carry.name,
    profile.primaryTank?.name,
    ...final.filter(row => row.items.length).map(row => row.name),
  ].filter(Boolean));
  const currentNames = final.map(row => row.name);
  const base = evaluateBoard(currentNames, context, {
    carry: profile.carry.name,
    direction: profile.carry.direction,
    itemClosure: profile.carry.items.length,
    costBudget: profile.carry.cost <= 3 ? 24 : profile.carry.cost === 4 ? 28 : 31,
  });
  let best = null;
  for (const removed of final) {
    if (locked.has(removed.name)) continue;
    for (const candidate of context.catalog.heroes) {
      if (currentNames.includes(candidate.name)) continue;
      if (candidate.cost > Math.max(removed.cost + 1, 4)) continue;
      const names = currentNames.map(name => name === removed.name ? candidate.name : name);
      const score = evaluateBoard(names, context, {
        carry: profile.carry.name,
        direction: profile.carry.direction,
        itemClosure: profile.carry.items.length,
        costBudget: profile.carry.cost <= 3 ? 24 : profile.carry.cost === 4 ? 28 : 31,
      });
      const gain = score.total - base.total;
      if (!best || gain > best.gain || gain === best.gain && candidate.cost < best.candidate.cost) {
        best = { removed, candidate, score, gain };
      }
    }
  }
  if (!best || best.gain < MODEL.variantMinGain) return null;
  const next = JSON.parse(JSON.stringify(toLineupShape(profile)));
  next.id = `variant-${profile.id}`;
  next.seedName = profile.name;
  next.name = `模型改良·${profile.carry.name}·${best.candidate.name}替${best.removed.name}`;
  next.quality = null;
  next.final = next.final.map(row => row.name === best.removed.name
    ? { name: best.candidate.name, cost: best.candidate.cost, carry: false, location: row.location, items: [] }
    : row);
  next.operation = `${profile.operation} 模型只替换非主C、非主坦且未持装的功能位；命中实战关键机制时仍以客户端状态为准。`;
  return deriveProfile(next, context, "model-variant", {
    kind: "single-slot",
    removed: best.removed.name,
    added: best.candidate.name,
    boardGain: round(best.gain),
    before: base.total,
    after: best.score.total,
  });
}

function beamGeneratedBoard(seed, context) {
  const carry = seed.carry;
  const costBudget = carry.cost <= 3 ? 23 : carry.cost === 4 ? 27 : 30;
  let beam = [{ names: [carry.name], score: 0 }];
  for (let size = 1; size < MODEL.targetBoardSize; size += 1) {
    const next = [];
    for (const state of beam) {
      for (const candidate of context.catalog.heroes) {
        if (state.names.includes(candidate.name)) continue;
        const names = [...state.names, candidate.name];
        const board = evaluateBoard(names, context, {
          carry: carry.name,
          direction: carry.direction,
          itemClosure: carry.items.length,
          costBudget: Math.max(10, costBudget * names.length / MODEL.targetBoardSize),
        });
        next.push({ names, score: board.total });
      }
    }
    next.sort((a, b) => b.score - a.score || a.names.join("|").localeCompare(b.names.join("|"), "zh-CN"));
    const seen = new Set();
    beam = next.filter(row => {
      const key = row.names.slice().sort().join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, MODEL.beamWidth);
  }
  return beam[0]?.names || [];
}

function deriveStageNames(finalNames, carry, direction, targetSize, maxCost, context) {
  const finalTraits = new Set(activeTraits(finalNames, context).map(row => row.id));
  const eligible = context.catalog.heroes.filter(hero => hero.cost <= maxCost);
  const selected = [];
  const scoreHero = hero => {
    const traitOverlap = (hero.traits || []).filter(id => finalTraits.has(String(id))).length;
    const role = Math.max(defenseIndex(hero) / 900, offenseIndex(hero, direction) / 80);
    return traitOverlap * 7 + role + (hero.name === carry.name ? 10 : 0) - hero.cost * 0.25;
  };
  const preferred = finalNames.map(name => context.heroByName.get(name)).filter(hero => hero && hero.cost <= maxCost)
    .sort((a, b) => scoreHero(b) - scoreHero(a));
  for (const hero of preferred) if (!selected.includes(hero.name) && selected.length < targetSize) selected.push(hero.name);
  for (const hero of eligible.slice().sort((a, b) => scoreHero(b) - scoreHero(a))) {
    if (!selected.includes(hero.name) && selected.length < targetSize) selected.push(hero.name);
  }
  return selected;
}

function autoRows(names, carry, context) {
  const heroes = names.map(name => context.heroByName.get(name)).filter(Boolean);
  const tankNames = new Set(heroes.slice().sort((a, b) => defenseIndex(b) - defenseIndex(a)).slice(0, Math.ceil(heroes.length / 2)).map(hero => hero.name));
  let frontCol = 1;
  let backCol = 1;
  return heroes.map(hero => {
    const front = tankNames.has(hero.name) && hero.name !== carry.name;
    const position = front ? { row: 1, col: frontCol++ } : { row: 4, col: backCol++ };
    return { name: hero.name, cost: hero.cost, carry: hero.name === carry.name, position, items: [] };
  });
}

function buildBeamProfile(seed, context, index) {
  const finalNames = beamGeneratedBoard(seed, context);
  if (!finalNames.length) return null;
  const earlyNames = deriveStageNames(finalNames, seed.carry, seed.carry.direction, 5, 2, context);
  const middleNames = deriveStageNames(finalNames, seed.carry, seed.carry.direction, 7, 4, context);
  const finalRows = autoRows(finalNames, seed.carry, context).map(row => row.name === seed.carry.name ? { ...row, items: seed.carry.items } : row);
  const earlyRows = autoRows(earlyNames, seed.carry, context);
  const middleRows = autoRows(middleNames, seed.carry, context);
  const traits = activeTraits(finalNames, context).slice(0, 3).map(row => `${row.count}${row.name}`).join(" ");
  const reroll = seed.carry.targetStar === 3;
  const lineup = {
    id: `beam-${index}-${seed.carry.name}`,
    name: `模型求解·${seed.carry.name}·${traits}`,
    quality: null,
    seedName: seed.name,
    early: earlyRows.map(row => ({ ...row, location: `${row.position.row},${row.position.col}` })),
    middle: middleRows.map(row => ({ ...row, location: `${row.position.row},${row.position.col}` })),
    final: finalRows.map(row => ({ ...row, location: `${row.position.row},${row.position.col}` })),
    operation: reroll
      ? `${seed.carry.cost <= 2 ? 6 : 7}级围绕${seed.carry.name}追三星；未达到两星与两件核心装前不把阵容锁死。`
      : `${seed.carry.cost === 4 ? 8 : 9}级寻找${seed.carry.name}二星；前期使用同装备方向的低费棋子承接。`,
    positioning: "模型站位：防御指数最高的棋子前置，主C与输出位后排分散；遇到刺客、钩子或范围伤害时必须按对手调整。",
    recommendedGods: seed.recommendedGods,
  };
  const profile = deriveProfile(lineup, context, "beam-generated", {
    kind: "beam-search",
    seed: seed.name,
    beamWidth: MODEL.beamWidth,
    targetBoardSize: MODEL.targetBoardSize,
  });
  profile.carry.items = seed.carry.items;
  profile.carry.components = seed.carry.components;
  return profile;
}

function buildLineupModel(catalog = loadCatalog()) {
  const context = createContext(catalog);
  const official = catalog.lineups.map(lineup => deriveProfile(lineup, context));
  const variants = official.map(profile => bestSingleSlotVariant(profile, context)).filter(Boolean);
  const carrySeeds = [];
  const seenCarries = new Set();
  for (const profile of official.slice().sort((a, b) => b.researchScore - a.researchScore)) {
    const key = profile.carry.name;
    if (seenCarries.has(key)) continue;
    seenCarries.add(key);
    carrySeeds.push(profile);
  }
  const generated = carrySeeds.slice(0, MODEL.generatedLimit).map((seed, index) => buildBeamProfile(seed, context, index)).filter(Boolean);
  const all = [...official, ...variants, ...generated].map((route, index) => ({ ...route, routeIndex: index }));
  const sorted = all.slice().sort((a, b) => b.researchScore - a.researchScore || a.name.localeCompare(b.name, "zh-CN"));
  return {
    schemaVersion: "1.0.0",
    model: MODEL,
    source: {
      clientPatch: catalog.source.currentClientPatch,
      starGodSnapshot: catalog.source.displayPatch,
      dataEdition: catalog.source.edition,
      generatedAt: catalog.generatedAt || catalog.source.sourceTime,
      officialLineupsAreSeeds: true,
      shopProbabilityUsed: false,
      missingGapDefinition: "仅按卡牌面值与缺失张数展示，不把概率倒数伪装成金币。",
    },
    summary: {
      heroes: catalog.heroes.length,
      officialSeeds: official.length,
      modelVariants: variants.length,
      beamGenerated: generated.length,
      totalRoutes: all.length,
      uniqueCarries: uniq(all.map(route => route.carry.name)).length,
      pseudoUnitsExcluded: [...PSEUDO_UNITS],
    },
    routes: sorted,
  };
}

function assertModel(model, catalog = loadCatalog()) {
  if (model.summary.officialSeeds !== 44) throw new Error(`官方种子应为44，实际${model.summary.officialSeeds}`);
  if (model.summary.beamGenerated < 12) throw new Error(`束搜索候选不足，实际${model.summary.beamGenerated}`);
  if (model.routes.some(route => !route.carry?.name || !route.stages?.early?.length || !route.stages?.middle?.length || !route.stages?.final?.length)) {
    throw new Error("存在缺失主C或阶段棋盘的路线");
  }
  if (model.routes.some(route => route.stages.final.some(row => PSEUDO_UNITS.has(row.name)))) {
    throw new Error("路线核心棋盘混入召唤物或非商店实体");
  }
  if (model.routes.some(route => !Number.isFinite(route.researchScore) || route.researchScore <= 0)) {
    throw new Error("路线研究分出现非法值");
  }
  const heroNames = new Set(catalog.heroes.map(hero => hero.name));
  if (model.routes.some(route => route.stages.final.some(row => !heroNames.has(row.name)))) {
    throw new Error("路线含官方63棋子之外的实体");
  }
  const deterministic = buildLineupModel(catalog);
  const left = model.routes.map(route => [route.name, route.researchScore]);
  const right = deterministic.routes.map(route => [route.name, route.researchScore]);
  if (JSON.stringify(left) !== JSON.stringify(right)) throw new Error("同一数据未生成相同路线排序");
  return true;
}

function writeOutputs(model) {
  ensureOutputDirs();
  fs.writeFileSync(resultPath("star-god-lineup-model.json"), JSON.stringify(model, null, 2));
  const publicData = {
    schemaVersion: model.schemaVersion,
    model: model.model,
    source: model.source,
    summary: model.summary,
    routes: model.routes,
  };
  fs.writeFileSync(publicPath("star-god-lineup-data.js"), `window.STAR_GOD_LINEUP_DATA = ${JSON.stringify(publicData)};\n`);
  const topGenerated = model.routes.filter(route => route.source !== "official-seed").slice(0, 15);
  const variants = model.routes.filter(route => route.source === "model-variant");
  const gains = variants.map(route => Number(route.modelChange?.boardGain || 0)).sort((a, b) => a - b);
  const meanGain = gains.length ? round(gains.reduce((sum, value) => sum + value, 0) / gains.length) : 0;
  const medianGain = gains.length ? round(gains[Math.floor(gains.length / 2)]) : 0;
  const generatedCarries = uniq(model.routes.filter(route => route.source === "beam-generated").map(route => route.carry.name));
  const report = [
    "# 星神阵容生成与比赛决策研究",
    "",
    `生成时间：${model.source.generatedAt}`,
    "",
    "## 研究边界",
    "",
    `- 数据：${model.summary.heroes}名真实商店棋子、${model.summary.officialSeeds}套官方前中后期种子。`,
    `- 新候选：${model.summary.modelVariants}套单槽反事实改良、${model.summary.beamGenerated}套束搜索阵容。`,
    "- 官方阵容仅提供主C、装备和运营样本；模型重新计算羁绊断点、卡面、前排与阶段连续性。",
    "- 当前没有星神模式独立商店概率证据，因此缺口只按卡牌面值计量，不输出虚假的概率金币。",
    "",
    "## 目标函数",
    "",
    "`S(B)=Vunit+Vtrait+VEHP+Vrole+Vitem−Ccost`",
    "",
    "`Q(route)=S(Bfinal)+14·J(early,mid,final)+πofficial`",
    "",
    "其中官方先验最多6分，只用于打破证据不足时的近似平局。",
    "",
    "## 反事实与独立搜索验证",
    "",
    `- 对44套官方种子逐一锁定主C、主坦和所有持装位，只允许替换一个裸装功能位；${variants.length}套达到至少${MODEL.variantMinGain}分的最低改良门槛。`,
    `- 单槽反事实收益：均值${meanGain}分，中位数${medianGain}分，范围${gains[0] || 0}–${gains[gains.length - 1] || 0}分。`,
    `- 束宽${MODEL.beamWidth}的8人口独立搜索覆盖${generatedCarries.length}个不同主C，不复制官方最终棋盘。`,
    "- 每次构建会再运行一次同输入重算断言；路线名称与研究分不完全一致时构建直接失败。",
    "",
    "## 模型发现候选",
    "",
    "| 排名 | 候选 | 来源 | 主C | 研究分 | 前排EHP代理 | 连续性 |",
    "| ---: | --- | --- | --- | ---: | ---: | ---: |",
    ...topGenerated.map((route, index) => `| ${index + 1} | ${route.name} | ${route.source} | ${route.carry.name} | ${route.researchScore} | ${route.boardModel.frontline} | ${route.continuity} |`),
    "",
    "## 已知限制",
    "",
    "- 羁绊断点已计入，但未把每段机制文本强行折成同一伤害单位。",
    "- 站位图使用官方坐标或防御指数启发式，不模拟逐格寻路与技能选敌。",
    "- 赐福进入比赛模式时按确定性六维价值与路线方向协同，不改变基础棋子卡面。",
  ].join("\n");
  fs.writeFileSync(reportPath("星神阵容生成与比赛模式研究.md"), report);
}

function main() {
  const catalog = loadCatalog();
  const model = buildLineupModel(catalog);
  assertModel(model, catalog);
  writeOutputs(model);
  console.log(`星神阵容模型：${model.summary.officialSeeds}官方种子 + ${model.summary.modelVariants}单槽改良 + ${model.summary.beamGenerated}束搜索 = ${model.summary.totalRoutes}路线`);
}

if (require.main === module) main();

module.exports = {
  MODEL,
  PSEUDO_UNITS,
  loadCatalog,
  createContext,
  itemComponents,
  itemRole,
  carryDirection,
  heroPower,
  defenseIndex,
  offenseIndex,
  activeTraits,
  evaluateBoard,
  deriveProfile,
  bestSingleSlotVariant,
  beamGeneratedBoard,
  buildLineupModel,
  assertModel,
  writeOutputs,
};
