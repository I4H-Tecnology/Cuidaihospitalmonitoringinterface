import { useState } from 'react';
import { Abas, CabecalhoDaArea } from '../ui/base';
import { Colaboradores } from './pessoal/Colaboradores';
import { Custos } from './pessoal/Custos';
import { FolhaDetalhe } from './pessoal/FolhaDetalhe';
import { Folhas } from './pessoal/Folhas';
import { Rubricas } from './pessoal/Rubricas';

type Aba = 'folhas' | 'colaboradores' | 'custos' | 'rubricas';

export function Pessoal() {
  const [aba, setAba] = useState<Aba>('folhas');
  const [folhaAberta, setFolhaAberta] = useState<string | null>(null);
  return (
    <div>
      <CabecalhoDaArea
        titulo="Pessoal e folha"
        descricao="A folha é calculada aqui (INSS, IRRF e FGTS pelas tabelas oficiais de 2026) e, se a contabilidade fechar com outro número, o dela prevalece. Fechar a folha gera as contas a pagar."
      />
      <Abas
        atual={aba}
        aoMudar={(a) => { setAba(a); setFolhaAberta(null); }}
        abas={[
          { chave: 'folhas', rotulo: 'Folhas' },
          { chave: 'colaboradores', rotulo: 'Colaboradores' },
          { chave: 'custos', rotulo: 'Custo de pessoal' },
          { chave: 'rubricas', rotulo: 'Rubricas' },
        ]}
      />
      {aba === 'folhas' && (folhaAberta
        ? <FolhaDetalhe folhaId={folhaAberta} aoVoltar={() => setFolhaAberta(null)} />
        : <Folhas aoAbrir={setFolhaAberta} />)}
      {aba === 'colaboradores' && <Colaboradores />}
      {aba === 'custos' && <Custos />}
      {aba === 'rubricas' && <Rubricas />}
    </div>
  );
}
