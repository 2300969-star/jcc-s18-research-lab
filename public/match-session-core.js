(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MatchSessionCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCHEMA_VERSION = 1;
  const MAX_SNAPSHOTS = 60;
  const ADHERENCE = new Set(["followed", "partial", "not-followed", "unknown"]);
  const VERDICTS = new Set(["correct", "late", "wrong-route", "insufficient", "not-judged"]);
  const FAILURE_VERDICTS = new Set(["late", "wrong-route", "insufficient"]);

  function clampText(value, max = 2000) {
    return String(value == null ? "" : value).trim().slice(0, max);
  }

  function finite(value, fallback = null) {
    if (value == null || value === "") return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== "object") return value;
    return Object.keys(value).sort().reduce((out, key) => {
      if (value[key] !== undefined) out[key] = stableValue(value[key]);
      return out;
    }, {});
  }

  function stableStringify(value) {
    return JSON.stringify(stableValue(value));
  }

  function fingerprintFor(value) {
    const text = stableStringify(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `m1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function routeId(row) {
    return row && row.template && (row.template.id || row.template.name) || "";
  }

  function routeName(row) {
    return row && row.template && row.template.name || "";
  }

  function routeScore(row) {
    for (const value of [row && row.score, row && row.finalScore, row && row.stageStrength]) {
      const number = Number(value);
      if (Number.isFinite(number)) return Math.round(number * 10) / 10;
    }
    return 0;
  }

  function compactActionContract(contract) {
    if (!contract) return null;
    const compactPart = value => {
      if (!value) return null;
      if (typeof value === "string") return clampText(value, 300);
      return {
        text: clampText(value.text || value.action || value.label, 300),
        facts: (value.facts || []).slice(0, 4).map(row => clampText(row, 240)),
      };
    };
    return {
      version: finite(contract.version, 1),
      checkpoint: clampText(contract.checkpoint, 40),
      now: compactPart(contract.now),
      check: compactPart(contract.check),
      stay: compactPart(contract.stay),
      switchWhen: (contract.switchWhen || []).slice(0, 4).map(row => clampText(row, 240)),
    };
  }

  function normalizeSignal(row) {
    if (!row || !row.kind) return null;
    const value = clampText(row.value || row.name || row.label, 100);
    if (!value) return null;
    const out = { kind: clampText(row.kind, 40), value };
    if (row.label && row.label !== value) out.label = clampText(row.label, 140);
    if (finite(row.count) != null) out.count = finite(row.count);
    if (finite(row.star) != null) out.star = finite(row.star);
    if (row.holder) out.holder = clampText(row.holder, 80);
    if (row.location) out.location = clampText(row.location, 20);
    if (row.guardian) out.guardian = clampText(row.guardian, 80);
    if (row.status) out.status = clampText(row.status, 40);
    if (finite(row.progress) != null) out.progress = finite(row.progress);
    if (row.commitmentType) out.commitmentType = clampText(row.commitmentType, 60);
    if (row.targetUnit) out.targetUnit = clampText(row.targetUnit, 80);
    if (row.equipped || row.holder) out.equipped = true;
    return out;
  }

  function normalizeAugmentOffer(offer) {
    if (!offer || !Array.isArray(offer.slots)) return null;
    const slots = offer.slots.slice(0, 3).map((slot, index) => ({
      slot: finite(slot && slot.slot, index),
      name: clampText(slot && slot.name, 120),
      seen: [...new Set((slot && slot.seen || []).map(row => clampText(row, 120)).filter(Boolean))],
      rerollsRemaining: Math.max(0, finite(slot && slot.rerollsRemaining, 0)),
      waiting: Boolean(slot && slot.waiting),
    }));
    return {
      round: clampText(offer.round || "unknown", 20),
      status: offer.status === "selected" ? "selected" : "offered",
      slots,
    };
  }

  function normalizeState(input) {
    const signals = (input && input.signals || []).map(normalizeSignal).filter(Boolean)
      .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b), "zh-Hans-CN"));
    return {
      level: Math.max(1, Math.min(10, finite(input && input.level, 1))),
      stage: clampText(input && input.stage || "unknown", 20) || "unknown",
      gold: finite(input && input.gold),
      health: finite(input && input.health),
      heroAugmentRound: clampText(input && input.heroAugmentRound || "unknown", 20) || "unknown",
      manualLockId: clampText(input && input.manualLockId, 160),
      augmentOffer: normalizeAugmentOffer(input && input.augmentOffer),
      signals,
    };
  }

  function decisionFromRanked(ranked) {
    const rows = Array.isArray(ranked) ? ranked : [];
    const decision = ranked && ranked.decision || {};
    const leader = rows[0] || null;
    const execution = rows.find(row => routeId(row) === decision.executionId)
      || rows.find(row => row && row.execution)
      || (decision.status === "insufficient" ? null : leader);
    return {
      status: clampText(decision.status || (execution ? "ranked" : "insufficient"), 40),
      currentId: clampText(decision.currentId || decision.currentBoardId, 180),
      strategicId: clampText(decision.strategicId, 180),
      committedId: clampText(decision.committedId, 180),
      executionId: clampText(decision.executionId || routeId(execution), 180),
      executionName: clampText(decision.executionName || routeName(execution), 180),
      executionFamily: clampText(decision.executionFamily || execution && execution.template && execution.template.family, 140),
      executionScore: routeScore(execution),
      forecastTargetId: clampText(decision.forecast && decision.forecast.targetId, 180),
      actionContract: compactActionContract(decision.actionContract),
      top3: rows.slice(0, 3).map(row => ({ id: routeId(row), name: routeName(row), score: routeScore(row) })),
    };
  }

  function stateIsMeaningful(state) {
    return Boolean(state && (state.signals.length
      || state.stage !== "unknown"
      || state.gold != null
      || state.health != null
      || state.heroAugmentRound !== "unknown"
      || state.manualLockId
      || state.augmentOffer));
  }

  function createSnapshot(input) {
    const state = normalizeState(input && input.state || {});
    const decision = decisionFromRanked(input && input.ranked);
    const fingerprint = fingerprintFor({ state, decision });
    return {
      at: clampText(input && input.at || new Date().toISOString(), 40),
      source: clampText(input && input.source || "state-change", 40),
      raw: clampText(input && input.raw, 500),
      meaningful: stateIsMeaningful(state),
      fingerprint,
      state,
      decision,
    };
  }

  function createSession(meta = {}) {
    const startedAt = clampText(meta.startedAt || new Date().toISOString(), 40);
    return {
      schemaVersion: SCHEMA_VERSION,
      id: clampText(meta.id || `match-${startedAt.replace(/[^0-9]/g, "").slice(0, 17)}`, 100),
      source: meta.source === "synthetic-regression" ? "synthetic-regression" : "match-mode",
      patch: clampText(meta.patch || "unknown", 80),
      startedAt,
      endedAt: "",
      snapshots: [],
      outcome: null,
    };
  }

  function normalizeSession(session) {
    if (!session || !Array.isArray(session.snapshots)) return null;
    const next = createSession(session);
    next.schemaVersion = SCHEMA_VERSION;
    next.endedAt = clampText(session.endedAt, 40);
    next.snapshots = session.snapshots.slice(-MAX_SNAPSHOTS).filter(row => row && row.fingerprint);
    next.outcome = session.outcome || null;
    return next;
  }

  function appendSnapshot(session, snapshot) {
    const next = normalizeSession(session) || createSession();
    if (!snapshot || !snapshot.meaningful) return next;
    const last = next.snapshots[next.snapshots.length - 1];
    if (last && last.fingerprint === snapshot.fingerprint) {
      next.snapshots[next.snapshots.length - 1] = {
        ...last,
        at: snapshot.at || last.at,
        source: snapshot.source !== "state-change" ? snapshot.source : last.source,
        raw: snapshot.raw || last.raw,
      };
      return next;
    }
    next.snapshots.push(snapshot);
    next.snapshots = next.snapshots.slice(-MAX_SNAPSHOTS);
    return next;
  }

  function normalizeOutcome(input) {
    const placement = Math.max(1, Math.min(8, finite(input && input.placement, 8)));
    const adherence = ADHERENCE.has(input && input.adherence) ? input.adherence : "unknown";
    const verdict = VERDICTS.has(input && input.verdict) ? input.verdict : "not-judged";
    return {
      placement,
      resultBand: placement === 1 ? "winner" : placement <= 4 ? "top4" : "bottom4",
      finalRound: clampText(input && input.finalRound, 20),
      adherence,
      verdict,
      note: clampText(input && input.note, 2000),
    };
  }

  function finalizeSession(session, outcome, endedAt) {
    const next = normalizeSession(session) || createSession();
    next.outcome = normalizeOutcome(outcome);
    next.endedAt = clampText(endedAt || new Date().toISOString(), 40);
    return next;
  }

  function sessionQuality(session) {
    const reasons = [];
    if (!session || session.source !== "match-mode") reasons.push("not-real-match-mode");
    if (!session || !session.outcome) reasons.push("missing-outcome");
    const snapshots = session && session.snapshots || [];
    if (snapshots.length < 2) reasons.push("fewer-than-two-states");
    if (!snapshots.some(row => row.state && row.state.signals && row.state.signals.length)) reasons.push("no-assets");
    if (!snapshots.some(row => row.decision && row.decision.executionId)) reasons.push("no-execution-decision");
    return { usable: reasons.length === 0, reasons };
  }

  function calibrationStage(usable) {
    if (usable >= 100) return { id: "holdout-ready", label: "可划分留出集", next: "冻结至少20局作为未调参留出集，再验证符文与路线结论。" };
    if (usable >= 30) return { id: "exploratory", label: "探索校准", next: `继续采集${100 - usable}局；当前只允许看误差方向，不解锁自动首推。` };
    return { id: "collecting", label: "采集中", next: `再完成${30 - usable}局可用复盘，先验证记录链与失败标签。` };
  }

  function summarizeSessions(sessions) {
    const real = (sessions || []).filter(row => row && row.source === "match-mode" && row.outcome);
    const usableRows = real.filter(row => sessionQuality(row).usable);
    const judged = usableRows.filter(row => row.outcome.verdict !== "not-judged");
    const failures = judged.filter(row => FAILURE_VERDICTS.has(row.outcome.verdict));
    const followed = usableRows.filter(row => row.outcome.adherence === "followed");
    const followedTop4 = followed.filter(row => row.outcome.placement <= 4).length;
    const verdicts = Object.fromEntries([...VERDICTS].map(key => [key, usableRows.filter(row => row.outcome.verdict === key).length]));
    return {
      completed: real.length,
      usable: usableRows.length,
      excluded: real.length - usableRows.length,
      judged: judged.length,
      failures: failures.length,
      followed: followed.length,
      followedTop4,
      followedTop4Rate: followed.length ? Math.round(followedTop4 / followed.length * 1000) / 10 : null,
      verdicts,
      stage: calibrationStage(usableRows.length),
    };
  }

  function failureSamples(sessions) {
    return (sessions || []).filter(row => row && row.source === "match-mode" && row.outcome && sessionQuality(row).usable && FAILURE_VERDICTS.has(row.outcome.verdict))
      .map(row => {
        const final = row.snapshots[row.snapshots.length - 1] || {};
        return {
          id: row.id,
          endedAt: row.endedAt,
          placement: row.outcome.placement,
          verdict: row.outcome.verdict,
          note: row.outcome.note,
          finalStage: final.state && final.state.stage || "unknown",
          executionName: final.decision && final.decision.executionName || "",
        };
      });
  }

  function exportBundle(active, history, exportedAt) {
    const sessions = (history || []).map(normalizeSession).filter(Boolean);
    const normalizedActive = normalizeSession(active);
    if (normalizedActive && normalizedActive.snapshots.length) sessions.unshift(normalizedActive);
    return {
      schemaVersion: SCHEMA_VERSION,
      kind: "jcc-match-mode-replay-bundle",
      exportedAt: clampText(exportedAt || new Date().toISOString(), 40),
      boundary: "名次与执行关系仅为观察统计；未经留出集验证，不解释为因果提升。",
      summary: summarizeSessions(sessions),
      failures: failureSamples(sessions),
      sessions,
    };
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function runTests() {
    const ranked = [{ template: { id: "route-a", name: "路线A", family: "A" }, finalScore: 61 }];
    ranked.decision = { status: "planning", executionId: "route-a", actionContract: { version: 1, checkpoint: "3-2", now: { text: "保持当前板", facts: ["事实"] } } };
    const empty = createSnapshot({ state: { level: 6, stage: "unknown", gold: null, health: null, signals: [] }, ranked: [] });
    assert(!empty.meaningful && empty.state.gold === null && empty.state.health === null, "未知金币和血量不得被规范化为0");
    const offered = createSnapshot({ state: { level: 6, augmentOffer: { round: "3-2", status: "offered", slots: [{ name: "符文A", seen: ["符文A"], rerollsRemaining: 1 }] } }, ranked });
    assert(offered.meaningful && offered.state.augmentOffer.slots[0].name === "符文A", "三选一候选与重随状态必须进入比赛回放");
    let session = createSession({ id: "real-1", startedAt: "2026-07-24T00:00:00.000Z", patch: "test" });
    const first = createSnapshot({ at: "2026-07-24T00:01:00.000Z", state: { level: 4, stage: "3-1", signals: [{ kind: "units", value: "安妮" }] }, ranked });
    session = appendSnapshot(session, first);
    session = appendSnapshot(session, { ...first, at: "2026-07-24T00:02:00.000Z", source: "input", raw: "来了安妮" });
    assert(session.snapshots.length === 1 && session.snapshots[0].source === "input", "相同局面必须合并并保留更具体来源");
    ranked.decision = { ...ranked.decision, status: "committed" };
    session = appendSnapshot(session, createSnapshot({ at: "2026-07-24T00:03:00.000Z", state: { level: 5, stage: "3-2", signals: [{ kind: "units", value: "安妮" }] }, ranked }));
    session = finalizeSession(session, { placement: 8, adherence: "followed", verdict: "not-judged" }, "2026-07-24T00:04:00.000Z");
    assert(sessionQuality(session).usable, "两状态、有资产、有执行结论的真实复盘应可用");
    let summary = summarizeSessions([session]);
    assert(summary.usable === 1 && summary.failures === 0 && summary.followedTop4Rate === 0, "不能把第八名自动解释成模型失败");
    const failure = finalizeSession({ ...session, id: "real-2" }, { placement: 6, adherence: "followed", verdict: "wrong-route", note: "路线判断错误" });
    summary = summarizeSessions([session, failure]);
    assert(summary.failures === 1 && failureSamples([session, failure])[0].executionName === "路线A", "只有显式失败标签才能进入失败样本");
    assert(calibrationStage(29).id === "collecting" && calibrationStage(30).id === "exploratory" && calibrationStage(100).id === "holdout-ready", "校准门槛必须固定为30/100局");
    const synthetic = finalizeSession({ ...session, id: "synthetic", source: "synthetic-regression" }, { placement: 1, verdict: "correct" });
    assert(summarizeSessions([synthetic]).usable === 0, "合成回归不得计入真实校准进度");
    const exported = exportBundle(null, [session, failure], "2026-07-24T00:05:00.000Z");
    assert(exported.kind === "jcc-match-mode-replay-bundle" && exported.sessions.length === 2 && !stableStringify(exported).includes("apiKey"), "导出只包含比赛模式复盘数据");
    console.log("match-session-core assertions passed");
  }

  const api = {
    SCHEMA_VERSION,
    MAX_SNAPSHOTS,
    createSession,
    normalizeSession,
    createSnapshot,
    appendSnapshot,
    finalizeSession,
    sessionQuality,
    summarizeSessions,
    failureSamples,
    exportBundle,
    calibrationStage,
    stableStringify,
    runTests,
  };

  if (typeof module === "object" && module.exports && require.main === module) runTests();
  return api;
});
