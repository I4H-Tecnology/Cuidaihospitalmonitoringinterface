/**
 * Configurações: a empresa (regime e encargos da folha), o fechamento de
 * período, as tabelas de imposto, os feriados locais e a trilha de auditoria.
 */

import { useEffect, useState } from 'react';
import { Lock, LockOpen, Plus, Trash2 } from 'lucide-react';
import { useDados, useFinanceiro } from '../contexto';
import type { Organizacao } from '../api/tipos';
import { formatarBRL, type Dinheiro } from '../util/dinheiro';
import { competenciaDe, formatarCompetencia, formatarData, formatarDataHora, hojeISO, somarMeses } from '../util/datas';
import { REGIMES } from '../rotulos';
import {
  Abas, AreaTexto, Aviso, Botao, CabecalhoDaArea, Campo, CampoDinheiro, Carregando, ConfirmarComMotivo, Etiqueta,
  Janela, Marcador, Secao, Seletor, Vazio, cartao, tabela, texto,
} from '../ui/base';

type Aba = 'empresa' | 'fechamento' | 'tabelas' | 'feriados' | 'auditoria';

export function Configuracoes() {
  const [aba, setAba] = useState<Aba>('empresa');
  return (
    <div>
      <CabecalhoDaArea titulo="Configurações" descricao="Parâmetros que valem para o financeiro inteiro desta empresa." />
      <Abas
        atual={aba}
        aoMudar={setAba}
        abas={[
          { chave: 'empresa', rotulo: 'Empresa e folha' },
          { chave: 'fechamento', rotulo: 'Fechamento de período' },
          { chave: 'tabelas', rotulo: 'Tabelas de imposto' },
          { chave: 'feriados', rotulo: 'Feriados' },
          { chave: 'auditoria', rotulo: 'Auditoria' },
        ]}
      />
      {aba === 'empresa' && <Empresa />}
      {aba === 'fechamento' && <Fechamento />}
      {aba === 'tabelas' && <Tabelas />}
      {aba === 'feriados' && <Feriados />}
      {aba === 'auditoria' && <Trilha />}
    </div>
  );
}

