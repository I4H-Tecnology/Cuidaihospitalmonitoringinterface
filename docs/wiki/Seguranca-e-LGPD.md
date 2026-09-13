# Segurança e LGPD

Referência: RFC seção 6.1 (Privacidade e LGPD), RNF01 a RNF06, RNF18, RNF19, RN01 a RN09.

## Autenticação: JWT emitido no login

Toda rota protegida exige `Authorization: Bearer` com o token que `POST /api/auth/login` emite (RNF01, RN01). O token carrega usuário, clínica e papel, vale 8 horas (`TOKEN_HORAS`) e é assinado com `SECRET_KEY`, que **não tem valor padrão**: chave com padrão é chave publicada, e o backend se recusa a subir sem ela. Código em `backend/app/seguranca.py`.

O servidor não confia só no que o token diz: relê o usuário no banco a cada chamada. Sem isso, uma conta desativada ou rebaixada seguiria com o acesso antigo até o token expirar.

**Senha.** Hash bcrypt gerado pelo `pgcrypto` dentro do Postgres. Usuário inexistente e senha errada devolvem a mesma mensagem, para não entregar a existência da conta. Cinco tentativas erradas bloqueiam pelo tempo da política.

**Limitação assumida.** O token fica em `localStorage` por compatibilidade com o resto do frontend; o correto é cookie `httpOnly`, imune a XSS, e isso pertence ao backend definitivo. Está documentado em `frontend/src/app/data/api.ts`. Sem refresh token, sem revogação (logout só descarta no cliente) e sem rate limit no login.

## Autorização: RBAC conferido no servidor

A permissão é conferida na API contra o perfil gravado no banco (RNF02, RF04, RN02). O que o cliente acha que pode fazer é irrelevante: `exigir_permissao(modulo, acao)` lê `perfil.permissoes` e devolve 403 se a ação não estiver liberada. O frontend também tem o mapa tela → módulo (`frontend/src/app/data/rbac.ts`), mas ali é conveniência de interface, não controle.

Perfis e módulos em [[Modelo de dados]]. A conta de máquina do serviço de visão tem perfil SYSTEM com `monitoring: create` e sem `edit`: pode reportar queda, não pode mexer no parque de câmeras. Se a credencial vazar, o estrago possível é criar alerta falso.

## Isolamento por clínica

O tenant sai do token, nunca do parâmetro. `exigir_tenant` compara o `tenantId` pedido com o do token e devolve **404**, não 403: confirmar que a outra clínica existe já é informação. A mesma resposta vale para "não existe" e "é de outra clínica" em câmeras, ocorrências e clipes.

O WebSocket de alertas autentica pela **primeira mensagem**, não pela query string: token na URL acaba no log de acesso do servidor, no histórico do navegador e no cabeçalho Referer. O tenant do canal também sai do token.

## Retenção de vídeo: 24 horas

RNF05, RN08 e RN09, com a RFC 6.1: imagens e vídeos ficam no máximo 24 horas e são excluídos automaticamente, mantendo só os dados essenciais da ocorrência.

Como está implementado:

- O serviço de visão grava um clipe de 10 s por ocorrência, com os quadros anotados, em `visao/dados/clipes/`. Não grava fluxo contínuo.
- O expurgo roda no boot e de hora em hora, no serviço de visão **e** na API, para a retenção valer mesmo com um dos dois fora do ar. A retenção acima de 24 h é recusada na subida da configuração.
- A API serve o clipe em `GET /api/ocorrencias/{id}/clipe` só para usuário autenticado da clínica dona: 401 sem token, 404 de outra clínica. O frontend busca o vídeo com o token e o exibe por URL de objeto; a tag `<video>` nunca aponta para uma rota aberta.
- Depois das 24 h a rota devolve 404 e a ocorrência continua no histórico (RNF18). A tela diz "vídeo expurgado", não "erro".
- Clipes, vídeos encenados e cache de features estão no `.gitignore`: são imagens de pessoas, e imagem de pessoa não entra em repositório, privado ou não.

## O que o repositório nunca contém

- `.env` (só `.env.example`, com campos vazios). `SECRET_KEY` e `POSTGRES_PASSWORD` não têm padrão.
- Senha de usuário: o seed não cria usuários; o primeiro administrador e a conta de serviço vêm de scripts que geram o hash no banco.
- Vídeo ou imagem de pessoa: pastas ignoradas; o único frame versionado é uma amostra de diagnóstico da webcam.
- Dados pessoais reais: o seed tem um paciente fictício com nome inventado.

## Trilha de auditoria

`log_acesso` registra ação, resultado, IP e agente, de um profissional ou de um acompanhante, nunca de nenhum dos dois (RNF06, RF29). A API grava e expõe a trilha em `/api/access-logs`. O encerramento de ocorrência como falso positivo é registrado em log para realimentar a análise da IA (RN14): é a única fonte de rótulo vinda da operação real.

## O que a RFC prevê e ainda não existe

A geração e a validação do acesso do acompanhante por QR Code com termo de confidencialidade (RF25 a RF27, RN03 a RN06) estão modeladas no banco (`acompanhante`, `termo_confidencialidade`, com token como hash e expiração obrigatória) e sem rota na API. A revogação automática na alta do paciente (RF28, RN07) já está implementada em `rotas/pacientes.py`. HTTPS (RNF03) é responsabilidade do proxy na implantação; o compose local roda em HTTP.

## Visibilidade do repositório

O repositório é privado, por decisão tratada e aprovada com o orientador da disciplina. Nenhum componente do projeto depende de visibilidade: o CI, a análise estática, a observabilidade e esta Wiki funcionam em repositório privado, e o acesso do avaliador é o mesmo convite que dá acesso ao código. A seção 5.6 e o RNF20 da RFC, que afirmam repositório público, precedem essa decisão e ficam sujeitos a errata na próxima revisão da RFC.

## Princípio operacional

O sistema não emite diagnóstico médico (RN16) e não substitui a verificação presencial da enfermagem (RN17, RN18). O alerta é de risco operacional, e a classificação final do que aconteceu é sempre humana (RF20).
