# Modelo de dados

Referência: RFC seção 5.2 (Modelo de Dados, 12 entidades) e 2.5 (Regras de Negócio). O esquema está em `db/init/01_schema.sql`; cada constraint cita em comentário a regra que implementa.

## Princípio: a regra vive no banco, não só na aplicação

O banco recusa dado inválido mesmo que a API esqueça de validar. Não é redundância: a API é um andaime que será substituído, e o esquema é o que sobrevive. Uma regra que só existe no código da API some junto com ele.

## As 12 entidades

| Entidade | O que é | Regras que ela carrega |
|---|---|---|
| `clinica` | o tenant; tudo abaixo é escopado por ela | slug validado por regex; é o identificador que o frontend usa na URL |
| `perfil` | RBAC, permissões em JSONB (módulo → ações) | perfil global tem `clinica_id` nulo; índice único trata nulo como valor para não duplicar nome |
| `usuario` | profissional do sistema | RN01; e-mail e login únicos **dentro** da clínica, case-insensitive; `senha_hash` nunca reversível; bloqueio por tentativas |
| `ambiente` | quarto, corredor, sala | nome único por clínica; tipo restrito por CHECK |
| `camera` | dispositivo de captura | RN15; `ultimo_ping` é o que decide "conectada" (ver abaixo) |
| `paciente` | idoso monitorado | alta sem data, ou anterior à admissão, é recusada |
| `ocorrencia` | evento detectado pela IA | RN10 (tipos de evento), RN11 (os cinco status, nada além), RN14; `confianca` entre 0 e 1; encerrada exige `encerrada_em` |
| `alerta` | notificação da ocorrência, 1:1 | UNIQUE em `ocorrencia_id` é o que faz o 1:1 valer no banco; RN12: `ciente` exige `ciencia_em` |
| `atendimento` | resposta do profissional | RN13, RN17; fim nunca antes do início |
| `acompanhante` | familiar autorizado | RN05 a RN07: exatamente um paciente, token individual (guardar como hash), `expira_em` obrigatório, some com o paciente |
| `termo_confidencialidade` | aceite do acompanhante | RN04; guarda versão, instante e IP do aceite |
| `log_acesso` | trilha de auditoria | RNF06, RF29; um registro é de um profissional **ou** de um acompanhante, nunca dos dois nem de nenhum |

Toda tabela com `updated_at` usa o mesmo gatilho `set_updated_at()`.

## Três decisões que valem explicar

**"Conectada" não é uma coluna.** `camera.status` existe, mas o painel não lê dela: deriva de `ultimo_ping > now() - 90 s` na consulta (`backend/app/rotas/cameras.py`). Uma coluna de status precisa de alguém para escrevê-la quando o dispositivo cai, e câmera que cai não avisa. Derivar do último sinal de vida torna o dado verdadeiro por construção, sem job de varredura. O serviço de visão só pinga enquanto há quadro capturado, então a câmera morta aparece desconectada em até 90 s. Ver [[Decisões técnicas|Decisoes-tecnicas]].

**Vídeo não entra no banco.** Pela RN08, RN09 e RNF05, imagens e vídeos ficam no máximo 24 h e depois somem, ficando só os dados da ocorrência (RNF18). Esse dado vive em disco, no serviço de visão, com expurgo próprio; a `ocorrencia` guarda o registro permanente. Ver [[Segurança e LGPD|Seguranca-e-LGPD]].

**Duas tabelas fora do DER.** O andaime cria `stub_politica_seguranca` (política de senha) e `stub_evento_publicado` (chave de idempotência da ocorrência) na subida, com o prefixo `stub_` de propósito: são necessidades do backend atual que a RFC não modelou, e ficam fora de `db/init/` para o esquema continuar espelhando o diagrama. O backend definitivo decide onde isso mora.

## Perfis e permissões

`db/init/02_perfis.sql` cria os perfis globais (ADMIN, MANAGER, NURSE e os demais que o frontend conhece) com a matriz por módulo, nos 14 módulos, inclusive os negados. É idempotente: serve de init num volume novo e de reparo num banco existente. Duas regras que o arquivo existe para respeitar: o nome do perfil precisa estar na união `Role` do frontend, e o formato é `{"modulo": {"view": true, ...}}`, que é o que `exigir_permissao` lê no servidor. Os módulos fora do MVP (RFC 2.6) não são concedidos a ninguém.

## Seed

`db/init/03_seed.sql` cria uma clínica de demonstração com quatro ambientes, uma câmera por ambiente e um paciente fictício. **Não cria usuários**: senha exige hash real gerado pelo backend, e credencial versionada não entra no repositório. O primeiro administrador vem de `db/scripts/criar-admin.sql`; a conta de máquina do serviço de visão, de `db/scripts/criar-servico-visao.sql`.