function Empresa() {
  const { api, pode, avisar } = useFinanceiro();
  const org = useDados(() => api.organizacao(), [api]);
  const [f, setF] = useState<Partial<Organizacao>>({});
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (org.dados) setF(org.dados);
  }, [org.dados]);
  if (!org.dados) return <Carregando />;
  const editavel = pode('configuracoes', 'editar');
  const perc = (campo: keyof Organizacao, rotulo: string, ajuda?: string) => (
    <Campo rotulo={rotulo} ajuda={ajuda} disabled={!editavel} value={String(f[campo] ?? '').replace('.', ',')}
      onChange={(e) => setF({ ...f, [campo]: e.target.value.replace(',', '.') })} />
  );
  const aplicarPreset = (regime: string) => {
    // Pontos de partida conhecidos; RAT e terceiros dependem da atividade e ficam para a contabilidade confirmar.
    if (regime === 'simples' || regime === 'mei') setF((x) => ({ ...x, regimeTributario: regime as Organizacao['regimeTributario'], encargoInssPatronal: '0', encargoRat: '0', encargoTerceiros: '0' }));
    else if (regime === 'presumido' || regime === 'real') setF((x) => ({ ...x, regimeTributario: regime, encargoInssPatronal: '20' }));
    else setF((x) => ({ ...x, regimeTributario: regime as Organizacao['regimeTributario'] }));
  };
  return (
    <div className="space-y-4">
      <Secao titulo="Empresa">
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo rotulo="Nome" disabled={!editavel} value={f.nome ?? ''} onChange={(e) => setF({ ...f, nome: e.target.value })} />
          <Campo rotulo="CNPJ" disabled={!editavel} value={f.documento ?? ''} onChange={(e) => setF({ ...f, documento: e.target.value })} />
          <CampoDinheiro rotulo="Capital social (contrato)" disabled={!editavel} valor={(f.capitalSocial as Dinheiro) ?? null} aoMudar={(v) => setF({ ...f, capitalSocial: v ?? '0' })} />
        </div>
      </Secao>
      <Secao titulo="Folha de pagamento" subtitulo="Os encargos da empresa dependem do regime tributário e da atividade: confirme com a contabilidade.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Seletor rotulo="Regime tributário" disabled={!editavel} value={f.regimeTributario} onChange={(e) => aplicarPreset(e.target.value)}
            opcoes={Object.entries(REGIMES).map(([valor, rotulo]) => ({ valor, rotulo }))} />
          {perc('encargoInssPatronal', 'INSS patronal (%)', 'No Simples (anexos I a III e V) já está no DAS: 0. Presumido e Real: 20.')}
          {perc('encargoRat', 'RAT/SAT ajustado (%)', 'Risco da atividade × FAP.')}
          {perc('encargoTerceiros', 'Terceiros — Sistema S (%)')}
          {perc('fgtsAliquota', 'FGTS (%)', 'Aprendiz usa 2% automaticamente.')}
          {perc('percentualAdiantamento', 'Adiantamento quinzenal (%)', 'Percentual do salário pago no vale.')}
          <Marcador className="sm:col-span-3" rotulo="Pagar INSS e IRRF numa guia só (DCTFWeb)" disabled={!editavel} checked={Boolean(f.guiaUnicaDctfweb)}
            onChange={(e) => setF({ ...f, guiaUnicaDctfweb: e.target.checked })} />
        </div>
      </Secao>
      {editavel && (
        <div className="flex justify-end">
          <Botao variante="primario" carregando={salvando}
            onClick={async () => {
              setSalvando(true);
              try {
                org.setDados(await api.salvarOrganizacao({
                  nome: f.nome, documento: f.documento, regimeTributario: f.regimeTributario, capitalSocial: f.capitalSocial,
                  encargoInssPatronal: f.encargoInssPatronal, encargoRat: f.encargoRat, encargoTerceiros: f.encargoTerceiros,
                  fgtsAliquota: f.fgtsAliquota, percentualAdiantamento: f.percentualAdiantamento, guiaUnicaDctfweb: f.guiaUnicaDctfweb,
                }));
                avisar('Configurações salvas.');
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'Não foi possível salvar.', 'erro');
              } finally {
                setSalvando(false);
              }
            }}>
            Salvar
          </Botao>
        </div>
      )}
    </div>
  );
}

function Fechamento() {
  const { api, pode, avisar, recarregarSessao } = useFinanceiro();
  const org = useDados(() => api.organizacao(), [api]);
  const mesPassado = somarMeses(competenciaDe(hojeISO()), -1);
  const [ate, setAte] = useState(mesPassado);
  const [confirmando, setConfirmando] = useState<'fechar' | 'reabrir' | null>(null);
  if (!org.dados) return <Carregando />;
  const fechado = org.dados.fechadoAte;
  return (
    <div className="space-y-4">
      <Aviso tipo="info">
        Fechar um período trava tudo o que mexe no caixa ou no resultado até aquela data: nada entra, muda ou sai. Estornos
        continuam possíveis, lançados na data de hoje. É o que garante que o relatório de um mês já enviado à contabilidade
        continue batendo.
      </Aviso>
      <div className={`${cartao} p-5`}>
        <p className={`mb-4 text-sm ${texto.normal}`}>
          {fechado
            ? <>Período fechado até <strong>{formatarData(fechado)}</strong>.</>
            : 'Nenhum período fechado ainda.'}
        </p>
        {pode('configuracoes', 'editar') && (
          <div className="flex flex-wrap items-end gap-3">
            <Campo rotulo="Fechar até o fim de" type="month" max={mesPassado} value={ate} onChange={(e) => setAte(e.target.value)} />
            <Botao variante="primario" icone={<Lock className="h-4 w-4" />} onClick={() => setConfirmando('fechar')}>Fechar período</Botao>
            {fechado && <Botao icone={<LockOpen className="h-4 w-4" />} onClick={() => setConfirmando('reabrir')}>Reabrir tudo</Botao>}
          </div>
        )}
      </div>
      {confirmando && (
        <ConfirmarComMotivo
          titulo={confirmando === 'fechar' ? `Fechar até ${formatarCompetencia(ate)}` : 'Reabrir todos os períodos'}
          mensagem={confirmando === 'fechar'
            ? 'Para mexer depois nesse período será preciso reabrir, com motivo registrado.'
            : 'Reabrir permite alterar lançamentos de meses já conferidos. Fica registrado quem reabriu e por quê.'}
          rotuloAcao={confirmando === 'fechar' ? 'Fechar' : 'Reabrir'}
          perigoso={confirmando === 'reabrir'}
          aoFechar={() => setConfirmando(null)}
          aoConfirmar={async (motivo) => {
            try {
              org.setDados(await api.alterarFechamento(confirmando === 'fechar' ? ate : null, motivo));
              avisar(confirmando === 'fechar' ? 'Período fechado.' : 'Períodos reabertos.');
              setConfirmando(null);
              void recarregarSessao();
            } catch (e) {
              avisar(e instanceof Error ? e.message : 'Não foi possível concluir.', 'erro');
            }
          }}
        />
      )}
    </div>
  );
}

