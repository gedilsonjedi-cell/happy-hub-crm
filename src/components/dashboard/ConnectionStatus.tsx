import { Link2, Wifi, WifiOff, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Connection {
  id: string;
  name: string;
  phone: string;
  status: "connected" | "disconnected" | "connecting";
}

const mockConnections: Connection[] = [
  { id: "1", name: "Número Principal", phone: "+55 11 99999-0001", status: "connected" },
  { id: "2", name: "Suporte", phone: "+55 11 99999-0002", status: "connected" },
  { id: "3", name: "Vendas", phone: "+55 11 99999-0003", status: "disconnected" },
];

const statusConfig = {
  connected: { 
    label: "Conectado", 
    icon: Wifi,
    className: "bg-primary/10 text-primary border-primary/20",
    dotClassName: "bg-primary"
  },
  disconnected: { 
    label: "Desconectado", 
    icon: WifiOff,
    className: "bg-destructive/10 text-destructive border-destructive/20",
    dotClassName: "bg-destructive"
  },
  connecting: { 
    label: "Conectando", 
    icon: Wifi,
    className: "bg-warning/10 text-warning border-warning/20",
    dotClassName: "bg-warning animate-pulse"
  },
};

export function ConnectionStatus() {
  return (
    <div className="bg-card rounded-xl shadow-card border border-border/50 overflow-hidden">
      <div className="p-5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Link2 className="w-5 h-5 text-primary" />
          </div>
          <h3 className="font-semibold text-card-foreground">Status das Conexões</h3>
        </div>
        <Button variant="ghost" size="sm" className="text-primary">
          <Link2 className="w-4 h-4 mr-2" />
          Gerenciar
        </Button>
      </div>
      
      <div className="p-4 space-y-3">
        {mockConnections.map((connection, index) => {
          const config = statusConfig[connection.status];
          const StatusIcon = config.icon;
          
          return (
            <div 
              key={connection.id}
              className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50 animate-slide-up"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-card-foreground">{connection.name}</p>
                  <p className="text-sm text-muted-foreground">{connection.phone}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <span className={cn("w-2 h-2 rounded-full", config.dotClassName)} />
                <Badge variant="outline" className={cn("text-xs", config.className)}>
                  <StatusIcon className="w-3 h-3 mr-1" />
                  {config.label}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
