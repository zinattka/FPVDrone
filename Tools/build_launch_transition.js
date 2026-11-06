// Merge compiler-produced launch functions into the exact preserved release PEX.
// The old controller/native interface is retained; relative branches are relocated.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const crypto = require('crypto');
const { parse, write } = require('./pex');
const { buildOperatorPose } = require('./build_operator_pose');
const root = path.resolve(__dirname, '..');
const baselinePath = path.join(root, '_build/baseline/0.1.28/Scripts/FPVDroneQuestScript.pex');
const fragmentPath = path.join(root, '_build/launch_transition/FPVDroneQuestScript.pex');
const outputPath = path.join(root, '_build/launch_transition/candidate/FPVDroneQuestScript.pex');
const digest = b => crypto.createHash('sha256').update(b).digest('hex');
const baseline = fs.readFileSync(baselinePath);
assert.equal(digest(baseline), '41263e7424e1939c910caeb400e75984efb78e8f2263e1cfe292fdc50dacf969', 'Unexpected baseline');
const original = parse(baseline);
assert.ok(write(original).equals(baseline), 'Baseline codec must be byte-identical');
const result = structuredClone(original);
const fragment = parse(fs.readFileSync(fragmentPath));
const obj = result.objects[0], additions = fragment.objects[0];
assert.equal(obj.name, additions.name);
assert.equal(obj.parent.toLowerCase(), additions.parent.toLowerCase());
result.strings = [...new Set([...result.strings, ...fragment.strings])];
for (const v of additions.variables) {
  const old = obj.variables.find(x => x.name.toLowerCase() === v.name.toLowerCase());
  if (old) assert.equal(old.type.toLowerCase(), v.type.toLowerCase(), `Shared type ${v.name}`);
  else {
    assert.ok(v.name.replace(/^::/, '').toLowerCase().startsWith('fpvtransition'), `Unexpected variable ${v.name}`);
    obj.variables.push(v);
  }
}
const addedProperties = [];
for (const property of additions.properties) {
  const old = obj.properties.find(p => p.name.toLowerCase() === property.name.toLowerCase());
  if (old) { assert.equal(old.type.toLowerCase(), property.type.toLowerCase()); continue; }
  assert.ok(['FPVTransitionControllerDevices', 'FPVTransitionControllerStatus'].includes(property.name), `Unexpected property ${property.name}`);
  assert.ok(property.bits & 4, 'Controller properties must use auto backing variables');
  obj.properties.push(property); addedProperties.push(property.name);
}
const state = obj.states.find(s => s.name === '');
const newFunctions = additions.states.find(s => s.name === '').functions.filter(f => /^FPVTransition/i.test(f.name));
for (const f of newFunctions) {
  assert.ok(!state.functions.some(x => x.name.toLowerCase() === f.name.toLowerCase()));
  state.functions.push(f);
  const debug = fragment.debugFuncs?.find(d => d.function === f.name && d.type === 0);
  if (debug) result.debugFuncs.push(debug);
}
const id = v => ({ t: 1, v });
const str = v => {
  if (!result.strings.includes(v)) result.strings.push(v);
  return { t: 2, v };
};
const int = v => ({ t: 3, v });
const call = (name, args = [], dest = '::nonevar') => ({ op: 'callmethod', a: [id(name), id('self'), id(dest), int(args.length), ...args] });
const get = name => { const f = state.functions.find(x => x.name === name); assert.ok(f, name); return f; };
const changed = new Set();
function insert(name, positions) {
  const f = get(name), old = f.code, out = [], targets = [], locations = [];
  const debug = result.debugFuncs.find(d => d.function === name && d.type === 0);
  assert.ok(debug && debug.lines.length === old.length, `Debug mapping ${name}`);
  const lines = [];
  for (let i = 0; i <= old.length; i++) {
    targets[i] = out.length;
    for (const ins of positions.get(i) || []) { out.push(ins); lines.push(debug.lines[Math.min(i, old.length - 1)]); }
    if (i < old.length) { locations[i] = out.length; out.push(structuredClone(old[i])); lines.push(debug.lines[i]); }
  }
  old.forEach((ins, i) => {
    const offsetArg = ins.op === 'jmp' ? 0 : ['jmpt', 'jmpf'].includes(ins.op) ? 1 : -1;
    if (offsetArg >= 0) {
      const target = i + ins.a[offsetArg].v;
      assert.ok(target >= 0 && target <= old.length, `Original branch ${name}:${i}`);
      out[locations[i]].a[offsetArg].v = targets[target] - locations[i];
    }
  });
  f.code = out; debug.lines = lines; changed.add(name);
}
function anchor(name, predicate) {
  const indices = get(name).code.flatMap((ins, i) => predicate(ins) ? [i] : []);
  assert.equal(indices.length, 1, `Unique anchor ${name}`); return indices[0];
}
const method = (ins, name) => ins.op === 'callmethod' && ins.a[0].v === name;
// Use the same identity resolution at arm and consumption time. A nonempty
// different grenade is never replaced; None needs IsEquipped in gamepad mode.
for (const name of ['ArmWeaponThrow', 'SpendWeaponThrow']) {
  const at = anchor(name, ins => method(ins, 'GetEquippedWeapon'));
  get(name).code[at] = call('FPVTransitionEquippedThrowWeapon', [], get(name).code[at].a[2].v);
  changed.add(name);
}
// Record the actual payment inputs after a failed reset, before the generic
// Finish rejection hides them. The captured baseline is local to this stack.
const spend = get('SpendWeaponThrow');
const paymentBaseline = 'fpvTransitionSpendBaseline';
assert.ok(!spend.locals.some(v => v.name === paymentBaseline));
spend.locals.push({ name: paymentBaseline, type: 'Int' });
if (!result.strings.includes(paymentBaseline)) result.strings.push(paymentBaseline);
for (const name of ['fpvTransitionSpendGate', 'fpvTransitionSpendEvents']) {
  assert.ok(!spend.locals.some(v => v.name === name));
  spend.locals.push({ name, type: 'String' });
  if (!result.strings.includes(name)) result.strings.push(name);
}
assert.equal(spend.code[22].op, 'isub');
assert.ok(method(spend.code[42], 'ResetWeaponThrow'));
assert.ok(method(spend.code[73], 'ResetWeaponThrow'));
insert('SpendWeaponThrow', new Map([
  [22, [{ op: 'assign', a: [id(paymentBaseline), id('weaponThrowStock')] }]],
  [43, [call('FPVTransitionRecordSpend', [str('ambiguous inventory or payment not permitted'), id('token'), id(paymentBaseline), id('stock'), id('selected'), id('paidByEngine'), id('payHere'), int(-1), id('fpvTransitionSpendGate'), id('fpvTransitionSpendEvents')])]],
  [74, [call('FPVTransitionRecordSpend', [str('inventory changed during payment'), id('token'), id(paymentBaseline), id('stock'), id('selected'), id('paidByEngine'), id('payHere'), id('remaining'), id('fpvTransitionSpendGate'), id('fpvTransitionSpendEvents')])]]
]));
const charge = anchor('SpendWeaponThrow', ins => ins.op === 'assign' && ins.a[0].v === 'payHere');
insert('SpendWeaponThrow', new Map([[charge + 1, [
  call('FPVTransitionAllowManualThrowCharge', [id('token')], '::temp197'),
  { op: 'jmpt', a: [id('::temp197'), int(2)] },
  { op: 'assign', a: [id('payHere'), { t: 5, v: 0 }] },
  { op: 'assign', a: [id('fpvTransitionSpendGate'), id('fpvTransitionChargeTrace')] },
  { op: 'assign', a: [id('fpvTransitionSpendEvents'), id('fpvTransitionChargeEvents')] },
  call('IsWeaponThrowCurrent', [id('token')], '::temp194'),
  { op: 'jmpt', a: [id('::temp194'), int(2)] }, { op: 'return', a: [{ t: 5, v: 0 }] }
]]]));
const resetTimer = anchor('ResetWeaponThrow', ins => method(ins, 'CancelTimer'));
insert('ResetWeaponThrow', new Map([[resetTimer, [call('FPVTransitionInvalidateThrowWatch')]]]));
insert('ConfigureWeaponInput', new Map([[get('ConfigureWeaponInput').code.length, [call('FPVTransitionStartThrowWatch')]]]));
insert('OnTimer', new Map([[0, [call('FPVTransitionThrowWatchTimer', [id('aiTimerID')], '::temp338'),
  { op: 'jmpf', a: [id('::temp338'), int(2)] }, { op: 'return', a: [{ t: 0, v: null }] }]]]));
