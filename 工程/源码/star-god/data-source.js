"use strict";

const fs = require("fs");
const path = require("path");
const { dataPath, publicPath, ensureOutputDirs } = require("../lib/project-paths.js");

const EDITION = "17.17.7";
const DISPLAY_PATCH = "17.7";
const CURRENT_CLIENT_PATCH = "17.7b";
const SET_ID = "17";
const SOURCE_BASE = `https://game.gtimg.cn/images/lol/act/jkzlk/js/17/${EDITION}-S18`;
const LINEUP_SOURCE = "https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m18/11/17/lineup_detail_total.json";
const MODE_RULE_SOURCE = "https://apps.apple.com/cn/app/%E9%87%91%E9%93%B2%E9%93%B2%E4%B9%8B%E6%88%98/id1478101301";
const CURRENT_PATCH_SOURCE = "https://www.taptap.cn/app/176937/topic?group_label_id=3108882";
const FILES = ["god", "chess", "race", "job", "equip", "hex", "galaxy", "trait"];

const TYPE_LABELS = Object.freeze({
  "1": "经济",
  "2": "战斗",
  "3": "装备",
  "4": "规则",
});

function toRows(payload) {
  const data = payload && payload.data != null ? payload.data : payload;
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return Object.values(data);
  return [];
}

