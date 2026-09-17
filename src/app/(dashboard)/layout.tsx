import { AICommandProvider } from '@/components/ai/ai-command-provider';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AICommandProvider>{children}</AICommandProvider>;
}
