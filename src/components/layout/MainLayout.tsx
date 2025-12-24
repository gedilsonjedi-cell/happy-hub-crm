import { ReactNode } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { SubscriptionAlert } from "@/components/subscription/SubscriptionAlert";
import { SidebarProvider, useSidebarState } from "@/hooks/useSidebarState";
import { cn } from "@/lib/utils";

interface MainLayoutProps {
  children: ReactNode;
}

function LayoutContent({ children }: MainLayoutProps) {
  const { collapsed, isMobile, mobileOpen } = useSidebarState();

  return (
    <div className="min-h-screen bg-background">
      <SubscriptionAlert />
      <Header />
      <Sidebar />
      
      {/* Mobile overlay */}
      {isMobile && mobileOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => {}}
        />
      )}
      
      <main 
        className={cn(
          "pt-14 min-h-screen transition-all duration-300",
          // Desktop/tablet: adjust margin based on sidebar state
          !isMobile && (collapsed ? "ml-16" : "ml-56"),
          // Mobile: no margin, full width
          isMobile && "ml-0"
        )}
      >
        <div className="p-4 md:p-6">
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
