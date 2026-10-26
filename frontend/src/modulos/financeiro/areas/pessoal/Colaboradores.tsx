import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useDados, useFinanceiro } from '../../contexto';
import type { Colaborador, Rubrica } from '../../api/tipos';
import { formatarBRL, type Dinheiro } from '../../util/dinheiro';
import { formatarData, hojeISO } from '../../util/datas';
import { VINCULOS } from '../../rotulos';
import { Aviso, Botao, Campo, CampoDinheiro, Carregando, Etiqueta, Janela, Marcador, Seletor, Vazio, cartao, tabela, texto } from '../../ui/base';
import { SeletorCentro, SeletorPessoa, useCadastrosBasicos, type PessoaEscolhida } from '../../ui/seletores';

export function Colaboradores() {
  const { api, pode } = useFinanceiro();
  const [desligados, setDesligados] = useState(false);
  const lista = useDados(() => api.colaboradores(desligados), [api, desligados]);
  const [editando, setEditando] = useState<string | 'novo' | null>(null);
  return (
    <div className={cartao}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3 dark:border-gray-700">
        <Marcador rotulo="Mostrar desligados" checked={desligados} onChange={(e) => setDesligados(e.target.checked)} />
        {pode('pessoal', 'criar') && <Botao variante="primario" pequeno icone={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditando('novo')}>Novo colaborador</Botao>}
      </div>
      {!lista.dados ? <Carregando /> : lista.dados.length === 0 ? (
        <Vazio titulo="Nenhum colaborador.">Cadastre a equipe para calcular a folha. Sócios com pró-labore também entram aqui.</Vazio>
      ) : (
        <table className={tabela.base}>
          <thead className={tabela.cabeca}>
            <tr>
              <th className={tabela.celulaCabeca}>Nome</th>
              <th className={tabela.celulaCabeca}>Vínculo</th>
              <th className={tabela.celulaCabeca}>Centro de custo</th>
              <th className={tabela.celulaCabeca}>Admissão</th>
              <th className={`${tabela.celulaCabeca} text-right`}>Salário</th>
              <th className={`${tabela.celulaCabeca} text-right`} title="Quanto separar por mês para férias e 13º">Provisão/mês</th>
              <th className={tabela.celulaCabeca} />
            </tr>
          </thead>
          <tbody>
            {lista.dados.map((c) => (
              <tr key={c.id} className={tabela.linhaClicavel} onClick={() => setEditando(c.id)}>
                <td className={tabela.celula}>
                  <p className={c.ativo ? texto.titulo : 'text-gray-400 line-through'}>{c.nome}</p>
                  {c.cargo && <p className={`text-xs ${texto.suave}`}>{c.cargo}</p>}
                </td>
                <td className={tabela.celula}><Etiqueta>{VINCULOS[c.vinculo]}</Etiqueta></td>
                <td className={tabela.celula}>{c.centroCustoNome ?? '—'}</td>
                <td className={tabela.celula}>
                  {formatarData(c.dataAdmissao)}
                  {c.dataDesligamento && <p className={`text-xs ${texto.suave}`}>saiu {formatarData(c.dataDesligamento)}</p>}
                </td>
                <td className={tabela.numero}>{formatarBRL(c.salarioBase)}</td>
                <td className={tabela.numero}>{c.provisaoMensal ? formatarBRL(c.provisaoMensal) : '—'}</td>
                <td className={`${tabela.celula} text-right`}><Pencil className="inline h-4 w-4 text-gray-400" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editando && (
        <EditorColaborador
          colaboradorId={editando === 'novo' ? null : editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => lista.recarregar()}
        />
      )}
    </div>
  );
}

function EditorColaborador({ colaboradorId, aoFechar, aoSalvar }: { colaboradorId: string | null; aoFechar: () => void; aoSalvar: () => void }) {
  const { api, avisar, pode } = useFinanceiro();
  const cadastros = useCadastrosBasicos();
  const existente = useDados(() => (colaboradorId ? api.colaborador(colaboradorId) : Promise.resolve(null)), [api, colaboradorId]);
  const rubricas = useDados(() => api.rubricas(), [api]);
  const c = existente.dados;

  if (colaboradorId && !c) return <Janela titulo="Colaborador" aoFechar={aoFechar}><Carregando /></Janela>;

  return (
    <FormularioColaborador
      key={c?.id ?? 'novo'}
      colaborador={c}
      centros={cadastros.centros}
      rubricas={rubricas.dados ?? []}
      podeEditar={colaboradorId ? pode('pessoal', 'editar') : pode('pessoal', 'criar')}
      aoFechar={aoFechar}
      aoSalvar={async (dados) => {
        try {
          if (colaboradorId) {
            existente.setDados(await api.editarColaborador(colaboradorId, dados));
            avisar('Colaborador atualizado.');
          } else {
            await api.criarColaborador(dados);
            avisar('Colaborador cadastrado.');
            aoFechar();
          }
          aoSalvar();
        } catch (e) {
          avisar(e instanceof Error ? e.message : 'Não foi possível salvar.', 'erro');
        }
      }}
      aoMudarFixos={(novo) => existente.setDados(novo)}
    />
  );
}

function FormularioColaborador({
  colaborador: c,
  centros,
  rubricas,
  podeEditar,
  aoFechar,
  aoSalvar,
  aoMudarFixos,
}: {
  colaborador: Colaborador | null;
  centros: ReturnType<typeof useCadastrosBasicos>['centros'];
  rubricas: Rubrica[];
  podeEditar: boolean;
  aoFechar: () => void;
  aoSalvar: (dados: Record<string, unknown>) => Promise<void>;
  aoMudarFixos: (c: Colaborador) => void;
}) {
  const [nome, setNome] = useState(c?.nome ?? '');
  const [cpf, setCpf] = useState(c?.documento ?? '');
  const [email, setEmail] = useState(c?.email ?? '');
  const [pix, setPix] = useState(c?.chavePix ?? '');
  const [vinculo, setVinculo] = useState<string>(c?.vinculo ?? 'clt');
  const [cargo, setCargo] = useState(c?.cargo ?? '');
  const [matricula, setMatricula] = useState(c?.matricula ?? '');
  const [centroId, setCentroId] = useState(c?.centroCustoId ?? '');
  const [admissao, setAdmissao] = useState(c?.dataAdmissao ?? hojeISO());
  const [desligamento, setDesligamento] = useState(c?.dataDesligamento ?? '');
  const [salario, setSalario] = useState<Dinheiro | null>(c?.salarioBase ?? null);
  const [horas, setHoras] = useState(c?.horasMes ?? '220');
  const [dependentes, setDependentes] = useState(String(c?.dependentesIrrf ?? 0));
  const [salvando, setSalvando] = useState(false);
  const foraDaFolha = vinculo === 'pj' || vinculo === 'autonomo';

  return (
    <Janela
      titulo={c ? c.nome : 'Novo colaborador'}
      subtitulo={c?.provisao ? `Provisão mensal: férias ${formatarBRL(c.provisao.ferias)} · 13º ${formatarBRL(c.provisao.decimoTerceiro)} · encargos ${formatarBRL(c.provisao.encargos)}` : undefined}
      aoFechar={aoFechar}
      largura="max-w-3xl"
      rodape={
        <>
          <Botao onClick={aoFechar}>Fechar</Botao>
          {podeEditar && (
            <Botao
              variante="primario"
              carregando={salvando}
              disabled={nome.trim().length < 2 || salario === null}
              onClick={async () => {
                setSalvando(true);
                await aoSalvar({
                  pessoa: { nome, documento: cpf || null, email: email || null, chavePix: pix || null },
                  vinculo, cargo: cargo || null, matricula: matricula || null, centroCustoId: centroId || null,
                  dataAdmissao: admissao, salarioBase: salario, horasMes: horas, dependentesIrrf: Number(dependentes) || 0,
                  ...(c ? { dataDesligamento: desligamento || null } : {}),
                });
                setSalvando(false);
              }}
            >
              Salvar
            </Botao>
          )}
        </>
      }
    >
      {foraDaFolha && (
        <div className="mb-4">
          <Aviso tipo="info">PJ e autônomo não entram na folha: o pagamento é uma conta a pagar. Ficam aqui para o custo de pessoal enxergar toda a equipe.</Aviso>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Nome completo" className="sm:col-span-2" value={nome} onChange={(e) => setNome(e.target.value)} />
        <Campo rotulo="CPF" value={cpf} onChange={(e) => setCpf(e.target.value)} />
        <Seletor rotulo="Vínculo" value={vinculo} onChange={(e) => setVinculo(e.target.value)} opcoes={Object.entries(VINCULOS).map(([valor, rotulo]) => ({ valor, rotulo }))} />
        <Campo rotulo="Cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} />
        <Campo rotulo="Matrícula" dica="opcional" value={matricula} onChange={(e) => setMatricula(e.target.value)} />
        <CampoDinheiro rotulo={vinculo === 'prolabore' ? 'Pró-labore' : vinculo === 'estagio' ? 'Bolsa' : foraDaFolha ? 'Valor mensal contratado' : 'Salário base'} valor={salario} aoMudar={setSalario} />
        <Campo rotulo="Horas por mês" type="number" value={horas} onChange={(e) => setHoras(e.target.value)} ajuda="220 para 44 h semanais." />
        <Campo rotulo="Dependentes (IR)" type="number" min={0} value={dependentes} onChange={(e) => setDependentes(e.target.value)} />
        <Campo rotulo="Admissão" type="date" value={admissao} onChange={(e) => setAdmissao(e.target.value)} />
        {c && <Campo rotulo="Desligamento" dica="se saiu" type="date" value={desligamento} onChange={(e) => setDesligamento(e.target.value)} />}
        <SeletorCentro centros={centros} valor={centroId} aoMudar={setCentroId} />
        <Campo rotulo="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Campo rotulo="Chave PIX" className="sm:col-span-2" value={pix} onChange={(e) => setPix(e.target.value)} />
      </div>
      {c && !foraDaFolha && <ItensFixos colaborador={c} rubricas={rubricas} podeEditar={podeEditar} aoMudar={aoMudarFixos} />}
    </Janela>
  );
}

function ItensFixos({ colaborador, rubricas, podeEditar, aoMudar }: { colaborador: Colaborador; rubricas: Rubrica[]; podeEditar: boolean; aoMudar: (c: Colaborador) => void }) {
  const { api, avisar } = useFinanceiro();
  const [rubricaId, setRubricaId] = useState('');
  const [valor, setValor] = useState<Dinheiro | null>(null);
  const [referencia, setReferencia] = useState('');
  const [limite, setLimite] = useState<Dinheiro | null>(null);
  const [credor, setCredor] = useState<PessoaEscolhida>(null);
  const escolhida = rubricas.find((r) => r.id === rubricaId);
  const disponiveis = rubricas.filter((r) => !r.sistema && r.ativa);

  return (
    <div className="mt-6">
      <h3 className={`mb-1 text-sm font-semibold ${texto.titulo}`}>Itens fixos do holerite</h3>
      <p className={`mb-3 text-xs ${texto.suave}`}>
        Entram todo mês sozinhos: vale-transporte (6% do salário, limitado ao custo do vale), plano de saúde, pensão (com
        o beneficiário como credor), consignado. O variável do mês (hora extra, falta) se lança na folha.
      </p>
      {(colaborador.fixos ?? []).length > 0 && (
        <ul className="mb-3 divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm dark:divide-gray-700 dark:border-gray-700">
          {colaborador.fixos!.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className={texto.normal}>
                {f.codigo} {f.rubricaNome}
                {f.referencia && <span className={texto.suave}> · ref. {f.referencia.replace('.', ',')}</span>}
                {f.valor && <span className={texto.suave}> · {formatarBRL(f.valor)}</span>}
                {f.limite && <span className={texto.suave}> · limite {formatarBRL(f.limite)}</span>}
                {f.credorNome && <span className={texto.suave}> · repassa a {f.credorNome}</span>}
              </span>
              {podeEditar && (
                <button type="button" aria-label={`Remover ${f.rubricaNome}`} className="text-gray-400 hover:text-red-600"
                  onClick={async () => {
                    try {
                      aoMudar(await api.removerFixo(colaborador.id, f.id));
                    } catch (e) {
                      avisar(e instanceof Error ? e.message : 'Não foi possível remover.', 'erro');
                    }
                  }}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {podeEditar && (
        <div className="grid items-end gap-2 rounded-lg bg-gray-50 p-3 sm:grid-cols-4 dark:bg-gray-900/40">
          <Seletor rotulo="Rubrica" value={rubricaId} onChange={(e) => setRubricaId(e.target.value)} vazio="Escolha"
            opcoes={disponiveis.map((r) => ({ valor: r.id, rotulo: `${r.codigo} ${r.nome}`, grupo: r.tipo === 'provento' ? 'Proventos' : r.tipo === 'desconto' ? 'Descontos' : 'Custo da empresa' }))} />
          {escolhida?.calculo === 'valor' ? (
            <CampoDinheiro rotulo="Valor" valor={valor} aoMudar={setValor} />
          ) : (
            <Campo rotulo={escolhida?.calculo === 'horas' ? 'Horas' : escolhida?.calculo === 'dias' ? 'Dias' : '% (opcional)'} value={referencia} onChange={(e) => setReferencia(e.target.value)}
              placeholder={escolhida?.percentual ? `${escolhida.percentual.replace('.', ',')}%` : ''} />
          )}
          {escolhida?.calculo === 'percentual_salario' && escolhida.tipo === 'desconto' ? (
            <CampoDinheiro rotulo="Limite" dica="ex.: custo do VT" valor={limite} aoMudar={setLimite} />
          ) : <span />}
          <Botao
            variante="primario"
            disabled={!escolhida || (escolhida.calculo === 'valor' && !valor)}
            onClick={async () => {
              try {
                aoMudar(await api.salvarFixo(colaborador.id, {
                  rubricaId, valor, referencia: referencia ? referencia.replace(',', '.') : null, limite, credorId: credor?.id ?? null,
                }));
                setRubricaId(''); setValor(null); setReferencia(''); setLimite(null); setCredor(null);
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'Não foi possível adicionar.', 'erro');
              }
            }}
          >
            Adicionar
          </Botao>
          {escolhida?.tipo === 'desconto' && (
            <div className="sm:col-span-4">
              <SeletorPessoa valor={credor} aoMudar={setCredor} rotulo="Repassar para (opcional: pensão, consignado)" tipoPadrao="fisica" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
