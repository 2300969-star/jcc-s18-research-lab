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
  // 比赛模式的执行路线不能因一两张新牌立即翻转。等级越高、主C变化越大、阵容重合越低，
  // 挑战路线需要提供更高的领先，并且必须已有成包来牌才能真正接管经营指令。
  const OPERATIONAL_STAGE_SWITCH_COST = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 2, 6: 5, 7: 9, 8: 13, 9: 16 };
  const OPERATIONAL_CARRY_SWITCH_COST = { early: 2, mid: 7, late: 11 };
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
  // 完整事件战斗引擎是教师模型；比赛模式仅吸收其有界先验。
  // tanh让极端模拟结果不能压过现场已握棋子/装备/符文；机制覆盖率低时自动收缩到0。
  const VIRTUAL_BATTLE_PRIOR_CAP = 12;
  const VIRTUAL_BATTLE_CENTER = 50;
  const VIRTUAL_BATTLE_SCALE = 18;
  // 条件符文算子：认证边际先按证据等级折扣，再分别作用于战力、D牌成本或装备缺口。
  const AUGMENT_OPERATOR_EVIDENCE = { "L2.5": 1, "L2": 0.65, "L1.5": 0.35 };
  const AUGMENT_OPERATOR_LIFT_SCALE = 0.5;
  const AUGMENT_OPERATOR_SINGLE_CAP = 12;
  const AUGMENT_OPERATOR_TOTAL_CAP = 18;
  const AUGMENT_COMBAT_READY_FLOOR = 0.6;
  const AUGMENT_ECON_DISCOUNT_BASE = 0.05;
  const AUGMENT_ECON_DISCOUNT_PER_POINT = 0.02;
  const AUGMENT_ECON_DISCOUNT_CAP = 0.3;
  const AUGMENT_ITEM_MISSING_CAP = 3;
  const AUGMENT_ITEM_BONUS_CAP = 10;
  // 英雄强化回合只提供费用可行域；具体的1/2、2/3等同局组合仍由游戏随机决定。
  const HERO_AUGMENT_ROUND_COSTS = {
    "2-1": [1, 2, 3],
    "3-2": [2, 3, 4],
    "4-2": [3, 4, 5],
  };
  // 可出现的主C专属强化提供有限期权值；本局不可能出现时只关闭专属分支，不误杀基础阵容。
  const HERO_AUGMENT_OPTION_BONUS = 6;
  const HERO_AUGMENT_UNAVAILABLE_PENALTY = 6;
  // 已选英雄强化属于全局局面，而非某一条路线的局部标签。控制类效果采用保守代理，
  // 防止未经战斗回放校准的单个强化压过已握棋子与装备。
  const HERO_AUGMENT_CONTROL_PER_SECOND = 4;
  const HERO_AUGMENT_AREA_MULTIPLIER = 1.35;
  const HERO_AUGMENT_CONTROL_CAP = 12;
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

  function normalizeHeroAugmentRound(value) {
    const raw = String(value || "").trim().replace("阶段", "").replace("杠", "-");
    return HERO_AUGMENT_ROUND_COSTS[raw] ? raw : "unknown";
  }

  function heroAugmentDecision(t, selected) {
    const round = normalizeHeroAugmentRound(selected && selected.heroAugmentRound);
    if (round === "unknown") return null;
    const costs = HERO_AUGMENT_ROUND_COSTS[round];
    const plan = t && t.heroAugmentPlan || {};
    const options = (plan.options || []).filter(row => row && row.name && row.hero && Number(row.cost));
    const requiredNames = new Set(plan.requiredNames || []);
    const required = options.filter(row => requiredNames.has(row.name));
    const mainCarry = plan.mainCarry || (profile(t).mainCarry || {}).name || "";
    const mainOptions = options.filter(row => row.hero === mainCarry);
    const selectedAugments = new Set(selected && selected.augments || []);
    const globalHeroAugment = selected && selected.heroAugment || {};
    const selectedHit = options.find(row => selectedAugments.has(row.name));
    const candidates = required.length ? required : (mainOptions.length ? mainOptions : options);
    const eligible = candidates.filter(row => costs.includes(Number(row.cost)));
    const excludedCosts = [1, 2, 3, 4, 5].filter(cost => !costs.includes(cost));
    const traits = uniq(eligible.flatMap(row => row.traits || [])).slice(0, 3);
    const heroes = uniq(eligible.map(row => row.hero));
    const optionNames = uniq(candidates.map(row => row.name));
    const base = { round, costs, excludedCosts, mainCarry, traits, heroes, options, eligible, required: !!required.length, scoreDelta: 0, hardBlock: false };
    if (globalHeroAugment.status === "resolved") {
      const chosen = globalHeroAugment.selected || {};
      if (selectedHit) {
        return { ...base, status: "locked", text: `${round === "unknown" ? "英雄强化" : round + "英雄强化"}已结算：${selectedHit.name}→${selectedHit.hero}${selectedHit.cost}费专属` };
      }
      if (required.length) {
        return {
          ...base,
          status: "closed",
          hardBlock: true,
          text: `${round === "unknown" ? "英雄强化已结算" : round + "已结算"}：已选${chosen.name || "其他强化"}，${optionNames.join("/")}刚需分支关闭`,
        };
      }
      return {
        ...base,
        status: "resolved",
        text: `${round === "unknown" ? "英雄强化已结算" : round + "英雄强化已结算"}：已选${chosen.name || "其他强化"}，${mainCarry || "本路线"}不再保留专属期权`,
      };
    }
    if (selectedHit) {
      return { ...base, status: "locked", text: `已命中${selectedHit.name}：${selectedHit.hero}${selectedHit.cost}费专属` };
    }
    if (!options.length) {
      return { ...base, status: "lock", text: `现在可锁：不依赖英雄强化（${round}费用池${costs.join("/")}费）` };
    }
    if (required.length && !eligible.length) {
      return {
        ...base,
        status: "closed",
        hardBlock: true,
        text: `本局关闭：${optionNames.join("/")}需要${uniq(candidates.map(row => row.cost)).join("/")}费，${round}只含${costs.join("/")}费`,
      };
    }
    if (required.length) {
      return { ...base, status: "waiting", text: `等${round}强化决定：${heroes.join("/")}专属仍在费用池` };
    }
    if (mainOptions.length && !eligible.length) {
      return {
        ...base,
        status: "base-only",
        scoreDelta: -HERO_AUGMENT_UNAVAILABLE_PENALTY,
        text: `专属分支关闭：${mainCarry}${uniq(mainOptions.map(row => row.cost)).join("/")}费强化不在${round}费用池，保留基础阵容`,
      };
    }
    if (mainOptions.length) {
      return {
        ...base,
        status: "waiting",
        scoreDelta: HERO_AUGMENT_OPTION_BONUS,
        text: `等${round}强化决定：${heroes.join("/")}专属可出现，期权+${HERO_AUGMENT_OPTION_BONUS}分`,
      };
    }
    if (eligible.length) {
      return { ...base, status: "available", text: `${round}可出现支线：${heroes.join("/")}，主线不强依赖` };
    }
    return { ...base, status: "lock", text: `现在可锁：本路线不依赖${round}可用的英雄专属` };
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

  function augmentEvidenceFactor(level) {
    const key = Object.keys(AUGMENT_OPERATOR_EVIDENCE).find(x => String(level || "").startsWith(x));
    return key ? AUGMENT_OPERATOR_EVIDENCE[key] : 0;
  }

  function calibratedAugmentLift(profile) {
    const delta = Math.max(0, Number(profile && profile.conditionLift) || 0);
    return Math.min(AUGMENT_OPERATOR_SINGLE_CAP, delta * AUGMENT_OPERATOR_LIFT_SCALE) * augmentEvidenceFactor(profile && profile.evidenceLevel);
  }

  function activeAugmentOperators(t, selected) {
    const selectedAugments = new Set(selected.augments || []);
    const rows = (t.augmentOperators || []).filter(x => selectedAugments.has(x.name)).map(x => ({
      ...x,
      calibratedLift: calibratedAugmentLift(x),
    })).filter(x => x.calibratedLift > 0);
    const economyRows = rows.filter(x => x.category === "经济");
    let discount = 0;
    let shopLevelOffset = 0;
    let copyCredit = 0;
    economyRows.forEach(x => {
      if (/高端购物/.test(x.name)) shopLevelOffset = Math.max(shopLevelOffset, 1);
      else discount += AUGMENT_ECON_DISCOUNT_BASE + AUGMENT_ECON_DISCOUNT_PER_POINT * x.calibratedLift;
      if (/DD街区|明智消费|快速思考|门票/.test(x.name)) discount += 0.06;
      if (/团队建设|英勇福袋|复制器/.test(x.name)) copyCredit = Math.max(copyCredit, 1);
    });
    discount = clamp(discount, 0, AUGMENT_ECON_DISCOUNT_CAP);
    return {
      rows,
      economy: {
        active: economyRows.length > 0,
        names: economyRows.map(x => x.name),
        goldMultiplier: 1 - discount,
        discount,
        shopLevelOffset,
        copyCredit,
        copyTarget: (profile(t).mainCarry || {}).name || "",
      },
      variableBonus: 0,
      economyFutureBonus: 0,
      evidence: [],
      actions: [],
    };
  }

  function operatorOddsOpts(opts, operator) {
    if (!operator || !operator.economy || !operator.economy.active) return opts || {};
    return { ...(opts || {}), augmentEconomy: operator.economy };
  }

  function heroAugmentMechanic(t, selected, opts) {
    const state = selected.heroAugment || {};
    const chosen = state.selected;
    const effect = chosen && chosen.effect || {};
    if (state.status !== "resolved" || (!effect.stunSeconds && !effect.areaExpanded)) return null;
    const target = effect.grantedHero || chosen.hero;
    const unitMap = profileUnitMap(t);
    const routeUnit = unitMap.get(target);
    const activeTraits = activeTraitMap(t);
    const traitOverlap = (chosen.traits || []).filter(name => activeTraits.has(name)).length;
    // 有该英雄在成型阵容最适配；只共享羁绊时保留小额兼容性，不把所有路线都抬高。
    const fit = clamp((routeUnit ? 0.62 : 0.16) + Math.min(0.24, traitOverlap * 0.08), 0, 1);
    if (fit <= 0.2) return null;
    const controlSeconds = Number(effect.stunSeconds) || 0;
    const area = effect.areaExpanded ? HERO_AUGMENT_AREA_MULTIPLIER : 1;
    const raw = controlSeconds * HERO_AUGMENT_CONTROL_PER_SECOND * area * fit;
    const bonus = Math.round(Math.min(HERO_AUGMENT_CONTROL_CAP, raw));
    if (!bonus) return null;
    const role = routeUnit ? roleLabel(routeUnit.role) : "羁绊填充";
    return {
      bonus,
      fit,
      text: `${chosen.name}机制：${target}${effect.areaExpanded ? "范围扩大" : ""}${controlSeconds ? `${effect.areaExpanded ? "、" : ""}群控${controlSeconds}秒` : ""}，${role}适配+${bonus}`,
    };
  }

  function scoreTemplate(t, selected, weights, opts) {
    selected = resolveGameState(selected, opts && opts.heroAugments);
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
    const augmentOperator = activeAugmentOperators(t, selected);
    const heroMechanic = heroAugmentMechanic(t, selected, opts);
    let operatorBudget = AUGMENT_OPERATOR_TOTAL_CAP;
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
      const baselineFuture = futureDemandValue(t, selected, opts, w);
      const future = augmentOperator.economy.active
        ? futureDemandValue(t, selected, operatorOddsOpts(opts, augmentOperator), w)
        : baselineFuture;
      futureValue = future.value;
      score += futureValue;
      augmentOperator.economyFutureBonus = Math.max(0, future.value - baselineFuture.value);
      breakdown.future += Math.max(0, futureValue - augmentOperator.economyFutureBonus);
      breakdown.augment += augmentOperator.economyFutureBonus;
      future.evidence.forEach(x => evidence.push(x));
      if (augmentOperator.economy.active) {
        const econ = augmentOperator.economy;
        const optionRaw = augmentOperator.rows.filter(x => x.category === "经济").reduce((sum, x) => sum + x.calibratedLift, 0);
        const optionBonus = Math.max(0, Math.min(operatorBudget, Math.round(optionRaw)));
        operatorBudget -= optionBonus;
        if (optionBonus > 0) {
          score += optionBonus;
          heldValue += optionBonus;
          breakdown.augment += optionBonus;
          augmentOperator.variableBonus += optionBonus;
        }
        const effects = [];
        if (econ.shopLevelOffset) effects.push(`商店概率按等级+${econ.shopLevelOffset}`);
        if (econ.discount) effects.push(`D牌期望成本-${Math.round(econ.discount * 100)}%`);
        if (econ.copyCredit) effects.push(`主C缺口-${econ.copyCredit}张`);
        const line = `经济算子：${econ.names.join("+")}→${effects.join("、") || "可达性边际提升"}${optionBonus ? `，可达期权+${optionBonus}` : ""}`;
        evidence.unshift(line);
        augmentOperator.evidence.push(line);
        augmentOperator.actions.push(line);
      }
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

    if (heroMechanic) {
      score += heroMechanic.bonus;
      heldValue += heroMechanic.bonus;
      breakdown.augment += heroMechanic.bonus;
      evidence.unshift(heroMechanic.text);
    }

    augmentOperator.rows.filter(x => x.category !== "经济").forEach(op => {
      let rawBonus = 0;
      let line = "";
      if (op.category === "战力") {
        const combatAssets = breakdown.hero + breakdown.item + breakdown.synergy;
        const readiness = combatAssets / Math.max(1, combatAssets + futureValue + 30);
        rawBonus = op.calibratedLift * (AUGMENT_COMBAT_READY_FLOOR + (1 - AUGMENT_COMBAT_READY_FLOOR) * readiness);
        line = `战力算子：${op.name}→已握战力×${roundNumber(AUGMENT_COMBAT_READY_FLOOR + (1 - AUGMENT_COMBAT_READY_FLOOR) * readiness, 2)}`;
      } else if (op.category === "装备") {
        const missingMainItems = uniq(roleItems.filter(x => x.role === "mainCarry" && !selectedCompleted.includes(x.name)).map(x => x.name)).length;
        rawBonus = Math.min(AUGMENT_ITEM_BONUS_CAP, op.calibratedLift * Math.min(AUGMENT_ITEM_MISSING_CAP, missingMainItems) / AUGMENT_ITEM_MISSING_CAP);
        line = `装备算子：${op.name}→补偿${Math.min(AUGMENT_ITEM_MISSING_CAP, missingMainItems)}件主C装缺口`;
      }
      const bonus = Math.max(0, Math.min(operatorBudget, Math.round(rawBonus)));
      operatorBudget -= bonus;
      if (bonus > 0) {
        score += bonus;
        heldValue += bonus;
        breakdown.augment += bonus;
        augmentOperator.variableBonus += bonus;
        const evidenceLine = `${line}，认证边际+${bonus}`;
        evidence.unshift(evidenceLine);
        augmentOperator.evidence.push(evidenceLine);
        augmentOperator.actions.push(evidenceLine);
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

    const heroAugment = heroAugmentDecision(t, selected);
    if (heroAugment) {
      if (heroAugment.scoreDelta > 0) {
        score += heroAugment.scoreDelta;
        futureValue += heroAugment.scoreDelta;
        breakdown.future += heroAugment.scoreDelta;
        evidence.unshift(`英雄强化期权：${heroAugment.text}`);
      } else if (heroAugment.scoreDelta < 0) {
        score += heroAugment.scoreDelta;
        breakdown.penalty += heroAugment.scoreDelta;
        penalties.unshift(heroAugment.text);
      }
      if (heroAugment.hardBlock) {
        mechanicBlocked = true;
        penalties.unshift(heroAugment.text);
      }
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
      augmentOperator,
      heroAugment,
      heroMechanic,
    };
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function roundNumber(n, digits = 1) {
    const p = 10 ** digits;
    return Math.round(Number(n || 0) * p) / p;
  }

  function unitPrice(name, opts) {
    const map = opts && opts.unitPrices;
    return Number(map && map[name]) || 3;
  }

  function ownedCopyMap(selected) {
    const map = new Map();
    normalizeSelectedUnits(selected.units || []).forEach(u => map.set(u.name, unitCopies(u.star)));
    Object.entries(selected.unitCopies || {}).forEach(([name, copies]) => {
      map.set(name, Math.max(map.get(name) || 0, Number(copies) || 0));
    });
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
    const economy = opts && opts.augmentEconomy || {};
    const effectiveLevel = clamp(level + (Number(economy.shopLevelOffset) || 0), MIN_LEVEL, MAX_LEVEL);
    const oddsData = opts && opts.oddsData || {};
    const shopOdds = oddsData.shopOdds || {};
    const unitCounts = oddsData.unitCounts || {};
    const poolCopies = oddsData.poolCopies || {};
    const cost = unitPrice(name, opts);
    const owned = ownedCopyMap(selected).get(name) || 0;
    const copyCredit = economy.copyTarget === name ? Number(economy.copyCredit) || 0 : 0;
    const need = Math.max(0, targetCopies - owned - copyCredit);
    const odds = ((shopOdds[effectiveLevel] || [0, 0, 0, 0, 0])[cost - 1] || 0) / 100;
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
        effectiveLevel,
      };
    }
    const count = Number(unitCounts[cost]) || 1;
    const pool = Number(poolCopies[cost]) || 1;
    const remainingFactor = clamp((pool - owned) / pool, 0.05, 1);
    const pSlot = odds / count * remainingFactor;
    const baseExpectedGold = (need / (5 * pSlot)) * 2;
    const expectedGold = baseExpectedGold * clamp(Number(economy.goldMultiplier) || 1, 0.5, 1);
    return {
      name,
      cost,
      owned,
      need,
      targetCopies,
      oddsPct: Math.round(odds * 100),
      expectedGold,
      baseExpectedGold,
      available: true,
      effectiveLevel,
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
      if (!unit || !unit.name) return;
      const cost = unitPrice(unit.name, opts);
      const target = targetCopiesFor(t, unit.name, cost);
      const row = expectedCostForUnit(unit.name, target, selected, opts);
      if (row.need <= 0) return;
      if (!row.available) {
        lateTargets.push(unit.name);
        return;
      }
      // 已握棋子仍要进入缺口/概率计算，但不把“未来还要D到的同一张牌”再次当作强度资产加分。
      if (selectedUnitNames.has(unit.name)) {
        rows.push(row);
        return;
      }
      const base = futureUnitBaseValue(t, unit, w);
      const pts = discountedValue(base, row.expectedGold);
      if (pts > 0) {
        value += pts;
        evidence.push(`缺${roleLabel(unit.role)}${unit.name}${row.need}张折现+${pts}（约${Math.round(row.expectedGold)}金）`);
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

  function applyVirtualBattle(rows, opts) {
    if (opts && opts.virtualBattle === false) return rows;
    rows.forEach(row => {
      const battle = row.template && row.template.virtualBattle;
      if (!battle || row.mechanicBlocked) return;
      const coverage = clamp(Number(battle.coverage) || 0, 0, 100) / 100;
      const robust = clamp(Number(battle.robustScore) || VIRTUAL_BATTLE_CENTER, 0, 100);
      const raw = VIRTUAL_BATTLE_PRIOR_CAP * Math.tanh((robust - VIRTUAL_BATTLE_CENTER) / VIRTUAL_BATTLE_SCALE);
      const prior = Math.round(raw * coverage);
      row.preSimulationScore = row.finalScore;
      row.virtualBattlePrior = prior;
      row.finalScore = Math.max(0, Math.round(row.finalScore + prior));
      row.virtualBattle = battle;
      row.virtualDecision = {
        battles: Number(battle.battles) || 0,
        winRate: Number(battle.winRate) || 0,
        cvar10: Number(battle.cvar10) || 0,
        interval90: battle.interval90 || [],
        robustScore: robust,
        coverage: Math.round(coverage * 1000) / 10,
        priorPoints: prior,
        unsupported: battle.unsupported || [],
      };
      row.evidence = uniq([`虚拟实战${prior >= 0 ? "+" : ""}${prior}（${battle.battles}场，胜率${battle.winRate}%，CVaR ${battle.cvar10}，覆盖${battle.coverage}%）`, ...(row.evidence || [])]).slice(0, 6);
    });
    return rows;
  }

  function stickyThreshold(current) {
    return Math.max(STICKY_MIN_LEAD, Math.ceil(rowSortScore(current) * STICKY_RELATIVE_LEAD));
  }

  function routeMainCarry(t) {
    return (t && t.routeProfile && t.routeProfile.mainCarry && t.routeProfile.mainCarry.name)
      || (t && t.carryUnits && t.carryUnits[0])
      || "";
  }

  function routeUnitNames(t) {
    return uniq([
      ...((t && t.earlyUnits) || []),
      ...((t && t.midUnits) || []),
      ...((t && t.coreUnits) || []),
      ...(((t && t.routeProfile && t.routeProfile.units) || []).map(x => x && x.name)),
    ]);
  }

  function strategyConditionMet(when, selected) {
    if (!when) return true;
    const units = selectedUnitMap(selected || {});
    if (when.hasUnit && !units.has(when.hasUnit)) return false;
    if (when.unit) {
      const star = units.has(when.unit) ? (units.get(when.unit) || 1) : 0;
      if (!star || (Number(when.starGte) && star < Number(when.starGte))) return false;
    }
    return true;
  }

  function strategyDecisionForTemplate(template, selected) {
    const plan = template && template.augmentTransitionPlan;
    const chosen = selected && selected.heroAugment && selected.heroAugment.selected;
    if (!plan || !chosen || chosen.name !== plan.augment) return null;
    const rule = (plan.holderRules || []).find(row => strategyConditionMet(row.when, selected)) || null;
    const holder = rule && rule.holder || plan.currentHolder || plan.strategicCarry;
    const switchCertified = Boolean(rule && rule.certified && holder === plan.strategicCarry);
    const handoffState = Boolean(rule && rule.inference === "handoff");
    const inference = handoffState ? plan.handoffInference : plan.currentInference;
    const lcb = Number(inference && inference.lcb95);
    const unit = plan.handoff && plan.handoff.unit || plan.strategicCarry;
    const star = plan.handoff && plan.handoff.starGte || 2;
    return {
      augment: plan.augment,
      source: plan.source,
      experiment: plan.experiment,
      baselineCarry: plan.baselineCarry,
      strategicCarry: plan.strategicCarry,
      currentHolder: holder,
      switchCertified,
      handoffState,
      handoffCertified: Boolean(plan.handoffCertified),
      handoff: plan.handoff,
      handoffText: plan.handoffText,
      terminalText: plan.terminalText,
      totalBattles: Number(plan.totalBattles) || 0,
      sampleCount: Number(inference && inference.sampleCount) || 0,
      lcb95: Number.isFinite(lcb) ? lcb : 0,
      meanDelta: Number(inference && inference.meanDelta) || 0,
      text: switchCertified && handoffState
        ? `模型认证转${plan.strategicCarry}：${unit}${star}星优势扩大（LCB ${Number.isFinite(lcb) ? lcb : 0}）`
        : switchCertified
        ? `模型认证立即转${plan.strategicCarry}：${plan.augment}已达换核门槛（LCB ${Number.isFinite(lcb) ? lcb : 0}）`
        : `模型等交接：当前${holder}代持；${unit}${star}星后转${plan.strategicCarry}（认证LCB ${Number(plan.handoffInference && plan.handoffInference.lcb95) || 0}）`,
    };
  }

  function transitionProfile(current, challenger, selected) {
    const level = clamp(Number(selected && selected.level) || DEFAULT_LEVEL, MIN_LEVEL, MAX_LEVEL);
    const currentUnits = new Set(routeUnitNames(current && current.template));
    const challengerUnits = new Set(routeUnitNames(challenger && challenger.template));
    const held = new Set(normalizeSelectedUnits(selected && selected.units || []).map(x => x.name));
    const shared = [...challengerUnits].filter(name => currentUnits.has(name));
    const continuityBase = Math.max(1, Math.min(currentUnits.size || 1, challengerUnits.size || 1));
    const continuity = shared.length / continuityBase;
    const currentCarry = routeMainCarry(current && current.template);
    const challengerCarry = routeMainCarry(challenger && challenger.template);
    const carryChanged = Boolean(currentCarry && challengerCarry && currentCarry !== challengerCarry);
    const carryHeld = Boolean(challengerCarry && held.has(challengerCarry));
    const packageHits = [...challengerUnits].filter(name => held.has(name));
    const stage = level <= 5 ? "early" : level <= 6 ? "mid" : "late";
    const minPackageHits = level <= 5 ? 1 : level === 6 ? 2 : 3;
    let ready = challengerUnits.size === 0 || !carryChanged;
    if (carryChanged && level <= 5) ready = packageHits.length >= 1;
    else if (carryChanged && level === 6) ready = carryHeld || packageHits.length >= 3;
    else if (carryChanged) ready = carryHeld && packageHits.length >= Math.min(minPackageHits, challengerUnits.size);
    const strategyDecision = challenger && challenger.strategyDecision;
    const certifiedPivot = Boolean(strategyDecision && strategyDecision.switchCertified
      && strategyDecision.baselineCarry === currentCarry
      && strategyDecision.strategicCarry === challengerCarry);
    const anti = challenger && challenger.antiFragile;
    const antiBlocked = Boolean(anti && (anti.blocked || anti.status === "red"));
    if (antiBlocked) ready = false;
    const stageCost = Number(OPERATIONAL_STAGE_SWITCH_COST[level]) || 0;
    const carryCost = carryChanged ? OPERATIONAL_CARRY_SWITCH_COST[stage] : 0;
    const continuityCost = Math.max(0, Math.round((0.45 - continuity) * 20));
    const readinessCost = anti && anti.status === "yellow" ? 4 : 0;
    let cost = stageCost + carryCost + continuityCost + readinessCost;
    if (certifiedPivot) {
      ready = true;
      cost = 0;
    }
    const reason = certifiedPivot
      ? strategyDecision.text
      : !ready
      ? (antiBlocked
        ? `${level}级转型被瓶颈阻断：${anti.bottleneckText || "核心组件未满足"}`
        : `${level}级转型未成包：${carryChanged && !carryHeld ? `新主C${challengerCarry || "未到"}未到；` : ""}新路线仅命中${packageHits.length}张关键牌`)
      : `转型成本${cost}分（阶段${stageCost}+换核${carryCost}+重合${continuityCost}+准备度${readinessCost}）`;
    return {
      level,
      ready,
      cost,
      carryChanged,
      currentCarry,
      challengerCarry,
      carryHeld,
      packageHits,
      sharedUnits: shared,
      continuityPct: Math.round(continuity * 100),
      strategyDecision,
      certifiedPivot,
      reason,
    };
  }

  function operationalRow(rows) {
    return (rows || []).find(row => row && row.following) || ((rows || [])[0] || null);
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
    const transition = opts.operationalCommitment ? transitionProfile(current, challenger, opts.selected || {}) : null;
    if (transition) challenger.transition = transition;
    const strategyDecision = challenger.strategyDecision;
    const strategyApplies = Boolean(strategyDecision && strategyDecision.baselineCarry === routeMainCarry(current.template));
    if (transition && transition.certifiedPivot) {
      challenger.following = true;
      challenger.sticky = {
        state: "model-switched",
        previous: current.template.name,
        transition,
        text: strategyDecision.text,
      };
      return rows;
    }
    if (strategyApplies && !strategyDecision.switchCertified) {
      current.following = true;
      current.strategyDecision = strategyDecision;
      challenger.followAdvice = strategyDecision.text;
      current.sticky = {
        state: "model-wait",
        challenger: challenger.template.name,
        transition,
        text: strategyDecision.text,
      };
      return rows;
    }
    if (currentIndex > 2) {
      if (transition && !transition.ready) {
        current.following = true;
        challenger.followAdvice = `继续跟 ${current.template.name}（${transition.reason}）`;
        current.sticky = {
          state: "pivot-wait",
          challenger: challenger.template.name,
          transition,
          text: `${current.template.name}虽跌出前3，但${transition.reason}`,
        };
        return rows;
      }
      challenger.sticky = {
        state: "dropped",
        previous: current.template.name,
        text: `${current.template.name}跌出前3，立即让位`,
      };
      return rows;
    }
    const gap = rowSortScore(challenger) - rowSortScore(current);
    const baseThreshold = stickyThreshold(current);
    const threshold = baseThreshold + (transition ? transition.cost : 0);
    if ((transition && !transition.ready) || gap < threshold) {
      current.following = true;
      challenger.followAdvice = transition && !transition.ready
        ? `继续跟 ${current.template.name}（${transition.reason}）`
        : `继续跟 ${current.template.name}（领先${gap}分，转型需${threshold}分）`;
      current.sticky = {
        state: transition && !transition.ready ? "pivot-wait" : "held",
        challenger: challenger.template.name,
        gap,
        threshold,
        baseThreshold,
        transition,
        text: transition && !transition.ready
          ? `${challenger.template.name}暂不接管：${transition.reason}`
          : `${challenger.template.name}领先${gap}分，未到含转型成本的${threshold}分阈值，继续跟随`,
      };
    } else {
      challenger.sticky = {
        state: "switched",
        previous: current.template.name,
        gap,
        threshold,
        baseThreshold,
        transition,
        text: `${challenger.template.name}领先${gap}分，达到含转型成本的${threshold}分阈值，允许易主`,
      };
    }
    return rows;
  }

  function rank(templates, selected, weights, limit, opts) {
    selected = resolveGameState(selected, opts && opts.heroAugments);
    const rows = (templates || []).map(t => {
      const stageResult = scoreTemplate(t, selected, weights, opts);
      const base = { template: t, ...stageResult };
      base.strategyDecision = strategyDecisionForTemplate(t, selected);
      base.finalScore = base.stageStrength;
      const reachability = reachabilityForTemplate(t, selected, operatorOddsOpts(opts, stageResult.augmentOperator));
      if (reachability) {
        base.reachability = reachability;
        base.finalScore = base.stageStrength;
      }
      if (opts && opts.antiFragile) {
        base.antiFragile = analyzeAntiFragility(t, selected, stageResult, operatorOddsOpts(opts, stageResult.augmentOperator), weights, templates || []);
        base.finalScore = base.antiFragile.score;
      }
      return base;
    });
    applyVirtualBattle(rows, opts);
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
    applySticky(rows, { ...opts, selected });
    const maxRows = limit || 5;
    const visible = rows.slice(0, maxRows);
    if (opts.operationalCommitment) {
      const active = rows.find(row => row.following);
      if (active && !visible.includes(active)) visible[visible.length - 1] = active;
    }
    return visible;
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
      normalizeHeroAugmentRound(selected.heroAugmentRound) !== "unknown" ? `英雄强化${normalizeHeroAugmentRound(selected.heroAugmentRound)}` : "",
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
      top.virtualDecision ? `虚拟实战：${top.virtualDecision.battles}场，胜率${top.virtualDecision.winRate}%，CVaR ${top.virtualDecision.cvar10}，覆盖${top.virtualDecision.coverage}%，蒸馏${top.virtualDecision.priorPoints >= 0 ? "+" : ""}${top.virtualDecision.priorPoints}分` : "",
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

  // 归约层只读取原始信号；它每次重新构造派生状态，因此删除、纠正和重复口述都不会留下增量残影。
  function resolveGameState(input, heroAugments) {
    if (input && input.stateResolved) return input;
    const selected = input || {};
    const units = normalizeSelectedUnits(selected.units || []).map(row => row.star ? { name: row.name, value: row.name, star: row.star, label: starLabel(row.name, row.star) } : row.name);
    const unitCopiesMap = {};
    normalizeSelectedUnits(units).forEach(row => { unitCopiesMap[row.name] = unitCopies(row.star); });
    const augments = uniq(selected.augments || []);
    const catalog = new Map((heroAugments || []).filter(Boolean).map(row => [row.name, row]));
    const selectedHeroes = augments.map(name => catalog.get(name)).filter(Boolean);
    // 同一局只能落一个英雄强化。发生口述修正而解析器尚未移除旧值时，最后一个有效输入胜出并留下审计记录。
    const chosen = selectedHeroes.length ? selectedHeroes[selectedHeroes.length - 1] : null;
    const derivedAssets = [];
    const auditTrail = [];
    const heroAugment = chosen ? {
      status: "resolved",
      round: normalizeHeroAugmentRound(selected.heroAugmentRound),
      selected: chosen,
      alternativesClosed: true,
      conflict: selectedHeroes.length > 1,
    } : {
      status: "waiting",
      round: normalizeHeroAugmentRound(selected.heroAugmentRound),
      selected: null,
      alternativesClosed: false,
      conflict: false,
    };
    if (chosen) {
      auditTrail.push(`${heroAugment.round === "unknown" ? "英雄强化" : heroAugment.round + "英雄强化"}已结算：${chosen.name}`);
      const effect = chosen.effect || {};
      const grantedHero = effect.grantedHero || chosen.hero;
      const grantedCopies = Number(effect.grantedCopies) || 0;
      if (grantedHero && grantedCopies > 0) {
        const wasHeld = Object.prototype.hasOwnProperty.call(unitCopiesMap, grantedHero);
        unitCopiesMap[grantedHero] = (unitCopiesMap[grantedHero] || 0) + grantedCopies;
        if (!wasHeld) units.push(grantedHero);
        derivedAssets.push({ kind: "units", value: grantedHero, copies: grantedCopies, source: chosen.name, label: `${grantedHero}+${grantedCopies}（${chosen.name}）` });
        auditTrail.push(`赠送资产：${grantedHero}+${grantedCopies}`);
      }
      if (effect.stunSeconds || effect.areaExpanded) {
        auditTrail.push(`${chosen.name}机制：${effect.areaExpanded ? "范围扩大" : ""}${effect.stunSeconds ? `${effect.areaExpanded ? "、" : ""}群体眩晕${effect.stunSeconds}秒` : ""}`);
      }
      if (heroAugment.conflict) auditTrail.push(`检测到多个英雄强化，按最后输入的${chosen.name}结算`);
    }
    return {
      ...selected,
      units,
      unitCopies: unitCopiesMap,
      augments,
      derivedAssets,
      auditTrail,
      heroAugment,
      stateResolved: true,
    };
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
    const heroAugment = top && top.heroAugment;
    if (heroAugment) {
      if (heroAugment.status === "waiting" && ["3-2", "4-2"].includes(heroAugment.round) && heroAugment.traits.length) {
        lines.push(`${heroAugment.round}英雄强化：前一轮优先激活${heroAugment.traits.slice(0, 2).join("/")}，等${heroAugment.heroes.slice(0, 2).join("/")}专属`);
      } else if (heroAugment.status === "waiting") {
        lines.push(heroAugment.text);
      } else if (heroAugment.status === "base-only" || heroAugment.status === "closed") {
        lines.push(heroAugment.text);
      } else if (heroAugment.status === "locked" || heroAugment.status === "resolved") {
        lines.push(heroAugment.text);
      } else {
        lines.push(`${heroAugment.round}英雄强化：当前路线可直接按来牌运营`);
      }
    }
    if (selected.derivedAssets && selected.derivedAssets.length) {
      lines.push(`已落袋：${selected.derivedAssets.map(x => x.label || `${x.value}+${x.copies}`).join("、")}`);
    }
    if (top && top.strategyDecision) {
      lines.push(top.strategyDecision.switchCertified
        ? `战略转线：${top.strategyDecision.strategicCarry}接管；${top.strategyDecision.terminalText}`
        : `交接观察：${top.strategyDecision.currentHolder}暂时代持，${top.strategyDecision.handoffText}`);
    }
    if (top && top.sticky && top.sticky.state === "model-wait") {
      lines.push(`模型不硬转：${top.sticky.text}`);
    } else if (top && top.sticky && top.sticky.state === "model-switched") {
      lines.push(`模型允许转型：${top.sticky.text}`);
    } else if (top && top.sticky && top.sticky.state === "pivot-wait") {
      lines.push(`经营不转：继续当前线；${top.sticky.transition ? top.sticky.transition.reason : top.sticky.text}`);
    } else if (top && top.sticky && top.sticky.state === "held") {
      lines.push(`经营不转：${top.sticky.text}`);
    } else if (top && top.sticky && top.sticky.state === "switched") {
      lines.push(`允许转型：${top.sticky.text}`);
    }
    if (top && top.antiFragile) {
      const af = top.antiFragile;
      lines.push(`${af.label}，核心度${af.readyPct}%`);
      if (af.blocked) lines.push(`不可达瓶颈：${af.bottleneckText}，别为它D牌`);
      else if (af.status === "red") lines.push(`禁止硬定：先补${af.bottleneckText}`);
      else if (af.status === "yellow") lines.push(`下一验证：补${af.bottleneckText}`);
    }
    if (top && top.augmentOperator && top.augmentOperator.actions.length) lines.push(top.augmentOperator.actions[0]);
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
        else {
          const oddsLevel = Number(first.effectiveLevel) || top.reachability.level;
          const levelText = oddsLevel !== top.reachability.level ? `${top.reachability.level}级商店按${oddsLevel}级` : `${top.reachability.level}级`;
          lines.push(`${levelText}${first.cost}费${first.oddsPct}%，适合现在追${first.name}`);
        }
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
      shopOdds: { 1: [100, 0, 0, 0, 0], 2: [100, 0, 0, 0, 0], 3: [75, 25, 0, 0, 0], 6: [25, 40, 30, 5, 0], 7: [19, 35, 35, 10, 1], 8: [18, 25, 32, 22, 3] },
      unitCounts: { 1: 10, 2: 10, 3: 10, 4: 10, 5: 10 },
      poolCopies: { 1: 29, 2: 22, 3: 18, 4: 12, 5: 10 },
    };
    const unitPrices = { A: 1, B: 2, C: 3, D: 4 };
    const heroRoundTemplate = (id, cost, required = false) => ({
      id,
      name: id,
      quality: "S",
      coreUnits: ["B"],
      earlyUnits: ["B"],
      midUnits: ["B"],
      completedPrefs: [],
      actions: {},
      routeProfile: { mainCarry: { name: "B", starTarget: 3, items: [] }, units: [{ name: "B", role: "mainCarry", starTarget: 3, traits: ["测试羁绊"] }], items: [], activeTraits: [{ name: "测试羁绊", count: 2 }] },
      heroAugmentPlan: { mainCarry: "B", options: [{ name: `${id}专属`, hero: "B", cost, traits: ["测试羁绊"] }], requiredNames: required ? [`${id}专属`] : [] },
    });
    const lowOptional = heroRoundTemplate("二费基础线", 2);
    const threeOptional = heroRoundTemplate("三费候选线", 3);
    const lowRequired = heroRoundTemplate("二费硬门槛", 2, true);
    const noRoundBefore = scoreTemplate(lowOptional, { units: [], items: [], augments: [], augmentCats: [] }, fallbackWeights, {});
    const noRoundAfter = scoreTemplate(lowOptional, { units: [], items: [], augments: [], augmentCats: [], heroAugmentRound: "unknown" }, fallbackWeights, {});
    assert(noRoundBefore.stageStrength === noRoundAfter.stageStrength, "未知英雄强化回合时计分必须逐值不变");
    const lowAtFour = scoreTemplate(lowOptional, { units: [], items: [], augments: [], augmentCats: [], heroAugmentRound: "4-2" }, fallbackWeights, {});
    const threeAtFour = scoreTemplate(threeOptional, { units: [], items: [], augments: [], augmentCats: [], heroAugmentRound: "4-2" }, fallbackWeights, {});
    const hardAtFour = scoreTemplate(lowRequired, { units: [], items: [], augments: [], augmentCats: [], heroAugmentRound: "4-2" }, fallbackWeights, {});
    assert(lowAtFour.heroAugment.status === "base-only" && !lowAtFour.mechanicBlocked, "4-2应关闭二费专属分支但保留基础阵容");
    assert(threeAtFour.heroAugment.status === "waiting" && threeAtFour.stageStrength > noRoundBefore.stageStrength, "4-2必须保留三费英雄强化并计入期权");
    assert(hardAtFour.heroAugment.status === "closed" && hardAtFour.stageStrength === 0, "4-2应硬关闭二费专属门槛路线");
    const heroCatalog = [
      { name: "嗜火", hero: "安妮", cost: 2, traits: ["小天才", "福牛守护者", "灵能使"], effect: { grantedHero: "安妮", grantedCopies: 1, areaExpanded: true, stunSeconds: 2 } },
      { name: "无情连打", hero: "贾克斯", cost: 3, traits: ["战斗机甲", "斗士"], effect: { grantedHero: "贾克斯", grantedCopies: 1, areaExpanded: false, stunSeconds: 0 } },
    ];
    const fireRaw = selectedFromSignals([{ kind: "units", value: "贾克斯" }, { kind: "augments", value: "嗜火" }]);
    fireRaw.level = 5;
    fireRaw.heroAugmentRound = "3-2";
    const fireState = resolveGameState(fireRaw, heroCatalog);
    assert(fireState.heroAugment.status === "resolved" && fireState.heroAugment.selected.name === "嗜火", "选中英雄强化必须全局结算");
    assert(fireState.unitCopies["安妮"] === 1 && fireState.derivedAssets.some(x => x.value === "安妮" && x.copies === 1), "嗜火必须派生安妮+1资产");
    const fireDuplicate = resolveGameState({ ...fireRaw, augments: ["嗜火", "嗜火"] }, heroCatalog);
    assert(fireDuplicate.unitCopies["安妮"] === 1, "重复口述同一英雄强化不得重复赠送");
    const fireWithTwoStar = resolveGameState({ ...fireRaw, units: [{ name: "安妮", star: 2 }] }, heroCatalog);
    assert(fireWithTwoStar.unitCopies["安妮"] === 4, "安妮二星加嗜火应按四张副本计算");
    const jaxAfterFire = scoreTemplate(threeOptional, fireState, fallbackWeights, { heroAugments: heroCatalog });
    assert(jaxAfterFire.heroAugment.status === "resolved" && jaxAfterFire.heroAugment.scoreDelta === 0, "已选嗜火后其他路线不得继续领取贾克斯期权");
    const fireTemplate = {
      ...heroRoundTemplate("嗜火安妮线", 2),
      augmentPrefs: ["嗜火"],
      routeProfile: { mainCarry: { name: "安妮", starTarget: 3, items: [] }, units: [{ name: "安妮", role: "frontline", starTarget: 1, traits: ["小天才", "灵能使"] }], items: [], activeTraits: [{ name: "小天才", count: 3 }, { name: "灵能使", count: 2 }] },
      heroAugmentPlan: { mainCarry: "安妮", options: [heroCatalog[0]], requiredNames: [] },
    };
    const fireOff = scoreTemplate(fireTemplate, { units: [], items: [], augments: [], augmentCats: [], level: 5, heroAugmentRound: "3-2" }, fallbackWeights, { heroAugments: heroCatalog });
    const fireOn = scoreTemplate(fireTemplate, fireState, fallbackWeights, { heroAugments: heroCatalog });
    assert(fireOn.stageStrength > fireOff.stageStrength && fireOn.evidence.some(x => x.includes("嗜火机制")), "嗜火应通过赠送资产和保守群控算子抬升安妮路线");
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

    const operatorTemplate = {
      id: "operator-test",
      name: "条件符文算子测试",
      quality: "S",
      augmentPrefs: ["飞升", "高端购物", "便携锻炉"],
      augmentOperators: [
        { name: "飞升", category: "战力", conditionLift: 8, evidenceLevel: "L2.5 模型扰动稳健" },
        { name: "高端购物", category: "经济", conditionLift: 8, evidenceLevel: "L2.5 模型扰动稳健" },
        { name: "便携锻炉", category: "装备", conditionLift: 8, evidenceLevel: "L2.5 模型扰动稳健" },
      ],
      actions: {},
      routeProfile: {
        mainCarry: { name: "D", starTarget: 2, items: ["鬼索的狂暴之刃", "疾射火炮", "泰坦的坚决"] },
        units: [{ name: "D", role: "mainCarry", starTarget: 2, traits: [] }],
        items: [
          { name: "鬼索的狂暴之刃", role: "mainCarry", holder: "D", components: ["反曲之弓", "无用大棒"] },
          { name: "疾射火炮", role: "mainCarry", holder: "D", components: ["反曲之弓", "反曲之弓"] },
          { name: "泰坦的坚决", role: "mainCarry", holder: "D", components: ["反曲之弓", "锁子甲"] },
        ],
        activeTraits: [],
      },
    };
    const operatorOpts = { oddsData: odds, unitPrices: { D: 4 }, certification: false };
    const operatorBase = rank([operatorTemplate], selectedFromSignals([{ kind: "units", value: "D" }, { kind: "levels", level: 6 }]), fallbackWeights, 1, operatorOpts)[0];
    const combatOperator = rank([operatorTemplate], selectedFromSignals([{ kind: "units", value: "D" }, { kind: "levels", level: 6 }, { kind: "augments", value: "飞升" }]), fallbackWeights, 1, operatorOpts)[0];
    assert(combatOperator.finalScore > operatorBase.finalScore + fallbackWeights.augment, "战力符文应在固定推荐分之外获得认证算子增益");
    assert(combatOperator.augmentOperator.evidence.some(x => x.includes("战力算子")), "战力算子应进入证据栏");
    const economyOperator = rank([operatorTemplate], selectedFromSignals([{ kind: "levels", level: 6 }, { kind: "augments", value: "高端购物" }]), fallbackWeights, 1, operatorOpts)[0];
    const economyBase = rank([operatorTemplate], selectedFromSignals([{ kind: "levels", level: 6 }]), fallbackWeights, 1, operatorOpts)[0];
    assert(economyOperator.reachability.missing[0].effectiveLevel === 7, "高端购物应让6级按7级商店概率计算");
    assert(economyOperator.reachability.expectedGold < economyBase.reachability.expectedGold, "经济算子应降低路线期望D牌成本");
    const itemOperator = rank([operatorTemplate], selectedFromSignals([{ kind: "levels", level: 6 }, { kind: "augments", value: "便携锻炉" }]), fallbackWeights, 1, operatorOpts)[0];
    const itemComplete = rank([operatorTemplate], selectedFromSignals([{ kind: "levels", level: 6 }, { kind: "augments", value: "便携锻炉" }, { kind: "items", value: "鬼索的狂暴之刃" }, { kind: "items", value: "疾射火炮" }, { kind: "items", value: "泰坦的坚决" }]), fallbackWeights, 1, operatorOpts)[0];
    assert(itemOperator.augmentOperator.variableBonus > itemComplete.augmentOperator.variableBonus, "装备算子应随主C装备缺口收缩而衰减");
    assert(itemOperator.augmentOperator.variableBonus <= AUGMENT_ITEM_BONUS_CAP, "单条装备算子不得越过上限");

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

    const commitmentTemplates = [
      { id: "commit-old", name: "旧经营线", quality: "S", coreUnits: ["A", "C"], earlyUnits: ["A"], midUnits: ["A", "C"], completedPrefs: [], componentPrefs: [], augmentPrefs: [], augmentCats: [], actions: {}, routeProfile: { mainCarry: { name: "A", starTarget: 2, items: [] }, units: [{ name: "A", role: "mainCarry", starTarget: 2, traits: [] }, { name: "C", role: "frontline", starTarget: 1, traits: [] }], items: [], activeTraits: [] } },
      { id: "commit-new", name: "新来牌线", quality: "S", coreUnits: ["B", "D", "E"], earlyUnits: ["B"], midUnits: ["B", "D", "E"], completedPrefs: ["X", "Y", "Z"], componentPrefs: [], augmentPrefs: [], augmentCats: [], actions: {}, routeProfile: { mainCarry: { name: "B", starTarget: 2, items: ["X", "Y", "Z"] }, units: [{ name: "B", role: "mainCarry", starTarget: 2, traits: [] }, { name: "D", role: "frontline", starTarget: 1, traits: [] }, { name: "E", role: "utility", starTarget: 1, traits: [] }], items: [{ name: "X", role: "mainCarry", holder: "B", components: [] }, { name: "Y", role: "mainCarry", holder: "B", components: [] }, { name: "Z", role: "mainCarry", holder: "B", components: [] }], activeTraits: [] } },
    ];
    const commitmentWeights = { ...fallbackWeights, baseS: 100, mainCarryUnit: 20, mainCarryItem: 20, frontlineUnit: 8, utilityUnit: 8, routeItem: 20, futureMainCarryUnit: 0, futureCoreUnit: 0, futureItem: 0, versionStrength: 0 };
    const unreadySelected = selectedFromSignals([{ kind: "levels", level: 7 }, { kind: "units", value: "A" }, { kind: "items", value: "X" }, { kind: "items", value: "Y" }, { kind: "items", value: "Z" }]);
    const unreadyRows = rank(commitmentTemplates, unreadySelected, commitmentWeights, 2, { previousOrder: ["commit-old", "commit-new"], stickyTopId: "commit-old", operationalCommitment: true });
    assert(rowId(unreadyRows[0]) === "commit-new", "分数排序仍应展示新路线领先");
    assert(rowId(operationalRow(unreadyRows)) === "commit-old", "新主C未到且来牌未成包时必须继续旧经营线");
    assert(unreadyRows[0].transition && !unreadyRows[0].transition.ready, "未成包挑战路线必须返回转型阻断原因");
    const readySelected = selectedFromSignals([{ kind: "levels", level: 7 }, { kind: "units", value: "A" }, { kind: "units", value: "B", star: 2 }, { kind: "units", value: "D" }, { kind: "units", value: "E" }, { kind: "items", value: "X" }, { kind: "items", value: "Y" }, { kind: "items", value: "Z" }]);
    const readyRows = rank(commitmentTemplates, readySelected, commitmentWeights, 2, { previousOrder: ["commit-old", "commit-new"], stickyTopId: "commit-old", operationalCommitment: true });
    assert(rowId(operationalRow(readyRows)) === "commit-new", "新主C与配套来牌成包且领先覆盖转型成本后应允许易主");

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
    const virtualBase = id => ({ id, name: id, quality: "S", coreUnits: [], earlyUnits: [], midUnits: [], actions: {}, routeProfile: { mainCarry: { name: "A", starTarget: 1, items: [] }, units: [], items: [], activeTraits: [] } });
    const virtualHigh = { ...virtualBase("稳健"), virtualBattle: { battles: 708, winRate: 82, robustScore: 90, cvar10: -0.1, interval90: [-0.2, 0.8], coverage: 100, unsupported: [] } };
    const virtualLow = { ...virtualBase("敏感"), virtualBattle: { battles: 708, winRate: 22, robustScore: 20, cvar10: -0.8, interval90: [-0.9, 0.2], coverage: 100, unsupported: [] } };
    const virtualRows = rank([virtualLow, virtualHigh], { units: [], items: [], augments: [], augmentCats: [] }, fallbackWeights, 2, {});
    assert(rowId(virtualRows[0]) === "稳健" && virtualRows[0].finalScore > virtualRows[1].finalScore, "虚拟实战先验应参与排序");
    assert(Math.abs(virtualRows[0].virtualBattlePrior) <= VIRTUAL_BATTLE_PRIOR_CAP, "虚拟实战先验不得越过有界上限");
    assert(virtualRows[0].virtualDecision && virtualRows[0].virtualDecision.battles === 708, "rank应输出虚拟实战决策摘要");
    assert(virtualRows[0].evidence.some(x => x.includes("708场")), "虚拟实战应进入证据栏");
    if (typeof require === "function") {
      const path = require("path");
      const rootDir = path.resolve(__dirname, "..");
      const matcherData = require(path.join(rootDir, "artifacts", "results", "stage2_matcher_results.json"));
      require(path.join(__dirname, "odds-data.js"));
      const fixtureRows = require(path.join(rootDir, "tests", "fixtures", "hands.json"));
      const fixtureUnitPrices = Object.fromEntries((matcherData.options.unitSearch || []).map(x => [x.name, x.price]));
      const fixtureUnitTraits = Object.fromEntries((matcherData.options.unitSearch || []).map(x => [x.name, x.traits || []]));
      assert(matcherData.templates.some(t => (t.augmentOperators || []).length), "构建数据应包含条件符文算子");
      assert(!matcherData.templates.some(t => (t.augmentOperators || []).some(x => !(t.augmentPrefs || []).includes(x.name))), "算子必须属于该路线推荐符文");
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
      const screenshotUnits = ["凯尔", "娑娜", "德莱文", "李青", "赛娜", "芮尔", "孙悟空", "锐雯"];
      const screenshotSignals = [
        ...screenshotUnits.map(name => ({ kind: "units", value: name, star: name === "孙悟空" ? 2 : undefined })),
        { kind: "items", value: "锁子甲" },
        { kind: "augments", value: "无情连打" },
        { kind: "levels", level: 4 },
      ];
      const transitionOpts = {
        oddsData: globalThis.JCC_ODDS,
        unitPrices: fixtureUnitPrices,
        unitTraits: fixtureUnitTraits,
        heroAugments: matcherData.options.heroAugments,
        antiFragile: true,
        operationalCommitment: true,
      };
      const dravenTemplate = matcherData.templates.find(t => (t.name || "").includes("超级机甲德莱文"));
      assert(dravenTemplate, "无情连打回归需要德莱文基线路线");
      const selectedJaxOne = selectedFromSignals(screenshotSignals);
      selectedJaxOne.heroAugmentRound = "3-2";
      const jaxOneRows = rank(matcherData.templates, selectedJaxOne, matcherData.weights, 8, {
        ...transitionOpts,
        stickyTopId: dravenTemplate.id,
        previousOrder: [dravenTemplate.id],
      });
      const jaxOneOperational = operationalRow(jaxOneRows);
      assert(routeMainCarry(jaxOneOperational.template) === "贾克斯", "选下无情连打并获得贾克斯后，实验认证应立即转贾克斯战略主C");
      assert(jaxOneOperational.strategyDecision && jaxOneOperational.strategyDecision.switchCertified
        && !jaxOneOperational.strategyDecision.handoffState
        && jaxOneOperational.strategyDecision.text.includes("立即转贾克斯"), "贾克斯1星状态应使用当前状态置信结论");
      const selectedJaxTwo = selectedFromSignals([...screenshotSignals, { kind: "units", value: "贾克斯", star: 2 }]);
      selectedJaxTwo.heroAugmentRound = "3-2";
      const jaxTwoRows = rank(matcherData.templates, selectedJaxTwo, matcherData.weights, 8, {
        ...transitionOpts,
        stickyTopId: dravenTemplate.id,
        previousOrder: jaxOneRows.map(row => rowId(row)),
      });
      const jaxTwoOperational = operationalRow(jaxTwoRows);
      assert(routeMainCarry(jaxTwoOperational.template) === "贾克斯"
        && jaxTwoOperational.strategyDecision && jaxTwoOperational.strategyDecision.handoffState
        && jaxTwoOperational.strategyDecision.lcb95 > jaxOneOperational.strategyDecision.lcb95,
      "贾克斯2星应继续执行贾克斯线，并切换到2星优势扩大推断");
      console.log(`无情连打转型回归: 1星=${jaxOneOperational.strategyDecision.lcb95}, 2星=${jaxTwoOperational.strategyDecision.lcb95}`);
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
    OPERATIONAL_STAGE_SWITCH_COST,
    MIN_LEVEL,
    MAX_LEVEL,
    COMPONENT_DIRECTION_BONUS,
    PRIME_PLAN_MATCH_BONUS,
    STAR_SCORE_MULTIPLIERS,
    STAR_MILESTONE_BONUS,
    FUTURE_VALUE_GOLD_CAP,
    FUTURE_ITEM_VALUE_RATIO,
    VIRTUAL_BATTLE_PRIOR_CAP,
    VIRTUAL_BATTLE_CENTER,
    VIRTUAL_BATTLE_SCALE,
    AUGMENT_OPERATOR_EVIDENCE,
    AUGMENT_OPERATOR_SINGLE_CAP,
    AUGMENT_OPERATOR_TOTAL_CAP,
    HERO_AUGMENT_ROUND_COSTS,
    HERO_AUGMENT_OPTION_BONUS,
    HERO_AUGMENT_UNAVAILABLE_PENALTY,
    HERO_AUGMENT_CONTROL_CAP,
    DEFAULT_LEVEL,
    scoreTemplate,
    rank,
    operationalRow,
    confidence,
    buildOutput,
    signalTowerHtml,
    selectedFromSignals,
    resolveGameState,
    actionLines,
    primeActionLine,
    activeTraitsForTemplate,
    heroAugmentDecision,
    normalizeHeroAugmentRound,
    parseTraitsInText,
    normalizeSelectedUnits,
    runTests,
    escText,
  };
  if (typeof module === "object" && module.exports && require.main === module) runTests();
  return api;
});
