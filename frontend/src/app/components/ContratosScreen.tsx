import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, FileSignature, Plus, RefreshCw, Repeat } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  ApiError, criarContrato, editarContrato, encerrarContrato, fetchContratos, formatarReais,
  type CategoriaContrato, type ContratoPayload, type ContratoResumo, type SituacaoContrato,
} from '../data/api';
import { diasAte, formatarDia } from '../data/tempo';
import {
  AbasDeFiltro, Aviso, BOTAO_PERIGO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, Busca, CAMPO, Carregando, Dado,
  Indicador, Interruptor, Janela, ROTULO,
} from './settings/ui';

/**
 * Contratos com fornecedores e prestadores, de `/api/contratos`.
 *
 * A pergunta que a tela responde primeiro é "o que eu preciso decidir e até
 * quando": contrato entra em "vencendo" quando chega a janela do aviso
 * prévio, e a data limite aparece na lista. A situação vem calculada do
 * servidor, no fuso da clínica.
 */

export const CATEGORIAS: Record<CategoriaContrato, string> = {
  servico: 'Serviço', manutencao: 'Manutenção', locacao: 'Locação',
  fornecimento: 'Fornecimento', software: 'Software', outro: 'Outro',
};

const SITUACAO: Record<SituacaoContrato, { rotulo: string; classe: string }> = {
  agendado: { rotulo: 'Começa em breve', classe: 'bg-blue-100 text-blue-700' },
  vigente: { rotulo: 'Vigente', classe: 'bg-green-100 text-green-700' },
  vencendo: { rotulo: 'Decidir renovação', classe: 'bg-amber-100 text-amber-800' },
  vencido: { rotulo: 'Vencido', classe: 'bg-red-100 text-red-700' },
  encerrado: { rotulo: 'Encerrado', classe: 'bg-gray-100 text-gray-700' },
};

type Filtro = 'ativos' | 'vencendo' | 'vencidos' | 'encerrados';

const ativo = (c: ContratoResumo) => c.situacao !== 'encerrado';

export const formatarDocumento = (doc: string | null) => {
  if (!doc) return null;
  if (doc.length === 14) return doc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (doc.length === 11) return doc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return doc;
};

