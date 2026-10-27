import { useState } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { useDados, useFinanceiro } from '../../contexto';
import { formatarBRL } from '../../util/dinheiro';
import { competenciaDe, formatarCompetencia, formatarData, hojeISO, somarMeses } from '../../util/datas';
import { Botao, Campo, Carregando, Etiqueta, Janela, Seletor, Vazio, cartao, tabela, texto } from '../../ui/base';

export const STATUS_FOLHA: Record<string, [string, 'neutro' | 'info' | 'bom']> = {
  rascunho: ['Rascunho', 'neutro'],
  calculada: ['Calculada', 'info'],
  fechada: ['Fechada', 'bom'],
};

export function Folhas({ aoAbrir }: { aoAbrir: (id: string) => void }) {
  const { api, pode } = useFinanceiro();
  const [ano, setAno] = useState(new Date().getFullYear());
  const lista = useDados(() => api.folhas(ano), [api, ano]);
  const [nova, setNova] = useState(false);
  return (
    <div className={cartao}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3 dark:border-gray-700">
        <Seletor value={String(ano)} onChange={(e) => setAno(Number(e.target.value))} className="w-32"
          opcoes={[0, 1, 2, 3].map((d) => ({ valor: String(new Date().getFullYear() - d), rotulo: String(new Date().getFullYear() - d) }))} />
        {pode('pessoal', 'criar') && <Botao variante="primario" pequeno icone={<Plus className="h-3.5 w-3.5" />} onClick={() => setNova(true)}>Nova folha</Botao>}
      </div>
      {!lista.dados ? <Carregando /> : lista.dados.length === 0 ? (
        <Vazio titulo={`Nenhuma folha em ${ano}.`}>A folha do mês calcula salários, INSS, IRRF e FGTS de todos os colaboradores e, ao fechar, gera as contas a pagar.</Vazio>
      ) : (
        <table className={tabela.base}>
          <thead className={tabela.cabeca}>
            <tr>
              <th className={tabela.celulaCabeca}>Competência</th>
              <th className={tabela.celulaCabeca}>Tipo</th>
              <th className={tabela.celulaCabeca}>Situação</th>
              <th className={tabela.celulaCabeca}>Pagamento</th>
              <th className={`${tabela.celulaCabeca} text-right`}>Pessoas</th>
              <th className={`${tabela.celulaCabeca} text-right`}>Líquido</th>
              <th className={`${tabela.celulaCabeca} text-right`}>Custo total</th>
              <th className={tabela.celulaCabeca} />
            </tr>
          </thead>
          <tbody>
            {lista.dados.map((f) => (
              <tr key={f.id} className={tabela.linhaClicavel} onClick={() => aoAbrir(f.id)}>
                <td className={`${tabela.celula} ${texto.titulo}`}>{formatarCompetencia(f.competencia)}</td>
                <td className={tabela.celula}>{f.tipo === 'mensal' ? 'Mensal' : 'Adiantamento'}</td>
                <td className={tabela.celula}><Etiqueta tom={STATUS_FOLHA[f.status][1]}>{STATUS_FOLHA[f.status][0]}</Etiqueta></td>
                <td className={tabela.celula}>{formatarData(f.dataPagamento)}</td>
                <td className={tabela.numero}>{f.colaboradores}</td>
                <td className={tabela.numero}>{formatarBRL(f.totalLiquido)}</td>
                <td className={tabela.numero}>{formatarBRL(f.custoTotal)}</td>
                <td className={`${tabela.celula} text-right`}><ChevronRight className="inline h-4 w-4 text-gray-400" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {nova && <NovaFolha aoFechar={() => setNova(false)} aoCriar={(id) => { setNova(false); aoAbrir(id); }} />}
    </div>
  );
}

function NovaFolha({ aoFechar, aoCriar }: { aoFechar: () => void; aoCriar: (id: string) => void }) {
  const { api, avisar } = useFinanceiro();
  // A folha que costuma ser feita agora é a do mês que terminou.
  const [competencia, setCompetencia] = useState(somarMeses(competenciaDe(hojeISO()), -1));
  const [tipo, setTipo] = useState('mensal');
  const [pagamento, setPagamento] = useState('');
  const [criando, setCriando] = useState(false);
  return (
    <Janela
      titulo="Nova folha"
      aoFechar={aoFechar}
      largura="max-w-md"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            carregando={criando}
            onClick={async () => {
              setCriando(true);
              try {
                const folha = await api.criarFolha({ competencia, tipo, ...(pagamento ? { dataPagamento: pagamento } : {}) });
                avisar('Folha criada e calculada.');
                aoCriar(folha.id);
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'Não foi possível criar.', 'erro');
              } finally {
                setCriando(false);
              }
            }}
          >
            Criar e calcular
          </Botao>
        </>
      }
    >
      <div className="grid gap-3">
        <Campo rotulo="Competência" type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
        <Seletor rotulo="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}
          opcoes={[{ valor: 'mensal', rotulo: 'Mensal (salário do mês)' }, { valor: 'adiantamento', rotulo: 'Adiantamento quinzenal (vale)' }]} />
        <Campo
          rotulo="Data de pagamento"
          dica="opcional"
          type="date"
          value={pagamento}
          onChange={(e) => setPagamento(e.target.value)}
          ajuda={tipo === 'mensal' ? 'Em branco: 5º dia útil do mês seguinte (CLT, art. 459).' : 'Em branco: dia 20 do mês (ou o dia útil anterior).'}
        />
      </div>
    </Janela>
  );
}
