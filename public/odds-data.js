(function (root) {
  "use strict";

  // 17.7 数据来源：data/ruleset/monster-invasion-17.7.json ->
  // mechanics.shopOdds.value.baseByPlayerLevel / uniqueUnitCounts.value。
  // 其中 3-6、8、9 级已由当前客户端或公告证据确认；1、2、7 级沿用旧表先验。
  // poolCopies 尚无 17.7 直接证据，只能作为概率模型先验，不能解释为官方确定值。
  root.JCC_ODDS = {
    version: "17.17.7-S18",
    shopOdds: {
      1: [100, 0, 0, 0, 0],
      2: [100, 0, 0, 0, 0],
      3: [75, 25, 0, 0, 0],
      4: [55, 30, 15, 0, 0],
      5: [45, 33, 20, 2, 0],
      6: [25, 40, 30, 5, 0],
      7: [19, 30, 35, 15, 1],
      8: [16, 20, 35, 25, 4],
      9: [9, 15, 30, 30, 16],
      10: [5, 10, 20, 40, 25],
    },
    unitCounts: { 1: 13, 2: 13, 3: 14, 4: 13, 5: 8 },
    poolCopies: { 1: 29, 2: 22, 3: 18, 4: 12, 5: 10 },
    evidence: {
      confirmedLevels: [3, 4, 5, 6, 8, 9],
      priorLevels: [1, 2, 7],
      virtualLevels: [10],
      unitCounts: "confirmed",
      poolCopies: "unverified-prior",
      source: "data/ruleset/monster-invasion-17.7.json",
    },
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
