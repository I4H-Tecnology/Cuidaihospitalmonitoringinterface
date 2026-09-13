# Decisões técnicas

As escolhas que o projeto precisa defender, cada uma com a seção da RFC que a motiva e com o lugar do código onde ela está. É a página da prova de autoria.

## 1. Camada de regras, não rede neural

**RFC 5.5**: "camada de regras / classificador leve" sobre modelos pré-treinados.

Três razões, e as três valem sozinhas. A RFC já decidiu isso, e mudar agora exigiria emendar um documento entregue. Cada um dos sete limiares é defensável em voz alta com uma frase (ver [[Serviço de visão|Servico-de-visao]]); num LSTM seriam pesos que ninguém inspeciona. E "resultados aleatórios ou não replicáveis" reprova direto nesta linha: uma rede treinada em 20 vídeos encenados teria variância alta, e a camada de regras dá o mesmo resultado toda vez.

O trade-off é assumido: a direction lista "modelo próprio" como diferencial, e o projeto abre mão dele em troca de replicabilidade e explicabilidade. Se sobrar tempo depois das métricas, o caminho é um classificador leve (árvore ou regressão logística) sobre as mesmas cinco features, que continua inspecionável. Código em `visao/app/regras.py`.

## 2. Modelos pré-treinados: YOLOv8n e MediaPipe Pose

**RFC 5.5**: "modelos pré-treinados com ajuste fino, em vez de treinamento do zero".

O `n` (nano) é proposital: roda em CPU a taxa útil e o problema é achar uma pessoa inteira em cena, não distinguir raças de cachorro. O MediaPipe trabalha sobre o recorte de **uma** pessoa; é o YOLO com ByteTrack que resolve várias pessoas em cena e mantém a identidade entre quadros, sem a qual não existe análise temporal, só detecção de "pessoa deitada". Código em `visao/app/deteccao.py` e `visao/app/pose.py`.

## 3. Features invariantes a escala, aprendendo a altura de pé em execução

**RN10**: alteração brusca de postura, perda de verticalidade, permanência anormal no chão.

Nenhuma medida em pixel serve de limiar fixo, então toda feature é adimensional ou normalizada pelo corpo da própria pessoa. A altura de pé não dá para saber a priori: é aprendida pelo percentil 90 das alturas vistas (não o máximo, refém de um quadro esticado por ruído), e o classificador só começa depois de 8 quadros, porque antes disso "a razão de altura mente, e mentir cedo é pior do que calar". Código em `visao/app/caracteristicas.py`.

## 4. Declarar quando não consegue classificar

Não há requisito que peça isto; é a decisão mais importante do serviço. Se a pose não mostra ombros e quadris, o sistema expõe o motivo (`impedimento`) em vez de responder "normal". Um monitor que falha calado é pior que um que não existe, e um clipe não avaliável fica fora da matriz de confusão em vez de virar verdadeiro negativo. Código em `visao/app/pipeline.py` e `visao/app/avaliacao.py`.

## 5. A ocorrência nasce ao permanecer, não ao cair

**RN10** ("permanência anormal no chão") e **RN11**.

Entrar no estado CAIDO não gera ocorrência; permanecer 3 s gera. É a diferença entre "deitou" e "caiu e não levantou". O instante gravado é o em que a pessoa chegou ao chão, e ele entra na chave de deduplicação: reenviar o mesmo tombo não cria dois alertas. Código em `visao/app/regras.py` e `visao/app/publicador.py`.

## 6. Ocorrência e alerta na mesma transação; deduplicação por chave

**RF13, RF14, RF15, RNF16.**

Meio caminho seria o pior estado possível: um evento gravado que nunca notifica ninguém. A chave do evento (câmera, pessoa rastreada, instante) é chave primária de `stub_evento_publicado`; reenviar devolve o id antigo. O envio para o WebSocket acontece fora da transação, para nunca anunciar o que um rollback ainda poderia desfazer. Código em `backend/app/rotas/ocorrencias.py`.

## 7. WebSocket para o alerta, com polling lento como rede de segurança

**RNF07, RNF08**: alerta em até 5 s, sem recarregar a página.

Polling a cada 15 s não cumpre 5 s; a cada 1 s desperdiça banco. WebSocket resolve os dois; o polling de 20 s fica porque conexão de clínica cai e proxy derruba socket ocioso, e um alerta perdido nesse intervalo é um paciente no chão sem atendimento. Medido em 250 ms do registro ao painel. Código em `backend/app/alertas.py` e `frontend/src/app/data/useAlertas.ts`.

## 8. "Conectada" é derivada do último ping, não escrita

**RF30, RN15, RNF17.**

