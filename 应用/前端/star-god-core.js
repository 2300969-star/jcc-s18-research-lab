(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.StarGodCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // All values use a single utility scale close to gold-equivalent value.
  // Coefficients are centralized so later client samples can calibrate them.
  const MODEL = Object.freeze({
    gold: 1,
    experience: 0.95,
    reroll: 1.65,
    component: 8.5,
    completedItem: 15,
    artifact: 22,
    emblem: 12,
    reforger: 2,
    remover: 1.5,
    lesserDuplicator: 9,
    tinyDuplicator: 4,
    stageDiscount: 0.93,
    riskAversion: 0.75,
    hpFloor: 12,
    mainGodOption: 3,
  });
  const OFFERED_GOD_COUNT = 2;

  const COMPONENT_DIRECTION = Object.freeze({
    拳套: "physical",
    反曲之弓: "physical",
    暴风大剑: "physical",
    女神之泪: "magic",
    无用大棒: "magic",
    锁子甲: "tank",
    负极斗篷: "tank",
    巨人腰带: "tank",
  });

  const DIRECTION_LABELS = Object.freeze({
    flexible: "未定",
    physical: "物理",
    magic: "法系",
    tank: "前排",
    economy: "经济",
    highCost: "高费",
  });

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function sigmoid(value) {
    return 1 / (1 + Math.exp(-value));
  }

  function round(value, digits = 1) {
    const scale = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
  }

  function sanitizeOfferedGodIds(values) {
    return [...new Set((values || []).map(Number).filter(Number.isFinite))].slice(0, OFFERED_GOD_COUNT);
  }

  function createState(overrides = {}) {
    return {
      stage: 2,
      round: "2-4",
      level: 5,
      hp: 100,
      gold: 20,
      experienceToLevel: 18,
      streak: 0,
      expectedRounds: 12,
      sharedChoiceCount: 1,
      boardStars: 8,
      distinctCompletedItems: 3,
      interestEarned: 4,
      refreshCount: 0,
      distinctTraits: 4,
      upgradeReady: false,
      componentDirection: "flexible",
      ownedComponents: [],
      ownedCosts: [],
      godHistory: [],
      blessingHistory: [],
      paintedHexes: 0,
      currentMainGod: null,
      ...overrides,
    };
  }

  function deriveMainGod(history) {
    const counts = (history || []).reduce((map, row) => {
      const id = Number(row.godId != null ? row.godId : row);
      map.set(id, (map.get(id) || 0) + 1);
      return map;
    }, new Map());
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    return ranked.length && ranked[0][1] >= 2 ? ranked[0][0] : null;
  }

  function recordChoice(state, choice) {
    const next = createState({
      ...state,
      godHistory: [...(state.godHistory || []), {
        stage: Number(choice.stage),
        godId: Number(choice.godId),
        blessingId: Number(choice.blessingId),
      }],
      blessingHistory: [...(state.blessingHistory || []), Number(choice.blessingId)],
    });
    next.currentMainGod = deriveMainGod(next.godHistory);
    return next;
  }

  function hpMarginalValue(state) {
    const hp = clamp(Number(state.hp) || 0, 0, 100);
    return 0.25 + (100 - hp) / 100 * 0.75;
  }

  function survivalProbability(state, turns = 1) {
    const hp = clamp(Number(state.hp) || 0, 0, 100);
    const streak = Number(state.streak) || 0;
    const perTurnHazard = clamp(0.025 + (45 - hp) / 120 - Math.max(streak, 0) * 0.012 + Math.max(-streak, 0) * 0.02, 0.02, 0.72);
    return round((1 - perTurnHazard) ** Math.max(0, turns), 4);
  }

  function completionProbability(blessing, state) {
    const name = blessing.name;
    if (name === "财富探险") return clamp(sigmoid((state.gold - 38) / 6), 0.05, 0.99);
    if (name === "羁绊探险") return clamp(sigmoid((state.distinctTraits - 4.5) * 1.25), 0.08, 0.98);
    if (name === "星空探险") return state.upgradeReady ? 0.98 : clamp(0.35 + (state.ownedCosts || []).length * 0.04, 0.25, 0.85);
    if (name === "等级探险") return clamp(sigmoid((state.level - 7.2) * 1.5 + state.gold / 40), 0.03, 0.9);
    if (name === "低生命值探险") return state.hp <= 30 ? 1 : clamp(sigmoid((48 - state.hp) / 8), 0.05, 0.95);
    if (name === "刷新探险") return clamp((Number(state.refreshCount) || 0) / 15 + (state.gold || 0) / 45, 0.05, 1);
    return 1;
  }

  function effectRow(label, value, detail) {
    return { label, value: round(value), detail };
  }

  function parseImmediate(blessing, state) {
    const name = blessing.name || "";
    const text = blessing.description || "";
    const effects = [];
    const directGold = text.match(/获得(\d+)金币/) || name.match(/^(\d+)金币$/);
    const experience = text.match(/获得(\d+)经验/) || name.match(/^(\d+)经验$/);
    const rerolls = name.match(/^(\d+)次刷新$/) || text.match(/(\d+)次(?:免费)?刷新/);
    if (directGold) effects.push(effectRow("金币", Number(directGold[1]) * MODEL.gold, `即时${directGold[1]}金币`));
    if (experience) effects.push(effectRow("经验", Number(experience[1]) * MODEL.experience, `${experience[1]}经验`));
    if (rerolls) effects.push(effectRow("刷新", Number(rerolls[1]) * MODEL.reroll, `${rerolls[1]}次刷新`));

    if (/随机基础装备|基础装备锻造器/.test(`${name} ${text}`)) effects.push(effectRow("装备", MODEL.component, "1件基础装备价值"));
    if (/成装锻造器|随机成装/.test(`${name} ${text}`)) effects.push(effectRow("装备", MODEL.completedItem, "1件成装价值"));
    if (/随机神器/.test(`${name} ${text}`)) effects.push(effectRow("装备", MODEL.artifact, "1件神器价值"));
    if (/随机纹章/.test(`${name} ${text}`)) effects.push(effectRow("装备", MODEL.emblem, "1个纹章价值"));
    if (/装备重铸器/.test(`${name} ${text}`)) effects.push(effectRow("灵活", MODEL.reforger, "重铸器保留转型空间"));
    if (/装备拆卸器/.test(`${name} ${text}`)) effects.push(effectRow("灵活", MODEL.remover * 2, "2个拆卸器"));
    if (/次级英雄复制器/.test(`${name} ${text}`)) effects.push(effectRow("棋子", MODEL.lesserDuplicator, "次级复制器"));
    if (/微型英雄复制器/.test(`${name} ${text}`)) {
      const count = Number((name.match(/(\d+)个微型/) || [0, 1])[1]);
      effects.push(effectRow("棋子", MODEL.tinyDuplicator * count, `${count}个微型复制器`));
    }

    const component = Object.keys(COMPONENT_DIRECTION).find(item => name === item || text.includes(`【${item}】`));
    if (component) {
      const aligned = state.componentDirection === "flexible" || state.componentDirection === COMPONENT_DIRECTION[component];
      effects.push(effectRow("装备方向", MODEL.component * (aligned ? 1.22 : 0.82), `${component}→${DIRECTION_LABELS[COMPONENT_DIRECTION[component]]}${aligned ? "吻合" : "偏离"}`));
    }

    const hp = Number((name.match(/^(\d+)小小英雄生命值/) || text.match(/获得(\d+)小小英雄生命值/))?.[1] || 0);
    if (hp) effects.push(effectRow("容错", hp * hpMarginalValue(state), `${hp}玩家生命，当前边际价值${round(hpMarginalValue(state), 2)}`));

    const starredUnit = `${name} ${text}`.match(/(?:(\d+)个)?(?:随机)?(\d+)星(\d+)费弈子/);
    if (starredUnit) {
      const quantity = Number(starredUnit[1] || 1);
      const star = Number(starredUnit[2]);
      const cost = Number(starredUnit[3]);
      const copies = star === 3 ? 9 : star === 2 ? 3 : 1;
      const tempoPremium = star >= 2 ? 1.2 : 1;
      effects.push(effectRow("棋子", quantity * copies * cost * tempoPremium, `${quantity}个${star}星${cost}费的卡面与即时战力`));
    }

    return effects;
  }

  function evaluateAsol(blessing, state, parts) {
    const completion = completionProbability(blessing, state);
    const reward = {
      财富探险: MODEL.component + 4,
      羁绊探险: MODEL.emblem + MODEL.reforger,
      星空探险: 10,
      等级探险: 20,
      低生命值探险: 21,
      刷新探险: MODEL.component * 2,
      "奥瑞利安·索尔的恩赐": 17,
    }[blessing.name] || 8;
    parts.flexibility += reward * completion;
    parts.delay += reward * (1 - completion) * 0.35;
    parts.risk += reward * (1 - completion) * 0.28;
    parts.notes.push(`任务完成率${Math.round(completion * 100)}%`);
  }

  function evaluateYasuo(blessing, state, parts) {
    const affinity = {
      烈阳格: state.componentDirection === "magic" ? 1.2 : 1,
      宇宙格: state.componentDirection === "tank" ? 1.25 : 1,
      增速格: state.componentDirection === "physical" ? 1.3 : 0.95,
      星光格: state.componentDirection === "magic" ? 1.3 : 1,
      风暴格: 1.12,
      冰晶格: state.componentDirection === "tank" ? 1.25 : 1.05,
      "亚索的恩赐": 1 + Math.max(2, state.paintedHexes || 0) * 0.16,
    }[blessing.name] || 1;
    parts.combat += 9.5 * affinity;
    parts.commitment += 1.5;
    parts.notes.push(`永久格强度×${round(affinity, 2)}`);
  }

  function evaluateKayle(blessing, state, parts) {
    if (blessing.name === "凯尔的恩赐") {
      const diversity = Number(state.distinctCompletedItems) || 0;
      parts.combat += Math.min(12, diversity) * 1.35;
      parts.notes.push(`${diversity}种成装转为全队属性`);
    }
    if (/精工细作|锻造器转变|神圣返还/.test(blessing.name)) {
      parts.flexibility += 5 + (state.expectedRounds || 0) * 0.35;
      parts.notes.push("装备供给具有后续复利");
    }
  }

  function evaluateAhri(blessing, state, parts) {
    const shared = clamp(Number(state.sharedChoiceCount) || 1, 1, 8);
    if (/联手致富/.test(blessing.name)) {
      const extra = shared >= 5 ? (blessing.stage >= 3 ? 2 : 1) : 0;
      parts.economy += extra;
      parts.notes.push(`共选${shared}人，联手额外${extra}金`);
    }
    if (/贪婪之宝箱/.test(blessing.name)) {
      const pool = blessing.stage === 2 ? 12 : blessing.stage === 3 ? 16 : 25;
      parts.economy += Math.floor(pool / shared);
      parts.risk += shared > 4 ? 1.5 : 0.5;
      parts.notes.push(`${shared}人平分${pool}金`);
    }
    if (/神圣投资/.test(blessing.name)) {
      const rounds = Math.max(3, Number(state.expectedRounds) || 0);
      parts.economy += Math.min(rounds, 8) * 0.72;
      parts.notes.push("最大利息上限产生复利");
    }
    if (blessing.name === "每回合金币?") parts.economy += Math.max(0, state.expectedRounds) * MODEL.stageDiscount;
    if (blessing.name === "赐福：财富") parts.combat += 6.5;
    if (blessing.name === "阿狸的恩赐") {
      parts.combat += Number(state.level) * 1.3;
      parts.economy += Math.max(0, state.expectedRounds) * MODEL.experience * 2 * 0.55;
    }
  }

  function evaluateVarus(blessing, state, parts) {
    const ownedCosts = state.ownedCosts || [];
    if (/现有的3费/.test(blessing.name)) parts.flexibility += ownedCosts.includes(3) ? 7 : 3;
    if (/现有的4费/.test(blessing.name)) parts.flexibility += ownedCosts.includes(4) ? 10 : 4;
    if (/3费商店/.test(blessing.name)) parts.economy += state.level <= 6 ? 9 : 5;
    if (/4费商店/.test(blessing.name)) parts.economy += state.level >= 7 ? 13 : 8;
    if (/5费商店/.test(blessing.name)) parts.economy += state.level >= 8 ? 18 : 11;
    if (/恋人/.test(blessing.name)) parts.flexibility += 8 + blessing.stage * 2;
    if (/升星缘分/.test(blessing.name)) parts.combat += state.level <= 6 ? 14 : 8;
    if (blessing.name === "短生刷新") parts.economy += Math.min(8, state.expectedRounds) * 1.15;
    if (blessing.name === "韦鲁斯的恩赐") {
      parts.combat += (Number(state.boardStars) || 0) * 0.8;
      parts.flexibility += state.level >= 8 ? 7 : 4;
      parts.notes.push("5费概率+2%与总星级联动");
    }
  }

  function evaluateEkko(blessing, state, parts) {
    const turns = Number((blessing.description.match(/在(\d+)个?回合后/) || [0, 0])[1]);
    if (turns > 0) {
      const survive = survivalProbability(state, turns);
      const gross = /神器/.test(blessing.name) ? MODEL.artifact
        : /成装/.test(blessing.name) ? MODEL.completedItem
          : /基础装备/.test(blessing.name) ? MODEL.component
            : /5费商店/.test(blessing.name) ? 18
              : /2个5费/.test(blessing.name) ? 10
                : /4费弈子/.test(blessing.name) ? 4 : 9;
      parts.delay += gross * survive;
      parts.risk += gross * (1 - survive) * MODEL.riskAversion;
      parts.notes.push(`${turns}回合延迟，存活率${Math.round(survive * 100)}%`);
    }
    if (blessing.name === "赐福：速度") parts.combat += state.componentDirection === "physical" ? 10 : 7;
    if (blessing.name === "现金流") parts.economy += Math.max(0, state.expectedRounds) * 2 * 0.72;
    if (blessing.name === "迅捷蟹派对") {
      parts.economy += 7;
      parts.flexibility += 4;
    }
    if (blessing.name === "神圣干预") {
      const completion = state.hp <= 30 ? 1 : sigmoid((42 - state.hp) / 7);
      parts.delay += 14 * completion;
      parts.risk += 4 * (1 - completion);
    }
    if (blessing.name === "艾克的恩赐") {
      parts.combat += 14;
      parts.flexibility += 5;
      parts.notes.push("突变价值按定位适配折算");
    }
  }

  function evaluateThresh(blessing, state, parts) {
    if (/随机恩赐/.test(blessing.name)) {
      parts.flexibility += 9;
      parts.risk += 2.5;
      parts.notes.push("跨星神随机池，按均值-CVaR估值");
    }
    if (blessing.name === "神秘战利品") {
      parts.flexibility += 8;
      parts.risk += 4;
      parts.notes.push("奖池未公开，保守折价");
    }
    if (blessing.name === "迷你变形重组器") {
      const lowCostCount = (state.ownedCosts || []).filter(cost => cost <= 2).length;
      parts.economy += lowCostCount * 1.75;
      parts.risk += lowCostCount ? 2 : 5;
      parts.commitment += 2;
    }
    if (blessing.name === "掷骰子") {
      parts.economy += 10.5;
      parts.risk += 1.8;
      parts.notes.push("3D6期望10.5金");
    }
    if (blessing.name === "锤石的恩赐") {
      parts.combat += 7;
      parts.economy += 5;
      parts.risk += 3;
      parts.notes.push("骰子奖池未知，暂用保守混合价值");
    }
  }

  function evaluateSoraka(blessing, state, parts) {
    if (/索拉卡的拥抱/.test(blessing.name)) {
      parts.combat += state.componentDirection === "tank" ? 12 : 9;
      parts.notes.push("首个阵亡位获得下回合护盾");
    }
    if (/赐福：兴盛/.test(blessing.name)) {
      const growth = blessing.name.endsWith("+") ? 6 : 4;
      parts.combat += 5 + Math.min(10, state.interestEarned || 0) * growth / 12;
    }
    if (blessing.name === "赐福：体型") parts.combat += 12;
    if (blessing.name === "神圣共情") {
      const thresholds = [66, 33].filter(limit => state.hp > limit).length;
      parts.delay += thresholds * MODEL.component * 0.58;
      parts.risk += thresholds * 1.2;
    }
    if (blessing.name === "索拉卡的恩赐") {
      const lostHp = 100 - clamp(state.hp, 0, 100);
      parts.combat += Math.min(20, lostHp * 0.16);
      parts.economy += Math.min(8, state.expectedRounds) * hpMarginalValue(state);
      parts.notes.push(`已损失${lostHp}生命转全队生命`);
    }
  }

  function evaluateEvelynn(blessing, state, parts) {
    const hpLoss = Number((blessing.description.match(/失去(\d+)(?:小小英雄|弈士|玩家)生命值/) || [0, 0])[1]);
    if (hpLoss) {
      parts.risk += hpLoss * hpMarginalValue(state) * 1.2;
      if (state.hp - hpLoss < MODEL.hpFloor) parts.risk += 12;
      parts.notes.push(`支付${hpLoss}生命`);
    }
    if (/猩红契约/.test(blessing.name)) {
      const shared = clamp(Number(state.sharedChoiceCount) || 1, 1, 8);
      const per = blessing.stage >= 4 ? 1 : 2;
      parts.risk += shared * per * hpMarginalValue(state);
      parts.notes.push(`共选${shared}人，额外失去${shared * per}生命`);
    }
    if (/碾压之势/.test(blessing.name)) {
      const continuation = clamp(0.52 + Math.max(0, state.streak) * 0.08 - Math.max(0, -state.streak) * 0.1, 0.12, 0.92);
      const repeats = (1 - continuation ** Math.min(6, state.expectedRounds)) / Math.max(0.08, 1 - continuation);
      parts.economy += repeats * (blessing.name.endsWith("+") ? 4 : 3);
      parts.risk += (1 - continuation) * 4;
      parts.notes.push(`连胜续航期望${round(repeats)}回合`);
    }
    if (/无法购买弈子/.test(blessing.description)) {
      const lockRisk = state.gold >= 30 ? 5 : 9;
      parts.commitment += lockRisk;
      parts.notes.push("锁商店2回合");
    }
    if (blessing.name === "决赛圈胜负手") {
      const topFour = clamp(0.28 + state.hp / 170 + Math.max(state.streak, 0) * 0.04, 0.15, 0.9);
      parts.economy += 30 * topFour;
      parts.risk += 5 * (1 - topFour);
    }
    if (blessing.name === "伊芙琳的恩赐") {
      parts.combat += 14;
      parts.risk += Math.max(0, -state.streak) * hpMarginalValue(state);
      parts.notes.push("10%减伤，但败局额外掉血");
    }
  }

  const GOD_EVALUATORS = Object.freeze({
    奥瑞利安·索尔: evaluateAsol,
    亚索: evaluateYasuo,
    凯尔: evaluateKayle,
    阿狸: evaluateAhri,
    韦鲁斯: evaluateVarus,
    艾克: evaluateEkko,
    锤石: evaluateThresh,
    索拉卡: evaluateSoraka,
    伊芙琳: evaluateEvelynn,
  });

  function evaluateBlessing(blessing, rawState = {}) {
    const state = createState(rawState);
    const parts = { combat: 0, economy: 0, flexibility: 0, delay: 0, risk: 0, commitment: 0, notes: [] };
    const immediateEffects = ["quest", "delayed"].includes(blessing.mechanism) ? [] : parseImmediate(blessing, state);
    for (const effect of immediateEffects) {
      if (effect.label === "金币" || effect.label === "经验" || effect.label === "刷新") parts.economy += effect.value;
      else if (effect.label === "容错") parts.flexibility += effect.value;
      else parts.flexibility += effect.value;
      parts.notes.push(effect.detail);
    }
    const evaluator = GOD_EVALUATORS[blessing.godName];
    if (evaluator) evaluator(blessing, state, parts);
    if (blessing.mainGod) parts.flexibility += MODEL.mainGodOption;
    const gross = parts.combat + parts.economy + parts.flexibility + parts.delay;
    const total = Math.max(0, gross - parts.risk - parts.commitment);
    const coverage = total > 0 ? "modeled" : "partial";
    return {
      blessingId: blessing.id,
      godId: blessing.godId,
      godName: blessing.godName,
      name: blessing.name,
      stage: blessing.stage,
      mainGod: !!blessing.mainGod,
      total: round(total),
      parts: Object.fromEntries(Object.entries(parts).filter(([key]) => key !== "notes").map(([key, value]) => [key, round(value)])),
      notes: [...new Set(parts.notes)].slice(0, 4),
      coverage,
      description: blessing.description,
    };
  }

  function rankBlessings(blessings, state, offeredGodIds = []) {
    const offered = new Set((offeredGodIds || []).map(Number));
    return (blessings || [])
      .filter(row => Number(row.stage) === Number(state.stage))
      .filter(row => !offered.size || offered.has(Number(row.godId)))
      .filter(row => !row.mainGod)
      .map(row => evaluateBlessing(row, state))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "zh-CN"));
  }

  function evaluateGodOffer(blessings, state, godId, blessingId) {
    const candidates = (blessings || [])
      .filter(row => Number(row.stage) === Number(state.stage))
      .filter(row => Number(row.godId) === Number(godId))
      .filter(row => !row.mainGod);
    if (!candidates.length) return null;

    const exact = blessingId == null ? null : candidates.find(row => Number(row.id) === Number(blessingId));
    if (exact) {
      const result = evaluateBlessing(exact, state);
      return {
        ...result,
        offerMode: "exact",
        candidateCount: 1,
        range: { min: result.total, max: result.total },
      };
    }

    const evaluated = candidates.map(row => evaluateBlessing(row, state));
    const partKeys = ["combat", "economy", "flexibility", "delay", "risk", "commitment"];
    const average = values => round(values.reduce((sum, value) => sum + value, 0) / values.length);
    const totals = evaluated.map(row => row.total);
    return {
      blessingId: null,
      godId: Number(godId),
      godName: evaluated[0].godName,
      name: "待录本轮实际赐福",
      stage: Number(state.stage),
      mainGod: false,
      total: average(totals),
      parts: Object.fromEntries(partKeys.map(key => [key, average(evaluated.map(row => row.parts[key]))])),
      notes: [
        `未录具体赐福，按${evaluated.length}项简单均值预估`,
        `价值范围${Math.min(...totals)}-${Math.max(...totals)}`,
      ],
      coverage: "estimate",
      description: "请录入游戏中这位星神当前展示的具体赐福后再做实战选择。",
      offerMode: "average",
      candidateCount: evaluated.length,
      range: { min: Math.min(...totals), max: Math.max(...totals) },
    };
  }

  function rankGodOffers(blessings, state, offeredGodIds = [], selectedBlessingIds = {}) {
    const ids = sanitizeOfferedGodIds(offeredGodIds);
    return ids
      .map(godId => {
        const blessingId = selectedBlessingIds instanceof Map
          ? selectedBlessingIds.get(godId)
          : selectedBlessingIds[godId] ?? selectedBlessingIds[String(godId)];
        return evaluateGodOffer(blessings, state, godId, blessingId);
      })
      .filter(Boolean)
      .sort((a, b) => b.total - a.total || a.godName.localeCompare(b.godName, "zh-CN"));
  }

  function mainGodProjection(blessings, state) {
    if (!state.currentMainGod) return null;
    const blessing = (blessings || []).find(row => row.mainGod && Number(row.godId) === Number(state.currentMainGod));
    return blessing ? evaluateBlessing(blessing, state) : null;
  }

  function recommendByGod(blessings, state, offeredGodIds = []) {
    const ranked = rankBlessings(blessings, state, offeredGodIds);
    const best = new Map();
    for (const row of ranked) if (!best.has(row.godId)) best.set(row.godId, row);
    return [...best.values()].sort((a, b) => b.total - a.total || a.godName.localeCompare(b.godName, "zh-CN"));
  }

  function transitionState(state, blessing) {
    const next = createState(state);
    const text = blessing.description || "";
    const gold = Number((text.match(/获得(\d+)金币/) || blessing.name.match(/^(\d+)金币$/) || [0, 0])[1]);
    const xp = Number((text.match(/获得(\d+)经验/) || blessing.name.match(/^(\d+)经验$/) || [0, 0])[1]);
    const hp = Number((text.match(/获得(\d+)小小英雄生命值/) || blessing.name.match(/^(\d+)小小英雄生命值/) || [0, 0])[1]);
    const hpLoss = Number((text.match(/失去(\d+)(?:小小英雄|弈士|玩家)生命值/) || [0, 0])[1]);
    next.gold += gold;
    next.experienceToLevel = Math.max(0, next.experienceToLevel - xp);
    next.hp = clamp(next.hp + hp - hpLoss, 0, 100);
    if (/格$/.test(blessing.name)) next.paintedHexes += 1;
    return recordChoice(next, {
      stage: blessing.stage,
      godId: blessing.godId,
      blessingId: blessing.id,
    });
  }

  function assertCore() {
    const low = createState({ hp: 20, stage: 4 });
    const high = createState({ hp: 90, stage: 4 });
    const soraka = { id: 1, godId: 9, godName: "索拉卡", stage: 4, name: "12小小英雄生命值", description: "12小小英雄生命值", mechanism: "economy" };
    if (evaluateBlessing(soraka, low).total <= evaluateBlessing(soraka, high).total) throw new Error("低血量时索拉卡生命价值必须上升");
    const eve = { id: 2, godId: 10, godName: "伊芙琳", stage: 4, name: "随机成装", description: "获得1个随机成装。失去5小小英雄生命值。", mechanism: "special" };
    if (evaluateBlessing(eve, low).total >= evaluateBlessing(eve, high).total) throw new Error("低血量时伊芙琳卖血价值必须下降");
    const asol = { id: 3, godId: 2, godName: "奥瑞利安·索尔", stage: 2, name: "财富探险", description: "当你积攒到50金币时，获得一个基础装备锻造器和4金币。", mechanism: "quest" };
    if (evaluateBlessing(asol, { gold: 48 }).total <= evaluateBlessing(asol, { gold: 10 }).total) throw new Error("索尔财富任务必须随金币接近阈值升值");
    const ekko = { id: 4, godId: 7, godName: "艾克", stage: 4, name: "随机神器", description: "在5个回合后，获得1个随机神器。", mechanism: "delayed" };
    if (evaluateBlessing(ekko, low).total >= evaluateBlessing(ekko, high).total) throw new Error("艾克延迟奖励必须受生存折现");
    const state = recordChoice(recordChoice(createState(), { stage: 2, godId: 4, blessingId: 1 }), { stage: 3, godId: 4, blessingId: 2 });
    if (state.currentMainGod !== 4) throw new Error("重复选择同一星神后必须识别主神");
    if (sanitizeOfferedGodIds([2, 3, 4]).join(",") !== "2,3") throw new Error("本局候选星神必须严格限制为2位");
    const offers = [
      { id: 10, godId: 2, godName: "奥瑞利安·索尔", stage: 2, name: "低值", description: "获得2金币", mechanism: "economy" },
      { id: 11, godId: 2, godName: "奥瑞利安·索尔", stage: 2, name: "高值", description: "获得20金币", mechanism: "economy" },
      { id: 12, godId: 3, godName: "亚索", stage: 2, name: "宇宙格", description: "获得一个强化格", mechanism: "painted-hex" },
    ];
    const estimated = rankGodOffers(offers, createState({ stage: 2 }), [2, 3]);
    const asolEstimate = estimated.find(row => row.godId === 2);
    if (asolEstimate.offerMode !== "average" || asolEstimate.total >= evaluateBlessing(offers[1], createState({ stage: 2 })).total) {
      throw new Error("未录具体赐福时禁止用同神最佳奖励冒充实战价值");
    }
    const exactOffers = rankGodOffers(offers, createState({ stage: 2 }), [2, 3], { 2: 10, 3: 12 });
    if (exactOffers.length !== 2 || exactOffers.some(row => row.offerMode !== "exact")) throw new Error("两份实际赐福必须精确比较");
    return true;
  }

  if (typeof module === "object" && module.exports && require.main === module) {
    assertCore();
    console.log("star-god-core assertions passed");
  }

  return {
    MODEL,
    OFFERED_GOD_COUNT,
    COMPONENT_DIRECTION,
    DIRECTION_LABELS,
    clamp,
    round,
    sanitizeOfferedGodIds,
    createState,
    deriveMainGod,
    recordChoice,
    transitionState,
    survivalProbability,
    completionProbability,
    evaluateBlessing,
    rankBlessings,
    evaluateGodOffer,
    rankGodOffers,
    mainGodProjection,
    recommendByGod,
    assertCore,
  };
});