export function ContratosScreen() {
  const { tenantId, can } = useAuth();
  const [contratos, setContratos] = useState<ContratoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('ativos');
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState<'todas' | CategoriaContrato>('todas');
  const [aberto, setAberto] = useState<ContratoResumo | null>(null);
  const [formulario, setFormulario] = useState<'novo' | ContratoResumo | null>(null);
  const [encerrando, setEncerrando] = useState<ContratoResumo | null>(null);

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    setCarregando(true);
    try {
      const lista = await fetchContratos(tenantId);
      setContratos(lista);
      setAberto((a) => (a ? lista.find((c) => c.id === a.id) ?? null : null));
      setErro(null);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível carregar os contratos.');
    } finally {
      setCarregando(false);
    }
  }, [tenantId]);

  useEffect(() => { carregar(); }, [carregar]);

  const ativos = contratos.filter(ativo);
  const vencendo = contratos.filter((c) => c.situacao === 'vencendo');
  const vencidos = contratos.filter((c) => c.situacao === 'vencido');
  const custoMensal = ativos
    .filter((c) => c.situacao === 'vigente' || c.situacao === 'vencendo')
    .reduce((soma, c) => soma + (c.valorMensal ?? 0), 0);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return contratos
      .filter((c) => ({
        ativos: ativo(c), vencendo: c.situacao === 'vencendo', vencidos: c.situacao === 'vencido', encerrados: !ativo(c),
      })[filtro])
      .filter((c) => categoria === 'todas' || c.categoria === categoria)
      .filter((c) => !termo || `${c.objeto} ${c.fornecedor} ${c.numero ?? ''}`.toLowerCase().includes(termo));
  }, [contratos, filtro, categoria, busca]);

  return (
    <main className="flex-1 space-y-6 px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-gray-900">Contratos</h1>
          <p className="mt-1 text-sm text-gray-600">Fornecedores e prestadores da clínica, com prazos e renovações.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={carregar} disabled={carregando} className={BOTAO_SECUNDARIO}>
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} aria-hidden="true" /> Atualizar
          </button>
          {can('contracts', 'create') && (
            <button type="button" onClick={() => setFormulario('novo')} className={BOTAO_PRIMARIO}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Novo contrato
            </button>
          )}
        </div>
      </div>

      {aviso && <Aviso tom="sucesso">{aviso}</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Indicador rotulo="Contratos ativos" valor={ativos.length} />
        <Indicador rotulo="Custo mensal" valor={formatarReais(custoMensal)} detalhe="soma dos vigentes com valor mensal" />
        <Indicador rotulo="Decidir renovação" valor={vencendo.length} tom={vencendo.length ? 'atencao' : 'neutro'} />
        <Indicador rotulo="Vencidos" valor={vencidos.length} tom={vencidos.length ? 'critico' : 'neutro'} detalhe="sem renovação automática" />
      </dl>

      {vencendo.length > 0 && filtro !== 'vencendo' && (
        <Aviso>
          {vencendo.length === 1 ? '1 contrato entrou' : `${vencendo.length} contratos entraram`} no prazo de aviso prévio.{' '}
          <button type="button" onClick={() => setFiltro('vencendo')} className="font-medium underline">Ver quais</button>
        </Aviso>
      )}

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 xl:flex-row xl:items-center">
          <AbasDeFiltro
            rotulo="Filtrar contratos"
            valor={filtro}
            aoMudar={setFiltro}
            opcoes={[
              { valor: 'ativos', rotulo: 'Ativos', contagem: ativos.length },
              { valor: 'vencendo', rotulo: 'Decidir', contagem: vencendo.length },
              { valor: 'vencidos', rotulo: 'Vencidos', contagem: vencidos.length },
              { valor: 'encerrados', rotulo: 'Encerrados', contagem: contratos.length - ativos.length },
            ]}
          />
          <div className="flex flex-1 flex-col gap-3 sm:flex-row">
            <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar objeto, fornecedor ou número" />
            <select
              aria-label="Categoria"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as typeof categoria)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-marca-viva"
            >
              <option value="todas">Todas as categorias</option>
              {Object.entries(CATEGORIAS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </div>
        </div>

        {carregando && contratos.length === 0 ? (
          <div className="px-4"><Carregando /></div>
        ) : visiveis.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <FileSignature className="mx-auto h-8 w-8 text-gray-400" aria-hidden="true" />
            <p className="mt-2 text-sm text-gray-700">{contratos.length === 0 ? 'Nenhum contrato cadastrado ainda.' : 'Nenhum contrato com esse filtro.'}</p>
            {contratos.length === 0 && can('contracts', 'create') && (
              <button type="button" onClick={() => setFormulario('novo')} className={`${BOTAO_SECUNDARIO} mt-4`}>Cadastrar o primeiro</button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visiveis.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setAberto(c)}
                  className="grid w-full grid-cols-1 gap-2 px-4 py-4 text-left transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_8rem_10rem] md:items-center md:gap-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{c.objeto}</p>
                    <p className="truncate text-xs text-gray-600">{c.fornecedor} · {CATEGORIAS[c.categoria]}{c.numero ? ` · nº ${c.numero}` : ''}</p>
                  </div>
                  <p className="text-sm text-gray-700">
                    {formatarDia(c.inicio)} – {c.fim ? formatarDia(c.fim) : 'indeterminado'}
                    {c.renovacaoAutomatica && <Repeat className="ml-1.5 inline h-3.5 w-3.5 text-gray-500" aria-label="renovação automática" />}
                  </p>
                  <p className="text-sm text-gray-900 md:text-right">{c.valorMensal != null ? `${formatarReais(c.valorMensal)}/mês` : '—'}</p>
                  <div className="md:text-right">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${SITUACAO[c.situacao].classe}`}>{SITUACAO[c.situacao].rotulo}</span>
                    {c.situacao === 'vencendo' && c.decidirAte && (
                      <p className="mt-0.5 text-xs text-amber-800">até {formatarDia(c.decidirAte)}</p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {aberto && (
        <DetalheContrato
          contrato={aberto}
          aoFechar={() => setAberto(null)}
          // Uma janela por vez: com duas abertas, o Esc fecharia as duas.
          aoEditar={can('contracts', 'edit') && ativo(aberto) ? () => { setFormulario(aberto); setAberto(null); } : undefined}
          aoEncerrar={can('contracts', 'edit') && ativo(aberto) ? () => { setEncerrando(aberto); setAberto(null); } : undefined}
        />
      )}

      {formulario && (
        <FormularioContrato
          contrato={formulario === 'novo' ? null : formulario}
          aoFechar={() => setFormulario(null)}
          aoSalvar={async (dados) => {
            if (!tenantId) return;
            const salvo = formulario === 'novo'
              ? await criarContrato(tenantId, dados)
              : await editarContrato(tenantId, formulario.id, dados);
            setFormulario(null);
            setAviso(formulario === 'novo' ? `Contrato "${salvo.objeto}" cadastrado.` : 'Contrato atualizado.');
            await carregar();
            setAberto(salvo);
          }}
        />
      )}

      {encerrando && (
        <JanelaEncerrar
          contrato={encerrando}
          aoFechar={() => setEncerrando(null)}
          aoEncerrar={async (motivo) => {
            if (!tenantId) return;
            await encerrarContrato(tenantId, encerrando.id, motivo);
            setEncerrando(null);
            setAviso(`Contrato "${encerrando.objeto}" encerrado.`);
            carregar();
          }}
        />
      )}
    </main>
  );
}

function DetalheContrato({ contrato: c, aoFechar, aoEditar, aoEncerrar }: {
  contrato: ContratoResumo; aoFechar: () => void; aoEditar?: () => void; aoEncerrar?: () => void;
}) {
  const faltam = c.fim ? diasAte(c.fim) : null;
  return (
    <Janela
      titulo={c.objeto}
      descricao={`${c.fornecedor} · ${CATEGORIAS[c.categoria]}`}
      aoFechar={aoFechar}
      largura="max-w-2xl"
      rodape={(aoEditar || aoEncerrar) && (
        <>
          {aoEncerrar && <button type="button" onClick={aoEncerrar} className={`${BOTAO_SECUNDARIO} text-red-700`}>Encerrar contrato</button>}
          {aoEditar && <button type="button" onClick={aoEditar} className={BOTAO_PRIMARIO}>Editar</button>}
        </>
      )}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs ${SITUACAO[c.situacao].classe}`}>{SITUACAO[c.situacao].rotulo}</span>
          {c.situacao === 'vencendo' && c.decidirAte && (
            <span className="inline-flex items-center gap-1 text-sm text-amber-800">
              <CalendarClock className="h-4 w-4" aria-hidden="true" /> Decida até {formatarDia(c.decidirAte)}
            </span>
          )}
          {faltam != null && faltam >= 0 && c.situacao !== 'encerrado' && (
            <span className="text-sm text-gray-600">{faltam === 0 ? 'Termina hoje' : `Termina em ${faltam} dia(s)`}</span>
          )}
        </div>

        {c.situacao === 'encerrado' && c.motivoEncerramento && (
          <Aviso>Encerrado em {c.encerradoEm ? new Date(c.encerradoEm).toLocaleDateString('pt-BR') : '—'}: {c.motivoEncerramento}</Aviso>
        )}

        <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Dado rotulo="Fornecedor">{c.fornecedor}{c.fornecedorDocumento && <span className="block text-xs text-gray-600">{formatarDocumento(c.fornecedorDocumento)}</span>}</Dado>
          <Dado rotulo="Número">{c.numero ?? '—'}</Dado>
          <Dado rotulo="Vigência">{formatarDia(c.inicio)} até {c.fim ? formatarDia(c.fim) : 'prazo indeterminado'}</Dado>
          <Dado rotulo="Valor mensal">{c.valorMensal != null ? formatarReais(c.valorMensal) : 'Não informado'}</Dado>
          <Dado rotulo="Renovação">{c.renovacaoAutomatica ? 'Automática' : 'Manual'} · aviso prévio de {c.avisoPrevioDias} dias</Dado>
          <Dado rotulo="Responsável">{c.responsavel ?? '—'}</Dado>
          <Dado rotulo="Pedidos de compra">{c.pedidosVinculados === 0 ? 'Nenhum vinculado' : `${c.pedidosVinculados} vinculado(s)`}</Dado>
          <Dado rotulo="Cadastrado">{c.criadoPorNome ?? '—'} em {new Date(c.criadoEm).toLocaleDateString('pt-BR')}</Dado>
        </dl>

        {c.observacoes && (
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Observações</p>
            <p className="mt-1 whitespace-pre-line text-sm text-gray-800">{c.observacoes}</p>
          </div>
        )}
      </div>
    </Janela>
  );
}

function FormularioContrato({ contrato, aoFechar, aoSalvar }: {
  contrato: ContratoResumo | null; aoFechar: () => void; aoSalvar: (dados: ContratoPayload) => Promise<void>;
}) {
  const [d, setD] = useState({
    objeto: contrato?.objeto ?? '',
    fornecedor: contrato?.fornecedor ?? '',
    fornecedorDocumento: formatarDocumento(contrato?.fornecedorDocumento ?? null) ?? '',
    numero: contrato?.numero ?? '',
    categoria: contrato?.categoria ?? ('servico' as CategoriaContrato),
    valorMensal: contrato?.valorMensal != null ? String(contrato.valorMensal).replace('.', ',') : '',
    inicio: contrato?.inicio ?? new Date().toISOString().slice(0, 10),
    fim: contrato?.fim ?? '',
    renovacaoAutomatica: contrato?.renovacaoAutomatica ?? false,
    avisoPrevioDias: String(contrato?.avisoPrevioDias ?? 30),
    responsavel: contrato?.responsavel ?? '',
    observacoes: contrato?.observacoes ?? '',
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const muda = <K extends keyof typeof d>(k: K) => (v: (typeof d)[K]) => setD((a) => ({ ...a, [k]: v }));

  const documento = d.fornecedorDocumento.replace(/\D/g, '');
  const valor = d.valorMensal.trim() ? Number(d.valorMensal.replace(/\./g, '').replace(',', '.')) : null;
  const problemas = [
    d.objeto.trim().length < 3 && 'Descreva o objeto do contrato.',
    d.fornecedor.trim().length < 2 && 'Informe o fornecedor.',
    documento && documento.length !== 11 && documento.length !== 14 && 'CNPJ tem 14 dígitos e CPF tem 11.',
    valor !== null && (Number.isNaN(valor) || valor < 0) && 'Valor mensal inválido.',
    !d.inicio && 'Informe o início.',
    d.fim && d.fim < d.inicio && 'O fim não pode ser antes do início.',
  ].filter(Boolean) as string[];

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problemas.length) return setErro(problemas[0]);
    setSalvando(true);
    setErro(null);
    try {
      await aoSalvar({
        objeto: d.objeto.trim(), fornecedor: d.fornecedor.trim(), fornecedorDocumento: documento || undefined,
        numero: d.numero.trim() || undefined, categoria: d.categoria, valorMensal: valor,
        inicio: d.inicio, fim: d.fim || undefined, renovacaoAutomatica: d.renovacaoAutomatica,
        avisoPrevioDias: Math.max(0, Math.min(365, Number(d.avisoPrevioDias) || 0)),
        responsavel: d.responsavel.trim() || undefined, observacoes: d.observacoes.trim() || undefined,
      });
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível salvar.');
      setSalvando(false);
    }
  };

  return (
    <Janela
      titulo={contrato ? 'Editar contrato' : 'Novo contrato'}
      aoFechar={aoFechar}
      bloqueada={salvando}
      largura="max-w-2xl"
      rodape={
        <>
          <button type="button" onClick={aoFechar} disabled={salvando} className={BOTAO_SECUNDARIO}>Cancelar</button>
          <button type="submit" form="form-contrato" disabled={salvando} className={BOTAO_PRIMARIO}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </>
      }
    >
      <form id="form-contrato" onSubmit={enviar} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className={ROTULO}>Objeto *</span>
          <input value={d.objeto} onChange={(e) => muda('objeto')(e.target.value)} maxLength={200} placeholder="Ex.: Manutenção preventiva das câmeras" className={CAMPO} />
        </label>
        <label><span className={ROTULO}>Fornecedor *</span>
          <input value={d.fornecedor} onChange={(e) => muda('fornecedor')(e.target.value)} maxLength={120} className={CAMPO} />
        </label>
        <label><span className={ROTULO}>CNPJ ou CPF</span>
          <input value={d.fornecedorDocumento} onChange={(e) => muda('fornecedorDocumento')(e.target.value)} inputMode="numeric" maxLength={18} className={CAMPO} />
        </label>
        <label><span className={ROTULO}>Categoria *</span>
          <select value={d.categoria} onChange={(e) => muda('categoria')(e.target.value as CategoriaContrato)} className={CAMPO}>
            {Object.entries(CATEGORIAS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </label>
        <label><span className={ROTULO}>Número do contrato</span>
          <input value={d.numero} onChange={(e) => muda('numero')(e.target.value)} maxLength={40} className={CAMPO} />
        </label>
        <label><span className={ROTULO}>Início *</span>
          <input type="date" value={d.inicio} onChange={(e) => muda('inicio')(e.target.value)} className={CAMPO} />
        </label>
        <label><span className={ROTULO}>Fim</span>
          <input type="date" value={d.fim} min={d.inicio} onChange={(e) => muda('fim')(e.target.value)} className={CAMPO} />
          <span className="mt-1 block text-xs text-gray-600">Em branco = prazo indeterminado.</span>
        </label>
        <label><span className={ROTULO}>Valor mensal (R$)</span>
          <input value={d.valorMensal} onChange={(e) => muda('valorMensal')(e.target.value)} inputMode="decimal" placeholder="0,00" className={CAMPO} />
        </label>
        <label><span className={ROTULO}>Aviso prévio (dias)</span>
          <input type="number" min={0} max={365} value={d.avisoPrevioDias} onChange={(e) => muda('avisoPrevioDias')(e.target.value)} className={CAMPO} />
          <span className="mt-1 block text-xs text-gray-600">A tela avisa a partir de quando é preciso decidir.</span>
        </label>
        <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-4 py-3 sm:col-span-2">
          <div>
            <p className="text-sm font-medium text-gray-900">Renovação automática</p>
            <p className="text-xs text-gray-600">Depois do fim, continua valendo até alguém encerrar.</p>
          </div>
          <Interruptor rotulo="Renovação automática" ligado={d.renovacaoAutomatica} aoMudar={muda('renovacaoAutomatica')} />
        </div>
        <label className="sm:col-span-2"><span className={ROTULO}>Responsável na clínica</span>
          <input value={d.responsavel} onChange={(e) => muda('responsavel')(e.target.value)} maxLength={120} className={CAMPO} />
        </label>
        <label className="sm:col-span-2"><span className={ROTULO}>Observações</span>
          <textarea value={d.observacoes} onChange={(e) => muda('observacoes')(e.target.value)} maxLength={2000} rows={3} className={CAMPO} />
        </label>
        {erro && <div className="sm:col-span-2"><Aviso tom="erro">{erro}</Aviso></div>}
      </form>
    </Janela>
  );
}

function JanelaEncerrar({ contrato, aoFechar, aoEncerrar }: {
  contrato: ContratoResumo; aoFechar: () => void; aoEncerrar: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  return (
    <Janela
      titulo="Encerrar contrato?"
      descricao={contrato.objeto}
      aoFechar={aoFechar}
      bloqueada={enviando}
      rodape={
        <>
          <button type="button" onClick={aoFechar} disabled={enviando} className={BOTAO_SECUNDARIO}>Voltar</button>
          <button
            type="button"
            disabled={enviando || motivo.trim().length < 5}
            onClick={async () => {
              setEnviando(true);
              try { await aoEncerrar(motivo.trim()); } catch (err) {
                setErro(err instanceof ApiError ? err.message : 'Não foi possível encerrar.');
                setEnviando(false);
              }
            }}
            className={BOTAO_PERIGO}
          >
            {enviando ? 'Encerrando…' : 'Encerrar'}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-700">O contrato sai da lista de ativos e não pode mais ser editado. Ele continua no histórico.</p>
      <label className="mt-4 block"><span className={ROTULO}>Motivo *</span>
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={500} placeholder="Ex.: Troca de fornecedor a partir de novembro" className={CAMPO} />
      </label>
      {erro && <div className="mt-4"><Aviso tom="erro">{erro}</Aviso></div>}
    </Janela>
  );
}
