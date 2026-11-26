import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { OcorrenciaResumo } from '../../data/api';
import { LinhaDoTempoLista, montarLinhaDoTempo } from './LinhaDoTempo';

const ocorrencia = (parcial: Partial<OcorrenciaResumo>): OcorrenciaResumo => ({
  id: 'o1', tipoEvento: 'permanencia_solo', status: 'encerrada', dataHora: '2026-01-15T13:10:16.000Z',
  ambienteId: 'a1', ambienteNome: 'Quarto 101', ...parcial,
});

describe('Linha do tempo: ocorrências', () => {
  it('o registro de ensaio controlado leva o selo, e a ocorrência real não', () => {
    const eventos = montarLinhaDoTempo([], [ocorrencia({ id: 'ensaio', ensaio: true }), ocorrencia({ id: 'real', pacienteNome: 'Maria Alves' })], []);
    render(<LinhaDoTempoLista eventos={eventos} mostrarPaciente />);

    expect(screen.getAllByText('ENSAIO CONTROLADO')).toHaveLength(1);
    expect(screen.getByText('sem paciente vinculado')).toBeInTheDocument();
    expect(screen.getByText('Maria Alves')).toBeInTheDocument();
  });

  it('sem ensaio, nenhum selo', () => {
    render(<LinhaDoTempoLista eventos={montarLinhaDoTempo([], [ocorrencia({})], [])} />);
    expect(screen.queryByText('ENSAIO CONTROLADO')).not.toBeInTheDocument();
  });
});
