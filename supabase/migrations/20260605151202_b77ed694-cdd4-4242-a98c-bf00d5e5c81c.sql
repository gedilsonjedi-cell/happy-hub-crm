-- Restaura SELECT nas colunas sensíveis de channels e auto_recharge_config
-- para o role `authenticated`. O REVOKE anterior quebrou o envio de mensagens
-- (meta-send, zapi-send, gupshup-send etc.) porque essas funções leem o canal
-- com o JWT do usuário. A proteção real continua sendo a RLS, que isola por
-- organization_id — usuários autenticados só conseguem ler canais da própria org.

GRANT SELECT ON public.channels TO authenticated;
GRANT SELECT ON public.auto_recharge_config TO authenticated;