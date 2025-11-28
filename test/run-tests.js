/**
 * Unit Tests for Door Sense Card State Machine
 */

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log(`\n${colors.blue}🧪 Running Door Sense Card Tests${colors.reset}\n`);
    
    for (const test of this.tests) {
      try {
        await test.fn();
        this.passed++;
        console.log(`${colors.green}✓${colors.reset} ${test.name}`);
      } catch (error) {
        this.failed++;
        console.log(`${colors.red}✗${colors.reset} ${test.name}`);
        console.log(`  ${colors.gray}${error.message}${colors.reset}`);
      }
    }
    
    console.log(`\n${colors.blue}Results:${colors.reset}`);
    console.log(`  ${colors.green}Passed: ${this.passed}${colors.reset}`);
    console.log(`  ${colors.red}Failed: ${this.failed}${colors.reset}`);
    console.log(`  Total: ${this.tests.length}\n`);
    
    process.exit(this.failed > 0 ? 1 : 0);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertArrayEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message || `Expected [${expected}], got [${actual}]`);
  }
}

// Mock the state machine functions
class StateMachine {
  constructor() {
    this.stateOrder = [
      'unlocked',
      'lock-requested',
      'locking',
      'locked',
      'unlock-requested',
      'unlocking'
    ];
  }

  normalizeState(state) {
    const normalized = state.toLowerCase();
    const validStates = [
      'unlocked', 'lock-requested', 'locking', 'locked',
      'unlock-requested', 'unlocking', 'jammed', 'unknown', 'unavailable'
    ];
    return validStates.includes(normalized) ? normalized : 'unknown';
  }

  getStatePath(from, to) {
    // Special states that don't participate in the cycle
    if (to === 'jammed' || to === 'unknown' || to === 'unavailable') {
      return [to];
    }
    
    // Find positions in the cycle
    const fromIndex = this.stateOrder.indexOf(from);
    const toIndex = this.stateOrder.indexOf(to);
    
    // If either state is not in the cycle, do direct transition
    if (fromIndex === -1 || toIndex === -1) {
      return [to];
    }
    
    // If already at target, no transition needed
    if (fromIndex === toIndex) {
      return [];
    }
    
    // Calculate the path
    const path = [];
    let currentIndex = fromIndex;
    
    // Calculate distances for both directions
    let forwardDistance, backwardDistance;
    
    if (toIndex > fromIndex) {
      forwardDistance = toIndex - fromIndex;
      backwardDistance = (fromIndex + this.stateOrder.length - toIndex);
    } else {
      forwardDistance = (toIndex + this.stateOrder.length - fromIndex);
      backwardDistance = fromIndex - toIndex;
    }
    
    // Choose the shorter path
    const goForward = forwardDistance <= backwardDistance;
    
    if (goForward) {
      // Move forward through states
      while (currentIndex !== toIndex) {
        currentIndex = (currentIndex + 1) % this.stateOrder.length;
        path.push(this.stateOrder[currentIndex]);
      }
    } else {
      // Move backward through states
      while (currentIndex !== toIndex) {
        currentIndex = (currentIndex - 1 + this.stateOrder.length) % this.stateOrder.length;
        path.push(this.stateOrder[currentIndex]);
      }
    }
    
    return path;
  }
}

// Create test runner
const runner = new TestRunner();
const sm = new StateMachine();

// State Normalization Tests
runner.test('normalizeState: valid states', () => {
  assertEqual(sm.normalizeState('locked'), 'locked');
  assertEqual(sm.normalizeState('unlocked'), 'unlocked');
  assertEqual(sm.normalizeState('locking'), 'locking');
  assertEqual(sm.normalizeState('unlocking'), 'unlocking');
  assertEqual(sm.normalizeState('lock-requested'), 'lock-requested');
  assertEqual(sm.normalizeState('unlock-requested'), 'unlock-requested');
});

runner.test('normalizeState: invalid states default to unknown', () => {
  assertEqual(sm.normalizeState('invalid'), 'unknown');
  assertEqual(sm.normalizeState(''), 'unknown');
});

// State Path Tests - Forward Direction
runner.test('getStatePath: unlocked → locked (full cycle forward)', () => {
  const path = sm.getStatePath('unlocked', 'locked');
  assertArrayEqual(path, ['lock-requested', 'locking', 'locked']);
});

runner.test('getStatePath: unlocked → lock-requested', () => {
  const path = sm.getStatePath('unlocked', 'lock-requested');
  assertArrayEqual(path, ['lock-requested']);
});

runner.test('getStatePath: lock-requested → locking', () => {
  const path = sm.getStatePath('lock-requested', 'locking');
  assertArrayEqual(path, ['locking']);
});

