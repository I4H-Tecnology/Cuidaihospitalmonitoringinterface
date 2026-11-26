import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { chamadas, erroHttp, fetchFalso } from '@/test/telas';
import { useSaudeDoSistema } from './useSaudeDoSistema';

vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

afterEach(() => vi.unstubAllGlobals());

const saude = { status: 'ok', versao: '1.4.0', uptime_s: 100, banco: { ok: true, latencia_ms: 5, erro: null } };

/* `/api/saude` é consultado ao montar (`void recarregar()`); o erro vira uma mensagem que diz o que fazer. */
describe('useSaudeDoSistema', () => {
  it('ao montar: busca a saúde do sistema', async () => {
    const api = fetchFalso([[/\/api\/saude/, saude]]);

    const { result } = renderHook(() => useSaudeDoSistema());

    await waitFor(() => expect(result.current.saude?.versao).toBe('1.4.0'));
    expect(result.current.erro).toBeNull();
    expect(result.current.carregando).toBe(false);
    expect(chamadas(api, /\/api\/saude/)).toBe(1);
  });

  it('perfil sem acesso (403): explica que o estado ao vivo não aparece', async () => {
    fetchFalso([[/\/api\/saude/, () => erroHttp(403, 'Proibido.')]]);

    const { result } = renderHook(() => useSaudeDoSistema());

    await waitFor(() => expect(result.current.erro).toBe('Seu perfil não tem acesso ao monitoramento, então o estado ao vivo não aparece aqui.'));
    expect(result.current.saude).toBeNull();
  });

  it('outra falha: pede para tentar de novo, e recarregar busca outra vez', async () => {
    const respostas = [() => erroHttp(500, 'Falhou.'), () => saude];
    const api = fetchFalso([[/\/api\/saude/, () => respostas.shift()!()]]);
    const { result } = renderHook(() => useSaudeDoSistema());
    await waitFor(() => expect(result.current.erro).toBe('Não foi possível consultar o servidor agora.'));

    await result.current.recarregar();

    await waitFor(() => expect(result.current.saude?.status).toBe('ok'));
    expect(result.current.erro).toBeNull();
    expect(chamadas(api, /\/api\/saude/)).toBe(2);
  });
});
