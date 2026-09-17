'use server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { getTimeSessions } from '@/app/actions/time-actions';
import { getTasks } from '@/app/actions/task-actions';
import { getSyncedGitHubActivity } from '@/app/actions/github-actions';
import { getSyncedLeetCodeSubmissions } from '@/app/actions/leetcode-actions';

export async function getAnalyticsOverview(): Promise<{
  studyTimeCurve: { date: string; minutes: number }[];
  taskVelocity: { completed: number; total: number; percentage: number };
  activityTrends: { date: string; commits: number; leetcode: number }[];
  consistencyScore: number; // 0 - 100%
  totalHoursLogged: number;
}> {
  try {
    const [sessions, tasks, ghActivity, lcSubs] = await Promise.all([
      getTimeSessions(),
      getTasks(),
      getSyncedGitHubActivity(),
      getSyncedLeetCodeSubmissions(),
    ]);

    // 1. Compute 14-Day Study Time Curve
    const today = new Date();
    const studyTimeMap: Record<string, number> = {};
    const activityMap: Record<string, { commits: number; leetcode: number }> = {};

    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      studyTimeMap[dateStr] = 0;
      activityMap[dateStr] = { commits: 0, leetcode: 0 };
    }

    let totalMinutes = 0;
    for (const s of sessions) {
      totalMinutes += s.duration_minutes;
      if (studyTimeMap[s.session_date] !== undefined) {
        studyTimeMap[s.session_date] += s.duration_minutes;
      }
    }

    for (const gh of ghActivity) {
      const gDate = new Date(gh.occurred_at).toISOString().split('T')[0];
      if (activityMap[gDate]) {
        activityMap[gDate].commits++;
      }
    }

    for (const lc of lcSubs) {
      const lDate = new Date(lc.timestamp).toISOString().split('T')[0];
      if (activityMap[lDate]) {
        activityMap[lDate].leetcode++;
      }
    }

    const studyTimeCurve = Object.entries(studyTimeMap).map(([date, minutes]) => ({
      date: date.substring(5), // MM-DD
      minutes,
    }));

    const activityTrends = Object.entries(activityMap).map(([date, counts]) => ({
      date: date.substring(5),
      commits: counts.commits,
      leetcode: counts.leetcode,
    }));

    // 2. Compute Task Velocity
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'completed').length;
    const taskPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // 3. Compute 30-Day Learning Consistency Score
    const activeDaysSet = new Set<string>();
    for (const s of sessions) activeDaysSet.add(s.session_date);
    for (const gh of ghActivity) activeDaysSet.add(new Date(gh.occurred_at).toISOString().split('T')[0]);
    for (const lc of lcSubs) activeDaysSet.add(new Date(lc.timestamp).toISOString().split('T')[0]);

    let active30Count = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      if (activeDaysSet.has(dateStr)) active30Count++;
    }

    const consistencyScore = Math.min(100, Math.round((active30Count / 30) * 100));

    return {
      studyTimeCurve,
      taskVelocity: {
        completed: completedTasks,
        total: totalTasks,
        percentage: taskPercentage,
      },
      activityTrends,
      consistencyScore,
      totalHoursLogged: Math.round((totalMinutes / 60) * 10) / 10,
    };
  } catch (err) {
    return {
      studyTimeCurve: [],
      taskVelocity: { completed: 0, total: 0, percentage: 0 },
      activityTrends: [],
      consistencyScore: 0,
      totalHoursLogged: 0,
    };
  }
}
