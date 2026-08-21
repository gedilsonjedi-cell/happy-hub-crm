import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useTheme } from "next-themes";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import optimusLogoDark from "@/assets/optimus-logo-dark.png";
import optimusLogoLight from "@/assets/optimus-logo.png";

const LAST_UPDATED = "21 de agosto de 2026";
const CONTACT_EMAIL = "contato@consiglead.com.br";
const SITE_ORIGIN = "https://optimuscrm.com.br";

const sections = [
  { id: "aceitacao", label: "Aceitação dos termos" },
  { id: "definicoes", label: "Definições" },
  { id: "servico", label: "Descrição do serviço" },
  { id: "cadastro", label: "Cadastro, conta e acesso" },
  { id: "conduta", label: "Regras de uso e conduta" },
  { id: "responsabilidade", label: "Responsabilidades do cliente" },
  { id: "terceiros", label: "Conformidade com políticas de terceiros" },
  { id: "pagamento", label: "Planos, pagamento e vigência" },
  { id: "suspensao", label: "Suspensão e encerramento" },
  { id: "propriedade", label: "Propriedade intelectual" },
  { id: "limitacao", label: "Isenções e limitação de responsabilidade" },
  { id: "disponibilidade", label: "Disponibilidade e alterações do serviço" },
  { id: "alteracoes", label: "Alterações dos termos" },
  { id: "legislacao", label: "Legislação aplicável e foro" },
  { id: "contato", label: "Contato" },
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

export default function TermsOfUse() {
  const { theme } = useTheme();
  const logo = theme === "dark" ? optimusLogoLight : optimusLogoDark;

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <Helmet>
        <title>Termos e Condições Gerais de Uso - Optimus CRM</title>
        <meta
          name="description"
          content="Termos e Condições Gerais de Uso do Optimus CRM. Leia as regras de uso, responsabilidades e conformidade da plataforma."
        />
        <link rel="canonical" href={`${SITE_ORIGIN}/termos-de-uso`} />
        <meta property="og:title" content="Termos e Condições Gerais de Uso - Optimus CRM" />
        <meta
          property="og:description"
          content="Conheça as regras de uso, responsabilidades e políticas de terceiros do Optimus CRM."
        />
        <meta property="og:url" content={`${SITE_ORIGIN}/termos-de-uso`} />
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
            <div className="flex items-center gap-4 text-sm">
              <Link
                to="/politica-de-privacidade"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Privacidade
              </Link>
              <Link
                to="/auth"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Entrar
              </Link>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
          <div className="space-y-2 mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">
              Termos e Condições Gerais de Uso
            </h1>
            <p className="text-sm text-muted-foreground">
              Última atualização: <strong className="text-foreground">{LAST_UPDATED}</strong>
            </p>
          </div>

          {/* Summary / Table of contents */}
          <nav
            aria-label="Sumário dos termos de uso"
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
            <Section id="aceitacao" title="1. Aceitação dos termos">
              <p>
                Ao acessar, criar uma conta ou utilizar a plataforma <strong>Optimus CRM</strong>, seja como usuário individual ou como representante de uma organização cliente, você concorda, em nome próprio e/ou em nome da entidade que representa, com estes Termos e Condições Gerais de Uso, com a Política de Privacidade e com as demais normas aplicáveis publicadas pela plataforma.
              </p>
              <p>
                Se não concordar com qualquer parte destes termos, você não deve utilizar a plataforma.
              </p>
            </Section>

            <Separator />

            <Section id="definicoes" title="2. Definições">
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Plataforma ou Optimus CRM:</strong> sistema de software disponibilizado na modalidade SaaS para gestão de atendimento, CRM, disparos e automação via WhatsApp.
                </li>
                <li>
                  <strong>Usuário:</strong> pessoa física que acessa ou utiliza a plataforma, como operador, supervisor ou administrador.
                </li>
                <li>
                  <strong>Organização cliente:</strong> pessoa jurídica ou profissional que contrata a plataforma para uso de sua equipe.
                </li>
                <li>
                  <strong>Conta:</strong> credenciamento de acesso criado para a organização cliente e/ou seus usuários.
                </li>
                <li>
                  <strong>Leads ou contatos:</strong> pessoas cujos dados (nome, telefone, mensagens etc.) são inseridos na plataforma pelas organizações clientes para fins de atendimento ou relacionamento.
                </li>
              </ul>
            </Section>

            <Separator />

            <Section id="servico" title="3. Descrição do serviço">
              <p>
                O Optimus CRM oferece ferramentas de gestão de relacionamento, atendimento via WhatsApp, disparos de mensagens, pipeline, chatbot, relatórios e outras funcionalidades relacionadas, conforme disponibilizado em cada plano e momento.
              </p>
              <p>
                O serviço é destinado a organizações, profissionais e empresas que gerenciam relacionamentos comerciais. Não se destina a consumidores finais em suas relações de consumo pessoais e privadas.
              </p>
              <p>
                A funcionalidade de envio de mensagens ocorre por meio da integração com a WhatsApp Business Platform, sujeita às regras e disponibilidade da Meta.
              </p>
            </Section>

            <Separator />

            <Section id="cadastro" title="4. Cadastro, conta e acesso">
              <p>
                A criação e liberação de contas no Optimus CRM pode ser feita por meio de cadastro próprio ou pela equipe interna da plataforma. As organizações clientes e seus usuários são responsáveis pela veracidade, atualidade e legalidade dos dados fornecidos no cadastro.
              </p>
              <p>
                Cada usuário é responsável pela guarda e confidencialidade de suas credenciais de acesso. Quaisquer atividades realizadas na conta serão presumidamente atribuídas ao titular da conta ou à organização cliente, salvo comprovação de fraude ou falha de segurança não imputável ao usuário.
              </p>
              <p>
                O Optimus CRM pode recusar, suspender ou cancelar contas que apresentem dados falsos, incompletos ou que violem estes termos.
              </p>
            </Section>

            <Separator />

            <Section id="conduta" title="5. Regras de uso e conduta">
              <p>
                O uso da plataforma deve obedecer à legislação brasileira, às políticas da Meta/WhatsApp e às boas práticas de mercado. É proibido:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>enviar spam, mensagens não solicitadas ou práticas abusivas de comunicação;</li>
                <li>utilizar bases de contatos sem base legal ou consentimento quando exigido;</li>
                <li>disponibilizar, transmitir ou armazenar conteúdo ilícito, ofensivo, discriminatório, fraudulento ou que viole direitos de terceiros;</li>
                <li>realizar engenharia reversa, tentar violar a segurança do sistema ou acessar dados de outras contas sem autorização;</li>
                <li>sobrecarregar, prejudicar ou interromper a infraestrutura da plataforma;</li>
                <li>ceder, sublicenciar ou transferir o acesso à conta sem autorização prévia.</li>
              </ul>
            </Section>

            <Separator />

            <Section id="responsabilidade" title="6. Responsabilidades do cliente sobre os dados e mensagens">
              <p>
                A organização cliente é a responsável exclusiva pelo conteúdo das mensagens, campanhas, comunicações e dados de leads/contatos inseridos na plataforma.
              </p>
              <p>
                É de responsabilidade da organização cliente:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>obter, quando necessário, o consentimento e/ou base legal para o tratamento de dados pessoais dos leads;</li>
                <li>garantir a veracidade, licitude e atualidade das bases de contatos utilizadas;</li>
                <li>respeitar os direitos dos titulares dos dados (acesso, correção, eliminação, oposição etc.);</li>
                <li>cumprir as políticas da Meta/WhatsApp e a LGPD como controladora dos dados de seus leads.</li>
              </ul>
              <p>
                O Optimus CRM não se responsabiliza pelo conteúdo das comunicações enviadas pelas organizações clientes, nem pela legalidade das bases de dados utilizadas.
              </p>
            </Section>

            <Separator />

            <Section id="terceiros" title="7. Conformidade com políticas de terceiros">
              <p>
                O envio de mensagens via WhatsApp depende da integração com a WhatsApp Business Platform, operada pela Meta. O uso dessa funcionalidade está sujeito aos termos, políticas, diretrizes de uso aceitável e requisitos técnicos da Meta, incluindo, mas não se limitando, às políticas de mensagens comerciais e de uso da plataforma.
              </p>
              <p>
                O descumprimento das políticas da Meta pode resultar em bloqueios, limitações, banimentos de números ou contas de WhatsApp Business fora do alcance e responsabilidade direta do Optimus CRM. A plataforma pode tomar medidas internas (incluindo suspensão de recursos) para mitigar riscos, mas não garante a reversão de penalidades aplicadas por terceiros.
              </p>
            </Section>

            <Separator />

            <Section id="pagamento" title="8. Planos, pagamento e vigência">
              <p>
                A contratação dos planos do Optimus CRM, valores, condições de pagamento e renovação são informados no momento da contratação ou no painel da organização cliente. Em caso de inadimplência, a plataforma pode suspender, limitar ou encerrar o acesso até a regularização.
              </p>
              <p>
                A não utilização dos serviços não isenta a organização cliente de obrigações contratuais ou pagamentos já devidos, salvo disposição em contrário.
              </p>
            </Section>

            <Separator />

            <Section id="suspensao" title="9. Suspensão e encerramento">
              <p>
                O Optimus CRM pode suspender ou encerrar, parcial ou totalmente, o acesso de uma conta ou organização cliente nas seguintes hipóteses, sem prejuízo de outras medidas:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>violação destes Termos ou da Política de Privacidade;</li>
                <li>descumprimento de legislação aplicável ou de políticas de terceiros (Meta/WhatsApp);</li>
                <li>atividades fraudulentas, abusivas ou que comprometam a segurança da plataforma;</li>
                <li>inadimplência, quando aplicável;</li>
                <li>solicitação de encerramento pela organização cliente.</li>
              </ul>
              <p>
                O encerramento da conta não exime a organização cliente de responsabilidades por atos praticados durante a vigência do contrato.
              </p>
            </Section>

            <Separator />

            <Section id="propriedade" title="10. Propriedade intelectual">
              <p>
                Todos os direitos de propriedade intelectual sobre a plataforma, marca, software, códigos, layouts, textos, gráficos, bancos de dados e demais materiais relacionados são de titularidade exclusiva do Optimus CRM e/ou de seus licenciadores.
              </p>
              <p>
                A organização cliente e seus usuários recebem uma licença de uso limitada, não exclusiva, não transferível e revogável, pelo período de uso autorizado, apenas para os fins previstos nestes Termos.
              </p>
            </Section>

            <Separator />

            <Section id="limitacao" title="11. Isenções e limitação de responsabilidade">
              <p>
                O serviço é fornecido <strong>"no estado em que se encontra"</strong>, sem garantias de que atenderá a todas as necessidades específicas ou que estará disponível de forma ininterrupta, livre de erros, invasões ou falhas técnicas.
              </p>
              <p>
                Na extensão máxima permitida pela lei aplicável, o Optimus CRM não será responsável por danos indiretos, lucros cessantes, prejuízos comerciais ou perdas de dados decorrentes do uso ou da impossibilidade de uso do serviço, exceto em caso de dolo ou culpa grave comprovada.
              </p>
              <p>
                O Optimus CRM não se responsabiliza por bloqueios, banimentos, limitações ou outras penalidades aplicadas pela Meta, provedores de telecomunicações ou terceiros sobre números de WhatsApp e contas de WhatsApp Business.
              </p>
            </Section>

            <Separator />

            <Section id="disponibilidade" title="12. Disponibilidade e alterações do serviço">
              <p>
                O Optimus CRM empreza esforços para manter o serviço disponível, mas pode realizar manutenções programadas, corrigir falhas, atualizar funcionalidades e modificar o escopo do serviço conforme a evolução da plataforma. Alterações relevantes serão comunicadas por meio disponível aos usuários ou organizações clientes.
              </p>
              <p>
                Funcionalidades podem ser adicionadas, modificadas ou descontinuadas, observando o plano contratado e o comunicado prévio quando exigido.
              </p>
            </Section>

            <Separator />

            <Section id="alteracoes" title="13. Alterações dos termos">
              <p>
                Estes Termos podem ser atualizados a qualquer momento para refletir mudanças legislativas, regulamentares, comerciais ou na operação da plataforma. A data da última revisão será sempre indicada no topo desta página. O uso continuado da plataforma após alterações implica na aceitação dos novos termos.
              </p>
            </Section>

            <Separator />

            <Section id="legislacao" title="14. Legislação aplicável e foro">
              <p>
                Estes Termos são regidos pela legislação da República Federativa do Brasil. Quaisquer controvérsias decorrentes do uso da plataforma serão dirimidas no foro da comarca do domicílio da parte requerida, salvo competência legal diversa.
              </p>
            </Section>

            <Separator />

            <Section id="contato" title="15. Contato">
              <p>
                Para dúvidas, solicitações ou comunicações sobre estes Termos, entre em contato com o Optimus CRM pelo e-mail:
              </p>
              <p className="text-base">
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-primary hover:underline font-medium"
                >
                  {CONTACT_EMAIL}
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
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <Link
                  to="/politica-de-privacidade"
                  className="hover:text-foreground transition-colors"
                >
                  Política de Privacidade
                </Link>
                <Link
                  to="/exclusao-de-dados"
                  className="hover:text-foreground transition-colors"
                >
                  Exclusão de Dados
                </Link>
                <Link
                  to="/auth"
                  className="hover:text-foreground transition-colors"
                >
                  Entrar
                </Link>
              </div>
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
