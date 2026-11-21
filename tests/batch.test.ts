import { describe, expect, it } from 'vitest';
import * as S from '../src/checks/suites';

const expectAllPassed = (checks: S.Check[]) => expect(checks.filter((c) => c.status !== 'passed').map((c) => `${c.id}: ${c.observed}`)).toEqual([]);

describe('generated tiny-case batch vs independent exhaustive solver', () => { it('agrees on the complete objective', () => expectAllPassed(S.batchChecks().checks)); });
describe('seeded variations', () => { it('return valid schedules', () => expectAllPassed(S.seededChecks().checks)); });
describe('stress', () => { it('selected-plan propagation and recomputation', () => expectAllPassed(S.stressChecks().checks)); });