Coluna de status precisa de alguém para escrevê-la quando o dispositivo cai, e câmera que cai não avisa. Derivar de `ultimo_ping` nos últimos 90 s torna o dado verdadeiro por construção. O complemento veio depois: o serviço só pinga enquanto há quadro capturado, senão um processo vivo com a câmera morta manteria "conectada" no painel, a mentira silenciosa. Código em `backend/app/rotas/cameras.py` e `visao/app/publicador.py`.

## 9. A thread do pipeline não morre

**RNF16, RNF17.**

Backoff exponencial de 1 s a 60 s: insistir a cada segundo contra uma câmera que reinicia só atrasa o reboot dela; esperar um minuto fixo deixa o monitoramento cego por um minuto a mais que o necessário. O estado (`reconectando`, tentativa, próxima espera, erro cru) é exposto, não só logado, e o painel distingue serviço fora do ar de câmera fora do ar, porque os dois pedem ações diferentes. Código em `visao/app/servidor.py`.

## 10. RBAC no servidor, tenant no token, 404 em vez de 403

**RNF01, RNF02, RN01, RN02.**

Controle de acesso no cliente não é controle, é sugestão: quem chama a API direto ignora a interface inteira. A permissão é lida do perfil no banco a cada chamada; o tenant vem do token, nunca do parâmetro; recurso de outra clínica devolve 404, porque confirmar que ela existe já é informação. Código em `backend/app/seguranca.py`.

## 11. O serviço de visão autentica como um usuário

Reaproveitar o login humano custa menos código e abre menos superfície do que um token estático de máquina sem prazo de validade. A conta tem perfil SYSTEM com o mínimo: ler o cadastro da própria câmera e registrar ocorrência. Código em `visao/app/publicador.py` e `db/scripts/criar-servico-visao.sql`.

## 12. Regras de negócio como constraint

**RFC 2.5 e 5.2.**

A API é um andaime que será substituído; o esquema é o que sobrevive. O 1:1 entre ocorrência e alerta é um UNIQUE, os cinco status da RN11 são um CHECK, o log de acesso tem exatamente um ator. Código em `db/init/01_schema.sql`.

## 13. Clipe de 10 s, não fluxo contínuo; expurgo em dois lugares

**RNF05, RN08, RN09, RNF18.**

Gravar só 5 s antes e 5 s depois de cada ocorrência é a evidência mínima que o Demo Day e a auditoria precisam, sem armazenar rotina de pessoas. O expurgo roda na visão e na API para a retenção valer mesmo com um dos dois fora do ar, e a retenção acima de 24 h é recusada na subida. O clipe só sai por rota autenticada da clínica dona. Código em `visao/app/clipes.py` e `backend/app/clipes.py`.

## 14. Nenhum número inventado na interface

A direction reprova "resultados aleatórios ou não replicáveis". O produto tinha um assistente de IA com previsões sorteadas, um chatbot que era dicionário de strings e um card "Precisão da IA 94,2%" sem medição. Tudo saiu; o card virou "Detecção de Quedas, precisão e recall ainda não medidos", até o arnês produzir número. Ver [[Validação do modelo|Validacao-do-modelo]].

## 15. Vídeos encenados, fora do Git

**RFC 5.5**, justificativa de LGPD.

Imagens reais de pacientes idosos são inviáveis no escopo acadêmico. Os clipes encenados cobrem os cenários-alvo; só as anotações são versionadas, porque imagem de pessoa não entra em repositório, privado ou não. Limitação reconhecida: dados encenados não capturam toda a variabilidade de quedas reais.

## 16. Análise estática, CI e observabilidade sem serviço externo

**RFC 5.6**, núcleo comum da disciplina.

GitHub Actions roda typecheck, testes dos dois lados, build e, no job `seguranca`, Semgrep (segurança em Python e TypeScript, segredos), Bandit (Python) e as auditorias de dependência (`pip-audit`, `npm audit`) a cada push, com os relatórios como artefato. A direction cita SonarQube, SonarCloud e CodeClimate como exemplos; o requisito é "análise estática de código e segurança", e ferramentas que rodam dentro do CI o cumprem sem conta, sem token e sem depender da visibilidade do repositório. A observabilidade é um endpoint honesto por serviço mais uma tela, sem Prometheus ou Grafana: para um MVP acadêmico, infraestrutura que ninguém sobe no dia da apresentação é pior que ausência. Ver [[Observabilidade]].

## 17. Repositório privado

O repositório é privado, por decisão tratada e aprovada com o orientador da disciplina. Nada no projeto depende de visibilidade (ver [[Segurança e LGPD|Seguranca-e-LGPD]]). A seção 5.6 e o RNF20 da RFC afirmam repositório público e precedem a decisão: a saída limpa é uma errata na RFC quando ela for revisada com as métricas da validação; até lá, este registro é a fonte.
