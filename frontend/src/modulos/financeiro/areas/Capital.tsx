/**
 * Capital e patrimônio: de onde vem o dinheiro que não é de cliente (sócios,
 * empréstimos) e onde está o que não é caixa (investimentos, bens).
 */

import { useState } from 'react';
import { useDados, useFinanceiro } from '../contexto';
import { formatarBRL, paraCentavos } from '../util/dinheiro';
import { Abas, Aviso, CabecalhoDaArea, Carregando, Numero, Secao, texto } from '../ui/base';
import { Emprestimos } from './capital/Emprestimos';
import { Investimentos } from './capital/Investimentos';
import { Patrimonio } from './capital/Patrimonio';
import { Socios } from './capital/Socios';

type Aba = 'resumo' | 'socios' | 'emprestimos' | 'investimentos' | 'patrimonio';

export function Capital() {
  const [aba, setAba] = useState<Aba>('resumo');
  return (
    <div>
      <CabecalhoDaArea
        titulo="Capital e patrimônio"
        descricao="Sócios, dívidas, aplicações e bens. Aporte, empréstimo recebido, amortização e compra de bem mexem no caixa, mas não no resultado — por isso ficam separados aqui."
      />
      <Abas
        atual={aba}
        aoMudar={setAba}
        abas={[
          { chave: 'resumo', rotulo: 'Resumo' },
          { chave: 'socios', rotulo: 'Sócios' },
          { chave: 'emprestimos', rotulo: 'Empréstimos' },
          { chave: 'investimentos', rotulo: 'Investimentos' },
          { chave: 'patrimonio', rotulo: 'Patrimônio' },
        ]}
      />
      {aba === 'resumo' && <Resumo aoIr={setAba} />}
      {aba === 'socios' && <Socios />}
      {aba === 'emprestimos' && <Emprestimos />}
      {aba === 'investimentos' && <Investimentos />}
      {aba === 'patrimonio' && <Patrimonio />}
    </div>
  );
}

function Resumo({ aoIr }: { aoIr: (a: Aba) => void }) {
  const { api } = useFinanceiro();
  const resumo = useDados(() => api.resumoCapital(), [api]);
  const r = resumo.dados;
  if (!r) return resumo.erro ? <Aviso tipo="erro">{resumo.erro}</Aviso> : <Carregando />;
  const lucros = paraCentavos(r.lucrosADistribuir);
  return (
    <div className="space-y-6">
      <Secao titulo="Sócios e capital social">
        <div className="grid gap-4 sm:grid-cols-4">
          <Numero rotulo="Capital subscrito" valor={formatarBRL(r.capitalSubscrito)} aoClicar={() => aoIr('socios')} />
          <Numero rotulo="Integralizado" valor={formatarBRL(r.capitalIntegralizado)} tom="bom" />
          <Numero rotulo="A integralizar" valor={formatarBRL(r.aIntegralizar)} />
          <Numero rotulo="Lucros já distribuídos" valor={formatarBRL(r.distribuido)} />
        </div>
      </Secao>
      <Secao titulo="Resultado acumulado" subtitulo="Soma dos resultados (DRE) desde o primeiro lançamento, menos o que já foi distribuído">
        <div className="grid gap-4 sm:grid-cols-3">
          <Numero rotulo="Resultado acumulado" valor={formatarBRL(r.resultadoAcumulado)} tom={paraCentavos(r.resultadoAcumulado) < 0 ? 'critico' : 'neutro'} />
          <Numero rotulo="Disponível para distribuir" valor={formatarBRL(r.lucrosADistribuir)} tom={lucros < 0 ? 'critico' : lucros > 0 ? 'bom' : 'neutro'} destaque />
        </div>
        <p className={`mt-3 text-xs ${texto.suave}`}>
          É um número gerencial: a distribuição de lucros com isenção de IR depende da escrituração contábil. Confirme com a contabilidade antes de distribuir.
        </p>
      </Secao>
      <div className="grid gap-4 sm:grid-cols-3">
        <Numero rotulo="Dívidas (saldo devedor)" valor={formatarBRL(r.emprestimos.saldoDevedor)} detalhe={`${r.emprestimos.contratos} contrato(s)`} aoClicar={() => aoIr('emprestimos')} />
        <Numero rotulo="Investimentos" valor={formatarBRL(r.investimentos)} aoClicar={() => aoIr('investimentos')} />
        <Numero rotulo="Patrimônio (valor contábil)" valor={formatarBRL(r.patrimonio.valorContabil)} detalhe={`${r.patrimonio.bens} bem(ns)`} aoClicar={() => aoIr('patrimonio')} />
      </div>
      {r.avisos.map((a) => <Aviso key={a} tipo="atencao">{a}</Aviso>)}
    </div>
  );
}