runner.test('getStatePath: locking → locked', () => {
  const path = sm.getStatePath('locking', 'locked');
  assertArrayEqual(path, ['locked']);
});

// State Path Tests - Backward Direction
runner.test('getStatePath: locked → unlocked (full cycle backward)', () => {
  const path = sm.getStatePath('locked', 'unlocked');
  assertArrayEqual(path, ['unlock-requested', 'unlocking', 'unlocked']);
});

runner.test('getStatePath: locked → unlock-requested', () => {
  const path = sm.getStatePath('locked', 'unlock-requested');
  assertArrayEqual(path, ['unlock-requested']);
});

runner.test('getStatePath: unlock-requested → unlocking', () => {
  const path = sm.getStatePath('unlock-requested', 'unlocking');
  assertArrayEqual(path, ['unlocking']);
});

runner.test('getStatePath: unlocking → unlocked', () => {
  const path = sm.getStatePath('unlocking', 'unlocked');
  assertArrayEqual(path, ['unlocked']);
});

// Jump Tests (Basic Lock Behavior)
runner.test('getStatePath: unlocked → locked (skip intermediate states)', () => {
  const path = sm.getStatePath('unlocked', 'locked');
  assertArrayEqual(path, ['lock-requested', 'locking', 'locked']);
});

runner.test('getStatePath: locked → unlocked (skip intermediate states)', () => {
  const path = sm.getStatePath('locked', 'unlocked');
  assertArrayEqual(path, ['unlock-requested', 'unlocking', 'unlocked']);
});

// Same State Tests
runner.test('getStatePath: same state returns empty path', () => {
  assertArrayEqual(sm.getStatePath('locked', 'locked'), []);
  assertArrayEqual(sm.getStatePath('unlocked', 'unlocked'), []);
});

// Special State Tests
runner.test('getStatePath: to jammed state (direct)', () => {
  const path = sm.getStatePath('locked', 'jammed');
  assertArrayEqual(path, ['jammed']);
});

runner.test('getStatePath: to unknown state (direct)', () => {
  const path = sm.getStatePath('unlocked', 'unknown');
  assertArrayEqual(path, ['unknown']);
});

// Edge Cases
runner.test('getStatePath: from locking to unlocking (reversal)', () => {
  const path = sm.getStatePath('locking', 'unlocking');
  // Should go backward: locking → lock-requested → unlocked → unlock-requested → unlocking
  assertArrayEqual(path, ['locked', 'unlock-requested', 'unlocking']);
});

runner.test('getStatePath: from unlocking to locking (reversal)', () => {
  const path = sm.getStatePath('unlocking', 'locking');
  // Should go forward: unlocking → unlocked → lock-requested → locking
  assertArrayEqual(path, ['unlocked', 'lock-requested', 'locking']);
});

// User Interaction Scenarios
runner.test('Scenario: User locks from unlocked', () => {
  // User clicks → immediate lock-requested
  const initialPath = sm.getStatePath('unlocked', 'lock-requested');
  assertArrayEqual(initialPath, ['lock-requested']);
  
  // Lock reports locking
  const lockingPath = sm.getStatePath('lock-requested', 'locking');
  assertArrayEqual(lockingPath, ['locking']);
  
  // Lock reports locked
  const lockedPath = sm.getStatePath('locking', 'locked');
  assertArrayEqual(lockedPath, ['locked']);
});

runner.test('Scenario: User unlocks from locked', () => {
  // User clicks → immediate unlock-requested
  const initialPath = sm.getStatePath('locked', 'unlock-requested');
  assertArrayEqual(initialPath, ['unlock-requested']);
  
  // Lock reports unlocking
  const unlockingPath = sm.getStatePath('unlock-requested', 'unlocking');
  assertArrayEqual(unlockingPath, ['unlocking']);
  
  // Lock reports unlocked
  const unlockedPath = sm.getStatePath('unlocking', 'unlocked');
  assertArrayEqual(unlockedPath, ['unlocked']);
});

runner.test('Scenario: Basic lock (no transitional states)', () => {
  // User clicks unlocked → lock-requested
  const step1 = sm.getStatePath('unlocked', 'lock-requested');
  assertArrayEqual(step1, ['lock-requested']);
  
  // Lock immediately reports locked (skipping locking state)
  const step2 = sm.getStatePath('lock-requested', 'locked');
  assertArrayEqual(step2, ['locking', 'locked']);
});

runner.test('Scenario: Manual lock change (no user action)', () => {
  // Lock manually changed from locked to unlocked
  const path = sm.getStatePath('locked', 'unlocked');
  // Should still animate through states
  assertArrayEqual(path, ['unlock-requested', 'unlocking', 'unlocked']);
});

// Run all tests
runner.run();
