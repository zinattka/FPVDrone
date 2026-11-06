// Execute the compiled transition helpers against deterministic native stubs.
// This checks the shipped PEX control flow; it does not emulate Fallout animation/rendering.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { parse } = require('./pex');
const root = path.resolve(__dirname, '..');
const candidate = parse(fs.readFileSync(path.join(root, '_build/launch_transition/candidate/FPVDroneQuestScript.pex')));
const object = candidate.objects[0];
const functions = new Map(object.states.flatMap(s => s.functions).map(f => [f.name.toLowerCase(), f]));
const key = s => s.toLowerCase();
const truth = v => v !== null && v !== undefined && v !== false && v !== 0 && v !== '';
const zero = type => /^(int|float)$/i.test(type) ? 0 : /^bool$/i.test(type) ? false : /^string$/i.test(type) ? '' : null;
function normalizeThrowHooks(code) {
  const skipped = new Set();
  const resolve = code.findIndex(ins => ins.op === 'callmethod' && key(ins.a[0].v) === 'fpvtransitionresolvewatchbaseline');
  if (resolve >= 0) {
    assert.deepEqual(code.slice(resolve, resolve + 5), [
      { op: 'callmethod', a: [{ t: 1, v: 'FPVTransitionResolveWatchBaseline' }, { t: 1, v: 'self' }, { t: 1, v: '::temp172' }, { t: 3, v: 3 }, { t: 1, v: 'token' }, { t: 1, v: 'selected' }, { t: 1, v: 'stock' }] },
      { op: 'cmp_gte', a: [{ t: 1, v: '::temp161' }, { t: 1, v: '::temp172' }, { t: 3, v: 0 }] },
      { op: 'jmpf', a: [{ t: 1, v: '::temp161' }, { t: 3, v: 3 }] },
      { op: 'assign', a: [{ t: 1, v: 'stock' }, { t: 1, v: '::temp172' }] },
      { op: 'assign', a: [{ t: 1, v: 'selected' }, { t: 1, v: 'droneWeapon' }] },
    ], 'only the validated prethrow snapshot can replace original Arm locals');
    for (let i = resolve; i < resolve + 5; i++) skipped.add(i);
  }
  code.forEach((ins, i) => {
    if (ins.op === 'assign' && key(ins.a[0].v) === 'fpvtransitionspendbaseline') {
      assert.deepEqual(ins.a, [{ t: 1, v: 'fpvTransitionSpendBaseline' }, { t: 1, v: 'weaponThrowStock' }]);
      assert.equal(code[i + 1].op, 'isub'); skipped.add(i);
    }
    if (ins.op === 'callmethod' && key(ins.a[0].v) === 'fpvtransitionrecordspend') {
      assert.equal(key(code[i - 1].a[0].v), 'resetweaponthrow');
      assert.equal(key(code[i + 1].a[0].v), 'recordstatus');
      assert.equal(ins.a[3].v, 10); assert.equal(ins.a[6].v, 'fpvTransitionSpendBaseline');
      assert.equal(ins.a[12].v, 'fpvTransitionSpendGate');
      assert.equal(ins.a[13].v, 'fpvTransitionSpendEvents');
      assert.equal(ins.a[7].v, 'stock'); skipped.add(i);
    }
  });
  const gate = code.findIndex(ins => ins.op === 'callmethod' && key(ins.a[0].v) === 'fpvtransitionallowmanualthrowcharge');
  if (gate >= 0) {
    assert.deepEqual(code.slice(gate, gate + 8), [
      { op: 'callmethod', a: [{ t: 1, v: 'FPVTransitionAllowManualThrowCharge' }, { t: 1, v: 'self' }, { t: 1, v: '::temp197' }, { t: 3, v: 1 }, { t: 1, v: 'token' }] },
      { op: 'jmpt', a: [{ t: 1, v: '::temp197' }, { t: 3, v: 2 }] },
      { op: 'assign', a: [{ t: 1, v: 'payHere' }, { t: 5, v: 0 }] },
      { op: 'assign', a: [{ t: 1, v: 'fpvTransitionSpendGate' }, { t: 1, v: 'fpvTransitionChargeTrace' }] },
      { op: 'assign', a: [{ t: 1, v: 'fpvTransitionSpendEvents' }, { t: 1, v: 'fpvTransitionChargeEvents' }] },
      { op: 'callmethod', a: [{ t: 1, v: 'IsWeaponThrowCurrent' }, { t: 1, v: 'self' }, { t: 1, v: '::temp194' }, { t: 3, v: 1 }, { t: 1, v: 'token' }] },
      { op: 'jmpt', a: [{ t: 1, v: '::temp194' }, { t: 3, v: 2 }] },
      { op: 'return', a: [{ t: 5, v: 0 }] },
    ], 'watch-only charge guard must only disable manual payment');
    assert.equal(code[gate - 1].op, 'assign'); assert.equal(code[gate - 1].a[0].v, 'payHere');
    for (let i = gate; i < gate + 8; i++) skipped.add(i);
  }
  const keep = code.findIndex(ins => ins.op === 'callmethod' && key(ins.a[0].v) === 'fpvtransitionkeepwatchedthrow');
  if (keep >= 0) {
    assert.equal(keep, 0, 'watched throw reuse must precede stock sampling');
    assert.deepEqual(code.slice(keep, keep + 3), [
      { op: 'callmethod', a: [{ t: 1, v: 'FPVTransitionKeepWatchedThrow' }, { t: 1, v: 'self' }, { t: 1, v: '::temp159' }, { t: 3, v: 1 }, { t: 1, v: 'fromAnimation' }] },
      { op: 'jmpf', a: [{ t: 1, v: '::temp159' }, { t: 3, v: 2 }] },
      { op: 'return', a: [{ t: 1, v: 'weaponThrowEpoch' }] },
    ]);
    for (let i = keep; i < keep + 3; i++) skipped.add(i);
  }
  const recover = code.findIndex(ins => ins.op === 'callmethod' && key(ins.a[0].v) === 'fpvtransitionrecovergamepadrelease');
  if (recover >= 0) {
    assert.deepEqual(code.slice(recover, recover + 4), [
      { op: 'callmethod', a: [{ t: 1, v: 'FPVTransitionRecoverGamepadRelease' }, { t: 1, v: 'self' }, { t: 1, v: '::nonevar' }, { t: 3, v: 2 }, { t: 1, v: 'token' }, { t: 1, v: 'throwing' }] },
      { op: 'callmethod', a: [{ t: 1, v: 'IsWeaponThrowCurrent' }, { t: 1, v: 'self' }, { t: 1, v: '::temp208' }, { t: 3, v: 1 }, { t: 1, v: 'token' }] },
      { op: 'jmpt', a: [{ t: 1, v: '::temp208' }, { t: 3, v: 2 }] },
      { op: 'return', a: [{ t: 0, v: null }] },
    ], 'release recovery must recheck its caller token before continuing');
    for (let i = recover; i < recover + 4; i++) skipped.add(i);
  }
  const wait = code.findIndex(ins => ins.op === 'callmethod' && key(ins.a[0].v) === 'fpvtransitionwaitforwatchcompletion');
  if (wait >= 0) {
    assert.deepEqual(code.slice(wait, wait + 6), [
      { op: 'callmethod', a: [{ t: 1, v: 'FPVTransitionWaitForWatchCompletion' }, { t: 1, v: 'self' }, { t: 1, v: '::temp208' }, { t: 3, v: 3 }, { t: 1, v: 'token' }, { t: 1, v: 'throwing' }, { t: 1, v: 'interacting' }] },
      { op: 'jmpf', a: [{ t: 1, v: '::temp208' }, { t: 3, v: 2 }] },
      { op: 'return', a: [{ t: 0, v: null }] },
      { op: 'callmethod', a: [{ t: 1, v: 'IsWeaponThrowCurrent' }, { t: 1, v: 'self' }, { t: 1, v: '::temp208' }, { t: 3, v: 1 }, { t: 1, v: 'token' }] },
      { op: 'jmpt', a: [{ t: 1, v: '::temp208' }, { t: 3, v: 2 }] },
      { op: 'return', a: [{ t: 0, v: null }] },
    ], 'completion waiting must guard its caller token after native reads');
    assert.equal(code[wait - 1].op, 'assign'); assert.equal(code[wait - 1].a[0].v, 'weaponPolls');
    for (let i = wait; i < wait + 6; i++) skipped.add(i);
  }
  const kept = [], at = [];
  code.forEach((ins, i) => {
    at[i] = kept.length;
    if (skipped.has(i) || ins.op === 'callmethod' && ['fpvtransitionthrowrejected', 'fpvtransitionrecovergamepadrelease', 'fpvtransitioninvalidatethrowwatch'].includes(key(ins.a[0].v))) return;
    ins = structuredClone(ins);
    if (ins.op === 'callmethod' && key(ins.a[0].v) === 'fpvtransitionequippedthrowweapon')
      ins.a = [{ t: 1, v: 'GetEquippedWeapon' }, { t: 1, v: 'pilot' }, ins.a[2], { t: 3, v: 1 }, { t: 3, v: 2 }];
    kept.push({ old: i, ins });
  });
  at[code.length] = kept.length;
  return kept.map(({ old, ins }, n) => {
    const arg = ins.op === 'jmp' ? 0 : ['jmpt', 'jmpf'].includes(ins.op) ? 1 : -1;
    if (arg >= 0) ins.a[arg].v = at[old + ins.a[arg].v] - n;
    return ins;
  });
}

// Offline fixture extracted from the official Fallout 4 F4SE control map.
// https://raw.githubusercontent.com/ianpatt/f4se/master/CustomControlMap.txt
// Control rows 1-4 and the F10=0x79 keyboard entry (line108 in inspected revision).
// Keyboard values are passed unchanged by official f4se/Hooks_Input.cpp;
// this is the FO4 mapping, not Skyrim's DirectInput table.
const primaryKeyboardFixture = `Forward 0x57
Back 0x53
StrafeLeft 0x41
StrafeRight 0x44
F10 0x79`;
const primaryKeyboard = Object.fromEntries(primaryKeyboardFixture.split('\n').map(row => {
  const [name, value] = row.split(/\s+/); return [name, Number.parseInt(value, 16)];
}));

