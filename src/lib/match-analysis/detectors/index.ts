import type { Detector, DetectorInput, Fact } from '../types';
import { goalFlood } from './goal-flood';
import { halfTimeDetector } from './half-time';
import { milestones } from './milestones';
import { opponent } from './opponent';
import { pace } from './pace';
import { sameScore } from './same-score';
import { scoreline } from './scoreline';
import { secondHalf } from './second-half';
import { streaks } from './streaks';
import { subGoals } from './sub-goals';

export const DETECTORS: Record<string, Detector> = {
  scoreline, sameScore, goalFlood, halfTimeDetector, secondHalf, subGoals, streaks, opponent, milestones, pace,
};

/** Every detector over one input; a detector that throws is logged and contributes nothing. */
export function runDetectors(input: DetectorInput): Fact[] {
  return Object.entries(DETECTORS).flatMap(([name, detect]) => {
    try {
      return detect(input);
    } catch (e) {
      console.error(`[match-analysis] detector ${name} failed:`, e);
      return [];
    }
  });
}