// The pre-launch failures used to return silently, before transition diagnostics
// could run. Insert logging only at rejected returns (and after original resets),
// never between successful arming and its caller setting weaponControlHeld.
const arm = get('ArmWeaponThrow');
for (const [at, value] of [[22, '::temp168'], [52, '::temp171'], [66, '::temp171'], [86, '::temp173']]) {
  assert.equal(arm.code[at].op, 'return');
  assert.equal(arm.code[at].a[0].v, value);
  assert.equal(arm.code[at - 1].op, 'ineg');
}
assert.ok(method(arm.code[64], 'ResetWeaponThrow'));
assert.ok(method(arm.code[68], 'ResetWeaponThrow'));
const none = { t: 0, v: null }, no = { t: 5, v: 0 };
insert('ArmWeaponThrow', new Map([
  [22, [call('FPVTransitionThrowRejected', [str('arm: unavailable state'), none, int(-1), no, id('fromAnimation'), int(-1), no])]],
  [52, [call('FPVTransitionThrowRejected', [str('arm: state changed during item checks'), id('selected'), id('stock'), id('interacting'), id('fromAnimation'), id('token'), no])]],
  [66, [call('FPVTransitionThrowRejected', [str('arm: item checks'), id('selected'), id('stock'), id('interacting'), id('fromAnimation'), id('token'), no])]],
  [86, [call('FPVTransitionThrowRejected', [str('arm: state changed during reset'), id('selected'), id('stock'), id('interacting'), id('fromAnimation'), id('token'), no])]]
]));
// A delayed gamepad Down must not replace a watcher-owned gesture's inventory
// baseline after engine consumption. The normal caller still checks release.
insert('ArmWeaponThrow', new Map([[0, [
  call('FPVTransitionKeepWatchedThrow', [id('fromAnimation')], '::temp159'),
  { op: 'jmpf', a: [id('::temp159'), int(2)] }, { op: 'return', a: [id('weaponThrowEpoch')] }
]]]));
const armSnapshotGuard = anchor('ArmWeaponThrow', ins => ins.op === 'cmp_eq' && ins.a[1].v === 'weaponThrowEpoch' && ins.a[2].v === 'token');
insert('ArmWeaponThrow', new Map([[armSnapshotGuard, [
  call('FPVTransitionResolveWatchBaseline', [id('token'), id('selected'), id('stock')], '::temp172'),
  { op: 'cmp_gte', a: [id('::temp161'), id('::temp172'), int(0)] },
  { op: 'jmpf', a: [id('::temp161'), int(3)] },
  { op: 'assign', a: [id('stock'), id('::temp172')] },
  { op: 'assign', a: [id('selected'), id('droneWeapon')] }
]]]));
const finishThrow = get('FinishWeaponThrow');
const cancelledThrows = [[48, 'throw: interaction or cancellation before release'],
  [69, 'throw: animation ended without a release event'],
  [89, 'throw: cancellation after release'], [107, 'throw: release timed out']];
