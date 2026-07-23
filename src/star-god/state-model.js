"use strict";

const Core = require("../../public/star-god-core.js");

function stageToRound(stage) {
  return ({ 2: "2-4", 3: "3-4", 4: "4-4" })[Number(stage)] || "2-4";
}

function advanceStage(state, stage) {
  return Core.createState({
    ...state,
    stage: Number(stage),
    round: stageToRound(stage),
  });
}

function applySelectedBlessing(state, blessing) {
  if (!blessing || Number(blessing.stage) !== Number(state.stage)) {
    throw new Error("赐福阶段与当前状态不一致");
  }
  return Core.transitionState(state, blessing);
}

function availableMainBlessings(catalog, state) {
  if (!state.currentMainGod) return [];
  return catalog.blessings.filter(row => row.mainGod && Number(row.godId) === Number(state.currentMainGod));
}

function assertStateModel() {
  let state = Core.createState({ stage: 2 });
  state = Core.recordChoice(state, { stage: 2, godId: 7, blessingId: 1 });
  state = advanceStage(state, 3);
  state = Core.recordChoice(state, { stage: 3, godId: 7, blessingId: 2 });
  if (state.currentMainGod !== 7 || state.round !== "3-4") throw new Error("阶段推进或主神状态错误");
  return true;
}

if (require.main === module) {
  assertStateModel();
  console.log("star-god state model assertions passed");
}

module.exports = {
  ...Core,
  stageToRound,
  advanceStage,
  applySelectedBlessing,
  availableMainBlessings,
  assertStateModel,
};
