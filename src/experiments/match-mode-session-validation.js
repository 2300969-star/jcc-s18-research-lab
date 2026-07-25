// 比赛模式回放契约：真实调用 MatcherCore.rank，再验证会话记录与复盘统计。
const path = require("path");

const root = path.resolve(__dirname, "../..");
const MatcherCore = require(path.join(root, "public", "matcher-core.js"));
const MatchSessionCore = require(path.join(root, "public", "match-session-core.js"));
const matcherData = require(path.join(root, "artifacts", "results", "stage2_matcher_results.json"));
const hands = require(path.join(root, "tests", "fixtures", "hands.json"));
const oddsData = require(path.join(root, "public", "odds-data.js"));
const mechanismData = require(path.join(root, "public", "mechanism-data.js"));

const unitPrices = Object.fromEntries((matcherData.options.unitSearch || []).map(row => [row.name, row.price]));
const unitTraits = Object.fromEntries((matcherData.options.unitSearch || []).map(row => [row.name, row.traits || []]));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function rankHand(fixture, stage, gold, health) {
  const signals = [
    ...(fixture.signals || []),
    { kind: "levels", level: fixture.level },
    { kind: "stage", value: stage },
    { kind: "gold", value: gold },
    { kind: "health", value: health },
  ];
  const selected = MatcherCore.selectedFromSignals(signals);
  return {
    signals: fixture.signals,
    selected,
    ranked: MatcherCore.rank(matcherData.templates, selected, matcherData.weights, 5, {
      oddsData,
      unitPrices,
      unitTraits,
      mechanismData,
      heroAugments: matcherData.options.heroAugments || [],
      antiFragile: fixture.level >= 4,
      operationalCommitment: true,
      manualLockId: "",
    }),
  };
}

const earlyFixture = hands.find(row => row.id === "kaisa-threat-l2");
const lateFixture = hands.find(row => row.id === "jax-mecha-l8");
assert(earlyFixture && lateFixture, "比赛模式回放验证缺少固定手牌");

const early = rankHand(earlyFixture, "2-1", 10, 100);
const late = rankHand(lateFixture, "5-1", 30, 42);
const offeredAugments = (matcherData.options.heroAugments || []).slice(0, 3).map((row, slot) => ({
  slot,
  name: row.name,
  seen: [row.name],
  rerollsRemaining: 3,
  waiting: false,
}));
assert(early.ranked.decision && ["observing", "insufficient"].includes(early.ranked.decision.status), "低等级比赛模式不得锁定终局");
assert(late.ranked.decision && late.ranked.decision.executionId, "后期比赛模式必须产生可记录的执行路线");

let synthetic = MatchSessionCore.createSession({
  id: "match-mode-contract-regression",
  source: "synthetic-regression",
  patch: matcherData.version,
  startedAt: "2026-07-24T00:00:00.000Z",
});

const earlySnapshot = MatchSessionCore.createSnapshot({
  at: "2026-07-24T00:01:00.000Z",
  source: "synthetic-regression",
  state: { level: earlyFixture.level, stage: "2-1", gold: 10, health: 100, signals: early.signals, augmentOffer: { round: "2-1", status: "offered", slots: offeredAugments } },
  ranked: early.ranked,
});
synthetic = MatchSessionCore.appendSnapshot(synthetic, earlySnapshot);

const reorderedSnapshot = MatchSessionCore.createSnapshot({
  at: "2026-07-24T00:02:00.000Z",
  source: "synthetic-regression",
  state: { level: earlyFixture.level, stage: "2-1", gold: 10, health: 100, signals: [...early.signals].reverse(), augmentOffer: { round: "2-1", status: "offered", slots: offeredAugments } },
  ranked: early.ranked,
});
synthetic = MatchSessionCore.appendSnapshot(synthetic, reorderedSnapshot);
assert(synthetic.snapshots.length === 1, "同一比赛状态不得因输入顺序不同重复记账");
assert(synthetic.snapshots[0].state.augmentOffer.slots.length === 3 && synthetic.snapshots[0].state.augmentOffer.slots.every(row => row.rerollsRemaining === 3), "比赛回放必须保存三栏候选与各栏重随次数");

const lateSnapshot = MatchSessionCore.createSnapshot({
  at: "2026-07-24T00:03:00.000Z",
  source: "synthetic-regression",
  state: { level: lateFixture.level, stage: "5-1", gold: 30, health: 42, signals: late.signals },
  ranked: late.ranked,
});
synthetic = MatchSessionCore.appendSnapshot(synthetic, lateSnapshot);
assert(synthetic.snapshots.length === 2, "比赛状态变化必须形成新的回放快照");
assert(lateSnapshot.decision.executionId === late.ranked.decision.executionId, "回放执行路线必须精确等于比赛模式决策层输出");
assert(lateSnapshot.decision.top3.map(row => row.id).join("|") === late.ranked.slice(0, 3).map(row => row.template.id || row.template.name).join("|"), "回放前三路线必须来自比赛模式真分榜");

synthetic = MatchSessionCore.finalizeSession(synthetic, {
  placement: 2,
  finalRound: "6-3",
  adherence: "followed",
  verdict: "correct",
});
assert(MatchSessionCore.summarizeSessions([synthetic]).usable === 0, "合成比赛回放不得污染真实校准进度");

const realContract = MatchSessionCore.finalizeSession({ ...synthetic, id: "real-contract", source: "match-mode", outcome: null, endedAt: "" }, {
  placement: 6,
  finalRound: "5-5",
  adherence: "followed",
  verdict: "not-judged",
});
let summary = MatchSessionCore.summarizeSessions([realContract]);
assert(summary.usable === 1 && summary.failures === 0, "名次本身不得自动生成比赛模式失败样本");

const explicitFailure = MatchSessionCore.finalizeSession({ ...realContract, id: "real-explicit-failure", outcome: null, endedAt: "" }, {
  placement: 6,
  finalRound: "5-5",
  adherence: "followed",
  verdict: "late",
  note: "止损提醒晚一个阶段",
});
summary = MatchSessionCore.summarizeSessions([realContract, explicitFailure]);
assert(summary.failures === 1 && MatchSessionCore.failureSamples([realContract, explicitFailure])[0].verdict === "late", "只有明确复盘标签才能生成比赛模式失败样本");

console.log(`match-mode replay validation passed (${synthetic.snapshots.length} state transitions, execution ${lateSnapshot.decision.executionName})`);
