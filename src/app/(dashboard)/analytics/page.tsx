import { getAnalyticsOverview } from '@/app/actions/analytics-actions';
import { AnalyticsCharts } from '@/components/analytics/analytics-charts';
import { TrendingUp, Clock, CheckSquare, Flame, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { GlassCard } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const data = await getAnalyticsOverview();

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        icon={<TrendingUp className="w-5 h-5 text-[#0284C7]" />}
        title="Analytics & Learning Velocity Workspace"
        description="Quantitative insights across study hours, task velocity, GitHub commits, and LeetCode growth."
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 font-mono">
        <GlassCard>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#646A73] uppercase font-bold tracking-wider">Consistency</span>
            <Flame className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-3xl font-bold text-amber-700 mt-2">{data?.consistencyScore || 0}%</div>
          <span className="text-[10px] text-[#8C929B] mt-1 block">Active days over past 30 days</span>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#646A73] uppercase font-bold tracking-wider">Focus Time</span>
            <Clock className="w-4 h-4 text-[#0284C7]" />
          </div>
          <div className="text-3xl font-bold text-[#0284C7] mt-2">{data?.totalHoursLogged || 0} hrs</div>
          <span className="text-[10px] text-[#8C929B] mt-1 block">Cumulative logged study hours</span>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#646A73] uppercase font-bold tracking-wider">Task Velocity</span>
            <CheckSquare className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-bold text-emerald-700 mt-2">{data?.taskVelocity.percentage || 0}%</div>
          <span className="text-[10px] text-[#8C929B] mt-1 block">{data?.taskVelocity.completed} of {data?.taskVelocity.total} tasks finished</span>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#646A73] uppercase font-bold tracking-wider">System State</span>
            <Sparkles className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-indigo-800 mt-2 font-heading">OPTIMAL</div>
          <span className="text-[10px] text-[#8C929B] mt-1 block">Unified evidence engine active</span>
        </GlassCard>
      </div>

      {/* Analytics Recharts Graphics */}
      <AnalyticsCharts
        studyTimeCurve={data?.studyTimeCurve || []}
        activityTrends={data?.activityTrends || []}
      />
    </div>
  );
}
