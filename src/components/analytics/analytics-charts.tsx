'use client';

import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Clock, Award } from 'lucide-react';
import { GlassCard, CardHeader, CardTitle } from '@/components/ui/card';

interface AnalyticsChartsProps {
  studyTimeCurve: { date: string; minutes: number }[];
  activityTrends: { date: string; commits: number; leetcode: number }[];
}

export function AnalyticsCharts({ studyTimeCurve, activityTrends }: AnalyticsChartsProps) {
  return (
    <div className="space-y-6">
      {/* Recharts Area Chart: 14-Day Study Time Curve */}
      <GlassCard>
        <CardHeader>
          <CardTitle>
            <Clock className="w-4 h-4 text-[#0284C7]" />
            <span>14-Day Focus Study Time Curve (Minutes per Day)</span>
          </CardTitle>
        </CardHeader>

        <div className="h-64 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={studyTimeCurve}>
              <defs>
                <linearGradient id="studyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0284C7" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#0284C7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" stroke="#8C929B" fontSize={11} />
              <YAxis stroke="#8C929B" fontSize={11} />
              <Tooltip
                contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E2E5E9', borderRadius: '12px', fontSize: '12px', fontFamily: 'JetBrains Mono', color: '#17191D' }}
              />
              <Area type="monotone" dataKey="minutes" stroke="#0284C7" strokeWidth={2} fillOpacity={1} fill="url(#studyGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      {/* Recharts Bar Chart: Combined GitHub Commits & LeetCode Growth */}
      <GlassCard>
        <CardHeader>
          <CardTitle>
            <Award className="w-4 h-4 text-amber-600" />
            <span>GitHub Commits vs LeetCode Problems Growth Trends</span>
          </CardTitle>
        </CardHeader>

        <div className="h-64 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={activityTrends}>
              <XAxis dataKey="date" stroke="#8C929B" fontSize={11} />
              <YAxis stroke="#8C929B" fontSize={11} />
              <Tooltip
                contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E2E5E9', borderRadius: '12px', fontSize: '12px', fontFamily: 'JetBrains Mono', color: '#17191D' }}
              />
              <Bar dataKey="commits" fill="#0284C7" name="GitHub Commits" radius={[4, 4, 0, 0]} />
              <Bar dataKey="leetcode" fill="#D97706" name="LeetCode Solved" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>
    </div>
  );
}