class VM {
  constructor(options = {}) {
    this.options = options; this.now = 0; this.steps = 0; this.events = []; this.log = [];
    this.vars = new Map(object.variables.map(v => [key(v.name), v.value.t === 5 ? !!v.value.v : v.value.v]));
    this.types = new Map(object.variables.map(v => [key(v.name), v.type]));
    this.actor = { kind: 'actor', dead: false, loaded: options.bodyLoaded !== false,
      sex: options.sex || 0, sneaking: !!options.sneaking, poseActive: false };
    this.layers = []; this.listener = false;
    this.menu = false; this.camera = 0; this.black = false; this.nativeReadyAt = Infinity; this.frameReads = 0;
    this.registeredKeys = new Set([121]);
    this.ini = new Map();
    this.set('generation', 7); this.set('mode', 1); this.set('pilot', this.actor);
  }
  get(name) { return this.vars.get(key(name)); }
  set(name, v) { this.vars.set(key(name), v); }
  record(type, extra = {}) { this.log.push({ type, time: this.now, ...extra }); }
  schedule(at, action) { this.events.push({ at, action }); this.events.sort((a, b) => a.at - b.at); }
  wait(seconds) {
    const end = this.now + seconds;
    while (this.events.length && this.events[0].at <= end + 1e-9) {
      const event = this.events.shift(); this.now = Math.max(this.now, event.at); event.action();
    }
    this.now = end;
  }
  cleanup(reason) {
    this.record('abort', { reason }); this.set('generation', this.get('generation') + 1); this.set('mode', 3);
    if (this.options.realDiagnostics) {
      this.set('lastStopReason', reason); this.run('FPVTransitionRecordFinish', [false]);
    }
    this.run('FPVTransitionClearControllerFlight');
    this.run('FPVTransitionStopOperatorPose'); this.run('FPVTransitionClosePipboy'); this.record('restore-view');
    this.run('FPVTransitionReset'); this.set('mode', 0);
  }
  invoke(receiver, method, args) {
    const name = key(method);
    if (receiver === this) {
      if (name.startsWith('fpvtransition')) {
        const result = this.run(method, args);
        if (name === 'fpvtransitionallowmanualthrowcharge' && this.options.afterManualChargeCheck) this.options.afterManualChargeCheck(this);
        return result;
      }
      if (name === 'abortwithreason') {
        if (this.options.realDiagnostics) this.run('FPVTransitionRecordAbort', args);
        return this.cleanup(args[0]);
      }
      if (name === 'abortflight') return this.cleanup('OnKeyDown requested AbortFlight');
      if (name === 'detonate') { this.record('detonate'); return this.cleanup('detonated'); }
      if (name === 'islaunchinteractionactive') return !!this.options.throwInteracting;
      if (name === 'resetweaponthrow') {
        const result = this.run(method, args);
        if (this.options.afterThrowReset) this.options.afterThrowReset(this);
        return result;
      }
      if (name === 'isweaponthrowcurrent' || name === 'armweaponthrow' || name === 'finishweaponthrow' || name === 'spendweaponthrow' && this.options.spendWeaponThrow === undefined) return this.run(method, args);
      if (name === 'starttimer' || name === 'canceltimer') {
        this.record(name, { args });
        if (name === 'canceltimer' && this.options.onCancelTimer) this.options.onCancelTimer(this, args[0]);
        return;
      }
      if (name === 'spendweaponthrow' && this.options.spendWeaponThrow !== undefined) return this.options.spendWeaponThrow;
      if (name === 'launch' && this.options.throwFixture) { this.record('launch'); return; }
      if (name === 'recordstatus') {
        if (this.options.realDiagnostics) this.run('FPVTransitionRecordStatus', args);
        this.record('status', { text: args[0] }); return;
      }
      if (name === 'registerforanimationevent') {
        if (this.options.registrationFailure) return false;
        this.listener = true; this.record('register-listener');
        if (this.options.cancelDuringRegistration) this.cleanup('cancel during registration');
        return true;
      }
      if (name === 'unregisterforanimationevent') { this.listener = false; this.record('unregister-listener'); return; }
      if (name === 'unregisterforkey') { this.registeredKeys.delete(args[0]); return; }
      if (name === 'registerforkey') { this.registeredKeys.add(args[0]); return; }
      if (name === 'registerformenuopencloseevent' || name === 'configureweaponinput') return;
      throw Error(`Unexpected self native ${method}`);
    }
    if (receiver?.kind === 'actor') {
      if (name === 'getequippedweapon') {
        assert.equal(args[0], 2);
        if (this.options.onThrowEquipRead) this.options.onThrowEquipRead(this);
        return this.options.equippedWeapon;
      }
      if (name === 'isequipped') { assert.equal(args[0], this.get('droneWeapon')); return this.options.formEquipped ?? this.options.equippedWeapon === args[0]; }
      if (name === 'getitemcount') {
        assert.equal(args[0], this.get('droneWeapon'));
        if (this.options.onThrowStockRead) this.options.onThrowStockRead(this);
        return this.options.throwStock ?? 60;
      }
      if (name === 'removeitem') {
        assert.equal(args[0], this.get('droneWeapon')); assert.equal(args[1], 1);
        this.options.throwStock--; this.record('remove-drone');
        if (this.options.onRemoveDrone) this.options.onRemoveDrone(this);
        return;
      }
      if (name === 'getanimationvariablebool') {
        assert.equal(args[0], 'bIsThrowing');
        if (this.options.onThrowAnimationRead) this.options.onThrowAnimationRead(this);
        return !!this.options.throwing;
      }
      if (name === 'isdead') return receiver.dead;
      if (name === 'is3dloaded') return receiver.loaded;
      if (name === 'getleveledactorbase') return this.options.missingLeveledBase ? null : { kind: 'actorbase', sex: receiver.sex };
      if (name === 'getactorbase') return { kind: 'actorbase', sex: receiver.sex };
      if (name === 'playidle') {
        if (args[0]?.id === 0x810 || args[0]?.id === 0x811) {
          assert.equal(args[0].plugin, 'FPVDrone.esp');
          this.record('operator-pose-start', { actor: receiver, idle: args[0].id, sneaking: receiver.sneaking });
          if (this.options.poseRejected) return false;
          receiver.poseActive = true;
          if (this.options.onPoseStart) { const fn = this.options.onPoseStart; this.options.onPoseStart = null; fn(this); }
          return true;
        }
        if (args[0]?.id === 0xE9855) {
          assert.equal(args[0].plugin, 'Fallout4.esm');
          this.record('operator-pose-stop', { actor: receiver });
          if (this.options.stopIdleRejected) return false;
          receiver.poseActive = false; return true;
        }
        const opening = args[0]?.id === 0x22D05;
        this.record(opening ? 'pipboy-open' : 'pipboy-close');
        if (!opening) { this.menu = false; return true; }
        if (this.options.idleRejected) return false;
        if (!this.options.noOpeningEvent) this.schedule(this.now + 0.87, () => {
          if (this.options.actualPipboyMenu) this.menu = true;
          if (this.listener) this.run('FPVTransitionAnimationEvent', [this.actor, 'pipboyOpened']);
        });
        return true;
      }
      if (name === 'playanimation') {
        if (args[0] === 'idleStop') { receiver.poseActive = false; this.record('operator-pose-stop-event', { actor: receiver }); return true; }
        assert.equal(args[0], 'pipboyClose'); this.record('pipboy-close'); this.menu = false; return true;
      }
      throw Error(`Unexpected actor native ${method}`);
    }
    if (receiver?.kind === 'actorbase') {
      if (name === 'getsex') return receiver.sex;
      throw Error(`Unexpected actorbase native ${method}`);
    }
    if (receiver?.kind === 'weapon') {
      if (name === 'getname') return receiver.name;
      if (name === 'getformid') return receiver.id;
      throw Error(`Unexpected weapon native ${method}`);
    }
    if (receiver?.kind === 'layer') {
      if (name === 'delete') { receiver.deleted = true; this.record('delete-layer'); return; }
      if (name === 'disableplayercontrols') { receiver.disabled = true; return; }
      if (name === 'enablefasttravel') return;
      throw Error(`Unexpected layer native ${method}`);
    }
    throw Error(`Unexpected receiver ${method}`);
  }
  staticCall(cls, method, args) {
    const name = key(cls) + '.' + key(method);
    switch (name) {
      case 'inputenablelayer.create': {
        if (this.options.layerFailure) return null;
        const layer = { kind: 'layer', deleted: false }; this.layers.push(layer); return layer;
      }
      case 'game.getformfromfile':
        if (this.options.missingOpeningIdle && args[0] === 0x22D05) return null;
        if (this.options.missingClosingIdle && args[0] === 0x22CF8) return null;
        if (this.options.missingPose && (args[0] === 0x810 || args[0] === 0x811)) return null;
        if (this.options.missingStopIdle && args[0] === 0xE9855) return null;
        return { kind: 'idle', id: args[0], plugin: args[1] };
      case 'game.getplayer': return this.actor;
      case 'game.usinggamepad': return !!this.options.gamepad;
      case 'game.forcefirstperson': if (!this.options.cameraFailure) this.camera = 0; return;
      case 'game.getcamerastate': return this.options.cameraFailure ? 8 : this.camera;
      case 'game.fadeoutgame':
        this.black = args[0]; this.record(args[0] ? 'fade-out' : 'fade-in');
        if (args[0] && this.options.onBlack) this.options.onBlack(this);
        return;
      case 'utility.getcurrentrealtime': return this.now;
      case 'utility.waitmenumode': this.wait(args[0]); return;
      case 'utility.isinmenumode': return this.menu || !!this.options.foreignMenu;
      case 'f4se.getpluginversion':
        if (key(args[0]) === 'gardenofedenpapyrusscriptextender') return this.options.missingGarden ? -1 : 0x17040000;
        if (key(args[0]) === 'fpvdronenative') return this.options.missingNative ? -1 : 128;
        return -1;
      case 'gardenofeden2.writeini':
        this.ini.set([args[0], args[1], args[2]].map(key).join('|'), args[3]);
        this.record('write-ini', { file: args[0], section: args[1], field: args[2], value: args[3] }); return true;
      case 'gardenofeden2.readini': return this.ini.get([args[0], args[1], args[2]].map(key).join('|')) || '';
      case 'debug.notification': this.record('notification', { text: args[0] }); return;
      case 'debug.trace': this.record('trace', { text: args[0] }); return;
      case 'ui.ismenuopen': return args[0] === 'PipboyMenu' ? this.menu : false;
      case 'ui.closemenu': assert.equal(args[0], 'PipboyMenu'); this.menu = false; this.record('close-menu'); return true;
      case 'fpvdronenative.getstatus': return this.options.nativeStatus ?? (this.now >= this.nativeReadyAt ? 1 : 8);
      case 'fpvdronenative.getframes':
        this.frameReads++;
        if (this.options.onGetFrames && this.frameReads >= (this.options.onGetFramesAt || 1)) { const cb = this.options.onGetFrames; this.options.onGetFrames = null; cb(this); }
        if (this.options.frameCounter) return this.options.frameCounter(this);
        return (this.options.nativeFrameBase || 0) + (this.now >= this.nativeReadyAt ? 2 + Math.floor((this.now - this.nativeReadyAt + 1e-9) * 60) : 0);
      default: throw Error(`Unexpected static native ${name}`);
    }
  }
  run(name, args = []) {
    const f = functions.get(key(name)); assert.ok(f, `Compiled function ${name} missing`);
    const locals = new Map(f.locals.map(l => [key(l.name), zero(l.type)]));
    const types = new Map(f.locals.map(l => [key(l.name), l.type]));
    f.params.forEach((p, i) => { locals.set(key(p.name), args[i]); types.set(key(p.name), p.type); });
    const read = value => {
      if (value.t !== 1) return value.t === 5 ? !!value.v : value.v;
      if (key(value.v) === 'self') return this;
      return locals.has(key(value.v)) ? locals.get(key(value.v)) : this.get(value.v);
    };
    const put = (value, v) => { const n = key(value.v); if (locals.has(n)) locals.set(n, v); else { assert.ok(this.vars.has(n), `Unknown variable ${value.v}`); this.vars.set(n, v); } };
    for (let pc = 0; pc < f.code.length;) {
      assert.ok(++this.steps < 2000000, 'VM instruction budget exceeded');
      const { op, a } = f.code[pc]; let next = pc + 1;
      switch (op) {
        case 'nop': break;
        case 'assign': put(a[0], read(a[1])); break;
        case 'cast': {
          const type = key(types.get(key(a[0].v)) || this.types.get(key(a[0].v)) || '');
          let v = read(a[1]); if (type === 'bool') v = truth(v); else if (type === 'int') v = Math.trunc(v || 0); else if (type === 'float') v = Number(v || 0); else if (type === 'string') v = v == null ? '' : String(v);
          put(a[0], v); break;
        }
        case 'not': put(a[0], !truth(read(a[1]))); break;
        case 'ineg': case 'fneg': put(a[0], -read(a[1])); break;
        case 'cmp_eq': put(a[0], read(a[1]) === read(a[2])); break;
        case 'cmp_lt': put(a[0], read(a[1]) < read(a[2])); break;
        case 'cmp_lte': put(a[0], read(a[1]) <= read(a[2])); break;
        case 'cmp_gt': put(a[0], read(a[1]) > read(a[2])); break;
        case 'cmp_gte': put(a[0], read(a[1]) >= read(a[2])); break;
        case 'iadd': case 'fadd': put(a[0], read(a[1]) + read(a[2])); break;
        case 'isub': case 'fsub': put(a[0], read(a[1]) - read(a[2])); break;
        case 'imod': put(a[0], read(a[1]) % read(a[2])); break;
        case 'array_create': {
          const type = types.get(key(a[0].v)) || this.types.get(key(a[0].v)) || '';
          put(a[0], Array(read(a[1])).fill(zero(type.replace(/\[\]$/, '')))); break;
        }
        case 'array_length': put(a[0], read(a[1]).length); break;
        case 'array_getelement': put(a[0], read(a[1])[read(a[2])]); break;
        case 'array_setelement': read(a[0])[read(a[1])] = read(a[2]); break;
        case 'strcat': put(a[0], String(read(a[1])) + String(read(a[2]))); break;
        case 'jmp': next = pc + read(a[0]); break;
        case 'jmpt': if (truth(read(a[0]))) next = pc + read(a[1]); break;
        case 'jmpf': if (!truth(read(a[0]))) next = pc + read(a[1]); break;
        case 'callmethod': put(a[2], this.invoke(read(a[1]), a[0].v, a.slice(4).map(read))); break;
        case 'callstatic': put(a[2], this.staticCall(a[0].v, a[1].v, a.slice(4).map(read))); break;
        case 'return': return read(a[0]);
        default: throw Error(`Unsupported compiled opcode ${op} in ${name}:${pc}`);
      }
      pc = next;
    }
  }
  assertClean() {
    assert.equal(this.black, false, 'engine fade remained black');
    assert.equal(this.listener, false, 'animation listener remained registered');
    assert.equal(this.menu, false, 'owned Pipboy menu remained open');
    assert.equal(this.get('fpvTransitionOwned'), false);
    assert.equal(this.get('fpvTransitionBlack'), false);
    assert.equal(this.get('fpvTransitionControls'), null);
    assert.ok(this.layers.every(l => l.deleted), 'input layer leaked');
  }
}

const results = [];
function test(name, body) { body(); results.push(name); }
function begin(vm) { return vm.run('FPVTransitionBegin', [vm.get('generation')]); }
function enterFlight(vm, delay = 0.25) { vm.set('mode', 2); vm.nativeReadyAt = vm.now + delay; }

test('success: black covers all remaining setup and native readiness', () => {
  const vm = new VM({ actualPipboyMenu: true }); assert.equal(begin(vm), true);
  assert.equal(vm.black, true); assert.equal(vm.listener, false); assert.equal(vm.menu, false);
  assert.equal(vm.log.filter(e => e.type === 'fade-in').length, 0);
  const fadeOut = vm.log.find(e => e.type === 'fade-out'); assert.ok(fadeOut.time >= 0.87);
  enterFlight(vm); const readyAt = vm.nativeReadyAt; vm.run('FPVTransitionReveal', [7]);
  vm.assertClean(); assert.ok(vm.log.find(e => e.type === 'fade-in').time >= readyAt);
});

