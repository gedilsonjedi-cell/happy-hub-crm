import { ReactNode } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { SubscriptionAlert } from "@/components/subscription/SubscriptionAlert";
import { SidebarProvider, useSidebarState } from "@/hooks/useSidebarState";
import { cn } from "@/lib/utils";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";

interface MainLayoutProps {
  children: ReactNode;
}

function LayoutContent({ children }: MainLayoutProps) {
  const { collapsed, isMobile, mobileOpen, setMobileOpen } = useSidebarState();

  // Swipe gestures for mobile
  useSwipeGesture({
    onSwipeRight: () => {
      if (isMobile && !mobileOpen) {
        setMobileOpen(true);
      }
    },
    onSwipeLeft: () => {
      if (isMobile && mobileOpen) {
        setMobileOpen(false);
      }
    },
    threshold: 60,
    edgeThreshold: 40,
  });

  return (
    <div className="min-h-screen bg-background">
      <SubscriptionAlert />
      <Header />
      <Sidebar />
      
      <main 
        className={cn(
          "pt-14 min-h-screen transition-all duration-300",
          // Desktop/tablet: adjust margin based on sidebar state
          !isMobile && (collapsed ? "ml-16" : "ml-56"),
          // Mobile: no margin, full width
          isMobile && "ml-0"
        )}
      >
        <div className="p-2 sm:p-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <SidebarProvider>
      <LayoutContent>{children}</LayoutContent>
    </SidebarProvider>
  );
}