for (const [at] of cancelledThrows) assert.ok(method(finishThrow.code[at - 1], 'ResetWeaponThrow'));
assert.equal(finishThrow.code[85].op, 'return');
assert.ok(method(finishThrow.code[82], 'SpendWeaponThrow'));
cancelledThrows.push([85, 'throw: inventory settlement rejected']);
insert('FinishWeaponThrow', new Map(cancelledThrows.map(([at, reason]) => [at, [
  call('FPVTransitionThrowRejected', [str(reason), none, int(-1), id('interacting'), no, id('token'), id('throwing')])
]])));
// The original current-token guard precedes the first poll increment. Repair
// only a completed engine-paid gamepad release, then run all ordinary menu,
// cancellation, quiet-sample and consumption checks.
const finishPoll = anchor('FinishWeaponThrow', ins => ins.op === 'iadd' && ins.a[1].v === 'weaponPolls');
insert('FinishWeaponThrow', new Map([[finishPoll, [
  call('FPVTransitionRecoverGamepadRelease', [id('token'), id('throwing')]),
  call('IsWeaponThrowCurrent', [id('token')], '::temp208'),
  { op: 'jmpt', a: [id('::temp208'), int(2)] }, { op: 'return', a: [{ t: 0, v: null }] }
]]]));
const finishPollAssigned = anchor('FinishWeaponThrow', ins => ins.op === 'assign' && ins.a[0].v === 'weaponPolls');
insert('FinishWeaponThrow', new Map([[finishPollAssigned + 1, [
  call('FPVTransitionWaitForWatchCompletion', [id('token'), id('throwing'), id('interacting')], '::temp208'),
  { op: 'jmpf', a: [id('::temp208'), int(2)] }, { op: 'return', a: [{ t: 0, v: null }] },
  call('IsWeaponThrowCurrent', [id('token')], '::temp208'),
  { op: 'jmpt', a: [id('::temp208'), int(2)] }, { op: 'return', a: [{ t: 0, v: null }] }
]]]));
const launchStart = anchor('Launch', ins => method(ins, 'IsSneaking'));
assert.equal(launchStart, 185);
// Begin only after the original release/consumption checks, before pilot hold or camera changes.
insert('Launch', new Map([
  [launchStart, [call('FPVTransitionBegin', [id('launchGeneration')], '::temp275'),
    { op: 'jmpt', a: [id('::temp275'), int(2)] }, { op: 'return', a: [{ t: 0, v: null }] }]],
  // Freeze the Papyrus mouse guard before native Start can deliver frame/input
  // callbacks. A later MCM choice applies to the next flight in both layers.
  [594, [call('FPVTransitionCaptureController', [id('launchGeneration')])]],
  // mode=2 is original instruction 652. Start the body idle under blackout,
  // before flight timers/AI/Reveal; its lifetime is independent of visual reset.
  [653, [call('FPVTransitionStartOperatorPose', [id('launchGeneration')], '::temp275'),
    { op: 'jmpt', a: [id('::temp275'), int(2)] }, { op: 'return', a: [{ t: 0, v: null }] }]],
  [get('Launch').code.length, [call('FPVTransitionReveal', [id('launchGeneration')])]]
]));
// Every normal/failed cleanup path clears the transition after view restoration.
const restore = anchor('FinishFlight', ins => method(ins, 'RestorePlayerView'));
assert.equal(restore, 165);
insert('FinishFlight', new Map([[restore + 2, [call('FPVTransitionReset')]]]));
const lowerBeforeView = anchor('FinishFlight', ins => method(ins, 'RestoreLaunchAnimation'));
insert('FinishFlight', new Map([[lowerBeforeView, [call('FPVTransitionStopOperatorPose'), call('FPVTransitionClosePipboy')]]]));
const finishMode = anchor('FinishFlight', ins => ins.op === 'assign' && ins.a[0].v === 'mode' && ins.a[1].v === 3);
insert('FinishFlight', new Map([[finishMode + 1, [call('FPVTransitionRecordFinish', [id('explode')]), call('FPVTransitionClearControllerFlight')]]]));
insert('AbortWithReason', new Map([[0, [call('FPVTransitionRecordAbort', [id('reason')])]]]));
insert('RecordStatus', new Map([[0, [call('FPVTransitionRecordStatus', [id('statusText')])]]]));
// Recovery already increments generation and runs ordinary camera cleanup.
// Release any persisted fade/layer afterwards, including idle damaged saves.
const recoverThrow = anchor('RecoverAfterLoad', ins => method(ins, 'ResetWeaponThrow'));
insert('RecoverAfterLoad', new Map([[0, [call('FPVTransitionStopThrowWatch')]],
  [recoverThrow + 1, [call('FPVTransitionRecoverThrowWatch')]]]));