for (const action of ['F10', 'abort', 'death', 'load']) for (const stage of ['opening', 'black', 'native-wait']) {
  test(`${action} during ${stage}: restores fade, layer and registration`, () => {
    const stop = vm => { if (action === 'death') vm.actor.dead = true; vm.cleanup(action); };
    const vm = new VM(stage === 'black' ? { onBlack: vm => vm.schedule(vm.now + 0.03, () => stop(vm)) } : {});
    if (stage === 'opening') vm.schedule(0.3, () => stop(vm));
    if (stage === 'native-wait') {
      assert.equal(begin(vm), true); enterFlight(vm, 3); vm.schedule(vm.now + 0.1, () => stop(vm));
      vm.run('FPVTransitionReveal', [7]);
    } else assert.equal(begin(vm), false);
    vm.assertClean(); assert.equal(vm.get('mode'), 0);
    const lower = vm.log.findIndex(e => e.type === 'pipboy-close');
    const restore = vm.log.findIndex(e => e.type === 'restore-view');
    if (stage === 'opening') assert.ok(lower >= 0 && lower < restore, 'Pipboy was lowered after restoring view');
  });
}

for (const [option, reason] of [['layerFailure', 'input layer'], ['missingOpeningIdle', 'idle missing'], ['cameraFailure', 'first-person'], ['registrationFailure', 'listener'], ['idleRejected', 'rejected'], ['noOpeningEvent', 'timed out']]) {
  test(`failure ${option}: cancels cleanly`, () => {
    const vm = new VM({ [option]: true }); assert.equal(begin(vm), false); vm.assertClean();
    assert.ok(vm.log.find(e => e.type === 'abort' && e.reason.includes(reason)));
  });
}
test('death observed by the opening loop aborts cleanly', () => {
  const vm = new VM(); vm.schedule(0.3, () => { vm.actor.dead = true; });
  assert.equal(begin(vm), false); vm.assertClean();
  assert.ok(vm.log.some(e => e.type === 'abort' && /died/.test(e.reason)));
});
test('registration cancellation race does not leave a listener', () => {
  const vm = new VM({ cancelDuringRegistration: true }); assert.equal(begin(vm), false); vm.assertClean();
});
test('closing idle absence uses graph event fallback', () => {
  const vm = new VM({ missingClosingIdle: true }); assert.equal(begin(vm), true);
  enterFlight(vm, 0); vm.run('FPVTransitionReveal', [7]); vm.assertClean();
  assert.ok(vm.log.some(e => e.type === 'pipboy-close'));
});
test('native readiness timeout releases black and input', () => {
  const vm = new VM(); assert.equal(begin(vm), true); enterFlight(vm, Infinity);
  vm.run('FPVTransitionReveal', [7]); vm.assertClean();
  assert.ok(vm.log.some(e => e.type === 'abort' && /readiness timed out/.test(e.reason)));
});
test('generation change at GetFrames prevents stale reveal of newer transition', () => {
  const vm = new VM(); assert.equal(begin(vm), true); enterFlight(vm, 0);
  vm.options.onGetFramesAt = 4;
  vm.options.onGetFrames = vm => { vm.set('generation', 8); vm.set('fpvTransitionGeneration', 8); };
  vm.run('FPVTransitionReveal', [7]);
  assert.equal(vm.black, true); assert.equal(vm.get('fpvTransitionOwned'), true);
  assert.equal(vm.log.filter(e => e.type === 'fade-in').length, 0);
  vm.cleanup('test teardown'); vm.assertClean();
});
test('cumulative frame count requires two new camera callbacks', () => {
  const vm = new VM({ nativeFrameBase: 1000 }); assert.equal(begin(vm), true); enterFlight(vm, 0);
  const started = vm.now; vm.run('FPVTransitionReveal', [7]); vm.assertClean();
  assert.ok(vm.log.find(e => e.type === 'fade-in').time - started >= 2 / 60);
});
test('frozen cumulative frame counter cannot reveal black', () => {
  const vm = new VM({ frameCounter: () => 1000 }); assert.equal(begin(vm), true); enterFlight(vm, 0);
  vm.run('FPVTransitionReveal', [7]); vm.assertClean();
  assert.ok(vm.log.some(e => e.type === 'abort' && /readiness timed out/.test(e.reason)));
});
test('frame counter reset rebases readiness to the new counter', () => {
  const vm = new VM(); assert.equal(begin(vm), true); enterFlight(vm, 0); const started = vm.now;
  vm.options.frameCounter = vm => vm.now - started < 0.02 ? 1000 : Math.floor((vm.now - started - 0.02 + 1e-9) * 60);
  vm.run('FPVTransitionReveal', [7]); vm.assertClean();
  assert.ok(vm.log.find(e => e.type === 'fade-in').time - started >= 0.02 + 2 / 60);
});
test('pre-migration AbortKey=68 reproduces D cancellation in real compiled OnKeyDown', () => {
  const vm = new VM(); enterFlight(vm, 0); vm.set('::AbortKey_var', primaryKeyboard.StrafeRight);
  vm.run('OnKeyDown', [primaryKeyboard.StrafeRight]);
  assert.equal(vm.get('mode'), 0);
  assert.ok(vm.log.some(e => e.type === 'abort' && e.reason === 'OnKeyDown requested AbortFlight'));
});

test('F10 registration repairs the erroneous D=68 save binding and keeps F10=121', () => {
  const vm = new VM(); vm.set('::AbortKey_var', 68); vm.registeredKeys = new Set([68]);
  vm.run('RegisterHotkeys');
  assert.equal(vm.get('::AbortKey_var'), 121); assert.equal(vm.registeredKeys.has(68), false);
  assert.equal(vm.registeredKeys.has(121), true);
  vm.run('RegisterHotkeys'); assert.equal(vm.get('::AbortKey_var'), 121); assert.equal(vm.registeredKeys.has(121), true);
  vm.set('::AbortKey_var', 67); vm.run('RegisterHotkeys');
  assert.equal(vm.get('::AbortKey_var'), 67, 'unrelated custom binding changed');
  assert.equal(vm.registeredKeys.has(67), true);
});

test('default F10 remains 121 while stale D registration is purged', () => {
  const vm = new VM(); vm.set('::AbortKey_var', primaryKeyboard.F10); vm.registeredKeys = new Set([68, 121]);
  vm.run('RegisterHotkeys');
  assert.equal(vm.get('::AbortKey_var'), primaryKeyboard.F10);
  assert.equal(vm.registeredKeys.has(primaryKeyboard.StrafeRight), false);
  assert.equal(vm.registeredKeys.has(primaryKeyboard.F10), true);
});

for (const [name, code] of [['W', primaryKeyboard.Forward], ['S', primaryKeyboard.Back], ['A', primaryKeyboard.StrafeLeft], ['D', primaryKeyboard.StrafeRight]]) {
  test(`real compiled OnKeyDown ${name} does not cancel flight after legacy binding repair`, () => {
    const vm = new VM(); enterFlight(vm, 0); vm.set('::AbortKey_var', 68); vm.registeredKeys = new Set([68]);
    vm.run('RegisterHotkeys'); vm.run('OnKeyDown', [code]);
    assert.equal(vm.get('mode'), 2, `${name} cancelled flight`);
    assert.equal(vm.log.filter(e => e.type === 'abort').length, 0);
    assert.equal(vm.get('lastReceivedKey'), code);
  });
}

for (const mode of [1, 2]) {
  test(`real compiled OnKeyDown F10=121 cancels ${mode === 1 ? 'preparation' : 'flight'}`, () => {
    const vm = new VM(); vm.set('mode', mode); vm.set('::AbortKey_var', 68); vm.registeredKeys = new Set([68]);
    vm.run('RegisterHotkeys'); assert.equal(vm.registeredKeys.has(121), true);
    vm.run('OnKeyDown', [primaryKeyboard.F10]);
    assert.equal(vm.get('mode'), 0); vm.assertClean();
    assert.ok(vm.log.some(e => e.type === 'abort' && e.reason === 'OnKeyDown requested AbortFlight'));
  });
}
for (const controller of [false, true]) test(`real compiled OnKeyDown LMB ${controller ? 'is ignored in controller flight' : 'still detonates keyboard flight'}`, () => {
  const vm = new VM(); enterFlight(vm, 0);
  vm.set('fpvTransitionControllerFlight', controller); vm.set('fpvTransitionControllerFlightGeneration', vm.get('generation'));
  vm.run('OnKeyDown', [256]);
  assert.equal(vm.log.filter(e => e.type === 'detonate').length, controller ? 0 : 1);
  assert.equal(vm.get('mode'), controller ? 2 : 0);
});
for (const controller of [false, true]) test(`real compiled OnKeyDown F10 remains available in ${controller ? 'controller' : 'keyboard'} flight`, () => {
  const vm = new VM(); enterFlight(vm, 0);
  vm.set('fpvTransitionControllerFlight', controller); vm.set('fpvTransitionControllerFlightGeneration', vm.get('generation'));
  vm.run('OnKeyDown', [121]); assert.equal(vm.get('mode'), 0); vm.assertClean();
  assert.equal(vm.log.filter(e => e.type === 'detonate').length, 0);
  assert.equal(vm.get('fpvTransitionControllerFlight'), false);
});
test('controller mouse guard survives camera reveal and visual reset', () => {
  const vm = new VM(); assert.equal(begin(vm), true); enterFlight(vm, 0);
  vm.set('fpvTransitionControllerFlight', true); vm.set('fpvTransitionControllerFlightGeneration', 7);
  vm.run('FPVTransitionReveal', [7]); vm.assertClean();
  assert.equal(vm.get('fpvTransitionControllerFlight'), true); vm.run('OnKeyDown', [256]);
  assert.equal(vm.get('mode'), 2); assert.equal(vm.log.filter(e => e.type === 'detonate').length, 0);
});
for (const status of [2, 6]) test(`controller mouse guard preserves native ${status === 2 ? 'impact' : 'mapped detonation'} through actual OnTimer`, () => {
  const vm = new VM({ nativeStatus: status }); enterFlight(vm, 0);
  vm.set('fpvTransitionControllerFlight', true); vm.set('fpvTransitionControllerFlightGeneration', 7);
  vm.run('OnTimer', [4]); assert.equal(vm.log.filter(e => e.type === 'detonate').length, 1);
  assert.equal(vm.get('mode'), 0);
});
test('controller ownership snapshot is cleared only by flight cleanup lifecycle hooks', () => {
  const calls = name => functions.get(key(name)).code.filter(i => i.op === 'callmethod').map(i => key(i.a[0].v));
  assert.ok(!calls('FPVTransitionReset').includes('fpvtransitionclearcontrollerflight'));
  assert.ok(calls('FinishFlight').includes('fpvtransitionclearcontrollerflight'));
  assert.ok(calls('RecoverAfterLoad').includes('fpvtransitionclearcontrollerflight'));
  assert.ok(calls('AbortFlight').includes('fpvtransitionclearidlecontrollerflight'));
  const launch = functions.get('launch').code;
  const capture = launch.findIndex(i => i.op === 'callmethod' && key(i.a[0].v) === 'fpvtransitioncapturecontroller');
  const native = launch.findIndex(i => i.op === 'callstatic' && key(i.a[0].v) === 'fpvdronenative' && key(i.a[1].v) === 'start');
  assert.ok(capture >= 0 && capture < native);
});
test('hook order: throw settled -> Pipboy -> native; close -> camera -> reveal', () => {
  const calls = name => functions.get(key(name)).code.filter(i => i.op === 'callmethod' || i.op === 'callstatic').map(i => i.op === 'callmethod' ? key(i.a[0].v) : key(i.a[1].v));
  const launch = calls('Launch'); assert.ok(launch.indexOf('fpvtransitionbegin') < launch.indexOf('holdpilot'));
  assert.ok(launch.indexOf('fpvtransitionreveal') > launch.indexOf('startnpcreactions'));
  const finish = calls('FinishFlight');
  assert.ok(finish.indexOf('fpvtransitionclosepipboy') < finish.indexOf('restoreplayerview'));
  assert.ok(finish.indexOf('fpvtransitionreset') > finish.indexOf('restoreplayerview'));
  assert.equal(calls('RegisterHotkeys')[0], 'fpvtransitionregistercancel');
  assert.equal(calls('OnAnimationEvent')[0], 'fpvtransitionanimationevent');
  const baseline = parse(fs.readFileSync(path.join(root, '_build/baseline/0.1.28/Scripts/FPVDroneQuestScript.pex')));
  const originalSpend = baseline.objects[0].states[0].functions.find(f => f.name === 'SpendWeaponThrow');
  const updatedSpend = functions.get('spendweaponthrow');
  assert.deepEqual(updatedSpend.locals.slice(0, -3), originalSpend.locals);
  assert.deepEqual(updatedSpend.locals.slice(-3), [
    { name: 'fpvTransitionSpendBaseline', type: 'Int' },
    { name: 'fpvTransitionSpendGate', type: 'String' },
    { name: 'fpvTransitionSpendEvents', type: 'String' },
  ]);
  assert.deepEqual({ ...updatedSpend, locals: originalSpend.locals, code: normalizeThrowHooks(updatedSpend.code) }, originalSpend, 'Original consumption transaction changed outside the identity/manual-payment/diagnostic hooks');
});

function startPose(vm, expected = vm.get('generation')) { return vm.run('FPVTransitionStartOperatorPose', [expected]); }
function assertPoseReleased(vm, body = vm.actor) {
  assert.equal(vm.get('fpvTransitionPoseOwned'), false, 'pose ownership remained');
  assert.equal(vm.get('fpvTransitionPosePilot'), null, 'pose pilot reference remained');
  assert.equal(vm.get('fpvTransitionPoseGeneration'), -1, 'pose generation remained');
  if (!body.dead && body.loaded) assert.equal(body.poseActive, false, 'operator body pose remained active');
}

