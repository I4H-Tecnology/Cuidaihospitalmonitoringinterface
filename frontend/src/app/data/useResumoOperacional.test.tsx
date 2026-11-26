import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { chamadas, erroHttp, fetchFalso } from '@/test/telas';
import { useResumoOperacional } from './useResumoOperacional';

/*
 * Os números do menu e do sino vêm de uma consulta feita ao montar (`void carregar()`). Falha não vira erro na
 * tela: o contador fica no valor anterior. O nome da clínica vem de outra consulta.
 */

afterEach(() => vi.unstubAllGlobals());

const resumo = { status: 'attention', criticalAlerts: 3, criticalCases: 2, occupancyRate: 80, avgResponseMinutes: 4, incidentsLast24h: 7, updatedAt: '2026-11-22T12:00:00Z', criticalSectors: [], insights: [] };

describe('useResumoOperacional', () => {
  it('ao montar: busca os contadores e o nome da clínica', async () => {
    const api = fetchFalso([
      [/\/api\/operational-overview/, resumo],
      [/\/api\/tenants/, [{ id: 'clinica-teste', nome: 'Clínica Teste' }, { id: 'outra', nome: 'Outra' }]],
    ]);

    const { result } = renderHook(() => useResumoOperacional('clinica-teste'));

    await waitFor(() => expect(result.current.alertasCriticos).toBe(3));
    expect(result.current.casosAbertos).toBe(2);
    expect(result.current.incidentes24h).toBe(7);
    await waitFor(() => expect(result.current.nomeDaClinica).toBe('Clínica Teste'));
    expect(chamadas(api, /\/api\/operational-overview/)).toBe(1);
  });

  it('a consulta falhar: os contadores ficam em zero, sem erro', async () => {
    fetchFalso([
      [/\/api\/operational-overview/, () => erroHttp(500, 'Banco indisponível.')],
      [/\/api\/tenants/, []],
    ]);

    const { result } = renderHook(() => useResumoOperacional('clinica-teste'));

    await waitFor(() => expect(result.current.nomeDaClinica).toBeNull());
    expect(result.current.alertasCriticos).toBe(0);
  });

  it('recarregar busca de novo e atualiza os contadores', async () => {
    const respostas = [resumo, { ...resumo, criticalAlerts: 9 }];
    const api = fetchFalso([[/\/api\/operational-overview/, () => respostas.shift()], [/\/api\/tenants/, []]]);
    const { result } = renderHook(() => useResumoOperacional('clinica-teste'));
    await waitFor(() => expect(result.current.alertasCriticos).toBe(3));

    await result.current.recarregar();

    await waitFor(() => expect(result.current.alertasCriticos).toBe(9));
    expect(chamadas(api, /\/api\/operational-overview/)).toBe(2);
  });

  it('sem clínica: não busca nada', () => {
    const api = fetchFalso();

    renderHook(() => useResumoOperacional(null));

    expect(chamadas(api, /\/api\//)).toBe(0);
  });
});
