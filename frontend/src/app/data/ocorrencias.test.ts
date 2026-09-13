import { describe, expect, it } from 'vitest';
import type { OcorrenciaResumo } from './api';
import { estaAberta, gravidadeDe, nasUltimasHoras, porHoraNasUltimas24h, porTipo, rotuloDoEvento } from './ocorrencias';
import { horasDesde, quandoFoi } from './tempo';

const AGORA = new Date('2026-09-13T15:30:00Z').getTime();

const ocorrencia = (parcial: Partial<OcorrenciaResumo>): OcorrenciaResumo => ({
  id: 'o1',
  tipoEvento: 'queda',
  status: 'pendente',
  dataHora: new Date(AGORA - 5 * 60000).toISOString(),
  ambienteId: 'a1',
  ambienteNome: 'Quarto 101',
  ...parcial,
});

describe('tempo relativo', () => {
  it('formata minutos, horas e dias', () => {
    expect(quandoFoi(new Date(AGORA - 10000).toISOString(), AGORA)).toBe('agora');
    expect(quandoFoi(new Date(AGORA - 5 * 60000).toISOString(), AGORA)).toBe('5 min atrás');
    expect(quandoFoi(new Date(AGORA - 3 * 3600000).toISOString(), AGORA)).toBe('3h atrás');
    expect(quandoFoi(new Date(AGORA - 49 * 3600000).toISOString(), AGORA)).toBe('2d atrás');
  });

  it('não quebra com data inválida', () => {
    expect(quandoFoi('nada', AGORA)).toBe('—');
    expect(horasDesde('nada', AGORA)).toBeNull();
    expect(horasDesde(new Date(AGORA - 2.5 * 3600000).toISOString(), AGORA)).toBe(2);
  });
});

describe('leituras derivadas das ocorrências', () => {
  it('rotula o tipo e cai no valor cru quando desconhecido', () => {
    expect(rotuloDoEvento('queda')).toBe('Queda');
    expect(rotuloDoEvento('outro_tipo')).toBe('outro_tipo');
  });

  it('gravidade e abertura seguem o status, não julgamento clínico', () => {
    expect(gravidadeDe(ocorrencia({ status: 'pendente' }))).toBe('critical');
    expect(gravidadeDe(ocorrencia({ status: 'em_atendimento' }))).toBe('warning');
    expect(gravidadeDe(ocorrencia({ status: 'queda_confirmada' }))).toBe('info');
    expect(estaAberta(ocorrencia({ status: 'em_atendimento' }))).toBe(true);
    expect(estaAberta(ocorrencia({ status: 'falso_positivo' }))).toBe(false);
  });

  it('filtra pelas últimas horas', () => {
    const lista = [
      ocorrencia({ id: 'a', dataHora: new Date(AGORA - 60000).toISOString() }),
      ocorrencia({ id: 'b', dataHora: new Date(AGORA - 30 * 3600000).toISOString() }),
    ];
    expect(nasUltimasHoras(lista, 24, AGORA).map((o) => o.id)).toEqual(['a']);
  });

  it('agrupa por tipo, do mais frequente para o menos', () => {
    const lista = [
      ocorrencia({ tipoEvento: 'permanencia_solo' }),
      ocorrencia({ tipoEvento: 'queda' }),
      ocorrencia({ tipoEvento: 'queda' }),
    ];
    expect(porTipo(lista)).toEqual([
      { tipo: 'Queda', total: 2 },
      { tipo: 'Permanência no chão', total: 1 },
    ]);
  });

  it('agrupa por hora com as 24 faixas presentes e zeros onde não houve nada', () => {
    const lista = [
      ocorrencia({ dataHora: new Date(AGORA - 5 * 60000).toISOString() }),
      ocorrencia({ dataHora: new Date(AGORA - 10 * 60000).toISOString() }),
      ocorrencia({ dataHora: new Date(AGORA - 2 * 3600000).toISOString() }),
      ocorrencia({ dataHora: new Date(AGORA - 30 * 3600000).toISOString() }), // fora da janela
    ];
    const faixas = porHoraNasUltimas24h(lista, AGORA);
    expect(faixas).toHaveLength(24);
    expect(faixas[23].total).toBe(2);
    expect(faixas[21].total).toBe(1);
    expect(faixas.reduce((s, f) => s + f.total, 0)).toBe(3);
  });
});