for (const sex of [0, 1]) for (const sneaking of [false, true]) {
  test(`operator pose uses ${sex ? 'female' : 'male'} idle while ${sneaking ? 'crouched' : 'standing'}, survives Reveal`, () => {
    const vm = new VM({ sex, sneaking }); assert.equal(begin(vm), true); enterFlight(vm, 0);
    assert.equal(startPose(vm), true); assert.equal(vm.actor.poseActive, true);
    const request = vm.log.find(e => e.type === 'operator-pose-start');
    assert.equal(request.idle, sex ? 0x811 : 0x810); assert.equal(request.sneaking, sneaking);
    vm.run('FPVTransitionReveal', [7]); vm.assertClean();
    assert.equal(vm.get('fpvTransitionPoseOwned'), true, 'visual reset ended the flight pose');
    assert.equal(vm.actor.poseActive, true); assert.equal(vm.actor.sneaking, sneaking);
    vm.wait(95); // the body pose has no script-side short timer or periodic restart
    assert.equal(vm.actor.poseActive, true); assert.equal(vm.log.filter(e => e.type === 'operator-pose-start').length, 1);
    vm.cleanup('flight ended'); assertPoseReleased(vm); assert.equal(vm.actor.sneaking, sneaking);
    const stop = vm.log.findIndex(e => e.type === 'operator-pose-stop');
    const restore = vm.log.findIndex(e => e.type === 'restore-view');
    assert.ok(stop >= 0 && stop < restore, 'pose must stop before camera returns');
  });
}

test('operator pose falls back to ordinary actor base for sex selection', () => {
  const vm = new VM({ sex: 1, missingLeveledBase: true }); enterFlight(vm, 0);
  assert.equal(startPose(vm), true); assert.equal(vm.log.find(e => e.type === 'operator-pose-start').idle, 0x811);
  vm.cleanup('done'); assertPoseReleased(vm);
});

test('operator pose missing pilot aborts instead of leaving an unmonitored flight', () => {
  const vm = new VM(); enterFlight(vm, 0); vm.set('pilot', null);
  assert.equal(startPose(vm), false); vm.assertClean(); assertPoseReleased(vm);
  assert.equal(vm.get('mode'), 0);
  assert.ok(vm.log.some(e => e.type === 'abort' && /player.*unavailable/.test(e.reason)));
});

for (const [option, reason] of [['missingPose', 'idle missing'], ['poseRejected', 'idle rejected'], ['bodyLoaded', 'body unavailable']]) {
  test(`operator pose ${option} failure aborts cleanly`, () => {
    const vm = new VM({ [option]: option === 'bodyLoaded' ? false : true, sneaking: true }); enterFlight(vm, 0);
    assert.equal(startPose(vm), false); vm.assertClean(); assertPoseReleased(vm);
    assert.equal(vm.actor.sneaking, true);
    assert.ok(vm.log.some(e => e.type === 'abort' && e.reason.includes(reason)));
  });
}

for (const action of ['F10', 'abort', 'load']) {
  test(`${action} during operator pose releases only the pose and preserves crouch`, () => {
    const vm = new VM({ sneaking: true }); enterFlight(vm, 0); assert.equal(startPose(vm), true);
    vm.cleanup(action); assertPoseReleased(vm); assert.equal(vm.actor.sneaking, true);
    assert.equal(vm.camera, 0); assert.equal(vm.menu, false);
  });
}

test('operator death clears ownership without sending idleStop into the death graph', () => {
  const vm = new VM(); enterFlight(vm, 0); assert.equal(startPose(vm), true);
  vm.actor.dead = true; vm.actor.poseActive = false; // engine death state replaces the body animation
  vm.cleanup('operator died'); assertPoseReleased(vm);
  assert.equal(vm.log.filter(e => e.type === 'operator-pose-stop' || e.type === 'operator-pose-stop-event').length, 0);
});

test('operator pose stop is idempotent and uses the captured actor', () => {
  const vm = new VM({ sneaking: true }); enterFlight(vm, 0); assert.equal(startPose(vm), true);
  const originalBody = vm.actor;
  const otherBody = { kind: 'actor', dead: false, loaded: true, sex: 1, sneaking: false, poseActive: true };
  vm.set('pilot', otherBody); vm.run('FPVTransitionStopOperatorPose'); vm.run('FPVTransitionStopOperatorPose');
  assertPoseReleased(vm, originalBody); assert.equal(otherBody.poseActive, true, 'cleanup touched a different actor');
  assert.equal(vm.log.filter(e => e.type === 'operator-pose-stop').length, 1);
  assert.equal(originalBody.sneaking, true);
});

for (const option of ['missingStopIdle', 'stopIdleRejected']) {
  test(`operator pose stop ${option} uses idleStop graph fallback`, () => {
    const vm = new VM({ [option]: true }); enterFlight(vm, 0); assert.equal(startPose(vm), true);
    vm.run('FPVTransitionStopOperatorPose'); assertPoseReleased(vm);
    assert.ok(vm.log.some(e => e.type === 'operator-pose-stop-event'));
  });
}

test('stale operator pose request does not alter a newer session', () => {
  const vm = new VM(); enterFlight(vm, 0); assert.equal(startPose(vm), true);
  const before = vm.log.length; assert.equal(startPose(vm, 6), false);
  assert.equal(vm.log.length, before); assert.equal(vm.actor.poseActive, true);
  assert.equal(vm.get('fpvTransitionPoseGeneration'), 7); vm.cleanup('done'); assertPoseReleased(vm);
});

test('cancel during pose dispatch removes a late accepted pose', () => {
  const vm = new VM({ onPoseStart: vm => vm.cleanup('cancel during idle request') }); enterFlight(vm, 0);
  assert.equal(startPose(vm), false); assertPoseReleased(vm);
});

test('late pose completion does not stop a pose owned by a newer generation', () => {
  const vm = new VM({ onPoseStart: vm => {
    vm.set('generation', 8); vm.set('fpvTransitionPoseGeneration', 8); vm.set('fpvTransitionPoseOwned', true);
  } }); enterFlight(vm, 0);
  assert.equal(startPose(vm), false); assert.equal(vm.actor.poseActive, true);
  assert.equal(vm.get('fpvTransitionPoseGeneration'), 8);
  assert.equal(vm.log.filter(e => e.type === 'operator-pose-stop').length, 0);
  vm.cleanup('done'); assertPoseReleased(vm);
});

test('operator pose hooks follow mode2, precede camera reveal and clean up before view restoration', () => {
  const index = (name, method) => functions.get(key(name)).code.findIndex(ins => ins.op === 'callmethod' && key(ins.a[0].v) === key(method));
  const launch = functions.get('launch');
  const flying = launch.code.findIndex(ins => ins.op === 'assign' && key(ins.a[0].v) === 'mode' && ins.a[1].v === 2);
  assert.ok(index('Launch', 'FPVTransitionStartOperatorPose') > flying);
  assert.ok(index('Launch', 'FPVTransitionStartOperatorPose') < index('Launch', 'StartTimer'));
  assert.ok(index('Launch', 'FPVTransitionStartOperatorPose') < index('Launch', 'FPVTransitionReveal'));
  assert.ok(index('FinishFlight', 'FPVTransitionStopOperatorPose') < index('FinishFlight', 'RestorePlayerView'));
  const recover = functions.get('recoverafterload');
  const invalidate = recover.code.findIndex(ins => ins.op === 'assign' && key(ins.a[0].v) === 'generation');
  assert.ok(index('RecoverAfterLoad', 'FPVTransitionStopOperatorPose') > invalidate);
  assert.ok(index('RecoverAfterLoad', 'FPVTransitionStopOperatorPose') < index('RecoverAfterLoad', 'FinishFlight'));
  assert.equal(index('AbortFlight', 'FPVTransitionStopOperatorPose'), 0);
  for (const name of ['FPVTransitionReset', 'FPVTransitionClosePipboy']) assert.equal(index(name, 'FPVTransitionStopOperatorPose'), -1);
});

test('operator pose bytecode never switches camera, opens UI or forces a sneak variable', () => {
  for (const name of ['FPVTransitionStartOperatorPose', 'FPVTransitionStopOperatorPose', 'FPVTransitionIdleStop']) {
    for (const ins of functions.get(key(name)).code) {
      if (ins.op === 'callstatic') {
        assert.notEqual(key(ins.a[0].v), 'ui');
        assert.ok(!/force(first|third)person|setcameratarget|fadeoutgame/i.test(ins.a[1].v));
      }
      if (ins.op === 'callmethod') assert.ok(!/setanimationvariable|startsneaking|setrestrained|moveto|setsit/i.test(ins.a[0].v));
    }
  }
});
test('a failed launch records its reason and notifies once while releasing blackout without Papyrus logging', () => {
  const vm = new VM({ realDiagnostics: true }); assert.equal(begin(vm), true); enterFlight(vm, Infinity);
  vm.run('FPVTransitionReveal', [7]); vm.assertClean();
  assert.equal(vm.ini.get('fpvdrone.launch|latest|abortreason'), 'launch transition: FPV readiness timed out');
  assert.equal(vm.ini.get('fpvdrone.launch|latest|finishreason'), 'launch transition: FPV readiness timed out');
  const messages = vm.log.filter(e => e.type === 'notification');
  assert.equal(messages.length, 1); assert.match(messages[0].text, /камера|Камера/);
  assert.ok(vm.log.some(e => e.type === 'write-ini' && e.field === 'Stage' && /preparing FPV/.test(e.value)));
});
test('each new transition resets notification ownership before opening the Pip-Boy', () => {
  const vm = new VM(); vm.set('fpvTransitionAbortNotified', true);
  vm.ini.set('fpvdrone.launch|latest|abortreason', 'old failure');
  assert.equal(begin(vm), true);
  assert.equal(vm.get('fpvTransitionAbortNotified'), false);
  assert.equal(vm.ini.get('fpvdrone.launch|latest|abortreason'), '');
  const clears = vm.log.findIndex(e => e.type === 'write-ini' && e.field === 'AbortReason' && e.value === '');
  const opening = vm.log.findIndex(e => e.type === 'pipboy-open'); assert.ok(clears >= 0 && clears < opening);
  vm.cleanup('test teardown'); vm.assertClean();
});
test('launch diagnostics insert calls without changing original status/abort/finish control flow', () => {
  const previous = parse(fs.readFileSync(path.join(root, '_build/baseline/0.1.35/Scripts/FPVDroneQuestScript.pex'))).objects[0];
  const previousFunctions = new Map(previous.states.flatMap(s => s.functions).map(f => [key(f.name), f]));
  const diagnostics = new Set(['fpvtransitionrecordstatus', 'fpvtransitionrecordabort', 'fpvtransitionrecordfinish']);
  const normalized = code => {
    const kept = [], at = [];
    code.forEach((ins, i) => {
      at[i] = kept.length;
      if (!(ins.op === 'callmethod' && diagnostics.has(key(ins.a[0].v)))) kept.push({ old: i, ins: structuredClone(ins) });
    }); at[code.length] = kept.length;
    return kept.map(({ old, ins }, n) => {
      const arg = ins.op === 'jmp' ? 0 : ['jmpt', 'jmpf'].includes(ins.op) ? 1 : -1;
      if (arg >= 0) ins.a[arg].v = at[old + ins.a[arg].v] - n;
      for (const a of ins.a) if (a.t === 2 && typeof a.v === 'string') a.v = a.v.replace(/FPV Drone 0\.1\.\d+/g, 'FPV Drone BUILD');
      return ins;
    });
  };
  for (const name of ['RecordStatus', 'AbortWithReason', 'FinishFlight'])
    assert.deepEqual(normalized(functions.get(key(name)).code), normalized(previousFunctions.get(key(name)).code), name);
  const finish = functions.get('finishflight').code;
  const guard = finish.findIndex(ins => ins.op === 'assign' && key(ins.a[0].v) === 'mode' && ins.a[1].v === 3);
  const diagnostic = finish.findIndex(ins => ins.op === 'callmethod' && key(ins.a[0].v) === 'fpvtransitionrecordfinish');
  const nativeStop = finish.findIndex(ins => ins.op === 'callstatic' && key(ins.a[0].v) === 'fpvdronenative' && key(ins.a[1].v) === 'stop');
  assert.ok(guard >= 0 && diagnostic > guard && diagnostic < nativeStop, 'claim cleanup before logging; record native state before stopping it');
});
const throwWeapon = { kind: 'weapon', id: 0x0800080E, name: 'FPV Drone', toString: () => 'Weapon(0800080E)' };
const otherWeapon = { kind: 'weapon', id: 0x000E5750, name: 'Frag Mine', toString: () => 'Weapon(000E5750)' };
function throwVM(options = {}) {
  const vm = new VM({ throwFixture: true, equippedWeapon: throwWeapon, throwStock: 60, ...options });
  vm.set('mode', 0); vm.set('enabled', true); vm.set('droneWeapon', throwWeapon);
  vm.set('weaponThrowEpoch', 40); return vm;
}
function throwDiagnostic(vm, { stock, interacting, fromAnimation = false } = {}) {
  const field = name => vm.ini.get(`fpvdrone.launch|throw|${name.toLowerCase()}`);
  assert.ok(field('Reason'), 'rejected throw did not explain its reason');
  assert.ok(field('Snapshot'), 'rejected throw did not save its state');
  assert.ok(field('Item'), 'rejected throw did not identify the item');
  if (stock !== undefined) assert.match(field('Item') + '; ' + field('Snapshot'), new RegExp(`stock=${stock}(?:[; ]|$)`));
  if (interacting !== undefined) assert.match(field('Snapshot'), new RegExp(`interacting=${interacting}`, 'i'));
  assert.match(field('Snapshot'), new RegExp(`fromAnimation=${fromAnimation}`, 'i'));
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 0);
  assert.equal(vm.log.filter(e => e.type === 'notification').length, 0, 'throw diagnostic must remain silent');
}

