import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Gift, 
  Copy, 
  Check, 
  Users, 
  Wallet, 
  TrendingUp, 
  Share2,
  Clock,
  CheckCircle2,
  Loader2,
  Link as LinkIcon
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Referral {
  id: string;
  status: string;
  commission_amount: number | null;
  created_at: string;
  credited_at: string | null;
  referred_organization: {
    name: string;
  } | null;
}

const IndiqueGanhe = () => {
  const { user } = useAuth();
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  // Stats
  const totalReferrals = referrals.length;
  const convertedReferrals = referrals.filter(r => r.status === 'credited').length;
  const pendingReferrals = referrals.filter(r => r.status === 'pending').length;
  const totalEarnings = referrals
    .filter(r => r.status === 'credited')
    .reduce((sum, r) => sum + (r.commission_amount || 0), 0);

  // Use short URL format: domain.com/indique-ganhe/CODE
  const referralLink = referralCode 
    ? `${window.location.origin}/indique-ganhe/${referralCode}` 
    : '';

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      // Get organization ID
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (profileError) {
        console.error('Error fetching profile:', profileError);
        setLoading(false);
        return;
      }

      if (!profile?.organization_id) {
        console.error('No organization found for user');
        setLoading(false);
        return;
      }

      setOrganizationId(profile.organization_id);

      // Get or create referral code
      const { data: codeData, error: codeError } = await supabase
        .rpc('get_or_create_referral_code', { org_id: profile.organization_id });

      if (codeError) {
        console.error('Error creating referral code:', codeError);
        throw codeError;
      }
      
      console.log('Referral code generated:', codeData);
      setReferralCode(codeData);

      // Fetch referrals
      const { data: referralsData, error: referralsError } = await supabase
        .from('referrals')
        .select(`
          id,
          status,
          commission_amount,
          created_at,
          credited_at,
          referred_organization_id
        `)
        .eq('referrer_organization_id', profile.organization_id)
        .order('created_at', { ascending: false });

      if (referralsError) throw referralsError;

      // Fetch organization names for each referral
      const referralsWithOrgs = await Promise.all(
        (referralsData || []).map(async (ref) => {
          const { data: org } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', ref.referred_organization_id)
            .single();
          
          return {
            ...ref,
            referred_organization: org
          };
        })
      );

      setReferrals(referralsWithOrgs);
    } catch (error) {
      console.error('Error fetching referral data:', error);
      toast.error('Erro ao carregar dados de indicação');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast.success('Link copiado!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Erro ao copiar link');
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Optimus CRM - Indique e Ganhe',
          text: 'Cadastre-se no Optimus CRM com meu link e ganhe um bônus especial!',
          url: referralLink,
        });
      } catch {
        // User cancelled share
      }
    } else {
      handleCopy();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-600">
            <Clock className="w-3 h-3" />
            Aguardando
          </Badge>
        );
      case 'converted':
        return (
          <Badge variant="outline" className="gap-1 text-blue-600 border-blue-600">
            <TrendingUp className="w-3 h-3" />
            Convertido
          </Badge>
        );
      case 'credited':
        return (
          <Badge className="gap-1 bg-green-600">
            <CheckCircle2 className="w-3 h-3" />
            Creditado
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-2"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20">
              <Gift className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Indique e Ganhe</h1>
              <p className="text-muted-foreground">
                Ganhe <span className="text-primary font-semibold">20%</span> do valor do plano de cada pessoa que você indicar!
              </p>
            </div>
          </div>
        </motion.div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/20">
                    <Users className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{totalReferrals}</p>
                    <p className="text-xs text-muted-foreground">Total indicados</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-yellow-500/20">
                    <Clock className="w-5 h-5 text-yellow-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{pendingReferrals}</p>
                    <p className="text-xs text-muted-foreground">Pendentes</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/20">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{convertedReferrals}</p>
                    <p className="text-xs text-muted-foreground">Convertidos</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="bg-gradient-to-br from-primary/10 to-purple-500/5 border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/20">
                    <Wallet className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      R$ {totalEarnings.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">Total ganho</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Referral Link Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-primary" />
                Seu Link de Indicação
              </CardTitle>
              <CardDescription>
                Compartilhe este link com seus amigos. Quando eles assinarem um plano, você ganha 20% do valor como saldo!
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input 
                  value={referralLink} 
                  readOnly 
                  className="font-mono text-sm bg-muted/50"
                />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={handleCopy}
                  className={cn(
                    "shrink-0 transition-colors",
                    copied && "bg-green-500/10 border-green-500 text-green-500"
                  )}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
                <Button 
                  onClick={handleShare}
                  className="shrink-0 gap-2"
                >
                  <Share2 className="w-4 h-4" />
                  Compartilhar
                </Button>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
                <Gift className="w-4 h-4 text-primary shrink-0" />
                <span>
                  Seu código de indicação: <span className="font-mono font-semibold text-foreground">{referralCode}</span>
                </span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* How it Works */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Como Funciona</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="flex flex-col items-center text-center gap-3 p-4 rounded-lg bg-muted/30">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-xl font-bold text-primary">
                    1
                  </div>
                  <h3 className="font-semibold">Compartilhe seu link</h3>
                  <p className="text-sm text-muted-foreground">
                    Envie seu link de indicação para amigos, colegas ou em suas redes sociais
                  </p>
                </div>

                <div className="flex flex-col items-center text-center gap-3 p-4 rounded-lg bg-muted/30">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-xl font-bold text-primary">
                    2
                  </div>
                  <h3 className="font-semibold">Eles se cadastram</h3>
                  <p className="text-sm text-muted-foreground">
                    Quando alguém se cadastra pelo seu link, a indicação é registrada automaticamente
                  </p>
                </div>

                <div className="flex flex-col items-center text-center gap-3 p-4 rounded-lg bg-muted/30">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-xl font-bold text-primary">
                    3
                  </div>
                  <h3 className="font-semibold">Você ganha 20%</h3>
                  <p className="text-sm text-muted-foreground">
                    Ao assinar um plano, 20% do valor entra como saldo na sua conta automaticamente
                  </p>
                </div>
              </div>

              <Separator className="my-6" />

              <div className="bg-gradient-to-r from-primary/10 to-purple-500/10 p-4 rounded-lg">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-primary" />
                  O que fazer com o saldo?
                </h4>
                <p className="text-sm text-muted-foreground">
                  Use seu saldo para pagar seu plano mensal, enviar disparos de mensagens, comprar recursos na loja, 
                  ou qualquer outro serviço dentro do Optimus CRM. É acumulativo e não expira!
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Referrals Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Suas Indicações
              </CardTitle>
              <CardDescription>
                Histórico de todas as pessoas que você indicou
              </CardDescription>
            </CardHeader>
            <CardContent>
              {referrals.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="font-medium">Nenhuma indicação ainda</p>
                  <p className="text-sm">Compartilhe seu link e comece a ganhar!</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Organização</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Comissão</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {referrals.map((referral) => (
                      <TableRow key={referral.id}>
                        <TableCell className="font-medium">
                          {referral.referred_organization?.name || 'Organização'}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(referral.status)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(referral.created_at).toLocaleDateString('pt-BR')}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {referral.commission_amount 
                            ? `R$ ${referral.commission_amount.toFixed(2)}`
                            : '-'
                          }
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </MainLayout>
  );
};

export default IndiqueGanhe;