async function getJson(url) {
  const response = await fetch(url, { headers: { "user-agent": "jcc-research-lab/1.0" } });
  if (!response.ok) throw new Error(`官方数据请求失败 ${response.status}: ${url}`);
  return response.json();
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function uniqueBy(rows, key) {
  const seen = new Set();
  return rows.filter(row => {
    const value = key(row);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function classifyBlessing(row) {
  const text = `${row.name} ${row.desc}`;
  if (/探险|到达9级|刷新商店15次|首次跌至30|升星时/.test(text)) return "quest";
  if (/下次|每个阶段开始|每回合|剩余游戏时间|延迟|在\d+个?回合后|选择羽饰骑士/.test(text)) return "delayed";
  if (/格$|这个格子|绘制格/.test(text)) return "painted-hex";
  if (/生命值|物理加成|法术加成|攻击速度|法力回复|晕眩|伤害|护盾|治疗/.test(text)) return "combat";
  if (/装备|拳套|反曲之弓|女神之泪|无用大棒|锁子甲|负极斗篷|暴风大剑|锻造器|重铸器/.test(text)) return "item";
  if (/弈子|复制器|商店|刷新/.test(text)) return "unit-shop";
  if (/金币|经验|利息/.test(text)) return "economy";
  return "special";
}

function normalizeGods(payload) {
  return toRows(payload).map(god => {
    const shortName = cleanText(god.godName).split(" ")[0];
    const title = cleanText(god.godName).slice(shortName.length).trim();
    const stageRows = (god.stages || []).map(stage => ({
      stage: Number(stage.num),
      blessings: (stage.wishes || []).map(wish => ({
        id: Number(wish.id),
        name: cleanText(wish.name),
        description: cleanText(wish.desc),
        icon: wish.icon || "",
        mainGod: Number(wish.dragon) === 1,
        typeCodes: String(wish.type || "").split("|").filter(Boolean),
        typeLabels: String(wish.type || "").split("|").filter(Boolean).map(code => TYPE_LABELS[code] || code),
        mechanism: classifyBlessing(wish),
      })),
    })).sort((a, b) => a.stage - b.stage);
    return {
      id: Number(god.godId),
      name: shortName,
      title,
      fullName: cleanText(god.godName),
      summary: cleanText(god.godTips),
      icon: god.godIcon || "",
      splash: god.tex || "",
      stages: stageRows,
    };
  }).sort((a, b) => a.id - b.id);
}

function normalizeHeroes(payload) {
  const rows = toRows(payload).filter(row =>
    row.name &&
    !/核心$/.test(row.name) &&
    Number(row.price) >= 1 &&
    Number(row.price) <= 5
  );
  const preferred = rows.filter(row => String(row.id).startsWith("1") && String(row.showHeroTag) === "1");
  return uniqueBy(preferred, row => row.name).map(row => ({
    id: String(row.id),
    name: cleanText(row.name),
    cost: Number(row.price),
    traits: `${row.species || ""}|${row.class || ""}`.split("|").filter(id => id && id !== "0" && id !== "-1"),
    hp: Number(row.initHP) || 0,
    attackDamage: Number(row.initAttackDamage) || 0,
    attackSpeed: Number(row.attackSpeed) || 0,
    armor: Number(row.armor) || 0,
    magicResist: Number(row.magicResist) || 0,
    mana: Number(row.maxMP) || 0,
    skillName: cleanText(row.skillName),
    skillDescription: cleanText(row.skillDesc),
  })).sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "zh-CN"));
}

function normalizeTraits(racePayload, jobPayload) {
  return [...toRows(racePayload), ...toRows(jobPayload)].filter(row => row.name).map(row => ({
    id: String(row.id),
    name: cleanText(row.name),
    kind: toRows(racePayload).some(candidate => String(candidate.id) === String(row.id)) ? "origin" : "class",
    breakpoints: String(row.numList || "").split("|").map(Number).filter(Number.isFinite),
    description: cleanText(row.desc2),
  })).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

function normalizeItems(payload) {
  return toRows(payload).filter(row => row.name).map(row => ({
    id: String(row.id),
    name: cleanText(row.name),
    type: String(row.type || ""),
    description: cleanText(row.desc || row.basicDesc),
    synthesis: [row.synthesis1, row.synthesis2].filter(Boolean).map(String),
  }));
}

function normalizeAugments(payload) {
  return toRows(payload).filter(row => row.name).map(row => ({
    id: String(row.id),
    name: cleanText(row.name),
    tier: Number(row.level) || 0,
    description: cleanText(row.desc),
  }));
}

function normalizeEncounters(payload) {
  return toRows(payload).filter(row => row.name).map(row => ({
    id: String(row.id),
    name: cleanText(row.name),
    description: cleanText(row.desc),
  }));
}

function normalizeLineups(payload, heroById, itemById) {
  const rows = Array.isArray(payload.lineup_list) ? payload.lineup_list : [];
  return rows.map(row => {
    const detail = JSON.parse(row.detail || "{}");
    const mapHero = hero => ({
      name: heroById.get(String(hero.hero_id))?.name || String(hero.hero_id || ""),
      cost: heroById.get(String(hero.hero_id))?.cost || null,
      carry: !!hero.is_carry_hero,
      location: hero.location || "",
      items: String(hero.equipment_id || "").split(",").filter(Boolean).map(id => itemById.get(id)?.name || id),
    });
    return {
      id: String(row.id),
      name: cleanText(detail.line_name),
      quality: String(row.quality || ""),
      edition: String(row.simulator_edition || ""),
      early: (detail.y21_early_heros || []).map(mapHero),
      middle: (detail.y21_metaphase_heros || []).map(mapHero),
      final: (detail.hero_location || []).map(mapHero),
      operation: cleanText(detail.d_time || detail.early_info),
      positioning: cleanText(detail.location_info),
      recommendedGods: (detail.god_list || []).map(entry => ({
        stage: Number(entry.stage_num),
        godId: Number(entry.god_id),
        blessingIds: (entry.wishes || []).map(Number),
      })),
    };
  }).filter(row => row.name);
}

function buildRuleset(catalog) {
  return {
    schemaVersion: "0.1.0",
    rulesetId: "jcc-star-god-17.7",
    target: {
      game: "金铲铲之战",
      displayPatch: DISPLAY_PATCH,
      currentClientPatch: CURRENT_CLIENT_PATCH,
      dataEdition: EDITION,
      season: "S18",
      modeId: SET_ID,
      modeKind: "other",
      researchedAt: String(catalog.source.sourceTime || "").slice(0, 10),
    },
    statusLegend: ["confirmed", "version-dependent", "unverified", "conflict", "deprecated"],
    evidence: [
      {
        id: "official-star-god-catalog",
        tier: "A",
        title: "17.17.7 星神模式腾讯游戏资料快照",
        source: SOURCE_BASE,
        appliesTo: ["gods", "blessings", "roster", "traits", "items", "augments", "encounters"],
      },
      {
        id: "official-star-god-lineups",
        tier: "A",
        title: "17.17.7 星神模式官方阵容快照",
        source: LINEUP_SOURCE,
        appliesTo: ["lineups", "stages", "god-recommendations"],
      },
      {
        id: "official-current-client-patch",
        tier: "A",
        title: "17.7b客户端更新公告",
        source: CURRENT_PATCH_SOURCE,
        appliesTo: ["client-patch-status"],
      },
      {
        id: "official-star-god-mode-rules",
        tier: "A",
        title: "星神赛季官方玩法说明",
        source: MODE_RULE_SOURCE,
        appliesTo: ["offer-pair", "selection-rounds", "main-god", "treasure-round"],
      },
    ],
    mechanics: {
      offerPair: {
        status: "confirmed",
        evidenceIds: ["official-star-god-mode-rules", "official-star-god-catalog"],
        value: {
          godsPerGame: 2,
          choosePerRound: 1,
          samePairThroughoutGame: true,
          exactBlessingMustBeObserved: true,
        },
        notes: "决策时只比较本局固定出现的两位星神及本轮实际展示的两份赐福；未录具体赐福时只能做同神赐福均值预估。",
      },
      selectionRounds: {
        status: "confirmed",
        evidenceIds: ["official-star-god-mode-rules", "official-star-god-catalog"],
        value: ["2-4", "3-4", "4-4"],
      },
      mainGod: {
        status: "confirmed",
        evidenceIds: ["official-star-god-mode-rules", "official-star-god-catalog"],
        value: {
          repeatedGodBecomesMain: true,
          treasureRound: "4-7",
          mainBlessings: catalog.summary.mainGodBlessings,
        },
      },
      dataCoverage: {
        status: "confirmed",
        evidenceIds: ["official-star-god-catalog", "official-star-god-lineups"],
        value: catalog.summary,
      },
      patchFreshness: {
        status: "version-dependent",
        evidenceIds: ["official-star-god-catalog", "official-current-client-patch"],
        value: {
          currentClientPatch: CURRENT_CLIENT_PATCH,
          starGodSnapshotPatch: DISPLAY_PATCH,
          starGodDataEdition: EDITION,
          newerStarGodEndpointPublished: false,
        },
        notes: "17.7b公告更新的是英雄联盟传奇·海克斯典籍；截至构建时，腾讯星神资料端仍只发布17.17.7快照。",
      },
      featherKnightBalance: {
        status: "unverified",
        evidenceIds: [],
        value: null,
        notes: "官方资料包含相关赐福文本，但未提供按生命值分档的完整奖池与概率。",
      },
      ordinaryGodTreasure: {
        status: "unverified",
        evidenceIds: [],
        value: null,
        notes: "4-7普通神之秘宝的完整包池、重随次数和分布尚无可执行资料。",
      },
    },
    openQuestions: [
      {
        id: "feather-knight-balance-table",
        question: "羽饰骑士按生命值平衡奖励的完整分档与概率是什么？",
        blocks: ["精确生命值逆风价值", "超级临别赠礼期望值"],
        preferredEvidence: "17.7客户端逐档录像或官方表格",
      },
      {
        id: "god-treasure-pool",
        question: "4-7普通神之秘宝的完整奖励包池与重随分布是什么？",
        blocks: ["普通星神与主神的4-7价值差"],
        preferredEvidence: "官方规则说明或足量客户端样本",
      },
      {
        id: "current-shop-pool",
        question: "星神模式当前各费用商店概率与单卡牌池份数是什么？",
        blocks: ["英雄复制与全费用商店的精确边际价值"],
        preferredEvidence: "17.7客户端商店概率与官方规则",
      },
    ],
  };
}

async function buildCatalog() {
  const payloads = Object.fromEntries(await Promise.all(FILES.map(async name => [name, await getJson(`${SOURCE_BASE}/${name}.js`)])));
  const lineupPayload = await getJson(LINEUP_SOURCE);
  const gods = normalizeGods(payloads.god);
  const blessings = gods.flatMap(god => god.stages.flatMap(stage => stage.blessings.map(row => ({
    ...row,
    godId: god.id,
    godName: god.name,
    stage: stage.stage,
  }))));
  const uniqueBlessings = uniqueBy(blessings, row => row.id);
  const heroes = normalizeHeroes(payloads.chess);
  const items = normalizeItems(payloads.equip);
  const heroById = new Map(toRows(payloads.chess).map(row => [String(row.id), { name: cleanText(row.name), cost: Number(row.price) || null }]));
  const itemById = new Map(items.map(row => [row.id, row]));
  const lineups = normalizeLineups(lineupPayload, heroById, itemById);
  const catalog = {
    schemaVersion: "1.0.0",
    generatedAt: payloads.god.time || `${EDITION}-official-snapshot`,
    source: {
      edition: EDITION,
      displayPatch: DISPLAY_PATCH,
      currentClientPatch: CURRENT_CLIENT_PATCH,
      setId: SET_ID,
      sourceTime: payloads.god.time || "",
      baseUrl: SOURCE_BASE,
      lineupUrl: LINEUP_SOURCE,
      modeRuleUrl: MODE_RULE_SOURCE,
      currentPatchUrl: CURRENT_PATCH_SOURCE,
      freshness: "17.7b客户端已上线；星神官方资料仍为17.17.7快照",
    },
    summary: {
      gods: gods.length,
      blessingRows: gods.reduce((sum, god) => sum + god.stages.reduce((stageSum, stage) => stageSum + stage.blessings.length, 0), 0),
      uniqueBlessings: uniqueBlessings.length,
      mainGodBlessings: uniqueBlessings.filter(row => row.mainGod).length,
      heroes: heroes.length,
      heroVariants: toRows(payloads.chess).length,
      traits: toRows(payloads.race).length + toRows(payloads.job).length,
      items: items.length,
      augments: toRows(payloads.hex).length,
      encounters: toRows(payloads.galaxy).length,
      lineups: lineups.length,
      lineupQuality: lineups.reduce((counts, row) => ({ ...counts, [row.quality]: (counts[row.quality] || 0) + 1 }), {}),
    },
    gods,
    blessings,
    heroes,
    traits: normalizeTraits(payloads.race, payloads.job),
    items,
    augments: normalizeAugments(payloads.hex),
    encounters: normalizeEncounters(payloads.galaxy),
    lineups,
  };
  if (catalog.summary.gods !== 9 || catalog.summary.uniqueBlessings !== 110 || catalog.summary.mainGodBlessings !== 9) {
    throw new Error(`星神目录计数异常：${JSON.stringify(catalog.summary)}`);
  }
  return catalog;
}

function writeCatalog(catalog) {
  ensureOutputDirs();
  const targetDir = dataPath("star-god", DISPLAY_PATCH);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, "catalog.json"), JSON.stringify(catalog, null, 2));
  fs.writeFileSync(dataPath("ruleset", "star-god-17.7.json"), JSON.stringify(buildRuleset(catalog), null, 2));
  const publicCatalog = {
    schemaVersion: catalog.schemaVersion,
    generatedAt: catalog.generatedAt,
    source: catalog.source,
    summary: catalog.summary,
    gods: catalog.gods,
    blessings: catalog.blessings,
    heroes: catalog.heroes,
    traits: catalog.traits,
    items: catalog.items,
    augments: catalog.augments,
    encounters: catalog.encounters,
    lineups: catalog.lineups,
  };
  fs.writeFileSync(publicPath("star-god-data.js"), `window.STAR_GOD_DATA = ${JSON.stringify(publicCatalog)};\n`);
  return targetDir;
}

async function writeGodAssets(gods) {
  const targetDir = publicPath("assets", "star-god");
  fs.mkdirSync(targetDir, { recursive: true });
  await Promise.all(gods.map(async god => {
    let response = await fetch(god.icon, { headers: { "user-agent": "jcc-research-lab/1.0" } });
    if (!response.ok) response = await fetch(god.splash, { headers: { "user-agent": "jcc-research-lab/1.0" } });
    if (!response.ok) throw new Error(`星神图标与立绘均请求失败 ${response.status}: ${god.fullName}`);
    fs.writeFileSync(path.join(targetDir, `${god.id}.png`), Buffer.from(await response.arrayBuffer()));
  }));
  return targetDir;
}

async function main() {
  const catalog = await buildCatalog();
  const target = writeCatalog(catalog);
  const assetTarget = await writeGodAssets(catalog.gods);
  console.log(`星神官方数据已规范化：${catalog.summary.gods}位星神 / ${catalog.summary.uniqueBlessings}个赐福 / ${catalog.summary.lineups}套阵容 -> ${target}`);
  console.log(`星神图标已本地化：${catalog.summary.gods}个 -> ${assetTarget}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  EDITION,
  DISPLAY_PATCH,
  CURRENT_CLIENT_PATCH,
  SET_ID,
  SOURCE_BASE,
  LINEUP_SOURCE,
  MODE_RULE_SOURCE,
  CURRENT_PATCH_SOURCE,
  classifyBlessing,
  normalizeGods,
  normalizeHeroes,
  normalizeLineups,
  buildCatalog,
  buildRuleset,
  writeCatalog,
  writeGodAssets,
};
