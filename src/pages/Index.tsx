import { Users, MessageSquare, Link2, TrendingUp, UserPlus, Clock } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { RecentConversations } from "@/components/dashboard/RecentConversations";
import { ConnectionStatus } from "@/components/dashboard/ConnectionStatus";

const Index = () => {
  return (
    <MainLayout>
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Olá, <span className="text-gradient">Usuário</span> 👋
        </h1>
        <p className="text-muted-foreground">
          Aqui está o resumo das suas atividades de hoje
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatsCard
          title="Total de Leads"
          value="1.234"
          change="+12% este mês"
          changeType="positive"
          icon={Users}
          iconColor="bg-primary/10 text-primary"
        />
        <StatsCard
          title="Conversas Ativas"
          value="56"
          change="+5 novas hoje"
          changeType="positive"
          icon={MessageSquare}
          iconColor="bg-warning/10 text-warning"
        />
        <StatsCard
          title="Conexões Ativas"
          value="3"
          change="2 conectadas"
          changeType="neutral"
          icon={Link2}
          iconColor="bg-accent/10 text-accent"
        />
        <StatsCard
          title="Taxa de Resposta"
          value="94%"
          change="+2% vs semana passada"
          changeType="positive"
          icon={TrendingUp}
          iconColor="bg-primary/10 text-primary"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <button className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border/50 hover:border-primary/50 hover:shadow-whatsapp transition-all duration-300 group">
          <div className="p-3 rounded-xl gradient-whatsapp text-primary-foreground group-hover:scale-110 transition-transform">
            <UserPlus className="w-5 h-5" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-card-foreground">Adicionar Lead</p>
            <p className="text-sm text-muted-foreground">Cadastrar novo contato</p>
          </div>
        </button>
        
        <button className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border/50 hover:border-primary/50 hover:shadow-whatsapp transition-all duration-300 group">
          <div className="p-3 rounded-xl bg-warning/10 text-warning group-hover:scale-110 transition-transform">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-card-foreground">Nova Conversa</p>
            <p className="text-sm text-muted-foreground">Iniciar atendimento</p>
          </div>
        </button>
        
        <button className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border/50 hover:border-primary/50 hover:shadow-whatsapp transition-all duration-300 group">
          <div className="p-3 rounded-xl bg-muted text-muted-foreground group-hover:scale-110 transition-transform">
            <Clock className="w-5 h-5" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-card-foreground">Pendentes</p>
            <p className="text-sm text-muted-foreground">8 conversas aguardando</p>
          </div>
        </button>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentConversations />
        </div>
        <div>
          <ConnectionStatus />
        </div>
      </div>
    </MainLayout>
  );
};

export default Index;
