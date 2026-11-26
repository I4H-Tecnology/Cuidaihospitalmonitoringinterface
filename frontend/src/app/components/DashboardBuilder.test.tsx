import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardBuilder } from './DashboardBuilder';

/*
 * O cartão de um widget é um <div role="button" tabIndex=0>: selecionável pelo teclado com Enter
 * ou Espaço. Dentro dele há botões de verdade (configurar e remover). O teclado só pode agir no
 * cartão quando o foco está NO cartão: se o Enter de um botão de dentro subisse até o cartão, o
 * cartão cancelaria o clique do botão (preventDefault) e se selecionaria no lugar. A proteção é
 * `e.target === e.currentTarget` no onKeyDown. Estes testes cobrem as duas situações.
 */

// Os cartões são os únicos elementos com `aria-pressed` (estado "selecionado").
const cartoes = () => screen.queryAllByRole('button', { pressed: false }).concat(screen.queryAllByRole('button', { pressed: true }));
const selecionados = () => screen.queryAllByRole('button', { pressed: true });

async function abrirComWidgets() {
  render(<DashboardBuilder onClose={vi.fn()} />);
  expect(cartoes()).toHaveLength(0);
  // Há dois botões com esse nome (cabeçalho e estado vazio); os dois fazem a mesma coisa.
  await userEvent.click(screen.getAllByRole('button', { name: /Sugerir por perfil/ })[0]);
  expect(cartoes().length).toBeGreaterThanOrEqual(2);
}

describe('DashboardBuilder: widget pelo teclado', () => {
  it('Enter com o foco no cartão seleciona o widget, e só ele', async () => {
    await abrirComWidgets();
    const [primeiro, segundo] = cartoes();
    expect(selecionados()).toHaveLength(0);

    primeiro.focus();
    await userEvent.keyboard('{Enter}');

    expect(primeiro).toHaveAttribute('aria-pressed', 'true');
    expect(segundo).toHaveAttribute('aria-pressed', 'false');
    expect(selecionados()).toHaveLength(1);
  });

  it('Espaço com o foco no cartão também seleciona (e não rola a página)', async () => {
    await abrirComWidgets();
    const [, segundo] = cartoes();

    segundo.focus();
    await userEvent.keyboard(' ');

    expect(segundo).toHaveAttribute('aria-pressed', 'true');
    expect(selecionados()).toHaveLength(1);
  });

  it('outras teclas no cartão não selecionam nem removem nada', async () => {
    await abrirComWidgets();
    const antes = cartoes().length;
    const [primeiro] = cartoes();

    primeiro.focus();
    await userEvent.keyboard('a{Escape}{ArrowDown}');

    expect(selecionados()).toHaveLength(0);
    expect(cartoes()).toHaveLength(antes);
  });

  it('Enter no botão de REMOVER, dentro do cartão, remove o widget e não seleciona o cartão', async () => {
    await abrirComWidgets();
    const antes = cartoes().length;
    const [primeiro] = cartoes();
    // O cartão tem 3 controles sem nome: configurar, remover e a alça de arrastar (que não é botão).
    const [, remover] = within(primeiro).getAllByRole('button');

    remover.focus();
    await userEvent.keyboard('{Enter}');

    expect(cartoes()).toHaveLength(antes - 1);
    expect(selecionados()).toHaveLength(0);
  });

  it('Espaço no botão de REMOVER também remove, sem selecionar', async () => {
    await abrirComWidgets();
    const antes = cartoes().length;
    const [primeiro] = cartoes();
    const [, remover] = within(primeiro).getAllByRole('button');

    remover.focus();
    await userEvent.keyboard(' ');

    expect(cartoes()).toHaveLength(antes - 1);
    expect(selecionados()).toHaveLength(0);
  });

  it('Enter no botão de CONFIGURAR seleciona o cartão dele, uma vez', async () => {
    await abrirComWidgets();
    const [primeiro, segundo] = cartoes();
    const [configurar] = within(primeiro).getAllByRole('button');

    configurar.focus();
    await userEvent.keyboard('{Enter}');

    expect(primeiro).toHaveAttribute('aria-pressed', 'true');
    expect(segundo).toHaveAttribute('aria-pressed', 'false');
  });

  it('o clique do mouse no cartão continua selecionando', async () => {
    await abrirComWidgets();
    const [, segundo] = cartoes();

    await userEvent.click(segundo);

    expect(segundo).toHaveAttribute('aria-pressed', 'true');
  });
});
