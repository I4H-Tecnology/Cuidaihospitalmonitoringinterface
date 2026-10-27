/**
 * Lançar (ou editar) uma conta a pagar ou a receber.
 *
 * O formulário segue a ordem em que a pessoa pensa: o quê, de quem, quanto,
 * quando vence, em que categoria. Competência (o mês a que o valor pertence)
 * vem preenchida com o mês da emissão e só precisa mudar quando é diferente —
 * a nota de setembro paga em outubro continua sendo despesa de setembro.
 */

import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useFinanceiro } from '../../contexto';
import type { Categoria, CentroCusto, Conta, TipoTitulo, Titulo } from '../../api/tipos';
import { deCentavos, formatarBRL, paraCentavos, type Dinheiro } from '../../util/dinheiro';
import { competenciaDe, fimDoMes, formatarData, hojeISO, somarMeses } from '../../util/datas';
import { AreaTexto, Aviso, Botao, Campo, CampoDinheiro, Janela, Marcador, Rotulo, Seletor, entrada, texto } from '../../ui/base';
import { SeletorCategoria, SeletorCentro, SeletorConta, SeletorPessoa, type PessoaEscolhida } from '../../ui/seletores';
import { FORMAS } from './ModalBaixa';

interface LinhaRateio {
  categoriaId: string;
  centroCustoId: string;
  valor: Dinheiro | null;
}

