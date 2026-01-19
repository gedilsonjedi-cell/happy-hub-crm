// MainLayout now uses TopNavLayout for the new global navigation
// This ensures all pages use the new top navigation menu instead of the old sidebar

import { TopNavLayout } from "./TopNavLayout";

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return <TopNavLayout>{children}</TopNavLayout>;
}
