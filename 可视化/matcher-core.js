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
  // 阶段感知：低等级优先保血和承接，高等级才把终局核心权重放大。
  const STAGE_LEVEL_RULES = {
    early: { maxLevel: 5, earlyUnit: 1.5, midUnit: 1, coreUnit: 0.6, component: 1.3 },
    middle: { level: 6, earlyUnit: 1, midUnit: 1, coreUnit: 1, component: 1 },
    late: { minLevel: 7, earlyUnit: 0.6, midUnit: 1, coreUnit: 1.4, component: 1 },
  };
  // 散件方向纯度达到 2/3 时，给同方向主C路线 10% 确定性加成。
  const COMPONENT_DIRECTION_BONUS = 0.1;
  // primePlan 只给含战斗机甲实验结论的路线加命中证据；不影响无 primePlan 的路线。
  const PRIME_PLAN_MATCH_BONUS = 10;
  // 星级权重：二星/三星来牌比单张更能代表可执行路线，放大该棋子的命中分。
  const STAR_SCORE_MULTIPLIERS = { 1: 1, 2: 1.5, 3: 2.5 };
  // 三星核心视为关键里程碑完成，给追三/核心路线一个确定性成型加成。
  const STAR_MILESTONE_BONUS = 18;
  // 可达性：预计 D 牌成本 80 金以上视为最低可达，最低仍保留 20% 避免路线被彻底归零。
  const REACHABILITY_GOLD_CAP = 80;
  // 低等级只评估下一段承接牌，容忍度略高，避免把合法过渡线过早打死。
  const LOW_STAGE_REACHABILITY_GOLD_CAP = 90;
  const REACHABILITY_MIN = 0.2;
  const MIN_LEVEL = 1;
  const MAX_LEVEL = 9;
  const DEFAULT_LEVEL = 6;

  const fallbackWeights = {
    baseS: 18,
    baseA: 10,
    baseB: 4,
    earlyUnit: 14,
    midUnit: 10,
    coreUnit: 7,
    coreItem: 21,
    component: 12,
    looseComponent: 2,
    augment: 24,
    augmentSignal: 8,
    trait: 18,
    attackSynergy: 16,
    conflictPenalty: 16,
    tankPenalty: 5,
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

  function isRerollRoute(t) {
    const text = [
      t.name, t.family, t.goal, t.boardNote,
      t.actions && t.actions.checkpoint,
      t.actions && t.actions.stopLoss,
      (t.route || []).join(" "),
    ].filter(Boolean).join(" ");
    return /追三|三星|慢D|慢d|赌|D牌|d牌/.test(text);
  }

  function isMilestoneUnit(t, name) {
    if (!(t.coreUnits || []).includes(name)) return false;
    if ((t.carryUnits || []).includes(name)) return true;
    const board = (t.board || []).find(x => x && x.name === name);
    const role = board && (board.role || "");
    return Boolean(board && board.carry) || /主C/.test(role);
  }

  function stageMultipliers(level) {
    const lv = Number(level) || DEFAULT_LEVEL;
    if (lv <= STAGE_LEVEL_RULES.early.maxLevel) return STAGE_LEVEL_RULES.early;
    if (lv >= STAGE_LEVEL_RULES.late.minLevel) return STAGE_LEVEL_RULES.late;
    return STAGE_LEVEL_RULES.middle;
  }

  function canonicalItem(name) {
    const raw = String(name || "").split("/")[0].trim();
    return ITEM_ALIASES[raw] || raw;
  }

  function carryCoreItems(t) {
    const boardCarry = (t.board || []).find(x => x && x.carry && Array.isArray(x.items));
    const boardItems = boardCarry ? boardCarry.items.map(canonicalItem).filter(x => ITEM_RECIPES[x]) : [];
    return uniq([...(t.carryItems || []), ...boardItems, ...(t.completedPrefs || [])].map(canonicalItem)).filter(x => ITEM_RECIPES[x]);
  }

  function componentInItems(component, items) {
    return (items || []).some(item => (ITEM_RECIPES[canonicalItem(item)] || []).includes(component));
  }

  function componentScore(component, t, w, stage) {
    const coreItems = carryCoreItems(t);
    if (componentInItems(component, coreItems.slice(0, 2))) {
      return { pts: Math.round(w.component * stage.component), text: `${component} 命中主C核心散件` };
    }
    if (componentInItems(component, coreItems) || componentInItems(component, t.completedPrefs || []) || (t.componentPrefs || []).includes(component)) {
      return { pts: Math.round(w.component * stage.component * 0.5), text: `${component} 命中路线散件` };
    }
    return { pts: w.looseComponent, text: "" };
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

  function scoreTemplate(t, selected, weights) {
    const unitRows = normalizeSelectedUnits(selected.units || []);
    const units = new Set(unitRows.map(x => x.name));
    const items = new Set(selected.items || []);
    const augments = new Set(selected.augments || []);
    const augCats = new Set(selected.augmentCats || []);
    const traits = normalizeSelectedTraits(selected.traits || []);
    const w = weights || fallbackWeights;
    const stage = stageMultipliers(selected.level);
    const base = t.quality === "S" ? w.baseS : t.quality === "A" ? w.baseA : w.baseB;
    let score = base;
    const breakdown = { base, hero: 0, item: 0, augment: 0, synergy: 0, penalty: 0 };
    if (traits.length) {
      breakdown.trait = 0;
      breakdown.traitSignals = traits.length;
    }
    const evidence = [], missing = [], penalties = [];

    unitRows.forEach(row => {
      const u = row.name;
      const star = row.star || 0;
      const mult = STAR_SCORE_MULTIPLIERS[star] || 1;
      const addHeroScore = (basePts, stageMult, text) => {
        const pts = Math.round(basePts * stageMult * (star > 1 ? mult : 1));
        score += pts;
        breakdown.hero += pts;
        const stageText = stageMult === 1 ? "" : `，阶段x${stageMult}`;
        evidence.push(star > 1 ? `${starLabel(u, star)} ${text}（星级x${mult}${stageText}）` : `${u} ${text}${stageText ? `（${stageText.slice(1)}）` : ""}`);
      };
      if ((t.earlyUnits || []).includes(u)) {
        addHeroScore(w.earlyUnit, stage.earlyUnit, "命中前期底座");
      } else if ((t.midUnits || []).includes(u)) {
        addHeroScore(w.midUnit, stage.midUnit, "可中期承接");
      } else if ((t.coreUnits || []).includes(u)) {
        addHeroScore(w.coreUnit, stage.coreUnit, "是后续核心");
      }
      if (star >= 3 && isMilestoneUnit(t, u)) {
        score += STAR_MILESTONE_BONUS;
        breakdown.synergy += STAR_MILESTONE_BONUS;
        evidence.push(`三星${u}=追三完成`);
      }
    });

    items.forEach(it => {
      if ((t.completedPrefs || []).includes(it)) {
        score += w.coreItem; breakdown.item += w.coreItem; evidence.push(`${it} 命中核心成装`);
      } else if (COMPONENTS.includes(it)) {
        const hit = componentScore(it, t, w, stage);
        score += hit.pts;
        breakdown.item += hit.pts;
        if (hit.text) evidence.push(hit.text);
      }
    });

    const direction = componentDirection(items);
    const tDirection = routeDirection(t);
    if (direction && tDirection === direction) {
      const bonus = Math.max(1, Math.round(score * COMPONENT_DIRECTION_BONUS));
      score += bonus;
      breakdown.synergy += bonus;
      const label = /源计划|枪手/.test(`${t.name}${t.family}`) ? "源计划/枪手系" : (t.family || t.name);
      evidence.unshift(`散件方向：${direction}→${label}`);
    }

    augments.forEach(h => {
      if ((t.augmentPrefs || []).includes(h)) {
        score += w.augment; breakdown.augment += w.augment; evidence.push(`${h} 命中推荐符文`);
      }
    });
    augCats.forEach(c => {
      if ((t.augmentCats || []).includes(c)) {
        score += w.augmentSignal; breakdown.augment += w.augmentSignal; evidence.push(`${c}符文匹配路线`);
      }
    });

    if (traits.length) {
      const activeTraits = activeTraitsForTemplate(t);
      traits.forEach(sig => {
        const have = activeTraits.get(sig.name) || 0;
        if (have >= sig.count) {
          const pts = w.trait || fallbackWeights.trait;
          score += pts;
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
      breakdown.synergy += PRIME_PLAN_MATCH_BONUS;
      evidence.push(`至尊计划：${primeRule.text || primeRule.holder}`);
    }

    const selectedAttack = [...items].filter(x => ATTACK.includes(x)).length;
    const selectedAp = [...items].filter(x => AP.includes(x)).length;
    const selectedTank = [...items].filter(x => TANK.includes(x)).length;
    if (selectedAttack >= 2 && t.role === "法系") {
      score -= w.conflictPenalty; breakdown.penalty -= w.conflictPenalty; penalties.push("装备偏普攻，法系终局降权");
    }
    if (selectedAp >= 2 && t.role === "普攻") {
      const p = Math.round(w.conflictPenalty * 0.78);
      score -= p; breakdown.penalty -= p; penalties.push("装备偏法系，普攻C降权");
    }
    if (selectedTank >= 2 && t.role !== "九五") {
      score -= w.tankPenalty; breakdown.penalty -= w.tankPenalty; penalties.push("肉装多，需要确认输出装来源");
    }
    if (selectedAttack >= 2 && t.id === "manual-gadget-jax") {
      score += w.attackSynergy; breakdown.synergy += w.attackSynergy;
    }
    if (selectedAttack >= 2 && t.id === "manual-gadget-ap") {
      score -= w.conflictPenalty; breakdown.penalty -= w.conflictPenalty;
    }
    if (t.id === "manual-gadget-jax" && selectedAttack < 2 && !["贾克斯", "德莱文", "孙悟空"].some(u => units.has(u))) {
      const p = Math.round(w.conflictPenalty * 0.65);
      score -= p; breakdown.penalty -= p;
      penalties.push("只有小天才牌、没有普攻装备/机甲核心，先按小天才判断");
    }

    const selectedUnitCount = [...units].filter(u => (t.earlyUnits || []).includes(u)).length;
    if (units.size && selectedUnitCount === 0) missing.push("当前来牌没有命中前期底座");
    const coreMissing = (t.coreUnits || []).filter(x => !units.has(x)).slice(0, 4);
    if (coreMissing.length) missing.push(`后续关键牌：${coreMissing.join("、")}`);
    if (!items.size) missing.push("还没选择装备，路线暂按来牌判断");
    if (!augments.size && !augCats.size) missing.push("还没选择符文，符文权重未生效");

    const signalTotal = breakdown.hero + breakdown.item + breakdown.augment + breakdown.synergy + (breakdown.trait || 0);
    const shares = signalTotal > 0 ? {
      hero: Math.round(breakdown.hero / signalTotal * 100),
      item: Math.round(breakdown.item / signalTotal * 100),
      augment: Math.round(breakdown.augment / signalTotal * 100),
      synergy: Math.round(breakdown.synergy / signalTotal * 100),
    } : { hero: 0, item: 0, augment: 0, synergy: 0 };
    if (traits.length) shares.trait = signalTotal > 0 ? Math.round((breakdown.trait || 0) / signalTotal * 100) : 0;

    return {
      stageStrength: Math.max(0, Math.round(score)),
      breakdown,
      shares,
      evidence: uniq(evidence).slice(0, 6),
      missing: uniq(missing).slice(0, 4),
      penalties: uniq(penalties).slice(0, 4),
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
    return uniq(t.coreUnits || []).filter(Boolean);
  }

  function targetCopiesFor(t, name, cost) {
    const fixed = (t.starTargets || []).find(x => x && x.name === name);
    if (fixed && Number(fixed.targetCopies) > 0) return Number(fixed.targetCopies);
    if (isRerollRoute(t) && cost <= 3 && isMilestoneUnit(t, name)) return 9;
    if (cost >= 4 && isMilestoneUnit(t, name)) return 3;
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

  function reachabilityForTemplate(t, selected, opts) {
    if (!opts || !opts.oddsData) return null;
    const level = clamp(Number(selected.level) || DEFAULT_LEVEL, MIN_LEVEL, MAX_LEVEL);
    const owned = ownedCopyMap(selected);
    const lowStage = level <= 6;
    const costedNames = lowStage ? uniq(t.midUnits || []) : reachabilityUnits(t);
    const coreNames = reachabilityUnits(t);
    const rawTargets = costedNames.map(name => {
      const cost = unitPrice(name, opts);
      return expectedCostForUnit(name, lowStage ? 1 : targetCopiesFor(t, name, cost), selected, opts);
    });
    const targets = rawTargets.filter(x => x.need > 0 && x.available);
    const unavailableCosted = rawTargets.filter(x => x.need > 0 && !x.available).map(x => x.name);
    const lateTargets = lowStage
      ? uniq([...unavailableCosted, ...coreNames.filter(name => !owned.has(name) && !targets.some(x => x.name === name))])
      : unavailableCosted;
    const expectedGold = targets.reduce((sum, x) => sum + x.expectedGold, 0);
    const cap = lowStage ? LOW_STAGE_REACHABILITY_GOLD_CAP : REACHABILITY_GOLD_CAP;
    const coefficient = clamp(1 - expectedGold / cap, REACHABILITY_MIN, 1);
    const summary = targets.length
      ? targets.map(x => `缺${x.name}${x.need}张约${Math.round(x.expectedGold)}金`).join("、") + `；合计约${Math.round(expectedGold)}金`
      : "当前可刷缺口已见，约0金";
    return {
      level,
      missing: targets,
      lateTargets: uniq(lateTargets),
      expectedGold: Math.round(expectedGold),
      coefficient: Math.round(coefficient * 100) / 100,
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
      const stageResult = scoreTemplate(t, selected, weights);
      const base = { template: t, ...stageResult };
      base.finalScore = base.stageStrength;
      const reachability = reachabilityForTemplate(t, selected, opts);
      if (reachability) {
        base.reachability = reachability;
        base.finalScore = Math.max(0, Math.round(base.stageStrength * reachability.coefficient));
      }
      return base;
    });
    if (!opts) return rows.sort((a, b) => b.stageStrength - a.stageStrength).slice(0, limit || 5);
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
      `首选：${t.name}（${topScore}分，信心${confidence(topScore)}）`,
      `权重：英雄${top.shares?.hero || 0}% / 装备${top.shares?.item || 0}% / 符文${top.shares?.augment || 0}%${top.breakdown?.traitSignals ? ` / 羁绊${top.shares?.trait || 0}%` : ""}`,
      top.reachability ? `拆分：强度${top.stageStrength}分 × 可达${top.reachability.coefficient}（${top.reachability.summary}）=${top.finalScore}分` : "",
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
    if (primeLine) lines.push(primeLine);
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
    const fullCore = [{ id: "full", name: "全集core", quality: "S", coreUnits: ["A", "B", "C"], earlyUnits: [], midUnits: ["B", "C"], actions: {} }];
    const selected = selectedFromSignals([{ kind: "units", value: "A" }]);
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
    const lowRows = rank([{ id: "low", name: "低级", quality: "S", coreUnits: ["D"], midUnits: ["D"], earlyUnits: [], actions: {} }], low, fallbackWeights, 1, { oddsData: odds, unitPrices })[0];
    assert(lowRows.reachability.missing.length === 0, "0概率棋子不应进入期望成本");
    assert(lowRows.reachability.lateTargets.includes("D"), "0概率棋子应进入后期目标");
    assertNoBadNumbers(JSON.stringify(lowRows.reachability), "可达性对象不应有坏数字");
    const lowMidOnly = rank([{ id: "low-mid", name: "低级承接", quality: "S", coreUnits: [], midUnits: ["D"], earlyUnits: [], actions: {} }], low, fallbackWeights, 1, { oddsData: odds, unitPrices })[0];
    assert(lowMidOnly.reachability.lateTargets.includes("D"), "0概率承接牌也应进入后期目标");
    const levelOne = selectedFromSignals([{ kind: "levels", value: "1", level: 1 }]);
    const firstCost = expectedCostForUnit("A", 1, levelOne, { oddsData: odds, unitPrices });
    assert(firstCost.oddsPct === 100 && firstCost.available, "1级应按一费100%概率计算");

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

    const stickyTemplates = [
      { id: "old", name: "旧路线", quality: "S", coreUnits: [], earlyUnits: [], midUnits: [], completedPrefs: [], componentPrefs: [], augmentPrefs: [], augmentCats: [], actions: {} },
      { id: "new", name: "新路线", quality: "S", coreUnits: [], earlyUnits: [], midUnits: [], completedPrefs: ["X"], componentPrefs: [], augmentPrefs: [], augmentCats: [], actions: {} },
    ];
    const baseWeights = { ...fallbackWeights, baseS: 100, coreItem: 14, earlyUnit: 0, midUnit: 0, coreUnit: 0, augment: 0, augmentSignal: 0 };
    let held = rank(stickyTemplates, { items: ["X"], units: [], augments: [], augmentCats: [] }, baseWeights, 2, { previousOrder: ["old", "new"], stickyTopId: "old" });
    assert(rowId(held[0]) === "new", "黏性不得篡改真分排序");
    assert(held[1].following, "挑战者未达到相对阈值时，旧路线只应带跟随徽章");
    const switchWeights = { ...baseWeights, coreItem: 15 };
    let switched = rank(stickyTemplates, { items: ["X"], units: [], augments: [], augmentCats: [] }, switchWeights, 2, { previousOrder: ["old", "new"], stickyTopId: "old" });
    assert(rowId(switched[0]) === "new", "挑战者达到相对阈值时应易主");

    const dropTemplates = [
      { id: "n1", name: "新1", quality: "S", completedPrefs: ["A"], coreUnits: [], earlyUnits: [], midUnits: [], actions: {} },
      { id: "n2", name: "新2", quality: "S", completedPrefs: ["B"], coreUnits: [], earlyUnits: [], midUnits: [], actions: {} },
      { id: "n3", name: "新3", quality: "S", completedPrefs: ["C"], coreUnits: [], earlyUnits: [], midUnits: [], actions: {} },
      { id: "old", name: "旧", quality: "S", coreUnits: [], earlyUnits: [], midUnits: [], actions: {} },
    ];
    const dropped = rank(dropTemplates, { items: ["A", "B", "C"], units: [], augments: [], augmentCats: [] }, { ...fallbackWeights, baseS: 100, coreItem: 10 }, 4, { previousOrder: ["old", "n1", "n2", "n3"], stickyTopId: "old" });
    assert(rowId(dropped[0]) !== "old", "旧#1跌出前3时应立即让位");
    assert(!dropped.some(r => r.template.id === "old" && r.following), "旧#1跌出前3不应保留跟随徽章");
    for (let i = 1; i < dropped.length; i++) {
      assert(dropped[i - 1].finalScore >= dropped[i].finalScore, "rank结果finalScore必须单调非增");
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
    STAGE_LEVEL_RULES,
    COMPONENT_DIRECTION_BONUS,
    PRIME_PLAN_MATCH_BONUS,
    STAR_SCORE_MULTIPLIERS,
    STAR_MILESTONE_BONUS,
    REACHABILITY_GOLD_CAP,
    LOW_STAGE_REACHABILITY_GOLD_CAP,
    REACHABILITY_MIN,
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