export function ModalTitulo({
  tipo,
  titulo,
  contas,
  categorias,
  centros,
  aoFechar,
  aoSalvar,
}: {
  tipo: TipoTitulo;
  titulo?: Titulo;
  contas: Conta[];
  categorias: Categoria[];
  centros: CentroCusto[];
  aoFechar: () => void;
  aoSalvar: (t: Titulo) => void;
}) {
  const { api, avisar } = useFinanceiro();
  const editando = Boolean(titulo);
  const valoresTravados = Boolean(titulo?.temBaixa);
  const natureza = tipo === 'pagar' ? 'despesa' : 'receita';

  const [descricao, setDescricao] = useState(titulo?.descricao ?? '');
  const [pessoa, setPessoa] = useState<PessoaEscolhida>(titulo?.pessoaId ? { id: titulo.pessoaId, nome: titulo.pessoaNome ?? '' } : null);
  const [valorTotal, setValorTotal] = useState<Dinheiro | null>(titulo?.valorTotal ?? null);
  const [emissao, setEmissao] = useState(titulo?.dataEmissao ?? hojeISO());
  const [competencia, setCompetencia] = useState(competenciaDe(titulo?.competencia ?? hojeISO()));
  const [vencimento, setVencimento] = useState(titulo?.parcelas[0]?.vencimento ?? hojeISO());
  const [quantidade, setQuantidade] = useState(String(titulo?.parcelas.length ?? 1));
  const [documento, setDocumento] = useState(titulo?.documento ?? '');
  const [observacao, setObservacao] = useState(titulo?.observacao ?? '');
  const [rateio, setRateio] = useState<LinhaRateio[]>(
    titulo?.rateio.map((r) => ({ categoriaId: r.categoriaId, centroCustoId: r.centroCustoId ?? '', valor: r.valor })) ?? [
      { categoriaId: '', centroCustoId: '', valor: null },
    ],
  );
  const [jaPago, setJaPago] = useState(false);
  const [contaPagamento, setContaPagamento] = useState(contas.find((c) => c.ativa)?.id ?? '');
  const [formaPagamento, setFormaPagamento] = useState('pix');
  const [salvando, setSalvando] = useState(false);

  const n = Math.max(1, Math.min(360, Number(quantidade) || 1));
  const previa = useMemo(() => {
    const total = paraCentavos(valorTotal);
    if (!total) return [];
    const base = Math.floor(total / n);
    const sobra = total - base * n;
    const dia = Number(vencimento.slice(8, 10));
    return Array.from({ length: n }, (_, i) => {
      // Mesmo dia nos meses seguintes; dia 31 vira o último dia dos meses curtos (igual ao servidor).
      const mes = somarMeses(vencimento, i);
      const ultimo = Number(fimDoMes(`${mes}-01`).slice(8, 10));
      return {
        numero: i + 1,
        vencimento: `${mes}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`,
        valor: deCentavos(base + (i === 0 ? sobra : 0)),
      };
    });
  }, [valorTotal, n, vencimento]);

  const variasCategorias = rateio.length > 1;
  const somaRateio = rateio.reduce((t, r) => t + paraCentavos(r.valor), 0);
  const faltaRatear = paraCentavos(valorTotal) - somaRateio;
  const rateioOk = !variasCategorias || faltaRatear === 0;
  const valido =
    descricao.trim().length >= 2 && paraCentavos(valorTotal) > 0 && rateio.every((r) => r.categoriaId) && rateioOk &&
    (!jaPago || contaPagamento);

  const salvar = async () => {
    setSalvando(true);
    const linhas = rateio.map((r) => ({
      categoriaId: r.categoriaId,
      centroCustoId: r.centroCustoId || null,
      ...(variasCategorias ? { valor: r.valor } : {}),
    }));
    const dados: Record<string, unknown> = {
      descricao, pessoaId: pessoa?.id ?? null, documento: documento || null, observacao: observacao || null, rateio: linhas,
    };
    if (!valoresTravados) {
      Object.assign(dados, {
        valorTotal, competencia, dataEmissao: emissao, quantidadeParcelas: n, primeiroVencimento: vencimento,
      });
    }
    try {
      const salvo = editando
        ? await api.editarTitulo(titulo!.id, dados)
        : await api.criarTitulo({
            ...dados, tipo,
            ...(jaPago ? { pagamento: { contaId: contaPagamento, data: vencimento, forma: formaPagamento } } : {}),
          });
      avisar(editando ? 'Título atualizado.' : tipo === 'pagar' ? `Conta a pagar lançada: título ${salvo.numero}.` : `Conta a receber lançada: título ${salvo.numero}.`);
      aoSalvar(salvo);
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não foi possível salvar.', 'erro');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Janela
      titulo={editando ? `Editar o título ${titulo!.numero}` : tipo === 'pagar' ? 'Nova conta a pagar' : 'Nova conta a receber'}
      aoFechar={aoFechar}
      largura="max-w-3xl"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="primario" carregando={salvando} disabled={!valido} onClick={salvar}>
            {editando ? 'Salvar' : jaPago ? (tipo === 'pagar' ? 'Lançar como pago' : 'Lançar como recebido') : 'Lançar'}
          </Botao>
        </>
      }
    >
      {valoresTravados && (
        <div className="mb-4">
          <Aviso tipo="info">
            Este título já teve pagamento: valor total, parcelas e competência não mudam por aqui. Para mudar as parcelas
            em aberto (valor, vencimento, quantidade), use “Editar parcelas” no título. Descrição, pessoa e categorias
            podem ser corrigidas aqui.
          </Aviso>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Descrição" placeholder={tipo === 'pagar' ? 'Ex.: Aluguel de outubro' : 'Ex.: Mensalidade de outubro'} className="sm:col-span-2" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        <SeletorPessoa valor={pessoa} aoMudar={setPessoa} rotulo={tipo === 'pagar' ? 'Fornecedor / credor' : 'Cliente / pagador'} papel={tipo === 'pagar' ? 'fornecedor' : 'cliente'} />
        <Campo rotulo="Documento" dica="nota, boleto, contrato" value={documento} onChange={(e) => setDocumento(e.target.value)} />
        <CampoDinheiro rotulo="Valor total" valor={valorTotal} aoMudar={setValorTotal} disabled={valoresTravados} />
        <Campo rotulo="Emissão" type="date" value={emissao} disabled={valoresTravados}
          onChange={(e) => { setEmissao(e.target.value); if (!editando) setCompetencia(competenciaDe(e.target.value)); }} />
        <Campo rotulo={n > 1 ? 'Primeiro vencimento' : 'Vencimento'} type="date" value={vencimento} disabled={valoresTravados} onChange={(e) => setVencimento(e.target.value)} />
        <Campo rotulo="Parcelas" type="number" min={1} max={360} value={quantidade} disabled={valoresTravados} onChange={(e) => setQuantidade(e.target.value)} />
        <Campo
          rotulo="Competência"
          type="month"
          value={competencia}
          disabled={valoresTravados}
          onChange={(e) => setCompetencia(e.target.value)}
          ajuda="O mês a que o valor pertence no resultado (DRE)."
        />
      </div>

      {previa.length > 1 && (
        <p className={`mt-2 text-xs ${texto.suave}`}>
          {previa.map((p) => `${p.numero}ª ${formatarData(p.vencimento)} ${formatarBRL(p.valor)}`).join(' · ')}
        </p>
      )}

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <Rotulo>Categoria{variasCategorias ? ' — rateio' : ''}</Rotulo>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-[var(--fin-primaria,#0A7EA4)] hover:underline"
            onClick={() => setRateio((r) => [...r, { categoriaId: '', centroCustoId: '', valor: null }])}
          >
            <Plus className="h-3.5 w-3.5" /> dividir em mais categorias
          </button>
        </div>
        <div className="space-y-2">
          {rateio.map((linha, i) => (
            <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_12rem_9rem_auto]">
              <SeletorCategoria
                categorias={categorias}
                natureza={natureza}
                valor={linha.categoriaId}
                rotulo={i === 0 ? 'Categoria' : ''}
                aoMudar={(v) => setRateio((r) => r.map((x, j) => (j === i ? { ...x, categoriaId: v } : x)))}
              />
              <SeletorCentro
                centros={centros}
                valor={linha.centroCustoId}
                rotulo={i === 0 ? 'Centro de custo' : ''}
                aoMudar={(v) => setRateio((r) => r.map((x, j) => (j === i ? { ...x, centroCustoId: v } : x)))}
              />
              {variasCategorias ? (
                <CampoDinheiro
                  rotulo={i === 0 ? 'Valor' : ''}
                  valor={linha.valor}
                  aoMudar={(v) => setRateio((r) => r.map((x, j) => (j === i ? { ...x, valor: v } : x)))}
                />
              ) : (
                <div className={`${entrada} border-dashed text-right text-gray-400`}>100%</div>
              )}
              {variasCategorias ? (
                <button type="button" aria-label="Remover linha" className="mb-2 rounded p-1 text-gray-400 hover:text-red-600"
                  onClick={() => setRateio((r) => r.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : <span />}
            </div>
          ))}
        </div>
        {variasCategorias && faltaRatear !== 0 && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            {faltaRatear > 0 ? `Falta ratear ${formatarBRL(deCentavos(faltaRatear))}.` : `O rateio passa do total em ${formatarBRL(deCentavos(-faltaRatear))}.`}
          </p>
        )}
      </div>

      <AreaTexto rotulo="Observação" className="mt-4" value={observacao} onChange={(e) => setObservacao(e.target.value)} />

      {!editando && (
        <div className="mt-4 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
          <Marcador
            rotulo={tipo === 'pagar' ? 'Já foi pago (lançamento à vista)' : 'Já foi recebido (lançamento à vista)'}
            checked={jaPago}
            onChange={(e) => setJaPago(e.target.checked)}
          />
          {jaPago && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <SeletorConta contas={contas} valor={contaPagamento} aoMudar={setContaPagamento} />
              <Seletor rotulo="Forma" value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} opcoes={FORMAS} />
              <p className={`text-xs sm:col-span-2 ${texto.suave}`}>Todas as parcelas são quitadas na data do vencimento informado.</p>
            </div>
          )}
        </div>
      )}
    </Janela>
  );
}
