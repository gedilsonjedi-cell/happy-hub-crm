import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useTheme } from "next-themes";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import optimusLogoDark from "@/assets/optimus-logo-dark.png";
import optimusLogoLight from "@/assets/optimus-logo.png";

const LAST_UPDATED = "21 de agosto de 2026";
const DPO_EMAIL = "contato@consiglead.com.br";
const SITE_ORIGIN = "https://optimuscrm.com.br";

const sections = [
  { id: "introducao", label: "Introdução e quem somos" },
  { id: "definicoes", label: "Definições" },
  { id: "dados", label: "Quais dados tratamos" },
  { id: "finalidades", label: "Finalidades do tratamento" },
  { id: "bases", label: "Bases legais" },
  { id: "compartilhamento", label: "Compartilhamento de dados" },
  { id: "internacional", label: "Transferência internacional" },
  { id: "retencao", label: "Retenção e eliminação" },
  { id: "seguranca", label: "Segurança da informação" },
  { id: "direitos", label: "Direitos do titular" },
  { id: "cookies", label: "Cookies e tecnologias similares" },
  { id: "menores", label: "Menores de idade" },
  { id: "alteracoes", label: "Alterações desta política" },
  { id: "contato", label: "Contato e encarregado" },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-xl sm:text-2xl font-semibold text-foreground mb-3">
        {title}
      </h2>
      <div className="text-sm sm:text-base leading-relaxed text-muted-foreground space-y-3">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPolicy() {
  const { theme } = useTheme();
  const logo = theme === "dark" ? optimusLogoLight : optimusLogoDark;

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <Helmet>
        <title>Política de Privacidade - Optimus CRM</title>
        <meta
          name="description"
          content="Política de Privacidade do Optimus CRM. Saiba como tratamos seus dados pessoais e os dos leads de acordo com a LGPD."
        />
        <link rel="canonical" href={`${SITE_ORIGIN}/politica-de-privacidade`} />
        <meta property="og:title" content="Política de Privacidade - Optimus CRM" />
        <meta
          property="og:description"
          content="Conheça nossas práticas de privacidade, segurança e direitos dos titulares."
        />
        <meta property="og:url" content={`${SITE_ORIGIN}/politica-de-privacidade`} />
        <meta property="og:type" content="website" />
        <meta property="twitter:card" content="summary" />
      </Helmet>

      <div className="min-h-screen flex flex-col bg-background text-foreground">
        {/* Header */}
        <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <img
                src={logo}
                alt="Optimus CRM"
                className="h-6 w-auto object-contain"
              />
            </Link>
            <Link
              to="/auth"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Entrar
            </Link>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
          <div className="space-y-2 mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">
              Política de Privacidade
            </h1>
            <p className="text-sm text-muted-foreground">
              Última atualização: <strong className="text-foreground">{LAST_UPDATED}</strong>
            </p>
          </div>

          {/* Summary / Table of contents */}
          <nav
            aria-label="Sumário da política de privacidade"
            className={cn(
              "rounded-lg border border-border bg-card p-5 sm:p-6 mb-10 sm:mb-12"
            )}
          >
            <h2 className="text-lg font-semibold text-foreground mb-3">
              Sumário
            </h2>
            <ol className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              {sections.map((section, index) => (
                <li key={section.id}>
                  <button
                    onClick={() => scrollToSection(section.id)}
                    className="text-left w-full text-muted-foreground hover:text-primary hover:underline transition-colors"
                  >
                    <span className="inline-block w-6 text-muted-foreground/60">
                      {index + 1}.
                    </span>
                    {section.label}
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <article className="space-y-10 sm:space-y-12">
            <Section id="introducao" title="1. Introdução e quem somos">
              <p>
                A presente Política de Privacidade descreve como a plataforma <strong>Optimus CRM</strong> trata dados pessoais, em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 – LGPD).
              </p>
              <p>
                O Optimus CRM é um sistema de gestão de relacionamento (CRM) voltado para atendimento e disparo de mensagens via WhatsApp, utilizado por organizações clientes para gerenciar leads, conversas, campanhas e relacionamentos.
              </p>
              <p>
                <strong>Controlador:</strong> Optimus CRM.
                <br />
                <strong>Contato do encarregado (DPO):</strong>{" "}
                <a
                  href={`mailto:${DPO_EMAIL}`}
                  className="text-primary hover:underline"
                >
                  {DPO_EMAIL}
                </a>
              </p>
            </Section>

            <Separator />

            <Section id="definicoes" title="2. Definições">
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Titular:</strong> pessoa natural a quem se referem os dados pessoais sujeitos a tratamento.
                </li>
                <li>
                  <strong>Dado pessoal:</strong> informação relacionada a pessoa natural identificada ou identificável.
                </li>
                <li>
                  <strong>Dado pessoal sensível:</strong> dado pessoal sobre origem racial ou étnica, convicção religiosa, opinião política, filiação sindical ou a organização de caráter religioso, filosófico ou político, dado referente à saúde ou à vida sexual, dado genético ou biométrico, quando vinculado a uma pessoa natural.
                </li>
                <li>
                  <strong>Tratamento:</strong> toda operação realizada com dados pessoais, como coleta, produção, recepção, classificação, utilização, acesso, reprodução, transmissão, distribuição, processamento, arquivamento, armazenamento, eliminação, avaliação ou controle da informação, modificação, comunicação, transferência, difusão ou extração.
                </li>
                <li>
                  <strong>Controlador:</strong> pessoa natural ou jurídica, de direito público ou privado, a quem competem as decisões referentes ao tratamento de dados pessoais.
                </li>
                <li>
                  <strong>Operador:</strong> pessoa natural ou jurídica, de direito público ou privado, que realiza o tratamento de dados pessoais em nome do controlador.
                </li>
              </ul>
            </Section>

            <Separator />

            <Section id="dados" title="3. Quais dados tratamos">
              <h3 className="text-base font-semibold text-foreground">
                3.1. Dados dos usuários do sistema
              </h3>
              <p>
                Coletamos os dados necessários para identificação, autenticação e operação da conta dos usuários (operadores/administradores) das organizações clientes, tais como:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>nome completo e nome de exibição;</li>
                <li>endereço de e-mail;</li>
                <li>número de telefone/WhatsApp;</li>
                <li>credenciais de acesso (senhas criptografadas);</li>
                <li>logs de uso, ações e preferências dentro da plataforma.</li>
              </ul>

              <h3 className="text-base font-semibold text-foreground pt-2">
                3.2. Dados de leads e contatos
              </h3>
              <p>
                Os dados de leads e contatos que trafegam na plataforma são inseridos ou importados pelas organizações clientes, e podem incluir:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>nome e identificadores do lead;</li>
                <li>número de telefone/WhatsApp;</li>
                <li>mensagens e histórico de atendimento trocados;</li>
                <li>status, etiquetas, anotações e outras informações de relacionamento.</li>
              </ul>
              <p>
                <strong>Importante:</strong> em relação aos dados de leads e contatos, as organizações clientes atuam como <strong>controladoras</strong> e o Optimus CRM atua como <strong>operador</strong>, tratando esses dados estritamente sob instrução e para as finalidades contratadas.
              </p>
            </Section>

            <Separator />

            <Section id="finalidades" title="4. Finalidades do tratamento">
              <p>Tratamos dados pessoais para as seguintes finalidades:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>prestar o serviço de CRM, atendimento e gestão de conversas;</li>
                <li>autenticar e autorizar o acesso dos usuários à plataforma;</li>
                <li>enviar e receber comunicações via WhatsApp conforme a operação das organizações clientes;</li>
                <li>garantir a segurança, integridade e disponibilidade do sistema;</li>
                <li>cumprir obrigações legais e regulatórias;</li>
                <li>melhorar o funcionamento, a usabilidade e a performance do serviço.</li>
              </ul>
            </Section>

            <Separator />

            <Section id="bases" title="5. Bases legais">
              <p>
                O tratamento de dados pessoais realizado pelo Optimus CRM fundamenta-se nas hipóteses legais previstas nos artigos 7º e 11 da LGPD, incluindo:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>execução de contrato ou de procedimentos preliminares relacionados;</li>
                <li>cumprimento de obrigação legal ou regulatória;</li>
                <li>exercício regular de direitos em processo judicial, administrativo ou arbitral;</li>
                <li>legítimo interesse, quando aplicável e observados os direitos do titular;</li>
                <li>consentimento, quando necessário e de forma específica.</li>
              </ul>
            </Section>

            <Separator />

            <Section id="compartilhamento" title="6. Compartilhamento de dados">
              <p>
                O Optimus CRM não vende dados pessoais. Compartilhamos dados apenas com terceiros estritamente necessários à operação do serviço, em condições contratuais de confidencialidade e segurança:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>provedores de infraestrutura, nuvem e hospedagem;</li>
                <li>provedores de banco de dados e serviços de armazenamento;</li>
                <li>Meta Platforms, Inc., para envio e recebimento de mensagens via WhatsApp Business API;</li>
                <li>outros subprocessadores contratados para funcionalidades específicas da plataforma.</li>
              </ul>
            </Section>

            <Separator />

            <Section id="internacional" title="7. Transferência internacional">
              <p>
                Alguns dos provedores e subprocessadores utilizados pelo Optimus CRM podem operar servidores localizados fora do Brasil. Nesses casos, adotamos as salvaguardas cabíveis, como instrumentos contratuais de transferência internacional, para garantir proteção compatível com a LGPD.
              </p>
            </Section>

            <Separator />

            <Section id="retencao" title="8. Retenção e eliminação">
              <p>
                Mantemos os dados pessoais apenas pelo tempo necessário para cumprir as finalidades descritas nesta política, atender a obrigações legais, regulatórias ou contratuais, ou resolver questões de segurança.
              </p>
              <p>
                Quando os dados não forem mais necessários, serão eliminados, anonimizados ou pseudonimizados de forma segura, salvo quando houver previsão legal de retenção.
              </p>
            </Section>

            <Separator />

            <Section id="seguranca" title="9. Segurança da informação">
              <p>Adotamos medidas técnicas e organizacionais para proteger os dados pessoais, incluindo:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>controle de acesso baseado em perfil e autenticação;</li>
                <li>criptografia em trânsito (TLS/HTTPS);</li>
                <li>isolamento de dados por organização (multi-tenant);</li>
                <li>monitoramento, logs de auditoria e políticas de senha;</li>
                <li>atualização e revisão periódica de práticas de segurança.</li>
              </ul>
            </Section>

            <Separator />

            <Section id="direitos" title="10. Direitos do titular">
              <p>
                De acordo com o art. 18 da LGPD, o titular tem direito a:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>confirmação da existência de tratamento;</li>
                <li>acesso aos dados pessoais;</li>
                <li>correção de dados incompletos, inexatos ou desatualizados;</li>
                <li>anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade;</li>
                <li>portabilidade dos dados a outro fornecedor, quando aplicável;</li>
                <li>eliminação dos dados pessoais tratados com consentimento;</li>
                <li>informação sobre as entidades com as quais seus dados foram compartilhados;</li>
                <li>informação sobre a possibilidade de não fornecer consentimento e suas consequências;</li>
                <li>revogação do consentimento, quando aplicável.</li>
              </ul>
              <p>
                Para exercer seus direitos, envie um e-mail para{" "}
                <a
                  href={`mailto:${DPO_EMAIL}`}
                  className="text-primary hover:underline"
                >
                  {DPO_EMAIL}
                </a>
                . Responderemos dentro dos prazos legais.
              </p>
            </Section>

            <Separator />

            <Section id="cookies" title="11. Cookies e tecnologias similares">
              <p>
                Utilizamos cookies e armazenamento local (localStorage/sessionStorage) para funcionalidades essenciais, como autenticação, manutenção de sessão, preferências de tema e funcionamento seguro da plataforma. Não utilizamos cookies para rastreamento de publicidade comportamental sem consentimento.
              </p>
            </Section>

            <Separator />

            <Section id="menores" title="12. Menores de idade">
              <p>
                O Optimus CRM destina-se a pessoas jurídicas e maiores de 18 anos. Não coletamos intencionalmente dados de menores de idade. Caso identifiquemos a coleta de dados de menor, tomaremos as medidas para eliminá-los.
              </p>
            </Section>

            <Separator />

            <Section id="alteracoes" title="13. Alterações desta política">
              <p>
                Esta Política de Privacidade pode ser atualizada periodicamente para refletir mudanças na legislação, nas funcionalidades da plataforma ou nas práticas de privacidade. A data da última revisão será sempre indicada no topo desta página. Recomendamos sua leitura regular.
              </p>
            </Section>

            <Separator />

            <Section id="contato" title="14. Contato e encarregado">
              <p>
                Em caso de dúvidas, solicitações ou para exercer seus direitos como titular, entre em contato com o encarregado de proteção de dados (DPO) pelo e-mail:
              </p>
              <p className="text-base">
                <a
                  href={`mailto:${DPO_EMAIL}`}
                  className="text-primary hover:underline font-medium"
                >
                  {DPO_EMAIL}
                </a>
              </p>
            </Section>
          </article>
        </main>

        {/* Footer */}
        <footer className="border-t border-border bg-card/50">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <Link to="/" className="flex items-center gap-2">
                <img
                  src={logo}
                  alt="Optimus CRM"
                  className="h-5 w-auto object-contain"
                />
              </Link>
              <div className="flex items-center gap-4 text-xs text-muted-foreground text-center sm:text-right">
                <Link
                  to="/termos-de-uso"
                  className="hover:text-foreground transition-colors"
                >
                  Termos de Uso
                </Link>
                <span className="hidden sm:inline">·</span>
                <Link
                  to="/auth"
                  className="hover:text-foreground transition-colors"
                >
                  Entrar
                </Link>
              </div>
              <p className="text-xs text-muted-foreground text-center sm:text-right">
                © {new Date().getFullYear()} Optimus CRM. Todos os direitos reservados.
              </p>
            </div>
            <p className="text-xs text-muted-foreground/70 text-center mt-4 max-w-2xl mx-auto">
              Nota: este documento é um modelo orientativo e recomenda-se a revisão por profissional jurídico para adequação final ao negócio e à legislação aplicável.
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