for (const [name, options, reason] of [
  ['wrong equipped item', { equippedWeapon: otherWeapon }, 'arm: equipped grenade is not FPV Drone'],
  ['empty drone inventory', { throwStock: 0 }, 'arm: no drones in inventory'],
  ['active menu or interaction', { throwInteracting: true }, 'arm: menu or interaction active'],
]) test(`throw entry: ${name} records item/state after preserving the reset`, () => {
  const vm = throwVM(options); assert.equal(vm.run('ArmWeaponThrow', [false]), -1);
  assert.equal(vm.get('weaponThrowEpoch'), 41); assert.equal(vm.get('weaponThrowArmed'), false);
  throwDiagnostic(vm, { stock: options.throwStock ?? 60, interacting: !!options.throwInteracting });
  assert.equal(vm.ini.get('fpvdrone.launch|throw|reason'), reason);
  assert.match(vm.ini.get('fpvdrone.launch|throw|item'), /expected=Weapon\(0800080E\)/);
  assert.ok(vm.ini.get('fpvdrone.launch|throw|item').includes('equipped=' + (options.equippedWeapon || throwWeapon)));
  assert.equal(vm.log.filter(e => e.type === 'canceltimer').length, 1);
  assert.equal(vm.log.filter(e => e.type === 'starttimer').length, 0);
});

for (const [name, variable, value] of [
  ['disabled', 'enabled', false], ['already launching', 'mode', 1],
  ['player missing', 'pilot', null], ['drone form missing', 'droneWeapon', null],
  ['release already seen', 'weaponReleaseSeen', true], ['gesture suppressed', 'weaponGestureSuppressed', true],
]) test(`throw entry: ${name} records the early guard without resetting state`, () => {
  const vm = throwVM(); vm.set(variable, value);
  assert.equal(vm.run('ArmWeaponThrow', [false]), -1); throwDiagnostic(vm);
  assert.equal(vm.get('weaponThrowEpoch'), 40);
  assert.equal(vm.log.filter(e => e.type === 'canceltimer').length, 0);
});

test('throw entry: epoch change during inventory read remains rejected without extra reset', () => {
  const vm = throwVM({ onThrowStockRead: vm => vm.set('weaponThrowEpoch', 41) });
  assert.equal(vm.run('ArmWeaponThrow', [false]), -1); throwDiagnostic(vm, { stock: 60, interacting: false });
  assert.equal(vm.get('weaponThrowEpoch'), 41); assert.equal(vm.get('weaponThrowArmed'), false);
  assert.equal(vm.log.filter(e => e.type === 'canceltimer').length, 0);
});

test('throw entry: cancellation during reset is preserved and recorded', () => {
  const vm = throwVM({ afterThrowReset: vm => vm.set('weaponThrowEpoch', vm.get('weaponThrowEpoch') + 1) });
  assert.equal(vm.run('ArmWeaponThrow', [false]), -1); throwDiagnostic(vm, { stock: 60, interacting: false });
  assert.equal(vm.get('weaponThrowEpoch'), 42); assert.equal(vm.get('weaponThrowArmed'), false);
  assert.equal(vm.log.filter(e => e.type === 'starttimer').length, 0);
});

for (const fromAnimation of [false, true]) test(`throw entry: accepted ${fromAnimation ? 'animation' : 'control'} preserves stock/timer and avoids diagnostic I/O`, () => {
  const vm = throwVM(); vm.set('primaryAttackHeld', true);
  assert.equal(vm.run('ArmWeaponThrow', [fromAnimation]), 41);
  assert.equal(vm.get('weaponThrowStock'), 60); assert.equal(vm.get('weaponThrowArmed'), true);
  assert.equal(vm.get('weaponThrowStarted'), fromAnimation); assert.equal(vm.get('weaponPrimaryInterrupted'), true);
  assert.equal(vm.get('weaponLaunchReady'), false); assert.equal(vm.ini.size, 0);
  assert.deepEqual(vm.log.map(e => e.type), ['canceltimer', 'starttimer']);
  const timer = vm.log.find(e => e.type === 'starttimer'); assert.equal(timer.args[1], 8);
  assert.ok(Math.abs(timer.args[0] - 0.05) < 1e-7);
  assert.equal(vm.options.throwStock, 60);
});

test('throw entry: already armed animation keeps its epoch and avoids diagnostic I/O', () => {
  const vm = throwVM(); vm.set('weaponThrowArmed', true);
  assert.equal(vm.run('ArmWeaponThrow', [true]), 40); assert.equal(vm.get('weaponThrowStarted'), true);
  assert.equal(vm.log.length, 0); assert.equal(vm.ini.size, 0);
});

test('throw entry: missing Garden still rejects silently and preserves reset behavior', () => {
  const vm = throwVM({ missingGarden: true, throwStock: 0 });
  assert.equal(vm.run('ArmWeaponThrow', [false]), -1); assert.equal(vm.get('weaponThrowEpoch'), 41);
  assert.equal(vm.get('weaponThrowArmed'), false); assert.equal(vm.ini.size, 0);
  assert.deepEqual(vm.log.map(e => e.type), ['canceltimer']);
});

function armedThrowVM(options = {}) {
  const vm = throwVM({ spendWeaponThrow: true, ...options });
  assert.equal(vm.run('ArmWeaponThrow', [false]), 41);
  vm.log.length = 0;
  return vm;
}
for (const [name, options, fields, reason] of [
  ['menu before release', { throwInteracting: true }, {}, 'throw: interaction or cancellation before release'],
  ['ended without engine release', {}, { weaponThrowStarted: true, weaponQuietSamples: 3 }, 'throw: animation ended without a release event'],
  ['cancelled after paid release', {}, { weaponReleaseSeen: true, weaponQuietSamples: 1, weaponCancelPending: true }, 'throw: cancellation after release'],
  ['release timeout', {}, { weaponPolls: 80 }, 'throw: release timed out'],
]) test(`throw completion: ${name} records cancellation after the original reset`, () => {
  // Arming with a menu open is itself rejected, so open it after arming.
  const vm = armedThrowVM(); Object.assign(vm.options, options);
  for (const [name, value] of Object.entries(fields)) vm.set(name, value);
  vm.run('FinishWeaponThrow');
  assert.equal(vm.get('weaponThrowEpoch'), 42); assert.equal(vm.get('weaponThrowArmed'), false);
  assert.equal(vm.ini.get('fpvdrone.launch|throw|reason'), reason);
  assert.ok(vm.log.findIndex(e => e.type === 'canceltimer') < vm.log.findIndex(e => e.type === 'write-ini'));
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 0);
});
test('throw completion: failed inventory settlement remains rejected and explains its stage', () => {
  const vm = armedThrowVM({ spendWeaponThrow: false });
  vm.set('weaponReleaseSeen', true); vm.set('weaponQuietSamples', 1);
  vm.run('FinishWeaponThrow');
  assert.equal(vm.ini.get('fpvdrone.launch|throw|reason'), 'throw: inventory settlement rejected');
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 0);
});
test('throw completion: paid release still launches without diagnostic I/O', () => {
  const vm = armedThrowVM(); vm.set('weaponReleaseSeen', true); vm.set('weaponQuietSamples', 1);
  vm.run('FinishWeaponThrow');
  assert.equal(vm.get('weaponLaunchReady'), true); assert.equal(vm.get('weaponInputBusy'), false);
  assert.deepEqual(vm.log.map(e => e.type), ['launch']); assert.equal(vm.ini.size, 0);
});
test('throw helpers preserve every original Arm/Finish instruction and branch', () => {
  const previous = parse(fs.readFileSync(path.join(root, '_build/baseline/0.1.36/Scripts/FPVDroneQuestScript.pex'))).objects[0];
  for (const name of ['ArmWeaponThrow', 'FinishWeaponThrow', 'ResetWeaponThrow'])
    assert.deepEqual(normalizeThrowHooks(functions.get(key(name)).code), previous.states[0].functions.find(f => f.name === name).code, name);
});

function startThrowWatch(vm) { vm.run('FPVTransitionStartThrowWatch'); }
function tickThrowWatch(vm, throwing) {
  vm.options.throwing = throwing;
  return vm.run('FPVTransitionThrowWatchTimer', [10]);
}
function quietThrowWatch(vm) { tickThrowWatch(vm, false); tickThrowWatch(vm, false); }
function gamepadWatchVM(options = {}) {
  const vm = throwVM({ gamepad: true, ...options });
  vm.set('weaponGestureSuppressed', true); startThrowWatch(vm); return vm;
}

// Installed Fallout4.exe first resolves a full annotation as an event name,
// then splits an unknown X.Y into event X and string payload Y. The human/PA
// graph defines weaponFire but not weaponFire.2; Papyrus receives only the tag.
const vanillaMineClipFixture = [
  { annotation: 'weaponFire.2', tag: 'weaponFire', payload: '2' },
  { annotation: 'throwEnd', tag: 'throwEnd', payload: '' },
];
function annotationTag(annotation) { return vanillaMineClipFixture.find(x => x.annotation === annotation)?.tag || annotation; }
function emitThrowRelease(vm, source = vm.actor) {
  for (const { tag } of vanillaMineClipFixture) vm.run('OnAnimationEvent', [source, tag]);
}
function drainThrowTimerChain(vm, maxTicks = 100) {
  let scheduled = true, ticks = 0;
  while (scheduled && vm.get('weaponThrowArmed') && ticks < maxTicks) {
    const before = vm.log.length;
    vm.run('OnTimer', [8]); ticks++;
    scheduled = vm.log.slice(before).some(e => e.type === 'starttimer' && e.args[1] === 8);
  }
  return { ticks, scheduled };
}

for (const [name, options, expected] of [
  ['gamepad null slot with positively equipped drone', { gamepad: true, equippedWeapon: null, formEquipped: true }, throwWeapon],
  ['gamepad null slot without equipped drone', { gamepad: true, equippedWeapon: null, formEquipped: false }, null],
  ['keyboard null slot even when IsEquipped reports true', { gamepad: false, equippedWeapon: null, formEquipped: true }, null],
  ['different gamepad grenade even when IsEquipped reports true', { gamepad: true, equippedWeapon: otherWeapon, formEquipped: true }, otherWeapon],
  ['normal keyboard grenade slot', { equippedWeapon: throwWeapon }, throwWeapon],
]) test(`throw identity: ${name}`, () => {
  const vm = throwVM(options); assert.equal(vm.run('FPVTransitionEquippedThrowWeapon'), expected);
  assert.equal(vm.run('ArmWeaponThrow', [false]), expected === throwWeapon ? 41 : -1);
  assert.equal(vm.get('weaponThrowArmed'), expected === throwWeapon);
});

test('throw identity: missing player stays None', () => {
  const vm = throwVM({ gamepad: true, formEquipped: true }); vm.set('pilot', null);
  assert.equal(vm.run('FPVTransitionEquippedThrowWeapon'), null);
});

test('throw watch lifecycle hooks use dedicated timer10 and invalidate every throw reset', () => {
  const calls = name => functions.get(key(name)).code.filter(ins => ins.op === 'callmethod').map(ins => key(ins.a[0].v));
  assert.ok(calls('ConfigureWeaponInput').includes('fpvtransitionstartthrowwatch'));
  assert.ok(calls('Shutdown').includes('fpvtransitionstopthrowwatch'));
  assert.ok(calls('ResetWeaponThrow').includes('fpvtransitioninvalidatethrowwatch'));
  assert.ok(calls('OnTimer').includes('fpvtransitionthrowwatchtimer'));
  const vm = gamepadWatchVM(); assert.ok(vm.log.some(e => e.type === 'starttimer' && e.args[1] === 10));
  vm.run('FPVTransitionStopThrowWatch'); assert.ok(vm.log.some(e => e.type === 'canceltimer' && e.args[0] === 10));
});

test('gamepad throw watch arms through actual Arm without any OnControlDown event', () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm); tickThrowWatch(vm, true);
  assert.equal(vm.get('weaponThrowEpoch'), 41); assert.equal(vm.get('weaponThrowArmed'), true);
  assert.equal(vm.get('weaponThrowStarted'), true); assert.equal(vm.get('weaponThrowStock'), 60);
  assert.equal(vm.get('weaponGestureSuppressed'), false); assert.equal(vm.options.throwStock, 60);
  assert.equal(vm.ini.size, 0); assert.equal(vm.log.filter(e => e.type === 'launch').length, 0);
});

test('keyboard throw watch never arms or clears suppression', () => {
  const vm = gamepadWatchVM({ gamepad: false }); quietThrowWatch(vm); tickThrowWatch(vm, true);
  assert.equal(vm.get('weaponThrowArmed'), false); assert.equal(vm.get('weaponThrowEpoch'), 40);
  assert.equal(vm.get('weaponGestureSuppressed'), true); assert.equal(vm.ini.size, 0);
});

test('gamepad watch requires a quiet sample before the first observed active throw', () => {
  const vm = gamepadWatchVM(); tickThrowWatch(vm, true); tickThrowWatch(vm, true);
  assert.equal(vm.get('weaponThrowArmed'), false); assert.equal(vm.get('weaponThrowEpoch'), 40);
  quietThrowWatch(vm); tickThrowWatch(vm, true); assert.equal(vm.get('weaponThrowArmed'), true);
});

