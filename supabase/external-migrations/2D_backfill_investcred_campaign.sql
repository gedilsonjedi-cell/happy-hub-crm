-- ============================================================================
-- Backfill ESCOPADO: campanha "gov sp 14.05" (Investcred)
-- Canal: 48fdd325-27a7-496c-9889-0a677e76a415
-- Org:   2dbf06da-8069-4de8-807e-693a97d44c78
-- 272 destinatários — usa lista fixa de sufixos para varredura rápida.
-- COLE NO SQL EDITOR DO BANCO EXTERNO.
-- ============================================================================

WITH suffixes(suf) AS (
  SELECT unnest(ARRAY[
    '15143069','30088598','33650175','33889722','34471454','34607059','39071606','40051374','40180713','40223640',
    '40664373','41677793','42035302','42721607','44694153','45299560','45835709','45992862','46116685','47035682',
    '47065905','47531144','47558956','47624554','47656849','47674976','47694394','47820177','47964843','48385046',
    '50258897','51491150','52426542','56083904','56835246','58107202','59227218','59793092','60234081','60582984',
    '60711144','60755967','60766784','63713599','67366511','67684239','69115984','70791274','71187841','72037702',
    '72460267','73942765','74023477','74024834','74029510','74041829','74577833','74887979','75157029','75323396',
    '75613237','75908563','76313367','76325478','76344834','76874598','79636460','79939497','80134302','80301282',
    '80434846','80591727','80759237','80862394','81047192','81067000','81097858','81161416','81182598','81221709',
    '81335036','81383802','81422693','81471858','81595514','81707319','81716112','81732816','81825793','81863111',
    '81949422','81968010','81996239','82040227','82430768','82579342','82606473','82653496','82677615','82809549',
    '83009225','83221215','84160801','84276730','84413012','84464944','84611870','84682563','84790398','84822068',
    '85431715','85736153','86096729','86114445','86197534','86838317','87889911','88000271','88107002','88108802',
    '88159443','88271207','88416554','88706025','88902287','88972000','88981706','89126013','89601046','89732360',
    '89829462','91047483','91051417','91071770','91083451','91172636','91205688','91222250','91226292','91239337',
    '91248832','91304167','91319383','91370998','91384920','91412338','91457015','91464900','91513430','91538989',
    '91549858','91555523','91571546','91573322','91587229','91597657','91618652','91738402','91777428','91850977',
    '91873531','91906878','91921454','91943638','91943794','92149598','92152539','92219121','92247812','92313188',
    '92338869','92430432','92533658','92624296','92746608','92940584','93300523','93387535','93735273','93778080',
    '93908686','94319771','94427690','94497739','94576916','94668010','94987144','95280946','95491299','95785596',
    '95820147','95828656','95845695','95890314','96005153','96009122','96022748','96038519','96050502','96087475',
    '96217747','96227286','96261161','96261585','96291131','96293189','96293797','96343294','96349435','96434448',
    '96440955','96453913','96473291','96522344','96689373','96800214','96950936','96965069','97008899','97064613',
    '97152951','97158120','97186076','97199773','97202644','97205101','97246369','97268856','97278239','97347609',
    '97376717','97378255','97392555','97397543','97436633','97443161','97460479','97506344','97516732','97572743',
    '97643618','97693235','97702054','97711815','97716902','97733644','97743060','97772174','97854459','97875020',
    '97909498','97948784','97987977','97999096','98020721','98099345','98178280','98179162','98217534','98237550',
    '98331260','98375886','98512850','98883131','98937201','98997255','99182498','99430699','99603441','99720977',
    '99827851','99949019'
  ])
),
-- Última mensagem inbound de cada destinatário no canal Investcred
last_inbound AS (
  SELECT DISTINCT ON (right(regexp_replace(m.sender_phone,'\D','','g'),8))
    right(regexp_replace(m.sender_phone,'\D','','g'),8) AS suf,
    m.sender_phone,
    m.content,
    m.created_at,
    m.sender_name,
    COALESCE(m.is_read, false) AS is_read
  FROM whatsapp_messages m
  JOIN suffixes s ON s.suf = right(regexp_replace(m.sender_phone,'\D','','g'),8)
  WHERE m.channel_id = '48fdd325-27a7-496c-9889-0a677e76a415'
    AND m.direction = 'inbound'
    AND m.created_at >= '2026-05-14 17:00:00+00'
  ORDER BY right(regexp_replace(m.sender_phone,'\D','','g'),8), m.created_at DESC
),
-- 1) REABRIR conversas arquivadas que receberam resposta
reopened AS (
  UPDATE conversation_assignments ca
  SET status = 'pending', updated_at = now()
  FROM last_inbound li
  WHERE ca.organization_id = '2dbf06da-8069-4de8-807e-693a97d44c78'
    AND ca.channel_id = '48fdd325-27a7-496c-9889-0a677e76a415'
    AND right(ca.conversation_phone, 8) = li.suf
    AND ca.status = 'archived'
  RETURNING ca.id
),
-- 2) CRIAR assignment para quem respondeu mas não tem linha
inserted_assign AS (
  INSERT INTO conversation_assignments (organization_id, channel_id, conversation_phone, status)
  SELECT
    '2dbf06da-8069-4de8-807e-693a97d44c78',
    '48fdd325-27a7-496c-9889-0a677e76a415',
    li.sender_phone,
    'pending'
  FROM last_inbound li
  WHERE NOT EXISTS (
    SELECT 1 FROM conversation_assignments ca
    WHERE ca.organization_id = '2dbf06da-8069-4de8-807e-693a97d44c78'
      AND ca.channel_id = '48fdd325-27a7-496c-9889-0a677e76a415'
      AND right(ca.conversation_phone, 8) = li.suf
  )
  ON CONFLICT (channel_id, conversation_phone) DO NOTHING
  RETURNING id
),
-- 3) CRIAR conversation_stats faltando
stats_inserted AS (
  INSERT INTO conversation_stats (
    assignment_id, channel_id, conversation_phone, organization_id,
    last_message_content, last_message_at, last_inbound_at,
    unread_count, sender_name, updated_at
  )
  SELECT
    ca.id, ca.channel_id, ca.conversation_phone, ca.organization_id,
    li.content, li.created_at, li.created_at,
    CASE WHEN li.is_read = false THEN 1 ELSE 0 END,
    li.sender_name, now()
  FROM conversation_assignments ca
  JOIN last_inbound li
    ON ca.channel_id = '48fdd325-27a7-496c-9889-0a677e76a415'
   AND right(ca.conversation_phone,8) = li.suf
  LEFT JOIN conversation_stats cs ON cs.assignment_id = ca.id
  WHERE ca.organization_id = '2dbf06da-8069-4de8-807e-693a97d44c78'
    AND cs.id IS NULL
  ON CONFLICT (assignment_id) DO NOTHING
  RETURNING assignment_id
)
SELECT
  (SELECT count(*) FROM last_inbound) AS clientes_que_responderam,
  (SELECT count(*) FROM reopened)      AS reabertas,
  (SELECT count(*) FROM inserted_assign) AS assignments_criados,
  (SELECT count(*) FROM stats_inserted)  AS stats_criadas;
