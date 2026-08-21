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
  { id: "introducao", label: "Introdução" },
  { id: "quem-solicita", label: "Quem pode solicitar" },
  { id: "como-solicitar", label: "Como solicitar a exclusão" },
  { id: "prazo", label: "Prazo de atendimento" },
  { id: "exclusao-excecoes", label: "O que é excluído e exceções" },
  { id: "autoatendimento", label: "Exclusão via autoatendimento" },
  { id: "confirmacao", label: "Confirmação" },
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

export default function DataDeletion() {
  const { theme } = useTheme();
  const logo = theme === "dark" ? optimusLogoLight : optimusLogoDark;

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <Helmet>
        <title>Exclusão de Dados do Usuário - Optimus CRM</title>
        <meta
          name="description"
          content="Instruções para solicitar a exclusão de dados pessoais tratados pelo Optimus CRM, em conformidade com a LGPD e os requisitos da Meta/WhatsApp."
        />
        <link rel="canonical" href={`${SITE_ORIGIN}/exclusao-de-dados`} />
        <meta property="og:title" content="Exclusão de Dados do Usuário - Optimus CRM" />
        <meta
          property="og:description"
          content="Saiba como solicitar a exclusão de dados pessoais e de leads no Optimus CRM."
        />
        <meta property="og:url" content={`${SITE_ORIGIN}/exclusao-de-dados`} />
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
                to="/termos-de-uso"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Termos
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
              Exclusão de Dados do Usuário
            </h1>
            <p className="text-sm text-muted-foreground">
              Última atualização: <strong className="text-foreground">{LAST_UPDATED}</strong>
            </p>
          </div>

          {/* Summary / Table of contents */}
          <nav
            aria-label="Sumário das instruções de exclusão de dados"
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
            <Section id="introducao" title="1. Introdução">
              <p>
                Esta página descreve o procedimento para solicitar a exclusão de dados pessoais tratados pela plataforma <strong>Optimus CRM</strong>, em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 – LGPD) e com os requisitos da Meta/WhatsApp para aplicações que integram a WhatsApp Business Platform.
              </p>
              <p>
                A privacidade e o controle dos dados pessoais são compromissos do Optimus CRM. Caso você deseje que seus dados sejam excluídos, ou que uma organização cliente exclua dados de leads por meio da plataforma, siga as instruções abaixo.
              </p>
            </Section>

            <Separator />

            <Section id="quem-solicita" title="2. Quem pode solicitar">
              <p>
                <strong>Titulares de dados dos usuários do sistema:</strong> o próprio usuário (operador, supervisor, administrador ou responsável) pode solicitar a exclusão de sua conta e de seus dados pessoais associados.
              </p>
              <p>
                <strong>Titulares de dados de leads/contatos:</strong> no caso de dados de pessoas cujas informações são inseridas na plataforma pelas organizações clientes (leads), a solicitação pode ser feita diretamente pela organização cliente que atua como <strong>controladora</strong> desses dados, ou pelo próprio titular, que deve entrar em contato com a organização cliente responsável.
              </p>
              <p>
                <strong>Papel do Optimus CRM:</strong> em relação aos dados de leads e contatos, o Optimus CRM atua como <strong>operador</strong> de tratamento, ou seja, realiza o tratamento dos dados por instrução das organizações clientes. Por isso, a exclusão definitiva de dados de leads pode depender ou ser intermediada pela organização cliente controladora.
              </p>
            </Section>

            <Separator />

            <Section id="como-solicitar" title="3. Como solicitar a exclusão">
              <p>Para solicitar a exclusão de dados pessoais, siga o passo a passo:</p>
              <ol className="list-decimal pl-5 space-y-2">
                <li>
                  <strong>Envie um e-mail:</strong> escreva para{" "}
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="text-primary hover:underline font-medium"
                  >
                    {CONTACT_EMAIL}
                  </a>{" "}
                  com o assunto <strong>"Exclusão de Dados"</strong>.
                </li>
                <li>
                  <strong>Informe sua identificação:</strong> inclua nome completo, e-mail e/ou telefone associados à sua conta ou ao registro em questão.
                </li>
                <li>
                  <strong>Descreva o escopo da exclusão:</strong> informe o que deseja excluir. Exemplos: exclusão total da conta de usuário, remoção de dados específicos de um lead, ou anonimização de histórico de atendimento.
                </li>
                <li>
                  <strong>Verificação de identidade:</strong> para proteger o titular contra solicitações fraudulentas, poderemos solicitar uma comprovação de identidade antes de efetivar a exclusão.
                </li>
              </ol>
            </Section>

            <Separator />

            <Section id="prazo" title="4. Prazo de atendimento">
              <p>
                As solicitações de exclusão de dados serão processadas e respondidas dentro dos prazos previstos na LGPD, normalmente em até <strong>15 (quinze) dias</strong> contados da confirmação do pedido.
              </p>
              <p>
                Esse prazo pode ser prorrogado em casos específicos, mediante justificativa formal e comunicação prévia ao solicitante, especialmente quando for necessário verificar a identidade do titular ou quando houver impedimento legal para a exclusão imediata.
              </p>
            </Section>

            <Separator />

            <Section id="exclusao-excecoes" title="5. O que é excluído e exceções">
              <p>
                Serão excluídos os dados pessoais que não sejam mais necessários às finalidades originais do tratamento ou aos interesses legítimos do Optimus CRM, exceto nos seguintes casos de exceção legal:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <strong>Obrigações legais ou regulatórias:</strong> dados que devam ser mantidos para cumprimento de obrigações fiscais, trabalhistas, previdenciárias ou contratuais.
                </li>
                <li>
                  <strong>Defesa de direitos em processos:</strong> dados necessários para exercer direitos em processos judiciais, administrativos ou arbitrais.
                </li>
                <li>
                  <strong>Legítimo interesse:</strong> dados cuja eliminação possa comprometer a segurança, integridade ou regularidade do serviço, conforme permitido pela lei.
                </li>
              </ul>
              <p>
                Nesses casos, os dados serão mantidos pelo período legal ou necessário e, em seguida, eliminados ou anonimizados de forma segura.
              </p>
            </Section>

            <Separator />

            <Section id="autoatendimento" title="6. Exclusão via autoatendimento">
              <p>
                Dentro da própria plataforma, usuários com permissões adequadas (administradores, supervisores ou operadores autorizados) podem excluir determinados registros diretamente, como leads, mensagens, anotações, etiquetas e campos personalizados.
              </p>
              <p>
                Para a <strong>exclusão total da conta de usuário</strong> ou para solicitar a eliminação de dados em escala ou de forma irreversível, é necessário utilizar o canal de e-mail indicado nesta página, conforme o passo a passo descrito na seção "Como solicitar a exclusão".
              </p>
            </Section>

            <Separator />

            <Section id="confirmacao" title="7. Confirmação">
              <p>
                Após a conclusão do processo de exclusão, o Optimus CRM enviará uma confirmação ao solicitante por e-mail, informando que a solicitação foi atendida ou, quando aplicável, explicando os motivos de retenção parcial de dados com base em exceções legais.
              </p>
            </Section>

            <Separator />

            <Section id="contato" title="8. Contato">
              <p>
                Para dúvidas, solicitações de exclusão de dados ou para exercer seus direitos como titular, entre em contato conosco pelo e-mail:
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
                  to="/termos-de-uso"
                  className="hover:text-foreground transition-colors"
                >
                  Termos de Uso
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
