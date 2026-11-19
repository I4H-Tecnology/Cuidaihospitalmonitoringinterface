import { useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, Camera, CheckCircle, Database, Film, Radio, RefreshCw, Server, XCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchSaude } from '../data/api';
import type { SaudeApi } from '../data/api';
import { diagnosticarCaptura, fetchSaudeVisao, formatarBytes, formatarDuracao } from '../data/visao';
import type { SaudeVisao } from '../data/visao';

/**
 * Saúde do sistema: a observabilidade da solução em execução.
 *
 * Tudo o que está aqui vem de dois endpoints, `/api/saude` da API e `/health`
 * do serviço de visão, consultados de tempos em tempos. Nenhum número é
 * fixo: o que não puder ser medido aparece como "—", nunca como um valor
 * bonito. O avaliador precisa VER os números mudando, não ler que existem.
 */

const INTERVALO_API_MS = 5000;
const INTERVALO_VISAO_MS = 2000;

type Tom = 'ok' | 'alerta' | 'erro' | 'neutro';

const COR: Record<Tom, string> = {
  ok: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  alerta: 'bg-amber-100 text-amber-800 border-amber-200',
  erro: 'bg-red-100 text-red-800 border-red-200',
  neutro: 'bg-gray-100 text-gray-700 border-gray-200',
};

