// Execute the shipped controller-menu PEX helpers against deterministic MCM/INI stubs.
// This verifies compiled Papyrus control flow; it does not emulate the MCM SWF renderer.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { parse } = require('./pex');
const root = path.resolve(__dirname, '..');
const object = parse(fs.readFileSync(path.join(root, '_build/launch_transition/candidate/FPVDroneQuestScript.pex'))).objects[0];
const functions = new Map(object.states.flatMap(s => s.functions).map(f => [f.name.toLowerCase(), f]));
const key = s => s.toLowerCase();
const truth = v => v !== null && v !== undefined && v !== false && v !== 0 && v !== '';
const zero = type => /^(int|float)$/i.test(type) ? 0 : /^bool$/i.test(type) ? false : /^string$/i.test(type) ? '' : null;
const devicesProperty = 'FPVTransitionControllerDevices';
const statusProperty = 'FPVTransitionControllerStatus';
const selection = 'sSelectedDevice:Controllers';
const selectionName = 'sSelectedDeviceName:Controllers';
const choice = 'iDeviceChoice:Controllers';
const layoutMode = 'iControllerLayout:Controllers';
const layoutStamp = 'sAppliedControllerLayout:Controllers';
// Author-default fixture: automatic Xbox/Mode 2. DirectInput device layouts
// must be supplied by the inventory rather than guessed from this baseline.
const layoutFields = ['iThrottleAxis', 'iYawAxis', 'iRollAxis', 'iPitchAxis', 'bInvertThrottle', 'bInvertYaw', 'bInvertRoll', 'bInvertPitch', 'iThrottleMode'];
const xboxLayout = [1, 0, 3, 4, 1, 0, 0, 0, 1];
const dualshockLayout = [1, 0, 2, 5, 1, 0, 0, 0, 1];
const authorDefaults = new Map(); let authorSection = '';
for (const row of fs.readFileSync(path.join(root, 'MCM/Config/FPVDrone/settings.ini'), 'utf8').split(/\r?\n/)) {
  if (/^\[/.test(row)) authorSection = row.slice(1, -1);
  else if (/^[^;=]+=/.test(row)) {
    const at = row.indexOf('='), field = row.slice(0, at), value = row.slice(at + 1);
    authorDefaults.set(field + ':' + authorSection, /^[if]/.test(field) ? Number(value) : /^b/.test(field) ? value === '1' : value);
  }
}

class VM {
  constructor(options = {}) {
    this.options = options; this.now = 10; this.steps = 0; this.log = []; this.events = [];
    this.vars = new Map(object.variables.map(v => [key(v.name), /^bool$/i.test(v.type) ? !!v.value.v : v.value.v]));
    this.types = new Map(object.variables.map(v => [key(v.name), v.type]));
    this.properties = new Map(object.properties.map(p => [key(p.name), p.autoVar]));
    this.settings = new Map(authorDefaults);
    this.settings.set(selection, 'keyboard'); this.settings.set(selectionName, 'Keyboard and mouse'); this.settings.set(choice, 0);
    this.plugins = new Map([['F4MCM', 139], ['FPVDroneController', 132], ['GardenOfEdenPapyrusScriptExtender', 0x17040000], ['FPVDroneNative', 128]]);
    this.ini = new Map();
    this.registered = new Map(); this.reads = 0; this.version = 1;
    this.cache = {}; this.setDevices([['keyboard', 'Keyboard and mouse'], ['dinput:a', 'Radio A'], ['xinput:0', 'Xbox #1']]);
    this.set('enabled', true);
  }
  get(name) { return this.vars.get(key(this.properties.get(key(name)) || name)); }
  set(name, value) { this.vars.set(key(this.properties.get(key(name)) || name), value); }
  record(type, extra = {}) { this.log.push({ type, time: this.now, ...extra }); }
  setDevices(devices) {
    this.version++;
    this.cache = { 'Devices.ScanVersion': String(this.version), 'Devices.Count': String(devices.length), 'Bridge.Ready': '1', 'Bridge.Status': 'Ready' };
    devices.forEach(([id, name, layout], i) => {
      this.cache['Devices.Id' + i] = id; this.cache['Devices.Name' + i] = name;
      if (layout !== undefined) this.cache['Devices.Layout' + i] = layout;
    });
  }
  schedule(delay, action) { this.events.push({ at: this.now + delay, action }); this.events.sort((a, b) => a.at - b.at); }
  wait(seconds) {
    const end = this.now + seconds;
    while (this.events.length && this.events[0].at <= end + 1e-9) { const event = this.events.shift(); this.now = Math.max(this.now, event.at); event.action(); }
    this.now = Math.max(this.now, end);
  }
  invoke(receiver, method, args) {
    assert.equal(receiver, this, 'Only the quest receives native calls');
    const name = key(method);
    if (name.startsWith('fpvtransition')) return this.run(method, args);
    if (name === 'registerforexternalevent') { this.registered.set(args[0], args[1]); return; }
    if (name === 'unregisterforexternalevent') { this.registered.delete(args[0]); return; }
    throw Error(`Unexpected self native ${method}`);
  }
  staticCall(cls, method, args) {
    const name = key(cls) + '.' + key(method);
    switch (name) {
      case 'f4se.getpluginversion': {
        const found = [...this.plugins.keys()].find(k => key(k) === key(args[0]));
        return found === undefined ? -1 : this.plugins.get(found);
      }
      case 'utility.getcurrentrealtime': return this.now;
      case 'utility.waitmenumode': this.wait(args[0]); return;
      case 'gardenofeden2.readini': {
        if (args[0] === 'FPVDrone.launch') return this.ini.get([args[0], args[1], args[2]].map(key).join('|')) || '';
        assert.equal(args[0], 'FPVDrone.controllers'); this.reads++;
        if (this.options.onRead) this.options.onRead(this, args[1], args[2]);
        // Win32 profile APIs are case insensitive; Papyrus interns Count/count together.
        const cacheKey = Object.keys(this.cache).find(k => key(k) === key(args[1] + '.' + args[2]));
        return this.cache[cacheKey] || '';
      }
      case 'gardenofeden2.writeini': {
        this.record('write-ini', { file: args[0], section: args[1], field: args[2], value: args[3] });
        this.ini.set([args[0], args[1], args[2]].map(key).join('|'), args[3]);
        if (args[0] === 'FPVDrone.controllers.request') {
          if (this.options.onRequest) this.options.onRequest(this);
          else if (!this.options.noScan) this.schedule(0.05, () => { this.cache['Devices.ScanVersion'] = String(++this.version); });
        }
        return true;
      }
      case 'mcm.getmodsettingbool':
        assert.equal(args[0], 'FPVDrone'); return !!this.settings.get(args[1]);
      case 'mcm.getmodsettingint': case 'mcm.getmodsettingstring':
        assert.equal(args[0], 'FPVDrone'); return this.settings.get(args[1]) ?? (name.endsWith('int') ? 0 : '');
      case 'mcm.setmodsettingbool': args[2] = !!args[2]; // Match MCM's typed Bool API.
      case 'mcm.setmodsettingint': case 'mcm.setmodsettingstring':
        assert.equal(args[0], 'FPVDrone'); this.settings.set(args[1], args[2]); this.record('setting', { field: args[1], value: args[2] });
        if (this.options.onSetting) this.options.onSetting(this, args[1], args[2]);
        return;
      case 'mcm.refreshmenu': this.record('refresh'); return;
      case 'debug.notification': this.record('notification', { text: args[0] }); return;
      case 'debug.trace': if (!this.options.traceDisabled) this.record('trace', { text: args[0] }); return;
      case 'fpvdronenative.getstatus': this.record('native-status-read'); return this.options.nativeStatus ?? 1;
      case 'fpvdronenative.getframes': this.record('native-frames-read'); return this.options.nativeFrames ?? 123;
      default: throw Error(`Unexpected static native ${name}`);
    }
  }
  run(name, args = []) {
    const f = functions.get(key(name)); assert.ok(f, `Compiled function ${name} missing`);
    const locals = new Map(f.locals.map(l => [key(l.name), zero(l.type)]));
    const types = new Map(f.locals.map(l => [key(l.name), l.type]));
    f.params.forEach((p, i) => { locals.set(key(p.name), args[i]); types.set(key(p.name), p.type); });
    const read = value => value.t !== 1 ? value.t === 5 ? !!value.v : value.v : key(value.v) === 'self' ? this : locals.has(key(value.v)) ? locals.get(key(value.v)) : this.get(value.v);
    const put = (value, v) => {
      const n = key(value.v);
      if (locals.has(n)) locals.set(n, v);
      else { assert.ok(this.vars.has(n), `Unknown variable ${value.v}`); this.vars.set(n, v); }
    };
    for (let pc = 0; pc < f.code.length;) {
      assert.ok(++this.steps < 2000000, 'VM instruction budget exceeded');
      const { op, a } = f.code[pc]; let next = pc + 1;
      switch (op) {
        case 'nop': break;
        case 'assign': put(a[0], read(a[1])); break;
        case 'cast': {
          const type = key(types.get(key(a[0].v)) || this.types.get(key(a[0].v)) || '');
          let v = read(a[1]);
          if (type === 'bool') v = truth(v);
          else if (type === 'int') v = Math.trunc(Number(v) || 0);
          else if (type === 'float') v = Number(v) || 0;
          else if (type === 'string') v = v == null ? '' : String(v);
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
        case 'strcat': put(a[0], String(read(a[1])) + String(read(a[2]))); break;
        case 'jmp': next = pc + read(a[0]); break;
        case 'jmpt': if (truth(read(a[0]))) next = pc + read(a[1]); break;
        case 'jmpf': if (!truth(read(a[0]))) next = pc + read(a[1]); break;
        case 'array_create': put(a[0], Array(read(a[1])).fill('')); break;
        case 'array_length': put(a[0], read(a[1])?.length || 0); break;
        case 'array_getelement': { const arr = read(a[1]); const i = read(a[2]); assert.ok(arr && i >= 0 && i < arr.length, `Invalid array read ${name}:${pc}`); put(a[0], arr[i]); break; }
        case 'array_setelement': { const arr = read(a[0]); const i = read(a[1]); assert.ok(arr && i >= 0 && i < arr.length, `Invalid array write ${name}:${pc}`); arr[i] = read(a[2]); break; }
        case 'callmethod': put(a[2], this.invoke(read(a[1]), a[0].v, a.slice(4).map(read))); break;
        case 'callstatic': put(a[2], this.staticCall(a[0].v, a[1].v, a.slice(4).map(read))); break;
        case 'return': return read(a[0]);
        default: throw Error(`Unsupported compiled opcode ${op} in ${name}:${pc}`);
      }
      pc = next;
    }
  }
}

const results = [];
function test(name, body) { body(); results.push(name); }
const refresh = vm => vm.run('FPVTransitionRefreshControllers');
const change = vm => vm.run('FPVTransitionControllerSettingChange', ['FPVDrone', choice]);

test('auto properties expose the real label array and status string to MCM', () => {
  for (const [name, type] of [[devicesProperty, 'String[]'], [statusProperty, 'String']]) {
    const property = object.properties.find(p => p.name === name);
    assert.ok(property && (property.bits & 4)); assert.equal(property.type, type);
    assert.ok(object.variables.some(v => v.name === property.autoVar && v.type === type));
  }
});
test('initial registration supplies keyboard before any native cache is read', () => {
  const vm = new VM(); vm.run('FPVTransitionRegisterControllerMenu');
  assert.deepEqual(vm.get('fpvTransitionControllerIDs'), ['keyboard']);
  assert.equal(vm.get(devicesProperty).length, 1); assert.equal(vm.reads, 0);
  assert.equal(vm.registered.get('OnMCMMenuOpen|FPVDrone'), 'FPVTransitionControllerMenuOpen');
});
test('registration preserves an already published array', () => {
  const vm = new VM(); refresh(vm); const labels = vm.get(devicesProperty);
  vm.run('FPVTransitionRegisterControllerMenu'); assert.equal(vm.get(devicesProperty), labels);
});
test('MCM absence leaves keyboard available and does not call MCM or INI', () => {
  const vm = new VM(); vm.plugins.delete('F4MCM'); vm.run('FPVTransitionRegisterControllerMenu'); refresh(vm);
  assert.deepEqual(vm.get('fpvTransitionControllerIDs'), ['keyboard']);
  assert.equal(vm.registered.size, 0); assert.equal(vm.reads, 0); assert.equal(vm.log.length, 0);
});
for (const version of [-1, 131]) test(`missing/old native bridge ${version} rejects stale cached devices`, () => {
  const vm = new VM(); vm.plugins.set('FPVDroneController', version); refresh(vm);
  assert.deepEqual(vm.get('fpvTransitionControllerIDs'), ['keyboard']); assert.equal(vm.reads, 0);
  assert.match(vm.get(statusProperty), /не загружен/); assert.equal(vm.log.filter(e => e.type === 'refresh').length, 1);
});
test('disabled mod does not register or refresh', () => {
  const vm = new VM(); vm.set('enabled', false); vm.run('FPVTransitionRegisterControllerMenu'); refresh(vm);
  assert.equal(vm.registered.size, 0); assert.equal(vm.reads, 0); assert.equal(vm.log.length, 0);
});
test('menu-open event refreshes only the enabled FPVDrone page', () => {
  const vm = new VM(); vm.run('FPVTransitionControllerMenuOpen', ['OtherMod']); assert.equal(vm.reads, 0);
  vm.run('FPVTransitionControllerMenuOpen', ['FPVDrone']); assert.ok(vm.reads > 0);
});
test('refresh request uses a separate INI and reads native device names and IDs', () => {
  const vm = new VM(); refresh(vm);
  assert.deepEqual(vm.get(devicesProperty), ['Keyboard and mouse', 'Radio A', 'Xbox #1']);
  assert.deepEqual(vm.get('fpvTransitionControllerIDs'), ['keyboard', 'dinput:a', 'xinput:0']);
  const writes = vm.log.filter(e => e.type === 'write-ini'); assert.equal(writes.length, 1);
  assert.deepEqual({ file: writes[0].file, section: writes[0].section, field: writes[0].field }, { file: 'FPVDrone.controllers.request', section: 'Commands', field: 'ScanRequest' });
  assert.equal(vm.settings.get(choice), 0); assert.match(vm.get(statusProperty), /2/);
});
test('no controllers still publishes a valid keyboard-only list', () => {
  const vm = new VM(); vm.setDevices([['keyboard', 'Keyboard and mouse']]); refresh(vm);
  assert.deepEqual(vm.get('fpvTransitionControllerIDs'), ['keyboard']); assert.equal(vm.settings.get(choice), 0);
  assert.match(vm.get(statusProperty), /0/);
});
test('reordering devices remaps UI index while preserving the saved stable ID', () => {
  const vm = new VM(); vm.settings.set(selection, 'xinput:0'); refresh(vm); assert.equal(vm.settings.get(choice), 2);
  vm.setDevices([['keyboard', 'Keyboard'], ['xinput:0', 'Renamed Xbox'], ['dinput:a', 'Radio A']]); refresh(vm);
  assert.equal(vm.settings.get(choice), 1); assert.equal(vm.settings.get(selection), 'xinput:0');
  assert.equal(vm.get(devicesProperty)[1], 'Renamed Xbox');
});
test('disconnected saved device gets a ghost row without silently selecting keyboard', () => {
  const vm = new VM(); vm.settings.set(selection, 'dinput:missing'); vm.settings.set(selectionName, 'My FPV radio'); refresh(vm);
  assert.equal(vm.settings.get(selection), 'dinput:missing'); assert.equal(vm.settings.get(choice), 3);
  assert.equal(vm.get(devicesProperty)[3], 'Не подключён: My FPV radio');
  assert.equal(vm.get('fpvTransitionControllerIDs')[3], 'dinput:missing'); assert.match(vm.get(statusProperty), /отключён/);
});
test('missing saved device name falls back to its stable ID', () => {
  const vm = new VM(); vm.settings.set(selection, 'dinput:missing'); vm.settings.set(selectionName, ''); refresh(vm);
  assert.equal(vm.get(devicesProperty)[3], 'Не подключён: dinput:missing');
});
test('empty saved source is explicitly initialized to keyboard', () => {
  const vm = new VM(); vm.settings.set(selection, ''); refresh(vm);
  assert.equal(vm.settings.get(selection), 'keyboard'); assert.equal(vm.settings.get(choice), 0);
});
test('choice uses the published ID/name pair even when the native cache changes', () => {
  const vm = new VM(); refresh(vm); vm.settings.set(choice, 1);
  vm.setDevices([['keyboard', 'Keyboard'], ['xinput:3', 'Different Xbox']]); const reads = vm.reads; change(vm);
  assert.equal(vm.settings.get(selection), 'dinput:a'); assert.equal(vm.settings.get(selectionName), 'Radio A');
  assert.equal(vm.reads, reads); assert.match(vm.get(statusProperty), /Radio A/);
});
test('choice retains the same ID/name snapshot if the first setter synchronously replaces the list', () => {
  const vm = new VM(); refresh(vm); vm.settings.set(choice, 1);
  vm.options.onSetting = (vm, field) => {
    if (field === selection) {
      vm.set('fpvTransitionControllerIDs', ['keyboard', 'dinput:replacement']);
      vm.set(devicesProperty, ['Keyboard', 'Replacement radio']);
    }
  };
  change(vm); assert.equal(vm.settings.get(selection), 'dinput:a');
  assert.equal(vm.settings.get(selectionName), 'Radio A'); assert.match(vm.get(statusProperty), /Radio A/);
});
for (const labels of [null, ['Keyboard']]) test(`invalid label snapshot ${labels === null ? 'None' : 'short array'} cannot pair the selected ID with an absent name`, () => {
  const vm = new VM(); refresh(vm); vm.settings.set(choice, 1); vm.set(devicesProperty, labels); change(vm);
  assert.equal(vm.settings.get(selection), 'keyboard'); assert.equal(vm.settings.get(choice), 0);
  assert.deepEqual(vm.get(devicesProperty), ['Keyboard and mouse', 'Radio A', 'Xbox #1']);
});
test('label/ID arrays are published before the UI index setter is called', () => {
  const vm = new VM({ onSetting(vm, field, index) {
    if (field === choice) { assert.equal(vm.get('fpvTransitionControllerIDs')[index], vm.settings.get(selection)); assert.equal(vm.get(devicesProperty).length, vm.get('fpvTransitionControllerIDs').length); }
  } }); vm.settings.set(selection, 'xinput:0'); refresh(vm);
});
for (const index of [-1, 99]) test(`invalid choice ${index} refreshes without writing an arbitrary ID`, () => {
  const vm = new VM(); refresh(vm); vm.settings.set(choice, index); change(vm);
  assert.equal(vm.settings.get(selection), 'keyboard'); assert.equal(vm.settings.get(choice), 0);
});
test('unrelated setting events and disabled mod cannot change selection', () => {
  const vm = new VM(); refresh(vm); vm.settings.set(choice, 1); const logSize = vm.log.length;
  vm.run('FPVTransitionControllerSettingChange', ['OtherMod', choice]);
  vm.run('FPVTransitionControllerSettingChange', ['FPVDrone', 'fYawSensitivity:Controls']);
  vm.set('enabled', false); change(vm);
  assert.equal(vm.settings.get(selection), 'keyboard'); assert.equal(vm.log.length, logSize);
});
test('native hook readiness failure retains the last complete list and reports the reason', () => {
  const vm = new VM(); refresh(vm); const ids = vm.get('fpvTransitionControllerIDs');
  vm.cache['Bridge.Ready'] = '0'; vm.cache['Bridge.Status'] = 'Unsupported native DLL'; refresh(vm);
  assert.equal(vm.get('fpvTransitionControllerIDs'), ids); assert.match(vm.get(statusProperty), /Unsupported native DLL/);
});
for (const corruption of ['empty-name', 'empty-id', 'invalid-first-id', 'zero-count', 'large-count', 'missing-version']) test(`incomplete native cache (${corruption}) cannot replace a valid snapshot`, () => {
  const vm = new VM({ noScan: true }); refresh(vm); const ids = vm.get('fpvTransitionControllerIDs'); const labels = vm.get(devicesProperty);
  if (corruption === 'empty-name') vm.cache['Devices.Name1'] = '';
  if (corruption === 'empty-id') vm.cache['Devices.Id1'] = '';
  if (corruption === 'invalid-first-id') vm.cache['Devices.Id0'] = 'xinput:0';
  if (corruption === 'zero-count') vm.cache['Devices.Count'] = '0';
  if (corruption === 'large-count') vm.cache['Devices.Count'] = '64';
  if (corruption === 'missing-version') vm.cache['Devices.ScanVersion'] = '';
  refresh(vm); assert.equal(vm.get('fpvTransitionControllerIDs'), ids); assert.equal(vm.get(devicesProperty), labels);
  assert.match(vm.get(statusProperty), /обновляется/);
});
test('changing ScanVersion during every snapshot prevents mixed cache publication', () => {
  const vm = new VM(); refresh(vm); const ids = vm.get('fpvTransitionControllerIDs');
  vm.options.onRead = (vm, section, field) => { if (section === 'Devices' && field === 'Name1') vm.cache['Devices.ScanVersion'] = String(++vm.version); };
  refresh(vm); assert.equal(vm.get('fpvTransitionControllerIDs'), ids); assert.match(vm.get(statusProperty), /обновляется/);
});
test('a transient incoherent snapshot retries and publishes the next complete version', () => {
  let changed = false;
  const vm = new VM({ onRead(vm, section, field) {
    if (!changed && section === 'Devices' && field === 'Name1') { changed = true; vm.cache['Devices.ScanVersion'] = String(++vm.version); }
  } }); refresh(vm); assert.deepEqual(vm.get('fpvTransitionControllerIDs'), ['keyboard', 'dinput:a', 'xinput:0']);
  assert.ok(vm.now >= 10.1 - 1e-9);
});
test('shutdown invalidates a refresh waiting on the worker and unregisters MCM', () => {
  const vm = new VM({ noScan: true }); vm.run('FPVTransitionRegisterControllerMenu'); const labels = vm.get(devicesProperty);
  vm.schedule(0.02, () => vm.run('FPVTransitionUnregisterControllerMenu')); refresh(vm);
  assert.equal(vm.get(devicesProperty), labels); assert.equal(vm.registered.size, 0);
  assert.equal(vm.log.filter(e => e.type === 'refresh').length, 0); assert.equal(vm.log.filter(e => e.type === 'setting').length, 0);
});
test('newer refresh supersedes an older latent refresh without stale publication', () => {
  const vm = new VM({ noScan: true });
  vm.schedule(0.02, () => { vm.setDevices([['keyboard', 'Keyboard'], ['dinput:new', 'New radio']]); vm.options.noScan = false; refresh(vm); });
  refresh(vm); assert.deepEqual(vm.get('fpvTransitionControllerIDs'), ['keyboard', 'dinput:new']);
  assert.equal(vm.log.filter(e => e.type === 'refresh').length, 1); assert.equal(vm.log.filter(e => e.type === 'setting' && e.field === choice).length, 1);
});
test('epoch invalidation during snapshot reads prevents publishing a half-finished list', () => {
  const vm = new VM(); vm.run('FPVTransitionRegisterControllerMenu'); const labels = vm.get(devicesProperty);
  vm.options.onRead = (vm, section, field) => { if (section === 'Devices' && field === 'Name1') vm.run('FPVTransitionUnregisterControllerMenu'); };
  refresh(vm); assert.equal(vm.get(devicesProperty), labels); assert.equal(vm.log.filter(e => e.type === 'refresh').length, 0);
});
test('compiled lifecycle and MCM event handlers invoke the controller helpers', () => {
  const calls = name => functions.get(key(name)).code.filter(i => i.op === 'callmethod').map(i => key(i.a[0].v));
  assert.ok(calls('RecoverAfterLoad').includes('fpvtransitionregistercontrollermenu'));
  assert.ok(calls('EnableMod').includes('fpvtransitionregistercontrollermenu'));
  assert.ok(calls('Shutdown').includes('fpvtransitionunregistercontrollermenu'));
  assert.equal(calls('OnMCMSettingChange')[0], 'fpvtransitioncontrollersettingchange');
});
const notice = vm => {
  vm.run('FPVTransitionFlightNotice');
  const messages = vm.log.filter(e => e.type === 'notification');
  assert.equal(messages.length, 1); assert.match(messages[0].text, /F10/);
  return messages[0].text;
};
test('flight hint defaults to keyboard and mouse for keyboard or empty selection', () => {
  const baseline = notice(new VM()); assert.ok(baseline.length > 10);
  const vm = new VM(); vm.settings.set(selection, ''); assert.equal(notice(vm), baseline);
});
for (const missing of ['F4MCM', 'FPVDroneController']) test(`flight hint falls back to keyboard without ${missing}`, () => {
  const baseline = notice(new VM()); const vm = new VM(); vm.settings.set(selection, 'dinput:a'); vm.plugins.delete(missing);
  assert.equal(notice(vm), baseline);
});
test('old controller bridge cannot activate the controller flight hint', () => {
  const baseline = notice(new VM()); const vm = new VM(); vm.settings.set(selection, 'dinput:a'); vm.plugins.set('FPVDroneController', 131);
  assert.equal(notice(vm), baseline);
});
test('MCM controller selection produces its own flight hint and preserves F10', () => {
  const baseline = notice(new VM()); const vm = new VM(); vm.settings.set(selection, 'dinput:a');
  const controller = notice(vm); assert.notEqual(controller, baseline);
  assert.doesNotMatch(controller, /ЛКМ|LMB|left mouse|W\/S\/A\/D/i);
});
test('Launch uses the dynamic flight notice instead of the old keyboard instructions', () => {
  const launch = functions.get('launch');
  assert.equal(launch.code.filter(i => i.op === 'callmethod' && key(i.a[0].v) === 'fpvtransitionflightnotice').length, 1);
});

function captureInput(vm, id = 'dinput:a') {
  vm.set('mode', 1); vm.set('generation', 7); vm.settings.set(selection, id);
  vm.run('FPVTransitionCaptureController', [7]);
}
test('controller flight mouse policy snapshots ready MCM selection before native start', () => {
  const vm = new VM(); captureInput(vm); assert.equal(vm.get('fpvTransitionControllerFlight'), true);
  assert.equal(vm.get('fpvTransitionControllerFlightGeneration'), 7);
  vm.set('mode', 2); assert.equal(vm.run('FPVTransitionIgnoreMouseInput', [256]), true);
  assert.equal(vm.run('FPVTransitionIgnoreMouseInput', [121]), false);
  vm.settings.set(selection, 'keyboard');
  assert.equal(vm.run('FPVTransitionIgnoreMouseInput', [256]), true, 'midflight menu choice changed current input owner');
});
test('keyboard flight remains keyboard after choosing a controller midflight', () => {
  const vm = new VM(); captureInput(vm, 'keyboard'); vm.set('mode', 2); vm.settings.set(selection, 'dinput:a');
  assert.equal(vm.run('FPVTransitionIgnoreMouseInput', [256]), false);
});
for (const missing of ['F4MCM', 'FPVDroneController', 'ready']) test(`controller mouse policy remains keyboard without ${missing}`, () => {
  const vm = new VM(); if (missing === 'ready') vm.cache['Bridge.Ready'] = '0'; else vm.plugins.delete(missing);
  captureInput(vm); assert.equal(vm.get('fpvTransitionControllerFlight'), false);
});
test('stale controller capture cannot overwrite a newer flight input owner', () => {
  const vm = new VM(); vm.set('mode', 1); vm.set('generation', 8);
  vm.set('fpvTransitionControllerFlight', true); vm.set('fpvTransitionControllerFlightGeneration', 8);
  vm.run('FPVTransitionCaptureController', [7]);
  assert.equal(vm.get('fpvTransitionControllerFlight'), true); assert.equal(vm.get('fpvTransitionControllerFlightGeneration'), 8);
});
test('capture rechecks generation after yielding INI/MCM calls', () => {
  const vm = new VM(); vm.options.onRead = vm => {
    vm.set('generation', 8); vm.set('fpvTransitionControllerFlight', true); vm.set('fpvTransitionControllerFlightGeneration', 8);
  };
  captureInput(vm, 'keyboard');
  assert.equal(vm.get('fpvTransitionControllerFlight'), true); assert.equal(vm.get('fpvTransitionControllerFlightGeneration'), 8);
});
test('idle abort cleanup clears only old idle ownership', () => {
  const vm = new VM(); captureInput(vm); vm.set('mode', 2);
  vm.run('FPVTransitionClearIdleControllerFlight'); assert.equal(vm.get('fpvTransitionControllerFlight'), true);
  vm.set('mode', 0); vm.run('FPVTransitionClearIdleControllerFlight');
  assert.equal(vm.get('fpvTransitionControllerFlight'), false); assert.equal(vm.get('fpvTransitionControllerFlightGeneration'), -1);
});

const readLayout = vm => layoutFields.map(field => Number(vm.settings.get(field + ':Controllers')));
const writeLayout = (vm, values) => layoutFields.forEach((field, i) => vm.settings.set(field + ':Controllers', values[i]));
const profileRows = [
  ['keyboard', 'Keyboard and mouse', 'manual'],
  ['dinput:ds4', 'Wireless Controller', 'dualshock4'],
  ['xinput:0', 'Xbox #1', 'xinput'],
  ['dinput:radio', 'USB FPV radio', 'manual']
];
function profileVM(id = 'dinput:ds4') {
  const vm = new VM(); vm.setDevices(profileRows); vm.settings.set(selection, id); return vm;
}
test('automatic DualShock 4 layout uses Z/Rz for the right stick, not trigger axes Rx/Ry', () => {
  const vm = profileVM(); refresh(vm);
  assert.deepEqual(readLayout(vm), dualshockLayout);
  assert.equal(vm.settings.get(layoutMode), 0);
  assert.ok(vm.settings.get(layoutStamp), 'automatic application did not record a device/layout stamp');
});
test('automatic XInput layout retains its Mode 2 right-stick Rx/Ry mapping', () => {
  const vm = profileVM('xinput:0'); refresh(vm);
  assert.deepEqual(readLayout(vm), xboxLayout);
  assert.equal(vm.settings.get(layoutMode), 0); assert.ok(vm.settings.get(layoutStamp));
});
for (const initialMode of [0, 1]) for (const [id, expected] of [['dinput:ds4', dualshockLayout], ['xinput:0', xboxLayout]]) {
  test(`recognized ${id} layout accepts ${initialMode ? 'absolute' : 'legacy rate'} defaults and selects direct throttle`, () => {
    const vm = profileVM(id); vm.settings.set('iThrottleMode:Controllers', initialMode);
    assert.equal(vm.settings.get(layoutStamp), ''); refresh(vm);
    assert.deepEqual(readLayout(vm), expected); assert.equal(vm.settings.get(layoutMode), 0);
    assert.ok(vm.settings.get(layoutStamp));
  });
}
test('automatic refresh applies the selected device/layout only once', () => {
  const vm = profileVM(); refresh(vm); const stamp = vm.settings.get(layoutStamp);
  // A non-UI writer does not request a new preset. The same stamped inventory
  // must not reset axes merely because its periodic ScanVersion changes.
  vm.settings.set('iRollAxis:Controllers', 6); refresh(vm);
  assert.equal(vm.settings.get('iRollAxis:Controllers'), 6);
  assert.equal(vm.settings.get(layoutStamp), stamp);
});
test('device selection applies the corresponding published layout and records the new stamp', () => {
  const vm = profileVM(); refresh(vm); const ds4Stamp = vm.settings.get(layoutStamp);
  vm.settings.set(choice, 2); change(vm);
  assert.equal(vm.settings.get(selection), 'xinput:0'); assert.deepEqual(readLayout(vm), xboxLayout);
  assert.notEqual(vm.settings.get(layoutStamp), ds4Stamp);
});
test('queued device choice uses the ID/name/layout snapshot rather than newly changed inventory indices', () => {
  const vm = profileVM('keyboard'); refresh(vm);
  vm.setDevices([profileRows[0], profileRows[2], profileRows[1], profileRows[3]]);
  vm.settings.set(choice, 1); change(vm);
  assert.equal(vm.settings.get(selection), 'dinput:ds4');
  assert.equal(vm.settings.get(selectionName), 'Wireless Controller');
  assert.deepEqual(readLayout(vm), dualshockLayout);
});
test('reordered inventory keeps automatic profile paired with the saved stable device ID', () => {
  const vm = profileVM(); refresh(vm); const stamp = vm.settings.get(layoutStamp);
  vm.setDevices([profileRows[0], profileRows[2], profileRows[1], profileRows[3]]); refresh(vm);
  assert.equal(vm.settings.get(selection), 'dinput:ds4'); assert.equal(vm.settings.get(choice), 2);
  assert.deepEqual(readLayout(vm), dualshockLayout); assert.equal(vm.settings.get(layoutStamp), stamp);
});
test('legacy bridge inventory without Layout metadata leaves DirectInput axes unchanged', () => {
  const vm = profileVM(); vm.setDevices(profileRows.map(row => row.slice(0, 2))); refresh(vm);
  assert.deepEqual(readLayout(vm), xboxLayout);
  assert.equal(vm.settings.get(selection), 'dinput:ds4');
});
for (const kind of ['manual', 'unknown-layout']) test(`${kind} DirectInput inventory never guesses a controller preset`, () => {
  const vm = profileVM('dinput:radio');
  vm.setDevices([profileRows[0], ['dinput:radio', 'Radio', kind]]);
  refresh(vm); assert.deepEqual(readLayout(vm), xboxLayout);
  vm.run('FPVTransitionApplyControllerLayout'); assert.deepEqual(readLayout(vm), xboxLayout);
});
test('first update preserves an existing custom channel map and switches it to manual mode', () => {
  const vm = profileVM(); const custom = [6, 7, 5, 2, 0, 1, 1, 0, 1]; writeLayout(vm, custom);
  assert.equal(vm.settings.get(layoutStamp), ''); refresh(vm);
  assert.deepEqual(readLayout(vm), custom); assert.equal(vm.settings.get(layoutMode), 1);
});
test('explicit manual mode preserves axes when selecting a recognized controller', () => {
  const vm = profileVM(); vm.settings.set(layoutMode, 1); refresh(vm);
  assert.deepEqual(readLayout(vm), xboxLayout); assert.equal(vm.settings.get(layoutMode), 1);
});
test('explicit manual rate-throttle preference remains available after the new direct-throttle default', () => {
  const vm = profileVM(); vm.settings.set(layoutMode, 1); vm.settings.set('iThrottleMode:Controllers', 0);
  const original = readLayout(vm); refresh(vm); vm.run('FPVTransitionApplyControllerLayout');
  assert.deepEqual(readLayout(vm), original); assert.equal(vm.settings.get('iThrottleMode:Controllers'), 0);
});
test('UI axis/inversion/throttle changes switch automatic layout to manual without reapplying the preset', () => {
  for (const [field, value] of [['iRollAxis', 6], ['bInvertYaw', 1], ['iThrottleMode', 0]]) {
    const vm = profileVM(); refresh(vm); vm.settings.set(field + ':Controllers', value);
    vm.run('FPVTransitionControllerSettingChange', ['FPVDrone', field + ':Controllers']);
    assert.equal(vm.settings.get(layoutMode), 1, `${field} did not select manual mode`);
    assert.equal(vm.settings.get(field + ':Controllers'), value);
    refresh(vm); assert.equal(vm.settings.get(field + ':Controllers'), value);
  }
});
test('preset setters cannot be mistaken for manual UI changes if callbacks run synchronously', () => {
  const vm = profileVM(); vm.options.onSetting = (vm, field) => vm.run('FPVTransitionControllerSettingChange', ['FPVDrone', field]);
  refresh(vm); assert.deepEqual(readLayout(vm), dualshockLayout); assert.equal(vm.settings.get(layoutMode), 0);
});
test('automatic apply-layout button finds the selected stable ID even if the UI index is stale', () => {
  const vm = profileVM('keyboard'); refresh(vm); vm.settings.set(selection, 'dinput:ds4');
  vm.settings.set(choice, 2); writeLayout(vm, [6, 7, 5, 2, 0, 1, 1, 0, 1]);
  vm.run('FPVTransitionApplyControllerLayout'); assert.deepEqual(readLayout(vm), dualshockLayout);
});
test('apply-layout button preserves explicit manual mode instead of silently resetting custom channels', () => {
  const vm = profileVM(); vm.settings.set(layoutMode, 1); const custom = [6, 7, 5, 2, 0, 1, 1, 0, 1];
  writeLayout(vm, custom); refresh(vm); vm.run('FPVTransitionApplyControllerLayout');
  assert.deepEqual(readLayout(vm), custom); assert.equal(vm.settings.get(layoutMode), 1);
});
test('explicit switch from manual to automatic applies a recognized preset despite an empty stamp and custom channels', () => {
  const vm = profileVM(); vm.settings.set(layoutMode, 1); writeLayout(vm, [6, 7, 5, 2, 0, 1, 1, 0, 1]); refresh(vm);
  vm.settings.set(layoutMode, 0); vm.run('FPVTransitionControllerSettingChange', ['FPVDrone', layoutMode]);
  assert.deepEqual(readLayout(vm), dualshockLayout); assert.equal(vm.settings.get(layoutMode), 0);
});
test('layout preset changes only axis/inversion/throttle settings, preserving action buttons and tuning', () => {
  const vm = profileVM(); const preserved = new Map([
    ['iDetonateButton:Controllers', 12], ['iAbortButton:Controllers', 10], ['fDeadZone:Controllers', 11.5],
    ['fYawRate:Controllers', 230], ['fRollRate:Controllers', 80], ['fPitchRate:Controllers', 165]
  ]);
  for (const [field, value] of preserved) vm.settings.set(field, value);
  refresh(vm); assert.deepEqual(readLayout(vm), dualshockLayout);
  for (const [field, value] of preserved) assert.equal(vm.settings.get(field), value, field);
});
test('missing selected controller cannot apply a preset belonging to another visible device', () => {
  const vm = profileVM('dinput:gone'); refresh(vm); const before = readLayout(vm);
  vm.run('FPVTransitionApplyControllerLayout'); assert.deepEqual(readLayout(vm), before);
  assert.equal(vm.settings.get(selection), 'dinput:gone');
});

const config = JSON.parse(fs.readFileSync(path.join(root, 'MCM/Config/FPVDrone/config.json'), 'utf8').replace(/^\uFEFF/, ''));
const entries = config.content;
const byId = new Map(entries.filter(e => e.id).map(e => [e.id, e]));
const defaults = new Map(); let section = '';
for (const row of fs.readFileSync(path.join(root, 'MCM/Config/FPVDrone/settings.ini'), 'utf8').split(/\r?\n/)) {
  if (/^\[/.test(row)) section = row.slice(1, -1);
  else if (/^[^;=]+=/.test(row)) { const at = row.indexOf('='); defaults.set(row.slice(0, at) + ':' + section, row.slice(at + 1)); }
}
test('MCM dropdown and status bind the compiled quest properties', () => {
  assert.deepEqual(byId.get(choice).valueOptions.listFromProperty, { form: 'FPVDrone.esp|800', scriptName: 'FPVDroneQuestScript', propertyName: devicesProperty });
  assert.equal(byId.get(choice).valueOptions.sourceType, 'ModSettingInt');
  assert.equal(entries.find(e => e.textFromStringProperty)?.textFromStringProperty.propertyName, statusProperty);
  assert.equal(byId.get('RefreshControllers').action.function, 'FPVTransitionRefreshControllers');
  assert.equal(byId.get('RefreshControllers').action.form, 'FPVDrone.esp|800');
});
test('MCM exposes automatic/manual layout selection and a public preset-apply action', () => {
  assert.equal(byId.get(layoutMode).valueOptions.sourceType, 'ModSettingInt');
  assert.equal(byId.get(layoutMode).valueOptions.options.length, 2); assert.equal(defaults.get(layoutMode), '0');
  assert.equal(byId.get('ApplyControllerLayout').action.function, 'FPVTransitionApplyControllerLayout');
  assert.equal(byId.get('ApplyControllerLayout').action.form, 'FPVDrone.esp|800');
});
test('MCM IDs are unique and every setting has correctly typed author defaults', () => {
  assert.equal(byId.size, entries.filter(e => e.id).length);
  for (const e of entries.filter(e => e.valueOptions?.sourceType?.startsWith('ModSetting'))) {
    assert.ok(defaults.has(e.id), `Missing default ${e.id}`);
    const v = defaults.get(e.id), type = e.valueOptions.sourceType;
    if (type === 'ModSettingBool') assert.match(v, /^[01]$/);
    if (type === 'ModSettingInt') assert.match(v, /^-?\d+$/);
    if (type === 'ModSettingFloat') assert.ok(Number.isFinite(Number(v)));
    if (e.valueOptions.min !== undefined) assert.ok(Number(v) >= e.valueOptions.min && Number(v) <= e.valueOptions.max);
  }
});
test('MCM offers all eight axes, inversion and both throttle modes with Mode 2 defaults', () => {
  const expected = ['X', 'Y', 'Z', 'Rx', 'Ry', 'Rz', 'Slider 0', 'Slider 1'];
  for (const [axis, value] of [['Throttle', '1'], ['Yaw', '0'], ['Roll', '3'], ['Pitch', '4']]) {
    assert.deepEqual(byId.get(`i${axis}Axis:Controllers`).valueOptions.options, expected);
    assert.equal(defaults.get(`i${axis}Axis:Controllers`), value);
    assert.equal(byId.get(`bInvert${axis}:Controllers`).valueOptions.sourceType, 'ModSettingBool');
  }
  assert.equal(byId.get('iThrottleMode:Controllers').valueOptions.options.length, 2);
  assert.equal(defaults.get('iThrottleMode:Controllers'), '1'); assert.equal(defaults.get('bInvertThrottle:Controllers'), '1');
  assert.equal(defaults.get(selection), 'keyboard');
});
test('MCM percentages and one-based button bounds match the native contract', () => {
  assert.equal(defaults.get('fDeadZone:Controllers'), '5.0');
  for (const id of ['fYawRate', 'fRollRate', 'fPitchRate']) {
    const entry = byId.get(id + ':Controllers'); assert.equal(defaults.get(id + ':Controllers'), '100.0');
    assert.equal(entry.valueOptions.min, 10); assert.equal(entry.valueOptions.max, 300);
  }
  assert.equal(byId.get('fDeadZone:Controllers').valueOptions.min, 0); assert.equal(byId.get('fDeadZone:Controllers').valueOptions.max, 30);
  for (const id of ['iDetonateButton', 'iAbortButton']) {
    const entry = byId.get(id + ':Controllers'); assert.equal(entry.valueOptions.min, 0); assert.equal(entry.valueOptions.max, 128); assert.equal(entry.valueOptions.step, 1);
  }
  assert.equal(defaults.get('iDetonateButton:Controllers'), '1'); assert.equal(defaults.get('iAbortButton:Controllers'), '2');
  assert.equal(byId.get('CancelFlight').action.function, 'AbortFlight'); assert.equal(byId.get('Diagnostics').action.function, 'Diagnose');
});
const diagnosticValue = (vm, field) => vm.ini.get('fpvdrone.launch|latest|' + key(field));
test('compiled RecordStatus persists the stage and launch context independently of Papyrus trace logging', () => {
  const vm = new VM({ traceDisabled: true }); vm.set('generation', 17); vm.set('mode', 1);
  vm.run('RecordStatus', ['attaching camera']);
  assert.equal(diagnosticValue(vm, 'Stage'), 'attaching camera');
  assert.match(diagnosticValue(vm, 'Context'), /^generation=17; mode=1; time=10(?:\.0+)?$/);
  assert.equal(vm.log.filter(e => e.type === 'trace').length, 0);
  assert.ok(vm.log.some(e => e.type === 'write-ini' && e.file === 'FPVDrone.launch'));
  assert.equal(vm.log.filter(e => e.type === 'write-ini' && e.file === 'FPVDrone.controllers.request').length, 0);
});
test('begin diagnostics clears old reasons and notification ownership without changing input settings', () => {
  const vm = new VM(); const before = new Map(vm.settings); vm.set('fpvTransitionAbortNotified', true);
  vm.ini.set('fpvdrone.launch|latest|abortreason', 'old abort'); vm.ini.set('fpvdrone.launch|latest|finishreason', 'old finish');
  vm.run('FPVTransitionBeginDiagnostics');
  assert.equal(vm.get('fpvTransitionAbortNotified'), false);
  assert.equal(diagnosticValue(vm, 'AbortReason'), ''); assert.equal(diagnosticValue(vm, 'FinishReason'), '');
  assert.deepEqual(vm.settings, before);
});
for (const mode of [1, 2]) test(`launch abort in mode ${mode} records the reason and shows only one notification`, () => {
  const vm = new VM(); vm.set('mode', mode);
  vm.run('FPVTransitionRecordAbort', ['TC could not take drone controls']);
  vm.run('FPVTransitionRecordAbort', ['TC could not take drone controls']);
  assert.equal(diagnosticValue(vm, 'AbortReason'), 'TC could not take drone controls');
  const messages = vm.log.filter(e => e.type === 'notification');
  assert.equal(messages.length, 1); assert.match(messages[0].text, /передать управление/);
});
for (const mode of [0, 3]) test(`inactive mode ${mode} does not create a misleading abort or notification`, () => {
  const vm = new VM(); vm.set('mode', mode); vm.run('FPVTransitionRecordAbort', ['old callback']);
  assert.equal(vm.log.length, 0); assert.equal(diagnosticValue(vm, 'AbortReason'), undefined);
});
test('readiness timeout receives a clear camera failure notification', () => {
  const vm = new VM(); vm.set('mode', 2);
  vm.run('FPVTransitionRecordAbort', ['launch transition: FPV readiness timed out']);
  const message = vm.log.find(e => e.type === 'notification')?.text;
  assert.match(message, /камера|Камера/); assert.doesNotMatch(message, /readiness timed out/);
});
test('finish records the native state without overwriting the initiating abort reason or repeating its notification', () => {
  const vm = new VM({ nativeStatus: 5, nativeFrames: 42 }); vm.set('mode', 2); vm.set('fpvTransitionBlack', true);
  vm.run('FPVTransitionRecordAbort', ['cancelled by native input']);
  vm.set('mode', 3); vm.set('lastStopReason', 'cleanup finished'); vm.run('FPVTransitionRecordFinish', [false]);
  assert.equal(diagnosticValue(vm, 'AbortReason'), 'cancelled by native input');
  assert.equal(diagnosticValue(vm, 'FinishReason'), 'cleanup finished');
  assert.match(diagnosticValue(vm, 'Native'), /^status=5; frames=42; explode=false$/i);
  assert.equal(vm.log.filter(e => e.type === 'notification').length, 1);
});
test('blackout cancellation not routed through AbortWithReason still notifies only once', () => {
  const vm = new VM(); vm.set('mode', 3); vm.set('fpvTransitionBlack', true); vm.set('lastStopReason', 'cancelled');
  vm.run('FPVTransitionRecordFinish', [false]); vm.run('FPVTransitionRecordFinish', [false]);
  assert.equal(vm.log.filter(e => e.type === 'notification').length, 1);
  assert.equal(diagnosticValue(vm, 'FinishReason'), 'cancelled');
});
test('a subsequent launch can report a new failure after notification ownership resets', () => {
  const vm = new VM(); vm.set('mode', 1); vm.set('generation', 7);
  vm.run('FPVTransitionRecordAbort', ['first failure']); vm.run('FPVTransitionBeginDiagnostics');
  vm.set('generation', 8); vm.run('FPVTransitionRecordAbort', ['second failure']);
  assert.equal(vm.log.filter(e => e.type === 'notification').length, 2);
  assert.equal(diagnosticValue(vm, 'AbortReason'), 'second failure');
});
for (const explode of [false, true]) test(`ordinary visible finish explode=${explode} has no launch-cancel popup`, () => {
  const vm = new VM(); vm.set('mode', 3); vm.set('fpvTransitionBlack', false); vm.set('lastStopReason', 'impact');
  vm.run('FPVTransitionRecordFinish', [explode]);
  assert.equal(vm.log.filter(e => e.type === 'notification').length, 0); assert.equal(diagnosticValue(vm, 'FinishReason'), 'impact');
});
test('genuine detonation under blackout does not claim that launch was cancelled', () => {
  const vm = new VM(); vm.set('mode', 3); vm.set('fpvTransitionBlack', true); vm.run('FPVTransitionRecordFinish', [true]);
  assert.equal(vm.log.filter(e => e.type === 'notification').length, 0);
});
test('missing Garden dependency causes no INI calls while a launch failure remains visible to the user', () => {
  const vm = new VM(); vm.plugins.delete('GardenOfEdenPapyrusScriptExtender'); vm.set('mode', 2); vm.set('fpvTransitionBlack', true);
  vm.run('FPVTransitionBeginDiagnostics'); vm.run('FPVTransitionRecordStatus', ['preparing']);
  vm.run('FPVTransitionRecordAbort', ['TC could not take drone controls']); vm.set('mode', 3); vm.run('FPVTransitionRecordFinish', [false]);
  assert.equal(vm.log.filter(e => e.type === 'write-ini').length, 0);
  assert.equal(vm.log.filter(e => e.type === 'native-status-read' || e.type === 'native-frames-read').length, 0);
  assert.equal(vm.log.filter(e => e.type === 'notification').length, 1);
});
for (const version of [-1, 127]) test(`missing or old native backend ${version} cannot be queried by finish diagnostics`, () => {
  const vm = new VM(); vm.plugins.set('FPVDroneNative', version); vm.set('mode', 3); vm.set('lastStopReason', 'backend unavailable');
  vm.run('FPVTransitionRecordFinish', [false]);
  assert.equal(diagnosticValue(vm, 'FinishReason'), 'backend unavailable'); assert.equal(diagnosticValue(vm, 'Native'), undefined);
  assert.equal(vm.log.filter(e => e.type === 'native-status-read' || e.type === 'native-frames-read').length, 0);
});
console.log(JSON.stringify({ testsPassed: results.length, tests: results, limitation: 'Compiled PEX under deterministic MCM/INI stubs and static menu/default checks; no live MCM rendering or physical hardware verification.' }, null, 2));
