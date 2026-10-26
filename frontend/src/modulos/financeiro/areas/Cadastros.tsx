import { useState } from 'react';
import { useFinanceiro } from '../contexto';
import { Abas, CabecalhoDaArea } from '../ui/base';
import { Centros } from './cadastros/Centros';
import { Contas } from './cadastros/Contas';
import { Pessoas } from './cadastros/Pessoas';
import { PlanoDeContas } from './cadastros/PlanoDeContas';
import { Recorrencias } from './cadastros/Recorrencias';

type Aba = 'contas' | 'plano' | 'centros' | 'pessoas' | 'recorrencias';

export function Cadastros() {
  const { pode } = useFinanceiro();
  const [aba, setAba] = useState<Aba>('contas');
  return (
    <div>
      <CabecalhoDaArea titulo="Cadastros" descricao="A base do financeiro: onde o dinheiro está, como ele se classifica e com quem a empresa se relaciona." />
      <Abas
        atual={aba}
        aoMudar={setAba}
        abas={[
          { chave: 'contas', rotulo: 'Contas' },
          { chave: 'plano', rotulo: 'Plano de contas' },
          { chave: 'centros', rotulo: 'Centros de custo' },
          { chave: 'pessoas', rotulo: 'Pessoas' },
          { chave: 'recorrencias', rotulo: 'Recorrências', oculta: !pode('cadastros', 'ver') && !pode('operacao', 'ver') },
        ]}
      />
      {aba === 'contas' && <Contas />}
      {aba === 'plano' && <PlanoDeContas />}
      {aba === 'centros' && <Centros />}
      {aba === 'pessoas' && <Pessoas />}
      {aba === 'recorrencias' && <Recorrencias />}
    </div>
  );
}
