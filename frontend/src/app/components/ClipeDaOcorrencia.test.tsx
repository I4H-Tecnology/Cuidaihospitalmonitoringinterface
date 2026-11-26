import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { erroHttp, fetchFalso } from '@/test/telas';
import type { OcorrenciaResumo } from '../data/api';
import { ClipeDaOcorrencia } from './ClipeDaOcorrencia';

vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

afterEach(() => vi.unstubAllGlobals());

const ocorrencia: OcorrenciaResumo = {
  id: 'o1', tipoEvento: 'queda', status: 'encerrada', dataHora: '2026-11-20T10:00:00.000Z',
  ambienteId: 'a1', ambienteNome: 'Quarto 101', temClipe: true,
};

describe('Clipe da ocorrência', () => {
  it('clipe que sumiu (404): o aviso não promete um prazo fixo de 24 h, porque o prazo é configurável', async () => {
    fetchFalso([[/\/clipe/, () => erroHttp(404, 'Clipe indisponível.')]]);
    render(<ClipeDaOcorrencia ocorrencia={ocorrencia} />);

    await userEvent.click(screen.getByRole('button', { name: /Ver clipe/ }));

    const aviso = await screen.findByText(/Clipe indisponível: ainda em gravação ou já expurgado/);
    expect(aviso).toHaveTextContent('fora do prazo de retenção');
    expect(aviso).not.toHaveTextContent('24 h');
  });

  it('ocorrência expurgada: a mensagem fixa também não cita 24 h', () => {
    render(<ClipeDaOcorrencia ocorrencia={{ ...ocorrencia, temClipe: false }} />);
    expect(screen.getByText(/Vídeo expurgado após o prazo de retenção/)).toBeInTheDocument();
  });
});
