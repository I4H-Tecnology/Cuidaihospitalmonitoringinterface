import { useEffect, useState } from 'react';
import { fetchModoDeTeste } from './api';

/**
 * O modo de teste EFETIVO, perguntado ao backend (a mesma variável que governa a retenção dos
 * clipes e a importação dos registros de ensaio). Não é uma cópia gravada no build do painel:
 * essa poderia divergir do que o sistema de fato está fazendo.
 *
 * Enquanto a resposta não chega, ou se ela falhar, devolve `false`: sem o backend o painel não
 * opera, então não há "operação" a ser confundida com demonstração.
 */
export function useModoDeTeste(): boolean {
  const [ativo, setAtivo] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetchModoDeTeste()
      .then((resposta) => {
        if (vivo) setAtivo(resposta.modoTeste === true);
      })
      .catch(() => {
        if (vivo) setAtivo(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  return ativo;
}
