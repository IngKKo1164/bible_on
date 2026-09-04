import assert from 'node:assert/strict';
import test from 'node:test';
import { getPersistencePolicy, persistenceAuthorities } from '../../src/data/persistence/policyRegistry.js';

test('known data has an explicit authority', () => {
  assert.equal(getPersistencePolicy('bibleon.personalProfile').authority, 'account');
  assert.equal(getPersistencePolicy('bibleon.churchConversations').authority, 'shared');
  assert.equal(getPersistencePolicy('bibleon.installationIdV1').authority, 'device');
  assert.deepEqual(persistenceAuthorities, ['device', 'account', 'shared', 'storage', 'static']);
});

test('an unregistered key fails closed', () => {
  assert.throws(() => getPersistencePolicy('bibleon.accidentalData'), /등록되지 않은 저장 키/);
});

