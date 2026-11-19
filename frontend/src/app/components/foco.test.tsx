import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { focarAoAparecer } from './foco';

function Formulario() {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  return (
    <div>
      <button type="button" onClick={() => setAberto(true)}>Registrar</button>
      <input aria-label="Busca" />
      {aberto && <input aria-label="Descrição" value={texto} onChange={(e) => setTexto(e.target.value)} ref={focarAoAparecer} />}
    </div>
  );
}

describe('focarAoAparecer', () => {
  it('leva o foco ao campo no momento em que ele aparece', async () => {
    render(<Formulario />);
    expect(screen.queryByLabelText('Descrição')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(screen.getByLabelText('Descrição')).toHaveFocus();
  });

  it('não rouba o foco de volta a cada renderização', async () => {
    render(<Formulario />);
    await userEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    // O usuário vai para outro campo e escreve: a página renderiza de novo, mas o foco fica onde ele pôs.
    await userEvent.click(screen.getByLabelText('Busca'));
    await userEvent.type(screen.getByLabelText('Busca'), 'abc');
    expect(screen.getByLabelText('Busca')).toHaveFocus();
  });

  it('aceita null (o React o chama assim ao desmontar)', () => {
    expect(() => focarAoAparecer(null)).not.toThrow();
  });
});
