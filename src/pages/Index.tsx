import { 
  Users, 
  UserPlus, 
  MessageSquare, 
  Send, 
  TrendingUp,
  Clock
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  iconColor?: string;
}

function StatCard({ title, value, icon: Icon, iconColor = "text-primary" }: StatCardProps) {
  return (
    <div className="bg-card rounded-lg border border-border p-5 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground mb-3">{title}</p>
          <p className="text-3xl font-bold text-foreground">{value}</p>
        </div>
        <Icon className={cn("w-6 h-6", iconColor)} />
      </div>
    </div>
  );
}

interface QuickActionProps {
  title: string;
  description: string;
  icon: React.ElementType;
  onClick?: () => void;
}

function QuickAction({ title, description, icon: Icon, onClick }: QuickActionProps) {
  return (
    <button 
      onClick={onClick}
      className="gradient-card rounded-lg p-5 text-left hover:opacity-90 transition-opacity animate-slide-up w-full"
    >
      <Icon className="w-6 h-6 text-primary-foreground mb-4" />
      <h3 className="font-semibold text-primary-foreground mb-1">{title}</h3>
      <p className="text-sm text-primary-foreground/70">{description}</p>
    </button>
  );
}

const Index = () => {
  return (
    <MainLayout>
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-2xl font-bold text-foreground mb-1">Dashboard CRM</h1>
        <p className="text-muted-foreground">Visão geral do seu CRM WhatsApp</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Total de Leads"
          value={0}
          icon={Users}
          iconColor="text-primary"
        />
        <StatCard
          title="Novos Hoje"
          value={0}
          icon={UserPlus}
          iconColor="text-primary"
        />
        <StatCard
          title="Conversas Abertas"
          value={0}
          icon={MessageSquare}
          iconColor="text-primary"
        />
        <StatCard
          title="Campanhas Enviadas"
          value={0}
          icon={Send}
          iconColor="text-purple-400"
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-card rounded-lg border border-border p-6 mb-6 animate-slide-up">
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Ações Rápidas</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <QuickAction
            title="Adicionar Lead"
            description="Cadastre novos contatos"
            icon={UserPlus}
          />
          <QuickAction
            title="Atendimentos"
            description="Gerencie conversas"
            icon={MessageSquare}
          />
          <QuickAction
            title="Nova Campanha"
            description="Dispare mensagens em massa"
            icon={Send}
          />
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-card rounded-lg border border-border p-6 animate-slide-up">
        <div className="flex items-center gap-2 mb-5">
          <Clock className="w-5 h-5 text-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Atividade Recente</h2>
        </div>
        
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <MessageSquare className="w-12 h-12 mb-4 opacity-30" />
          <p>Nenhuma atividade recente</p>
        </div>
      </div>
    </MainLayout>
  );
};

export default Index;