test('gamepad watch requires two consecutive quiet samples', () => {
  const vm = gamepadWatchVM(); tickThrowWatch(vm, false); tickThrowWatch(vm, true);
  assert.equal(vm.get('weaponThrowArmed'), false);
  quietThrowWatch(vm); tickThrowWatch(vm, true); assert.equal(vm.get('weaponThrowArmed'), true);
});

for (const [name, change, restore] of [
  ['menu', vm => { vm.options.throwInteracting = true; }, vm => { vm.options.throwInteracting = false; }],
  ['flight', vm => vm.set('mode', 2), vm => vm.set('mode', 0)],
]) test(`gamepad watch drops its quiet sample during ${name}`, () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm); change(vm); tickThrowWatch(vm, true);
  restore(vm); tickThrowWatch(vm, true); assert.equal(vm.get('weaponThrowArmed'), false);
  quietThrowWatch(vm); tickThrowWatch(vm, true); assert.equal(vm.get('weaponThrowArmed'), true);
});

for (const [name, stop] of [
  ['stopped', vm => vm.run('FPVTransitionStopThrowWatch')],
  ['disabled', vm => vm.set('enabled', false)],
]) test(`gamepad watch cannot arm when ${name}`, () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm); stop(vm); tickThrowWatch(vm, true);
  assert.equal(vm.get('weaponThrowArmed'), false); assert.equal(vm.get('weaponThrowEpoch'), 40);
});

test('gamepad watch ignores foreign timer IDs', () => {
  const vm = gamepadWatchVM(); assert.equal(vm.run('FPVTransitionThrowWatchTimer', [9]), false);
  assert.equal(vm.get('weaponThrowArmed'), false);
});

test('gamepad watch rejects a sample from a stopped and restarted watcher', () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm);
  vm.options.onThrowAnimationRead = vm => {
    vm.options.onThrowAnimationRead = null; vm.run('FPVTransitionStopThrowWatch'); startThrowWatch(vm);
  };
  tickThrowWatch(vm, true); assert.equal(vm.get('weaponThrowArmed'), false);
  tickThrowWatch(vm, true); assert.equal(vm.get('weaponThrowArmed'), false);
  quietThrowWatch(vm); tickThrowWatch(vm, true); assert.equal(vm.get('weaponThrowArmed'), true);
});

test('stale throw watcher cannot clear quiet samples owned by its replacement', () => {
  const vm = gamepadWatchVM(); const oldEpoch = vm.get('fpvTransitionThrowWatchEpoch'); startThrowWatch(vm);
  quietThrowWatch(vm); assert.equal(vm.get('fpvTransitionThrowQuietSamples'), 2);
  vm.run('FPVTransitionCheckGamepadThrow', [oldEpoch]);
  assert.equal(vm.get('fpvTransitionThrowQuietSamples'), 2);
  tickThrowWatch(vm, true); assert.equal(vm.get('weaponThrowArmed'), true);
});

for (const [name, gamepad, mode, delay] of [
  ['gamepad ready', true, 0, 0.05], ['keyboard ready', false, 0, 0.25], ['gamepad in flight', true, 2, 0.25],
]) test(`throw watch cadence: ${name}`, () => {
  const vm = gamepadWatchVM({ gamepad }); vm.set('mode', mode); vm.log.length = 0;
  tickThrowWatch(vm, false); const timer = vm.log.filter(e => e.type === 'starttimer').at(-1);
  assert.equal(timer.args[1], 10); assert.ok(Math.abs(timer.args[0] - delay) < 1e-7);
});

test('cancelled gamepad throw cannot rearm while the animation remains active', () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm); tickThrowWatch(vm, true);
  assert.equal(vm.get('weaponThrowArmed'), true); vm.run('ResetWeaponThrow');
  const epoch = vm.get('weaponThrowEpoch'); tickThrowWatch(vm, true); tickThrowWatch(vm, true);
  assert.equal(vm.get('weaponThrowArmed'), false); assert.equal(vm.get('weaponThrowEpoch'), epoch);
  quietThrowWatch(vm); tickThrowWatch(vm, true); assert.equal(vm.get('weaponThrowArmed'), true);
});

test('gamepad watch does not replace a throw already armed by the normal control event', () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm);
  vm.set('weaponGestureSuppressed', false); assert.equal(vm.run('ArmWeaponThrow', [false]), 41);
  vm.set('weaponControlHeld', true); tickThrowWatch(vm, true);
  assert.equal(vm.get('weaponThrowEpoch'), 41); assert.equal(vm.get('weaponControlHeld'), true);
  assert.equal(vm.get('weaponThrowArmed'), true); assert.equal(vm.options.throwStock, 60);
});

for (const [name, options] of [
  ['wrong item', { equippedWeapon: otherWeapon }], ['empty inventory', { throwStock: 0 }],
]) test(`gamepad watch preserves original ${name} rejection and requires another edge`, () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm); Object.assign(vm.options, options); tickThrowWatch(vm, true);
  assert.equal(vm.get('weaponThrowArmed'), false); throwDiagnostic(vm, { fromAnimation: true });
  assert.equal(vm.get('weaponGestureSuppressed'), true, 'failed watch arm leaked suppression to a late animation event');
  const failedEpoch = vm.get('weaponThrowEpoch'); assert.equal(vm.run('ArmWeaponThrow', [true]), -1);
  assert.equal(vm.get('weaponThrowEpoch'), failedEpoch);
  const epoch = vm.get('weaponThrowEpoch'); vm.options.equippedWeapon = throwWeapon; vm.options.throwStock = 60;
  tickThrowWatch(vm, true); assert.equal(vm.get('weaponThrowArmed'), false); assert.equal(vm.get('weaponThrowEpoch'), epoch);
  quietThrowWatch(vm); tickThrowWatch(vm, true); assert.equal(vm.get('weaponThrowArmed'), true);
});

function releasedGamepadVM(options = {}) {
  const vm = throwVM({ gamepad: true, ...options }); assert.equal(vm.run('ArmWeaponThrow', [true]), 41);
  vm.set('weaponControlHeld', true); vm.options.throwStock = 59; vm.log.length = 0; return vm;
}
test('gamepad engine consumption recovers missing release and actual Spend does not consume twice', () => {
  const vm = releasedGamepadVM(); vm.run('FinishWeaponThrow');
  assert.equal(vm.get('weaponReleaseSeen'), true); assert.equal(vm.get('weaponControlHeld'), false);
  assert.equal(vm.get('weaponLaunchReady'), false); vm.run('FinishWeaponThrow');
  assert.equal(vm.get('weaponLaunchReady'), true); assert.equal(vm.get('weaponChargeSettled'), true);
  assert.equal(vm.options.throwStock, 59); assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 0);
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 1); assert.equal(vm.ini.size, 0);
});

test('watched gamepad throw launches only after engine consumption and never removes a second drone', () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm); tickThrowWatch(vm, true);
  assert.equal(vm.get('fpvTransitionWatchArmedEpoch'), 41);
  vm.options.throwing = false; vm.options.throwStock = 59;
  vm.run('FinishWeaponThrow'); vm.run('FinishWeaponThrow');
  assert.equal(vm.get('weaponLaunchReady'), true); assert.equal(vm.options.throwStock, 59);
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 1);
  assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 0);
});

test('late watcher inventory capture preserves quiet stock and cannot charge a second drone', () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm); vm.options.throwStock = 59;
  tickThrowWatch(vm, true); assert.equal(vm.get('weaponThrowStock'), 60);
  emitThrowRelease(vm); vm.options.throwing = false;
  vm.run('FinishWeaponThrow'); vm.run('FinishWeaponThrow'); assert.equal(vm.options.throwStock, 59);
  assert.equal(vm.get('weaponLaunchReady'), true);
  assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 0);
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 1);
});

test('pending watch arming blocks a concurrent manual inventory charge', () => {
  const vm = throwVM(); assert.equal(vm.run('ArmWeaponThrow', [true]), 41);
  vm.set('fpvTransitionWatchArmPending', true); vm.set('weaponReleaseSeen', true);
  assert.equal(vm.run('SpendWeaponThrow', [41]), false);
  assert.equal(vm.options.throwStock, 60); assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 0);
});

test('gamepad recovered release retains menu cancellation after engine consumption', () => {
  const vm = releasedGamepadVM({ throwInteracting: false }); vm.options.throwInteracting = true;
  vm.run('FinishWeaponThrow'); assert.equal(vm.get('weaponReleaseSeen'), true); assert.equal(vm.get('weaponCancelPending'), true);
  vm.run('FinishWeaponThrow'); assert.equal(vm.get('weaponThrowArmed'), false);
  assert.equal(vm.options.throwStock, 59); assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 0);
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 0);
  assert.equal(vm.ini.get('fpvdrone.launch|throw|reason'), 'throw: cancellation after release');
});

for (const [name, options, fields] of [
  ['keyboard mode', { gamepad: false }, {}], ['ongoing throw animation', { throwing: true }, {}],
  ['primary attack interruption', {}, { weaponPrimaryInterrupted: true }],
  ['animation never started', {}, { weaponThrowStarted: false }],
]) test(`gamepad release recovery rejects ${name}`, () => {
  const vm = releasedGamepadVM(options); for (const [name, value] of Object.entries(fields)) vm.set(name, value);
  vm.run('FinishWeaponThrow'); assert.equal(vm.get('weaponReleaseSeen'), false);
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 0); assert.equal(vm.options.throwStock, 59);
});

for (const stock of [60, 58, 61, 0]) test(`gamepad release recovery rejects ambiguous stock ${stock}`, () => {
  const vm = releasedGamepadVM(); vm.options.throwStock = stock; vm.run('FinishWeaponThrow');
  assert.equal(vm.get('weaponReleaseSeen'), false); assert.equal(vm.get('weaponControlHeld'), true);
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 0); assert.equal(vm.options.throwStock, stock);
});

test('gamepad release recovery rejects stale token and disabled quest', () => {
  const vm = releasedGamepadVM(); vm.run('FPVTransitionRecoverGamepadRelease', [40, false]);
  assert.equal(vm.get('weaponReleaseSeen'), false); vm.set('enabled', false);
  vm.run('FPVTransitionRecoverGamepadRelease', [41, false]); assert.equal(vm.get('weaponReleaseSeen'), false);
});

test('gamepad release recovery rechecks the token after inventory native yields', () => {
  const vm = releasedGamepadVM();
  vm.options.onThrowStockRead = vm => vm.set('weaponThrowEpoch', 42);
  vm.run('FPVTransitionRecoverGamepadRelease', [41, false]); assert.equal(vm.get('weaponReleaseSeen'), false);
  assert.equal(vm.get('weaponControlHeld'), true); assert.equal(vm.options.throwStock, 59);
});

test('Finish returns after a release recovery yield without changing a newer throw', () => {
  const vm = releasedGamepadVM();
  const replacement = {
    weaponThrowEpoch: 42, weaponQuietSamples: 3, weaponThrowStarted: true,
    weaponThrowArmed: true, weaponReleaseSeen: false, weaponInputBusy: false,
    weaponCancelPending: true, weaponControlHeld: true, weaponPolls: 77,
    weaponThrowStock: 23, weaponGestureSuppressed: false, weaponLaunchReady: false,
  };
  vm.options.onThrowStockRead = vm => {
    vm.options.onThrowStockRead = null;
    for (const [name, value] of Object.entries(replacement)) vm.set(name, value);
  };
  vm.run('FinishWeaponThrow');
  for (const [name, value] of Object.entries(replacement)) assert.equal(vm.get(name), value, `${name} changed in stale Finish`);
  assert.equal(vm.log.length, 0); assert.equal(vm.ini.size, 0); assert.equal(vm.options.throwStock, 59);
});

test('keyboard release event still launches through actual Spend with exactly one script consumption', () => {
  const vm = throwVM(); assert.equal(vm.run('ArmWeaponThrow', [false]), 41);
  vm.set('weaponReleaseSeen', true); vm.set('weaponQuietSamples', 1); vm.log.length = 0;
  vm.run('FinishWeaponThrow'); assert.equal(vm.get('weaponLaunchReady'), true);
  assert.equal(vm.get('weaponChargeSettled'), true); assert.equal(vm.options.throwStock, 59);
  assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 1);
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 1); assert.equal(vm.ini.size, 0);
});

for (const pending of [false, true]) test(`delayed normal Down preserves ${pending ? 'pending' : 'owned'} watched throw stock`, () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm); tickThrowWatch(vm, true);
  vm.options.throwStock = 59;
  if (pending) { vm.set('fpvTransitionWatchArmedEpoch', -1); vm.set('fpvTransitionWatchArmPending', true); }
  vm.options.onThrowStockRead = () => assert.fail('delayed Down resampled already consumed stock');
  assert.equal(vm.run('ArmWeaponThrow', [false]), 41);
  assert.equal(vm.get('weaponThrowEpoch'), 41); assert.equal(vm.get('weaponThrowStock'), 60);
  assert.equal(vm.get('weaponThrowStarted'), true); assert.equal(vm.get('weaponThrowArmed'), true);
  assert.equal(vm.options.throwStock, 59);
});