// Re-resolve after the preceding insertion shifted the original body.
const recoveredViewAfterWatch = anchor('RecoverAfterLoad', ins => method(ins, 'ClearFlightKeys'));
insert('RecoverAfterLoad', new Map([[recoveredViewAfterWatch, [call('FPVTransitionReset')]]]));
const recoveredGeneration = anchor('RecoverAfterLoad', ins => ins.op === 'assign' && ins.a[0].v === 'generation');
insert('RecoverAfterLoad', new Map([[recoveredGeneration + 1, [call('FPVTransitionClearControllerFlight'), call('FPVTransitionStopOperatorPose')]]]));
// Also cover damaged/legacy idle states on explicit abort while mode=0.
insert('AbortFlight', new Map([[0, [call('FPVTransitionStopOperatorPose'), call('FPVTransitionClearIdleControllerFlight')]]]));
// The original Papyrus handler directly detonates on mouse key 256, bypassing
// the native GetAsyncKeyState hook. Guard only this flight-input branch, after
// emergency F10 handling; collision/native status detonation remains intact.
const mouseBranch = anchor('OnKeyDown', ins => ins.op === 'cmp_eq' && ins.a[1].v === 'keyCode' && ins.a[2].v === 256);
insert('OnKeyDown', new Map([[mouseBranch, [call('FPVTransitionIgnoreMouseInput', [id('keyCode')], '::temp4'),
  { op: 'jmpf', a: [id('::temp4'), int(2)] }, { op: 'return', a: [{ t: 0, v: null }] }]]]));