function Chip({ tom, children }: { tom: Tom; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs ${COR[tom]}`}>{children}</span>;
}

function Linha({ rotulo, valor, tom }: { rotulo: string; valor: React.ReactNode; tom?: Tom }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-gray-500">{rotulo}</span>
      <span className={`text-right ${tom === 'erro' ? 'text-red-700' : tom === 'alerta' ? 'text-amber-700' : 'text-gray-800'}`}>
        {valor}
      </span>
    </div>
  );
}

function Cartao({
  titulo, icone, tom, resumo, children,
}: {
  titulo: string; icone: React.ReactNode; tom: Tom; resumo: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-marca-texto">{icone}</span>
          <h3 className="text-gray-800">{titulo}</h3>
        </div>
        <Chip tom={tom}>
          {tom === 'ok' ? <CheckCircle className="h-3 w-3" /> : tom === 'neutro' ? <RefreshCw className="h-3 w-3" /> : tom === 'alerta' ? <AlertTriangle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
          {resumo}
        </Chip>
      </header>
      <div className="divide-y divide-gray-100">{children}</div>
    </section>
  );
}

function tomDoStatusVisao(saude: SaudeVisao | null | undefined): [Tom, string] {
  if (saude === undefined) return ['neutro', 'consultando'];
  if (saude === null) return ['erro', 'serviço fora do ar'];
  switch (saude.status) {
    case 'ok': return ['ok', 'capturando'];
    case 'degradado': return ['alerta', 'câmera fora do ar'];
    case 'iniciando': return ['neutro', 'iniciando'];
    default: return ['erro', 'parado'];
  }
}

export function SaudeScreen() {
  const { tenantId } = useAuth();
  // undefined = ainda não consultou; null = não respondeu.
  const [api, setApi] = useState<SaudeApi | null | undefined>(undefined);
  const [visao, setVisao] = useState<SaudeVisao | null | undefined>(undefined);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);

  useEffect(() => {
    let ativo = true;
    const consultarApi = async () => {
      if (!tenantId) return;
      try {
        const dados = await fetchSaude(tenantId);
        if (ativo) setApi(dados);
      } catch {
        if (ativo) setApi(null);
      }
    };
    const consultarVisao = async () => {
      const dados = await fetchSaudeVisao();
      if (ativo) {
        setVisao(dados);
        setAtualizadoEm(new Date());
      }
    };
    void consultarApi();
    void consultarVisao();
    const t1 = window.setInterval(consultarApi, INTERVALO_API_MS);
    const t2 = window.setInterval(consultarVisao, INTERVALO_VISAO_MS);
    return () => {
      ativo = false;
      window.clearInterval(t1);
      window.clearInterval(t2);
    };
  }, [tenantId]);

  const [tomVisao, resumoVisao] = tomDoStatusVisao(visao);
  const diagnostico = diagnosticarCaptura(visao === undefined ? null : visao !== null, visao?.captura);
  const bancoOk = api?.banco.ok === true;
  const fpsBaixo = visao?.fps_real != null && visao.fps_real < visao.fps_alvo * 0.6;
  const p95Alto = visao?.latencia_p95_ms != null && visao.latencia_p95_ms > 1000;

  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-gray-800 mb-1">Saúde do Sistema</h1>
          <p className="text-sm text-gray-500">
            O que cada componente diz sobre si mesmo, sem abrir o código. Atualiza sozinho.
          </p>
        </div>
        <span className="text-xs text-gray-400">
          {atualizadoEm ? `atualizado às ${atualizadoEm.toLocaleTimeString('pt-BR')}` : 'consultando…'}
        </span>
      </div>

      {/* Componentes: o "estado dos containers" visto de onde o navegador enxerga. */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Componente nome="API" ok={api === undefined ? null : api !== null} detalhe={api ? `uptime ${formatarDuracao(api.uptime_s)}` : 'sem resposta'} icone={<Server className="h-4 w-4" />} />
        <Componente nome="Banco de dados" ok={api === undefined ? null : bancoOk} detalhe={api?.banco.ok ? `${api.banco.latencia_ms} ms` : api?.banco.erro ?? 'sem resposta'} icone={<Database className="h-4 w-4" />} />
        <Componente nome="Serviço de visão" ok={visao === undefined ? null : visao !== null} detalhe={visao ? `uptime ${formatarDuracao(visao.uptime_s)}` : 'porta 8001 não responde'} icone={<Camera className="h-4 w-4" />} />
        <Componente nome="Canal de alertas" ok={api === undefined ? null : api !== null} detalhe={api ? `${api.canal_alertas.ouvintes_desta_clinica} painel(is) ouvindo` : 'sem resposta'} icone={<Radio className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Cartao titulo="Serviço de visão" icone={<Camera className="h-5 w-5" />} tom={tomVisao} resumo={resumoVisao}>
          {diagnostico.tipo === 'camera-fora' && (
            <div className="mb-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              A câmera caiu e o serviço está tentando reconectar (tentativa {diagnostico.tentativa}
              {diagnostico.proximaEmS != null && `, próxima em ${Math.ceil(diagnostico.proximaEmS)} s`}).
              {diagnostico.erro && <span className="block text-xs text-amber-700">{diagnostico.erro}</span>}
            </div>
          )}
          <Linha rotulo="Fonte" valor={visao?.fonte ?? '—'} />
          <Linha rotulo="Estado da fonte" valor={visao?.estado_da_fonte ?? '—'} tom={visao?.estado_da_fonte === 'reconectando' ? 'alerta' : undefined} />
          <Linha rotulo="Último quadro" valor={visao?.captura?.ultimo_quadro_ha_s != null ? `há ${visao.captura.ultimo_quadro_ha_s.toFixed(1)} s` : '—'} />
          <Linha rotulo="FPS real / alvo" valor={visao ? `${visao.fps_real ?? '—'} / ${visao.fps_alvo}` : '—'} tom={fpsBaixo ? 'alerta' : undefined} />
          <Linha rotulo="Latência por quadro (média / p95 / máx)" valor={visao ? `${visao.latencia_media_ms ?? '—'} / ${visao.latencia_p95_ms ?? '—'} / ${visao.latencia_max_ms ?? '—'} ms` : '—'} tom={p95Alto ? 'alerta' : undefined} />
          <Linha rotulo="Quadros processados" valor={visao?.quadros_processados ?? '—'} />
          <Linha rotulo="Quedas da fonte / reconexões" valor={visao ? `${visao.captura.quedas_da_fonte} / ${visao.captura.reconexoes}` : '—'} />
          <Linha rotulo="Ocorrências desde o boot" valor={visao?.ocorrencias ?? '—'} />
          <Linha rotulo="Publicação na API" valor={visao ? (visao.publicacao.ativo ? `${visao.publicacao.registradas ?? 0} registradas · ${visao.publicacao.aguardando_em_disco ?? 0} em disco · ping ${visao.publicacao.pingando ? 'ativo' : 'suprimido'}` : visao.publicacao.motivo ?? 'inativa') : '—'} tom={visao?.publicacao.ultimo_erro ? 'alerta' : undefined} />
          {visao?.publicacao.ultimo_erro && <Linha rotulo="Último erro de publicação" valor={visao.publicacao.ultimo_erro} tom="erro" />}
          <Linha rotulo="Modo de teste" valor={visao ? (visao.modo_teste ? 'ligado' : 'desligado') : '—'} />
          <Linha rotulo="Versão" valor={visao?.versao ?? '—'} />
        </Cartao>

        <Cartao titulo="Clipes de evidência (retenção de 24 h)" icone={<Film className="h-5 w-5" />} tom={visao?.clipes?.ativo === false ? 'neutro' : visao?.clipes?.ultimo_erro ? 'erro' : visao ? 'ok' : 'neutro'} resumo={visao?.clipes?.ativo === false ? 'desligados' : visao ? `${visao.clipes.clipes_em_disco ?? 0} em disco` : '—'}>
          <Linha rotulo="Gravando agora" valor={visao?.clipes?.gravando_agora ?? '—'} />
          <Linha rotulo="Gravados desde o boot" valor={visao?.clipes?.gravados_desde_o_boot ?? '—'} />
          <Linha rotulo="Último clipe" valor={visao?.clipes?.ultimo_clipe ?? '—'} />
          <Linha rotulo="Espaço em disco (visão)" valor={formatarBytes(visao?.clipes?.bytes_em_disco)} />
          <Linha rotulo="Último expurgo (visão)" valor={visao?.clipes?.ultimo_expurgo ? `${new Date(visao.clipes.ultimo_expurgo).toLocaleString('pt-BR')} · removeu ${visao.clipes.ultimo_expurgo_removeu ?? 0}` : '—'} />
          <Linha rotulo="Clipes vistos pela API" valor={api ? `${api.clipes.clipes_em_disco} (${formatarBytes(api.clipes.bytes_em_disco)})` : '—'} />
          <Linha rotulo="Último expurgo (API)" valor={api?.clipes.ultimo_expurgo ? `${new Date(api.clipes.ultimo_expurgo).toLocaleString('pt-BR')} · removeu ${api.clipes.ultimo_expurgo_removeu}` : '—'} />
          <Linha rotulo="Retenção" valor={api ? `${api.clipes.retencao_horas} h` : visao?.clipes?.retencao_horas != null ? `${visao.clipes.retencao_horas} h` : '—'} />
          {visao?.clipes?.ultimo_erro && <Linha rotulo="Último erro" valor={visao.clipes.ultimo_erro} tom="erro" />}
        </Cartao>

        <Cartao titulo="API e banco" icone={<Server className="h-5 w-5" />} tom={api === undefined ? 'neutro' : api === null ? 'erro' : bancoOk ? 'ok' : 'alerta'} resumo={api === undefined ? 'consultando' : api === null ? 'fora do ar' : api.status}>
          <Linha rotulo="Banco" valor={api ? (api.banco.ok ? `conectado · ${api.banco.latencia_ms} ms` : api.banco.erro ?? 'falha') : '—'} tom={api && !api.banco.ok ? 'erro' : undefined} />
          <Linha rotulo="Uptime" valor={formatarDuracao(api?.uptime_s)} />
          <Linha rotulo="Hora do servidor" valor={api ? new Date(api.hora_servidor).toLocaleTimeString('pt-BR') : '—'} />
          <Linha rotulo="Câmeras conectadas / cadastradas" valor={api ? `${api.cameras.conectadas} / ${api.cameras.total}` : '—'} tom={api && api.cameras.total > 0 && api.cameras.conectadas === 0 ? 'alerta' : undefined} />
          <Linha rotulo="Ocorrências (24 h / abertas)" valor={api ? `${api.ocorrencias.ultimas_24h} / ${api.ocorrencias.abertas}` : '—'} />
          <Linha rotulo="Painéis ouvindo o canal" valor={api ? `${api.canal_alertas.ouvintes_desta_clinica} nesta clínica · ${api.canal_alertas.ouvintes_total} no total` : '—'} />
          <Linha rotulo="Log" valor={api ? `${api.log.formato} · ${api.log.nivel}` : '—'} />
          <Linha rotulo="Versão" valor={api?.versao ?? '—'} />
        </Cartao>

        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm text-sm text-gray-600">
          <div className="mb-2 flex items-center gap-2 text-gray-800">
            <Activity className="h-5 w-5 text-marca-texto" />
            <h3>Como ler esta tela</h3>
          </div>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Serviço fora do ar</strong>: o navegador não alcança a porta 8001. Subir o serviço de visão.</li>
            <li><strong>Câmera fora do ar</strong>: o serviço está de pé e reconectando sozinho, com espera crescente. Conferir cabo, rede ou a câmera.</li>
            <li><strong>FPS real</strong> muito abaixo do alvo: a máquina está sobrecarregada e o alerta vai atrasar.</li>
            <li><strong>Latência p95</strong>: o pior caso por quadro. A média esconde o pico.</li>
            <li><strong>Clipes</strong>: gravados 5 s antes e 5 s depois de cada ocorrência e apagados após 24 h. A ocorrência continua no histórico.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}

function Componente({ nome, ok, detalhe, icone }: { nome: string; ok: boolean | null; detalhe: string; icone: React.ReactNode }) {
  const tom: Tom = ok === null ? 'neutro' : ok ? 'ok' : 'erro';
  return (
    <div className={`rounded-lg border p-4 ${ok === false ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm text-gray-700">{icone}{nome}</span>
        <Chip tom={tom}>{ok === null ? '…' : ok ? 'no ar' : 'fora'}</Chip>
      </div>
      <p className="truncate text-xs text-gray-500" title={detalhe}>{detalhe}</p>
    </div>
  );
}
