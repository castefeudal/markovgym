const DAY_MS = 24 * 60 * 60 * 1000;
const hasNumber = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

function validWeek(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function cleanWeeklyReviews(rows) {
  if (!Array.isArray(rows)) return [];
  const cleaned = rows.flatMap((row) => {
    if (!row || typeof row !== 'object' || !validWeek(row.weekStart)) return [];
    const bounded = (value, min, max, fallback) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
    };
    const enumValue = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
    const plannedDays = Math.round(bounded(row.plannedDays, 1, 12, 1));
    return [{
      weekStart: row.weekStart,
      performance: enumValue(row.performance, ['improving', 'steady', 'declining'], 'steady'),
      fatigue: enumValue(row.fatigue, ['low', 'moderate', 'high'], 'moderate'),
      soreness: enumValue(row.soreness, ['low', 'moderate', 'high'], null),
      jointDiscomfort: row.jointDiscomfort === true,
      sessionDifficulty: Math.round(bounded(row.sessionDifficulty, 1, 5, 3)),
      completedDays: Math.round(bounded(row.completedDays, 0, plannedDays, 0)),
      plannedDays,
      adherence: bounded(row.adherence, 0, 1, 0),
    }];
  });
  const byWeek = new Map(cleaned.map((row) => [row.weekStart, row]));
  return [...byWeek.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart)).slice(-16);
}

function recentPair(reviews) {
  const rows = Array.isArray(reviews) ? reviews.filter((row) => row && validWeek(row.weekStart)) : [];
  rows.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  if (rows.length < 2) return null;
  const older = rows.at(-2), latest = rows.at(-1);
  const days = (Date.parse(`${latest.weekStart}T00:00:00.000Z`) - Date.parse(`${older.weekStart}T00:00:00.000Z`)) / DAY_MS;
  return days === 7 ? [older, latest] : null;
}

function hardEffortRate(sets) {
  const rows = Array.isArray(sets) ? sets.filter((set) => set && set.completed && String(set.type || 'working') === 'working') : [];
  const rated = rows.filter((set) => hasNumber(set.rir) || hasNumber(set.rpe));
  if (rated.length < 6) return { status: 'insufficient', rate: null, ratedSets: rated.length };
  const hard = rated.filter((set) => (hasNumber(set.rir) && Number(set.rir) <= 1) || (hasNumber(set.rpe) && Number(set.rpe) >= 9)).length;
  return { status: 'ok', rate: hard / rated.length, ratedSets: rated.length };
}

/** Transparent weekly response; suggestions never alter a programme automatically. */
export function weeklyReviewDecision({ reviews = [], completedWorkingSets = [], programmeAgeWeeks = 0 } = {}) {
  const latest = Array.isArray(reviews) ? [...reviews].filter((row) => row && validWeek(row.weekStart)).sort((a, b) => a.weekStart.localeCompare(b.weekStart)).at(-1) : null;
  const effort = hardEffortRate(completedWorkingSets);
  if (!latest) return { status: 'insufficient', recommendation: 'collect-feedback', confidence: 'none', reasons: [], missingData: ['weekly-feedback'], nextAction: 'save-weekly-feedback' };
  if (latest.jointDiscomfort === true) {
    return { status: 'attention', recommendation: 'review-discomfort', confidence: 'high', reasons: ['joint-discomfort-reported'], missingData: [], nextAction: 'review-painful-movement' };
  }
  const pair = recentPair(reviews);
  if (pair && Number(programmeAgeWeeks) >= 3) {
    const repeatedRegression = pair.every((review) => review.performance === 'declining' && review.fatigue === 'high' && Number(review.sessionDifficulty) >= 4 && Number(review.adherence) >= 0.7);
    if (repeatedRegression && effort.status === 'ok' && effort.rate >= 0.5) {
      return {
        status: 'recommendation', recommendation: 'consider-deload', confidence: 'high', nextAction: 'review-training-load-with-user',
        reasons: ['two_consecutive_weeks_declining_performance', 'high_fatigue_and_session_difficulty', 'adherence_at_least_70_percent', 'at_least_half_of_rated_work_sets_near_limit'],
        missingData: [], evidence: { consecutiveWeeks: 2, ratedWorkingSets: effort.ratedSets, nearLimitRate: effort.rate },
      };
    }
  }
  if (latest.performance === 'improving' && ['low', 'moderate'].includes(latest.fatigue) && latest.jointDiscomfort !== true) {
    return { status: 'positive', recommendation: 'continue-plan', confidence: 'moderate', reasons: ['performance_improving', 'fatigue_not_high'], missingData: [], nextAction: 'continue-current-plan' };
  }
  const missingData = [];
  if (!pair) missingData.push('second_consecutive_week');
  if (Number(programmeAgeWeeks) < 3) missingData.push('programme_age_under_three_weeks');
  if (effort.status !== 'ok') missingData.push('six_rated_working_sets_with_rir_or_rpe');
  return { status: 'neutral', recommendation: 'hold-and-review-next-week', confidence: 'low', reasons: ['signals_do_not_meet_deload_rule'], missingData, nextAction: 'review-next-week' };
}