insert('RegisterHotkeys', new Map([[0, [call('FPVTransitionRegisterCancel')]]]));
insert('OnAnimationEvent', new Map([[0, [call('FPVTransitionAnimationEvent', [id('akSource'), id('asEventName')])]]]));
insert('RecoverAfterLoad', new Map([[get('RecoverAfterLoad').code.length, [call('FPVTransitionRegisterControllerMenu')]]]));
insert('EnableMod', new Map([[get('EnableMod').code.length, [call('FPVTransitionRegisterControllerMenu')]]]));
insert('Shutdown', new Map([[0, [call('FPVTransitionStopThrowWatch'), call('FPVTransitionUnregisterControllerMenu')]]]));
insert('OnMCMSettingChange', new Map([[0, [call('FPVTransitionControllerSettingChange', [id('modName'), id('id')])]]]));
// The old launch notification always described keyboard/mouse, including LMB
// detonation, which is intentionally suppressed when a controller is selected.
const flightNotice = anchor('Launch', ins => ins.op === 'callstatic' && ins.a[1].v === 'Notification' &&
  ins.a.some(v => v.t === 2 && v.v === 'FPV: W/S throttle | A/D yaw | mouse roll/pitch | LMB detonate | F10 cancel'));
get('Launch').code[flightNotice] = call('FPVTransitionFlightNotice');

// Update script-facing build labels; keep dependency requirements at native 0.1.28.
for (const f of state.functions) for (const ins of f.code) for (const value of ins.a) {
  if (value.t === 2 && typeof value.v === 'string') {
    let next = value.v.replace(/FPV Drone 0\.1\.28/g, 'FPV Drone 0.1.40');
    if (f.name === 'WriteDiagnostics' && next === '0.1.28') next = '0.1.40';
    if (next !== value.v) { value.v = next; if (!result.strings.includes(next)) result.strings.push(next); changed.add(f.name); }
  }
}
const built = write(result);
const verified = parse(built);
assert.ok(write(verified).equals(built));
for (const f of verified.objects[0].states[0].functions) f.code.forEach((ins, i) => {
  const j = ins.op === 'jmp' ? 0 : ['jmpt', 'jmpf'].includes(ins.op) ? 1 : -1;
  if (j >= 0) assert.ok(i + ins.a[j].v >= 0 && i + ins.a[j].v <= f.code.length, `Branch ${f.name}:${i}`);
});
let unchanged = 0;
for (const old of original.objects[0].states[0].functions) if (!changed.has(old.name)) {
  assert.deepEqual(get(old.name), old, `Unrelated function changed: ${old.name}`); unchanged++;
}
// Codec/string-table merge must not alter any original saved variable/property definition.
assert.deepEqual(obj.variables.slice(0, original.objects[0].variables.length), original.objects[0].variables);
assert.deepEqual(obj.properties.slice(0, original.objects[0].properties.length), original.objects[0].properties);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, built);
const report = { baselineSHA256: digest(baseline), candidateSHA256: digest(built),
  originalFunctionsUnchanged: unchanged, originalFunctionsModified: [...changed],
  addedFunctions: newFunctions.map(f => f.name), addedProperties, originalSavedVariablesPreserved: true,
  bytes: built.length, outputPath };
fs.writeFileSync(path.join(root, '_build/launch_transition/build_report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
const gameArg = process.argv.indexOf('--game-root');
const gameRoot = gameArg >= 0 ? process.argv[gameArg + 1] : 'C:\\Games\\Fallout 4';
buildOperatorPose(gameRoot, path.dirname(outputPath));
