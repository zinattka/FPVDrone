// Add private operator-pose IDLE forms without overriding vanilla records.
// All pre-existing FPVDrone records remain byte-identical to the 0.1.28 ESP.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const assert = require('assert/strict');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const EXPECTED_BASELINE = '7fb43f411368aed3a67712c671d9b193c91dfebfe8a4c31680ec1272be6a87da';
const SOURCE_IDS = [0x001C776B, 0x001C776C];
const PRIVATE_IDS = [0x01000810, 0x01000811];
const EDITOR_IDS = ['FPVDroneOperatorPipboyMale', 'FPVDroneOperatorPipboyFemale'];
const LOOP_DATA = Buffer.from([255, 255, 1, 0, 0, 0]);
const string = value => Buffer.from(value + '\0', 'utf8');
const text = value => value.toString('utf8').replace(/\0+$/, '');

function subrecords(data) {
  const result = [];
  let cursor = 0;
  while (cursor < data.length) {
    const start = cursor;
    assert.ok(cursor + 6 <= data.length, 'Truncated subrecord');
    let signature = data.toString('ascii', cursor, cursor + 4);
    let size = data.readUInt16LE(cursor + 4);
    cursor += 6;
    if (signature === 'XXXX') {
      assert.equal(size, 4);
      assert.ok(cursor + 10 <= data.length, 'Truncated extended subrecord');
      size = data.readUInt32LE(cursor);
      cursor += 4;
      signature = data.toString('ascii', cursor, cursor + 4);
      cursor += 6;
    }
    assert.ok(cursor + size <= data.length, 'Subrecord bounds');
    result.push({ signature, data: data.subarray(cursor, cursor + size), raw: data.subarray(start, cursor + size), start, payloadStart: cursor });
    cursor += size;
  }
  return result;
}

function field(fields, signature) {
  const found = fields.filter(value => value.signature === signature);
  assert.equal(found.length, 1, `Expected one ${signature}`);
  return found[0];
}

function packSubrecord(signature, data) {
  assert.ok(data.length <= 0xFFFF);
  const header = Buffer.alloc(6);
  header.write(signature, 0, 'ascii');
  header.writeUInt16LE(data.length, 4);
  return Buffer.concat([header, data]);
}

function unpackRecord(raw) {
  assert.ok(raw.length >= 24);
  const signature = raw.toString('ascii', 0, 4);
  assert.notEqual(signature, 'GRUP');
  const size = raw.readUInt32LE(4);
  assert.equal(raw.length, size + 24);
  const flags = raw.readUInt32LE(8);
  let data = raw.subarray(24);
  if (flags & 0x40000) {
    const expectedLength = data.readUInt32LE(0);
    data = zlib.inflateSync(data.subarray(4));
    assert.equal(data.length, expectedLength);
  }
  return { signature, formId: raw.readUInt32LE(12), flags, data, fields: subrecords(data), raw };
}

function inspectMod(buffer) {
  const records = [], groups = [];
  function walk(start, end) {
    let cursor = start;
    while (cursor < end) {
      assert.ok(cursor + 24 <= end, 'Record header bounds');
      const signature = buffer.toString('ascii', cursor, cursor + 4);
      const size = buffer.readUInt32LE(cursor + 4);
      const length = signature === 'GRUP' ? size : size + 24;
      assert.ok(length >= 24 && cursor + length <= end, 'Record/group bounds');
      if (signature === 'GRUP') {
        groups.push({ offset: cursor, raw: buffer.subarray(cursor, cursor + 24), label: buffer.toString('ascii', cursor + 8, cursor + 12) });
        walk(cursor + 24, cursor + length);
      } else {
        const record = unpackRecord(buffer.subarray(cursor, cursor + length));
        record.offset = cursor;
        records.push(record);
      }
      cursor += length;
    }
    assert.equal(cursor, end);
  }
  walk(0, buffer.length);
  return { records, groups };
}

