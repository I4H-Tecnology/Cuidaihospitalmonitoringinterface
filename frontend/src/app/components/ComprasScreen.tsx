import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, PackageCheck, Plus, RefreshCw, ShoppingCart, Trash2, XCircle, Zap } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  ApiError, aprovarPedido, cancelarPedido, confirmarRecebimento, criarPedido, fetchContratos, fetchPedidos, formatarReais,
  recusarPedido, registrarCompra,
  type ContratoResumo, type ItemPedido, type PedidoResumo, type StatusPedido,
} from '../data/api';
import type { Screen } from '../data/rbac';
import { quandoFoi } from '../data/tempo';
import {
  AbasDeFiltro, Aviso, BOTAO_PERIGO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, Busca, CAMPO, Carregando, Indicador, Interruptor,
  Janela, ROTULO,
} from './settings/ui';

/**
 * Pedidos de compra, de `/api/compras`, da solicitação ao recebimento.
 *
 * A tela abre no que pede ação de quem está olhando: quem aprova cai em
 * "Aguardando aprovação"; quem só pede, nos próprios pedidos. Os botões de
 * cada pedido seguem as regras que a API também impõe — quem pediu não
 * aprova o próprio pedido, e cada passo só sai do anterior certo.
 */

const STATUS: Record<StatusPedido, { rotulo: string; classe: string }> = {
  solicitado: { rotulo: 'Aguardando aprovação', classe: 'bg-amber-100 text-amber-800' },
  aprovado: { rotulo: 'Aprovado, a comprar', classe: 'bg-blue-100 text-blue-700' },
  comprado: { rotulo: 'Comprado, a receber', classe: 'bg-purple-100 text-purple-700' },
  recebido: { rotulo: 'Recebido', classe: 'bg-green-100 text-green-700' },
  recusado: { rotulo: 'Recusado', classe: 'bg-red-100 text-red-700' },
  cancelado: { rotulo: 'Cancelado', classe: 'bg-gray-100 text-gray-700' },
};

type Filtro = 'meus' | 'solicitado' | 'aprovado' | 'comprado' | 'concluidos' | 'todos';

const ETAPA: Record<string, string> = {
  solicitado: 'Pedido feito', decidido: 'Decisão', comprado: 'Compra registrada', recebido: 'Recebido', cancelado: 'Cancelado',
};

