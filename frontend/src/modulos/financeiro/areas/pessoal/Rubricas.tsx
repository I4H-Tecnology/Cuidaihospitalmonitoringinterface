/**
 * Rubricas: os eventos da folha e em que cada um incide. As do sistema
 * (salário, INSS, IRRF, DSR…) seguem a lei e só mudam de nome.
 */

import { useState } from 'react';
import { Lock, Pencil, Plus } from 'lucide-react';
import { useDados, useFinanceiro } from '../../contexto';
import type { Rubrica } from '../../api/tipos';
import { Botao, Campo, Carregando, Etiqueta, Janela, Marcador, Seletor, cartao, tabela, texto } from '../../ui/base';

const CALCULOS: Record<string, string> = {
  valor: 'Valor informado',
  percentual_salario: '% do salário',
  horas: 'Horas × valor da hora × %',
  dias: 'Dias × salário/30',
  sistema: 'Calculada pelo sistema',
};

export function Rubricas() {
  const { api, pode } = useFinanceiro();
  const lista = useDados(() => api.rubricas(), [api]);
  const [editando, setEditando] = useState<Rubrica | 'nova' | null>(null);
  return (
    <div className={cartao}>
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 dark:border-gray-700">
        <p className={`text-sm ${texto.suave}`}>Em desconto, “incide” quer dizer que reduz a base (falta reduz INSS, IRRF e FGTS).</p>
        {pode('pessoal', 'criar') && <Botao variante="primario" pequeno icone={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditando('nova')}>Nova rubrica</Botao>}
      </div>
      {!lista.dados ? <Carregando /> : (
        <table className={tabela.base}>
          <thead className={tabela.cabeca}>
            <tr>
              <th className={tabela.celulaCabeca}>Rubrica</th>
              <th className={tabela.celulaCabeca}>Tipo</th>
              <th className={tabela.celulaCabeca}>Cálculo</th>
              <th className={tabela.celulaCabeca}>Incide em</th>
              <th className={tabela.celulaCabeca} />
            </tr>
          </thead>
          <tbody>
            {lista.dados.map((r) => (
              <tr key={r.id} className={tabela.linha}>
                <td className={tabela.celula}>
                  <span className={texto.suave}>{r.codigo}</span> <span className={r.ativa ? texto.titulo : 'text-gray-400 line-through'}>{r.nome}</span>
                  {r.sistema && <Lock className="ml-1 inline h-3 w-3 text-gray-400" aria-label="Rubrica do sistema" />}
                </td>
                <td className={tabela.celula}><Etiqueta tom={r.tipo === 'provento' ? 'info' : r.tipo === 'desconto' ? 'neutro' : 'atencao'}>{r.tipo}</Etiqueta></td>
                <td className={tabela.celula}>{CALCULOS[r.calculo]}{r.percentual ? ` (${r.percentual.replace(/\.?0+$/, '').replace('.', ',')}%)` : ''}</td>
                <td className={`${tabela.celula} text-xs`}>
                  {[r.incideInss && 'INSS', r.incideIrrf && 'IRRF', r.incideFgts && 'FGTS', r.deduzIrrf && 'deduz do IR', r.entraDsr && 'DSR'].filter(Boolean).join(' · ') || '—'}
                </td>
                <td className={`${tabela.celula} text-right`}>
                  {pode('pessoal', 'editar') && <Botao pequeno variante="fantasma" icone={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditando(r)}>Editar</Botao>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editando && (
        <EditorRubrica rubrica={editando === 'nova' ? null : editando} aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); lista.recarregar(); }} />
      )}
    </div>
  );
}

function EditorRubrica({ rubrica, aoFechar, aoSalvar }: { rubrica: Rubrica | null; aoFechar: () => void; aoSalvar: () => void }) {
  const { api, avisar } = useFinanceiro();
  const [f, setF] = useState<Partial<Rubrica>>(
    rubrica ?? { tipo: 'provento', calculo: 'valor', incideInss: true, incideIrrf: true, incideFgts: true, ativa: true },
  );
  const [salvando, setSalvando] = useState(false);
  const sistema = Boolean(rubrica?.sistema);
  const marca = (campo: keyof Rubrica) => (e: { target: { checked: boolean } }) => setF((x) => ({ ...x, [campo]: e.target.checked }));
  return (
    <Janela
      titulo={rubrica ? `Rubrica ${rubrica.codigo}` : 'Nova rubrica'}
      subtitulo={sistema ? 'Rubrica do sistema: as incidências seguem a lei e não mudam; o nome pode mudar.' : undefined}
      aoFechar={aoFechar}
      largura="max-w-lg"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            carregando={salvando}
            disabled={!f.codigo || !f.nome}
            onClick={async () => {
              setSalvando(true);
              try {
                await api.salvarRubrica(
                  sistema ? { nome: f.nome } : {
                    codigo: f.codigo, nome: f.nome, tipo: f.tipo, calculo: f.calculo, percentual: f.percentual || null,
                    incideInss: f.incideInss, incideIrrf: f.incideIrrf, incideFgts: f.incideFgts,
                    deduzIrrf: f.deduzIrrf, entraDsr: f.entraDsr, ...(rubrica ? { ativa: f.ativa } : {}),
                  },
                  rubrica?.id,
                );
                avisar('Rubrica salva.');
                aoSalvar();
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'Não foi possível salvar.', 'erro');
              } finally {
                setSalvando(false);
              }
            }}
          >
            Salvar
          </Botao>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Código" value={f.codigo ?? ''} disabled={sistema} onChange={(e) => setF({ ...f, codigo: e.target.value })} />
        <Campo rotulo="Nome" value={f.nome ?? ''} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        <Seletor rotulo="Tipo" value={f.tipo} disabled={sistema} onChange={(e) => setF({ ...f, tipo: e.target.value as Rubrica['tipo'] })}
          opcoes={[{ valor: 'provento', rotulo: 'Provento' }, { valor: 'desconto', rotulo: 'Desconto' }, { valor: 'informativo', rotulo: 'Custo da empresa (fora do holerite)' }]} />
        <Seletor rotulo="Cálculo" value={f.calculo} disabled={sistema} onChange={(e) => setF({ ...f, calculo: e.target.value as Rubrica['calculo'] })}
          opcoes={Object.entries(CALCULOS).filter(([k]) => k !== 'sistema' || sistema).map(([valor, rotulo]) => ({ valor, rotulo }))} />
        {(f.calculo === 'horas' || f.calculo === 'percentual_salario') && (
          <Campo rotulo="Percentual" value={f.percentual ?? ''} disabled={sistema} onChange={(e) => setF({ ...f, percentual: e.target.value.replace(',', '.') })}
            ajuda={f.calculo === 'horas' ? 'Multiplicador inteiro: hora extra 50% = 150; adicional noturno = 20.' : undefined} />
        )}
        <div className="grid gap-2 sm:col-span-2 sm:grid-cols-3">
          <Marcador rotulo="Incide INSS" checked={Boolean(f.incideInss)} disabled={sistema} onChange={marca('incideInss')} />
          <Marcador rotulo="Incide IRRF" checked={Boolean(f.incideIrrf)} disabled={sistema} onChange={marca('incideIrrf')} />
          <Marcador rotulo="Incide FGTS" checked={Boolean(f.incideFgts)} disabled={sistema} onChange={marca('incideFgts')} />
          <Marcador rotulo="Gera DSR" checked={Boolean(f.entraDsr)} disabled={sistema} onChange={marca('entraDsr')} />
          {f.tipo === 'desconto' && <Marcador rotulo="Deduz do IR (pensão)" checked={Boolean(f.deduzIrrf)} disabled={sistema} onChange={marca('deduzIrrf')} />}
          {rubrica && !sistema && <Marcador rotulo="Ativa" checked={f.ativa !== false} onChange={marca('ativa')} />}
        </div>
      </div>
    </Janela>
  );
}
