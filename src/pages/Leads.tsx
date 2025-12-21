import { useState } from "react";
import { 
  Users, 
  Search, 
  Plus, 
  Filter, 
  MoreVertical, 
  Phone, 
  Mail, 
  Calendar,
  Upload,
  Download
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: "new" | "contacted" | "qualified" | "converted" | "lost";
  source: string;
  createdAt: string;
}

const mockLeads: Lead[] = [
  { id: "1", name: "Maria Silva", phone: "+55 11 99999-1234", email: "maria@email.com", status: "new", source: "WhatsApp", createdAt: "2024-01-15" },
  { id: "2", name: "João Santos", phone: "+55 21 98888-5678", email: "joao@email.com", status: "contacted", source: "Site", createdAt: "2024-01-14" },
  { id: "3", name: "Ana Costa", phone: "+55 31 97777-9012", email: "ana@email.com", status: "qualified", source: "Indicação", createdAt: "2024-01-13" },
  { id: "4", name: "Pedro Lima", phone: "+55 41 96666-3456", email: "pedro@email.com", status: "converted", source: "WhatsApp", createdAt: "2024-01-12" },
  { id: "5", name: "Carla Mendes", phone: "+55 51 95555-7890", email: "carla@email.com", status: "lost", source: "Facebook", createdAt: "2024-01-11" },
  { id: "6", name: "Roberto Alves", phone: "+55 61 94444-1234", email: "roberto@email.com", status: "new", source: "WhatsApp", createdAt: "2024-01-10" },
];

const statusConfig = {
  new: { label: "Novo", className: "bg-primary/10 text-primary border-primary/20" },
  contacted: { label: "Contatado", className: "bg-warning/10 text-warning border-warning/20" },
  qualified: { label: "Qualificado", className: "bg-accent/10 text-accent border-accent/20" },
  converted: { label: "Convertido", className: "bg-success/10 text-success border-success/20" },
  lost: { label: "Perdido", className: "bg-muted text-muted-foreground border-border" },
};

const Leads = () => {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredLeads = mockLeads.filter(lead => 
    lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lead.phone.includes(searchTerm) ||
    lead.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <MainLayout>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Leads</h1>
          <p className="text-muted-foreground">Gerencie seus contatos e leads</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2">
            <Upload className="w-4 h-4" />
            Importar
          </Button>
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Exportar
          </Button>
          <Button variant="whatsapp" className="gap-2">
            <Plus className="w-4 h-4" />
            Novo Lead
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone ou email..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button variant="outline" className="gap-2">
          <Filter className="w-4 h-4" />
          Filtros
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {Object.entries(statusConfig).map(([key, config]) => (
          <div 
            key={key}
            className="bg-card rounded-lg p-4 border border-border/50 text-center"
          >
            <p className="text-2xl font-bold text-card-foreground">
              {mockLeads.filter(l => l.status === key).length}
            </p>
            <Badge variant="outline" className={cn("text-xs mt-2", config.className)}>
              {config.label}
            </Badge>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl shadow-card border border-border/50 overflow-hidden animate-slide-up">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Lead</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLeads.map((lead, index) => (
              <TableRow 
                key={lead.id}
                className="hover:bg-muted/30 transition-colors animate-fade-in"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10 border-2 border-primary/20">
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                        {lead.name.split(" ").map(n => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-card-foreground">{lead.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="w-3 h-3" />
                      {lead.phone}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="w-3 h-3" />
                      {lead.email}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn("text-xs", statusConfig[lead.status].className)}>
                    {statusConfig[lead.status].label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">{lead.source}</span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {new Date(lead.createdAt).toLocaleDateString('pt-BR')}
                  </div>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>Ver detalhes</DropdownMenuItem>
                      <DropdownMenuItem>Editar</DropdownMenuItem>
                      <DropdownMenuItem>Iniciar conversa</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive">Excluir</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </MainLayout>
  );
};

export default Leads;
