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
  // 排序黏性：挑战者最终分必须领先当前推荐至少 5 分才易主，避免同分/微分来回跳。
  const STICKY_LEAD_THRESHOLD = 5;
  // 星级权重：二星/三星来牌比单张更能代表可执行路线，放大该棋子的命中分。
  const STAR_SCORE_MULTIPLIERS = { 1: 1, 2: 1.5, 3: 2.5 };
  // 三星核心视为关键里程碑完成，给追三/核心路线一个确定性成型加成。
  const STAR_MILESTONE_BONUS = 18;
  // 可达性：预计 D 牌成本 80 金以上视为最低可达，最低仍保留 20% 避免路线被彻底归零。
  const REACHABILITY_GOLD_CAP = 80;
  const REACHABILITY_MIN = 0.2;
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
    const board = (t.board || []).find(x => x && x.name === name);
    const role = board && (board.role || "");
    const text = [
      t.name, t.family, t.goal,
      t.actions && t.actions.checkpoint,
      t.actions && t.actions.item,
    ].filter(Boolean).join(" ");
    return Boolean(board && board.carry) || /主C|核心|主坦|追三|三星/.test(role + text) || isRerollRoute(t);
  }

  function scoreTemplate(t, selected, weights) {
    const unitRows = normalizeSelectedUnits(selected.units || []);
    const units = new Set(unitRows.map(x => x.name));
    const items = new Set(selected.items || []);
    const augments = new Set(selected.augments || []);
    const augCats = new Set(selected.augmentCats || []);
    const traits = normalizeSelectedTraits(selected.traits || []);
    const w = weights || fallbackWeights;
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
      const addHeroScore = (basePts, text) => {
        const pts = star > 1 ? Math.round(basePts * mult) : basePts;
        score += pts;
        breakdown.hero += pts;
        evidence.push(star > 1 ? `${starLabel(u, star)} ${text}（星级x${mult}）` : `${u} ${text}`);
      };
      if ((t.earlyUnits || []).includes(u)) {
        addHeroScore(w.earlyUnit, "命中前期底座");
      } else if ((t.midUnits || []).includes(u)) {
        addHeroScore(w.midUnit, "可中期承接");
      } else if ((t.coreUnits || []).includes(u)) {
        addHeroScore(w.coreUnit, "是后续核心");
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
      } else if ((t.componentPrefs || []).includes(it)) {
        score += w.component; breakdown.item += w.component; evidence.push(`${it} 命中散件优先级`);
      } else if (COMPONENTS.includes(it)) {
        score += w.looseComponent; breakdown.item += w.looseComponent;
      }
    });

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
      score: Math.max(0, Math.round(score)),
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

  function carryUnits(t) {
    return uniq([
      ...(t.board || []).filter(x => x && x.carry).map(x => x.name),
      ...(t.coreUnits || []).slice(0, 2),
    ]).filter(Boolean);
  }

  function targetCopiesFor(t, name, cost) {
    if (isRerollRoute(t) && cost <= 3 && isMilestoneUnit(t, name)) return 9;
    if (cost >= 4 && isMilestoneUnit(t, name)) return 3;
    return 1;
  }

  function expectedCostForUnit(name, targetCopies, selected, opts) {
    const level = clamp(Number(selected.level) || DEFAULT_LEVEL, 4, 9);
    const oddsData = opts && opts.oddsData || {};
    const shopOdds = oddsData.shopOdds || {};
    const unitCounts = oddsData.unitCounts || {};
    const poolCopies = oddsData.poolCopies || {};
    const cost = unitPrice(name, opts);
    const owned = ownedCopyMap(selected).get(name) || 0;
    const need = Math.max(0, targetCopies - owned);
    const odds = ((shopOdds[level] || [0, 0, 0, 0, 0])[cost - 1] || 0) / 100;
    const count = Number(unitCounts[cost]) || 1;
    const pool = Number(poolCopies[cost]) || 1;
    const remainingFactor = clamp((pool - owned) / pool, 0.05, 1);
    const pSlot = odds / count * remainingFactor;
    const expectedGold = need <= 0 ? 0 : (pSlot > 0 ? (need / (5 * pSlot)) * 2 : 999);
    return {
      name,
      cost,
      owned,
      need,
      targetCopies,
      oddsPct: Math.round(odds * 100),
      expectedGold,
    };
  }

  function reachabilityForTemplate(t, selected, opts) {
    if (!opts || !opts.oddsData) return null;
    const targets = carryUnits(t).map(name => {
      const cost = unitPrice(name, opts);
      return expectedCostForUnit(name, targetCopiesFor(t, name, cost), selected, opts);
    }).filter(x => x.need > 0);
    const expectedGold = targets.reduce((sum, x) => sum + x.expectedGold, 0);
    const coefficient = clamp(1 - expectedGold / REACHABILITY_GOLD_CAP, REACHABILITY_MIN, 1);
    const level = clamp(Number(selected.level) || DEFAULT_LEVEL, 4, 9);
    const summary = targets.length
      ? targets.slice(0, 2).map(x => `缺${x.name}${x.need}张`).join("、") + `，约${Math.round(expectedGold)}金`
      : "核心已见，约0金";
    return {
      level,
      missing: targets,
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
    return Number.isFinite(Number(row.finalScore)) ? Number(row.finalScore) : Number(row.score);
  }

  function applySticky(rows, opts) {
    if (!opts || !opts.stickyTopId || !rows.length) return rows;
    const currentId = opts.stickyTopId;
    const challenger = rows[0];
    if (rowId(challenger) === currentId) {
      challenger.sticky = { state: "current", text: "当前推荐稳定领先" };
      return rows;
    }
    const currentIndex = rows.findIndex(r => rowId(r) === currentId);
    if (currentIndex < 0) return rows;
    const current = rows[currentIndex];
    const gap = rowSortScore(challenger) - rowSortScore(current);
    if (gap < STICKY_LEAD_THRESHOLD) {
      rows.splice(currentIndex, 1);
      rows.unshift(current);
      current.sticky = {
        state: "held",
        challenger: challenger.template.name,
        gap,
        threshold: STICKY_LEAD_THRESHOLD,
        text: `${challenger.template.name}领先${gap}分，未到${STICKY_LEAD_THRESHOLD}分阈值，维持现推荐`,
      };
    } else {
      challenger.sticky = {
        state: "switched",
        previous: current.template.name,
        gap,
        threshold: STICKY_LEAD_THRESHOLD,
        text: `${challenger.template.name}领先${gap}分，达到${STICKY_LEAD_THRESHOLD}分阈值，允许易主`,
      };
    }
    return rows;
  }

  function rank(templates, selected, weights, limit, opts) {
    const rows = (templates || []).map(t => {
      const base = { template: t, ...scoreTemplate(t, selected, weights) };
      const reachability = reachabilityForTemplate(t, selected, opts);
      if (reachability) {
        base.reachability = reachability;
        base.finalScore = Math.max(0, Math.round(base.score * reachability.coefficient));
      }
      return base;
    });
    if (!opts) return rows.sort((a, b) => b.score - a.score).slice(0, limit || 5);
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
      top.reachability ? `拆分：强度${top.score}分 × 可达${top.reachability.coefficient}（${top.reachability.summary}）=${top.finalScore}分` : "",
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

  function actionLines(template, selected, top) {
    const lines = [];
    const selectedItems = new Set(selected.items || []);
    const selectedUnits = new Set(normalizeSelectedUnits(selected.units || []).map(x => x.name));
    const nextComponent = (template.componentPrefs || []).find(x => !selectedItems.has(x));
    const nextItem = (template.completedPrefs || []).find(x => !selectedItems.has(x));
    const earlyHits = (template.earlyUnits || []).filter(x => selectedUnits.has(x));
    const keep = (template.actions && template.actions.keep || template.earlyUnits || []).slice(0, 4);
    if (nextComponent) lines.push(`下件优先拿${nextComponent}`);
    else if (nextItem) lines.push(`装备往${nextItem}靠`);
    if (earlyHits.length >= 2) lines.push(`围绕${earlyHits.slice(0, 3).join("、")}定线`);
    else if (keep.length) lines.push(`先留${keep.join("、")}`);
    if (top && top.reachability) {
      const miss = top.reachability.missing || [];
      if (miss.length) {
        const first = miss[0];
        const ideal = first.cost <= 1 ? 5 : first.cost === 2 ? 6 : first.cost === 3 ? 7 : first.cost === 4 ? 8 : 9;
        if (top.reachability.level < ideal && first.cost >= 4) lines.push(`缺口全是${first.cost}费，建议先拉${ideal}再D`);
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

  return {
    COMPONENTS,
    ATTACK,
    AP,
    TANK,
    fallbackWeights,
    STICKY_LEAD_THRESHOLD,
    STAR_SCORE_MULTIPLIERS,
    STAR_MILESTONE_BONUS,
    REACHABILITY_GOLD_CAP,
    REACHABILITY_MIN,
    DEFAULT_LEVEL,
    scoreTemplate,
    rank,
    confidence,
    buildOutput,
    signalTowerHtml,
    selectedFromSignals,
    actionLines,
    activeTraitsForTemplate,
    parseTraitsInText,
    normalizeSelectedUnits,
    escText,
  };
});
