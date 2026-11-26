import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchOcorrencias, lerToken, urlDoCanalDeAlertas } from './api';
import type { OcorrenciaResumo } from './api';

/**
 * Ocorrencias em tempo real (RF15, RNF07, RNF08).
 *
 * O WebSocket entrega o alerta no instante em que a ocorrencia nasce -- e o
 * que faz os 5 segundos do RNF07 serem cumpriveis. O polling continua ativo,
 * mas devagar, como rede de seguranca: conexao de clinica cai, proxy derruba
 * socket ocioso, e um alerta perdido nesse intervalo e um paciente no chao sem
 * atendimento.
 *
 * A autenticacao vai na PRIMEIRA MENSAGEM, nao na query string. Token em URL
 * acaba no log do servidor e no historico do navegador.
 */

const INTERVALO_POLLING_MS = 20000;
const INTERVALO_PING_MS = 25000;
// Sobe a cada tentativa frustrada ate o teto: reconectar em rajada contra um
// servidor fora do ar so piora a situacao dele.
const ESPERA_INICIAL_MS = 1000;
const ESPERA_MAXIMA_MS = 30000;

export type EstadoDoCanal = 'conectando' | 'conectado' | 'desconectado';

interface Retorno {
  ocorrencias: OcorrenciaResumo[];
  pendentes: OcorrenciaResumo[];
  canal: EstadoDoCanal;
  carregando: boolean;
  erro: string | null;
  recarregar: () => Promise<void>;
}

export function useAlertas(tenantId: string | null): Retorno {
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaResumo[]>([]);
  const [canal, setCanal] = useState<EstadoDoCanal>('conectando');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const socket = useRef<WebSocket | null>(null);
  const espera = useRef(ESPERA_INICIAL_MS);
  const timerReconexao = useRef<number | null>(null);
  const vivo = useRef(true);

  const recarregar = useCallback(async () => {
    if (!tenantId) return;
    try {
      setOcorrencias(await fetchOcorrencias(tenantId, 50));
      setErro(null);
    } catch {
      setErro('Não foi possível carregar as ocorrências.');
    } finally {
      setCarregando(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    vivo.current = true;

    void recarregar();
    const timerPolling = window.setInterval(recarregar, INTERVALO_POLLING_MS);

    let timerPing: number | null = null;

    const conectar = () => {
      const token = lerToken();
      if (!token || !vivo.current) return;

      setCanal('conectando');
      const ws = new WebSocket(urlDoCanalDeAlertas());
      socket.current = ws;

      ws.onopen = () => {
        // Identificacao imediata: o servidor derruba quem nao se apresentar.
        ws.send(JSON.stringify({ token }));
        timerPing = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('ping');
        }, INTERVALO_PING_MS);
      };

      ws.onmessage = (evento) => {
        let dados: any;
        try {
          dados = JSON.parse(evento.data);
        } catch {
          return;
        }

        if (dados.tipo === 'conectado') {
          setCanal('conectado');
          espera.current = ESPERA_INICIAL_MS;
          return;
        }
        if (dados.tipo === 'pong') return;

        // Qualquer evento do ciclo muda o estado no servidor. Em vez de
        // reconstruir a lista a partir da mensagem -- e arriscar divergir do
        // banco --, o push serve de gatilho e a verdade vem da API.
        if (['ocorrencia', 'ciencia', 'atendimento_iniciado', 'encerrada'].includes(dados.tipo)) {
          void recarregar();
        }
      };

      ws.onclose = () => {
        if (timerPing) window.clearInterval(timerPing);
        socket.current = null;
        if (!vivo.current) return;
        setCanal('desconectado');
        timerReconexao.current = window.setTimeout(conectar, espera.current);
        espera.current = Math.min(espera.current * 2, ESPERA_MAXIMA_MS);
      };

      ws.onerror = () => {
        // O onclose vem logo depois e cuida da reconexao. Fechar aqui tambem
        // dispararia dois agendamentos para a mesma queda.
      };
    };

    conectar();

    return () => {
      vivo.current = false;
      window.clearInterval(timerPolling);
      if (timerPing) window.clearInterval(timerPing);
      if (timerReconexao.current) window.clearTimeout(timerReconexao.current);
      socket.current?.close();
      socket.current = null;
    };
  }, [tenantId, recarregar]);

  return {
    ocorrencias,
    pendentes: ocorrencias.filter((o) => o.status === 'pendente' || o.status === 'em_atendimento'),
    canal,
    carregando,
    erro,
    recarregar,
  };
}
