/**
 * Registrar pagamento (ou recebimento) de uma parcela.
 *
 * "Valor" é quanto da parcela este pagamento quita; juros e multa somam,
 * desconto subtrai. O que sai (ou entra) no banco aparece embaixo, calculado
 * — é esse número que tem de bater com o extrato.
 */

import { useState } from 'react';
import { useFinanceiro } from '../../contexto';
import type { Conta, ParcelaDetalhe, TipoTitulo } from '../../api/tipos';
import { deCentavos, formatarBRL, paraCentavos, type Dinheiro } from '../../util/dinheiro';
import { formatarData, hojeISO } from '../../util/datas';
import { AreaTexto, Aviso, Botao, Campo, CampoDinheiro, Janela, Seletor, texto } from '../../ui/base';
import { SeletorConta } from '../../ui/seletores';

export const FORMAS = [
  { valor: 'pix', rotulo: 'PIX' },
  { valor: 'boleto', rotulo: 'Boleto' },
  { valor: 'transferencia', rotulo: 'Transferência' },
  { valor: 'dinheiro', rotulo: 'Dinheiro' },
  { valor: 'cartao_debito', rotulo: 'Cartão de débito' },
  { valor: 'cartao_credito', rotulo: 'Cartão de crédito' },
  { valor: 'debito_automatico', rotulo: 'Débito automático' },
  { valor: 'cheque', rotulo: 'Cheque' },
  { valor: 'outro', rotulo: 'Outro' },
];

export function ModalBaixa({
  tipo,
  parcela,
  descricao,
  contas,
  aoFechar,
  aoConcluir,
}: {
  tipo: TipoTitulo;
  parcela: Pick<ParcelaDetalhe, 'id' | 'numero' | 'vencimento' | 'saldo'>;
  descricao: string;
  contas: Conta[];
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const { api, avisar } = useFinanceiro();
  const [contaId, setContaId] = useState(contas.find((c) => c.ativa && c.tipo !== 'investimento')?.id ?? '');
  const [data, setData] = useState(hojeISO());
  const [valor, setValor] = useState<Dinheiro | null>(parcela.saldo);
  const [juros, setJuros] = useState<Dinheiro | null>(null);
  const [multa, setMulta] = useState<Dinheiro | null>(null);
  const [desconto, setDesconto] = useState<Dinheiro | null>(null);
  const [forma, setForma] = useState('pix');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  const efetivo = paraCentavos(valor) + paraCentavos(juros) + paraCentavos(multa) - paraCentavos(desconto);
  const parcial = paraCentavos(valor) < paraCentavos(parcela.saldo);
  const excede = paraCentavos(valor) > paraCentavos(parcela.saldo);
  const verbo = tipo === 'pagar' ? 'Pagar' : 'Receber';
  const invalido = !contaId || !valor || paraCentavos(valor) <= 0 || excede || efetivo <= 0;

  return (
    <Janela
      titulo={`${verbo} parcela ${parcela.numero}`}
      subtitulo={`${descricao} · vence ${formatarData(parcela.vencimento)} · saldo ${formatarBRL(parcela.saldo)}`}
      aoFechar={aoFechar}
      largura="max-w-lg"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            carregando={salvando}
            disabled={invalido}
            onClick={async () => {
              setSalvando(true);
              try {
                await api.baixar(parcela.id, { contaId, data, valor, juros, multa, desconto, forma, observacao: observacao || null });
                avisar(tipo === 'pagar' ? 'Pagamento registrado.' : 'Recebimento registrado.');
                aoConcluir();
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'Não foi possível registrar.', 'erro');
              } finally {
                setSalvando(false);
              }
            }}
          >
            {verbo}
          </Botao>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <SeletorConta contas={contas} valor={contaId} aoMudar={setContaId} rotulo={tipo === 'pagar' ? 'Sai da conta' : 'Entra na conta'} className="sm:col-span-2" />
        <Campo rotulo="Data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        <Seletor rotulo="Forma" value={forma} onChange={(e) => setForma(e.target.value)} opcoes={FORMAS} />
        <CampoDinheiro rotulo="Valor da parcela quitado" valor={valor} aoMudar={setValor} className="sm:col-span-2" />
        <CampoDinheiro rotulo="Juros" valor={juros} aoMudar={setJuros} />
        <CampoDinheiro rotulo="Multa" valor={multa} aoMudar={setMulta} />
        <CampoDinheiro rotulo="Desconto" valor={desconto} aoMudar={setDesconto} className="sm:col-span-2" />
        <AreaTexto rotulo="Observação" className="sm:col-span-2" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
      </div>
      <div className="mt-4 rounded-lg bg-gray-50 px-4 py-3 text-sm dark:bg-gray-900/40">
        <span className={texto.suave}>{tipo === 'pagar' ? 'Sai do banco' : 'Entra no banco'}: </span>
        <strong className={`tabular-nums ${texto.titulo}`}>{formatarBRL(deCentavos(efetivo))}</strong>
      </div>
      {parcial && !excede && (
        <p className={`mt-2 text-xs ${texto.suave}`}>
          Pagamento parcial: fica um saldo de {formatarBRL(deCentavos(paraCentavos(parcela.saldo) - paraCentavos(valor)))} em aberto.
        </p>
      )}
      {excede && <div className="mt-2"><Aviso tipo="erro">O valor passa do saldo da parcela. Juros e multa vão nos campos próprios.</Aviso></div>}
    </Janela>
  );
}