const MODELO_INSS = JSON.stringify({ faixas: [{ ate: '1621.00', aliquota: '7.5' }, { ate: '2902.84', aliquota: '9' }], aliquota_contribuinte_individual: '11' }, null, 2);

function Tabelas() {
  const { api, pode } = useFinanceiro();
  const tabelas = useDados(() => api.tabelasFiscais(), [api]);
  const [nova, setNova] = useState(false);
  return (
    <div className="space-y-4">
      <Aviso tipo="info">
        Imposto é dado, não código: cada tabela tem vigência e a norma que a publicou. A folha usa a tabela mais recente com
        vigência até a competência. Quando sair a de um novo ano, cadastre-a aqui com a fonte oficial.
      </Aviso>
      <div className={cartao}>
        <div className="flex items-center justify-end border-b border-gray-100 px-5 py-3 dark:border-gray-700">
          {pode('configuracoes', 'editar') && <Botao pequeno variante="primario" icone={<Plus className="h-3.5 w-3.5" />} onClick={() => setNova(true)}>Nova tabela</Botao>}
        </div>
        {!tabelas.dados ? <Carregando /> : (
          <table className={tabela.base}>
            <thead className={tabela.cabeca}>
              <tr>
                <th className={tabela.celulaCabeca}>Tabela</th>
                <th className={tabela.celulaCabeca}>Vigência</th>
                <th className={tabela.celulaCabeca}>Fonte</th>
                <th className={tabela.celulaCabeca}>Faixas</th>
              </tr>
            </thead>
            <tbody>
              {tabelas.dados.map((t) => {
                const faixas = (t.dados.faixas as Array<{ ate: string | null; aliquota: string }>) ?? [];
                return (
                  <tr key={t.id} className={tabela.linha}>
                    <td className={tabela.celula}>{t.tipo.toUpperCase()} {t.oficial ? <Etiqueta tom="bom">oficial</Etiqueta> : <Etiqueta>da empresa</Etiqueta>}</td>
                    <td className={tabela.celula}>desde {formatarCompetencia(t.vigencia)}</td>
                    <td className={`${tabela.celula} text-xs`}>{t.fonte}</td>
                    <td className={`${tabela.celula} text-xs ${texto.suave}`}>
                      {faixas.map((fx) => `${fx.aliquota.replace('.', ',')}% até ${fx.ate ? formatarBRL(fx.ate) : '∞'}`).join(' · ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {nova && <NovaTabela aoFechar={() => setNova(false)} aoSalvar={() => { setNova(false); tabelas.recarregar(); }} />}
    </div>
  );
}

function NovaTabela({ aoFechar, aoSalvar }: { aoFechar: () => void; aoSalvar: () => void }) {
  const { api, avisar } = useFinanceiro();
  const [tipo, setTipo] = useState('inss');
  const [vigencia, setVigencia] = useState(`${new Date().getFullYear() + 1}-01`);
  const [fonte, setFonte] = useState('');
  const [json, setJson] = useState(MODELO_INSS);
  const [salvando, setSalvando] = useState(false);
  let valido = true;
  try { JSON.parse(json); } catch { valido = false; }
  return (
    <Janela
      titulo="Nova tabela de imposto"
      subtitulo="Copie as faixas da norma oficial. Valores com ponto decimal, entre aspas."
      aoFechar={aoFechar}
      largura="max-w-2xl"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="primario" carregando={salvando} disabled={!valido || fonte.trim().length < 5}
            onClick={async () => {
              setSalvando(true);
              try {
                await api.criarTabelaFiscal({ tipo, vigencia, fonte, dados: JSON.parse(json) });
                avisar('Tabela cadastrada.');
                aoSalvar();
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'Não foi possível cadastrar.', 'erro');
              } finally {
                setSalvando(false);
              }
            }}>
            Cadastrar
          </Botao>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Seletor rotulo="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} opcoes={[{ valor: 'inss', rotulo: 'INSS' }, { valor: 'irrf', rotulo: 'IRRF' }]} />
        <Campo rotulo="Vigente a partir de" type="month" value={vigencia} onChange={(e) => setVigencia(e.target.value)} />
        <Campo rotulo="Fonte (norma oficial)" className="sm:col-span-2" placeholder="Ex.: Portaria Interministerial MPS/MF nº …" value={fonte} onChange={(e) => setFonte(e.target.value)} />
        <AreaTexto rotulo="Faixas (JSON)" className="sm:col-span-2 font-mono" rows={10} value={json} onChange={(e) => setJson(e.target.value)} />
        {!valido && <p className="text-xs text-red-600 sm:col-span-2">JSON inválido.</p>}
      </div>
    </Janela>
  );
}

function Feriados() {
  const { api, pode, avisar } = useFinanceiro();
  const [ano, setAno] = useState(new Date().getFullYear());
  const feriados = useDados(() => api.feriados(ano), [api, ano]);
  const [data, setData] = useState('');
  const [nome, setNome] = useState('');
  return (
    <div className="space-y-4">
      <Aviso tipo="info">Os nacionais são calculados sozinhos (inclusive Páscoa, Carnaval e Corpus Christi para prazos bancários). Cadastre os estaduais e municipais: eles mudam o 5º dia útil do salário e o vencimento das guias.</Aviso>
      <div className={cartao}>
        <div className="flex flex-wrap items-end gap-3 border-b border-gray-100 px-5 py-3 dark:border-gray-700">
          <Seletor rotulo="Ano" value={String(ano)} onChange={(e) => setAno(Number(e.target.value))} className="w-28"
            opcoes={[-1, 0, 1].map((d) => ({ valor: String(new Date().getFullYear() + d), rotulo: String(new Date().getFullYear() + d) }))} />
          {(pode('cadastros', 'criar') || pode('configuracoes', 'editar')) && (
            <>
              <Campo rotulo="Data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
              <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Aniversário da cidade" />
              <Botao variante="primario" disabled={!data || nome.trim().length < 2}
                onClick={async () => {
                  try {
                    await api.criarFeriado(data, nome);
                    setData(''); setNome('');
                    feriados.recarregar();
                  } catch (e) {
                    avisar(e instanceof Error ? e.message : 'Não foi possível cadastrar.', 'erro');
                  }
                }}>
                Adicionar
              </Botao>
            </>
          )}
        </div>
        {!feriados.dados ? <Carregando /> : (
          <table className={tabela.base}>
            <tbody>
              {feriados.dados.map((f) => (
                <tr key={`${f.data}-${f.nome}`} className={tabela.linha}>
                  <td className={`${tabela.celula} w-32`}>{formatarData(f.data)}</td>
                  <td className={tabela.celula}>{f.nome}</td>
                  <td className={tabela.celula}>{f.nacional ? <Etiqueta>Nacional</Etiqueta> : <Etiqueta tom="info">Da empresa</Etiqueta>}</td>
                  <td className={`${tabela.celula} text-right`}>
                    {!f.nacional && f.id && (pode('cadastros', 'excluir') || pode('configuracoes', 'editar')) && (
                      <button type="button" aria-label={`Remover ${f.nome}`} className="text-gray-400 hover:text-red-600"
                        onClick={async () => { await api.removerFeriado(f.id!); feriados.recarregar(); }}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const TABELAS: Record<string, string> = {
  organizacao: 'Empresa', conta: 'Conta', categoria: 'Categoria', centro_custo: 'Centro de custo', pessoa: 'Pessoa',
  titulo: 'Lançamento', parcela: 'Parcela', rateio: 'Rateio', baixa: 'Pagamento', movimento: 'Movimento de caixa',
  recorrencia: 'Recorrência', colaborador: 'Colaborador', rubrica: 'Rubrica', colaborador_rubrica: 'Item fixo',
  tabela_fiscal: 'Tabela de imposto', folha: 'Folha', socio: 'Sócio', emprestimo: 'Empréstimo', ativo: 'Bem',
  orcamento: 'Orçamento', extrato_linha: 'Linha de extrato', feriado: 'Feriado',
};

function Trilha() {
  const { api } = useFinanceiro();
  const [tabelaFiltro, setTabela] = useState('');
  const trilha = useDados(() => api.auditoria({ tabela: tabelaFiltro || undefined, limite: 200 }), [api, tabelaFiltro]);
  return (
    <div className="space-y-4">
      <div className={`${cartao} flex flex-wrap items-end gap-3 p-4`}>
        <Seletor rotulo="O que mudou" value={tabelaFiltro} onChange={(e) => setTabela(e.target.value)} vazio="Tudo"
          opcoes={Object.entries(TABELAS).map(([valor, rotulo]) => ({ valor, rotulo }))} />
        <p className={`text-xs ${texto.suave}`}>Registrado pelo próprio banco de dados, não pela tela: não há como alterar o financeiro sem deixar rastro aqui.</p>
      </div>
      <div className={cartao}>
        {!trilha.dados ? <Carregando /> : trilha.dados.length === 0 ? <Vazio titulo="Nada registrado." /> : (
          <table className={tabela.base}>
            <thead className={tabela.cabeca}>
              <tr>
                <th className={tabela.celulaCabeca}>Quando</th>
                <th className={tabela.celulaCabeca}>Quem</th>
                <th className={tabela.celulaCabeca}>O quê</th>
                <th className={tabela.celulaCabeca}>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {trilha.dados.map((a) => (
                <tr key={a.id} className={tabela.linha}>
                  <td className={`${tabela.celula} whitespace-nowrap text-xs`}>{formatarDataHora(a.em)}</td>
                  <td className={tabela.celula}>{a.usuarioNome ?? 'sistema'}</td>
                  <td className={tabela.celula}>
                    <Etiqueta tom={a.operacao === 'INSERT' ? 'info' : a.operacao === 'DELETE' ? 'critico' : 'neutro'}>
                      {a.operacao === 'INSERT' ? 'criou' : a.operacao === 'UPDATE' ? 'alterou' : 'removeu'}
                    </Etiqueta>{' '}
                    {TABELAS[a.tabela] ?? a.tabela}
                  </td>
                  <td className={`${tabela.celula} text-xs ${texto.suave}`}>
                    {a.motivo && <p className={texto.normal}>“{a.motivo}”</p>}
                    {a.operacao === 'UPDATE' && a.depois && Object.keys(a.depois).map((campo) => (
                      <p key={campo}>{campo}: {String(a.antes?.[campo] ?? '—')} → {String(a.depois?.[campo] ?? '—')}</p>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