test('watch restart keeps a suspended arm protected until explicit load recovery clears it', () => {
  const vm = gamepadWatchVM(); vm.set('fpvTransitionWatchArmPending', true); vm.set('fpvTransitionWatchPendingEpoch', 7);
  startThrowWatch(vm); assert.equal(vm.get('fpvTransitionWatchArmPending'), true);
  assert.equal(vm.get('fpvTransitionWatchPendingEpoch'), 7);
  assert.equal(vm.run('FPVTransitionAllowManualThrowCharge', [40]), false);
  vm.run('FPVTransitionRecoverThrowWatch'); assert.equal(vm.get('fpvTransitionWatchArmPending'), false);
  assert.equal(vm.get('fpvTransitionWatchPendingEpoch'), -1);
  assert.equal(vm.run('FPVTransitionAllowManualThrowCharge', [40]), true);
  const recovery = functions.get('recoverafterload').code;
  const call = name => recovery.findIndex(ins => ins.op === 'callmethod' && key(ins.a[0].v) === name);
  assert.ok(call('fpvtransitionstopthrowwatch') < call('resetweaponthrow'));
  assert.ok(call('fpvtransitionrecoverthrowwatch') > call('resetweaponthrow'));
});

test('old Reset timer cancellation cannot invalidate a newer watched marker', () => {
  const vm = throwVM(); vm.options.onCancelTimer = (vm, id) => {
    if (id !== 8) return;
    vm.set('weaponThrowEpoch', 42); vm.set('fpvTransitionWatchArmedEpoch', 42);
    vm.set('fpvTransitionThrowQuietSamples', 2); vm.set('weaponThrowArmed', true);
  };
  vm.run('ResetWeaponThrow');
  assert.equal(vm.get('weaponThrowEpoch'), 42); assert.equal(vm.get('fpvTransitionWatchArmedEpoch'), 42);
  assert.equal(vm.get('fpvTransitionThrowQuietSamples'), 2); assert.equal(vm.get('weaponThrowArmed'), true);
  const reset = functions.get('resetweaponthrow').code;
  const invalidate = reset.findIndex(ins => ins.op === 'callmethod' && key(ins.a[0].v) === 'fpvtransitioninvalidatethrowwatch');
  const cancel = reset.findIndex(ins => ins.op === 'callmethod' && key(ins.a[0].v) === 'canceltimer');
  assert.ok(invalidate >= 0 && invalidate < cancel);
});

test('Spend returns after manual-charge helper yields without changing a newer settlement', () => {
  const vm = throwVM(); assert.equal(vm.run('ArmWeaponThrow', [true]), 41);
  vm.set('weaponReleaseSeen', true); vm.set('fpvTransitionWatchArmPending', true); vm.log.length = 0;
  const replacement = { weaponThrowEpoch: 42, weaponChargeSettled: true, weaponThrowArmed: true,
    weaponReleaseSeen: true, weaponThrowStock: 23, weaponGestureSuppressed: false };
  vm.options.afterManualChargeCheck = vm => {
    for (const [name, value] of Object.entries(replacement)) vm.set(name, value);
  };
  assert.equal(vm.run('SpendWeaponThrow', [41]), false);
  for (const [name, value] of Object.entries(replacement)) assert.equal(vm.get(name), value, `${name} changed in stale Spend`);
  assert.equal(vm.options.throwStock, 60); assert.equal(vm.log.length, 0); assert.equal(vm.ini.size, 0);
});

test('a failed watch arm cannot suppress a newer unrelated gesture', () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm);
  vm.options.onThrowStockRead = vm => { vm.set('weaponThrowEpoch', 42); vm.set('weaponGestureSuppressed', false); };
  tickThrowWatch(vm, true); assert.equal(vm.get('weaponThrowEpoch'), 42);
  assert.equal(vm.get('weaponGestureSuppressed'), false); assert.equal(vm.get('weaponThrowArmed'), false);
});

test('normal Arm winning a watch native-call race retains its stock and acquires the watch charge guard', () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm);
  vm.options.onThrowStockRead = vm => {
    vm.options.onThrowStockRead = null; assert.equal(vm.run('ArmWeaponThrow', [false]), 41);
    vm.options.throwStock = 59;
  };
  tickThrowWatch(vm, true); assert.equal(vm.get('weaponThrowEpoch'), 41);
  assert.equal(vm.get('weaponThrowStock'), 60); assert.equal(vm.get('weaponThrowArmed'), true);
  assert.equal(vm.get('fpvTransitionWatchArmedEpoch'), 41); assert.equal(vm.get('fpvTransitionWatchArmPending'), false);
  assert.equal(vm.run('FPVTransitionAllowManualThrowCharge', [41]), false);
});

test('stale failed watch Arm cannot reset the normal Arm that won while polling was restarted', () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm);
  vm.options.onThrowStockRead = vm => {
    vm.options.onThrowStockRead = null; assert.equal(vm.run('ArmWeaponThrow', [false]), 41);
    vm.run('FPVTransitionStopThrowWatch'); startThrowWatch(vm);
  };
  tickThrowWatch(vm, true); assert.equal(vm.get('weaponThrowEpoch'), 41);
  assert.equal(vm.get('weaponThrowArmed'), true); assert.equal(vm.get('weaponThrowStock'), 60);
  assert.equal(vm.get('weaponGestureSuppressed'), false);
});

test('watched unpaid drone uses trusted quiet stock and a real throw-specific event to consume exactly one', () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm); tickThrowWatch(vm, true);
  assert.equal(vm.get('weaponThrowStock'), 60); assert.equal(vm.get('fpvTransitionWatchBaselineEpoch'), 41);
  emitThrowRelease(vm); vm.options.throwing = false;
  vm.run('FinishWeaponThrow'); vm.run('FinishWeaponThrow');
  assert.equal(vm.get('weaponLaunchReady'), true); assert.equal(vm.options.throwStock, 59);
  assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 1);
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 1);
});

for (const selected of [throwWeapon, null, otherWeapon]) test(`last prepaid drone can arm safely after engine slot becomes ${selected?.name || 'None'}`, () => {
  const vm = gamepadWatchVM({ throwStock: 1 }); quietThrowWatch(vm);
  vm.options.throwStock = 0; vm.options.equippedWeapon = selected; vm.options.formEquipped = false;
  tickThrowWatch(vm, true); assert.equal(vm.get('weaponThrowArmed'), true);
  assert.equal(vm.get('weaponThrowStock'), 1); assert.equal(vm.get('fpvTransitionWatchBaselineEpoch'), 41);
  vm.options.throwing = false; vm.run('FinishWeaponThrow'); vm.run('FinishWeaponThrow');
  assert.equal(vm.get('weaponLaunchReady'), true); assert.equal(vm.options.throwStock, 0);
  assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 0);
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 1);
});

for (const stock of [58, 61, 0]) test(`trusted watched stock60 rejects ambiguous rising-edge stock${stock}`, () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm); vm.options.throwStock = stock; tickThrowWatch(vm, true);
  assert.equal(vm.get('weaponThrowArmed'), false); assert.equal(vm.options.throwStock, stock);
  assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 0);
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 0);
});

test('prepaid watched drone with remaining stock cannot accept an unrelated selected grenade', () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm); vm.options.throwStock = 59; vm.options.equippedWeapon = otherWeapon;
  tickThrowWatch(vm, true); assert.equal(vm.get('weaponThrowArmed'), false);
  assert.equal(vm.options.throwStock, 59); assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 0);
});

for (const event of ['weaponFire', 'unrelated']) test(`generic ${event} without PrimaryAttack events cannot manually charge a watched throw`, () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm); tickThrowWatch(vm, true);
  assert.equal(vm.get('primaryAttackHeld'), false); assert.equal(vm.get('weaponPrimaryInterrupted'), false);
  vm.run('OnAnimationEvent', [vm.actor, event]); vm.options.throwing = false;
  for (let i = 0; i < 5; i++) vm.run('FinishWeaponThrow');
  assert.equal(vm.options.throwStock, 60); assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 0);
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 0);
});

test('throw-specific event from another actor cannot authorize manual charging', () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm); tickThrowWatch(vm, true);
  emitThrowRelease(vm, { kind: 'actor' });
  vm.run('OnAnimationEvent', [vm.actor, 'weaponFire']); vm.options.throwing = false;
  vm.run('FinishWeaponThrow'); vm.run('FinishWeaponThrow');
  assert.equal(vm.options.throwStock, 60); assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 0);
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 0);
});

test('primary-interrupted watched throw cannot manually charge even with its specific event', () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm); tickThrowWatch(vm, true);
  vm.set('weaponPrimaryInterrupted', true); emitThrowRelease(vm);
  vm.options.throwing = false; for (let i = 0; i < 5; i++) vm.run('FinishWeaponThrow');
  assert.equal(vm.options.throwStock, 60); assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 0);
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 0);
});

test('throw-specific event arriving while watch Arm yields is bound to the committed baseline', () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm);
  vm.options.onThrowStockRead = vm => {
    vm.options.onThrowStockRead = null; emitThrowRelease(vm);
    assert.equal(vm.get('fpvTransitionPendingThrowEnd'), true);
  };
  tickThrowWatch(vm, true); assert.equal(vm.get('fpvTransitionWatchBaselineEpoch'), 41);
  assert.equal(vm.get('fpvTransitionWatchSpecificReleaseEpoch'), 41);
  assert.equal(vm.get('fpvTransitionWatchThrowEndEpoch'), 41);
  vm.options.throwing = false; vm.run('FinishWeaponThrow'); vm.run('FinishWeaponThrow');
  assert.equal(vm.options.throwStock, 59); assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 1);
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 1);
});

test('quiet stock changes require two new matching samples before watched arming', () => {
  const vm = gamepadWatchVM(); tickThrowWatch(vm, false); vm.options.throwStock = 59; tickThrowWatch(vm, false);
  assert.ok(vm.get('fpvTransitionThrowQuietSamples') < 2);
  tickThrowWatch(vm, true); assert.equal(vm.get('weaponThrowArmed'), false);
  quietThrowWatch(vm); tickThrowWatch(vm, true);
  assert.equal(vm.get('weaponThrowArmed'), true); assert.equal(vm.get('weaponThrowStock'), 59);
});

test('quiet inventory read cannot commit a baseline when the second animation read observes a throw', () => {
  const vm = gamepadWatchVM(); tickThrowWatch(vm, false);
  vm.options.onThrowStockRead = vm => { vm.options.onThrowStockRead = null; vm.options.throwing = true; };
  tickThrowWatch(vm, false); tickThrowWatch(vm, true);
  assert.equal(vm.get('weaponThrowArmed'), false);
  quietThrowWatch(vm); tickThrowWatch(vm, true); assert.equal(vm.get('weaponThrowArmed'), true);
});

test('a rising throw during a quiet inventory read never replaces the trusted prethrow count', () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm); vm.options.throwStock = 59;
  vm.options.onThrowStockRead = vm => { vm.options.onThrowStockRead = null; vm.options.throwing = true; };
  tickThrowWatch(vm, false); tickThrowWatch(vm, true);
  if (vm.get('weaponThrowArmed')) assert.equal(vm.get('weaponThrowStock'), 60);
  assert.notEqual(vm.get('fpvTransitionQuietStock'), 59);
  assert.equal(vm.options.throwStock, 59); assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 0);
});

test('prepaid watched drone can use its trusted identity when the current grenade slot is None', () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm);
  vm.options.throwStock = 59; vm.options.equippedWeapon = null; vm.options.formEquipped = false;
  tickThrowWatch(vm, true); assert.equal(vm.get('weaponThrowStock'), 60);
  assert.equal(vm.get('weaponThrowArmed'), true); vm.options.throwing = false;
  vm.run('FinishWeaponThrow'); vm.run('FinishWeaponThrow');
  assert.equal(vm.get('weaponLaunchReady'), true); assert.equal(vm.options.throwStock, 59);
  assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 0);
});

test('completion timeout preserves actual stock, gate decision and event history after Reset', () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm); tickThrowWatch(vm, true);
  vm.run('OnAnimationEvent', [vm.actor, 'weaponFire']); vm.options.throwing = false;
  vm.options.afterThrowReset = vm => {
    vm.set('fpvTransitionChargeTrace', 'replacement gate after reset');
    vm.set('fpvTransitionChargeEvents', 'replacement events after reset');
  };
  for (let i = 0; i < 82 && vm.get('weaponThrowArmed'); i++) vm.run('FinishWeaponThrow');
  assert.equal(vm.get('weaponThrowStock'), 0); assert.equal(vm.get('weaponThrowArmed'), false);
  assert.equal(vm.ini.get('fpvdrone.launch|spend|reason'), 'ambiguous inventory or payment not permitted');
  const snapshot = vm.ini.get('fpvdrone.launch|spend|snapshot');
  assert.match(snapshot, /baseline=60; stock=60; remaining=-1; paidByEngine=false; payHere=false;/i);
  assert.match(snapshot, /selected=Weapon\(0800080E\)/);
  const gate = vm.ini.get('fpvdrone.launch|spend|gate');
  assert.match(gate, /token=41; allowed=false; current=41; pending=false;/i);
  assert.match(gate, /owner=41; baseline=41; fire=41; end=-1;/i);
  const events = vm.ini.get('fpvdrone.launch|spend|events');
  assert.match(events, /weaponFire/); assert.ok(!events.includes('weaponFire.2'));
  assert.ok(!gate.includes('replacement')); assert.ok(!events.includes('replacement'));
  assert.equal(vm.get('fpvTransitionWatchBaselineEpoch'), -1, 'snapshot must survive the subsequent reset');
  assert.equal(vm.get('fpvTransitionWatchSpecificReleaseEpoch'), -1);
  assert.equal(vm.ini.get('fpvdrone.launch|throw|reason'), 'throw: inventory settlement rejected');
  assert.equal(vm.options.throwStock, 60); assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 0);
});

