import { useState } from "react";
import { 
  Link2, 
  Plus, 
  ExternalLink
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const Conexoes = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    appName: "",
    accessToken: "",
    whatsappNumber: ""
  });

  const handleConnect = () => {
    if (!formData.appName || !formData.accessToken || !formData.whatsappNumber) {
      toast.error("Preencha todos os campos");
      return;
    }
    toast.success("Conexão realizada com sucesso!");
    setIsDialogOpen(false);
    setFormData({ appName: "", accessToken: "", whatsappNumber: "" });
  };

  return (
    <MainLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-8 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Conexões WhatsApp</h1>
          <p className="text-muted-foreground">Gerencie suas conexões com provedores BSP</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Nova Conexão
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Conectar Notifica.me</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Configure sua conexão com a API do Notifica.me para enviar e receber mensagens
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-foreground">Nome do App</Label>
                <Input 
                  placeholder="seu-email@exemplo.com" 
                  className="bg-muted/30 border-border"
                  value={formData.appName}
                  onChange={(e) => setFormData({ ...formData, appName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Token de Acesso</Label>
                <Input 
                  type="password"
                  placeholder="••••••••••"
                  className="bg-muted/30 border-border"
                  value={formData.accessToken}
                  onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Número WhatsApp</Label>
                <Input 
                  placeholder="+5511999999999"
                  className="bg-muted/30 border-border"
                  value={formData.whatsappNumber}
                  onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleConnect}>
                Conectar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Integration Card */}
      <div className="bg-card rounded-lg border border-border p-6 animate-slide-up">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-muted/30 flex items-center justify-center border border-border">
            <Link2 className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground mb-1">
              Integração Notifica.me
            </h3>
            <p className="text-muted-foreground text-sm mb-3">
              O Notifica.me é um provedor BSP oficial do WhatsApp. Conecte sua conta para enviar e receber mensagens.
            </p>
            <a 
              href="https://notifica.me" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary text-sm hover:underline"
            >
              Criar conta no Notifica.me
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <Button variant="outline" onClick={() => setIsDialogOpen(true)}>
            Configurar
          </Button>
        </div>
      </div>

      {/* Info Section */}
      <div className="mt-6 p-4 bg-muted/20 rounded-lg border border-border">
        <h4 className="font-medium text-foreground mb-2">Como obter suas credenciais?</h4>
        <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
          <li>Acesse o painel do Notifica.me e faça login</li>
          <li>Vá em Configurações → API</li>
          <li>Copie o Token de Acesso e o Nome do App</li>
          <li>Cole as informações no formulário acima</li>
        </ol>
      </div>

      {/* Connected Numbers Section (empty state) */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold text-foreground mb-4">Números Conectados</h3>
        <div className="bg-card rounded-lg border border-border p-8 text-center">
          <Link2 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">Nenhum número conectado ainda</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Configure uma integração acima para começar a enviar mensagens
          </p>
        </div>
      </div>
    </MainLayout>
  );
};

export default Conexoes;
