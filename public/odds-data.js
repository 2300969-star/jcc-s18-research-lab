(function (root) {
  "use strict";

  // 来源说明：
  // 1. 商店概率来自本项目 discover.js 的 SHOP_ODDS 常量；
  // 2. data/config.js 提供棋子费用，但未提供商店概率/每张牌池份数；
  // 3. poolCopies 采用 S8 同口径每张牌池份数，用于估算期望 D 牌金币。
  root.JCC_ODDS = {
    shopOdds: {
      1: [100, 0, 0, 0, 0],
      2: [100, 0, 0, 0, 0],
      3: [75, 25, 0, 0, 0],
      4: [55, 30, 15, 0, 0],
      5: [45, 33, 20, 2, 0],
      6: [25, 40, 30, 5, 0],
      7: [19, 30, 35, 15, 1],
      8: [18, 25, 32, 22, 3],
      9: [10, 20, 25, 35, 10],
    },
    unitCounts: { 1: 13, 2: 13, 3: 14, 4: 13, 5: 9 },
    poolCopies: { 1: 29, 2: 22, 3: 18, 4: 12, 5: 10 },
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