test('interrupted manual payment reports the captured baseline and changed remainder after Reset', () => {
  const vm = throwVM(); assert.equal(vm.run('ArmWeaponThrow', [false]), 41);
  vm.set('weaponReleaseSeen', true); vm.set('weaponQuietSamples', 1);
  vm.options.onRemoveDrone = vm => { vm.options.throwStock = 58; };
  vm.run('FinishWeaponThrow'); assert.equal(vm.get('weaponThrowStock'), 0);
  assert.equal(vm.ini.get('fpvdrone.launch|spend|reason'), 'inventory changed during payment');
  assert.match(vm.ini.get('fpvdrone.launch|spend|snapshot'), /baseline=60; stock=60; remaining=58; paidByEngine=false; payHere=true;/i);
  assert.equal(vm.options.throwStock, 58); assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 1);
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 0);
});

for (const resets of [1, 2]) for (const replacePending of [false, true])
test(`old watch cannot transfer its pending throw proof after ${resets} cancellation(s), pending ${replacePending ? 'replaced' : 'original'}`, () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm); const watchEpoch = vm.get('fpvTransitionThrowWatchEpoch');
  vm.options.onThrowStockRead = vm => {
    vm.options.onThrowStockRead = null;
    emitThrowRelease(vm);
    assert.equal(vm.get('fpvTransitionPendingSpecificRelease'), true);
    for (let i = 0; i < resets; i++) vm.run('ResetWeaponThrow');
    // Model an overlapping normal callback after cancellation. Its stock is
    // identical, so only gesture/source ownership can distinguish the calls.
    vm.set('fpvTransitionWatchArmPending', false);
    assert.equal(vm.run('ArmWeaponThrow', [false]), 41 + resets);
    vm.set('fpvTransitionWatchArmPending', true);
    vm.set('fpvTransitionWatchPendingEpoch', watchEpoch);
    if (replacePending) vm.set('fpvTransitionPendingSourceEpoch', 41 + resets);
  };
  tickThrowWatch(vm, true); const newToken = 41 + resets;
  assert.equal(vm.get('weaponThrowEpoch'), newToken); assert.equal(vm.get('weaponThrowArmed'), true);
  assert.equal(vm.get('weaponThrowStock'), 60); assert.equal(vm.get('fpvTransitionWatchArmedEpoch'), -1);
  assert.equal(vm.get('fpvTransitionWatchBaselineEpoch'), -1); assert.equal(vm.get('fpvTransitionWatchSpecificReleaseEpoch'), -1);
  assert.equal(vm.get('fpvTransitionWatchArmPending'), replacePending);
  if (replacePending) {
    assert.equal(vm.get('fpvTransitionPendingSourceEpoch'), newToken);
    assert.equal(vm.run('FPVTransitionAllowManualThrowCharge', [newToken]), false);
  }
  assert.equal(vm.options.throwStock, 60); assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 0);
});

for (const selected of [null, otherWeapon]) test(`last-drone throw rising during quiet equipment read preserves prethrow1 after slot becomes ${selected?.name || 'None'}`, () => {
  const vm = gamepadWatchVM({ throwStock: 1 }); quietThrowWatch(vm);
  vm.options.onThrowEquipRead = vm => {
    vm.options.onThrowEquipRead = null; vm.options.equippedWeapon = selected;
    vm.options.formEquipped = false; vm.options.throwStock = 0; vm.options.throwing = true;
  };
  tickThrowWatch(vm, false); assert.equal(vm.get('weaponThrowArmed'), true);
  assert.equal(vm.get('weaponThrowStock'), 1); assert.equal(vm.get('fpvTransitionWatchBaselineEpoch'), 41);
  vm.options.throwing = false; vm.run('FinishWeaponThrow'); vm.run('FinishWeaponThrow');
  assert.equal(vm.get('weaponLaunchReady'), true); assert.equal(vm.options.throwStock, 0);
  assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 0);
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 1);
});

for (const restart of [false, true]) test(`${restart ? 'restarted' : 'duplicate'} watch timer cannot replace an in-flight pending owner`, () => {
  const vm = gamepadWatchVM();
  const pending = { fpvTransitionWatchArmPending: true,
    fpvTransitionWatchPendingEpoch: vm.get('fpvTransitionThrowWatchEpoch'),
    fpvTransitionPendingStock: 23, fpvTransitionPendingSourceEpoch: 37,
    fpvTransitionPendingPilot: vm.actor, fpvTransitionPendingWeapon: throwWeapon,
    fpvTransitionPendingSpecificRelease: true };
  for (const [name, value] of Object.entries(pending)) vm.set(name, value);
  if (restart) startThrowWatch(vm);
  quietThrowWatch(vm); tickThrowWatch(vm, true);
  for (const [name, value] of Object.entries(pending)) assert.equal(vm.get(name), value, `${name} overwritten by another watch callback`);
  assert.equal(vm.get('weaponThrowEpoch'), 40); assert.equal(vm.get('weaponThrowArmed'), false);
  assert.equal(vm.options.throwStock, 60); assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 0);
});

test('installed annotation parser fixture delivers a base event and hides the slot payload from Papyrus', () => {
  assert.deepEqual(vanillaMineClipFixture[0], { annotation: 'weaponFire.2', tag: 'weaponFire', payload: '2' });
  const vm = gamepadWatchVM(); quietThrowWatch(vm); tickThrowWatch(vm, true);
  vm.run('OnAnimationEvent', [vm.actor, annotationTag('weaponFire.2')]);
  assert.equal(vm.get('weaponReleaseSeen'), true);
  assert.equal(vm.get('fpvTransitionWatchSpecificReleaseEpoch'), 41);
  assert.equal(vm.run('FPVTransitionAllowManualThrowCharge', [41]), false, 'base fire alone must not pay without completing this throw');
  vm.run('OnAnimationEvent', [vm.actor, 'throwEnd']); vm.options.throwing = false;
  vm.run('FinishWeaponThrow'); vm.run('FinishWeaponThrow');
  assert.equal(vm.options.throwStock, 59); assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 1);
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 1);
});

test('out-of-context base fire and throwEnd cannot authorize a new watched throw', () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm);
  emitThrowRelease(vm); tickThrowWatch(vm, true); vm.options.throwing = false;
  for (let i = 0; i < 5; i++) vm.run('FinishWeaponThrow');
  assert.equal(vm.options.throwStock, 60); assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 0);
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 0);
});

test('base fire can wait for a reordered throwEnd without premature payment rejection', () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm); tickThrowWatch(vm, true);
  vm.run('OnAnimationEvent', [vm.actor, annotationTag('weaponFire.2')]); vm.options.throwing = false;
  for (let i = 0; i < 6; i++) vm.run('FinishWeaponThrow');
  assert.equal(vm.get('weaponThrowArmed'), true); assert.equal(vm.get('weaponInputBusy'), false);
  assert.equal(vm.options.throwStock, 60); assert.equal(vm.ini.size, 0);
  assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 0);
  assert.ok(vm.log.some(e => e.type === 'starttimer' && e.args[1] === 8));
  vm.run('OnAnimationEvent', [vm.actor, 'throwEnd']);
  vm.run('FinishWeaponThrow'); vm.run('FinishWeaponThrow');
  assert.equal(vm.options.throwStock, 59); assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 1);
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 1);
});

test('throwEnd from another actor cannot complete an unpaid watched throw', () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm); tickThrowWatch(vm, true);
  vm.run('OnAnimationEvent', [vm.actor, 'weaponFire']); vm.options.throwing = false;
  vm.run('OnAnimationEvent', [{ kind: 'actor' }, 'throwEnd']);
  for (let i = 0; i < 82 && vm.get('weaponThrowArmed'); i++) vm.run('FinishWeaponThrow');
  assert.equal(vm.options.throwStock, 60); assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 0);
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 0); assert.equal(vm.get('weaponThrowArmed'), false);
});

test('an old throwEnd cannot be paired with a later fire to authorize payment', () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm); tickThrowWatch(vm, true);
  vm.run('OnAnimationEvent', [vm.actor, 'throwEnd']);
  assert.equal(vm.get('fpvTransitionWatchThrowEndEpoch'), -1);
  vm.run('OnAnimationEvent', [vm.actor, 'weaponFire']); vm.options.throwing = false;
  const { ticks } = drainThrowTimerChain(vm);
  assert.ok(ticks <= 83); assert.equal(vm.get('weaponThrowArmed'), false);
  assert.equal(vm.options.throwStock, 60); assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 0);
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 0);
});

test('pending throwEnd before fire cannot become completion proof when the arm commits', () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm);
  vm.options.onThrowStockRead = vm => {
    vm.options.onThrowStockRead = null;
    vm.run('OnAnimationEvent', [vm.actor, 'throwEnd']);
    assert.equal(vm.get('fpvTransitionPendingThrowEnd'), false);
    vm.run('OnAnimationEvent', [vm.actor, 'weaponFire']);
    assert.equal(vm.get('fpvTransitionPendingSpecificRelease'), true);
    assert.equal(vm.get('fpvTransitionPendingThrowEnd'), false);
  };
  tickThrowWatch(vm, true);
  assert.equal(vm.get('fpvTransitionWatchSpecificReleaseEpoch'), 41);
  assert.equal(vm.get('fpvTransitionWatchThrowEndEpoch'), -1);
  vm.options.throwing = false; drainThrowTimerChain(vm);
  assert.equal(vm.get('weaponThrowArmed'), false); assert.equal(vm.options.throwStock, 60);
  assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 0);
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 0);
});

test('missing completion terminates using only its actual scheduled timer callbacks', () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm); tickThrowWatch(vm, true);
  vm.run('OnAnimationEvent', [vm.actor, 'weaponFire']); vm.options.throwing = false;
  const { ticks } = drainThrowTimerChain(vm);
  assert.ok(ticks >= 80 && ticks <= 83);
  assert.equal(vm.get('weaponThrowArmed'), false, 'timer chain silently stopped while the throw remained armed');
  assert.equal(vm.get('weaponInputBusy'), false, 'completion timeout left the input transaction busy');
  assert.equal(vm.options.throwStock, 60); assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 0);
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 0);
});

test('completion wait returns on a native token change without modifying its replacement throw', () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm); tickThrowWatch(vm, true);
  vm.run('OnAnimationEvent', [vm.actor, 'weaponFire']); vm.options.throwing = false; vm.log.length = 0;
  const replacement = { weaponThrowEpoch: 42, weaponThrowArmed: true, weaponThrowStock: 23,
    weaponPolls: 37, weaponInputBusy: false, weaponQuietSamples: 3, weaponChargeSettled: true };
  vm.options.onThrowStockRead = vm => {
    vm.options.onThrowStockRead = null;
    for (const [name, value] of Object.entries(replacement)) vm.set(name, value);
  };
  vm.run('FinishWeaponThrow');
  for (const [name, value] of Object.entries(replacement)) assert.equal(vm.get(name), value, `${name} modified by an old wait callback`);
  assert.equal(vm.options.throwStock, 60); assert.equal(vm.log.length, 0); assert.equal(vm.ini.size, 0);
});

test('a pending cancellation bypasses completion waiting and cannot launch an unpaid throw', () => {
  const vm = gamepadWatchVM(); quietThrowWatch(vm); tickThrowWatch(vm, true);
  vm.run('OnAnimationEvent', [vm.actor, 'weaponFire']); vm.options.throwing = false;
  vm.set('weaponCancelPending', true); vm.log.length = 0;
  vm.options.onThrowStockRead = () => assert.fail('pending cancellation entered the completion wait inventory query');
  assert.equal(vm.run('FPVTransitionWaitForWatchCompletion', [41, false, false]), false);
  assert.equal(vm.log.length, 0);
  vm.options.onThrowStockRead = null;
  vm.run('FinishWeaponThrow');
  assert.equal(vm.get('weaponQuietSamples'), 1, 'completion wait swallowed the original cancellation/settling path');
  vm.run('FinishWeaponThrow');
  assert.equal(vm.get('weaponThrowArmed'), false); assert.equal(vm.options.throwStock, 60);
  assert.equal(vm.log.filter(e => e.type === 'remove-drone').length, 0);
  assert.equal(vm.log.filter(e => e.type === 'launch').length, 0);
});

test('bounded animation trace records only this actor without engine queries or file I/O', () => {
  const vm = throwVM();
  vm.options.onThrowAnimationRead = () => assert.fail('memory trace queried animation state');
  vm.options.onThrowStockRead = () => assert.fail('memory trace queried inventory');
  vm.staticCall = () => assert.fail('memory trace invoked a static native');
  for (let i = 0; i < 12; i++) vm.run('FPVTransitionTraceAnimation', [vm.actor, 'evt_' + i]);
  vm.run('FPVTransitionTraceAnimation', [{ kind: 'actor' }, 'foreign']);
  const snapshot = vm.run('FPVTransitionSnapshotEventTrace');
  assert.equal(vm.get('fpvTransitionEventTrace').length, 8);
  assert.deepEqual([...snapshot.matchAll(/evt_(\d+)/g)].map(m => Number(m[1])), [4, 5, 6, 7, 8, 9, 10, 11]);
  assert.ok(!snapshot.includes('foreign')); assert.equal(vm.log.length, 0); assert.equal(vm.ini.size, 0);
});

console.log(JSON.stringify({ testsPassed: results.length, tests: results, limitation: 'Compiled PEX logic under deterministic native stubs; no in-game animation/rendering verification.' }, null, 2));
