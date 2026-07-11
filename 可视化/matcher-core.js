(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MatcherCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const COMPONENTS = ["暴风之剑", "反曲之弓", "无用大棒", "女神之泪", "锁子甲", "负极斗篷", "巨人腰带", "拳套", "金铲铲"];
  const ATTACK = ["鬼索的狂暴之刃", "疾射火炮", "卢安娜的飓风", "最后的轻语", "锐利之刃", "无尽之刃", "巨人捕手", "泰坦的坚决", "水银", "海克斯科技枪刃", "汲取剑"];
  const AP = ["蓝霸符", "珠光护手", "班克斯的魔法帽", "巨人捕手", "斯塔缇克电刃", "朔极之矛"];
  const TANK = ["狂徒铠甲", "日炎斗篷", "石像鬼石板甲", "棘刺背心", "巨龙之爪", "圣盾使的誓约", "离子火花", "振奋盔甲"];
  const TRAIT_ALIASES = {
    护卫: ["护卫"],
    斗士: ["斗士"],
    战斗机甲: ["机甲", "战斗机甲", "战队机甲"],
    小天才: ["小天才", "小"],
    福牛守护者: ["福牛", "福牛守护者"],
    决斗大师: ["决斗", "决斗大师"],
    秘术卫士: ["秘卫", "秘术", "秘术卫士", "秘书卫士"],
    情报特工: ["情报", "情报特工"],
    强袭枪手: ["枪手", "强袭枪手"],
    超级英雄: ["超英", "超级英雄"],
    星之守护者: ["星守", "星之守护者"],
    "源计划：激光特工": ["源计划", "激光", "原计划", "源计划激光", "源计划特工", "激光特工", "源计划：激光特工"],
    混沌战士: ["混沌", "混沌战士"],
    爱心使者: ["爱心", "爱心使者"],
    吉祥物: ["吉祥物"],
    黑客: ["黑客"],
    灵能使: ["灵能", "灵能使"],
    精英战士: ["精英", "精英战士"],
    平民英雄: ["平民", "平民英雄"],
    地下魔盗团: ["魔盗", "地下魔盗", "地下魔盗团"],
    幻灵战队: ["幻灵", "幻灵战队"],
    怪兽: ["怪兽"],
    AI程序: ["ai", "ai程序", "AI程序"],
    淘气包: ["淘气包"],
    气象主播: ["气象", "气象主播"],
  };
  const CN_NUMBERS = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  // 排序黏性：挑战者需领先 max(3分, 现任分*15%) 才易主；现任跌出前3则立即让位。
  const STICKY_MIN_LEAD = 3;
  const STICKY_RELATIVE_LEAD = 0.15;
  // 散件方向纯度达到 2/3 时，给同方向主C路线 10% 确定性加成。
  const COMPONENT_DIRECTION_BONUS = 0.1;
  // primePlan 只给含战斗机甲实验结论的路线加命中证据；不影响无 primePlan 的路线。
  const PRIME_PLAN_MATCH_BONUS = 10;
  // 星级权重：二星/三星来牌比单张更能代表可执行路线，放大该棋子的命中分。
  const STAR_SCORE_MULTIPLIERS = { 1: 1, 2: 1.5, 3: 2.5 };
  // 三星核心视为关键里程碑完成，给追三/核心路线一个确定性成型加成。
  const STAR_MILESTONE_BONUS = 18;
  // 资产角色估值：角色判定来自 routeProfile，这里只集中放数值权重。
  const FUTURE_VALUE_GOLD_CAP = 80;
  const FUTURE_ITEM_VALUE_RATIO = 0.25;
  // 认证样本只作为有限先验，最多±5分；现场资产与硬门槛仍决定主要排序。
  const CERTIFICATION_PRIOR_LIMIT = 5;
  const CERTIFICATION_SOFTMAX_TEMPERATURE = 16;
  const MIN_LEVEL = 1;
  const MAX_LEVEL = 9;
  const DEFAULT_LEVEL = 6;
  // 抗脆弱路线泛函：只在 opts.antiFragile 打开时参与最终排序。
  // 设计意图：用核心度、瓶颈、最坏下限和转阵期权，压低"满配强但缺一环就崩"的路线。
  const ANTIFRAGILE_READY_GREEN = 0.55;
  const ANTIFRAGILE_READY_YELLOW = 0.25;
  const ANTIFRAGILE_BOTTLENECK_RED = 1.6;
  const ANTIFRAGILE_BOTTLENECK_YELLOW = 0.9;
  const ANTIFRAGILE_OPTION_BONUS = 16;
  const ANTIFRAGILE_READY_BONUS = 12;
  const ANTIFRAGILE_BOTTLENECK_PENALTY = 35;
  const ANTIFRAGILE_CVAR_PENALTY = 40;
  const ANTIFRAGILE_HARD_GATE_PENALTY = 32;
  const ANTIFRAGILE_ROLL_GOLD = { 1: 0, 2: 0, 3: 8, 4: 12, 5: 24, 6: 36, 7: 50, 8: 45, 9: 55 };
  const ANTIFRAGILE_UNREACHABLE_PROB = 0.05;
  const ANTIFRAGILE_HUGE_GOLD = 80;
  const ANTIFRAGILE_UNREACHABLE_PENALTY = 70;
  const ANTIFRAGILE_HUGE_GOLD_PENALTY = 42;
  const ANTIFRAGILE_RED_STATUS_PENALTY = 80;
  const ECONOMY_AUGMENTS = ["高端购物", "升级咯！", "升级咯", "对冲基金", "明智消费", "利滚利", "利滚利加强版", "DD街区", "快速思考"];

  const fallbackWeights = {
    baseS: 6,
    baseA: 3,
    baseB: 1,
    mainCarryUnit: 60,
    mainCarryItem: 30,
    subCarryUnit: 24,
    subCarryItem: 22,
    frontlineUnit: 16,
    frontlineItem: 16,
    utilityUnit: 10,
    routeItem: 12,
    immediateCraftRatio: 0.8,
    singleComponentRatio: 0.5,
    traitAffinity: 7,
    trait: 18,
    augment: 16,
    augmentSignal: 6,
    futureMainCarryUnit: 24,
    futureCoreUnit: 10,
    futureItem: 8,
    versionStrength: 4,
  };

  const ITEM_RECIPES = {
    鬼索的狂暴之刃: ["反曲之弓", "无用大棒"],
    疾射火炮: ["反曲之弓", "反曲之弓"],
    卢安娜的飓风: ["反曲之弓", "负极斗篷"],
    最后的轻语: ["反曲之弓", "拳套"],
    锐利之刃: ["暴风之剑", "暴风之剑"],
    无尽之刃: ["暴风之剑", "拳套"],
    巨人捕手: ["暴风之剑", "反曲之弓"],
    泰坦的坚决: ["反曲之弓", "锁子甲"],
    水银: ["负极斗篷", "拳套"],
    海克斯科技枪刃: ["暴风之剑", "无用大棒"],
    汲取剑: ["暴风之剑", "负极斗篷"],
    蓝霸符: ["女神之泪", "女神之泪"],
    珠光护手: ["无用大棒", "拳套"],
    班克斯的魔法帽: ["无用大棒", "无用大棒"],
    斯塔缇克电刃: ["反曲之弓", "女神之泪"],
    朔极之矛: ["暴风之剑", "女神之泪"],
    狂徒铠甲: ["巨人腰带", "巨人腰带"],
    日炎斗篷: ["锁子甲", "巨人腰带"],
    石像鬼石板甲: ["锁子甲", "负极斗篷"],
    棘刺背心: ["锁子甲", "锁子甲"],
    巨龙之爪: ["负极斗篷", "负极斗篷"],
    圣盾使的誓约: ["锁子甲", "女神之泪"],
    离子火花: ["无用大棒", "负极斗篷"],
    振奋盔甲: ["巨人腰带", "负极斗篷"],
  };
  const ITEM_ALIASES = {
    羊刀: "鬼索的狂暴之刃",
    鬼索: "鬼索的狂暴之刃",
    火炮: "疾射火炮",
    泰坦: "泰坦的坚决",
    法爆: "珠光护手",
    帽子: "班克斯的魔法帽",
    轻语: "最后的轻语",
    飓风: "卢安娜的飓风",
    巨杀: "巨人捕手",
    锐利: "锐利之刃",
    狂徒: "狂徒铠甲",
    离子: "离子火花",
  };

  function uniq(arr) {
    return [...new Set((arr || []).filter(Boolean))];
  }

  function escText(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function traitNorm(s) {
    return String(s || "").toLowerCase().replace(/[\s,，、+＋/|;；:：!！?？。,.()（）\[\]【】·.\-_—>→]/g, "");
  }

  const traitEntries = Object.entries(TRAIT_ALIASES).flatMap(([value, aliases]) =>
    [value, ...(aliases || [])].map(label => ({ value, label, norm: traitNorm(label) }))
  ).filter(x => x.norm).sort((a, b) => b.norm.length - a.norm.length);

  function numberAt(text, i) {
    const ch = text[i];
    if (CN_NUMBERS[ch]) return { count: CN_NUMBERS[ch], len: 1 };
    const m = text.slice(i).match(/^[1-9]/);
    return m ? { count: Number(m[0]), len: m[0].length } : null;
  }

  function traitAt(text, i) {
    const n = numberAt(text, i);
    if (!n) return null;
    const rest = text.slice(i + n.len);
    const hit = traitEntries.find(e => rest.startsWith(e.norm));
    if (!hit) return null;
    return { name: hit.value, count: n.count, label: `${n.count}${hit.value}`, len: n.len + hit.norm.length };
  }

  function parseTraitsInText(text) {
    const clean = traitNorm(text);
    const rows = [];
    for (let i = 0; i < clean.length; i++) {
      const hit = traitAt(clean, i);
      if (!hit) continue;
      rows.push(hit);
      i += hit.len - 1;
    }
    return rows;
  }

  function normalizeSelectedTraits(rows) {
    return (rows || []).map(x => {
      if (typeof x === "string") return parseTraitsInText(x)[0];
      if (x && x.name && x.count) return { name: x.name, count: Number(x.count), label: x.label || `${x.count}${x.name}` };
      if (x && x.value && x.count) return { name: x.value, count: Number(x.count), label: x.label || `${x.count}${x.value}` };
      return x && (x.label || x.value) ? parseTraitsInText(x.label || x.value)[0] : null;
    }).filter(Boolean);
  }

  function activeTraitsForTemplate(t) {
    const map = new Map();
    const add = row => {
      if (!row || !row.name || !row.count) return;
      map.set(row.name, Math.max(map.get(row.name) || 0, Number(row.count)));
    };
    (t.earlyTraits || []).forEach(x => parseTraitsInText(x).forEach(add));
    parseTraitsInText(t.name || "").forEach(add);
    return map;
  }

  function normalizeSelectedUnits(rows) {
    const map = new Map();
    (rows || []).forEach(row => {
      const name = typeof row === "string" ? row : (row && (row.name || row.value || row.label));
      if (!name) return;
      const cleanName = String(name).split("·")[0];
      const star = Number(typeof row === "object" ? row.star : 0) || 0;
      const prev = map.get(cleanName);
      if (!prev || star > (prev.star || 0)) map.set(cleanName, { name: cleanName, star });
    });
    return [...map.values()];
  }

  function unitCopies(star) {
    if (star >= 3) return 9;
    if (star === 2) return 3;
    return 1;
  }

  function starLabel(name, star) {
    return star ? `${name}·${star}星` : name;
  }

  function canonicalItem(name) {
    const raw = String(name || "").split("/")[0].trim();
    return ITEM_ALIASES[raw] || raw;
  }

  function profile(t) {
    return t.routeProfile || {
      mainCarry: { name: (t.carryUnits || [])[0] || (t.coreUnits || [])[0], starTarget: 2, items: (t.completedPrefs || []).slice(0, 3) },
      units: (t.coreUnits || []).map(name => ({ name, role: "utility", starTarget: 1, items: [], traits: [] })),
      items: (t.completedPrefs || []).map(name => ({ name: canonicalItem(name), role: "route", holder: "", components: ITEM_RECIPES[canonicalItem(name)] || [] })),
      activeTraits: [...activeTraitsForTemplate(t)].map(([name, count]) => ({ name, count, label: `${count}${name}` })),
    };
  }

  function profileUnitMap(t) {
    const map = new Map();
    (profile(t).units || []).forEach(u => {
      if (!u || !u.name) return;
      map.set(u.name, u);
    });
    return map;
  }

  function profileItems(t) {
    return (profile(t).items || []).map(item => ({
      ...item,
      name: canonicalItem(item.name),
      components: item.components && item.components.length ? item.components : (ITEM_RECIPES[canonicalItem(item.name)] || []),
    })).filter(x => x.name);
  }

  function activeTraitRows(t) {
    const rows = (profile(t).activeTraits || []).filter(x => x && x.name && x.count);
    if (rows.length) return rows;
    return [...activeTraitsForTemplate(t)].map(([name, count]) => ({ name, count, label: `${count}${name}` }));
  }

  function activeTraitMap(t) {
    const map = new Map();
    activeTraitRows(t).forEach(x => map.set(x.name, Math.max(map.get(x.name) || 0, Number(x.count) || 0)));
    return map;
  }

  function roleUnitWeight(role, w) {
    if (role === "mainCarry") return w.mainCarryUnit;
    if (role === "subCarry") return w.subCarryUnit;
    if (role === "frontline") return w.frontlineUnit;
    return w.utilityUnit;
  }

  function roleItemWeight(role, w) {
    if (role === "mainCarry") return w.mainCarryItem;
    if (role === "subCarry") return w.subCarryItem;
    if (role === "frontline") return w.frontlineItem;
    return w.routeItem;
  }

  function roleLabel(role) {
    return role === "mainCarry" ? "主C"
      : role === "subCarry" ? "副C"
      : role === "frontline" ? "前排"
      : "成型";
  }

  function itemRankLabel(item, roleItems) {
    const sameRole = roleItems.filter(x => x.role === item.role && x.holder === item.holder);
    const idx = sameRole.findIndex(x => x.name === item.name);
    return idx === 0 ? "一号装" : idx === 1 ? "二号装" : idx === 2 ? "三号装" : "装备";
  }

  function carryCoreItems(t) {
    return profileItems(t).filter(x => x.role === "mainCarry").map(x => x.name);
  }

  function unitTraits(name, opts, unitMap) {
    const row = unitMap && unitMap.get(name);
    if (row && row.traits) return row.traits;
    const map = opts && opts.unitTraits || {};
    return map[name] || [];
  }

  function selectedComponentList(items) {
    return [...(items || [])].filter(x => COMPONENTS.includes(x));
  }

  function countComponents(list) {
    const counts = {};
    (list || []).forEach(x => { counts[x] = (counts[x] || 0) + 1; });
    return counts;
  }

  function hasRecipe(components, recipe) {
    const counts = countComponents(components);
    return (recipe || []).every(part => {
      if (!counts[part]) return false;
      counts[part]--;
      return true;
    });
  }

  function bestCrafts(t, selectedItems, w) {
    // 贪心撮合：散件是互斥资源——一件散件只能进一个合成对或计一次单件分，
    // 杜绝"三件散件被记成三个可立即合成"的重复计分
    const pool = countComponents(selectedComponentList(selectedItems));
    const items = profileItems(t);
    const candidates = items
      .filter(item => (item.components || []).length === 2)
      .map(item => ({ item, recipe: item.components, base: roleItemWeight(item.role, w) }))
      .sort((a, b) => b.base - a.base);
    const rows = [];
    const usedItems = new Set();
    // 第一轮：高价值成装优先配对，配上即消耗两件散件
    candidates.forEach(({ item, recipe, base }) => {
      if (usedItems.has(item.name)) return;
      const need = countComponents(recipe);
      const ok = Object.entries(need).every(([part, n]) => (pool[part] || 0) >= n);
      if (!ok) return;
      Object.entries(need).forEach(([part, n]) => { pool[part] -= n; });
      usedItems.add(item.name);
      rows.push({
        item,
        pts: Math.round(base * w.immediateCraftRatio),
        evidence: `${recipe[0]}+${recipe[1]}→${item.name}（${roleLabel(item.role)}${itemRankLabel(item, items)}可立即合成）`,
        kind: "craft",
      });
    });
    // 第二轮：剩余散件每件只计一次，记到还需要它的最高价值成装上
    candidates.forEach(({ item, recipe, base }) => {
      if (usedItems.has(item.name)) return;
      const hit = recipe.find(part => (pool[part] || 0) > 0);
      if (!hit) return;
      pool[hit] -= 1;
      usedItems.add(item.name);
      rows.push({
        item,
        pts: Math.round(base * w.singleComponentRatio),
        evidence: `${hit} 属于${item.name}分解件`,
        kind: "component",
      });
    });
    return rows;
  }

  function componentDirection(items) {
    const components = [...(items || [])].filter(x => COMPONENTS.includes(x));
    const physical = components.filter(x => ["暴风之剑", "反曲之弓", "拳套"].includes(x)).length;
    const magic = components.filter(x => ["无用大棒", "女神之泪"].includes(x)).length;
    const total = physical + magic;
    if (total < 2) return null;
    if (physical / total >= 2 / 3) return "物理";
    if (magic / total >= 2 / 3) return "法系";
    return null;
  }

  function routeText(t) {
    return [
      t && t.name,
      t && t.family,
      ...((t && t.earlyUnits) || []),
      ...((t && t.midUnits) || []),
      ...((t && t.coreUnits) || []),
      ...((t && t.componentPrefs) || []),
      ...((t && t.completedPrefs) || []),
      ...profileItems(t || {}).flatMap(x => [x.name, ...(x.components || [])]),
    ].join(" ");
  }

  function binomialTail(n, p, k) {
    if (k <= 0) return 1;
    if (n <= 0 || p <= 0) return 0;
    if (p >= 1) return 1;
    if (k > n) return 0;
    let prob = Math.pow(1 - p, n);
    let sum = prob;
    for (let i = 1; i < k; i++) {
      prob *= ((n - i + 1) / i) * (p / (1 - p));
      sum += prob;
    }
    return clamp(1 - sum, 0, 1);
  }

  function hitProbabilityForUnit(name, targetCopies, selected, opts) {
    const level = clamp(Number(selected.level) || DEFAULT_LEVEL, MIN_LEVEL, MAX_LEVEL);
    const oddsData = opts && opts.oddsData || {};
    const shopOdds = oddsData.shopOdds || {};
    const unitCounts = oddsData.unitCounts || {};
    const cost = unitPrice(name, opts);
    const owned = ownedCopyMap(selected).get(name) || 0;
    const need = Math.max(0, targetCopies - owned);
    if (need <= 0) return 1;
    const odds = ((shopOdds[level] || [0, 0, 0, 0, 0])[cost - 1] || 0) / 100;
    if (odds <= 0) return 0;
    const count = Number(unitCounts[cost]) || 1;
    const pSlot = odds / count;
    const gold = ANTIFRAGILE_ROLL_GOLD[level] || 30;
    const slots = Math.max(0, Math.floor(gold / 2) * 5);
    return binomialTail(slots, pSlot, need);
  }

  function timingForCost(cost, level) {
    const ideal = cost <= 1 ? 4 : cost === 2 ? 5 : cost === 3 ? 7 : cost === 4 ? 8 : 9;
    return clamp(Math.exp(-0.35 * Math.abs((Number(level) || DEFAULT_LEVEL) - ideal)), 0.25, 1);
  }

  function unitReadiness(name, targetCopies, selected) {
    const owned = ownedCopyMap(selected).get(name) || 0;
    if (owned >= targetCopies) return 1;
    if (targetCopies >= 9) {
      if (owned >= 3) return 0.65;
      if (owned >= 1) return 0.25;
      return 0;
    }
    if (targetCopies >= 3) return owned >= 1 ? 0.55 : 0;
    return owned >= 1 ? 1 : 0;
  }

  function itemReadiness(item, selectedItems) {
    const name = canonicalItem(item.name);
    if (selectedItems.has(name)) return 1;
    const recipe = item.components && item.components.length ? item.components : ITEM_RECIPES[name] || [];
    const components = selectedComponentList(selectedItems);
    if (recipe.length === 2 && hasRecipe(components, recipe)) return 0.8;
    if (recipe.some(part => components.includes(part))) return 0.35;
    return 0;
  }

  function itemAvailability(readiness) {
    if (readiness >= 0.8) return 0.9;
    if (readiness > 0) return 0.5;
    return 0.25;
  }

  function componentIrreplaceability(type, role) {
    if (type === "augment") return 1;
    if (type === "unit") return role === "mainCarry" ? 0.95 : role === "subCarry" ? 0.68 : role === "frontline" ? 0.55 : 0.42;
    if (type === "item") return role === "mainCarry" ? 0.86 : role === "subCarry" ? 0.62 : role === "frontline" ? 0.5 : 0.35;
    return 0.45;
  }

  function coreComponentRows(t, selected, opts, w) {
    const rows = [];
    const level = clamp(Number(selected.level) || DEFAULT_LEVEL, MIN_LEVEL, MAX_LEVEL);
    const selectedItems = new Set([...(selected.items || [])].map(canonicalItem));
    const p = profile(t);
    const mainName = p.mainCarry && p.mainCarry.name;
    const stageNames = new Set(level <= 5 ? (t.earlyUnits || []) : level === 6 ? (t.midUnits || []) : []);
    const profileNames = new Set((p.units || []).map(x => x && x.name).filter(Boolean));
    stageNames.forEach(name => {
      if (!name || profileNames.has(name)) return;
      const cost = unitPrice(name, opts);
      const target = 1;
      const weight = w.frontlineUnit * 0.8;
      const readiness = unitReadiness(name, target, selected);
      const costRow = expectedCostForUnit(name, target, selected, opts);
      const probability = readiness >= 1 ? 1 : hitProbabilityForUnit(name, target, selected, opts);
      const availability = readiness > 0 ? Math.max(0.55, probability) : probability;
      const timing = timingForCost(cost, level);
      const coreIndex = weight * componentIrreplaceability("unit", "frontline") * timing / clamp(availability, 0.05, 1);
      rows.push({
        type: "unit",
        name,
        label: `阶段${name}`,
        role: "stage",
        weight,
        readiness,
        probability,
        availability,
        timing,
        coreIndex,
        expectedGold: readiness >= 1 ? 0 : (costRow.available ? costRow.expectedGold : ANTIFRAGILE_HUGE_GOLD * 2),
        need: readiness >= 1 ? 0 : 1,
      });
    });
    (p.units || []).forEach(unit => {
      if (!unit || !unit.name) return;
      const role = unit.role || (unit.name === mainName ? "mainCarry" : "utility");
      const cost = unitPrice(unit.name, opts);
      const futureScale = level <= 5 && !stageNames.has(unit.name)
        ? (cost >= 4 ? 0.12 : cost >= 3 ? 0.25 : 1)
        : level === 6 && !stageNames.has(unit.name) && cost >= 4
          ? 0.35
          : 1;
      const stageTarget = stageNames.has(unit.name)
        ? (level <= 5 ? 1 : level === 6 ? Math.min(3, targetCopiesFor(t, unit.name, cost)) : 0)
        : 0;
      const target = stageTarget || (futureScale < 1 ? 1 : targetCopiesFor(t, unit.name, cost));
      const weight = roleUnitWeight(role, w) * (role === "mainCarry" ? 1.25 : 0.75) * futureScale;
      const readiness = unitReadiness(unit.name, target, selected);
      const costRow = expectedCostForUnit(unit.name, target, selected, opts);
      const probability = readiness >= 1 ? 1 : hitProbabilityForUnit(unit.name, target, selected, opts);
      const availability = readiness > 0 ? Math.max(0.55, probability) : probability;
      const timing = timingForCost(cost, level);
      const coreIndex = weight * componentIrreplaceability("unit", role) * timing / clamp(availability, 0.05, 1);
      rows.push({
        type: "unit",
        name: unit.name,
        label: `${roleLabel(role)}${unit.name}`,
        role,
        weight,
        readiness,
        probability,
        availability,
        timing,
        coreIndex,
        expectedGold: readiness >= 1 ? 0 : (costRow.available ? costRow.expectedGold : ANTIFRAGILE_HUGE_GOLD * 2),
        need: Math.max(0, target - (ownedCopyMap(selected).get(unit.name) || 0)),
      });
    });
    profileItems(t).forEach(item => {
      const role = item.role || "route";
      const weight = roleItemWeight(role, w) * (role === "mainCarry" ? 1.15 : 0.65);
      const readiness = itemReadiness(item, selectedItems);
      const availability = itemAvailability(readiness);
      const coreIndex = weight * componentIrreplaceability("item", role) / availability;
      rows.push({
        type: "item",
        name: item.name,
        label: `${roleLabel(role)}装${item.name}`,
        role,
        weight,
        readiness,
        probability: availability,
        availability,
        timing: 1,
        coreIndex,
        expectedGold: 0,
        need: readiness >= 1 ? 0 : 1,
      });
    });
    const directAug = (t.augmentPrefs || []).find(name => String(t.name || "").includes(name));
    if (directAug) {
      const has = (selected.augments || []).includes(directAug);
      const weight = w.augment * 1.8;
      rows.push({
        type: "augment",
        name: directAug,
        label: `专属符文${directAug}`,
        role: "augment",
        weight,
        readiness: has ? 1 : 0,
        probability: has ? 1 : 0.22,
        availability: has ? 1 : 0.22,
        timing: 1,
        coreIndex: weight * componentIrreplaceability("augment", "augment") / (has ? 1 : 0.22),
        need: has ? 0 : 1,
      });
    }
    return rows.filter(x => Number.isFinite(x.coreIndex));
  }

  function routeOptionValue(t, selected, templates) {
    const all = (templates || []).filter(x => x && x !== t);
    if (!all.length) return 0;
    const selectedAssets = [
      ...normalizeSelectedUnits(selected.units || []).map(x => x.name),
      ...(selected.items || []).map(canonicalItem),
    ];
    const routeAssets = [
      ...(t.earlyUnits || []),
      ...(t.midUnits || []),
      ...profileItems(t).flatMap(x => [x.name, ...(x.components || [])]),
    ];
    const assets = uniq((selectedAssets.length ? selectedAssets : routeAssets).filter(a => routeText(t).includes(a))).slice(0, 8);
    if (!assets.length) return 0;
    const raw = assets.map(asset => all.filter(other => routeText(other).includes(asset)).length / all.length);
    return clamp(raw.reduce((sum, x) => sum + x, 0) / raw.length, 0, 1);
  }

  function hasEconomySignal(selected) {
    const augments = new Set([...(selected.augments || []), ...(selected.augmentCats || [])].map(String));
    if (augments.has("经济")) return true;
    return ECONOMY_AUGMENTS.some(name => augments.has(name));
  }

  function economyActionLine(selected) {
    if (!hasEconomySignal(selected)) return "";
    const level = clamp(Number(selected.level) || DEFAULT_LEVEL, MIN_LEVEL, MAX_LEVEL);
    if (level >= 8) return "经济符文已兑现：8级后再按核心质量D牌";
    const augments = new Set([...(selected.augments || []), ...(selected.augmentCats || [])].map(String));
    const levelEcon = ["高端购物", "升级咯！", "升级咯", "对冲基金", "利滚利", "利滚利加强版"].some(name => augments.has(name));
    const target = levelEcon ? 8 : (level < 7 ? 7 : 8);
    return `经济符文：先拉${target}再D，不在${level}级追终局缺口`;
  }

  function antiFragileStatus(ready, bottleneckRatio, blocked) {
    if (blocked) return "red";
    if (ready < ANTIFRAGILE_READY_YELLOW || bottleneckRatio >= ANTIFRAGILE_BOTTLENECK_RED) return "red";
    if (ready < ANTIFRAGILE_READY_GREEN || bottleneckRatio >= ANTIFRAGILE_BOTTLENECK_YELLOW) return "yellow";
    return "green";
  }

  function antiFragileLabel(status) {
    if (status === "green") return "绿灯：可以定线";
    if (status === "yellow") return "黄灯：观察验证";
    return "红灯：陷阱别硬玩";
  }

  function analyzeAntiFragility(t, selected, stageResult, opts, weights, templates) {
    const w = { ...fallbackWeights, ...(weights || {}) };
    const core = coreComponentRows(t, selected, opts || {}, w);
    const total = core.reduce((sum, x) => sum + x.weight, 0) || 1;
    const owned = core.reduce((sum, x) => sum + x.weight * x.readiness, 0);
    const ready = clamp(owned / total, 0, 1);
    const missingRows = core.filter(x => x.readiness < 0.95).sort((a, b) => b.coreIndex - a.coreIndex);
    const bottleneck = missingRows[0] || null;
    const bottleneckRatio = bottleneck ? bottleneck.coreIndex / total : 0;
    const worstLossRatio = missingRows.length ? Math.max(...missingRows.map(x => x.weight * (1 - x.readiness) / total)) : 0;
    const option = routeOptionValue(t, selected, templates);
    const bottleneckPenalty = Math.round(Math.min(80, bottleneckRatio * ANTIFRAGILE_BOTTLENECK_PENALTY));
    const cvarPenalty = Math.round(worstLossRatio * ANTIFRAGILE_CVAR_PENALTY);
    const lowProbBlocked = !!(bottleneck && bottleneck.need > 0 && Number(bottleneck.probability) <= ANTIFRAGILE_UNREACHABLE_PROB);
    const hugeGoldBlocked = !!(bottleneck && bottleneck.need > 0 && Number(bottleneck.expectedGold) >= ANTIFRAGILE_HUGE_GOLD);
    const mechanicBlocked = !!stageResult.mechanicBlocked;
    const blocked = lowProbBlocked || hugeGoldBlocked || mechanicBlocked;
    const blockPenalty = (lowProbBlocked ? ANTIFRAGILE_UNREACHABLE_PENALTY : 0) + (hugeGoldBlocked ? ANTIFRAGILE_HUGE_GOLD_PENALTY : 0);
    const status = antiFragileStatus(ready, bottleneckRatio, blocked);
    const optionBonus = Math.round(option * ANTIFRAGILE_OPTION_BONUS);
    const readyBonus = Math.round(ready * ANTIFRAGILE_READY_BONUS);
    const hardPenalty = ready < ANTIFRAGILE_READY_YELLOW ? ANTIFRAGILE_HARD_GATE_PENALTY : ready < ANTIFRAGILE_READY_GREEN ? Math.round(ANTIFRAGILE_HARD_GATE_PENALTY / 2) : 0;
    const statusPenalty = status === "red" ? ANTIFRAGILE_RED_STATUS_PENALTY : 0;
    const score = Math.max(0, Math.round(stageResult.stageStrength - bottleneckPenalty - cvarPenalty - hardPenalty - blockPenalty - statusPenalty + optionBonus + readyBonus));
    const goldText = bottleneck && Number(bottleneck.expectedGold) > 0 ? `，约${Math.round(bottleneck.expectedGold)}金` : "";
    const bottleneckText = bottleneck ? `${bottleneck.label}（核心度${Math.round(bottleneck.coreIndex)}，可达${Math.round((bottleneck.probability || 0) * 100)}%${goldText}）` : "核心组件已基本到位";
    const formula = `抗脆弱=${stageResult.stageStrength}-瓶颈${bottleneckPenalty}-下限${cvarPenalty}-硬门槛${hardPenalty}-不可达${blockPenalty}-红灯${statusPenalty}+期权${optionBonus}+准备${readyBonus}=${score}`;
    return {
      score,
      ready,
      readyPct: Math.round(ready * 100),
      status,
      label: antiFragileLabel(status),
      bottleneck,
      bottleneckText,
      bottleneckPenalty,
      cvarPenalty,
      hardPenalty,
      statusPenalty,
      blockPenalty,
      blocked,
      lowProbBlocked,
      hugeGoldBlocked,
      option,
      optionBonus,
      readyBonus,
      formula,
      core: core.sort((a, b) => b.coreIndex - a.coreIndex).slice(0, 6),
      missing: missingRows.slice(0, 4).map(x => x.label),
    };
  }

  function routeDirection(t) {
    if (t.role === "普攻") return "物理";
    if (t.role === "法系") return "法系";
    const items = carryCoreItems(t).slice(0, 3);
    const physical = items.filter(x => ["鬼索的狂暴之刃", "疾射火炮", "卢安娜的飓风", "最后的轻语", "锐利之刃", "无尽之刃", "泰坦的坚决", "汲取剑"].includes(x)).length;
    const magic = items.filter(x => ["蓝霸符", "珠光护手", "班克斯的魔法帽", "斯塔缇克电刃", "朔极之矛"].includes(x)).length;
    if (physical > magic) return "物理";
    if (magic > physical) return "法系";
    return null;
  }

  function scoreTemplate(t, selected, weights, opts) {
    const unitRows = normalizeSelectedUnits(selected.units || []);
    const units = new Set(unitRows.map(x => x.name));
    const unitStars = new Map(unitRows.map(x => [x.name, x.star || 0]));
    const items = new Set(selected.items || []);
    const augments = new Set(selected.augments || []);
    const augCats = new Set(selected.augmentCats || []);
    const traits = normalizeSelectedTraits(selected.traits || []);
    const w = { ...fallbackWeights, ...(weights || {}) };
    const base = t.quality === "S" ? w.baseS : t.quality === "A" ? w.baseA : w.baseB;
    const strengthPrior = Math.round((Number(t.strengthPrior) || 0) * (Number(w.versionStrength) || 0));
    let score = base + strengthPrior;
    let heldValue = base;
    let futureValue = 0;
    let mechanicBlocked = false;
    const breakdown = { base, hero: 0, item: 0, augment: 0, synergy: 0, future: 0, penalty: 0 };
    if (traits.length) {
      breakdown.trait = 0;
      breakdown.traitSignals = traits.length;
    }
    const evidence = [], missing = [], penalties = [];
    const p = profile(t);
    const unitMap = profileUnitMap(t);
    const roleItems = profileItems(t);
    const activeTraits = activeTraitMap(t);
    const selectedCompleted = [...items].map(canonicalItem).filter(x => !COMPONENTS.includes(x));
    const selectedComponents = selectedComponentList(items);
    const mainCarryName = p.mainCarry && p.mainCarry.name;
    if (strengthPrior) evidence.push(`版本数值先验 ${strengthPrior > 0 ? "+" : ""}${strengthPrior}`);

    unitRows.forEach(row => {
      const u = row.name;
      const star = row.star || 0;
      const mult = STAR_SCORE_MULTIPLIERS[star] || 1;
      const routeUnit = unitMap.get(u);
      if (routeUnit) {
        const role = routeUnit.role || (u === mainCarryName ? "mainCarry" : "utility");
        const pts = Math.round(roleUnitWeight(role, w) * (star > 1 ? mult : 1));
        score += pts;
        heldValue += pts;
        breakdown.hero += pts;
        if (role === "mainCarry") {
          evidence.push(`${roleLabel(role)}本体在手：${u}${star ? `（${star}星）` : ""}`);
        } else {
          evidence.push(`${u}${star ? `（${star}星）` : ""}=成型${roleLabel(role)}在手`);
        }
      } else {
        const overlap = unitTraits(u, opts, unitMap).filter(name => activeTraits.has(name));
        if (overlap.length) {
          const pts = w.traitAffinity;
          score += pts;
          heldValue += pts;
          breakdown.synergy += pts;
          const trait = overlap[0];
          const need = activeTraits.get(trait);
          evidence.push(`${u}=${trait}，可作${need}${trait}填充`);
        }
      }
      if (star >= 3 && routeUnit && routeUnit.role === "mainCarry") {
        score += STAR_MILESTONE_BONUS;
        heldValue += STAR_MILESTONE_BONUS;
        breakdown.synergy += STAR_MILESTONE_BONUS;
        evidence.push(`三星${u}=追三完成`);
      }
    });

    selectedCompleted.forEach(it => {
      const hits = roleItems.filter(x => x.name === it);
      if (!hits.length) return;
      const best = hits.sort((a, b) => roleItemWeight(b.role, w) - roleItemWeight(a.role, w))[0];
      const pts = roleItemWeight(best.role, w);
      score += pts;
      heldValue += pts;
      breakdown.item += pts;
      evidence.push(`${it}=命中${roleLabel(best.role)}装备（${best.holder || "路线"}）`);
    });

    bestCrafts(t, items, w).forEach(row => {
      const owned = selectedCompleted.includes(row.item.name);
      if (owned) return;
      score += row.pts;
      heldValue += row.pts;
      breakdown.item += row.pts;
      evidence.push(row.evidence);
    });

    if (opts && opts.oddsData) {
      const future = futureDemandValue(t, selected, opts, w);
      futureValue = future.value;
      score += futureValue;
      breakdown.future += futureValue;
      future.evidence.forEach(x => evidence.push(x));
      future.lateTargets.forEach(x => missing.push(`后期目标：${x}`));
      future.missing.forEach(x => missing.push(`缺${x.name}${x.need}张约${Math.round(x.expectedGold)}金`));
      const missingItems = roleItems.filter(x => !selectedCompleted.includes(x.name) && !bestCrafts(t, items, w).some(c => c.item.name === x.name));
      if (missingItems.length) missing.push(`关键装：${uniq(missingItems.slice(0, 3).map(x => x.name)).join("、")}`);
    } else {
      const missingUnits = (p.units || []).filter(x => !units.has(x.name)).slice(0, 4).map(x => x.name);
      if (missingUnits.length) missing.push(`后续关键牌：${missingUnits.join("、")}`);
    }

    if (selectedComponents.length >= 2) {
      const direction = componentDirection(items);
      const tDirection = routeDirection(t);
      if (direction && tDirection === direction) {
        const bonus = Math.max(1, Math.round((heldValue + futureValue) * COMPONENT_DIRECTION_BONUS));
        score += bonus;
        heldValue += bonus;
        breakdown.synergy += bonus;
        const label = /源计划|枪手/.test(`${t.name}${t.family}`) ? "源计划/枪手系" : (t.family || t.name);
        evidence.unshift(`散件方向：${direction}→${label}`);
      }
    }

    augments.forEach(h => {
      if ((t.augmentPrefs || []).includes(h)) {
        score += w.augment; heldValue += w.augment; breakdown.augment += w.augment; evidence.push(`${h} 命中推荐符文`);
      }
    });
    augCats.forEach(c => {
      if ((t.augmentCats || []).includes(c)) {
        score += w.augmentSignal; heldValue += w.augmentSignal; breakdown.augment += w.augmentSignal; evidence.push(`${c}符文匹配路线`);
      }
    });

    if (t.mechanic) {
      const requiredAugment = t.mechanic.requiredAugment;
      const requiredUnits = t.mechanic.requiredUnits || [];
      const active = (!requiredAugment || augments.has(requiredAugment)) && requiredUnits.every(name => units.has(name));
      if (active) {
        const bonus = Number(t.mechanic.matchBonus) || 0;
        score += bonus;
        heldValue += bonus;
        breakdown.synergy += bonus;
        evidence.unshift(`机制闭环：${t.mechanic.text}`);
      } else {
        mechanicBlocked = true;
        const penalty = Number(t.mechanic.missingPenalty) || 0;
        score -= penalty;
        breakdown.penalty -= penalty;
        penalties.push(`缺机制门槛：${requiredAugment || requiredUnits.join("、")}`);
      }
    }

    if (traits.length) {
      traits.forEach(sig => {
        const have = activeTraits.get(sig.name) || 0;
        if (have >= sig.count) {
          const pts = w.trait || fallbackWeights.trait;
          score += pts;
          heldValue += pts;
          breakdown.trait += pts;
          evidence.push(`${sig.count}${sig.name} 命中激活羁绊`);
        } else {
          missing.push(`路线未激活${sig.count}${sig.name}`);
        }
      });
    }

    const primeRule = primePlanRule(t, selected);
    if (primeRule) {
      score += PRIME_PLAN_MATCH_BONUS;
      heldValue += PRIME_PLAN_MATCH_BONUS;
      breakdown.synergy += PRIME_PLAN_MATCH_BONUS;
      evidence.push(`至尊计划：${primeRule.text || primeRule.holder}`);
    }

    if (!items.size) missing.push("还没选择装备，路线暂按来牌判断");
    if (!augments.size && !augCats.size) missing.push("还没选择符文，符文权重未生效");

    const signalTotal = breakdown.hero + breakdown.item + breakdown.augment + breakdown.synergy + breakdown.future + (breakdown.trait || 0);
    const shares = signalTotal > 0 ? {
      hero: Math.round(breakdown.hero / signalTotal * 100),
      item: Math.round(breakdown.item / signalTotal * 100),
      augment: Math.round(breakdown.augment / signalTotal * 100),
      synergy: Math.round(breakdown.synergy / signalTotal * 100),
      future: Math.round(breakdown.future / signalTotal * 100),
    } : { hero: 0, item: 0, augment: 0, synergy: 0 };
    if (traits.length) shares.trait = signalTotal > 0 ? Math.round((breakdown.trait || 0) / signalTotal * 100) : 0;

    return {
      stageStrength: mechanicBlocked ? 0 : Math.max(0, Math.round(score)),
      heldValue: Math.max(0, Math.round(heldValue)),
      futureValue: Math.max(0, Math.round(futureValue)),
      breakdown,
      shares,
      evidence: uniq(evidence).slice(0, 6),
      missing: uniq(missing).slice(0, 4),
      penalties: uniq(penalties).slice(0, 4),
      mechanicBlocked,
    };
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function unitPrice(name, opts) {
    const map = opts && opts.unitPrices;
    return Number(map && map[name]) || 3;
  }

  function ownedCopyMap(selected) {
    const map = new Map();
    normalizeSelectedUnits(selected.units || []).forEach(u => map.set(u.name, unitCopies(u.star)));
    return map;
  }

  function reachabilityUnits(t) {
    return uniq((profile(t).units || []).map(x => x.name)).filter(Boolean);
  }

  function targetCopiesFor(t, name, cost) {
    const row = (profile(t).units || []).find(x => x && x.name === name);
    const starTarget = row && Number(row.starTarget) || (name === (profile(t).mainCarry || {}).name ? (cost <= 3 ? 3 : 2) : 1);
    if (starTarget >= 3) return 9;
    if (starTarget === 2) return 3;
    return 1;
  }

  function expectedCostForUnit(name, targetCopies, selected, opts) {
    const level = clamp(Number(selected.level) || DEFAULT_LEVEL, MIN_LEVEL, MAX_LEVEL);
    const oddsData = opts && opts.oddsData || {};
    const shopOdds = oddsData.shopOdds || {};
    const unitCounts = oddsData.unitCounts || {};
    const poolCopies = oddsData.poolCopies || {};
    const cost = unitPrice(name, opts);
    const owned = ownedCopyMap(selected).get(name) || 0;
    const need = Math.max(0, targetCopies - owned);
    const odds = ((shopOdds[level] || [0, 0, 0, 0, 0])[cost - 1] || 0) / 100;
    if (need <= 0 || odds <= 0) {
      return {
        name,
        cost,
        owned,
        need,
        targetCopies,
        oddsPct: Math.round(odds * 100),
        expectedGold: 0,
        available: odds > 0,
      };
    }
    const count = Number(unitCounts[cost]) || 1;
    const pool = Number(poolCopies[cost]) || 1;
    const remainingFactor = clamp((pool - owned) / pool, 0.05, 1);
    const pSlot = odds / count * remainingFactor;
    const expectedGold = (need / (5 * pSlot)) * 2;
    return {
      name,
      cost,
      owned,
      need,
      targetCopies,
      oddsPct: Math.round(odds * 100),
      expectedGold,
      available: true,
    };
  }

  function futureUnitBaseValue(t, unit, w) {
    if (!unit) return w.futureCoreUnit;
    if (unit.role === "mainCarry") return w.futureMainCarryUnit;
    return w.futureCoreUnit;
  }

  function discountedValue(baseValue, expectedGold) {
    return Math.round(baseValue * clamp(1 - expectedGold / FUTURE_VALUE_GOLD_CAP, 0, 1));
  }

  function futureDemandValue(t, selected, opts, w) {
    const selectedUnitNames = new Set(normalizeSelectedUnits(selected.units || []).map(x => x.name));
    const selectedItems = new Set((selected.items || []).map(canonicalItem));
    const p = profile(t);
    const rows = [];
    const lateTargets = [];
    const evidence = [];
    let value = 0;
    (p.units || []).forEach(unit => {
      if (!unit || !unit.name || selectedUnitNames.has(unit.name)) return;
      const cost = unitPrice(unit.name, opts);
      const target = targetCopiesFor(t, unit.name, cost);
      const row = expectedCostForUnit(unit.name, target, selected, opts);
      if (row.need <= 0) return;
      if (!row.available) {
        lateTargets.push(unit.name);
        return;
      }
      const base = futureUnitBaseValue(t, unit, w);
      const pts = discountedValue(base, row.expectedGold);
      if (pts > 0) {
        value += pts;
        evidence.push(`未持有${roleLabel(unit.role)}${unit.name}折现+${pts}（约${Math.round(row.expectedGold)}金）`);
      }
      rows.push(row);
    });
    const missingCoreItems = profileItems(t).filter(item => item.role === "mainCarry" && !selectedItems.has(item.name));
    const itemValue = Math.round(Math.min(3, uniq(missingCoreItems.map(x => x.name)).length) * w.futureItem * FUTURE_ITEM_VALUE_RATIO);
    if (itemValue > 0) {
      value += itemValue;
      evidence.push(`未持有主C关键装折现+${itemValue}`);
    }
    return {
      value,
      missing: rows,
      lateTargets: uniq(lateTargets),
      evidence,
    };
  }

  function reachabilityForTemplate(t, selected, opts) {
    if (!opts || !opts.oddsData) return null;
    const level = clamp(Number(selected.level) || DEFAULT_LEVEL, MIN_LEVEL, MAX_LEVEL);
    const rawTargets = reachabilityUnits(t).map(name => {
      const cost = unitPrice(name, opts);
      return expectedCostForUnit(name, targetCopiesFor(t, name, cost), selected, opts);
    });
    const targets = rawTargets.filter(x => x.need > 0 && x.available);
    const lateTargets = rawTargets.filter(x => x.need > 0 && !x.available).map(x => x.name);
    const expectedGold = targets.reduce((sum, x) => sum + x.expectedGold, 0);
    const summary = targets.length
      ? targets.map(x => `缺${x.name}${x.need}张约${Math.round(x.expectedGold)}金`).join("、") + `；合计约${Math.round(expectedGold)}金`
      : "当前可刷缺口已见，约0金";
    return {
      level,
      missing: targets,
      lateTargets: uniq(lateTargets),
      expectedGold: Math.round(expectedGold),
      coefficient: 1,
      summary,
    };
  }

  function teamSearchScore(t) {
    if (Number.isFinite(Number(t.teamScore))) return Number(t.teamScore);
    if (Number.isFinite(Number(t.sortID))) return Number(t.sortID);
    const q = t.quality === "S" ? 300 : t.quality === "A" ? 200 : 100;
    return q + (t.source === "research" ? 20 : 0) + ((t.coreUnits || []).length || 0);
  }

  function rowId(row) {
    return row && row.template && (row.template.id || row.template.name);
  }

  function rowSortScore(row) {
    return Number.isFinite(Number(row.finalScore)) ? Number(row.finalScore) : Number(row.stageStrength);
  }

  function applyCertification(rows, opts) {
    if (opts && opts.certification === false) return rows;
    rows.forEach(row => {
      const cert = row.template && row.template.certification;
      if (!cert || row.mechanicBlocked) return;
      const prior = clamp(Number(cert.priorPoints) || 0, -CERTIFICATION_PRIOR_LIMIT, CERTIFICATION_PRIOR_LIMIT);
      row.preCertificationScore = row.finalScore;
      row.samplePrior = prior;
      row.finalScore = Math.max(0, Math.round(row.finalScore + prior));
      row.certification = cert;
      row.evidence = uniq([`样本先验${prior >= 0 ? "+" : ""}${prior}（${cert.sampleSize}次，稳健${cert.metrics?.robustness || 0}%）`, ...(row.evidence || [])]).slice(0, 6);
    });
    const eligible = rows.filter(row => row.finalScore > 0);
    if (!eligible.length) return rows;
    const maxScore = Math.max(...eligible.map(row => row.finalScore));
    const weighted = eligible.map(row => {
      const robustness = Number(row.certification && row.certification.metrics && row.certification.metrics.robustness) || 50;
      const priorWeight = 0.75 + robustness / 100 * 0.25;
      return { row, weight: Math.exp((row.finalScore - maxScore) / CERTIFICATION_SOFTMAX_TEMPERATURE) * priorWeight };
    });
    const total = weighted.reduce((sum, x) => sum + x.weight, 0) || 1;
    weighted.forEach(({ row, weight }) => {
      const cert = row.certification;
      row.sampleDecision = {
        sampleSize: cert ? cert.sampleSize : 0,
        evidenceLevel: cert ? cert.evidenceLevel : "未认证",
        robustness: cert && cert.metrics ? cert.metrics.robustness : 0,
        interval95: cert && cert.metrics ? cert.metrics.interval95 : [],
        cvar10: cert && cert.metrics ? cert.metrics.cvar10 : 0,
        failureRate: cert && cert.metrics ? cert.metrics.failureRate : 0,
        priorPoints: row.samplePrior || 0,
        decisionShare: Math.round(weight / total * 1000) / 10,
        drivers: cert ? cert.drivers || [] : [],
        dependencies: cert ? cert.dependencies || [] : [],
        warning: cert ? cert.warning : "没有认证样本",
      };
    });
    return rows;
  }

  function stickyThreshold(current) {
    return Math.max(STICKY_MIN_LEAD, Math.ceil(rowSortScore(current) * STICKY_RELATIVE_LEAD));
  }

  function applySticky(rows, opts) {
    if (!opts || !opts.stickyTopId || !rows.length) return rows;
    const currentId = opts.stickyTopId;
    const challenger = rows[0];
    if (rowId(challenger) === currentId) {
      challenger.following = true;
      challenger.sticky = { state: "current", text: "当前跟随路线仍是最高分" };
      return rows;
    }
    const currentIndex = rows.findIndex(r => rowId(r) === currentId);
    if (currentIndex < 0) return rows;
    const current = rows[currentIndex];
    if (currentIndex > 2) {
      challenger.sticky = {
        state: "dropped",
        previous: current.template.name,
        text: `${current.template.name}跌出前3，立即让位`,
      };
      return rows;
    }
    const gap = rowSortScore(challenger) - rowSortScore(current);
    const threshold = stickyThreshold(current);
    if (gap < threshold) {
      current.following = true;
      challenger.followAdvice = `建议继续跟 ${current.template.name}（挑战者领先不足）`;
      current.sticky = {
        state: "held",
        challenger: challenger.template.name,
        gap,
        threshold,
        text: `${challenger.template.name}领先${gap}分，未到${threshold}分阈值，继续跟随`,
      };
    } else {
      challenger.sticky = {
        state: "switched",
        previous: current.template.name,
        gap,
        threshold,
        text: `${challenger.template.name}领先${gap}分，达到${threshold}分阈值，允许易主`,
      };
    }
    return rows;
  }

  function rank(templates, selected, weights, limit, opts) {
    const rows = (templates || []).map(t => {
      const stageResult = scoreTemplate(t, selected, weights, opts);
      const base = { template: t, ...stageResult };
      base.finalScore = base.stageStrength;
      const reachability = reachabilityForTemplate(t, selected, opts);
      if (reachability) {
        base.reachability = reachability;
        base.finalScore = base.stageStrength;
      }
      if (opts && opts.antiFragile) {
        base.antiFragile = analyzeAntiFragility(t, selected, stageResult, opts, weights, templates || []);
        base.finalScore = base.antiFragile.score;
      }
      return base;
    });
    applyCertification(rows, opts);
    if (!opts) return rows.sort((a, b) => rowSortScore(b) - rowSortScore(a)).slice(0, limit || 5);
    const previousRank = new Map((opts.previousOrder || []).map((id, i) => [id, i]));
    rows.sort((a, b) => {
      const delta = rowSortScore(b) - rowSortScore(a);
      if (delta) return delta;
      const pa = previousRank.has(rowId(a)) ? previousRank.get(rowId(a)) : 9999;
      const pb = previousRank.has(rowId(b)) ? previousRank.get(rowId(b)) : 9999;
      if (pa !== pb) return pa - pb;
      const teamDelta = teamSearchScore(b.template) - teamSearchScore(a.template);
      if (teamDelta) return teamDelta;
      return String(a.template.name).localeCompare(String(b.template.name), "zh-Hans-CN");
    });
    applySticky(rows, opts);
    return rows.slice(0, limit || 5);
  }

  function confidence(score) {
    if (score >= 85) return "高";
    if (score >= 60) return "中高";
    if (score >= 40) return "中";
    return "低";
  }

  function buildOutput(ranked, selected) {
    if (!ranked || !ranked.length) return "输入棋子、装备、符文后，这里会输出可复制的路线结论。";
    const signals = [
      ...normalizeSelectedUnits(selected.units || []).map(x => starLabel(x.name, x.star)),
      ...(selected.items || []),
      ...(selected.augmentCats || []),
      ...(selected.augments || []),
      ...(selected.traits || []).map(x => x.label || `${x.count}${x.name}`),
      selected.level ? `等级${selected.level}` : "",
    ].filter(Boolean).join("、") || "无";
    const top = ranked[0];
    const t = top.template;
    const topScore = rowSortScore(top);
    const backups = ranked.slice(1, 4).map(r => `${r.template.name}(${rowSortScore(r)}分)`).join(" / ") || "无";
    return [
      `信号：${signals}`,
      `首选：${t.name}（${topScore}分，现场匹配${confidence(topScore)}）`,
      `权重：英雄${top.shares?.hero || 0}% / 装备${top.shares?.item || 0}% / 符文${top.shares?.augment || 0}%${top.breakdown?.traitSignals ? ` / 羁绊${top.shares?.trait || 0}%` : ""}`,
      `拆分：已握资产${top.heldValue || 0}分 + 概率折现${top.futureValue || 0}分 = ${top.finalScore}分`,
      top.sampleDecision ? `样本：${top.sampleDecision.evidenceLevel}，${top.sampleDecision.sampleSize}次，稳健${top.sampleDecision.robustness}%，决策支持${top.sampleDecision.decisionShare}%` : "",
      `路线：${(t.route || []).join(" -> ")}`,
      `留牌：${(t.actions.keep || []).slice(0, 8).join("、")}`,
      `装备：${t.actions.item || "-"}`,
      `判断：${t.actions.checkpoint || "-"}`,
      `止损：${t.actions.stopLoss || "-"}`,
      `备选：${backups}`,
    ].filter(Boolean).join("\n");
  }

  function signalTowerHtml(r) {
    const s = r.shares || {};
    const b = r.breakdown || {};
    const rows = [
      ["hero", "英雄", s.hero || 0, b.hero || 0],
      ["item", "装备", s.item || 0, b.item || 0],
      ["aug", "符文", s.augment || 0, b.augment || 0],
    ];
    if (b.future) rows.push(["future", "折现", s.future || 0, b.future || 0]);
    if (b.traitSignals) rows.push(["trait", "羁绊", s.trait || 0, b.trait || 0]);
    return `<div class="s2SignalTower">${rows.map(([cls, label, pct, pts]) => `
      <div class="s2Signal ${cls}">
        <div class="lb"><span>${label}</span><span>${pct}% · ${pts}分</span></div>
        <div class="bar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>
      </div>`).join("")}</div>`;
  }

  function selectedFromSignals(signals) {
    const selected = { units: [], items: [], augments: [], augmentCats: [], traits: [], level: null };
    (signals || []).forEach(s => {
      if (!s) return;
      const kind = s.kind || s.type;
      const value = s.value || s.name || s.label;
      if (kind === "levels") {
        selected.level = Number(s.level || value) || selected.level;
        return;
      }
      if (kind === "traits") {
        const parsed = normalizeSelectedTraits([s])[0];
        if (parsed && !selected.traits.some(x => x.name === parsed.name && x.count === parsed.count)) selected.traits.push(parsed);
        return;
      }
      if (kind === "units" && value) {
        const prev = selected.units.find(x => x.name === value || x.value === value);
        const star = Number(s.star) || 0;
        if (prev) {
          if (star > (Number(prev.star) || 0)) {
            prev.star = star;
            prev.label = starLabel(value, star);
          }
        } else {
          selected.units.push(star ? { name: value, value, star, label: starLabel(value, star) } : value);
        }
        return;
      }
      if (selected[kind] && value && !selected[kind].includes(value)) selected[kind].push(value);
    });
    return selected;
  }

  function selectedUnitMap(selected) {
    const map = new Map();
    normalizeSelectedUnits(selected.units || []).forEach(row => {
      map.set(row.name, row.star || 0);
    });
    return map;
  }

  function primeConditionMet(when, selected) {
    if (!when) return true;
    const units = selectedUnitMap(selected);
    const level = Number(selected.level) || DEFAULT_LEVEL;
    if (Number(when.levelGte) && level < Number(when.levelGte)) return false;
    if (Number(when.levelLte) && level > Number(when.levelLte)) return false;
    if ((when.hasUnits || []).some(name => !units.has(name))) return false;
    const unitStars = when.unitStars || {};
    for (const [name, star] of Object.entries(unitStars)) {
      const have = units.has(name) ? (units.get(name) || 1) : 0;
      if (have < Number(star)) return false;
    }
    return true;
  }

  function primePlanRule(template, selected) {
    const plan = template && template.primePlan;
    if (!plan || !Array.isArray(plan.rules)) return null;
    return plan.rules
      .filter(rule => primeConditionMet(rule.when, selected))
      .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))[0] || null;
  }

  function compactPrimeEvidence(text) {
    const raw = String(text || "");
    if (!raw) return "模型实验";
    if (/裸转/.test(raw)) return "模型：三件套上限更高，裸青龙刀不够";
    return "模型：" + raw.split(/[；;]/)[0].replace(/\s+/g, "");
  }

  function primeActionLine(template, selected) {
    const rule = primePlanRule(template, selected);
    if (!rule) return "";
    return `至尊：${rule.text || `给${rule.holder}`}（${compactPrimeEvidence(rule.evidence)}）`;
  }

  function actionLines(template, selected, top) {
    const lines = [];
    const selectedItems = new Set(selected.items || []);
    const selectedUnits = new Set(normalizeSelectedUnits(selected.units || []).map(x => x.name));
    const nextComponent = (template.componentPrefs || []).find(x => !selectedItems.has(x));
    const nextItem = (template.completedPrefs || []).find(x => !selectedItems.has(x));
    const earlyHits = (template.earlyUnits || []).filter(x => selectedUnits.has(x));
    const keep = (template.actions && template.actions.keep || template.earlyUnits || []).slice(0, 4);
    const primeLine = primeActionLine(template, selected);
    const econLine = economyActionLine(selected);
    const mechanic = template.mechanic;
    const mechanicActive = mechanic && (!mechanic.requiredAugment || (selected.augments || []).includes(mechanic.requiredAugment))
      && (mechanic.requiredUnits || []).every(name => selectedUnits.has(name));
    if (top && top.antiFragile) {
      const af = top.antiFragile;
      lines.push(`${af.label}，核心度${af.readyPct}%`);
      if (af.blocked) lines.push(`不可达瓶颈：${af.bottleneckText}，别为它D牌`);
      else if (af.status === "red") lines.push(`禁止硬定：先补${af.bottleneckText}`);
      else if (af.status === "yellow") lines.push(`下一验证：补${af.bottleneckText}`);
    }
    if (econLine) lines.push(econLine);
    if (primeLine) lines.push(primeLine);
    if (mechanicActive) lines.push(`机制：${mechanic.text}`);
    else if (mechanic && mechanic.requiredAugment) lines.push(`缺${mechanic.requiredAugment}，这条路线不能定`);
    if (nextComponent) lines.push(`下件优先拿${nextComponent}`);
    else if (nextItem) lines.push(`装备往${nextItem}靠`);
    if (earlyHits.length >= 2) lines.push(`围绕${earlyHits.slice(0, 3).join("、")}定线`);
    else if (keep.length) lines.push(`先留${keep.join("、")}`);
    if (top && top.reachability) {
      const miss = top.reachability.missing || [];
      if (miss.length) {
        const first = miss[0];
        const ideal = first.cost <= 1 ? 5 : first.cost === 2 ? 6 : first.cost === 3 ? 7 : first.cost === 4 ? 8 : 9;
        if (top.reachability.level < ideal && first.cost >= 4) lines.push(`主要缺${first.cost}费核心，建议先拉${ideal}再D`);
        else lines.push(`${top.reachability.level}级${first.cost}费${first.oddsPct}%，适合现在追${first.name}`);
      } else {
        lines.push("核心已见，先补质量和关键装备");
      }
    }
    const core = (template.coreUnits || []).filter(x => !selectedUnits.has(x)).slice(0, 3);
    if (core.length) lines.push(`后续找${core.join("、")}`);
    if (top && top.penalties && top.penalties.length) lines.push(top.penalties[0]);
    return uniq(lines).slice(0, 3);
  }

  function assert(cond, msg) {
    if (!cond) throw new Error(msg);
  }

  function assertNoBadNumbers(text, msg) {
    assert(!/(999|Infinity|NaN)/.test(String(text)), msg || "不应出现999/Infinity/NaN");
  }

  function runTests() {
    const odds = {
      shopOdds: { 1: [100, 0, 0, 0, 0], 2: [100, 0, 0, 0, 0], 3: [75, 25, 0, 0, 0], 6: [25, 40, 30, 5, 0], 8: [18, 25, 32, 22, 3] },
      unitCounts: { 1: 10, 2: 10, 3: 10, 4: 10, 5: 10 },
      poolCopies: { 1: 29, 2: 22, 3: 18, 4: 12, 5: 10 },
    };
    const unitPrices = { A: 1, B: 2, C: 3, D: 4 };
    const fullCore = [{
      id: "full",
      name: "全集core",
      quality: "S",
      coreUnits: ["A", "B", "C"],
      earlyUnits: [],
      midUnits: ["B", "C"],
      actions: {},
      routeProfile: {
        mainCarry: { name: "A", starTarget: 3, items: [] },
        units: [
          { name: "A", role: "mainCarry", starTarget: 3, traits: [] },
          { name: "B", role: "frontline", starTarget: 1, traits: [] },
          { name: "C", role: "utility", starTarget: 1, traits: [] },
        ],
        items: [],
        activeTraits: [],
      },
    }];
    const selected = selectedFromSignals([{ kind: "units", value: "A", star: 3 }]);
    selected.level = 8;
    const full = rank(fullCore, selected, fallbackWeights, 1, { oddsData: odds, unitPrices })[0];
    assert(Object.prototype.hasOwnProperty.call(full, "stageStrength"), "rank行应包含stageStrength");
    assert(Object.prototype.hasOwnProperty.call(full, "finalScore"), "rank行应包含finalScore");
    assert(!Object.prototype.hasOwnProperty.call(full, "score"), "rank行不应再包含score字段");
    assert(full.reachability.missing.length === 2, "可达性应按core全集计算缺口");
    assert(full.reachability.summary.includes("缺B1张") && full.reachability.summary.includes("缺C1张"), "缺口摘要应逐条列出core缺口");
    assertNoBadNumbers(full.reachability.summary, "缺口摘要不应有坏数字");

    const low = selectedFromSignals([]);
    low.level = 4;
    const lowTemplate = { id: "low", name: "低级", quality: "S", coreUnits: ["D"], midUnits: ["D"], earlyUnits: [], actions: {}, routeProfile: { mainCarry: { name: "D", starTarget: 2, items: [] }, units: [{ name: "D", role: "mainCarry", starTarget: 2, traits: [] }], items: [], activeTraits: [] } };
    const lowRows = rank([lowTemplate], low, fallbackWeights, 1, { oddsData: odds, unitPrices })[0];
    assert(lowRows.reachability.missing.length === 0, "0概率棋子不应进入期望成本");
    assert(lowRows.reachability.lateTargets.includes("D"), "0概率棋子应进入后期目标");
    assertNoBadNumbers(JSON.stringify(lowRows.reachability), "可达性对象不应有坏数字");
    const levelOne = selectedFromSignals([{ kind: "levels", value: "1", level: 1 }]);
    const firstCost = expectedCostForUnit("A", 1, levelOne, { oddsData: odds, unitPrices });
    assert(firstCost.oddsPct === 100 && firstCost.available, "1级应按一费100%概率计算");
    const antiTemplates = [
      { id: "stable", name: "稳定线", quality: "S", coreUnits: ["A"], earlyUnits: ["A"], midUnits: ["A"], completedPrefs: ["锐利之刃"], actions: {}, routeProfile: { mainCarry: { name: "A", starTarget: 1, items: ["锐利之刃"] }, units: [{ name: "A", role: "mainCarry", starTarget: 1, traits: [] }], items: [{ name: "锐利之刃", role: "mainCarry", holder: "A", components: ["暴风之剑", "暴风之剑"] }], activeTraits: [] } },
      { id: "trap", name: "陷阱线", quality: "S", coreUnits: ["B"], earlyUnits: ["A"], midUnits: ["B"], completedPrefs: ["蓝霸符"], actions: {}, routeProfile: { mainCarry: { name: "B", starTarget: 3, items: ["蓝霸符"] }, units: [{ name: "B", role: "mainCarry", starTarget: 3, traits: [] }], items: [{ name: "蓝霸符", role: "mainCarry", holder: "B", components: ["女神之泪", "女神之泪"] }], activeTraits: [] } },
    ];
    const antiSelected = selectedFromSignals([{ kind: "units", value: "A" }, { kind: "items", value: "暴风之剑" }, { kind: "levels", level: 4 }]);
    const defaultAntiOff = rank(antiTemplates, antiSelected, fallbackWeights, 2, { oddsData: odds, unitPrices: { A: 1, B: 3 } })[0];
    assert(!defaultAntiOff.antiFragile, "默认rank不应启用抗脆弱层");
    const antiRows = rank(antiTemplates, antiSelected, fallbackWeights, 2, { oddsData: odds, unitPrices: { A: 1, B: 3 }, antiFragile: true });
    assert(antiRows[0].antiFragile && antiRows[0].antiFragile.formula.includes("抗脆弱"), "比赛模式应返回抗脆弱诊断");
    assert(Number.isFinite(antiRows[0].finalScore), "抗脆弱分必须是有限数");
    antiRows.forEach(row => assertNoBadNumbers(`${row.antiFragile.formula} ${row.antiFragile.bottleneckText}`, "抗脆弱上屏文案不应有坏数字"));

    const primeTemplate = {
      id: "prime",
      name: "机甲测试",
      quality: "S",
      componentPrefs: [],
      completedPrefs: [],
      earlyUnits: ["德莱文"],
      midUnits: ["贾克斯"],
      coreUnits: ["蕾欧娜"],
      actions: {},
      primePlan: {
        rules: [
          { priority: 10, text: "至尊给德莱文", when: { hasUnits: ["德莱文"] }, evidence: "德莱文437 vs 贾克斯395" },
          { priority: 30, text: "至尊转贾克斯", when: { unitStars: { 贾克斯: 2 } }, evidence: "贾克斯810 > 蕾欧娜419" },
          { priority: 50, text: "至尊转蕾欧娜", when: { levelGte: 9, unitStars: { 蕾欧娜: 2 } }, evidence: "蕾欧娜1251 > 贾克斯1189；仅青龙刀不建议裸转" },
        ],
      },
    };
    assert(primeActionLine(primeTemplate, selectedFromSignals([{ kind: "units", value: "德莱文" }])).includes("德莱文"), "仅德莱文应给德莱文");
    assert(primeActionLine(primeTemplate, selectedFromSignals([{ kind: "units", value: "德莱文" }, { kind: "units", value: "贾克斯", star: 2 }])).includes("贾克斯"), "贾克斯2星应转贾克斯");
    assert(primeActionLine(primeTemplate, selectedFromSignals([{ kind: "levels", level: 9 }, { kind: "units", value: "蕾欧娜", star: 2 }])).includes("蕾欧娜"), "9级蕾欧娜2星应转蕾欧娜");

    const mechanicTemplate = {
      id: "sisters-test",
      name: "姐妹测试",
      quality: "S",
      coreUnits: ["金克丝", "蔚"],
      earlyUnits: ["金克丝", "蔚"],
      midUnits: ["金克丝", "蔚"],
      augmentPrefs: ["姐妹"],
      actions: {},
      mechanic: { requiredAugment: "姐妹", requiredUnits: ["金克丝", "蔚"], matchBonus: 28, missingPenalty: 60, text: "击杀成长" },
      routeProfile: {
        mainCarry: { name: "金克丝", starTarget: 3, items: [] },
        units: [{ name: "金克丝", role: "mainCarry", starTarget: 3, traits: [] }, { name: "蔚", role: "frontline", starTarget: 3, traits: [] }],
        items: [],
        activeTraits: [],
      },
    };
    const mechanicOff = scoreTemplate(mechanicTemplate, selectedFromSignals([{ kind: "units", value: "金克丝" }, { kind: "units", value: "蔚" }]), fallbackWeights, {});
    const mechanicOn = scoreTemplate(mechanicTemplate, selectedFromSignals([{ kind: "units", value: "金克丝" }, { kind: "units", value: "蔚" }, { kind: "augments", value: "姐妹" }]), fallbackWeights, {});
    assert(mechanicOn.stageStrength > mechanicOff.stageStrength + 80, "姐妹机制只有满足符文和双棋子时才应跃升");
    assert(mechanicOn.evidence.some(x => x.includes("机制闭环")), "姐妹命中证据应显示机制闭环");
    assert(mechanicOff.penalties.some(x => x.includes("机制门槛")), "缺姐妹时应显示机制门槛");

    const stickyTemplates = [
      { id: "old", name: "旧路线", quality: "S", coreUnits: [], earlyUnits: [], midUnits: [], completedPrefs: [], componentPrefs: [], augmentPrefs: [], augmentCats: [], actions: {}, routeProfile: { mainCarry: { name: "A", starTarget: 1, items: [] }, units: [], items: [], activeTraits: [] } },
      { id: "new", name: "新路线", quality: "S", coreUnits: [], earlyUnits: [], midUnits: [], completedPrefs: ["X"], componentPrefs: [], augmentPrefs: [], augmentCats: [], actions: {}, routeProfile: { mainCarry: { name: "A", starTarget: 1, items: [] }, units: [], items: [{ name: "X", role: "route", holder: "A", components: [] }], activeTraits: [] } },
    ];
    const baseWeights = { ...fallbackWeights, baseS: 100, routeItem: 14, augment: 0, augmentSignal: 0 };
    let held = rank(stickyTemplates, { items: ["X"], units: [], augments: [], augmentCats: [] }, baseWeights, 2, { previousOrder: ["old", "new"], stickyTopId: "old" });
    assert(rowId(held[0]) === "new", "黏性不得篡改真分排序");
    assert(held[1].following, "挑战者未达到相对阈值时，旧路线只应带跟随徽章");
    const switchWeights = { ...baseWeights, routeItem: 15 };
    let switched = rank(stickyTemplates, { items: ["X"], units: [], augments: [], augmentCats: [] }, switchWeights, 2, { previousOrder: ["old", "new"], stickyTopId: "old" });
    assert(rowId(switched[0]) === "new", "挑战者达到相对阈值时应易主");

    const dropTemplates = [
      { id: "n1", name: "新1", quality: "S", completedPrefs: ["A"], coreUnits: [], earlyUnits: [], midUnits: [], actions: {}, routeProfile: { mainCarry: { name: "A", starTarget: 1, items: [] }, units: [], items: [{ name: "A", role: "route", holder: "A", components: [] }], activeTraits: [] } },
      { id: "n2", name: "新2", quality: "S", completedPrefs: ["B"], coreUnits: [], earlyUnits: [], midUnits: [], actions: {}, routeProfile: { mainCarry: { name: "A", starTarget: 1, items: [] }, units: [], items: [{ name: "B", role: "route", holder: "A", components: [] }], activeTraits: [] } },
      { id: "n3", name: "新3", quality: "S", completedPrefs: ["C"], coreUnits: [], earlyUnits: [], midUnits: [], actions: {}, routeProfile: { mainCarry: { name: "A", starTarget: 1, items: [] }, units: [], items: [{ name: "C", role: "route", holder: "A", components: [] }], activeTraits: [] } },
      { id: "old", name: "旧", quality: "S", coreUnits: [], earlyUnits: [], midUnits: [], actions: {}, routeProfile: { mainCarry: { name: "A", starTarget: 1, items: [] }, units: [], items: [], activeTraits: [] } },
    ];
    const dropped = rank(dropTemplates, { items: ["A", "B", "C"], units: [], augments: [], augmentCats: [] }, { ...fallbackWeights, baseS: 100, routeItem: 10 }, 4, { previousOrder: ["old", "n1", "n2", "n3"], stickyTopId: "old" });
    assert(rowId(dropped[0]) !== "old", "旧#1跌出前3时应立即让位");
    assert(!dropped.some(r => r.template.id === "old" && r.following), "旧#1跌出前3不应保留跟随徽章");
    for (let i = 1; i < dropped.length; i++) {
      assert(dropped[i - 1].finalScore >= dropped[i].finalScore, "rank结果finalScore必须单调非增");
    }
    const certBase = id => ({ id, name: id, quality: "S", coreUnits: [], earlyUnits: [], midUnits: [], actions: {}, routeProfile: { mainCarry: { name: "A", starTarget: 1, items: [] }, units: [], items: [], activeTraits: [] } });
    const certHigh = { ...certBase("稳健"), certification: { sampleSize: 5000, evidenceLevel: "L2.5 模型扰动稳健", priorPoints: 5, metrics: { robustness: 92, interval95: [110, 130], cvar10: 112, failureRate: 2 }, warning: "模型样本" } };
    const certLow = { ...certBase("敏感"), certification: { sampleSize: 5000, evidenceLevel: "L1.5 高敏感假设", priorPoints: -5, metrics: { robustness: 18, interval95: [70, 120], cvar10: 74, failureRate: 42 }, warning: "模型样本" } };
    const certRows = rank([certLow, certHigh], { units: [], items: [], augments: [], augmentCats: [] }, fallbackWeights, 2, {});
    assert(rowId(certRows[0]) === "稳健" && certRows[0].finalScore - certRows[1].finalScore === 10, "认证先验应在±5分内参与排序");
    assert(certRows[0].sampleDecision && Number.isFinite(certRows[0].sampleDecision.decisionShare), "每次rank应输出动态样本决策支持度");
    assert(certRows[0].evidence.some(x => x.includes("5000次")), "认证样本应进入证据栏");
    if (typeof require === "function") {
      const path = require("path");
      const rootDir = path.resolve(__dirname, "..");
      const matcherData = require(path.join(rootDir, "stage2_matcher_results.json"));
      require(path.join(__dirname, "odds-data.js"));
      const fixtureRows = require(path.join(rootDir, "fixtures", "hands.json"));
      const fixtureUnitPrices = Object.fromEntries((matcherData.options.unitSearch || []).map(x => [x.name, x.price]));
      const fixtureUnitTraits = Object.fromEntries((matcherData.options.unitSearch || []).map(x => [x.name, x.traits || []]));
      fixtureRows.forEach(fx => {
        const selectedFx = selectedFromSignals([...(fx.signals || []), { kind: "levels", level: fx.level }]);
        const rows = rank(matcherData.templates, selectedFx, matcherData.weights, 5, {
          oddsData: globalThis.JCC_ODDS,
          unitPrices: fixtureUnitPrices,
          unitTraits: fixtureUnitTraits,
        });
        const topNames = rows.slice(0, fx.expect.topN || 1).map(r => r.template.name).join(" / ");
        const topEvidence = rows.slice(0, fx.expect.topN || 1).flatMap(r => r.evidence || []).join("；");
        if (fx.expect.top1NameIncludes) {
          fx.expect.top1NameIncludes.forEach(part => assert((rows[0].template.name || "").includes(part), `${fx.label} #1 应包含 ${part}，实际 ${rows[0].template.name}`));
        }
        if (fx.expect.top1NameIncludesAny) {
          assert(fx.expect.top1NameIncludesAny.some(part => (rows[0].template.name || "").includes(part)), `${fx.label} #1 不符合预期，实际 ${rows[0].template.name}`);
        }
        if (fx.expect.topAnyNameIncludes) {
          fx.expect.topAnyNameIncludes.forEach(part => assert(topNames.includes(part), `${fx.label} 前${fx.expect.topN || 1} 应包含 ${part}，实际 ${topNames}`));
        }
        (fx.expect.evidenceIncludes || []).forEach(part => assert(topEvidence.includes(part), `${fx.label} 证据应包含 ${part}，实际 ${topEvidence}`));
      });
      console.log(`fixture assertions passed (${fixtureRows.length})`);
    }
    console.log("matcher-core assertions passed");
  }

  const api = {
    COMPONENTS,
    ATTACK,
    AP,
    TANK,
    fallbackWeights,
    STICKY_MIN_LEAD,
    STICKY_RELATIVE_LEAD,
    MIN_LEVEL,
    MAX_LEVEL,
    COMPONENT_DIRECTION_BONUS,
    PRIME_PLAN_MATCH_BONUS,
    STAR_SCORE_MULTIPLIERS,
    STAR_MILESTONE_BONUS,
    FUTURE_VALUE_GOLD_CAP,
    FUTURE_ITEM_VALUE_RATIO,
    CERTIFICATION_PRIOR_LIMIT,
    CERTIFICATION_SOFTMAX_TEMPERATURE,
    DEFAULT_LEVEL,
    scoreTemplate,
    rank,
    confidence,
    buildOutput,
    signalTowerHtml,
    selectedFromSignals,
    actionLines,
    primeActionLine,
    activeTraitsForTemplate,
    parseTraitsInText,
    normalizeSelectedUnits,
    runTests,
    escText,
  };
  if (typeof module === "object" && module.exports && require.main === module) runTests();
  return api;
});