// Read headers by explicit file offset, skipping unrelated top-level groups.
// The multi-GB master and animation assets are never loaded into memory/copied.
function readVanillaIdles(gameRoot) {
  const filename = path.join(gameRoot, 'Data', 'Fallout4.esm');
  const descriptor = fs.openSync(filename, 'r');
  const found = new Map();
  function readAt(position, size) {
    const buffer = Buffer.alloc(size);
    assert.equal(fs.readSync(descriptor, buffer, 0, size, position), size, 'Master read bounds');
    return buffer;
  }
  function walk(start, end, inIdleGroup = false) {
    let cursor = start;
    while (cursor < end) {
      const header = readAt(cursor, 24);
      const signature = header.toString('ascii', 0, 4);
      const size = header.readUInt32LE(4);
      const length = signature === 'GRUP' ? size : size + 24;
      assert.ok(length >= 24 && cursor + length <= end, 'Master record/group bounds');
      if (signature === 'GRUP') {
        const isIdles = inIdleGroup || header.toString('ascii', 8, 12) === 'IDLE';
        if (isIdles) walk(cursor + 24, cursor + length, true);
      } else if (signature === 'IDLE' && SOURCE_IDS.includes(header.readUInt32LE(12))) {
        const raw = Buffer.concat([header, readAt(cursor + 24, size)]);
        const record = unpackRecord(raw);
        assert.ok(!found.has(record.formId), 'Duplicate vanilla source IDLE');
        found.set(record.formId, record);
      }
      cursor += length;
    }
  }
  try { walk(0, fs.fstatSync(descriptor).size); } finally { fs.closeSync(descriptor); }
  assert.equal(found.size, SOURCE_IDS.length, 'Missing vanilla Pip-Boy IDLE forms');
  return found;
}

function cloneIdle(original, index) {
  assert.equal(original.signature, 'IDLE');
  const fields = original.fields;
  assert.equal(text(field(fields, 'EDID').data), index ? 'IdlePipboyExamineFemale' : 'IdlePipboyExamineMale');
  assert.equal(text(field(fields, 'ENAM').data), 'dyn_Activation');
  assert.equal(text(field(fields, 'DNAM').data).toLowerCase(), 'actors\\character\\behaviors\\raiderrootbehavior.hkx');
  const expectedFile = index ? 'Actors\\Character\\Animations\\DynamicAnims\\Female\\PipboyIdle*.hkx' : 'Actors\\Character\\Animations\\DynamicAnims\\PipboyIdle*.hkx';
  assert.equal(text(field(fields, 'GNAM').data), expectedFile);
  // Both source idles are standalone; copying ANAM cannot create a sibling
  // chain or references to source forms in the new plugin.
  assert.ok(field(fields, 'ANAM').data.equals(Buffer.alloc(8)), 'Unexpected source idle parent/previous');
  const conditions = fields.filter(value => value.signature === 'CTDA');
  assert.equal(conditions.length, 1, 'Unexpected source idle conditions');
  const condition = conditions[0].data;
  assert.equal(condition.length, 32);
  assert.equal(condition.readUInt16LE(8), 70, 'Expected GetIsSex');
  assert.equal(condition.readUInt32LE(12), index, 'Expected male/female condition');
  assert.equal(condition.readFloatLE(4), 1.0, 'Expected true comparison');
  const replacements = new Map([
    ['EDID', string(EDITOR_IDS[index])],
    ['ENAM', string('dyn_ActivationAllowMovement')],
    ['DATA', LOOP_DATA]
  ]);
  const body = Buffer.concat(fields.map(value => replacements.has(value.signature)
    ? packSubrecord(value.signature, replacements.get(value.signature)) : value.raw));
  const header = Buffer.from(original.raw.subarray(0, 24));
  header.writeUInt32LE(body.length, 4);
  header.writeUInt32LE((original.flags & ~0x40000) >>> 0, 8);
  header.writeUInt32LE(PRIVATE_IDS[index], 12);
  const raw = Buffer.concat([header, body]);
  const verified = unpackRecord(raw);
  assert.ok(field(verified.fields, 'DATA').data.equals(LOOP_DATA));
  assert.equal(text(field(verified.fields, 'ENAM').data), 'dyn_ActivationAllowMovement');
  assert.equal(text(field(verified.fields, 'GNAM').data), expectedFile);
  assert.ok(field(verified.fields, 'CTDA').raw.equals(conditions[0].raw), 'Sex condition changed');
  for (const originalField of fields.filter(value => !replacements.has(value.signature))) {
    const counterpart = field(verified.fields, originalField.signature);
    assert.ok(counterpart.raw.equals(originalField.raw), `Unchanged source field ${originalField.signature}`);
  }
  return { raw, report: { sourceFormId: original.formId.toString(16).padStart(8, '0'),
    formId: PRIVATE_IDS[index].toString(16).padStart(8, '0'), localFormId: PRIVATE_IDS[index] & 0xFFFFFF,
    editorId: EDITOR_IDS[index], event: 'dyn_ActivationAllowMovement', file: expectedFile,
    graph: text(field(fields, 'DNAM').data), loopSeconds: [255, 255], loose: true,
    sexCondition: index, sexConditionSHA256: sha256(condition), parent: 0, previous: 0 } };
}