export function ComprasScreen({ onNavigate }: { onNavigate?: (tela: Screen) => void }) {
  const { tenantId, user, can } = useAuth();
  const aprova = can('purchases', 'edit');
  const [pedidos, setPedidos] = useState<PedidoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>(aprova ? 'solicitado' : 'meus');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<PedidoResumo | null>(null);
  const [novo, setNovo] = useState(false);

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    setCarregando(true);
    try {
      const lista = await fetchPedidos(tenantId);
      setPedidos(lista);
      setAberto((a) => (a ? lista.find((p) => p.id === a.id) ?? null : null));
      setErro(null);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível carregar os pedidos.');
    } finally {
      setCarregando(false);
    }
  }, [tenantId]);

  useEffect(() => { carregar(); }, [carregar]);

  const conta = (s: StatusPedido) => pedidos.filter((p) => p.status === s).length;
  const urgentesAbertos = pedidos.filter((p) => p.urgente && ['solicitado', 'aprovado', 'comprado'].includes(p.status)).length;
  const mes = new Date().toISOString().slice(0, 7);
  const gastoNoMes = pedidos
    .filter((p) => p.valorFinal != null && (p.status === 'comprado' || p.status === 'recebido'))
    .filter((p) => p.trilha.some((t) => t.etapa === 'comprado' && t.quando.slice(0, 7) === mes))
    .reduce((soma, p) => soma + (p.valorFinal ?? 0), 0);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return pedidos
      .filter((p) => {
        if (filtro === 'todos') return true;
        if (filtro === 'meus') return p.solicitanteId === user?.id;
        if (filtro === 'concluidos') return ['recebido', 'recusado', 'cancelado'].includes(p.status);
        return p.status === filtro;
      })
      .filter((p) => !termo || `${p.numero} ${p.titulo} ${p.solicitanteNome} ${p.fornecedor ?? ''} ${p.itens.map((i) => i.descricao).join(' ')}`.toLowerCase().includes(termo))
      // Urgente primeiro dentro do filtro; depois o mais recente.
      .sort((a, b) => Number(b.urgente) - Number(a.urgente) || b.criadoEm.localeCompare(a.criadoEm));
  }, [pedidos, filtro, busca, user?.id]);

  const depoisDe = (mensagem: string) => {
    setAviso(mensagem);
    carregar();
  };

  return (
    <main className="flex-1 space-y-6 px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-gray-900">Compras</h1>
          <p className="mt-1 text-sm text-gray-600">Peça material, acompanhe a aprovação e confirme quando chegar.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={carregar} disabled={carregando} className={BOTAO_SECUNDARIO}>
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} aria-hidden="true" /> Atualizar
          </button>
          {can('purchases', 'create') && (
            <button type="button" onClick={() => setNovo(true)} className={BOTAO_PRIMARIO}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Novo pedido
            </button>
          )}
        </div>
      </div>

      {aviso && <Aviso tom="sucesso">{aviso}</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Indicador rotulo="Aguardando aprovação" valor={conta('solicitado')} tom={conta('solicitado') ? 'atencao' : 'neutro'} />
        <Indicador rotulo="A comprar" valor={conta('aprovado')} />
        <Indicador rotulo="Urgentes em aberto" valor={urgentesAbertos} tom={urgentesAbertos ? 'critico' : 'neutro'} />
        <Indicador rotulo="Gasto no mês" valor={formatarReais(gastoNoMes)} detalhe="compras registradas neste mês" />
      </dl>

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 xl:flex-row xl:items-center">
          <AbasDeFiltro
            rotulo="Filtrar pedidos"
            valor={filtro}
            aoMudar={setFiltro}
            opcoes={[
              { valor: 'meus', rotulo: 'Meus pedidos', contagem: pedidos.filter((p) => p.solicitanteId === user?.id).length },
              { valor: 'solicitado', rotulo: 'Aguardando', contagem: conta('solicitado') },
              { valor: 'aprovado', rotulo: 'A comprar', contagem: conta('aprovado') },
              { valor: 'comprado', rotulo: 'A receber', contagem: conta('comprado') },
              { valor: 'concluidos', rotulo: 'Concluídos', contagem: conta('recebido') + conta('recusado') + conta('cancelado') },
              { valor: 'todos', rotulo: 'Todos', contagem: pedidos.length },
            ]}
          />
          <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar nº, item, pessoa ou fornecedor" />
        </div>

        {carregando && pedidos.length === 0 ? (
          <div className="px-4"><Carregando /></div>
        ) : visiveis.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <ShoppingCart className="mx-auto h-8 w-8 text-gray-400" aria-hidden="true" />
            <p className="mt-2 text-sm text-gray-700">{pedidos.length === 0 ? 'Nenhum pedido de compra ainda.' : 'Nada por aqui com esse filtro.'}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visiveis.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setAberto(p)}
                  className="grid w-full grid-cols-1 gap-2 px-4 py-4 text-left transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none md:grid-cols-[4rem_minmax(0,1fr)_9rem_12rem] md:items-center md:gap-4"
                >
                  <span className="text-sm text-gray-600">nº {p.numero}</span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-medium text-gray-900">
                      {p.urgente && <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-xs text-red-700"><Zap className="h-3 w-3" aria-hidden="true" />Urgente</span>}
                      <span className="truncate">{p.titulo}</span>
                    </p>
                    <p className="truncate text-xs text-gray-600">
                      {p.solicitanteNome} · {quandoFoi(p.criadoEm)} · {p.itens.length} {p.itens.length === 1 ? 'item' : 'itens'}
                    </p>
                  </div>
                  <p className="text-sm text-gray-900 md:text-right">
                    {p.valorFinal != null ? formatarReais(p.valorFinal) : p.valorEstimado != null ? <span className="text-gray-600">≈ {formatarReais(p.valorEstimado)}</span> : '—'}
                  </p>
                  <div className="md:text-right">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${STATUS[p.status].classe}`}>{STATUS[p.status].rotulo}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {aberto && (
        <DetalhePedido
          pedido={aberto}
          aoFechar={() => setAberto(null)}
          aoMudar={(mensagem) => { setAberto(null); depoisDe(mensagem); }}
          onNavigate={onNavigate}
        />
      )}

      {novo && (
        <NovoPedido
          aoFechar={() => setNovo(false)}
          aoCriar={(p) => { setNovo(false); setFiltro('meus'); depoisDe(`Pedido nº ${p.numero} enviado para aprovação.`); }}
        />
      )}
    </main>
  );
}

type Acao = 'recusar' | 'comprar' | 'cancelar' | null;

function DetalhePedido({ pedido: p, aoFechar, aoMudar, onNavigate }: {
  pedido: PedidoResumo; aoFechar: () => void; aoMudar: (mensagem: string) => void; onNavigate?: (tela: Screen) => void;
}) {
  const { tenantId, user, can } = useAuth();
  const [acao, setAcao] = useState<Acao>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const meu = p.solicitanteId === user?.id;
  const aprova = can('purchases', 'edit');

  const podeDecidir = aprova && !meu && p.status === 'solicitado';
  const podeComprar = aprova && p.status === 'aprovado';
  const podeReceber = can('purchases', 'create') && p.status === 'comprado';
  const podeCancelar = ['solicitado', 'aprovado', 'comprado'].includes(p.status) && (aprova || (meu && p.status === 'solicitado'));

  const executar = async (fazer: () => Promise<unknown>, mensagem: string) => {
    setEnviando(true);
    setErro(null);
    try {
      await fazer();
      aoMudar(mensagem);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível concluir.');
      setEnviando(false);
    }
  };

  if (acao === 'recusar' || acao === 'cancelar') {
    return (
      <JanelaMotivo
        titulo={acao === 'recusar' ? `Recusar o pedido nº ${p.numero}?` : `Cancelar o pedido nº ${p.numero}?`}
        explicacao={acao === 'recusar' ? 'Quem pediu vê o motivo. Seja específico: ajuda a pedir certo da próxima vez.' : 'O pedido sai das listas em aberto e fica no histórico com o motivo.'}
        acao={acao === 'recusar' ? 'Recusar pedido' : 'Cancelar pedido'}
        aoVoltar={() => setAcao(null)}
        aoConfirmar={async (motivo) => {
          if (!tenantId) return;
          if (acao === 'recusar') await recusarPedido(tenantId, p.id, motivo);
          else await cancelarPedido(tenantId, p.id, motivo);
          aoMudar(acao === 'recusar' ? `Pedido nº ${p.numero} recusado.` : `Pedido nº ${p.numero} cancelado.`);
        }}
      />
    );
  }

  if (acao === 'comprar') {
    return <JanelaCompra pedido={p} aoVoltar={() => setAcao(null)} aoRegistrar={() => aoMudar(`Compra do pedido nº ${p.numero} registrada.`)} onNavigate={onNavigate} />;
  }

  const temAcao = podeDecidir || podeComprar || podeReceber || podeCancelar;

  return (
    <Janela
      titulo={`Pedido nº ${p.numero}`}
      descricao={p.titulo}
      aoFechar={aoFechar}
      bloqueada={enviando}
      largura="max-w-2xl"
      rodape={temAcao && (
        <>
          {podeCancelar && <button type="button" onClick={() => setAcao('cancelar')} disabled={enviando} className={`${BOTAO_SECUNDARIO} mr-auto`}>Cancelar pedido</button>}
          {podeDecidir && <button type="button" onClick={() => setAcao('recusar')} disabled={enviando} className={`${BOTAO_SECUNDARIO} text-red-700`}>Recusar</button>}
          {podeDecidir && (
            <button type="button" disabled={enviando} onClick={() => tenantId && executar(() => aprovarPedido(tenantId, p.id), `Pedido nº ${p.numero} aprovado.`)} className={BOTAO_PRIMARIO}>
              Aprovar
            </button>
          )}
          {podeComprar && <button type="button" onClick={() => setAcao('comprar')} disabled={enviando} className={BOTAO_PRIMARIO}>Registrar compra</button>}
          {podeReceber && (
            <button type="button" disabled={enviando} onClick={() => tenantId && executar(() => confirmarRecebimento(tenantId, p.id), `Recebimento do pedido nº ${p.numero} confirmado.`)} className={BOTAO_PRIMARIO}>
              <PackageCheck className="h-4 w-4" aria-hidden="true" /> Confirmar recebimento
            </button>
          )}
        </>
      )}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs ${STATUS[p.status].classe}`}>{STATUS[p.status].rotulo}</span>
          {p.urgente && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs text-red-700"><Zap className="h-3 w-3" aria-hidden="true" />Urgente</span>}
        </div>

        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {meu && aprova && p.status === 'solicitado' && (
          <Aviso>Você fez este pedido, então a aprovação fica com outra pessoa que tenha essa permissão.</Aviso>
        )}
        {p.motivoRecusa && <Aviso tom="erro">Recusado: {p.motivoRecusa}</Aviso>}
        {p.motivoCancelamento && <Aviso>Cancelado: {p.motivoCancelamento}</Aviso>}

        {p.justificativa && (
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Por que é preciso</p>
            <p className="mt-1 whitespace-pre-line text-sm text-gray-800">{p.justificativa}</p>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-600">
              <tr>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 text-right font-medium">Qtd.</th>
                <th className="px-3 py-2 text-right font-medium">Preço estimado</th>
                <th className="px-3 py-2 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {p.itens.map((i, n) => (
                <tr key={n}>
                  <td className="px-3 py-2 text-gray-900">{i.descricao}</td>
                  <td className="px-3 py-2 text-right text-gray-800">{i.quantidade.toLocaleString('pt-BR')} {i.unidade}</td>
                  <td className="px-3 py-2 text-right text-gray-800">{formatarReais(i.valorUnitario)}</td>
                  <td className="px-3 py-2 text-right text-gray-900">{i.valorUnitario != null ? formatarReais(i.valorUnitario * i.quantidade) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 text-sm">
              <tr>
                <td colSpan={3} className="px-3 py-2 text-right text-gray-700">Estimado</td>
                <td className="px-3 py-2 text-right text-gray-900">{formatarReais(p.valorEstimado)}</td>
              </tr>
              {p.valorFinal != null && (
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-right font-medium text-gray-900">Pago{p.fornecedor ? ` a ${p.fornecedor}` : ''}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900">{formatarReais(p.valorFinal)}</td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>

        {p.contratoObjeto && <p className="text-sm text-gray-700">Contrato vinculado: <strong className="text-gray-900">{p.contratoObjeto}</strong></p>}

        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">Andamento</p>
          <ol className="space-y-2">
            {p.trilha.map((t, n) => {
              const negativa = t.etapa === 'cancelado' || (t.etapa === 'decidido' && p.status === 'recusado');
              return (
                <li key={n} className="flex items-start gap-2 text-sm">
                  {negativa ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-700" aria-hidden="true" />}
                  <span className="text-gray-800">
                    <strong className="font-medium text-gray-900">{t.etapa === 'decidido' ? (p.status === 'recusado' ? 'Recusado' : 'Aprovado') : ETAPA[t.etapa]}</strong>
                    {t.quem && ` por ${t.quem}`} · {new Date(t.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </li>
              );
            })}
            {['solicitado', 'aprovado', 'comprado'].includes(p.status) && (
              <li className="flex items-start gap-2 text-sm text-gray-600">
                <Circle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {p.status === 'solicitado' ? 'Próximo: aprovação' : p.status === 'aprovado' ? 'Próximo: compra' : 'Próximo: recebimento'}
              </li>
            )}
          </ol>
        </div>
      </div>
    </Janela>
  );
}

const ITEM_VAZIO = { descricao: '', quantidade: '1', unidade: 'un', valorUnitario: '' };

function NovoPedido({ aoFechar, aoCriar }: { aoFechar: () => void; aoCriar: (p: PedidoResumo) => void }) {
  const { tenantId } = useAuth();
  const [titulo, setTitulo] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [urgente, setUrgente] = useState(false);
  const [itens, setItens] = useState([{ ...ITEM_VAZIO }]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const numero = (v: string) => (v.trim() ? Number(v.replace(/\./g, '').replace(',', '.')) : null);
  const muda = (n: number, campo: keyof typeof ITEM_VAZIO, valor: string) =>
    setItens((lista) => lista.map((i, k) => (k === n ? { ...i, [campo]: valor } : i)));

  const preenchidos = itens.filter((i) => i.descricao.trim());
  const estimado = preenchidos.reduce((soma, i) => {
    const q = numero(i.quantidade);
    const v = numero(i.valorUnitario);
    return q && v ? soma + q * v : soma;
  }, 0);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (titulo.trim().length < 3) return setErro('Dê um título ao pedido (ex.: "Luvas e máscaras para a ala B").');
    if (preenchidos.length === 0) return setErro('Inclua pelo menos um item.');
    const convertidos: ItemPedido[] = [];
    for (const i of preenchidos) {
      const q = numero(i.quantidade);
      const v = numero(i.valorUnitario);
      if (!q || q <= 0 || Number.isNaN(q)) return setErro(`Quantidade inválida em "${i.descricao}".`);
      if (v !== null && (Number.isNaN(v) || v < 0)) return setErro(`Preço inválido em "${i.descricao}".`);
      convertidos.push({ descricao: i.descricao.trim(), quantidade: q, unidade: i.unidade.trim() || 'un', valorUnitario: v });
    }
    if (!tenantId) return;
    setEnviando(true);
    setErro(null);
    try {
      aoCriar(await criarPedido(tenantId, { titulo: titulo.trim(), justificativa: justificativa.trim() || undefined, urgente, itens: convertidos }));
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível enviar o pedido.');
      setEnviando(false);
    }
  };

  return (
    <Janela
      titulo="Novo pedido de compra"
      descricao="Vai para aprovação. Você acompanha o andamento em Meus pedidos."
      aoFechar={aoFechar}
      bloqueada={enviando}
      largura="max-w-3xl"
      rodape={
        <>
          <span className="mr-auto text-sm text-gray-700">Estimado: <strong className="text-gray-900">{estimado ? formatarReais(estimado) : '—'}</strong></span>
          <button type="button" onClick={aoFechar} disabled={enviando} className={BOTAO_SECUNDARIO}>Cancelar</button>
          <button type="submit" form="form-pedido" disabled={enviando} className={BOTAO_PRIMARIO}>{enviando ? 'Enviando…' : 'Enviar para aprovação'}</button>
        </>
      }
    >
      <form id="form-pedido" onSubmit={enviar} noValidate className="space-y-4">
        <label className="block"><span className={ROTULO}>Título *</span>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={160} placeholder="Ex.: Reposição de fraldas geriátricas" className={CAMPO} />
        </label>
        <label className="block"><span className={ROTULO}>Por que é preciso</span>
          <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} maxLength={1000} rows={2} placeholder="Ajuda quem aprova a decidir rápido." className={CAMPO} />
        </label>

        <fieldset>
          <legend className={ROTULO}>Itens *</legend>
          <div className="space-y-2">
            {itens.map((i, n) => (
              <div key={n} className="grid grid-cols-[minmax(0,1fr)_5rem_4.5rem_7rem_2.25rem] items-center gap-2">
                <input aria-label={`Item ${n + 1}`} value={i.descricao} onChange={(e) => muda(n, 'descricao', e.target.value)} maxLength={200} placeholder="Descrição" className={CAMPO} />
                <input aria-label={`Quantidade do item ${n + 1}`} value={i.quantidade} onChange={(e) => muda(n, 'quantidade', e.target.value)} inputMode="decimal" className={CAMPO} />
                <input aria-label={`Unidade do item ${n + 1}`} value={i.unidade} onChange={(e) => muda(n, 'unidade', e.target.value)} maxLength={20} className={CAMPO} />
                <input aria-label={`Preço unitário estimado do item ${n + 1}`} value={i.valorUnitario} onChange={(e) => muda(n, 'valorUnitario', e.target.value)} inputMode="decimal" placeholder="R$ (opc.)" className={CAMPO} />
                <button
                  type="button"
                  onClick={() => setItens((lista) => (lista.length > 1 ? lista.filter((_, k) => k !== n) : [{ ...ITEM_VAZIO }]))}
                  aria-label={`Remover item ${n + 1}`}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-600">Quantidade, unidade (un, cx, pct, L…) e, se souber, o preço estimado de cada um.</p>
          {itens.length < 50 && (
            <button type="button" onClick={() => setItens((lista) => [...lista, { ...ITEM_VAZIO }])} className="mt-2 inline-flex items-center gap-1 text-sm text-marca-texto hover:underline">
              <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar item
            </button>
          )}
        </fieldset>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Urgente</p>
            <p className="text-xs text-gray-600">Aparece no topo da lista de quem aprova. Use para falta que afeta o cuidado.</p>
          </div>
          <Interruptor rotulo="Urgente" ligado={urgente} aoMudar={setUrgente} />
        </div>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Janela>
  );
}

function JanelaCompra({ pedido, aoVoltar, aoRegistrar, onNavigate }: {
  pedido: PedidoResumo; aoVoltar: () => void; aoRegistrar: () => void; onNavigate?: (tela: Screen) => void;
}) {
  const { tenantId, can } = useAuth();
  const [fornecedor, setFornecedor] = useState(pedido.fornecedor ?? '');
  const [valor, setValor] = useState(pedido.valorEstimado != null ? pedido.valorEstimado.toFixed(2).replace('.', ',') : '');
  const [contratoId, setContratoId] = useState('');
  const [contratos, setContratos] = useState<ContratoResumo[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId || !can('contracts', 'view')) return;
    fetchContratos(tenantId).then((l) => setContratos(l.filter((c) => c.situacao !== 'encerrado'))).catch(() => undefined);
  }, [tenantId, can]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = Number(valor.replace(/\./g, '').replace(',', '.'));
    if (fornecedor.trim().length < 2) return setErro('Informe de quem foi comprado.');
    if (!valor.trim() || Number.isNaN(v) || v < 0) return setErro('Informe o valor pago.');
    if (!tenantId) return;
    setEnviando(true);
    setErro(null);
    try {
      await registrarCompra(tenantId, pedido.id, { fornecedor: fornecedor.trim(), valorFinal: v, contratoId: contratoId || null });
      aoRegistrar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível registrar a compra.');
      setEnviando(false);
    }
  };

  return (
    <Janela
      titulo={`Registrar compra do pedido nº ${pedido.numero}`}
      descricao={pedido.titulo}
      aoFechar={aoVoltar}
      bloqueada={enviando}
      rodape={
        <>
          <button type="button" onClick={aoVoltar} disabled={enviando} className={BOTAO_SECUNDARIO}>Voltar</button>
          <button type="submit" form="form-compra" disabled={enviando} className={BOTAO_PRIMARIO}>{enviando ? 'Registrando…' : 'Registrar compra'}</button>
        </>
      }
    >
      <form id="form-compra" onSubmit={enviar} noValidate className="space-y-4">
        <label className="block"><span className={ROTULO}>Fornecedor *</span>
          <input value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} maxLength={120} className={CAMPO} />
        </label>
        <label className="block"><span className={ROTULO}>Valor pago (R$) *</span>
          <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className={CAMPO} />
          {pedido.valorEstimado != null && <span className="mt-1 block text-xs text-gray-600">Estimado no pedido: {formatarReais(pedido.valorEstimado)}</span>}
        </label>
        {contratos.length > 0 && (
          <label className="block"><span className={ROTULO}>Contrato (opcional)</span>
            <select
              value={contratoId}
              onChange={(e) => {
                setContratoId(e.target.value);
                const c = contratos.find((x) => x.id === e.target.value);
                if (c && !fornecedor.trim()) setFornecedor(c.fornecedor);
              }}
              className={CAMPO}
            >
              <option value="">Sem contrato</option>
              {contratos.map((c) => <option key={c.id} value={c.id}>{c.objeto} — {c.fornecedor}</option>)}
            </select>
          </label>
        )}
        {contratos.length === 0 && can('contracts', 'view') && onNavigate && (
          <p className="text-xs text-gray-600">
            Compra de fornecedor fixo? Cadastre o contrato em{' '}
            <button type="button" onClick={() => onNavigate('contratos')} className="text-marca-texto underline">Contratos</button> para vincular.
          </p>
        )}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Janela>
  );
}

function JanelaMotivo({ titulo, explicacao, acao, aoVoltar, aoConfirmar }: {
  titulo: string; explicacao: string; acao: string; aoVoltar: () => void; aoConfirmar: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  return (
    <Janela
      titulo={titulo}
      aoFechar={aoVoltar}
      bloqueada={enviando}
      rodape={
        <>
          <button type="button" onClick={aoVoltar} disabled={enviando} className={BOTAO_SECUNDARIO}>Voltar</button>
          <button
            type="button"
            disabled={enviando || motivo.trim().length < 5}
            onClick={async () => {
              setEnviando(true);
              try { await aoConfirmar(motivo.trim()); } catch (err) {
                setErro(err instanceof ApiError ? err.message : 'Não foi possível concluir.');
                setEnviando(false);
              }
            }}
            className={BOTAO_PERIGO}
          >
            {enviando ? 'Enviando…' : acao}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-700">{explicacao}</p>
      <label className="mt-4 block"><span className={ROTULO}>Motivo *</span>
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={500} className={CAMPO} />
        <span className="mt-1 block text-xs text-gray-600">Pelo menos 5 caracteres.</span>
      </label>
      {erro && <div className="mt-4"><Aviso tom="erro">{erro}</Aviso></div>}
    </Janela>
  );
}
