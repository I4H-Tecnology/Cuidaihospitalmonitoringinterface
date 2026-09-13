# Observabilidade

Item obrigatório do núcleo comum: *monitoramento ou observabilidade da solução em execução*. A RFC 5.6 prevê "observabilidade (logs e monitoramento de status dos serviços)". O que existe é o suficiente para saber como o sistema está sem abrir o código nem a máquina, e nada além: sem Prometheus, Grafana ou agente de APM, que num MVP acadêmico viram infraestrutura que ninguém sobe no dia da apresentação.

## Onde olhar

| Fonte | Endereço | Autenticação | O que diz |
|---|---|---|---|
| Tela **Saúde do Sistema** | menu SISTEMA, no dashboard | login (módulo `monitoring`) | junta as duas fontes abaixo, atualizando a cada 2 a 5 s |
| API | `GET /api/saude?tenantId=` | token | banco (ok e latência), uptime, painéis ouvindo o canal de alertas, câmeras conectadas/cadastradas, ocorrências 24 h e abertas, clipes em disco e último expurgo, nível e formato do log |
| API, liveness | `GET /health` | nenhuma | `{"status": "ok", "banco": "conectado"}`; é o healthcheck do contêiner |
| Serviço de visão | `GET /health` na porta 8001 | nenhuma (rede local) | tabela abaixo |
| Serviço de visão | `GET /estado` | nenhuma | quem está em cena, estado de cada um, impedimentos, latência do quadro, estado da captura |

## O `/health` do serviço de visão

| Campo | Por que importa |
|---|---|
| `status` | `ok`, `degradado` (fonte caiu, reconectando), `iniciando`, `parado` |
| `estado_da_fonte` e `captura` | `capturando` / `reconectando` / `parado`, com tentativa, próxima espera, segundos desde o último quadro, quedas e reconexões, erro cru |
| `fps_real` e `fps_alvo` | se o real despencou, a máquina está sobrecarregada e o alerta vai atrasar |
| `latencia_media_ms`, `latencia_p95_ms`, `latencia_max_ms` | custo por quadro; a média esconde o pico, e o RNF07 é sobre o pior caso |
| `quadros_processados` | prova que está trabalhando, não só de pé |
| `uptime_s` | desde o boot do processo |
| `ocorrencias` | geradas desde o boot |
| `clipes` | quantos em disco, bytes, gravando agora, último clipe, último expurgo e quantos removeu: é a prova de que o RNF05 está rodando |
| `publicacao` | registradas, duplicadas, aguardando em disco, se o ping está ativo ou suprimido, último erro |

## Log estruturado

Os dois serviços escrevem uma linha JSON por evento (`ts`, `nivel`, `servico`, `logger`, `msg`, mais os campos passados em `extra`), com `LOG_LEVEL` e `LOG_FORMATO=texto` para o formato legível. Código em `backend/app/registro.py` e `visao/app/registro.py`. Os eventos que importam para operação já saem com campos próprios: ocorrência registrada, clipe gravado e expurgo com a lista removida, fonte indisponível com tentativa e espera, falso positivo marcado (RN14).

## Como o painel decide "câmera conectada"

Não há coluna escrita por alguém. A API deriva `conectada` de `ultimo_ping` nos últimos 90 s a cada consulta, e o serviço de visão só pinga enquanto há quadro capturado há menos de 10 s. Uma câmera morta com o processo vivo aparece desconectada em até 90 s; quando volta, o ping recomeça no segundo seguinte. Verificado ponta a ponta em 11/09/2026 (`docs/PLANO_RESILIENCIA.md`).

## O que é sinal de problema

| Sinal | Leitura | Ação |
|---|---|---|
| tela diz "serviço fora do ar" | o navegador não alcança a porta 8001 | subir `visao/servir.py` |
| tela diz "câmera fora do ar" | o serviço está de pé e reconectando sozinho | conferir cabo, rede ou a câmera; a captura volta sem reiniciar nada |
| `fps_real` bem abaixo de `fps_alvo` | CPU saturada | reduzir `VISAO_LARGURA` ou o fps alvo; conferir o que mais roda na máquina |
| `publicacao.aguardando_em_disco` crescendo | a API não está aceitando ocorrências | conferir a API; os eventos serão reenviados quando ela voltar |
| `clipes.ultimo_expurgo` parado há mais de uma hora | a rotina de expurgo travou | reiniciar o serviço; a API também expurga |