function buildOperatorPose(gameRoot, candidateDir) {
  const baselinePath = path.join(root, '_build', 'baseline', '0.1.28', 'FPVDrone.esp');
  const baseline = fs.readFileSync(baselinePath);
  assert.equal(sha256(baseline), EXPECTED_BASELINE, 'Unexpected baseline ESP');
  const original = inspectMod(baseline);
  const customRecords = original.records.filter(record => record.signature !== 'TES4');
  assert.equal(customRecords.length, 16);
  assert.ok(customRecords.every(record => record.formId >= 0x01000800 && record.formId <= 0x0100080F));
  const tes4 = original.records.find(record => record.signature === 'TES4');
  assert.equal(tes4.offset, 0);
  assert.ok(!(tes4.flags & 0x40000));
  const masters = tes4.fields.filter(value => value.signature === 'MAST').map(value => text(value.data));
  assert.deepEqual(masters, ['Fallout4.esm']);
  const hedr = field(tes4.fields, 'HEDR');
  assert.equal(hedr.data.length, 12);
  const oldCount = hedr.data.readUInt32LE(4);
  assert.equal(oldCount, customRecords.length + original.groups.length, 'Baseline HEDR count');
  assert.equal(hedr.data.readUInt32LE(8), 0x810, 'Baseline next free form');
  const idles = readVanillaIdles(gameRoot);
  const additions = SOURCE_IDS.map((formId, index) => cloneIdle(idles.get(formId), index));
  const groupBody = Buffer.concat(additions.map(value => value.raw));
  const groupHeader = Buffer.from(original.groups[0].raw);
  assert.equal(groupHeader.readUInt32LE(12), 0, 'Expected a top-level group template');
  groupHeader.writeUInt32LE(24 + groupBody.length, 4);
  groupHeader.write('IDLE', 8, 'ascii');
  const prefix = Buffer.from(baseline);
  const hedrDataOffset = tes4.offset + 24 + hedr.payloadStart;
  prefix.writeUInt32LE(oldCount + additions.length + 1, hedrDataOffset + 4);
  prefix.writeUInt32LE(0x812, hedrDataOffset + 8);
  const candidate = Buffer.concat([prefix, groupHeader, groupBody]);
  // A strict byte comparison establishes that the only changes to the existing
  // plugin are the two HEDR bookkeeping fields; the IDLE group is appended.
  for (let i = 0; i < baseline.length; i++) {
    if (i < hedrDataOffset + 4 || i >= hedrDataOffset + 12) assert.equal(candidate[i], baseline[i], `Original ESP byte changed at ${i}`);
  }
  const verified = inspectMod(candidate);
  for (const record of customRecords) {
    const copy = verified.records.find(value => value.formId === record.formId);
    assert.ok(copy && copy.raw.equals(record.raw), `Original record changed: ${record.formId.toString(16)}`);
  }
  const seen = new Set();
  for (const record of verified.records) {
    assert.ok(!seen.has(record.formId), 'Duplicate FormID');
    seen.add(record.formId);
  }
  assert.equal(verified.records.length - 1, 18);
  assert.equal(verified.groups.length, original.groups.length + 1);
  assert.equal(field(verified.records[0].fields, 'HEDR').data.readUInt32LE(4), verified.records.length - 1 + verified.groups.length);
  assert.ok(verified.records.filter(value => value.signature !== 'TES4').every(value => (value.formId >>> 24) === 1), 'Vanilla override introduced');
  fs.mkdirSync(candidateDir, { recursive: true });
  const outputPath = path.join(candidateDir, 'FPVDrone.esp');
  fs.writeFileSync(outputPath, candidate);
  const report = { baselineSHA256: EXPECTED_BASELINE, candidateSHA256: sha256(candidate),
    bytes: candidate.length, originalRecordsByteIdentical: customRecords.length,
    originalCustomForms: customRecords.length, customForms: 18, masters,
    originalHeaderRecordCount: oldCount, headerRecordCount: oldCount + 3,
    nextFormId: '00000812', vanillaOverrides: 0, copiedGameAssets: 0,
    forms: additions.map(value => value.report), outputPath,
    limitation: 'Static record and loop-field validation; visible looping and stance behavior require an in-game test.' };
  fs.writeFileSync(path.join(path.dirname(candidateDir), 'operator_pose_build_report.json'), JSON.stringify(report, null, 2));
  return report;
}

module.exports = { buildOperatorPose };
if (require.main === module) {
  console.log(JSON.stringify(buildOperatorPose(process.argv[2] || 'C:\\Games\\Fallout 4',
    process.argv[3] || path.join(root, '_build', 'launch_transition', 'candidate')), null, 2));
}
