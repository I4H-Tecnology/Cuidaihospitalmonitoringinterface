import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { chamadas, erroHttp, fetchComFalha, fetchFalso } from '@/test/telas';
import { TarjaModoTeste } from './TarjaModoTeste';

afterEach(() => vi.unstubAllGlobals());

const ROTA = /^GET .*\/api\/modo-de-teste$/;

/** Espera a pergunta ao backend terminar, para provar uma AUSÊNCIA depois dela (não antes). */
const aposAResposta = async (mock: ReturnType<typeof fetchFalso>) => {
  await waitFor(() => expect(chamadas(mock, ROTA)).toBe(1));
  await new Promise((r) => setTimeout(r, 0));
};

/*
 * A faixa reflete o modo EFETIVO que o backend informa (MEDSIGNAL_MODO_TESTE), e não uma variável
 * gravada no build do painel. Os dois cenários pedidos: ligado mostra, desligado não mostra.
 */
describe('Faixa de modo de teste', () => {
  it('modo de teste LIGADO no backend: a faixa aparece, com o aviso de que não é operação real', async () => {
    const mock = fetchFalso([[ROTA, { modoTeste: true }]]);
    render(<TarjaModoTeste />);

    const faixa = await screen.findByRole('status');
    expect(faixa).toHaveTextContent('MODO DE TESTE');
    expect(faixa).toHaveTextContent('Não representa operação real');
    expect(chamadas(mock, ROTA)).toBe(1);
  });

  it('modo de teste DESLIGADO no backend: nenhuma faixa', async () => {
    const mock = fetchFalso([[ROTA, { modoTeste: false }]]);
    render(<TarjaModoTeste />);

    await aposAResposta(mock);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText('MODO DE TESTE')).not.toBeInTheDocument();
  });

  it('o texto da faixa não promete webcam: na VPS o vídeo é uma gravação', async () => {
    fetchFalso([[ROTA, { modoTeste: true }]]);
    render(<TarjaModoTeste />);

    const faixa = await screen.findByRole('status');
    expect(faixa).toHaveTextContent(/gravação ou da webcam de teste/);
    expect(faixa).not.toHaveTextContent('vindo da webcam local');
  });

  it('só um `true` de verdade liga a faixa: texto, número ou ausência do campo não ligam', async () => {
    for (const corpo of [{ modoTeste: 'true' }, { modoTeste: 1 }, { modoTeste: null }, {}]) {
      const mock = fetchFalso([[ROTA, corpo]]);
      const { unmount } = render(<TarjaModoTeste />);
      await aposAResposta(mock);
      expect(screen.queryByRole('status'), JSON.stringify(corpo)).not.toBeInTheDocument();
      unmount();
    }
  });

  it('backend com erro ou fora do ar: sem faixa e sem quebrar a tela', async () => {
    const mock = fetchFalso([[ROTA, () => erroHttp(500, 'Banco indisponível.')]]);
    render(<TarjaModoTeste />);
    await aposAResposta(mock);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    fetchComFalha('fora do ar', 503);
    const { container } = render(<TarjaModoTeste />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it('ligada, marca o <html> para o CSS descontar a altura da faixa; desligada ou desmontada, tira a marca', async () => {
    const html = document.documentElement;
    fetchFalso([[ROTA, { modoTeste: true }]]);
    const { unmount } = render(<TarjaModoTeste />);

    await screen.findByRole('status');
    expect(html).toHaveAttribute('data-faixa-de-teste');
    unmount();
    expect(html).not.toHaveAttribute('data-faixa-de-teste');

    const mock = fetchFalso([[ROTA, { modoTeste: false }]]);
    render(<TarjaModoTeste />);
    await aposAResposta(mock);
    expect(html).not.toHaveAttribute('data-faixa-de-teste');
  });

  it('é uma barra grudada no topo, para não sair da tela quando a página rolar', async () => {
    fetchFalso([[ROTA, { modoTeste: true }]]);
    render(<TarjaModoTeste />);

    const faixa = await screen.findByRole('status');
    expect(faixa).toHaveClass('sticky', 'top-0', 'h-8');
  });

  it('enquanto o backend não responde, nada aparece (a faixa não é um texto fixo)', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { container } = render(<TarjaModoTeste />);
    expect(container).toBeEmptyDOMElement();
  });
});
