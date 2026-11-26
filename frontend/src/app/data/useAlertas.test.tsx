import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { chamadas, fetchFalso } from '@/test/telas';
import { useAlertas } from './useAlertas';

/*
 * O hook busca as ocorrências ao montar (`void recarregar()`) e fica ouvindo o canal em tempo real: um aviso
 * de ocorrência nova, de ciência, de atendimento ou de encerramento vira uma busca nova (`void recarregar()`),
 * porque a verdade vem da API, não da mensagem. Aviso de conexão e "pong" não buscam nada.
 */

class SocketFalso {
  static ultimo: SocketFalso | null = null;
  static OPEN = 1;
  readyState = 1;
  enviados: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) { SocketFalso.ultimo = this; }
  send(texto: string) { this.enviados.push(texto); }
  close() { this.readyState = 3; }
  receber(dados: unknown) { this.onmessage?.({ data: typeof dados === 'string' ? dados : JSON.stringify(dados) }); }
}

const ocorrencia = (id: string) => ({ id, tipoEvento: 'queda', status: 'pendente', dataHora: '2026-11-22T10:00:00Z', ambienteId: 'a-1', ambienteNome: 'Quarto 101' });

beforeEach(() => {
  SocketFalso.ultimo = null;
  vi.stubGlobal('WebSocket', SocketFalso);
  localStorage.setItem('medsignal_token', 'tok-teste');
});
afterEach(() => vi.unstubAllGlobals());

describe('useAlertas', () => {
  it('ao montar: busca as ocorrências, separa as pendentes e identifica o canal ao conectar', async () => {
    const api = fetchFalso([[/\/api\/ocorrencias/, [ocorrencia('o-1'), { ...ocorrencia('o-2'), status: 'encerrada' }]]]);

    const { result } = renderHook(() => useAlertas('clinica-teste'));

    await waitFor(() => expect(result.current.ocorrencias).toHaveLength(2));
    expect(result.current.pendentes.map((o) => o.id)).toEqual(['o-1']);
    expect(result.current.carregando).toBe(false);
    expect(chamadas(api, /\/api\/ocorrencias/)).toBe(1);
    expect(result.current.canal).toBe('conectando');

    act(() => { SocketFalso.ultimo!.onopen?.(); });
    expect(JSON.parse(SocketFalso.ultimo!.enviados[0])).toEqual({ token: 'tok-teste' }); // se identifica na primeira mensagem
    act(() => { SocketFalso.ultimo!.receber({ tipo: 'conectado' }); });
    expect(result.current.canal).toBe('conectado');
  });

  it.each(['ocorrencia', 'ciencia', 'atendimento_iniciado', 'encerrada'])('aviso "%s" do canal: busca as ocorrências de novo', async (tipo) => {
    const api = fetchFalso([[/\/api\/ocorrencias/, [ocorrencia('o-1')]]]);
    const { result } = renderHook(() => useAlertas('clinica-teste'));
    await waitFor(() => expect(result.current.ocorrencias).toHaveLength(1));

    act(() => { SocketFalso.ultimo!.receber({ tipo }); });

    await waitFor(() => expect(chamadas(api, /\/api\/ocorrencias/)).toBe(2));
  });

  it.each([[{ tipo: 'pong' }], [{ tipo: 'conectado' }], [{ tipo: 'outra-coisa' }], ['isto não é JSON']])('mensagem %j não busca nada', async (mensagem) => {
    const api = fetchFalso([[/\/api\/ocorrencias/, [ocorrencia('o-1')]]]);
    const { result } = renderHook(() => useAlertas('clinica-teste'));
    await waitFor(() => expect(result.current.ocorrencias).toHaveLength(1));

    act(() => { SocketFalso.ultimo!.receber(mensagem); });

    expect(chamadas(api, /\/api\/ocorrencias/)).toBe(1);
  });

  it('sem clínica (tenant): não busca nem abre o canal', () => {
    const api = fetchFalso();

    renderHook(() => useAlertas(null));

    expect(chamadas(api, /\/api\//)).toBe(0);
    expect(SocketFalso.ultimo).toBeNull();
  });
});
